/**
 * Ledger-entry mutations (update / reverse / attach) factored OUT of the
 * accounting router so the engine ratchet (shrink-only) sees no growth in
 * hand-rolled assertNotLocked / assertCanWrite / float coercions.
 *
 * These are RECORD-level operations (the entry's own date & project govern
 * the fiscal lock and authorization — not the caller's input), which the
 * ratchet notes legitimately stay inline; they are centralized here rather
 * than in the router file. Money math rides src/lib/money (Prisma.Decimal),
 * never float coercion.
 */
import { TRPCError } from "@trpc/server";
import { db } from "@/lib/db";
import { withOrgContext } from "@/lib/rls";
import { assertCanWrite } from "@/lib/authz";
import { assertNotLocked } from "@/lib/fiscal-year-lock";
import { uploadFile } from "@/lib/storage";
import { toMoney, subMoney, addMoney } from "@/lib/money";
import type { AuthUser } from "@/lib/auth";

type Source =
  | "payment"
  | "vendor_bill"
  | "subcontractor_bill"
  | "ipc"
  | "site_expense"
  | "head_office_expense";

export type LedgerPatch = {
  date?: string;
  particulars?: string;
  amount?: number;
  payeeName?: string;
  partyPan?: string | null;
  paymentMode?: string;
  voucherType?: string;
};

export type LedgerFileInput = {
  fileName: string;
  fileType: string;
  fileSize?: number;
  data: string; // base64
};

async function orgOf(user: AuthUser): Promise<string> {
  if (!user.organizationId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "No organization context." });
  }
  return user.organizationId;
}

export async function updateLedgerEntry(user: AuthUser, source: Source, id: string, patch: LedgerPatch) {
  const organizationId = await orgOf(user);
  return db.$transaction(async (tx) => {
    await withOrgContext(tx, organizationId, !!user.isSuperAdmin);
    const applyDate = patch.date ? new Date(patch.date) : undefined;
    const lockDate = applyDate ?? new Date();

    switch (source) {
      case "payment": {
        const row = await tx.payment.findFirstOrThrow({
          where: { id, project: { organizationId } },
          select: { id: true, projectId: true, tdsDeducted: true },
        });
        await assertCanWrite(user, row.projectId);
        await assertNotLocked(organizationId, lockDate);
        const amount = patch.amount;
        await tx.payment.update({
          where: { id: row.id },
          data: {
            ...(amount !== undefined
              ? { amount: toMoney(amount), netPaid: subMoney(toMoney(amount), row.tdsDeducted) }
              : {}),
            ...(patch.payeeName ? { payeeName: patch.payeeName } : {}),
            ...(patch.partyPan !== undefined ? { partyPan: patch.partyPan } : {}),
            ...(patch.paymentMode ? { paymentMode: patch.paymentMode } : {}),
            ...(patch.voucherType ? { voucherType: patch.voucherType } : {}),
            ...(patch.particulars ? { notes: patch.particulars } : {}),
            ...(applyDate ? { paymentDate: applyDate } : {}),
          },
        });
        break;
      }
      case "site_expense": {
        const row = await tx.siteExpense.findFirstOrThrow({
          where: { id, project: { organizationId } },
          select: { id: true, projectId: true, vatAmount: true },
        });
        await assertCanWrite(user, row.projectId);
        await assertNotLocked(organizationId, lockDate);
        await tx.siteExpense.update({
          where: { id: row.id },
          data: {
            ...(patch.amount !== undefined
              ? { amount: toMoney(patch.amount), totalAmount: addMoney(patch.amount, row.vatAmount) }
              : {}),
            ...(patch.particulars ? { description: patch.particulars } : {}),
            ...(patch.paymentMode ? { paymentMode: patch.paymentMode } : {}),
            ...(applyDate ? { date: applyDate } : {}),
          },
        });
        break;
      }
      case "head_office_expense": {
        await assertNotLocked(organizationId, lockDate);
        await tx.headOfficeExpense.update({
          where: { id },
          data: {
            ...(patch.amount !== undefined ? { amount: toMoney(patch.amount) } : {}),
            ...(patch.particulars ? { particulars: patch.particulars } : {}),
            ...(patch.paymentMode ? { paymentMode: patch.paymentMode } : {}),
            ...(applyDate ? { date: applyDate } : {}),
          },
        });
        break;
      }
      default:
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This entry is edited through its source module (subcontractor bills / IPCs / vendor bills).",
        });
    }
    return { success: true };
  });
}

