/**
 * tRPC router for Vendor Bills, 3-Way Matching, and Accounts Payable Payments.
 */
import { z } from "zod";
import { safeUrlSchema } from "@/lib/safe-url";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "@/server/trpc";
import { db } from "@/lib/db";
import { withOrgContext } from "@/lib/rls";
import { assertProjectMember, assertCanWrite, assertProjectAdmin } from "@/lib/authz";
import { audit } from "@/lib/audit";
import { assertNotLocked } from "@/lib/fiscal-year-lock";
import { assertDelegation } from "@/lib/delegation";
import { createJournalEntry, vendorPaymentEntry } from "@/lib/journal-entry";
import { formatNpr } from "@/lib/currency";




const CreateVendorBillSchema = z.object({
  projectId: z.string(),
  partnerId: z.string().min(1),
  purchaseOrderId: z.string().optional().nullable(),
  billNumber: z.string().min(1),
  billDate: z.string(),
  dueDate: z.string().optional().nullable(),
  grossAmount: z.number().nonnegative(),
  vatPercent: z.number().min(0).max(100).optional().default(13),
  tdsPercent: z.number().min(0).max(100).optional().default(1.5),
  fileUrl: safeUrlSchema.optional().nullable(),
  remarks: z.string().optional().nullable(),
});

const RecordVendorPaymentSchema = z.object({
  projectId: z.string(),
  vendorBillId: z.string().min(1),
  amount: z.number().positive(),
  paymentDate: z.string().optional(),
  paymentMethod: z.enum(["bank_transfer", "cheque", "cash"]).optional().default("bank_transfer"),
  referenceNumber: z.string().optional().nullable(),
  remarks: z.string().optional().nullable(),
});

