/**
 * tRPC router for Procurement Lookahead & Lead-Time Demand Alerts.
 * Cross-references upcoming Gantt tasks with BOQ rate analysis ingredient requirements.
 */
import { z } from "zod";
import { router, protectedProcedure } from "@/server/trpc";
import { db } from "@/lib/db";
import { assertProjectMember } from "@/lib/authz";
import { getDefaultLibraryId } from "@/lib/default-library";

// Standard Material Lead Times (days)
const DEFAULT_LEAD_TIMES: Record<string, number> = {
  steel: 14,
  rebar: 14,
  cement: 7,
  bitumen: 21,
  aggregate: 3,
  sand: 3,
  pipe: 10,
  hdpe: 14,
  admixture: 7,
  explosive: 30,
  general: 7,
};

function getLeadTimeDays(materialName: string, category?: string | null): number {
  const name = (materialName + " " + (category || "")).toLowerCase();
  for (const [key, days] of Object.entries(DEFAULT_LEAD_TIMES)) {
    if (name.includes(key)) return days;
  }
  return DEFAULT_LEAD_TIMES.general;
}

export const procurementLookaheadRouter = router({
  /** Get upcoming material demand based on scheduled Gantt tasks in the next 7, 14, 30, 60 days. */
  getLookahead: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        lookaheadDays: z.number().int().min(7).max(90).optional().default(30),
      })
    )
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);

      const now = new Date();
      const horizonDate = new Date();
      horizonDate.setDate(now.getDate() + input.lookaheadDays);

      // 1. Fetch active Gantt version and upcoming tasks
      const activeVersion = await db.ganttVersion.findFirst({
        where: { projectId: input.projectId, isActive: true },
      });

      const tasks = await db.ganttTask.findMany({
        where: {
          projectId: input.projectId,
          ...(activeVersion ? { versionId: activeVersion.id } : {}),
          startDate: { lte: horizonDate },
          progress: { lt: 100 },
        },
        include: {
          boqLinks: {
            include: {
              boqItem: true,
            },
          },
        },
        orderBy: { startDate: "asc" },
      });

      // 2. Fetch all project materials with stock
      const materials = await db.material.findMany({
        where: { projectId: input.projectId },
        select: {
          id: true,
          name: true,
          code: true,
          category: true,
          subCategory: true,
          unit: true,
          currentStock: true,
          minStock: true,
          reorderLevel: true,
        },
      });

      // 3. Fetch default Rate Analysis library ingredients
      const defaultLibId = await getDefaultLibraryId(input.projectId);
      const ingredientFilter = defaultLibId
        ? { type: "material" as const, rateAnalysis: { libraryId: defaultLibId } }
        : { type: "material" as const, rateAnalysis: { library: { purpose: "client_estimate" as const } } };

      const boqItemsWithIngredients = await db.boqItem.findMany({
        where: { projectId: input.projectId },
        include: {
          ingredients: {
            where: ingredientFilter as any,
          },
        },
      });

      const boqIngredientMap = new Map<string, { name: string; quantityPerUnit: number; unit: string }[]>();
      for (const boq of boqItemsWithIngredients) {
        boqIngredientMap.set(
          boq.id,
          boq.ingredients.map((ing) => ({
            name: ing.name,
            quantityPerUnit: ing.quantity,
            unit: ing.unit,
          }))
        );
      }

      // 4. Map task demands to materials
      const materialDemandMap = new Map<
        string,
        {
          material: (typeof materials)[0];
          plannedDemand: number;
          earliestTaskDate: Date;
          earliestTaskName: string;
          tasksCount: number;
        }
      >();

      for (const task of tasks) {
        for (const link of task.boqLinks) {
          const ingredients = boqIngredientMap.get(link.boqItemId) || [];
          for (const ing of ingredients) {
            const ingNameLower = ing.name.toLowerCase().trim();
            // Find matching material
            const matchedMat = materials.find((m) => {
              const mNameLower = m.name.toLowerCase().trim();
              const fullSpec = (m.subCategory ? `${m.name} ${m.subCategory}` : m.name).toLowerCase();
              return mNameLower === ingNameLower || fullSpec.includes(ingNameLower) || ingNameLower.includes(mNameLower);
            });

            if (matchedMat) {
              const qtyNeeded = (link.quantity || link.boqItem.quantity || 1) * ing.quantityPerUnit * (1 - task.progress / 100);
              const current = materialDemandMap.get(matchedMat.id) || {
                material: matchedMat,
                plannedDemand: 0,
                earliestTaskDate: task.startDate,
                earliestTaskName: task.name,
                tasksCount: 0,
              };

              current.plannedDemand += qtyNeeded;
              current.tasksCount += 1;
              if (task.startDate < current.earliestTaskDate) {
                current.earliestTaskDate = task.startDate;
                current.earliestTaskName = task.name;
              }
              materialDemandMap.set(matchedMat.id, current);
            }
          }
        }
      }

      // 5. Compute lead-time requisition alerts
      const alerts = Array.from(materialDemandMap.values()).map((d) => {
        const leadDays = getLeadTimeDays(d.material.name, d.material.category);
        const daysUntilTask = Math.ceil((d.earliestTaskDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        const daysUntilRequisitionDue = daysUntilTask - leadDays;

        const shortfall = Math.max(0, d.plannedDemand - d.material.currentStock);
        const isUrgent = daysUntilRequisitionDue <= 3 && shortfall > 0;
        const isOverdue = daysUntilRequisitionDue < 0 && shortfall > 0;

        return {
          materialId: d.material.id,
          materialName: d.material.name,
          materialCategory: d.material.category,
          unit: d.material.unit,
          currentStock: d.material.currentStock,
          plannedDemand: Math.round(d.plannedDemand * 100) / 100,
          shortfall: Math.round(shortfall * 100) / 100,
          leadDays,
          earliestTaskDate: d.earliestTaskDate,
          earliestTaskName: d.earliestTaskName,
          tasksCount: d.tasksCount,
          daysUntilTask,
          daysUntilRequisitionDue,
          status: isOverdue ? ("overdue" as const) : isUrgent ? ("urgent" as const) : ("upcoming" as const),
        };
      });

      // Sort by urgency: overdue first, then lowest daysUntilRequisitionDue
      alerts.sort((a, b) => {
        if (a.status === "overdue" && b.status !== "overdue") return -1;
        if (b.status === "overdue" && a.status !== "overdue") return 1;
        return a.daysUntilRequisitionDue - b.daysUntilRequisitionDue;
      });

      return {
        lookaheadDays: input.lookaheadDays,
        totalTasksAnalyzed: tasks.length,
        criticalAlertsCount: alerts.filter((a) => a.status === "overdue" || a.status === "urgent").length,
        alerts,
      };
    }),
});
