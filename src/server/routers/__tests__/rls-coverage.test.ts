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

// ── tracker buckets ──
const covered: string[] = TRACKER.covered ?? [];
const excluded: string[] = Object.keys(TRACKER.excluded ?? {});
const plannedBuckets = TRACKER.planned as Record<string, string[]> | undefined;
const planned: string[] = Object.values(plannedBuckets ?? {}).flat();

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
      (t) => !rlsEnabledTables.has(t) || !policyTables.has(t),
    );
    expect(
      missing,
      `tables marked covered but lacking RLS SQL in prisma/migrations: ${missing.join(", ")}`,
    ).toEqual([]);
  });

  it("every table with RLS SQL in migrations is a scoped, covered model", () => {
    const stray = [...rlsEnabledTables].filter(
      (t) => !scopedModels.has(t) || !covered.includes(t),
    );
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

describe("RLS Phase 0: money-router interactive transactions set org context", () => {
  // Any interactive $transaction in a money router MUST open with
  // withOrgContext(tx, ...) — transaction-scoped set_config is the only
  // reliable RLS context under Prisma connection pooling (see rls.ts).
  // Array-form $transaction([...]) sites are exempt here but must be
  // converted when their tables get RLS (docs/plans/rls-rollout.md §4).
  const MONEY_ROUTERS = [
    "accounting", "finance", "vendor-bill", "payroll", "fiscal-year",
    "ipc", "project-ops", "subcontractor-bill",
  ];

  for (const name of MONEY_ROUTERS) {
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
    });
  }
});
