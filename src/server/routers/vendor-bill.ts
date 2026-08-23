/**
 * tRPC router for Vendor Bills, 3-Way Matching, and Accounts Payable Payments.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "@/server/trpc";
import { db } from "@/lib/db";
import { assertProjectMember, assertCanWrite, assertProjectAdmin } from "@/lib/authz";
import { audit } from "@/lib/audit";

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
  fileUrl: z.string().optional().nullable(),
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

      const vatAmount = (input.grossAmount * (input.vatPercent || 13)) / 100;
      const tdsAmount = (input.grossAmount * (input.tdsPercent || 1.5)) / 100;
      const netPayable = input.grossAmount + vatAmount - tdsAmount;

      const bill = await db.vendorBill.create({
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

      return { bill };
    }),

  /** Record a payment against a vendor bill (Requires Project Manager or Coordinator role). */
  recordPayment: protectedProcedure
    .input(RecordVendorPaymentSchema)
    .mutation(async ({ ctx, input }) => {
      // Role-gate financial disbursement to Project Manager or Coordinator
      await assertProjectAdmin(ctx.user, input.projectId);

      const bill = await db.vendorBill.findUnique({
        where: { id: input.vendorBillId },
      });

      if (!bill) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Vendor bill not found." });
      }

      const remainingPayable = bill.netPayable - bill.paidAmount;
      if (input.amount > remainingPayable + 0.01) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Payment amount (NPR ${input.amount.toLocaleString()}) exceeds remaining net payable amount (NPR ${Math.max(0, remainingPayable).toLocaleString(undefined, { minimumFractionDigits: 2 })}).`,
        });
      }

      const newPaidAmount = bill.paidAmount + input.amount;
      const isFull = newPaidAmount >= bill.netPayable - 0.01;
      const newStatus = isFull ? "paid" : "partially_paid";

      const payment = await db.$transaction(async (tx) => {
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

        await tx.vendorBill.update({
          where: { id: input.vendorBillId },
          data: {
            paidAmount: newPaidAmount,
            status: newStatus,
          },
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
          newPaidAmount,
          status: newStatus,
          paymentMethod: input.paymentMethod || "bank_transfer",
        },
      });

      return { payment, newStatus, remainingPayable: Math.max(0, bill.netPayable - newPaidAmount) };
    }),
});