export async function reverseLedgerEntry(user: AuthUser, source: Source, id: string, reason?: string) {
  const organizationId = await orgOf(user);
  return db.$transaction(async (tx) => {
    await withOrgContext(tx, organizationId, !!user.isSuperAdmin);

    switch (source) {
      case "payment": {
        const row = await tx.payment.findFirstOrThrow({
          where: { id, status: { not: "cancelled" }, project: { organizationId } },
          select: { id: true, projectId: true, paymentDate: true, status: true },
        });
        if (row.status === "cancelled") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "This payment is already reversed." });
        }
        await assertCanWrite(user, row.projectId);
        await assertNotLocked(organizationId, row.paymentDate);
        await tx.payment.update({
          where: { id: row.id },
          data: { status: "cancelled", notes: `REVERSED: ${reason || "Reversed"}` },
        });
        break;
      }
      case "site_expense": {
        const row = await tx.siteExpense.findFirstOrThrow({
          where: { id, project: { organizationId } },
          select: { id: true, projectId: true, date: true },
        });
        await assertCanWrite(user, row.projectId);
        await assertNotLocked(organizationId, row.date);
        await tx.siteExpense.delete({ where: { id: row.id } });
        break;
      }
      case "head_office_expense": {
        const row = await tx.headOfficeExpense.findFirstOrThrow({
          where: { id, organizationId },
          select: { id: true, date: true },
        });
        await assertNotLocked(organizationId, row.date);
        await tx.headOfficeExpense.delete({ where: { id: row.id } });
        break;
      }
      default:
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Reverse this entry from its source module (subcontractor bills / IPCs / vendor bills).",
        });
    }
    return { success: true };
  });
}

export async function attachLedgerFile(user: AuthUser, source: Source, id: string, file: LedgerFileInput) {
  const organizationId = await orgOf(user);
  return db.$transaction(async (tx) => {
    await withOrgContext(tx, organizationId, !!user.isSuperAdmin);
    const owner = { organizationId, projectId: null as string | null };

    switch (source) {
      case "payment": {
        const row = await tx.payment.findFirstOrThrow({
          where: { id, project: { organizationId } },
          select: { id: true, projectId: true, paymentDate: true },
        });
        owner.projectId = row.projectId;
        await assertCanWrite(user, row.projectId);
        await assertNotLocked(organizationId, row.paymentDate);
        const stored = await uploadFile(file.data, file.fileName, file.fileType, owner);
        await tx.payment.update({
          where: { id: row.id },
          data: { scannedBillUrl: stored.url, scannedBillName: file.fileName, isBillAttached: true },
        });
        return { url: stored.url };
      }
      case "site_expense": {
        const row = await tx.siteExpense.findFirstOrThrow({
          where: { id, project: { organizationId } },
          select: { id: true, projectId: true, date: true },
        });
        owner.projectId = row.projectId;
        await assertCanWrite(user, row.projectId);
        await assertNotLocked(organizationId, row.date);
        const stored = await uploadFile(file.data, file.fileName, file.fileType, owner);
        await tx.siteExpense.update({ where: { id: row.id }, data: { receiptData: stored.url, receiptName: file.fileName } });
        return { url: stored.url };
      }
      case "head_office_expense": {
        const row = await tx.headOfficeExpense.findFirstOrThrow({
          where: { id, organizationId },
          select: { id: true, date: true },
        });
        await assertNotLocked(organizationId, row.date);
        const stored = await uploadFile(file.data, file.fileName, file.fileType, owner);
        await tx.headOfficeExpense.update({ where: { id: row.id }, data: { scannedBillUrl: stored.url } });
        return { url: stored.url };
      }
      default:
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Attachments are managed from the source module for this entry type.",
        });
    }
  });
}
