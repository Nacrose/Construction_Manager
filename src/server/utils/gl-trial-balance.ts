/**
 * GL-driven Trial Balance aggregation.
 *
 * Previously the Trial Balance was computed from ad-hoc single-entry queries
 * over Payments/VendorBills/SubBills/IPCs (accounting.ts). That layer could
 * never balance by construction: it had no bank/cash lines, no VAT double
 * entries, and included gross expenses against net liabilities. See the
 * accounting audit.
 *
 * This helper aggregates the actual double-entry ledger
 * (JournalEntryLine — the output of the journal-entry engine, which
 * guarantees balanced entries) into a classic trial balance: one net row
 * per account, debits on one side, credits on the other, totals that tie
 * exactly when the GL is balanced.
 */
import { CHART_OF_ACCOUNTS } from "@/lib/chart-of-accounts";

export type GlLine = {
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
};

export type TrialBalanceRow = {
  head: string;
  group: string;
  debit: number;
  credit: number;
};

export type TrialBalanceResult = {
  rows: TrialBalanceRow[];
  totalDebits: number;
  totalCredits: number;
  difference: number;
  isBalanced: boolean;
};

/** Chart category → display group (matches the old TB group labels). */
const CATEGORY_GROUPS: Record<string, string> = {
  asset: "Current Assets",
  liability: "Current Liabilities",
  equity: "Equity",
  revenue: "Direct Incomes",
  material: "Direct Project Costs",
  labor: "Direct Project Costs",
  subcontract: "Direct Project Costs",
  equipment: "Direct Project Costs",
  overhead: "Indirect Overheads",
};

const CHART_BY_CODE = new Map(CHART_OF_ACCOUNTS.map((a) => [a.code, a]));

/**
 * Aggregate GL lines into a trial balance.
 *
 * Per account: net = Σdebit − Σcredit. A positive net shows on the debit
 * column, a negative net on the credit column (classic netting). Because
 * every journal entry is balanced at write time, Σnet over all accounts is
 * 0 and totalDebits === totalCredits — any drift here indicates GL
 * corruption, surfaced via `isBalanced`.
 */
export function aggregateTrialBalance(lines: GlLine[]): TrialBalanceResult {
  const byAccount = new Map<
    string,
    { name: string; debit: number; credit: number }
  >();

  for (const line of lines) {
    const agg = byAccount.get(line.accountCode) ?? {
      name: line.accountName,
      debit: 0,
      credit: 0,
    };
    agg.debit += line.debit || 0;
    agg.credit += line.credit || 0;
    // Prefer the line name we saw; fall back to chart name below.
    byAccount.set(line.accountCode, agg);
  }

  const rows: TrialBalanceRow[] = [];
  for (const [code, agg] of byAccount) {
    // Skip accounts with no activity on either side AND accounts whose
    // activity nets to zero (e.g. a fully settled creditor) — a zero/zero
    // row is noise in a netted trial balance.
    if (agg.debit === agg.credit) continue;

    const chartAccount = CHART_BY_CODE.get(code);
    const head = chartAccount?.name ?? agg.name ?? code;
    const group = CATEGORY_GROUPS[chartAccount?.category ?? ""] ?? "Unclassified";

    const net = agg.debit - agg.credit;
    rows.push({
      head,
      group,
      debit: net > 0 ? net : 0,
      credit: net < 0 ? -net : 0,
    });
  }

  // Stable, accountant-friendly order: by chart group then account code.
  rows.sort((a, b) => a.group.localeCompare(b.group) || a.head.localeCompare(b.head));

  const totalDebits = rows.reduce((s, r) => s + r.debit, 0);
  const totalCredits = rows.reduce((s, r) => s + r.credit, 0);
  const difference = Math.abs(totalDebits - totalCredits);

  return {
    rows,
    totalDebits,
    totalCredits,
    difference,
    // The engine rejects unbalanced entries at write time, so any drift
    // beyond float noise means someone wrote to the GL outside the engine.
    isBalanced: difference < 0.01,
  };
}

/**
 * Assert that a trial balance result is balanced.
 *
 * Call this immediately after `aggregateTrialBalance()` in any procedure
 * that surfaces the GL to users. A non-zero difference means journal entries
 * were written outside the double-entry engine — this logs a structured error
 * so observability tooling (Sentry, Datadog, etc.) can alert on it.
 *
 * This does NOT throw: the caller still returns the (possibly imbalanced)
 * result to the user so they can see the discrepancy. The alert is the signal
 * to the engineering team to investigate — not a runtime blocker.
 *
 * @param result   Output of aggregateTrialBalance()
 * @param context  Arbitrary metadata to include in the log (orgId, projectId, etc.)
 */
export function assertGlBalanced(
  result: TrialBalanceResult,
  context: Record<string, unknown> = {},
): void {
  if (result.isBalanced) return;

  // Dynamic import keeps gl-trial-balance.ts free of a hard logger dep
  // in test environments. In production the logger is always available.
  import("@/lib/logger")
    .then(({ logger }) => {
      logger().error("gl.imbalance.detected", {
        difference: result.difference,
        totalDebits: result.totalDebits,
        totalCredits: result.totalCredits,
        rowCount: result.rows.length,
        ...context,
      });
    })
    .catch(() => {
      // Last-resort: native console so the event is never silently swallowed.
      console.error("[GL IMBALANCE]", {
        difference: result.difference,
        ...context,
      });
    });
}
