/**
 * RLS inventory & tracker generator (RLS rollout Phase 0).
 * See docs/plans/rls-rollout.md §4 Phase 0.
 *
 * What it does:
 *  1. Parses prisma/schema.prisma and classifies every model:
 *       org-scoped     — has an `organizationId` column  → direct org policy
 *       project-scoped — has a `projectId` column only   → EXISTS-via-Project policy
 *  2. (Re)generates prisma/rls-tracker.json — the single source of truth
 *     the drift-guard test (src/server/routers/__tests__/rls-coverage.test.ts)
 *     enforces: every scoped model must be either `covered` (policy SQL in
 *     prisma/migrations) or assigned to a planned phase. Adding a new scoped
 *     model without registering it FAILS that test.
 *  3. Prints the NULL-org / NULL-project audit SQL to run against the
 *     production database BEFORE enabling any phase (must return 0 rows —
 *     see plan gap G-3).
 *
 * Usage:
 *   npx tsx scripts/rls-inventory.ts           # regenerate tracker + print audit SQL
 *   npx tsx scripts/rls-inventory.ts --audit   # also run the audit (needs DATABASE_URL)
 *
 * The generated tracker is a STARTING POINT — hand-tune phase assignments
 * as the rollout proceeds; the script never deletes a table from `covered`.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const SCHEMA = path.join(ROOT, "prisma/schema.prisma");
const TRACKER = path.join(ROOT, "prisma/rls-tracker.json");

// ── 1. Parse schema ─────────────────────────────────────────────
const schema = fs.readFileSync(SCHEMA, "utf8");

type Scoped = { orgScoped: string[]; projectScoped: string[] };
// Model name -> physical table name. Prisma @@map renames tables (e.g.
// model RateBook lives in table "RateCatalog"); RLS migrations and audit
// SQL must target the PHYSICAL name or they fail on apply.
export const TABLE_OF: Record<string, string> = {};
const { orgScoped, projectScoped }: Scoped = (() => {
  const org: string[] = [];
  const proj: string[] = [];
  const blockRe = /^model (\w+) \{([\s\S]*?)^\}/gm;
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(schema)) !== null) {
    const name = m[1];
    const body = m[2];
    const mapMatch = body.match(/@@map\("(\w+)"\)/);
    TABLE_OF[name] = mapMatch ? mapMatch[1] : name;
    const hasOrg = /^\s+organizationId\s+\w+/m.test(body);
    const hasProject = /^\s+projectId\s+\w+/m.test(body);
    if (hasOrg) org.push(name);
    else if (hasProject) proj.push(name);
  }
  return { orgScoped: org.sort(), projectScoped: proj.sort() };
})();
const mapped = Object.entries(TABLE_OF).filter(([m, t]) => m !== t);
if (mapped.length) {
  console.log(
    "[rls-inventory] @@map models (tracker uses model names, SQL uses table names): " +
      mapped.map(([m, t]) => `${m}->${t}`).join(", "),
  );
}

// ── 2. Phase assignment ─────────────────────────────────────────
// Tables where RLS is the WRONG tool (queried pre-auth, before any org
// context exists) — excluded from the rollout, tracked explicitly so the
// drift test still forces a conscious decision for them.
const EXCLUDED: Record<string, string> = {
  User: "queried pre-auth (login/signup/first-user check) before org context exists — app-level filtering only",
};

// Phase 1 (org-column policy, money-critical org tables) — explicit per plan.
const PHASE1 = [
  "JournalEntry", "JournalLine", "Payment", "VendorBill", "VendorBillItem",
  "BankAccount", "OrganizationBankAccount", "FiscalYear", "PayrollRun", "PayrollItem",
  // reality-corrected additions (org-scoped money/lock tables found by inventory):
  "HeadOfficeExpense", "CompanyBankAccount", "FiscalYearLock", "BankGuarantee",
];
// Project-scoped money cluster — EXISTS-via-Project policy, but business-
// critical, so it gets its own batch ahead of the domain batches.
const PHASE3M = [
  "JournalEntryLine", "Payment", "VendorBill", "VendorPayment", "PayrollRun",
  "Ipc", "SubcontractorBill", "SiteExpense", "ProjectCost", "VatBill",
  "MaterialTransaction", "PurchaseOrder", "PurchaseRequisition",
];
const phase1 = PHASE1.filter((t) => orgScoped.includes(t) && !EXCLUDED[t]);
const phase2 = orgScoped.filter(
  (t) => !phase1.includes(t) && !EXCLUDED[t],
);
const money = new Set(PHASE3M);
const PROCUREMENT = /Material|Purchase|Requisition|Store|Quotation|Vendor|Supplier|Catalog|Rate/i;
const HR_EQUIP = /Staff|Attendance|Leave|Equipment|Rental|SpotHire|Payroll|Worker|Muster|Crew/i;
const phase3m = projectScoped.filter((t) => money.has(t));
const phase3a = projectScoped.filter(
  (t) => !money.has(t) && PROCUREMENT.test(t),
);
const phase3b = projectScoped.filter(
  (t) => !money.has(t) && !PROCUREMENT.test(t) && HR_EQUIP.test(t),
);
const phase3c = projectScoped.filter(
  (t) => !money.has(t) && !PROCUREMENT.test(t) && !HR_EQUIP.test(t),
);

// ── 3. Merge with existing tracker (never lose "covered") ───────
let covered: string[] = ["Project"];
if (fs.existsSync(TRACKER)) {
  try {
    const prev = JSON.parse(fs.readFileSync(TRACKER, "utf8"));
    if (Array.isArray(prev.covered)) covered = prev.covered;
    if (prev.excluded && typeof prev.excluded === "object") {
      Object.assign(EXCLUDED, prev.excluded);
    }
  } catch {
    console.warn("[rls-inventory] existing tracker unreadable — regenerating");
  }
}
covered = [...new Set(covered)].sort();

const tracker = {
  $comment:
    "RLS rollout tracker (docs/plans/rls-rollout.md). covered = policy SQL exists in prisma/migrations; planned = phase assignment; excluded = RLS deliberately not applied (reason per table). Every org/project-scoped model in schema.prisma MUST appear in exactly one of the three — enforced by src/server/routers/__tests__/rls-coverage.test.ts. Regenerate with: npx tsx scripts/rls-inventory.ts (covered/excluded are preserved; planned lists are regenerated).",
  covered,
  excluded: EXCLUDED,
  planned: {
    phase1_org_money: phase1.filter((t) => !covered.includes(t)),
    phase2_org_rest: phase2.filter((t) => !covered.includes(t)),
    phase3m_project_money: phase3m.filter((t) => !covered.includes(t)),
    phase3a_project_procurement_materials: phase3a.filter((t) => !covered.includes(t)),
    phase3b_project_hr_equipment: phase3b.filter((t) => !covered.includes(t)),
    phase3c_project_documents: phase3c.filter((t) => !covered.includes(t)),
  },
};
fs.writeFileSync(TRACKER, JSON.stringify(tracker, null, 2) + "\n");

// ── 4. Report ───────────────────────────────────────────────────
console.log(`[rls-inventory] org-scoped models:     ${orgScoped.length}`);
console.log(`[rls-inventory] project-scoped models: ${projectScoped.length}`);
console.log(`[rls-inventory] covered (has RLS SQL): ${covered.length}`);
const plannedTotal = Object.values(tracker.planned).reduce((n: number, a) => n + (a as string[]).length, 0);
console.log(`[rls-inventory] planned (by phase):    ${plannedTotal}`);
for (const [phase, tables] of Object.entries(tracker.planned)) {
  console.log(`    ${phase}: ${(tables as string[]).length}`);
}
console.log(`[rls-inventory] tracker written: prisma/rls-tracker.json`);

// ── 5. NULL audit SQL (gap G-3) ─────────────────────────────────
const auditLines: string[] = [];
for (const t of orgScoped) {
  const tbl = TABLE_OF[t];
  const label = tbl === t ? t : `${t}(map:${tbl})`;
  auditLines.push(
    `SELECT '${label}' AS tbl, count(*) AS null_org_rows FROM "${tbl}" WHERE "organizationId" IS NULL`,
  );
}
for (const t of projectScoped) {
  const tbl = TABLE_OF[t];
  const label = tbl === t ? t : `${t}(map:${tbl})`;
  auditLines.push(
    `SELECT '${label}' AS tbl, count(*) AS null_project_rows FROM "${tbl}" WHERE "projectId" IS NULL`,
  );
}
const auditSql =
  "-- RLS pre-flight audit (gap G-3): run against PRODUCTION (read-only).\n" +
  "-- Every row must be 0 before the table's rollout phase enables RLS.\n" +
  auditLines.join("\nUNION ALL\n") + ";";
fs.writeFileSync(path.join(ROOT, "prisma/rls-null-audit.sql"), auditSql + "\n");
console.log(`[rls-inventory] audit SQL written: prisma/rls-null-audit.sql`);

// ── 6. Optional live audit ──────────────────────────────────────
if (process.argv.includes("--audit")) {
  if (!process.env.DATABASE_URL) {
    console.error("[rls-inventory] --audit requires DATABASE_URL");
    process.exit(1);
  }
  (async () => {
    const { PrismaClient } = await import("@prisma/client");
    const prisma = new PrismaClient();
    try {
      const rows: { tbl: string; nulls: bigint }[] = await prisma.$queryRawUnsafe(
        auditLines.join("\nUNION ALL\n") + ";",
      );
      const bad = rows.filter((r) => Number(r.nulls) > 0);
      for (const r of bad) {
        console.warn(`  !! ${r.tbl}: ${r.nulls} NULL rows — backfill required before its phase`);
      }
      console.log(
        bad.length === 0
          ? "[rls-inventory] audit clean: no NULL org/project rows anywhere"
          : `[rls-inventory] audit found ${bad.length} table(s) needing backfill`,
      );
    } finally {
      await prisma.$disconnect();
    }
  })();
}
