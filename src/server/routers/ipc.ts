/**
 * tRPC router for Interim Payment Certificates (IPCs) and line items.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "@/server/trpc";
import {db} from "@/lib/db";
import { assertProjectMember, assertCanWrite } from "@/lib/authz";
import { audit } from "@/lib/audit";
import { notifyProject } from "@/server/utils/notify";

// ─── Zod schemas ───────────────────────────────────────────────

const CreateIpcSchema = z.object({
  projectId: z.string(),
  number: z.string().min(1),
  period: z.string().optional().nullable(),
  retention: z.number().min(0).max(100).default(0),
  advanceRecovery: z.number().min(0).default(0),
  subcontractorId: z.string().optional().nullable(),
  boqVersionId: z.string().optional().nullable(),
  vatPercent: z.number().min(0).max(100).optional(),
  tdsPercent: z.number().min(0).max(100).optional(),
});

const UpdateIpcSchema = z.object({
  ipcId: z.string(),
  period: z.string().nullable().optional(),
  status: z.enum(["draft", "submitted", "certified", "approved", "paid"]).optional(),
  retention: z.number().min(0).max(100).optional(),
  advanceRecovery: z.number().min(0).optional(),
  vatPercent: z.number().min(0).max(100).optional(),
  tdsPercent: z.number().min(0).max(100).optional(),
  taxInvoiceNo: z.string().nullable().optional(),
  taxInvoiceDate: z.string().nullable().optional(),
  clientPan: z.string().nullable().optional(),
  clientName: z.string().nullable().optional(),
  contractAgreementDate: z.string().nullable().optional(),
  workCommenceDate: z.string().nullable().optional(),
  contractCompletionDate: z.string().nullable().optional(),
  originalContractAmountWithoutVat: z.number().nullable().optional(),
  originalContractAmountWithVat: z.number().nullable().optional(),
  mobilizationAdvanceTotal: z.number().nullable().optional(),
  mobilizationAdvanceDeducted: z.number().nullable().optional(),
  mobilizationAdvanceRate: z.number().nullable().optional(),
  submittedBy: z.string().nullable().optional(),
  submittedByLocation: z.string().nullable().optional(),
  checkedBy: z.string().nullable().optional(),
  checkedByLocation: z.string().nullable().optional(),
  approvedBy: z.string().nullable().optional(),
  approvedByLocation: z.string().nullable().optional(),
  previousGrossAmount: z.number().nullable().optional(),
  previousVatAmount: z.number().nullable().optional(),
  previousAdvanceRecovery: z.number().nullable().optional(),
  previousRetentionAmount: z.number().nullable().optional(),
  previousTdsAmount: z.number().nullable().optional(),
  scannedBillUrl: z.string().nullable().optional(),
  scannedBillName: z.string().nullable().optional(),
  isBillAttached: z.boolean().optional(),
});

const UpdateIpcItemSchema = z.object({
  ipcId: z.string(),
  itemId: z.string(),
  thisQty: z.number().min(0).optional(),
  previousQty: z.number().min(0).optional(),
  section: z.string().nullable().optional(),
});

// Helper: recalculate gross, retention, deductions, net payable for an IPC
async function recalculateIpc(tx: any, ipcId: string) {
  const ipc = await tx.ipc.findUnique({
    where: { id: ipcId },
    select: { projectId: true, retention: true, advanceRecovery: true, subcontractorId: true, vatPercent: true, tdsPercent: true },
  });
  if (!ipc) return;

  const items = await tx.ipcItem.findMany({ where: { ipcId } });
  const gross = items.reduce((s: number, i: any) => s + i.amount, 0);
  const retentionAmount = (gross * ipc.retention) / 100;

  let materialDeductions = 0;
  if (ipc.subcontractorId) {
    const txns = await tx.materialTransaction.findMany({
      where: { projectId: ipc.projectId, subcontractorId: ipc.subcontractorId, isDebitable: true },
    });
    materialDeductions = txns.reduce((sum: number, t: any) => sum + (t.quantity * (t.recoveryRate ?? t.rate)), 0);
  }

  // Tax calculations
  const vatAmount = (gross * (ipc.vatPercent || 0)) / 100;
  const totalWithVat = gross + vatAmount;
  const tdsAmount = (gross * (ipc.tdsPercent || 0)) / 100;
  const netPayable = gross - retentionAmount - ipc.advanceRecovery - materialDeductions;
  const finalPayable = totalWithVat - retentionAmount - ipc.advanceRecovery - materialDeductions - tdsAmount;

  await tx.ipc.update({
    where: { id: ipcId },
    data: { grossAmount: gross, retentionAmount, netPayable, vatAmount, totalWithVat, tdsAmount, finalPayable },
  });
}

// ─── Router ────────────────────────────────────────────────────

export const ipcRouter = router({
  /** List all IPCs for a project. */
  list: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);
      const ipcs = await db.ipc.findMany({
        where: { projectId: input.projectId },
        orderBy: { createdAt: "desc" },
        include: {
          _count: { select: { items: true } },
          subcontractor: { select: { name: true } },
        },
      });
      return { ipcs };
    }),

  /** Create a new IPC. */
  create: protectedProcedure
    .input(CreateIpcSchema)
    .mutation(async ({ ctx, input }) => {
      await assertCanWrite(ctx.user, input.projectId);

      const dup = await db.ipc.findUnique({
        where: { projectId_number: { projectId: input.projectId, number: input.number } },
        select: { id: true },
      });
      if (dup) {
        throw new TRPCError({ code: "CONFLICT", message: "IPC number already exists." });
      }

      const ipc = await db.ipc.create({
        data: {
          projectId: input.projectId,
          number: input.number,
          period: input.period,
          retention: input.retention,
          advanceRecovery: input.advanceRecovery,
          subcontractorId: input.subcontractorId || null,
          boqVersionId: input.boqVersionId || null,
          vatPercent: input.vatPercent ?? 13,
          tdsPercent: input.tdsPercent ?? 1.5,
        },
        include: {
          subcontractor: { select: { name: true } },
          boqVersion: { select: { versionNumber: true } },
        },
      });

      return { ipc };
    }),

  /** Update settings of an IPC. */
  update: protectedProcedure
    .input(UpdateIpcSchema)
    .mutation(async ({ ctx, input }) => {
      const { ipcId, ...data } = input;
      const item = await db.ipc.findUnique({
        where: { id: ipcId },
        select: { projectId: true, subcontractorId: true },
      });
      if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "IPC not found." });
      await assertCanWrite(ctx.user, item.projectId);

      const updateData: Record<string, any> = {};
      for (const [k, v] of Object.entries(data)) {
        if (v !== undefined) {
          if (k.endsWith("Date") && v) {
            updateData[k] = new Date(v as string);
          } else {
            updateData[k] = v;
          }
        }
      }

      if (data.status === "approved" || data.status === "paid") {
        updateData.issueDate = new Date();
      }

      if (data.scannedBillUrl) {
        updateData.isBillAttached = true;
      }

      const final = await db.$transaction(async (tx) => {
        const _updated = await tx.ipc.update({
          where: { id: ipcId },
          data: updateData,
          include: { items: true, subcontractor: { select: { name: true } } },
        });
        await recalculateIpc(tx, ipcId);
        return tx.ipc.findUnique({
          where: { id: ipcId },
          include: { items: true, subcontractor: { select: { name: true } } },
        });
      });

      return { ipc: final };
    }),

  /** Nepal Standard Summary of Payment Sheet */
  getPaymentSummary: protectedProcedure
    .input(z.object({ ipcId: z.string() }))
    .query(async ({ ctx, input }) => {
      const ipc = await db.ipc.findUnique({
        where: { id: input.ipcId },
        include: {
          project: { select: { name: true, client: true, location: true } },
          subcontractor: { select: { name: true, pan: true } },
          items: true,
        },
      });
      if (!ipc) throw new TRPCError({ code: "NOT_FOUND", message: "IPC not found." });
      await assertProjectMember(ctx.user, ipc.projectId);

      // Previous IPCs
      const prevIpcs = await db.ipc.findMany({
        where: {
          projectId: ipc.projectId,
          subcontractorId: ipc.subcontractorId,
          createdAt: { lt: ipc.createdAt },
          status: { in: ["approved", "paid", "certified"] },
        },
        orderBy: { createdAt: "asc" },
      });

      const autoPrevGross = prevIpcs.reduce((s, p) => s + p.grossAmount, 0);
      const autoPrevVat = prevIpcs.reduce((s, p) => s + (p.vatAmount || 0), 0);
      const autoPrevAdvance = prevIpcs.reduce((s, p) => s + (p.advanceRecovery || 0), 0);
      const autoPrevRetention = prevIpcs.reduce((s, p) => s + (p.retentionAmount || 0), 0);
      const autoPrevTds = prevIpcs.reduce((s, p) => s + (p.tdsAmount || 0), 0);

      const prevGross = ipc.previousGrossAmount > 0 ? ipc.previousGrossAmount : autoPrevGross;
      const prevVat = ipc.previousVatAmount > 0 ? ipc.previousVatAmount : autoPrevVat;
      const prevAdvance = ipc.previousAdvanceRecovery > 0 ? ipc.previousAdvanceRecovery : autoPrevAdvance;
      const prevRetention = ipc.previousRetentionAmount > 0 ? ipc.previousRetentionAmount : autoPrevRetention;
      const prevTds = ipc.previousTdsAmount > 0 ? ipc.previousTdsAmount : autoPrevTds;

      const prevTotalBill = prevGross + prevVat;
      const prevTotalDeductions = prevAdvance + prevRetention + prevTds;
      const prevNetPayable = prevTotalBill - prevTotalDeductions;

      const thisGross = ipc.grossAmount;
      const thisVat = ipc.vatAmount || (thisGross * (ipc.vatPercent || 13)) / 100;
      const thisTotalBill = thisGross + thisVat;
      const thisAdvance = ipc.advanceRecovery;
      const thisRetention = ipc.retentionAmount || (thisGross * (ipc.retention || 5)) / 100;
      const thisTds = ipc.tdsAmount || (thisGross * (ipc.tdsPercent || 1.5)) / 100;
      const thisTotalDeductions = thisAdvance + thisRetention + thisTds;
      const thisNetPayable = thisTotalBill - thisTotalDeductions;

      const cumGross = prevGross + thisGross;
      const cumVat = prevVat + thisVat;
      const cumTotalBill = prevTotalBill + thisTotalBill;
      const cumAdvance = prevAdvance + thisAdvance;
      const cumRetention = prevRetention + thisRetention;
      const cumTds = prevTds + thisTds;
      const cumTotalDeductions = prevTotalDeductions + thisTotalDeductions;
      const cumNetPayable = prevNetPayable + thisNetPayable;

      const contractWithoutVat = ipc.originalContractAmountWithoutVat || (cumGross > 0 ? cumGross / 0.7578 : 35906434.20);
      const progressPct = contractWithoutVat > 0 ? (cumGross / contractWithoutVat) * 100 : 0;

      return {
        ipc,
        summary: {
          contractWithoutVat,
          contractWithVat: ipc.originalContractAmountWithVat || contractWithoutVat * 1.13,
          mobilizationPaid: ipc.mobilizationAdvanceTotal || 7181286.84,
          mobilizationDeducted: cumAdvance,
          mobilizationBalance: Math.max(0, (ipc.mobilizationAdvanceTotal || 7181286.84) - cumAdvance),
          progressPct,
          prev: {
            gross: prevGross,
            vat: prevVat,
            totalBill: prevTotalBill,
            advance: prevAdvance,
            retention: prevRetention,
            tds: prevTds,
            totalDeductions: prevTotalDeductions,
            netPayable: prevNetPayable,
          },
          thisPeriod: {
            gross: thisGross,
            vat: thisVat,
            totalBill: thisTotalBill,
            advance: thisAdvance,
            retention: thisRetention,
            tds: thisTds,
            totalDeductions: thisTotalDeductions,
            netPayable: thisNetPayable,
          },
          cumulative: {
            gross: cumGross,
            vat: cumVat,
            totalBill: cumTotalBill,
            advance: cumAdvance,
            retention: cumRetention,
            tds: cumTds,
            totalDeductions: cumTotalDeductions,
            netPayable: cumNetPayable,
          },
        },
      };
    }),

  /** Delete a draft IPC. */
  delete: protectedProcedure
    .input(z.object({ ipcId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const item = await db.ipc.findUnique({
        where: { id: input.ipcId },
        select: { projectId: true, status: true },
      });
      if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "IPC not found." });
      if (item.status !== "draft") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Only draft IPCs can be deleted." });
      }
      await assertCanWrite(ctx.user, item.projectId);

      await db.ipc.delete({ where: { id: input.ipcId } });
      return { ok: true };
    }),

  /** List all line items of an IPC. */
  listItems: protectedProcedure
    .input(z.object({ ipcId: z.string() }))
    .query(async ({ ctx, input }) => {
      const ipc = await db.ipc.findUnique({
        where: { id: input.ipcId },
        include: { subcontractor: { select: { name: true } }, boqVersion: { select: { id: true, versionNumber: true, status: true } } },
      });
      if (!ipc) throw new TRPCError({ code: "NOT_FOUND", message: "IPC not found." });
      await assertProjectMember(ctx.user, ipc.projectId);

      const items = await db.ipcItem.findMany({
        where: { ipcId: input.ipcId },
        orderBy: { sortOrder: "asc" },
      });

      // Calculate subcontractor material deductions
      let materialDeductions = 0;
      if (ipc.subcontractorId) {
        const txns = await db.materialTransaction.findMany({
          where: { projectId: ipc.projectId, subcontractorId: ipc.subcontractorId, isDebitable: true },
        });
        materialDeductions = txns.reduce((sum, t) => sum + (t.quantity * (t.recoveryRate ?? t.rate)), 0);
      }

      return { ipc, items, materialDeductions };
    }),

  /** Update a line item of an IPC (thisQty, previousQty, section). */
  updateItem: protectedProcedure
    .input(UpdateIpcItemSchema)
    .mutation(async ({ ctx, input }) => {
      const ipc = await db.ipc.findUnique({
        where: { id: input.ipcId },
        select: { id: true, projectId: true, status: true, retention: true, advanceRecovery: true, subcontractorId: true },
      });
      if (!ipc) throw new TRPCError({ code: "NOT_FOUND", message: "IPC not found." });
      await assertCanWrite(ctx.user, ipc.projectId);

      const existing = await db.ipcItem.findUnique({ where: { id: input.itemId } });
      if (!existing || existing.ipcId !== input.ipcId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Line item not found." });
      }

      const thisQty = input.thisQty ?? existing.thisQty;
      const previousQty = input.previousQty ?? existing.previousQty;
      const cumQty = previousQty + thisQty;
      const amount = thisQty * existing.rate;

      const final = await db.$transaction(async (tx) => {
        await tx.ipcItem.update({
          where: { id: input.itemId },
          data: {
            ...(input.thisQty !== undefined && { thisQty }),
            ...(input.previousQty !== undefined && { previousQty }),
            ...(input.section !== undefined && { section: input.section }),
            cumQty,
            amount,
          },
        });
        await recalculateIpc(tx, input.ipcId);
        return tx.ipc.findUnique({
          where: { id: input.ipcId },
          include: { subcontractor: { select: { name: true } } },
        });
      });

      // Calculate subcontractor material deductions
      let materialDeductions = 0;
      if (ipc.subcontractorId) {
        const txns = await db.materialTransaction.findMany({
          where: { projectId: ipc.projectId, subcontractorId: ipc.subcontractorId, isDebitable: true },
        });
        materialDeductions = txns.reduce((sum, t) => sum + (t.quantity * (t.recoveryRate ?? t.rate)), 0);
      }

      return { ipc: final, materialDeductions };
    }),

  /** Pull all BOQ items into an IPC. */
  loadBoq: protectedProcedure
    .input(z.object({ ipcId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const ipc = await db.ipc.findUnique({
        where: { id: input.ipcId },
        select: { id: true, projectId: true, number: true, subcontractorId: true },
      });
      if (!ipc) throw new TRPCError({ code: "NOT_FOUND", message: "IPC not found." });
      await assertCanWrite(ctx.user, ipc.projectId);

      const boqItems = await db.boqItem.findMany({
        where: { projectId: ipc.projectId },
        orderBy: { sortOrder: "asc" },
      });

      if (boqItems.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No BOQ items found for this project." });
      }

      await db.$transaction(async (tx) => {
        await tx.ipcItem.deleteMany({ where: { ipcId: input.ipcId } });
        await tx.ipcItem.createMany({
          data: boqItems.map((b, i) => ({
            ipcId: input.ipcId,
            boqCode: b.code,
            description: b.description,
            unit: b.unit,
            section: b.section ?? b.category ?? "Uncategorized",
            contractQty: b.quantity,
            previousQty: 0,
            thisQty: 0,
            cumQty: 0,
            rate: b.rate,
            amount: 0,
            sortOrder: i,
          })),
        });
        await recalculateIpc(tx, input.ipcId);
      });

      await audit({
        userId: ctx.user.id,
        projectId: ipc.projectId,
        action: "ipc.load_boq",
        entityType: "ipc",
        entityId: input.ipcId,
        metadata: { number: ipc.number, boqItemCount: boqItems.length },
      });

      return { loaded: boqItems.length };
    }),

  /**
   * Tax summary — aggregates VAT and TDS across all IPCs for a project,
   * optionally filtered by status or date range.
   *
   * Returns totals + per-IPC breakdown + monthly trend.
   */
  taxSummary: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      fromDate: z.string().datetime().optional(),
      toDate: z.string().datetime().optional(),
      status: z.enum(["draft", "submitted", "certified", "approved", "paid"]).optional(),
    }))
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);

      const where: any = { projectId: input.projectId };
      if (input.status) where.status = input.status;
      if (input.fromDate || input.toDate) {
        where.issueDate = {};
        if (input.fromDate) where.issueDate.gte = new Date(input.fromDate);
        if (input.toDate) where.issueDate.lte = new Date(input.toDate);
      }

      const ipcs = await db.ipc.findMany({
        where,
        include: {
          subcontractor: { select: { name: true } },
          _count: { select: { items: true } },
        },
        orderBy: { createdAt: "desc" },
      });

      const totalGross = ipcs.reduce((s, i) => s + i.grossAmount, 0);
      const totalVat = ipcs.reduce((s, i) => s + (i.vatAmount ?? 0), 0);
      const totalTds = ipcs.reduce((s, i) => s + (i.tdsAmount ?? 0), 0);
      const totalRetention = ipcs.reduce((s, i) => s + i.retentionAmount, 0);
      const totalAdvance = ipcs.reduce((s, i) => s + i.advanceRecovery, 0);
      const totalFinalPayable = ipcs.reduce((s, i) => s + (i.finalPayable ?? 0), 0);

      // Monthly breakdown
      const byMonthMap = new Map<string, {
        month: string;
        grossAmount: number;
        vatAmount: number;
        tdsAmount: number;
        retentionAmount: number;
        finalPayable: number;
      }>();

      for (const i of ipcs) {
        const d = i.issueDate ? new Date(i.issueDate) : new Date(i.createdAt);
        const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        const existing = byMonthMap.get(monthKey) ?? {
          month: monthKey,
          grossAmount: 0,
          vatAmount: 0,
          tdsAmount: 0,
          retentionAmount: 0,
          finalPayable: 0,
        };
        existing.grossAmount += i.grossAmount;
        existing.vatAmount += i.vatAmount ?? 0;
        existing.tdsAmount += i.tdsAmount ?? 0;
        existing.retentionAmount += i.retentionAmount;
        existing.finalPayable += i.finalPayable ?? 0;
        byMonthMap.set(monthKey, existing);
      }

      return {
        ipcs: ipcs.map((i) => ({
          id: i.id,
          number: i.number,
          period: i.period,
          status: i.status,
          issueDate: i.issueDate,
          subcontractorName: i.subcontractor?.name ?? null,
          grossAmount: i.grossAmount,
          vatPercent: i.vatPercent,
          vatAmount: i.vatAmount,
          tdsPercent: i.tdsPercent,
          tdsAmount: i.tdsAmount,
          retentionAmount: i.retentionAmount,
          advanceRecovery: i.advanceRecovery,
          finalPayable: i.finalPayable,
          itemCount: i._count.items,
        })),
        totals: {
          count: ipcs.length,
          totalGross,
          totalVat,
          totalTds,
          totalRetention,
          totalAdvance,
          totalFinalPayable,
        },
        byMonth: Array.from(byMonthMap.values()).sort((a, b) => a.month.localeCompare(b.month)),
      };
    }),
});
