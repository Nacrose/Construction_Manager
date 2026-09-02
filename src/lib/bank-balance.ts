/**
 * Guarded atomic bank-account balance operations (audit P2 item 30).
 *
 * CompanyBankAccount.currentBalance was decremented at ~8 sites with a
 * plain `decrement` (or unguarded raw UPDATE) — a payment could silently
 * drive an account NEGATIVE, and org-level maxAmount rules never saw the
 * resulting balance. This helper is THE single way money leaves a central
 * bank account: the sufficiency check lives in the UPDATE's WHERE clause,
 * so two concurrent withdrawals can never jointly overdraw, and an
 * overdraw is rejected (fail loud, ADR-0001) instead of persisted.
 *
 * If an org ever wants explicit overdrafts, gate the rejection here behind
 * an org-level allowOverdraft flag — every call site already funnels
 * through this function.
 */
import { TRPCError } from "@trpc/server";
import type { DbTxClient } from "@/lib/db";

/**
 * Atomically decrement a central bank account balance inside the caller's
 * transaction. Throws BAD_REQUEST when the withdrawal would overdraw the
 * account (guard lives in the WHERE clause — race-free).
 */
export async function decrementBankBalanceInTx(
  tx: DbTxClient,
  bankAccountId: string,
  amount: number,
): Promise<void> {
  if (!(amount > 0)) return; // nothing to withdraw

  const updated = await tx.$executeRaw`
    UPDATE "CompanyBankAccount"
    SET "currentBalance" = "currentBalance" - ${amount}
    WHERE "id" = ${bankAccountId}
      AND "currentBalance" - ${amount} >= 0
  `;
  if (updated === 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "Insufficient funds: this payment would overdraw the selected bank account.",
    });
  }
}
