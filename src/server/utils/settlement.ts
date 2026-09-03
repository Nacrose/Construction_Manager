/**
 * Settlement primitive (ADR-0006 §2) — the second engine truth.
 *
 * Owns: partial/complete payments, reversals, payroll disbursement —
 * CAS on amounts. Never owns: generic document state machines (that is
 * the lifecycle engine) and derived values (derived-status evaluators).
 *
 * Invariants:
 *  - A settlement JE is idempotent on its (source, sourceRefId) —
 *    JournalEntry.@@unique([source, sourceRefId]) makes double-posting
 *    on retry impossible (audit C-3 idempotency key).
 *  - A payslip can never be overpaid: increments are CAS-guarded
 *    (paidAmount + x ≤ netPayable) at the database, so concurrent
 *    settlements cannot race past the net.
 *  - Payment STATUS is derived from amounts (derivePaymentStatus),
 *    never flipped by lifecycle transitions.
 */
import { TRPCError } from "@trpc/server";
import type { DbTxClient } from "@/lib/db";
import { createJournalEntry } from "@/lib/journal-entry";
import { decrementBankBalanceInTx } from "@/lib/bank-balance";

/**
 * Derive a payment status from amounts — the ONLY source of paid /
 * partial / unpaid truth (ADR-0006 §2: computed, never flipped).
 * Tolerance: a cent of rounding drift still counts as paid.
 */
export function derivePaymentStatus(
  paidAmount: number | string,
  netPayable: number | string,
): "unpaid" | "partial" | "paid" {
  // Unary-plus coercion at the DB boundary (Decimal columns may surface
  // as strings) — display/derivation only, never ledger arithmetic.
  const paid = +paidAmount;
  const net = +netPayable;
  if (!(paid > 0)) return "unpaid";
  if (paid + 0.01 >= net) return "paid";
  return "partial";
}

export type SettlePayrollRunArgs = {
  organizationId: string;
  runId: string;
  period: string;
  totalNetPayable: number;
  actorId: string;
  /** Org bank account the net payroll is drawn on (optional — cash payouts skip the decrement). */
  companyBankAccountId?: string | null;
};

/**
 * Disburse an org-level payroll run (ADR-0007 §3/§5):
 *
 *   Dr 2030 Salary Payable   = totalNetPayable   (org liability cleared)
 *      Cr 1010 Bank          = totalNetPayable   (cash out)
 *
 * Both lines are org-level (projectId null). Idempotent on the run id —
 * re-disbursement after a retry cannot double-post or double-decrement.
 * Payslip paidAmounts are bumped to net with a guarded conditional UPDATE
 * (never a status flip — the status is derived from these amounts).
 */
export async function settlePayrollRun(
  tx: DbTxClient,
  args: SettlePayrollRunArgs,
): Promise<{ posted: boolean }> {
  // IDEMPOTENCY: the settlement JE exists → this run already disbursed.
  // Skip everything (the caller's lifecycle transition rides separately).
  const existingJe = await tx.journalEntry.findFirst({
    where: { source: "payroll_disbursement", sourceRefId: args.runId },
    select: { id: true },
  });
  if (existingJe) return { posted: false };

  if (args.totalNetPayable > 0) {
    await createJournalEntry(tx, {
      source: "payroll_disbursement",
      sourceRefId: args.runId,
      sourceRefType: "PayrollRun",
      description: `Payroll disbursement — ${args.period}`,
      entryDate: new Date(),
      postedById: args.actorId,
      organizationId: args.organizationId,
      lines: [
        {
          accountCode: "2030",
          accountName: "Salary Payable",
          debit: args.totalNetPayable,
          credit: 0,
          description: `Salary payable settled — ${args.period}`,
        },
        {
          accountCode: "1010",
          accountName: "Bank",
          debit: 0,
          credit: args.totalNetPayable,
          description: `Net payroll disbursed — ${args.period}`,
        },
      ],
    });

    // Bank decrement rides the SAME transaction (negative-balance guard
    // is enforced globally per audit P2 item 30).
    if (args.companyBankAccountId) {
      await decrementBankBalanceInTx(tx, args.companyBankAccountId, args.totalNetPayable);
    }
  }

  // Bump payslips to paid — by AMOUNT, not by status flip. The guarded
  // UPDATE is a no-op for records already fully marked (paidAmount ≥ net).
  await tx.$executeRaw`
    UPDATE "PayrollPersonRecord"
       SET "paidAmount" = "netPayable",
           "updatedAt" = NOW()
     WHERE "payrollRunId" = ${args.runId}
       AND "paidAmount" < "netPayable"`;

  return { posted: true };
}
