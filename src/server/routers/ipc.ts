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
          tdsPercent: input.tdsPercent ?? 0,
        },
        include: {
          subcontractor: { select: { name: true } },
          boqVersion: { select: { versionNumber: true } },
        },
      });

      return { ipc };
    }),

  /** Update settings (status, retention, advance) of an IPC. */
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
      if (data.period !== undefined) updateData.period = data.period;
      if (data.retention !== undefined) updateData.retention = data.retention;
      if (data.advanceRecovery !== undefined) updateData.advanceRecovery = data.advanceRecovery;
      if (data.vatPercent !== undefined) updateData.vatPercent = data.vatPercent;
      if (data.tdsPercent !== undefined) updateData.tdsPercent = data.tdsPercent;
      if (data.status !== undefined) {
        updateData.status = data.status;
        if (data.status === "approved" || data.status === "paid") {
          updateData.issueDate = new Date();
        }
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

      // Notify when IPC is certified/approved/paid (internal + channel)
      if (data.status && final) {
        const statusMessages: Record<string, string> = {
          certified: `IPC ${final.number} has been certified for payment (NPR ${final.netPayable.toLocaleString("en-IN", { maximumFractionDigits: 0 })}).`,
          approved: `IPC ${final.number} has been approved (NPR ${final.netPayable.toLocaleString("en-IN", { maximumFractionDigits: 0 })}).`,
          paid: `Payment processed for IPC ${final.number} (NPR ${final.netPayable.toLocaleString("en-IN", { maximumFractionDigits: 0 })}).`,
          submitted: `IPC ${final.number} has been submitted for certification.`,
        };
        if (statusMessages[data.status]) {
          await notifyProject({
            projectId: item.projectId,
            type: `ipc_${data.status}`,
            title: `IPC ${data.status}: ${final.number}`,
            message: statusMessages[data.status],
            metadata: { ipcId, number: final.number, entityType: "ipc", entityId: ipcId },
            excludeUserId: ctx.user.id,
            postToChannel: true,
          });
        }
      }

      // Calculate subcontractor material deductions (for update endpoint)
      let materialDeductions = 0;
      if (item.subcontractorId) {
        const txns = await db.materialTransaction.findMany({
          where: { projectId: item.projectId, subcontractorId: item.subcontractorId, isDebitable: true },
        });
        materialDeductions = txns.reduce((sum, t) => sum + (t.quantity * (t.recoveryRate ?? t.rate)), 0);
      }

      return { ipc: final, materialDeductions };
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
