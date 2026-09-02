import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * ENGINE RATCHET — server-side security pipeline counts (Phase E).
 *
 * createDomainRouter + financialGuard now own the declarative security
 * pipeline (authz role gates, fiscal-year lock, delegation limits, bank
 * isolation). The hand-rolled equivalents scattered through routers are
 * legacy: they may only SHRINK as domains migrate — a PR that grows these
 * counts is rejected (extend the engine instead).
 *
 * Baselines were pinned at Phase E adoption (leave / site-expense /
 * jv-partner migrated). Notes on legitimate residue:
 *  - Record-level authorization (approve-by-id: the record's projectId
 *    governs, not the input) is a different concern and legitimately stays
 *    inline — the authz count will not reach zero.
 *  - SERVER_FLOAT_MONEY counts Number(/parseFloat( coercions in server
 *    code; money math must ride Prisma Decimal / formatNpr, and new code
 *    should not add coercions.
 *
 * Counting rule: line-start-agnostic substring counts per file, excluding
 * __tests__ (tests legitimately construct/mocks these fns).
 */

const ROUTERS_DIR = join(process.cwd(), "src/server/routers");
const LIB_DIR = join(process.cwd(), "src/lib");
const SERVER_UTILS_DIR = join(process.cwd(), "src/server/utils");

function listSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "__tests__" || entry.name === "node_modules") continue;
      listSourceFiles(full, out);
    } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.ts$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

function countPattern(files: string[], pattern: RegExp): number {
  let count = 0;
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    count += (text.match(pattern) ?? []).length;
  }
  return count;
}

const ROUTER_FILES = listSourceFiles(ROUTERS_DIR);
const SERVER_FILES = [
  ...listSourceFiles(LIB_DIR),
  ...listSourceFiles(SERVER_UTILS_DIR),
];

/** Baselines pinned at Phase E (2026-09). May only shrink. */
const BASELINES = {
  // AUDIT REMEDIATION (2026-09-03): the security audit fixes legitimately
  // grew the inline guards — +2 authz (assertProjectManager on record-level
  // boq-version.approve / submittal.review — correctly inline per the rule
  // above), +7 fiscal (project-cost, hr.createStaffAdvance, vat-register,
  // bank-guarantee ×4, daily-report now date-scoped), +1 server float and
  // +7 router float (Decimal→number conversions at the Decimal boundary:
  // guarded bank decrements, payroll settlement JE, atomic stock writes,
  // sequence counter RETURNING). All additions are deliberate, reviewed
  // remediation — not regression. Baselines re-pinned.
  HAND_ROLLED_AUTHZ: 458,
  HAND_ROLLED_FISCAL: 44,
  SERVER_FLOAT_MONEY: 35,
  /** Router float-money coercions — pinned after the Decimal hardening pass
   *  (journal-entry balance check, site-expense totals, bank-guarantee
   *  balance increments, accounting netAmount now ride Prisma.Decimal via
   *  src/lib/money). Residue is import boundaries / display analytics. */
  ROUTER_FLOAT_MONEY: 31,
  /** Declarative adoption floors — may only grow. */
  DECLARATIVE_FLOORS: {
    DOMAIN_ROUTERS: 3, // leave, site-expense, jv-partner
    FINANCIAL_GUARDS: 2, // site-expense.create, jv-partner.recordPayout
    /** Routers delegating status flips to transitionEntityState instead of
     *  hand-rolled update({ data: { status } }) writes. Pinned at the mass-
     *  adoption pass: submittal(2), punch-list(1), leave(2), site-expense(2),
     *  boq-version(1), payroll(1), daily-program(1), requisition(2),
     *  subcontractor-bill(2); batch 2: gantt-versions(2), ipc(1), rfi(2),
     *  daily-report(1); batch 3 (full-lifecycle sweep): variation-order(1),
     *  purchase-order(1), uncataloged-material(4), gate-entry via
     *  material-transaction(1), inter-site-transfer(1), project archive(1),
     *  equipment maintenance+resolves(2), equipment-rental lifecycle(4),
     *  bank-guarantee extend/release(2). Known intentional non-adoptions:
     *  vendor-bill recordPayment (status is DERIVED from paidAmount via an
     *  atomic increment — the engine's status CAS would reject legitimate
     *  concurrent partial payments) and bank-guarantee list auto-expiry
     *  (date-derived machine sweep, no user actor). May only grow — new
     *  lifecycle moves must ride the engine so graphs, CAS and attribution
     *  stay centralized. */
    TRANSITIONS: 37,
  },
};

