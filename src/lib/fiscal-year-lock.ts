/**
 * Fiscal Year Lock helper.
 *
 * When a fiscal year is locked, all financial records in that period
 * become read-only. Call `assertNotLocked` at the top of every
 * financial mutation to enforce this.
 */
import { db } from "@/lib/db";
import { TRPCError } from "@trpc/server";

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

  const lockedFiscalYear = await db.fiscalYearLock.findFirst({
    where: {
      organizationId,
      isLocked: true,
      startDate: { lte: date },
      endDate: { gte: date },
    },
    select: { fiscalYear: true },
  });

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
  return db.fiscalYearLock.findFirst({
    where: {
      organizationId,
      isLocked: true,
      startDate: { lte: date },
      endDate: { gte: date },
    },
  });
}

/**
 * List all fiscal year locks for an organization.
 */
export async function listLocks(organizationId: string) {
  return db.fiscalYearLock.findMany({
    where: { organizationId },
    orderBy: { startDate: "desc" },
  });
}