export const vendorBillRouter = router({
  /** List all vendor bills for a project with payment status and partner info. */
  list: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        partnerId: z.string().optional(),
        status: z.enum(["all", "unpaid", "partially_paid", "paid", "disputed"]).optional().default("all"),
      })
    )
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);

      const whereClause: any = {
        projectId: input.projectId,
        ...(input.partnerId ? { partnerId: input.partnerId } : {}),
        ...(input.status !== "all" ? { status: input.status } : {}),
      };

      const bills = await db.vendorBill.findMany({
        where: whereClause,
        include: {
          partner: {
            select: { id: true, name: true, phone: true, email: true, pan: true, contact: true },
          },
          purchaseOrder: {
            select: { id: true, number: true, status: true, totalAmount: true, netAmount: true },
          },
          payments: {
            orderBy: { paymentDate: "desc" },
            include: {
              createdBy: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: { billDate: "desc" },
      });

      // Compute AP Summary
      const allBills = await db.vendorBill.findMany({
        where: { projectId: input.projectId },
        select: { grossAmount: true, netPayable: true, paidAmount: true, status: true },
      });

      const totalBilled = allBills.reduce((acc, b) => acc + b.netPayable, 0);
      const totalPaid = allBills.reduce((acc, b) => acc + b.paidAmount, 0);
      const pendingPayable = Math.max(0, totalBilled - totalPaid);
      const overdueCount = allBills.filter((b) => b.status === "unpaid" || b.status === "partially_paid").length;

      return {
        bills,
        summary: {
          totalBilled,
          totalPaid,
          pendingPayable,
          overdueCount,
        },
      };
    }),

  /** 3-Way Match Lookup: Get PO & GRN details for matching against a new bill. */
  getThreeWayMatchData: protectedProcedure
    .input(z.object({ projectId: z.string(), purchaseOrderId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);

      const po = await db.purchaseOrder.findFirst({
        where: { id: input.purchaseOrderId, projectId: input.projectId },
        include: {
          partner: true,
          items: {
            include: {
              material: { select: { id: true, name: true, unit: true, code: true } },
            },
          },
          transactions: {
            where: { type: "receive" },
            include: {
              material: { select: { id: true, name: true, unit: true } },
              gateEntry: true,
            },
          },
        },
      });

      if (!po) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Purchase order not found." });
      }

      // Compute delivered totals
      const deliveredSummary = po.items.map((poi) => {
        const receivedTxns = po.transactions.filter((t) => t.materialId === poi.materialId);
        const totalReceivedQty = receivedTxns.reduce((acc, t) => acc + t.quantity, 0);
        const totalReceivedAmount = receivedTxns.reduce((acc, t) => acc + t.quantity * t.rate, 0);
        return {
          materialId: poi.materialId,
          materialName: poi.material.name,
          unit: poi.unit,
          orderedQty: poi.quantity,
          poRate: poi.rate,
          poAmount: poi.amount,
          receivedQty: totalReceivedQty,
          receivedAmount: totalReceivedAmount,
          deliveredPercent: poi.quantity > 0 ? (totalReceivedQty / poi.quantity) * 100 : 0,
        };
      });

      return {
        po: {
          id: po.id,
          number: po.number,
          orderDate: po.orderDate,
          partnerId: po.partnerId,
          partnerName: po.partner?.name || "Unknown Partner",
          partnerPan: po.partner?.pan || null,
          totalAmount: po.totalAmount,
          netAmount: po.netAmount || po.totalAmount * 1.13,
        },
        items: deliveredSummary,
        grnTransactions: po.transactions,
      };
    }),

  /** Create/Register a Vendor Bill (with 13% VAT & TDS calculation and 3-Way Match validation). */
  create: protectedProcedure
    .input(CreateVendorBillSchema)
    .mutation(async ({ ctx, input }) => {
      await assertCanWrite(ctx.user, input.projectId);
      await assertDelegation(ctx.user, "create_vendor_bill", input.grossAmount);

      // 3-Way Match Validation if linked to a Purchase Order
      if (input.purchaseOrderId) {
        const po = await db.purchaseOrder.findFirst({
          where: { id: input.purchaseOrderId, projectId: input.projectId },
          include: {
            transactions: { where: { type: "receive" } },
          },
        });

        if (!po) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Linked Purchase Order not found in this project." });
        }

        const totalGRNAmount = po.transactions.reduce((sum, t) => sum + t.quantity * t.rate, 0);

        // If PO is not directly completed/received and has zero GRN deliveries logged
        if (po.status !== "received" && totalGRNAmount === 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Cannot register bill against Purchase Order ${po.number} because no goods have been received yet (GRN value is NPR 0). Please log Inward Delivery first.`,
          });
        }

        // If billed gross amount significantly exceeds GRN deliveries (> 10% buffer) on an open PO
        if (po.status !== "received" && totalGRNAmount > 0 && input.grossAmount > totalGRNAmount * 1.10) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `3-Way Match Failed: Billed gross amount (NPR ${input.grossAmount.toLocaleString()}) exceeds total goods received value (NPR ${totalGRNAmount.toLocaleString()}) by more than 10%. Please receive all items before full billing.`,
          });
        }
      }

      if (input.partnerId) {
        const partner = await db.partner.findFirst({
          where: { id: input.partnerId, projectId: input.projectId },
          select: { id: true },
        });
        if (!partner) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Vendor/Partner not found in this project." });
        }
      }

      // `??` (not `||`): a VAT/TDS-exempt bill passes 0, which is a valid
      // rate — `0 || 13` silently billed VAT-exempt bills at 13%.
      const vatAmount = (input.grossAmount * (input.vatPercent ?? 13)) / 100;
      const tdsAmount = (input.grossAmount * (input.tdsPercent ?? 1.5)) / 100;
      const netPayable = input.grossAmount + vatAmount - tdsAmount;

      // FISCAL YEAR LOCK: check BEFORE any write. Previously this ran
      // AFTER the bill row was already committed — a locked year would
      // throw, but the bill existed without its journal entry, and the
      // JE was also created outside the bill's transaction so any JE
      // failure (unbalanced line, sequence collision) left a permanently
      // un-journaled bill. Both writes now share one transaction.
      await assertNotLocked(ctx.user.organizationId, new Date(input.billDate));

      const bill = await db.$transaction(async (tx) => {
        await withOrgContext(tx, ctx.user.organizationId, !!ctx.user.isSuperAdmin);
        const created = await tx.vendorBill.create({
          data: {
            projectId: input.projectId,
            partnerId: input.partnerId,
            purchaseOrderId: input.purchaseOrderId || null,
            billNumber: input.billNumber.trim(),
            billDate: new Date(input.billDate),
            dueDate: input.dueDate ? new Date(input.dueDate) : null,
            grossAmount: input.grossAmount,
            vatAmount,
            tdsAmount,
            netPayable,
            paidAmount: 0,
            status: "unpaid",
            fileUrl: input.fileUrl || null,
            remarks: input.remarks || null,
          },
          include: {
            partner: true,
            purchaseOrder: true,
          },
        });

        // LIABILITY JOURNAL ENTRY: record the liability when the bill is
        // created, not just when it's paid. Without this, Sundry Creditors
        // (2001) only ever gets DEBITED (at payment time) but never CREDITED
        // — so the Trial Balance won't tie out as long as any bill is
        // outstanding.
        //
        // Correct Nepal double-entry for a vendor bill:
        //   Dr Purchases / Material (5001)     = grossAmount
        //   Dr Input VAT Receivable (1410)     = vatAmount   (recoverable from IRD)
        //      Cr TDS Payable (2020)           = tdsAmount   (must deposit to IRD)
        //      Cr Sundry Creditors (2001)      = netPayable  (what we owe vendor)
        //
        // Balance check: Dr = grossAmount + vatAmount
        //                Cr = tdsAmount + (grossAmount + vatAmount - tdsAmount) = grossAmount + vatAmount ✓
        //
        // ACCOUNT CODE FIX: Input VAT previously shared 1400 with TDS
        // Receivable (two different asset balances on one account — VAT
        // reports and TDS reports both read the wrong totals). Input VAT
        // now has its own account, 1410.
        await createJournalEntry(tx, {
          source: "vendor_bill",
          sourceRefId: created.id,
          sourceRefType: "VendorBill",
          description: `Vendor bill ${created.billNumber} — liability recorded`,
          entryDate: new Date(input.billDate),
          postedById: ctx.user.id,
          organizationId: ctx.user.organizationId ?? undefined,
          lines: [
            {
              accountCode: "5001",
              accountName: "Material / Purchases",
              debit: input.grossAmount,
              credit: 0,
              description: `Purchase from ${created.partner?.name || created.billNumber}`,
              projectId: input.projectId,
              partnerId: created.partnerId || undefined,
            },
            ...(vatAmount > 0 ? [{
              accountCode: "1410" as const,
              accountName: "Input VAT Receivable",
              debit: vatAmount,
              credit: 0,
              description: `Input VAT on vendor bill ${created.billNumber}`,
              projectId: input.projectId,
            }] : []),
            ...(tdsAmount > 0 ? [{
              accountCode: "2020" as const,
              accountName: "TDS Payable",
              debit: 0,
              credit: tdsAmount,
              description: `TDS to deposit on behalf of ${created.partner?.name || created.billNumber}`,
              projectId: input.projectId,
            }] : []),
            {
              accountCode: "2001",
              accountName: "Sundry Creditors",
              debit: 0,
              credit: netPayable,
              description: `Payable to ${created.partner?.name || created.billNumber}`,
              projectId: input.projectId,
              partnerId: created.partnerId || undefined,
            },
          ],
        });

        return created;
      });

      return { bill };
    }),

  /** Record a payment against a vendor bill (Requires Project Manager or Coordinator role). */
  recordPayment: protectedProcedure
    .input(RecordVendorPaymentSchema)
    .mutation(async ({ ctx, input }) => {
      // Role-gate financial disbursement to Project Manager or Coordinator
      await assertProjectAdmin(ctx.user, input.projectId);
      await assertDelegation(ctx.user, "record_vendor_payment", input.amount);

      // Fiscal year lock enforcement
      await assertNotLocked(ctx.user.organizationId, input.paymentDate ? new Date(input.paymentDate) : new Date());

      const bill = await db.vendorBill.findFirst({
        where: { id: input.vendorBillId, projectId: input.projectId },
        include: { partner: { select: { id: true, name: true } } },
      });

      if (!bill) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Vendor bill not found." });
      }

      const remainingPayable = bill.netPayable - bill.paidAmount;
      if (input.amount > remainingPayable + 0.01) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Payment amount (${formatNpr(input.amount)}) exceeds remaining net payable amount (${formatNpr(Math.max(0, remainingPayable))}).`,
        });
      }


      const isFull = (bill.paidAmount + input.amount) >= bill.netPayable - 0.01;
      const newStatus = isFull ? "paid" : "partially_paid";

      const payment = await db.$transaction(async (tx) => {
        await withOrgContext(tx, ctx.user.organizationId, !!ctx.user.isSuperAdmin);
        const p = await tx.vendorPayment.create({
          data: {
            projectId: input.projectId,
            vendorBillId: input.vendorBillId,
            amount: input.amount,
            paymentDate: input.paymentDate ? new Date(input.paymentDate) : new Date(),
            paymentMethod: input.paymentMethod || "bank_transfer",
            referenceNumber: input.referenceNumber || null,
            remarks: input.remarks || null,
            createdById: ctx.user.id,
          },
        });

        // Atomic increment to avoid lost-update race on concurrent payments.
        // Previously this used `bill.paidAmount + input.amount` (read-then-write)
        // — two concurrent payments would race and one would be lost.
        await tx.$executeRaw`
          UPDATE "VendorBill"
          SET "paidAmount" = "paidAmount" + ${input.amount},
              "status" = ${newStatus}
          WHERE "id" = ${input.vendorBillId}
        `;

        // Generate the double-entry journal entry for this payment.
        // Dr Sundry Creditors (vendor payable reduced)
        //    Cr TDS Payable (if TDS deducted)
        //    Cr Bank / Cash (net amount paid out)
        const vendorName = bill.partner?.name || bill.billNumber;
        const jeInput = vendorPaymentEntry({
          vendorBillId: input.vendorBillId,
          vendorName,
          amount: input.amount,
          tdsDeducted: 0, // vendor bill payments don't deduct TDS at payment time (it's on the bill)
          netPaid: input.amount,
          paymentMode: input.paymentMethod || "bank_transfer",
          projectId: input.projectId,
          partnerId: bill.partner?.id,
          date: input.paymentDate ? new Date(input.paymentDate) : new Date(),
        });
        await createJournalEntry(tx, {
          ...jeInput,
          postedById: ctx.user.id,
          organizationId: ctx.user.organizationId ?? undefined,
        });

        return p;
      });

      await audit({
        userId: ctx.user.id,
        projectId: input.projectId,
        action: "vendor.bill.pay",
        entityType: "vendor_bill",
        entityId: input.vendorBillId,
        metadata: {
          billNumber: bill.billNumber,
          amount: input.amount,
          newPaidAmount: bill.paidAmount + input.amount,
          status: newStatus,
          paymentMethod: input.paymentMethod || "bank_transfer",
        },
      });

      return { payment, newStatus, remainingPayable: Math.max(0, bill.netPayable - (bill.paidAmount + input.amount)) };
    }),
});