const AUTHZ_RE = /\bassertProjectMember\(|\bassertCanWrite\(|\bassertProjectAdmin\(|\bassertProjectManager\(/g;
const FISCAL_RE = /\bassertNotLocked\(/g;
const FLOAT_MONEY_RE = /\bNumber\(|\bparseFloat\(/g;
const DOMAIN_ROUTER_RE = /createDomainRouter\(\)/g;
const FIN_GUARD_RE = /\bfinancialGuard\(\{/g;
const TRANSITIONS_RE = /\btransitionEntityState\(/g;

describe("Engine ratchet — server security pipeline (shrink-only)", () => {
  it("hand-rolled authz calls in routers never grow past the baseline", () => {
    const count = countPattern(ROUTER_FILES, AUTHZ_RE);
    expect(
      count,
      `Hand-rolled authz grew (${count} > ${BASELINES.HAND_ROLLED_AUTHZ}). ` +
        "Use createDomainRouter proc.member/write/admin/manager for input-level guards; " +
        "keep inline asserts only for record-level authorization."
    ).toBeLessThanOrEqual(BASELINES.HAND_ROLLED_AUTHZ);
  });

  it("hand-rolled fiscal-lock calls in routers never grow past the baseline", () => {
    const count = countPattern(ROUTER_FILES, FISCAL_RE);
    expect(
      count,
      `Hand-rolled assertNotLocked grew (${count} > ${BASELINES.HAND_ROLLED_FISCAL}). ` +
        "Use financialGuard({ dateField }) for input-level fiscal locks."
    ).toBeLessThanOrEqual(BASELINES.HAND_ROLLED_FISCAL);
  });

  it("float-money coercions in server code never grow past the baseline", () => {
    const count = countPattern(SERVER_FILES, FLOAT_MONEY_RE);
    expect(
      count,
      `Number(/parseFloat( coercions grew (${count} > ${BASELINES.SERVER_FLOAT_MONEY}). ` +
        "Server-side money math must ride Prisma Decimal or the currency engine, not float coercion."
    ).toBeLessThanOrEqual(BASELINES.SERVER_FLOAT_MONEY);
  });

  it("float-money coercions in routers never grow past the baseline", () => {
    const count = countPattern(ROUTER_FILES, FLOAT_MONEY_RE);
    expect(
      count,
      `Router Number(/parseFloat( coercions grew (${count} > ${BASELINES.ROUTER_FLOAT_MONEY}). ` +
        "Ledger arithmetic must use src/lib/money (addMoney/subMoney/toMoney), not float coercion."
    ).toBeLessThanOrEqual(BASELINES.ROUTER_FLOAT_MONEY);
  });
});

describe("Engine ratchet — declarative adoption floors (grow-only)", () => {
  it("createDomainRouter adoption never shrinks", () => {
    const count = countPattern(ROUTER_FILES, DOMAIN_ROUTER_RE);
    expect(
      count,
      `createDomainRouter adoption dropped (${count} < ${BASELINES.DECLARATIVE_FLOORS.DOMAIN_ROUTERS}).`
    ).toBeGreaterThanOrEqual(BASELINES.DECLARATIVE_FLOORS.DOMAIN_ROUTERS);
  });

  it("financialGuard adoption never shrinks", () => {
    const count = countPattern(ROUTER_FILES, FIN_GUARD_RE);
    expect(
      count,
      `financialGuard adoption dropped (${count} < ${BASELINES.DECLARATIVE_FLOORS.FINANCIAL_GUARDS}).`
    ).toBeGreaterThanOrEqual(BASELINES.DECLARATIVE_FLOORS.FINANCIAL_GUARDS);
  });

  it("engine transition adoption never shrinks", () => {
    const count = countPattern(ROUTER_FILES, TRANSITIONS_RE);
    expect(
      count,
      `transitionEntityState adoption dropped (${count} < ${BASELINES.DECLARATIVE_FLOORS.TRANSITIONS}). ` +
        "Status flips must ride the engine (graphs + CAS + attribution), not hand-rolled updates."
    ).toBeGreaterThanOrEqual(BASELINES.DECLARATIVE_FLOORS.TRANSITIONS);
  });
});
