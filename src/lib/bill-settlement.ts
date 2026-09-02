/**
 * Guarded atomic bill settlement — THE single authoritative overpayment
 * guard for every path that moves `paidAmount` on VendorBill /
 * SubcontractorBill.
 *
 * WHY THIS EXISTS (audit C-2): three call sites enforced the overpayment
 * rule with a read-then-write check — the check read `paidAmount` BEFORE
 * the transaction (project-ops.payment.create) or used an unguarded
 * atomic increment whose `status` was derived from a stale pre-tx read
 * (vendor-bill.recordPayment, subcontractor-bill.markPaid). Two
 * concurrent payments on the same bill could therefore both pass the
 * check and jointly overpay the bill, or one payment's ledger effect
 * could be lost to a lost-update race — corrupting real money state
 * while every payment still posts a valid JE (bank and GL disagree with
 * the bill).
 *
 * THE PATTERN (matches finance.orgSettleMultiBill — the in-repo gold
 * standard): a single guarded atomic UPDATE whose WHERE clause carries
 * the overpayment guard:
 *
 *   SET "paidAmount" = "paidAmount" + $x
 *   WHERE "id" = $id AND "paidAmount" + $x <= "netPayable" + 0.01
 *
 * rowcount 0 ⇒ the guard rejected the payment (or the bill vanished) ⇒
 * the helper throws an overpayment error and the caller's whole
 * transaction rolls back (payment row + JE + bank decrement included).
 * The bill `status` is derived INSIDE the same UPDATE (CASE), never from
 * a stale read.
 *
 * The 1-paisa tolerance mirrors every other settlement site (float
 * storage boundary — DECIMAL round-trip is exact, comparisons are not).
 *
 * NOTE: table names cannot be bound parameters in raw SQL — each table
 * gets its own literal statement.
 */
import { TRPCError } from "@trpc/server";
import type { DbTxClient } from "@/lib/db";
import { subMoney } from "@/lib/money";

/**
 * Settle a VendorBill inside the caller's transaction: atomically
 * increment `paidAmount` by `amount` and derive `status`
 * (paid | partially_paid) in the same statement. Throws BAD_REQUEST
 * (overpayment) when the guard rejects — the caller's transaction then
 * rolls back everything.
 */
export async function settleVendorBillInTx(
  tx: DbTxClient,
  vendorBillId: string,
  amount: number,
  billNumber: string,
): Promise<void> {
  const updated = await tx.$executeRaw`
    UPDATE "VendorBill"
    SET "paidAmount" = "paidAmount" + ${amount},
        "status" = CASE
          WHEN "paidAmount" + ${amount} >= "netPayable" - 0.01 THEN 'paid'
          ELSE 'partially_paid'
        END
    WHERE "id" = ${vendorBillId}
      AND "paidAmount" + ${amount} <= "netPayable" + 0.01
  `;
  if (updated === 0) {
    const bill = await tx.vendorBill.findUnique({
      where: { id: vendorBillId },
      select: { paidAmount: true, netPayable: true },
    });
    const remaining = subMoney(bill?.netPayable ?? 0, bill?.paidAmount ?? 0).toString();
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Overpayment: bill ${billNumber} has remaining balance ${remaining} but payment amount is ${amount}.`,
    });
  }
}

/**
 * Settle a SubcontractorBill inside the caller's transaction: atomically
 * increment `paidAmount` by `amount` and derive `status`
 * (paid | certified — partial payments stay "certified", matching
 * markPaid's original ladder). Throws BAD_REQUEST (overpayment) when the
 * guard rejects.
 */
export async function settleSubcontractorBillInTx(
  tx: DbTxClient,
  billId: string,
  amount: number,
  billNumber: string,
): Promise<void> {
  const updated = await tx.$executeRaw`
    UPDATE "SubcontractorBill"
    SET "paidAmount" = "paidAmount" + ${amount},
        "status" = CASE
          WHEN "paidAmount" + ${amount} >= "netPayable" - 0.01 THEN 'paid'
          ELSE 'certified'
        END
    WHERE "id" = ${billId}
      AND "paidAmount" + ${amount} <= "netPayable" + 0.01
  `;
  if (updated === 0) {
    const bill = await tx.subcontractorBill.findUnique({
      where: { id: billId },
      select: { paidAmount: true, netPayable: true },
    });
    const remaining = subMoney(bill?.netPayable ?? 0, bill?.paidAmount ?? 0).toString();
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Overpayment: bill ${billNumber} has remaining balance ${remaining} but payment amount is ${amount}.`,
    });
  }
}

/**
 * Reverse a settlement (audit H-15): when a Payment is deleted, the bill
 * it settled must be unwound in the SAME transaction — otherwise the
 * bill stays "paid" with no payment behind it and the GL (reversed JE)
 * disagrees with the bill state.
 *
 * Guarded atomic DECREMENT floored at 0 (a deletion racing with a
 * payment can never drive `paidAmount` negative), with `status`
 * recomputed from the post-decrement value inside the same statement:
 *   VendorBill:           paid | partially_paid | unpaid
 *   SubcontractorBill:    paid | certified
 * (the pre-payment state of both ladders — no other status is ever
 * written by a settlement, so no other status needs restoring).
 */
export async function unwindVendorBillSettlementInTx(
  tx: DbTxClient,
  vendorBillId: string,
  amount: number,
  billNumber: string,
): Promise<void> {
  const updated = await tx.$executeRaw`
    UPDATE "VendorBill"
    SET "paidAmount" = GREATEST("paidAmount" - ${amount}, 0),
        "status" = CASE
          WHEN "paidAmount" - ${amount} >= "netPayable" - 0.01 THEN 'paid'
          WHEN "paidAmount" - ${amount} > 0.01 THEN 'partially_paid'
          ELSE 'unpaid'
        END
    WHERE "id" = ${vendorBillId}
  `;
  if (updated === 0) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: `Vendor bill ${billNumber} not found — cannot unwind settlement.`,
    });
  }
}

/** Subcontractor twin of unwindVendorBillSettlementInTx (see above). */
export async function unwindSubcontractorBillSettlementInTx(
  tx: DbTxClient,
  billId: string,
  amount: number,
  billNumber: string,
): Promise<void> {
  const updated = await tx.$executeRaw`
    UPDATE "SubcontractorBill"
    SET "paidAmount" = GREATEST("paidAmount" - ${amount}, 0),
        "status" = CASE
          WHEN "paidAmount" - ${amount} >= "netPayable" - 0.01 THEN 'paid'
          ELSE 'certified'
        END
    WHERE "id" = ${billId}
  `;
  if (updated === 0) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: `Subcontractor bill ${billNumber} not found — cannot unwind settlement.`,
    });
  }
}
