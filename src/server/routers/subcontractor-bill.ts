/**
 * tRPC router for Subcontractor Billing — BOQ-linked line items,
 * retention/VAT/TDS calculations, status workflow, and payment tracking.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "@/server/trpc";
import { db } from "@/lib/db";
import { assertProjectMember, assertCanWrite, assertProjectAdmin } from "@/lib/authz";

const BillItemSchema = z.object({
  boqCode: z.string().optional().nullable(),
  description: z.string().min(1),
  unit: z.string().optional().nullable(),
  contractQty: z.number().nonnegative().default(0),
  previousQty: z.number().nonnegative().default(0),
  thisQty: z.number().nonnegative(),
  rate: z.number().nonnegative(),
});

const CreateBillSchema = z.object({
  projectId: z.string(),
  subcontractorId: z.string().min(1),
  period: z.string().optional().nullable(),
  retentionPercent: z.number().nonnegative().optional().default(10),
  vatPercent: z.number().nonnegative().optional().default(13),
  tdsPercent: z.number().nonnegative().optional().default(1.5),
  materialDeduction: z.number().nonnegative().optional().default(0),
  advanceRecovery: z.number().nonnegative().optional().default(0),
  notes: z.string().optional().nullable(),
  items: z.array(BillItemSchema).min(1),
});

const UpdateBillSchema = z.object({
  projectId: z.string(),
  billId: z.string(),
  period: z.string().optional().nullable(),
  retentionPercent: z.number().nonnegative().optional(),
  vatPercent: z.number().nonnegative().optional(),
  tdsPercent: z.number().nonnegative().optional(),
  materialDeduction: z.number().nonnegative().optional(),
  advanceRecovery: z.number().nonnegative().optional(),
  notes: z.string().optional().nullable(),
  items: z.array(BillItemSchema).optional(),
});

function calculateBillAmounts(data: {
  items: { thisQty: number; rate: number }[];
  retentionPercent: number;
  vatPercent: number;
  tdsPercent: number;
  materialDeduction: number;
  advanceRecovery: number;
}) {
  const grossAmount = data.items.reduce((sum, item) => sum + item.thisQty * item.rate, 0);
  const retentionAmount = (grossAmount * data.retentionPercent) / 100;
  const vatAmount = (grossAmount * data.vatPercent) / 100;
  const tdsAmount = (grossAmount * data.tdsPercent) / 100;
  const netPayable =
    grossAmount - retentionAmount + vatAmount - tdsAmount - data.materialDeduction - data.advanceRecovery;

  return {
    grossAmount,
    retentionAmount,
    vatAmount,
    tdsAmount,
    netPayable: Math.max(0, netPayable),
  };
}

export const subcontractorBillRouter = router({
  /** List all subcontractor bills for a project with filters. */
  list: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        subcontractorId: z.string().optional(),
        status: z.enum(["all", "draft", "submitted", "certified", "paid", "disputed"]).optional().default("all"),
      })
    )
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);

      const whereClause: any = {
        projectId: input.projectId,
        ...(input.subcontractorId ? { subcontractorId: input.subcontractorId } : {}),
        ...(input.status !== "all" ? { status: input.status } : {}),
      };

      const bills = await db.subcontractorBill.findMany({
        where: whereClause,
        include: {
          subcontractor: { select: { id: true, name: true } },
          createdBy: { select: { id: true, name: true } },
          items: true,
        },
        orderBy: { createdAt: "desc" },
      });

      // Aggregate stats
      const allBills = await db.subcontractorBill.findMany({
        where: { projectId: input.projectId },
        select: { grossAmount: true, netPayable: true, paidAmount: true, status: true, subcontractorId: true },
      });

      const totalBilled = allBills.reduce((acc, b) => acc + b.netPayable, 0);
      const totalPaid = allBills.reduce((acc, b) => acc + b.paidAmount, 0);
      const outstanding = Math.max(0, totalBilled - totalPaid);

      // Per-subcontractor breakdown
      const subBreakdown: Record<string, { name: string; billed: number; paid: number; outstanding: number; billCount: number }> = {};
      for (const b of allBills) {
        if (!subBreakdown[b.subcontractorId]) {
          subBreakdown[b.subcontractorId] = { name: "", billed: 0, paid: 0, outstanding: 0, billCount: 0 };
        }
        subBreakdown[b.subcontractorId].billed += b.netPayable;
        subBreakdown[b.subcontractorId].paid += b.paidAmount;
        subBreakdown[b.subcontractorId].outstanding = Math.max(0, subBreakdown[b.subcontractorId].billed - subBreakdown[b.subcontractorId].paid);
        subBreakdown[b.subcontractorId].billCount++;
      }

      // Hydrate subcontractor names
      const subIds = Object.keys(subBreakdown);
      if (subIds.length > 0) {
        const subs = await db.subcontractor.findMany({
          where: { id: { in: subIds } },
          select: { id: true, name: true },
        });
        for (const s of subs) {
          if (subBreakdown[s.id]) subBreakdown[s.id].name = s.name;
        }
      }

      return {
        bills,
        summary: { totalBilled, totalPaid, outstanding },
        subcontractorBreakdown: Object.values(subBreakdown),
      };
    }),

  /** Get a single subcontractor bill with line items. */
  get: protectedProcedure
    .input(z.object({ projectId: z.string(), billId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);

      const bill = await db.subcontractorBill.findFirst({
        where: { id: input.billId, projectId: input.projectId },
        include: {
          subcontractor: true,
          createdBy: { select: { id: true, name: true } },
          items: { orderBy: { id: "asc" } },
        },
      });

      if (!bill) throw new TRPCError({ code: "NOT_FOUND", message: "Bill not found." });
      return { bill };
    }),

  /** Create a new subcontractor bill with line items. */
  create: protectedProcedure.input(CreateBillSchema).mutation(async ({ ctx, input }) => {
    await assertCanWrite(ctx.user, input.projectId);

    // Validate subcontractor exists
    const sub = await db.subcontractor.findFirst({
      where: { id: input.subcontractorId, projectId: input.projectId },
    });
    if (!sub) throw new TRPCError({ code: "NOT_FOUND", message: "Subcontractor not found." });

    // Auto-generate bill number
    const count = await db.subcontractorBill.count({ where: { projectId: input.projectId } });
    const number = `SUB-BILL-${(count + 1).toString().padStart(3, "0")}`;

    const amounts = calculateBillAmounts({
      items: input.items,
      retentionPercent: input.retentionPercent ?? 10,
      vatPercent: input.vatPercent ?? 13,
      tdsPercent: input.tdsPercent ?? 1.5,
      materialDeduction: input.materialDeduction ?? 0,
      advanceRecovery: input.advanceRecovery ?? 0,
    });

    const bill = await db.$transaction(async (tx) => {
      const created = await tx.subcontractorBill.create({
        data: {
          projectId: input.projectId,
          subcontractorId: input.subcontractorId,
          number,
          period: input.period || null,
          grossAmount: amounts.grossAmount,
          retentionPercent: input.retentionPercent ?? 10,
          retentionAmount: amounts.retentionAmount,
          vatPercent: input.vatPercent ?? 13,
          vatAmount: amounts.vatAmount,
          tdsPercent: input.tdsPercent ?? 1.5,
          tdsAmount: amounts.tdsAmount,
          materialDeduction: input.materialDeduction ?? 0,
          advanceRecovery: input.advanceRecovery ?? 0,
          netPayable: amounts.netPayable,
          paidAmount: 0,
          status: "draft",
          notes: input.notes || null,
          createdById: ctx.user.id,
        },
      });

      // Create line items with cumulative qty tracking
      let cumQty = 0;
      for (const item of input.items) {
        cumQty += item.thisQty;
        await tx.subcontractorBillItem.create({
          data: {
            billId: created.id,
            boqCode: item.boqCode || null,
            description: item.description,
            unit: item.unit || null,
            contractQty: item.contractQty ?? 0,
            previousQty: item.previousQty ?? 0,
            thisQty: item.thisQty,
            cumQty,
            rate: item.rate,
            amount: item.thisQty * item.rate,
          },
        });
      }

      return created;
    });

    return { bill };
  }),

  /** Update bill fields and optionally replace line items. */
  update: protectedProcedure.input(UpdateBillSchema).mutation(async ({ ctx, input }) => {
    await assertCanWrite(ctx.user, input.projectId);

    const existing = await db.subcontractorBill.findFirst({
      where: { id: input.billId, projectId: input.projectId },
    });
    if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Bill not found." });
    if (existing.status !== "draft") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Only draft bills can be edited." });
    }

    const updated = await db.$transaction(async (tx) => {
      // If items provided, replace them
      let itemsForCalc: { thisQty: number; rate: number }[] = [];
      if (input.items) {
        await tx.subcontractorBillItem.deleteMany({ where: { billId: input.billId } });
        let cumQty = 0;
        for (const item of input.items) {
          cumQty += item.thisQty;
          await tx.subcontractorBillItem.create({
            data: {
              billId: input.billId,
              boqCode: item.boqCode || null,
              description: item.description,
              unit: item.unit || null,
              contractQty: item.contractQty ?? 0,
              previousQty: item.previousQty ?? 0,
              thisQty: item.thisQty,
              cumQty,
              rate: item.rate,
              amount: item.thisQty * item.rate,
            },
          });
        }
        itemsForCalc = input.items;
      } else {
        const existingItems = await tx.subcontractorBillItem.findMany({ where: { billId: input.billId } });
        itemsForCalc = existingItems.map((i) => ({ thisQty: i.thisQty, rate: i.rate }));
      }

      const retentionPct = input.retentionPercent ?? existing.retentionPercent;
      const vatPct = input.vatPercent ?? existing.vatPercent;
      const tdsPct = input.tdsPercent ?? existing.tdsPercent;
      const matDed = input.materialDeduction ?? existing.materialDeduction;
      const advRec = input.advanceRecovery ?? existing.advanceRecovery;

      const amounts = calculateBillAmounts({
        items: itemsForCalc,
        retentionPercent: retentionPct,
        vatPercent: vatPct,
        tdsPercent: tdsPct,
        materialDeduction: matDed,
        advanceRecovery: advRec,
      });

      return tx.subcontractorBill.update({
        where: { id: input.billId },
        data: {
          period: input.period !== undefined ? input.period : existing.period,
          retentionPercent: retentionPct,
          vatPercent: vatPct,
          tdsPercent: tdsPct,
          materialDeduction: matDed,
          advanceRecovery: advRec,
          grossAmount: amounts.grossAmount,
          retentionAmount: amounts.retentionAmount,
          vatAmount: amounts.vatAmount,
          tdsAmount: amounts.tdsAmount,
          netPayable: amounts.netPayable,
          notes: input.notes !== undefined ? input.notes : existing.notes,
        },
      });
    });

    return { bill: updated };
  }),

  /** Submit bill: draft → submitted. */
  submit: protectedProcedure
    .input(z.object({ projectId: z.string(), billId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertCanWrite(ctx.user, input.projectId);

      const bill = await db.subcontractorBill.findFirst({
        where: { id: input.billId, projectId: input.projectId },
      });
      if (!bill) throw new TRPCError({ code: "NOT_FOUND", message: "Bill not found." });
      if (bill.status !== "draft") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Only draft bills can be submitted." });
      }

      const updated = await db.subcontractorBill.update({
        where: { id: input.billId },
        data: { status: "submitted" },
      });

      return { bill: updated };
    }),

  /** Certify bill: submitted → certified (PM/Coordinator only). */
  certify: protectedProcedure
    .input(z.object({ projectId: z.string(), billId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertProjectAdmin(ctx.user, input.projectId);

      const bill = await db.subcontractorBill.findFirst({
        where: { id: input.billId, projectId: input.projectId },
      });
      if (!bill) throw new TRPCError({ code: "NOT_FOUND", message: "Bill not found." });
      if (bill.status !== "submitted") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Only submitted bills can be certified." });
      }

      const updated = await db.subcontractorBill.update({
        where: { id: input.billId },
        data: { status: "certified" },
      });

      return { bill: updated };
    }),

  /** Mark bill as paid: certified → paid, set paidAmount. */
  markPaid: protectedProcedure
    .input(z.object({ projectId: z.string(), billId: z.string(), amount: z.number().positive() }))
    .mutation(async ({ ctx, input }) => {
      await assertProjectAdmin(ctx.user, input.projectId);

      const bill = await db.subcontractorBill.findFirst({
        where: { id: input.billId, projectId: input.projectId },
      });
      if (!bill) throw new TRPCError({ code: "NOT_FOUND", message: "Bill not found." });
      if (bill.status !== "certified" && bill.status !== "paid") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Only certified bills can be marked as paid." });
      }

      const newPaidAmount = bill.paidAmount + input.amount;
      if (newPaidAmount > bill.netPayable + 0.01) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Payment amount exceeds net payable of NPR ${bill.netPayable.toLocaleString()}.`,
        });
      }

      const isFull = newPaidAmount >= bill.netPayable - 0.01;

      const updated = await db.subcontractorBill.update({
        where: { id: input.billId },
        data: {
          paidAmount: newPaidAmount,
          status: isFull ? "paid" : "certified",
        },
      });

      return { bill: updated, remaining: Math.max(0, bill.netPayable - newPaidAmount) };
    }),

  /** Delete a draft bill. */
  delete: protectedProcedure
    .input(z.object({ projectId: z.string(), billId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertCanWrite(ctx.user, input.projectId);

      const bill = await db.subcontractorBill.findFirst({
        where: { id: input.billId, projectId: input.projectId },
      });
      if (!bill) throw new TRPCError({ code: "NOT_FOUND", message: "Bill not found." });
      if (bill.status !== "draft") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Only draft bills can be deleted." });
      }

      await db.$transaction(async (tx) => {
        await tx.subcontractorBillItem.deleteMany({ where: { billId: input.billId } });
        await tx.subcontractorBill.delete({ where: { id: input.billId } });
      });

      return { success: true };
    }),
});
