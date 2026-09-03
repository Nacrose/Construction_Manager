/**
 * Fiscal Year Lock helper.
 *
 * When a fiscal year is locked, all financial records in that period
 * become read-only. Call `assertNotLocked` at the top of every
 * financial mutation to enforce this.
 *
 * RLS note: FiscalYearLock is FORCE'd by Row-Level Security, and the
 * enforcement path must see the org's lock rows. The checks below run
 * inside a short transaction pinned with `withOrgContext` (transaction-
 * scoped GUC) rather than the pooled `db` client's session context —
 * `setOrgContext` is best-effort and pool rotation drops it, which would
 * make the RLS filter evaluate `organizationId = NULL` and return zero
 * rows, letting a mutation into a locked period through silently.
 */
import { db } from "@/lib/db";
import { TRPCError } from "@trpc/server";
import { withOrgContext } from "./rls";
import type { DbTxClient } from "@/lib/db";

/**
 * Run a read against an RLS-FORCE'd table under a transaction-scoped org
 * context, so the pool's session-level GUC being unset/stale cannot hide
 * the org's rows from the check.
 */
async function readInOrgScope<T>(
  organizationId: string,
  fn: (tx: DbTxClient) => Promise<T>,
): Promise<T> {
  return db.$transaction(async (tx) => {
    await withOrgContext(tx, organizationId, false);
    return fn(tx);
  });
}

/**
 * Check if a given date falls within a locked fiscal year for the
 * given organization. If so, throw a FORBIDDEN error.
 *
 * Usage:
 *   await assertNotLocked(organizationId, transactionDate);
 *   // ... proceed with the mutation
 */
export async function assertNotLocked(
  organizationId: string | null | undefined,
  date: Date = new Date(),
): Promise<void> {
  if (!organizationId) return; // no org = no lock to check

  const lockedFiscalYear = await readInOrgScope(organizationId, (tx) =>
    tx.fiscalYearLock.findFirst({
      where: {
        organizationId,
        isLocked: true,
        startDate: { lte: date },
        endDate: { gte: date },
      },
      select: { fiscalYear: true },
    }),
  );

  if (lockedFiscalYear) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `Fiscal year ${lockedFiscalYear.fiscalYear} is locked. Financial records in this period cannot be modified. Contact your administrator to unlock if needed.`,
    });
  }
}

/**
 * Get the active fiscal year lock for an organization (if any).
 * Returns null if no locks exist or none cover the current date.
 */
export async function getActiveLock(
  organizationId: string,
  date: Date = new Date(),
) {
  return readInOrgScope(organizationId, (tx) =>
    tx.fiscalYearLock.findFirst({
      where: {
        organizationId,
        isLocked: true,
        startDate: { lte: date },
        endDate: { gte: date },
      },
    }),
  );
}

/**
 * List all fiscal year locks for an organization.
 */
export async function listLocks(organizationId: string) {
  return readInOrgScope(organizationId, (tx) =>
    tx.fiscalYearLock.findMany({
      where: { organizationId },
      orderBy: { startDate: "desc" },
    }),
  );
}
