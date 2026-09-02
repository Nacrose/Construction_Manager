/**
 * RLS drift guard (RLS rollout Phase 0, gap G-5).
 * See docs/plans/rls-rollout.md §4 Phase 0 item 5.
 *
 * Purely static — parses prisma/schema.prisma, prisma/rls-tracker.json and
 * the migration.sql files under prisma/migrations. No database needed.
 *
 * Rules enforced:
 *   1. Every org/project-scoped model in the schema is tracked — it must
 *      appear in the tracker as `covered`, in a `planned` phase, or in
 *      `excluded` (with a reason). FAILS when someone adds a new scoped
 *      model without registering it — the point of the guard.
 *   2. No table is in two buckets at once (covered vs planned vs excluded).
 *   3. Every `covered` table has `ENABLE ROW LEVEL SECURITY` + a
 *      `CREATE POLICY` in migration SQL — policies must live under
 *      migration control, never applied by hand.
 *   4. Every table with RLS SQL in migrations is a scoped model listed as
 *      covered — catches stale/renamed/typo table names in migrations.
 *
 * Workflow: add a scoped model → this test fails listing it → run
 * `npx tsx scripts/rls-inventory.ts` (assigns it to a phase) or add it to
 * `excluded` with a reason. Enable a phase → migration SQL lands → move
 * the tables from `planned` to `covered` in the tracker.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../../../..");
const SCHEMA = fs.readFileSync(path.join(ROOT, "prisma/schema.prisma"), "utf8");
const TRACKER = JSON.parse(
  fs.readFileSync(path.join(ROOT, "prisma/rls-tracker.json"), "utf8"),
);

// ── scoped models from schema (same classification as scripts/rls-inventory.ts) ──
const orgScoped: string[] = [];
const projectScoped: string[] = [];
{
  const blockRe = /^model (\w+) \{([\s\S]*?)^\}/gm;
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(SCHEMA)) !== null) {
    const name = m[1];
    const body = m[2];
    const hasOrg = /^\s+organizationId\s+\w+/m.test(body);
    const hasProject = /^\s+projectId\s+\w+/m.test(body);
    if (hasOrg) orgScoped.push(name);
    else if (hasProject) projectScoped.push(name);
  }
}
const scopedModels = new Set([...orgScoped, ...projectScoped]);

// Physical table names: Prisma @@map renames tables (model RateBook ->
// table "RateCatalog"); migrations and audit SQL target PHYSICAL names,
// the tracker stores MODEL names. Translate model -> table for every
// migration-side comparison.
const TABLE_OF: Record<string, string> = {};
{
  const blockRe = /^model (\w+) \{([\s\S]*?)^\}/gm;
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(SCHEMA)) !== null) {
    const mapMatch = m[2].match(/@@map\("(\w+)"\)/);
    TABLE_OF[m[1]] = mapMatch ? mapMatch[1] : m[1];
  }
}
const tableOf = (model: string) => TABLE_OF[model] ?? model;

// ── tracker buckets ──
const covered: string[] = TRACKER.covered ?? [];
const excluded: string[] = Object.keys(TRACKER.excluded ?? {});
const plannedBuckets = TRACKER.planned as Record<string, string[]> | undefined;
const planned: string[] = Object.values(plannedBuckets ?? {}).flat();
// Tables whose RLS SQL exists only in HISTORICAL migrations and whose model
// was dropped by a later migration (e.g. the ADR-0008 clean break). They
// are tracked so the drift guard can distinguish "stale rename" from
// "intentionally dropped".
const dropped: string[] = Object.keys(TRACKER.dropped ?? {});

// ── RLS statements present in migration SQL ──
const migrationsDir = path.join(ROOT, "prisma/migrations");
const rlsEnabledTables = new Set<string>();
const policyTables = new Set<string>();
{
  const dirs = fs
    .readdirSync(migrationsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory());
  for (const dir of dirs) {
    const file = path.join(migrationsDir, dir.name, "migration.sql");
    if (!fs.existsSync(file)) continue;
    const sql = fs.readFileSync(file, "utf8");
    for (const m of sql.matchAll(/ALTER TABLE "(\w+)" ENABLE ROW LEVEL SECURITY/g)) {
      rlsEnabledTables.add(m[1]);
    }
    for (const m of sql.matchAll(/CREATE POLICY "[^"]+" ON "(\w+)"/g)) {
      policyTables.add(m[1]);
    }
  }
}

describe("RLS drift guard (schema ↔ tracker ↔ migrations)", () => {
  it("tracker buckets are disjoint (no table in two buckets)", () => {
    const all = [...covered, ...planned, ...excluded];
    const dupes = all.filter((t, i) => all.indexOf(t) !== i);
    expect(dupes, `tables in multiple buckets: ${dupes.join(", ")}`).toEqual([]);
  });

  it("every scoped model is tracked (covered | planned | excluded)", () => {
    const tracked = new Set([...covered, ...planned, ...excluded]);
    const untracked = [...scopedModels].filter((m) => !tracked.has(m));
    expect(
      untracked,
      `scoped models missing from prisma/rls-tracker.json — run \`npx tsx scripts/rls-inventory.ts\` or add to "excluded" with a reason: ${untracked.join(", ")}`,
    ).toEqual([]);
  });

  it("tracker does not reference non-existent models (stale entries)", () => {
    const tracked = [...covered, ...planned, ...excluded];
    const stale = tracked.filter((t) => !scopedModels.has(t));
    expect(
      stale,
      `tracker entries that are no longer scoped models (rename/cleanup?): ${stale.join(", ")}`,
    ).toEqual([]);
  });

  it("every covered table has ENABLE ROW LEVEL SECURITY + CREATE POLICY in migrations", () => {
    const missing = covered.filter(
      (t) => !rlsEnabledTables.has(tableOf(t)) || !policyTables.has(tableOf(t)),
    );
    expect(
      missing,
      `tables marked covered but lacking RLS SQL in prisma/migrations: ${missing.join(", ")}`,
    ).toEqual([]);
  });

  it("every table with RLS SQL in migrations is a scoped, covered model", () => {
    const tableOfDropped = new Set(dropped.map((m) => TABLE_OF[m] ?? m));
    const modelOfTable = new Map(Object.entries(TABLE_OF).map(([m, t]) => [t, m]));
    const stray = [...rlsEnabledTables].filter((t) => {
      if (tableOfDropped.has(t)) return false; // historical — model dropped by a later migration
      const model = modelOfTable.get(t) ?? t;
      return !scopedModels.has(model) || !covered.includes(model);
    });
    expect(
      stray,
      `tables with RLS SQL in migrations but not scoped/covered in the tracker (stale rename? forgot to move from planned to covered?): ${stray.join(", ")}`,
    ).toEqual([]);
  });

  it("Phase 0 invariants: Project is covered (baseline migration exists)", () => {
    expect(covered).toContain("Project");
    expect(rlsEnabledTables.has("Project")).toBe(true);
  });
});

describe("RLS: router interactive transactions set org context", () => {
  // Any interactive $transaction in a router whose tables are RLS-covered
  // (FORCEd) MUST open with withOrgContext(tx, ...) — transaction-scoped
  // set_config is the only reliable RLS context under Prisma connection
  // pooling (see rls.ts). Array-form $transaction([...]) sites cannot run
  // set_config and are FORBIDDEN in these routers (all known sites were
  // converted to interactive form in phases 3a–3c: rfi, gantt-tasks).
  //
  // Phase 1/2: catalog-v2, financial-reporting. Phase 3m:
  // material-transaction, requisition, purchase-order, site-expense,
  // daily-report. Phases 3a/3b/3c: analysis-library, boq, daily-program,
  // gantt-analytics, gantt-versions, gantt-tasks, hr, project,
  // variation-order — plus store-location (phase-3m table
  // MaterialTransaction, retroactively caught in phase 3a).
  const RLS_TX_ROUTERS = [
    "accounting", "finance", "vendor-bill", "payroll", "fiscal-year",
    "ipc", "project-ops", "subcontractor-bill",
    "catalog-v2", "financial-reporting",
    "material-transaction", "requisition", "purchase-order",
    "site-expense", "daily-report",
    "analysis-library", "boq", "daily-program", "gantt-analytics",
    "gantt-versions", "gantt-tasks", "hr", "project", "rfi",
    "variation-order", "store-location",
  ];

  for (const name of RLS_TX_ROUTERS) {
    it(`${name}.ts: every interactive $transaction opens with withOrgContext`, () => {
      const file = path.join(ROOT, `src/server/routers/${name}.ts`);
      const src = fs.readFileSync(file, "utf8");
      const lines = src.split("\n");
      const offenders: number[] = [];
      lines.forEach((line, i) => {
        if (/db\.\$transaction\(async \(tx\) => \{$/.test(line)) {
          const next = lines[i + 1] ?? "";
          if (!/await withOrgContext\(tx,/.test(next)) {
            offenders.push(i + 1);
          }
        }
      });
      expect(
        offenders,
        `${name}.ts interactive transaction(s) at line(s) ${offenders.join(", ")} do not set org context — insert \`await withOrgContext(tx, ctx.user.organizationId, !!ctx.user.isSuperAdmin);\` as the first statement`,
      ).toEqual([]);

      // Array-form $transaction([...]) cannot run set_config — with FORCEd
      // tables it fails closed on a context-less connection. All known
      // sites were converted in phases 3a–3c; this keeps new ones out.
      const arrayOffenders: number[] = [];
      lines.forEach((line, i) => {
        if (/\$transaction\(\[/.test(line)) arrayOffenders.push(i + 1);
      });
      expect(
        arrayOffenders,
        `${name}.ts array-form $transaction at line(s) ${arrayOffenders.join(", ")} — convert to interactive form and open with withOrgContext (see src/lib/rls.ts)`,
      ).toEqual([]);
    });
  }
});
