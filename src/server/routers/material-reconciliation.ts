import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure } from "@/server/trpc";
import { db } from "@/lib/db";
import { getDefaultLibraryId } from "@/lib/default-library";
import { assertProjectMember, assertCanWrite } from "@/lib/authz";

export const materialReconciliationProcedures = {
  getRequirements: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);

      const materials = await db.material.findMany({
        where: { projectId: input.projectId },
        orderBy: { name: "asc" },
      });

      const defaultLibId = await getDefaultLibraryId(input.projectId);
      const ingredientFilter = defaultLibId
        ? { type: "material" as const, rateAnalysis: { libraryId: defaultLibId } }
        : { type: "material" as const, rateAnalysis: { library: { purpose: "client_estimate" as const } } };

      const boqItems = await db.boqItem.findMany({
        where: { projectId: input.projectId },
        include: {
          ingredients: {
            where: ingredientFilter as any,
          },
        },
      });

      const plannedMap = new Map<string, number>();
      for (const item of boqItems) {
        for (const ing of item.ingredients) {
          const key = ing.name.toLowerCase().trim();
          plannedMap.set(key, (plannedMap.get(key) ?? 0) + item.quantity * ing.quantity);
        }
      }

      const issuedMap = new Map<string, number>();
      const transactions = await db.materialTransaction.findMany({
        where: { projectId: input.projectId, type: { in: ["issue", "transfer"] } },
      });
      for (const t of transactions) {
        issuedMap.set(t.materialId, (issuedMap.get(t.materialId) ?? 0) + t.quantity);
      }

      const requirements = materials.map((mat) => {
        const matNameKey = mat.name.toLowerCase().trim();
        const catKey = (mat.category || "").toLowerCase().trim();
        
        let planned = plannedMap.get(matNameKey) ?? 0;
        // Fallback to parent category match if specific sub-category item (e.g. "Rebar — 12mm" matching BOQ "Rebar")
        if (planned === 0 && catKey) {
          planned = plannedMap.get(catKey) ?? 0;
        }

        const issued = issuedMap.get(mat.id) ?? 0;
        return {
          materialId: mat.id,
          materialName: mat.name,
          unit: mat.unit,
          currentStock: mat.currentStock,
          plannedQty: planned,
          issuedQty: issued,
          remainingToProcure: Math.max(0, planned - issued),
        };
      });

      return { requirements };
    }),

  lowStock: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);

      const materials = await db.material.findMany({
        where: {
          projectId: input.projectId,
          reorderLevel: { gt: 0 },
          currentStock: { lte: db.material.fields.reorderLevel },
        },
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          code: true,
          unit: true,
          currentStock: true,
          reorderLevel: true,
          minStock: true,
        },
      });

      const lowStockMaterials = materials.map(m => ({
        ...m,
        urgency: m.currentStock <= (m.minStock || 0) ? "critical" as const : "warning" as const,
        shortfall: Math.max(0, m.reorderLevel - m.currentStock),
      }));

      return { materials: lowStockMaterials };
    }),

  reconciliation: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      startDate: z.string().datetime(),
      endDate: z.string().datetime(),
    }))
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);

      const startDate = new Date(input.startDate);
      const endDate = new Date(input.endDate);

      const materials = await db.material.findMany({
        where: { projectId: input.projectId },
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          code: true,
          unit: true,
          currentStock: true,
          minStock: true,
          reorderLevel: true,
        },
      });

      if (materials.length === 0) {
        return { materials: [], summary: { totalReceived: 0, totalIssued: 0, totalVariance: 0, materialsWithVariance: 0 } };
      }

      const transactions = await db.materialTransaction.findMany({
        where: {
          projectId: input.projectId,
          date: { gte: startDate, lte: endDate },
        },
        select: {
          materialId: true,
          type: true,
          quantity: true,
          date: true,
          reference: true,
          remarks: true,
        },
        orderBy: { date: "asc" },
      });

      const priorTransactions = await db.materialTransaction.findMany({
        where: {
          projectId: input.projectId,
          date: { lt: startDate },
        },
        select: {
          materialId: true,
          type: true,
          quantity: true,
        },
      });

      const openingStockMap = new Map<string, number>();
      for (const mat of materials) {
        openingStockMap.set(mat.id, mat.currentStock);
      }
      for (const txn of transactions) {
        const current = openingStockMap.get(txn.materialId) ?? 0;
        if (txn.type === "receive" || txn.type === "adjustment") {
          openingStockMap.set(txn.materialId, current - txn.quantity);
        } else if (txn.type === "issue" || txn.type === "transfer") {
          openingStockMap.set(txn.materialId, current + txn.quantity);
        }
      }
      for (const txn of priorTransactions) {
        const current = openingStockMap.get(txn.materialId) ?? 0;
        if (txn.type === "receive" || txn.type === "adjustment") {
          openingStockMap.set(txn.materialId, current + txn.quantity);
        } else if (txn.type === "issue" || txn.type === "transfer") {
          openingStockMap.set(txn.materialId, current - txn.quantity);
        }
      }

      const reconciliations = materials.map(mat => {
        const opening = Math.max(0, openingStockMap.get(mat.id) ?? 0);
        const matTxns = transactions.filter(t => t.materialId === mat.id);

        const received = matTxns
          .filter(t => t.type === "receive")
          .reduce((s, t) => s + t.quantity, 0);
        const issued = matTxns
          .filter(t => t.type === "issue")
          .reduce((s, t) => s + t.quantity, 0);
        const transfersOut = matTxns
          .filter(t => t.type === "transfer")
          .reduce((s, t) => s + t.quantity, 0);
        const adjustments = matTxns
          .filter(t => t.type === "adjustment")
          .reduce((s, t) => s + t.quantity, 0);

        const expectedClosing = opening + received + adjustments - issued - transfersOut;
        const actualClosing = mat.currentStock;
        const variance = actualClosing - expectedClosing;
        const variancePct = expectedClosing !== 0 ? Math.round((variance / expectedClosing) * 100) : 0;

        return {
          ...mat,
          opening,
          received,
          issued,
          transfersOut,
          adjustments,
          expectedClosing,
          actualClosing,
          variance,
          variancePct,
          transactionCount: matTxns.length,
        };
      });

      const summary = {
        totalReceived: reconciliations.reduce((s, r) => s + r.received, 0),
        totalIssued: reconciliations.reduce((s, r) => s + r.issued, 0),
        totalVariance: reconciliations.reduce((s, r) => s + r.variance, 0),
        materialsWithVariance: reconciliations.filter(r => Math.abs(r.variance) > 0.01).length,
      };

      return { materials: reconciliations, summary };
    }),

  physicalCount: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      materialId: z.string(),
      countedQty: z.number().min(0),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertCanWrite(ctx.user, input.projectId);

      const material = await db.material.findFirst({
        where: { id: input.materialId, projectId: input.projectId },
      });
      if (!material) throw new TRPCError({ code: "NOT_FOUND", message: "Material not found." });

      const difference = input.countedQty - material.currentStock;
      if (Math.abs(difference) < 0.001) {
        return { ok: true, message: "No adjustment needed — count matches system." };
      }

      await db.materialTransaction.create({
        data: {
          materialId: input.materialId,
          projectId: input.projectId,
          type: "adjustment",
          quantity: Math.abs(difference),
          unit: material.unit,
          rate: 0,
          reference: "Physical Count",
          remarks: `Physical count adjustment: ${difference > 0 ? "+" : ""}${difference.toFixed(2)} ${material.unit}${input.notes ? ` — ${input.notes}` : ""}`,
          createdById: ctx.user.id,
          paymentType: "payable",
        },
      });

      await db.material.update({
        where: { id: input.materialId },
        data: { currentStock: input.countedQty },
      });

      return { ok: true, message: `Adjusted by ${difference > 0 ? "+" : ""}${difference.toFixed(2)} ${material.unit}` };
    }),

  getYieldReconciliation: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        startDate: z.string().datetime().optional(),
        endDate: z.string().datetime().optional(),
        boqItemId: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);

      const defaultLibId = await getDefaultLibraryId(input.projectId);
      const ingredientFilter = defaultLibId
        ? { type: "material" as const, rateAnalysis: { libraryId: defaultLibId } }
        : { type: "material" as const, rateAnalysis: { library: { purpose: "client_estimate" as const } } };

      const boqItems = await db.boqItem.findMany({
        where: {
          projectId: input.projectId,
          ...(input.boqItemId ? { id: input.boqItemId } : {}),
        },
        include: {
          ingredients: {
            where: ingredientFilter as any,
          },
        },
      });

      const boqMap = new Map(boqItems.map((b) => [b.id, b]));
      const boqCodeMap = new Map(boqItems.map((b) => [b.code, b]));

      // Query DailyReportProgress entries
      const dateFilter =
        input.startDate || input.endDate
          ? {
              reportDate: {
                ...(input.startDate ? { gte: new Date(input.startDate) } : {}),
                ...(input.endDate ? { lte: new Date(input.endDate) } : {}),
              },
            }
          : {};

      const progressRows = await db.dailyReportProgress.findMany({
        where: {
          report: {
            projectId: input.projectId,
            status: { in: ["submitted", "approved", "checked"] },
            ...dateFilter,
          },
          ...(input.boqItemId ? { boqItemId: input.boqItemId } : {}),
        },
        include: {
          report: { select: { id: true, number: true, reportDate: true } },
        },
        orderBy: { report: { reportDate: "desc" } },
      });

      // Group by BOQ item / work item
      const itemSummaries = new Map<
        string,
        {
          boqItemId: string | null;
          boqCode: string;
          boqDesc: string;
          unit: string;
          totalBatchedQty: number;
          totalPayableQty: number;
          totalPlannedQty: number;
          varianceQty: number;
          variancePct: number;
          logCount: number;
          ingredientBreakdown: Array<{
            name: string;
            unit: string;
            dosagePerUnit: number;
            batchedUsed: number;
            payableUsed: number;
            wastageUsed: number;
            rate: number;
            wastageCost: number;
          }>;
        }
      >();

      for (const row of progressRows) {
        const boqItem =
          (row.boqItemId ? boqMap.get(row.boqItemId) : null) ||
          (row.boqCode ? boqCodeMap.get(row.boqCode) : null);

        const code = row.boqCode || boqItem?.code || "UNLINKED";
        const desc = row.boqDesc || boqItem?.description || row.taskDescription || "General Work";
        const unit = row.unit || boqItem?.unit || "";

        const batched = Number(row.batchedQty) || Number(row.actualQty) || 0;
        const payable = Number(row.payableQty) || Number(row.actualQty) || 0;
        const planned = Number(row.plannedQty) || 0;

        const existing = itemSummaries.get(code);
        if (existing) {
          existing.totalBatchedQty += batched;
          existing.totalPayableQty += payable;
          existing.totalPlannedQty += planned;
          existing.logCount += 1;
        } else {
          itemSummaries.set(code, {
            boqItemId: boqItem?.id || row.boqItemId || null,
            boqCode: code,
            boqDesc: desc,
            unit,
            totalBatchedQty: batched,
            totalPayableQty: payable,
            totalPlannedQty: planned,
            varianceQty: 0,
            variancePct: 0,
            logCount: 1,
            ingredientBreakdown: [],
          });
        }
      }

      let totalOverallWastageCost = 0;

      // Calculate variances & explode ingredients
      for (const [code, summary] of itemSummaries.entries()) {
        summary.varianceQty = summary.totalBatchedQty - summary.totalPayableQty;
        summary.variancePct =
          summary.totalPayableQty > 0
            ? Math.round((summary.varianceQty / summary.totalPayableQty) * 1000) / 10
            : 0;

        const boqItem = summary.boqItemId ? boqMap.get(summary.boqItemId) : boqCodeMap.get(code);
        if (boqItem && boqItem.ingredients) {
          for (const ing of boqItem.ingredients) {
            const dosage = ing.quantity || 0;
            const batchedUsed = summary.totalBatchedQty * dosage;
            const payableUsed = summary.totalPayableQty * dosage;
            const wastageUsed = Math.max(0, summary.varianceQty * dosage);
            const rate = ing.rate || 0;
            const wastageCost = wastageUsed * rate;

            totalOverallWastageCost += wastageCost;

            summary.ingredientBreakdown.push({
              name: ing.name,
              unit: ing.unit,
              dosagePerUnit: dosage,
              batchedUsed,
              payableUsed,
              wastageUsed,
              rate,
              wastageCost,
            });
          }
        }
      }

      const items = Array.from(itemSummaries.values());
      const totalBatchedAll = items.reduce((s, i) => s + i.totalBatchedQty, 0);
      const totalPayableAll = items.reduce((s, i) => s + i.totalPayableQty, 0);
      const netVarianceAll = totalBatchedAll - totalPayableAll;

      return {
        items,
        summary: {
          totalWorkItems: items.length,
          totalBatchedAll,
          totalPayableAll,
          netVarianceAll,
          totalWastageCostNPR: totalOverallWastageCost,
        },
      };
    }),

  stockAlerts: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);

      const materials = await db.material.findMany({
        where: {
          projectId: input.projectId,
          isActive: true,
          OR: [
            { currentStock: { lte: db.material.fields.reorderLevel }, reorderLevel: { gt: 0 } },
            { currentStock: { lte: db.material.fields.minStock }, minStock: { gt: 0 } },
            { currentStock: 0 },
          ],
        },
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          code: true,
          unit: true,
          currentStock: true,
          reorderLevel: true,
          minStock: true,
        },
      });

      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const materialIds = materials.map(m => m.id);

      const recentTransactions = materialIds.length > 0
        ? await db.materialTransaction.findMany({
            where: {
              materialId: { in: materialIds },
              type: "issue",
              date: { gte: thirtyDaysAgo },
            },
            select: { materialId: true, quantity: true, date: true },
          })
        : [];

      const consumptionByMaterial = new Map<string, { totalIssued: number; days: number }>();
      for (const txn of recentTransactions) {
        const existing = consumptionByMaterial.get(txn.materialId) || { totalIssued: 0, days: 0 };
        existing.totalIssued += txn.quantity;
        existing.days += 1;
        consumptionByMaterial.set(txn.materialId, existing);
      }

      const alerts = materials.map(m => {
        const consumption = consumptionByMaterial.get(m.id);
        const avgDailyConsumption = consumption && consumption.days > 0
          ? Math.round((consumption.totalIssued / 30) * 100) / 100
          : 0;
        const daysUntilStockout = avgDailyConsumption > 0
          ? Math.round(m.currentStock / avgDailyConsumption)
          : null;

        let urgency: "critical" | "warning" | "adequate" = "adequate";
        if (m.currentStock <= (m.minStock || 0) && (m.minStock || 0) > 0) {
          urgency = "critical";
        } else if (m.currentStock <= (m.reorderLevel || 0) && (m.reorderLevel || 0) > 0) {
          urgency = "warning";
        } else if (m.currentStock === 0) {
          urgency = "critical";
        }

        return {
          ...m,
          avgDailyConsumption,
          daysUntilStockout,
          urgency,
        };
      });

      const sorted = alerts.sort((a, b) => {
        const urgencyOrder = { critical: 0, warning: 1, adequate: 2 };
        return (urgencyOrder[a.urgency] ?? 2) - (urgencyOrder[b.urgency] ?? 2);
      });

      return {
        alerts: sorted,
        summary: {
          total: sorted.length,
          critical: sorted.filter(a => a.urgency === "critical").length,
          warning: sorted.filter(a => a.urgency === "warning").length,
          adequate: sorted.filter(a => a.urgency === "adequate").length,
        },
      };
    }),
};
