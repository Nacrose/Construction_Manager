/**
 * tRPC router for Subcontractor Billing — BOQ-linked line items,
 * retention/VAT/TDS calculations, status workflow, and payment tracking.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "@/server/trpc";
import { db } from "@/lib/db";
import { assertProjectMember, assertCanWrite, assertProjectAdmin } from "@/lib/authz";
import { audit } from "@/lib/audit";
import { assertNotLocked } from "@/lib/fiscal-year-lock";
import { createJournalEntry } from "@/lib/journal-entry";

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
  retentionPercent: z.number().min(0).max(100).optional().default(10),
  vatPercent: z.number().min(0).max(100).optional().default(13),
  tdsPercent: z.number().min(0).max(100).optional().default(1.5),
  materialDeduction: z.number().nonnegative().optional().default(0),
  advanceRecovery: z.number().nonnegative().optional().default(0),
  notes: z.string().optional().nullable(),
  items: z.array(BillItemSchema).min(1),
});

const UpdateBillSchema = z.object({
  projectId: z.string(),
  billId: z.string(),
  period: z.string().optional().nullable(),
  retentionPercent: z.number().min(0).max(100).optional(),
  vatPercent: z.number().min(0).max(100).optional(),
  tdsPercent: z.number().min(0).max(100).optional(),
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

    // Auto-generate collision-free bill number
    const count = await db.subcontractorBill.count({ where: { projectId: input.projectId } });
    let nextIndex = count + 1;
    let number = `SUB-BILL-${nextIndex.toString().padStart(3, "0")}`;
    while (await db.subcontractorBill.findFirst({ where: { projectId: input.projectId, number } })) {
      nextIndex++;
      number = `SUB-BILL-${nextIndex.toString().padStart(3, "0")}`;
    }

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

      // Create line items with per-item cumulative qty tracking (previousQty + thisQty)
      for (const item of input.items) {
        const prev = item.previousQty ?? 0;
        const cumQty = prev + item.thisQty;
        await tx.subcontractorBillItem.create({
          data: {
            billId: created.id,
            boqCode: item.boqCode || null,
            description: item.description,
            unit: item.unit || null,
            contractQty: item.contractQty ?? 0,
            previousQty: prev,
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
        include: { subcontractor: { select: { id: true, name: true } } },
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
        for (const item of input.items) {
          const prev = item.previousQty ?? 0;
          const cumQty = prev + item.thisQty;
          await tx.subcontractorBillItem.create({
            data: {
              billId: input.billId,
              boqCode: item.boqCode || null,
              description: item.description,
              unit: item.unit || null,
              contractQty: item.contractQty ?? 0,
              previousQty: prev,
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
        include: { subcontractor: { select: { id: true, name: true } } },
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
        include: { subcontractor: { select: { id: true, name: true } } },
      });
      if (!bill) throw new TRPCError({ code: "NOT_FOUND", message: "Bill not found." });
      if (bill.status !== "submitted") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Only submitted bills can be certified." });
      }

      const updated = await db.subcontractorBill.update({
        where: { id: input.billId },
        data: { status: "certified" },
      });

      await audit({
        userId: ctx.user.id,
        projectId: input.projectId,
        action: "subcontractor.bill.certify",
        entityType: "subcontractor_bill",
        entityId: input.billId,
        metadata: { number: bill.number, certifiedNet: bill.netPayable },
      });

      return { bill: updated };
    }),

  /** Mark bill as paid: certified → paid, set paidAmount. */
  markPaid: protectedProcedure
    .input(z.object({ projectId: z.string(), billId: z.string(), amount: z.number().positive() }))
    .mutation(async ({ ctx, input }) => {
      await assertNotLocked(ctx.user.organizationId);
      await assertProjectAdmin(ctx.user, input.projectId);

      const bill = await db.subcontractorBill.findFirst({
        where: { id: input.billId, projectId: input.projectId },
        include: { subcontractor: { select: { id: true, name: true } } },
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
      const newStatus = isFull ? "paid" : "certified";

      // Atomic increment to avoid lost-update race on concurrent payments.
      // Previously this used `bill.paidAmount + input.amount` (read-then-write)
      // — two concurrent markPaid calls would race and one payment would be lost.
      await db.$executeRaw`
        UPDATE "SubcontractorBill"
        SET "paidAmount" = "paidAmount" + ${input.amount},
            "status" = ${newStatus}
        WHERE "id" = ${input.billId}
      `;

      // Generate journal entry for subcontractor payment:
      // Dr Subcontractor Payable (2002) NPR input.amount
      //    Cr Bank / Cash (1010/1001) NPR input.amount
      const subName = bill.subcontractor?.name || "Subcontractor";
      const bankCode = "1010"; // subcontractor payments are typically bank
      await createJournalEntry(db, {
        source: "subcontractor_bill",
        sourceRefId: input.billId,
        sourceRefType: "SubcontractorBill",
        description: `Subcontractor payment to ${subName} — ${bill.number}`,
        entryDate: new Date(),
        postedById: ctx.user.id,
        lines: [
          {
            accountCode: "2002",
            accountName: "Subcontractor Payables",
            debit: input.amount,
            credit: 0,
            description: `Payment to ${subName}`,
            projectId: input.projectId,
            partnerId: bill.subcontractor?.id,
          },
          {
            accountCode: bankCode,
            accountName: "Bank",
            debit: 0,
            credit: input.amount,
            description: `Payment via bank transfer`,
            projectId: input.projectId,
          },
        ],
      });

      const updated = await db.subcontractorBill.findUniqueOrThrow({
        where: { id: input.billId },
      });

      await audit({
        userId: ctx.user.id,
        projectId: input.projectId,
        action: "subcontractor.bill.pay",
        entityType: "subcontractor_bill",
        entityId: input.billId,
        metadata: { number: bill.number, amount: input.amount, newPaidAmount: updated.paidAmount, isFull },
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
        include: { subcontractor: { select: { id: true, name: true } } },
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

  /** Master Multi-Package Subcontractor Reconciliation Matrix across BOQ and Client IPCs */
  getReconciliationMatrix: protectedProcedure
    .input(z.object({ projectId: z.string(), q: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);

      const [boqItems, subcontractors, billItems, ipcItems] = await Promise.all([
        db.boqItem.findMany({
          where: {
            projectId: input.projectId,
            ...(input.q ? {
              OR: [
                { code: { contains: input.q, mode: "insensitive" } },
                { description: { contains: input.q, mode: "insensitive" } },
              ],
            } : {}),
          },
          orderBy: { code: "asc" },
          select: {
            id: true,
            code: true,
            description: true,
            unit: true,
            quantity: true,
            rate: true,
            amount: true,
          },
        }),
        db.subcontractor.findMany({
          where: { projectId: input.projectId, status: "active" },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        }),
        db.subcontractorBillItem.findMany({
          where: {
            bill: {
              projectId: input.projectId,
              status: { in: ["submitted", "verified", "certified", "paid"] },
            },
          },
          include: {
            bill: {
              select: {
                id: true,
                number: true,
                subcontractorId: true,
                status: true,
              },
            },
          },
        }),
        db.ipcItem.findMany({
          where: {
            ipc: {
              projectId: input.projectId,
              status: { in: ["submitted", "approved", "certified", "paid"] },
            },
          },
          select: {
            boqCode: true,
            description: true,
            thisQty: true,
            cumQty: true,
            rate: true,
            amount: true,
          },
        }),
      ]);

      // Map IPC latest certified cumulative quantities by boqCode / description
      const ipcMap = new Map<string, { cumQty: number; cumAmount: number }>();
      for (const item of ipcItems) {
        const itemCumAmount = (item.cumQty || 0) * (item.rate || 0);
        const entry = { cumQty: item.cumQty || 0, cumAmount: itemCumAmount };
        if (item.boqCode && item.boqCode.trim()) {
          const k = item.boqCode.trim().toLowerCase();
          const prev = ipcMap.get(k) || { cumQty: 0, cumAmount: 0 };
          ipcMap.set(k, { cumQty: Math.max(prev.cumQty, entry.cumQty), cumAmount: Math.max(prev.cumAmount, entry.cumAmount) });
        }
        if (item.description && item.description.trim()) {
          const k = item.description.trim().toLowerCase();
          const prev = ipcMap.get(k) || { cumQty: 0, cumAmount: 0 };
          ipcMap.set(k, { cumQty: Math.max(prev.cumQty, entry.cumQty), cumAmount: Math.max(prev.cumAmount, entry.cumAmount) });
        }
      }

      // Group Subcontractor claims by BOQ Code & SubcontractorId
      const subClaimsMap = new Map<string, Map<string, { qty: number; amount: number; rate: number; count: number }>>();
      for (const item of billItems) {
        const subId = item.bill.subcontractorId;
        const verifiedOrClaimedQty = item.verifiedQty !== null && item.verifiedQty !== undefined ? item.verifiedQty : item.thisQty;
        const verifiedOrClaimedAmount = verifiedOrClaimedQty * item.rate;

        const keysToSet: string[] = [];
        if (item.boqCode && item.boqCode.trim()) keysToSet.push(item.boqCode.trim().toLowerCase());
        else if (item.description && item.description.trim()) keysToSet.push(item.description.trim().toLowerCase());

        for (const k of keysToSet) {
          if (!subClaimsMap.has(k)) {
            subClaimsMap.set(k, new Map());
          }
          const subMap = subClaimsMap.get(k)!;
          const prev = subMap.get(subId) || { qty: 0, amount: 0, rate: 0, count: 0 };
          subMap.set(subId, {
            qty: prev.qty + verifiedOrClaimedQty,
            amount: prev.amount + verifiedOrClaimedAmount,
            rate: item.rate,
            count: prev.count + 1,
          });
        }
      }

      // Build the Master Cross-Grid Rows
      const rows = boqItems.map((boq) => {
        const codeKey = (boq.code || "").trim().toLowerCase();
        const descKey = (boq.description || "").trim().toLowerCase();
        const subMap = (codeKey ? subClaimsMap.get(codeKey) : null) || (descKey ? subClaimsMap.get(descKey) : null) || new Map();
        const ipc = (codeKey ? ipcMap.get(codeKey) : null) || (descKey ? ipcMap.get(descKey) : null) || { cumQty: 0, cumAmount: 0 };

        let totalSubQty = 0;
        let totalSubAmount = 0;
        const subBreakdown: Record<string, { qty: number; amount: number; rate: number }> = {};

        for (const sub of subcontractors) {
          const claim = subMap.get(sub.id) || { qty: 0, amount: 0, rate: 0 };
          subBreakdown[sub.id] = {
            qty: claim.qty,
            amount: claim.amount,
            rate: claim.rate,
          };
          totalSubQty += claim.qty;
          totalSubAmount += claim.amount;
        }

        const balanceQty = boq.quantity - totalSubQty;
        const balanceAmount = boq.amount - totalSubAmount;
        const avgSubRate = totalSubQty > 0 ? totalSubAmount / totalSubQty : 0;
        const marginGain = totalSubQty > 0 ? (boq.rate - avgSubRate) * totalSubQty : 0;

        let status: "ok" | "exceeds_boq" | "exceeds_ipc" | "not_started" = "ok";
        if (totalSubQty === 0) {
          status = "not_started";
        } else if (totalSubQty > boq.quantity + 0.001) {
          status = "exceeds_boq"; // Over-scope claim
        } else if (ipc.cumQty > 0 && totalSubQty > ipc.cumQty + 0.001) {
          status = "exceeds_ipc"; // Sub billed faster than Client IPC certified
        }

        return {
          boqId: boq.id,
          boqCode: boq.code,
          description: boq.description,
          unit: boq.unit,
          boqQty: boq.quantity,
          boqRate: boq.rate,
          boqAmount: boq.amount,
          ipcQty: ipc.cumQty,
          ipcAmount: ipc.cumAmount,
          subBreakdown,
          totalSubQty,
          totalSubAmount,
          balanceQty,
          balanceAmount,
          avgSubRate,
          marginGain,
          status,
        };
      });

      // Overall Summary
      const totalBoqAmount = boqItems.reduce((sum, b) => sum + b.amount, 0);
      const totalIpcAmount = rows.reduce((sum, r) => sum + r.ipcAmount, 0);
      const totalSubcontractorAmount = rows.reduce((sum, r) => sum + r.totalSubAmount, 0);
      const totalMarginGain = rows.reduce((sum, r) => sum + (r.marginGain > 0 ? r.marginGain : 0), 0);
      const overClaimCount = rows.filter((r) => r.status === "exceeds_boq").length;
      const exceedsIpcCount = rows.filter((r) => r.status === "exceeds_ipc").length;

      return {
        subcontractors,
        rows,
        summary: {
          totalBoqAmount,
          totalIpcAmount,
          totalSubcontractorAmount,
          totalMarginGain,
          overClaimCount,
          exceedsIpcCount,
          totalItems: boqItems.length,
        },
      };
    }),

  /** Engineer Line-Item Verification & Certification */
  verifyBill: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        billId: z.string(),
        action: z.enum(["verify", "certify", "dispute"]),
        notes: z.string().optional(),
        items: z.array(
          z.object({
            id: z.string(),
            verifiedQty: z.number().nonnegative(),
            disallowedReason: z.string().optional(),
            remarks: z.string().optional(),
          })
        ),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertProjectAdmin(ctx.user, input.projectId);

      const bill = await db.subcontractorBill.findFirst({
        where: { id: input.billId, projectId: input.projectId },
        include: { subcontractor: { select: { id: true, name: true } }, items: true },
      });
      if (!bill) throw new TRPCError({ code: "NOT_FOUND", message: "Bill not found." });

      const updated = await db.$transaction(async (tx) => {
        let verifiedGross = 0;

        for (const itemInput of input.items) {
          const original = bill.items.find((i) => i.id === itemInput.id);
          if (!original) continue;

          const verifiedQty = itemInput.verifiedQty;
          const disallowedQty = Math.max(0, original.thisQty - verifiedQty);
          const verifiedAmount = verifiedQty * original.rate;
          verifiedGross += verifiedAmount;

          await tx.subcontractorBillItem.update({
            where: { id: itemInput.id },
            data: {
              verifiedQty,
              verifiedAmount,
              disallowedQty,
              disallowedReason: itemInput.disallowedReason || null,
              remarks: itemInput.remarks || null,
            },
          });
        }

        // Recalculate financial breakdown based on verified gross.
        // IMPORTANT: recompute materialDeduction from the CURRENT set of
        // debitable material transactions — don't use the stale stored
        // value. If materials were added or marked debitable after the
        // bill was created, the stored materialDeduction would be wrong.
        let currentMaterialDeduction = 0;
        if (bill.subcontractorId) {
          const subTxns = await tx.materialTransaction.findMany({
            where: {
              projectId: input.projectId,
              subcontractorId: bill.subcontractorId,
              isDebitable: true,
              deductedInIpcId: null,
            },
          });
          currentMaterialDeduction = subTxns.reduce(
            (sum, t) => sum + (t.quantity * (t.recoveryRate ?? t.rate)),
            0,
          );
        }

        const retentionAmount = (verifiedGross * bill.retentionPercent) / 100;
        const vatAmount = (verifiedGross * bill.vatPercent) / 100;
        const tdsAmount = (verifiedGross * bill.tdsPercent) / 100;
        const verifiedNet = Math.max(
          0,
          verifiedGross - retentionAmount + vatAmount - tdsAmount - currentMaterialDeduction - bill.advanceRecovery
        );

        let newStatus = bill.status;
        if (input.action === "verify") newStatus = "verified";
        if (input.action === "certify") newStatus = "certified";
        if (input.action === "dispute") newStatus = "disputed";

        return tx.subcontractorBill.update({
          where: { id: input.billId },
          data: {
            verifiedGross,
            verifiedNet,
            grossAmount: input.action === "certify" ? verifiedGross : bill.grossAmount,
            retentionAmount: input.action === "certify" ? retentionAmount : bill.retentionAmount,
            vatAmount: input.action === "certify" ? vatAmount : bill.vatAmount,
            tdsAmount: input.action === "certify" ? tdsAmount : bill.tdsAmount,
            // Update materialDeduction with the fresh computation.
            materialDeduction: currentMaterialDeduction,
            netPayable: input.action === "certify" ? verifiedNet : bill.netPayable,
            status: newStatus,
            verifiedById: ctx.user.id,
            verifiedAt: new Date(),
            ...(input.action === "certify" ? { certifiedById: ctx.user.id, certifiedAt: new Date() } : {}),
            notes: input.notes !== undefined ? input.notes : bill.notes,
          },
          include: { items: true },
        });
      });

      await audit({
        userId: ctx.user.id,
        projectId: input.projectId,
        action: "subcontractor.bill.verify",
        entityType: "subcontractor_bill",
        entityId: input.billId,
        metadata: { number: bill.number, action: input.action, verifiedGross: updated.verifiedGross, verifiedNet: updated.verifiedNet },
      });

      return { bill: updated };
    }),

  /** Subcontractor Material Issue, Return & Theoretical Reconciliation Statement */
  getSubcontractorMaterialReconciliation: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        subcontractorId: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);

      const [transactions, subBills, materials] = await Promise.all([
        db.materialTransaction.findMany({
          where: {
            projectId: input.projectId,
            subcontractorId: input.subcontractorId,
          },
          include: {
            material: { select: { id: true, name: true, unit: true, currentStock: true } },
          },
          orderBy: { date: "asc" },
        }),
        db.subcontractorBill.findMany({
          where: {
            projectId: input.projectId,
            subcontractorId: input.subcontractorId,
            status: { in: ["submitted", "verified", "certified", "paid"] },
          },
          include: {
            items: true,
          },
        }),
        db.material.findMany({
          where: { projectId: input.projectId },
          select: { id: true, name: true, unit: true, currentStock: true },
        }),
      ]);

      // Aggregate issues and returns per material
      const materialMap = new Map<string, {
        materialId: string;
        name: string;
        unit: string;
        issuedQty: number;
        returnedQty: number;
        netIssuedQty: number;
        recoveryRate: number;
        transactions: Array<{
          id: string;
          type: string;
          quantity: number;
          rate: number;
          date: Date;
          reference: string | null;
          remarks: string | null;
        }>;
      }>();

      for (const t of transactions) {
        const matId = t.materialId;
        if (!materialMap.has(matId)) {
          materialMap.set(matId, {
            materialId: matId,
            name: t.material.name,
            unit: t.material.unit,
            issuedQty: 0,
            returnedQty: 0,
            netIssuedQty: 0,
            recoveryRate: t.recoveryRate || t.rate || 0,
            transactions: [],
          });
        }
        const entry = materialMap.get(matId)!;
        if (t.type === "issue") {
          entry.issuedQty += t.quantity;
        } else if (t.type === "receive" || t.type === "return" || t.type === "adjustment") {
          entry.returnedQty += t.quantity;
        }
        entry.netIssuedQty = Math.max(0, entry.issuedQty - entry.returnedQty);
        if (t.recoveryRate && t.recoveryRate > 0) entry.recoveryRate = t.recoveryRate;

        entry.transactions.push({
          id: t.id,
          type: t.type,
          quantity: t.quantity,
          rate: t.recoveryRate || t.rate || 0,
          date: t.date,
          reference: t.reference,
          remarks: t.remarks,
        });
      }

      // Theoretical material consumption from billed BOQ items & ingredients
      const allBilledItems = subBills.flatMap((b) => b.items);
      const boqCodes = [...new Set(allBilledItems.map((i) => i.boqCode).filter(Boolean))];

      const boqIngredients = await db.boqItem.findMany({
        where: {
          projectId: input.projectId,
          code: { in: boqCodes as string[] },
        },
        include: {
          ingredients: {
            where: { type: "material" },
          },
        },
      });

      const theoreticalMap = new Map<string, number>();
      for (const billItem of allBilledItems) {
        if (!billItem.boqCode) continue;
        const boq = boqIngredients.find((b) => b.code === billItem.boqCode);
        if (!boq) continue;

        const qty = billItem.verifiedQty !== null && billItem.verifiedQty !== undefined ? billItem.verifiedQty : billItem.thisQty;
        for (const ing of boq.ingredients) {
          const key = ing.name.trim().toLowerCase();
          const req = qty * ing.quantity;
          theoreticalMap.set(key, (theoreticalMap.get(key) || 0) + req);
        }
      }

      // Build statement rows
      let totalDebitDeduction = 0;
      const statement = Array.from(materialMap.values()).map((item) => {
        const normName = item.name.trim().toLowerCase();
        let theoreticalReq = theoreticalMap.get(normName) || 0;
        if (theoreticalReq === 0) {
          for (const [tKey, tVal] of theoreticalMap.entries()) {
            if (normName.includes(tKey) || tKey.includes(normName)) {
              theoreticalReq = tVal;
              break;
            }
          }
        }
        const allowedWastage = theoreticalReq * 0.02; // 2% permissible tolerance
        const totalAllowed = theoreticalReq + allowedWastage;
        const excessQty = Math.max(0, item.netIssuedQty - totalAllowed);
        const debitAmount = excessQty * item.recoveryRate;
        totalDebitDeduction += debitAmount;

        return {
          ...item,
          theoreticalReq: Math.round(theoreticalReq * 100) / 100,
          allowedWastage: Math.round(allowedWastage * 100) / 100,
          excessQty: Math.round(excessQty * 100) / 100,
          debitAmount: Math.round(debitAmount),
          status: excessQty > 0 ? ("excess_wastage" as const) : ("balanced" as const),
        };
      });

      return {
        statement,
        totalDebitDeduction: Math.round(totalDebitDeduction),
        totalMaterialsTracked: statement.length,
        allProjectMaterials: materials,
      };
    }),
});
