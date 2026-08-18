/**
 * Finance router — cash flow forecasting and budget vs actual variance.
 *
 * Cash flow forecast:
 *  - Planned outflow: BOQ-linked Gantt tasks scheduled in each month
 *  - Actual outflow: ProjectCosts (material/labor/equipment) by month
 *  - IPC payments: scheduled + actual
 *  - Returns monthly buckets with planned vs actual
 *
 * Budget vs actual:
 *  - For each BOQ item: planned quantity × rate vs actual quantity × rate
 *  - Aggregates by BOQ section
 *  - Shows variance (positive = under budget, negative = over budget)
 */
import { z } from "zod";
import { router, protectedProcedure } from "@/server/trpc";
import { db } from "@/lib/db";
import { assertProjectMember } from "@/lib/authz";

export const financeRouter = router({
  /**
   * Cash flow forecast — monthly buckets of planned vs actual costs.
   *
   * Planned: BOQ-linked Gantt tasks (task cost spread across duration)
   * Actual: ProjectCosts by date + IPC payments by date
   *
   * Returns 12 months starting from the project's earliest task date
   * (or current month if no tasks).
   */
  cashFlow: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      months: z.number().min(1).max(36).default(12),
    }))
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);

      // Get project's earliest task date
      const earliestTask = await db.ganttTask.findFirst({
        where: { projectId: input.projectId },
        orderBy: { startDate: "asc" },
        select: { startDate: true },
      });

      const startDate = earliestTask?.startDate ?? new Date();
      const months: Array<{
        month: string; // YYYY-MM
        label: string; // "Jan 2026"
        plannedCost: number;
        actualCost: number;
        ipcPaid: number;
        netCashFlow: number; // actual + ipcPaid (outflow)
        cumulativePlanned: number;
        cumulativeActual: number;
      }> = [];

      // Build month buckets
      const startMonth = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
      for (let i = 0; i < input.months; i++) {
        const monthDate = new Date(startMonth.getFullYear(), startMonth.getMonth() + i, 1);
        const monthKey = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, "0")}`;
        const label = monthDate.toLocaleDateString("en-US", { month: "short", year: "numeric" });
        months.push({
          month: monthKey,
          label,
          plannedCost: 0,
          actualCost: 0,
          ipcPaid: 0,
          netCashFlow: 0,
          cumulativePlanned: 0,
          cumulativeActual: 0,
        });
      }

      const monthMap = new Map(months.map((m, i) => [m.month, { month: m, index: i }]));

      // ── Planned costs: Gantt tasks with BOQ links ──
      const tasks = await db.ganttTask.findMany({
        where: { projectId: input.projectId },
        include: {
          boqLinks: { include: { boqItem: { select: { rate: true } } } },
        },
      });

      for (const task of tasks) {
        const taskCost = task.boqLinks.reduce(
          (sum, link) => sum + link.quantity * (link.boqItem.rate || 0),
          0
        );
        if (taskCost <= 0) continue;

        // Spread cost across task duration
        const taskStart = new Date(task.startDate);
        const taskEnd = new Date(task.endDate);
        const durationDays = Math.max(1, Math.ceil((taskEnd.getTime() - taskStart.getTime()) / (1000 * 60 * 60 * 24)));
        const dailyCost = taskCost / durationDays;

        // Distribute to each month the task spans
        const cursor = new Date(taskStart.getFullYear(), taskStart.getMonth(), 1);
        const endMonth = new Date(taskEnd.getFullYear(), taskEnd.getMonth(), 1);
        while (cursor <= endMonth) {
          const monthKey = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;
          const entry = monthMap.get(monthKey);
          if (entry) {
            // Days in this month that the task spans
            const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
            const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
            const overlapStart = new Date(Math.max(taskStart.getTime(), monthStart.getTime()));
            const overlapEnd = new Date(Math.min(taskEnd.getTime(), monthEnd.getTime()));
            const overlapDays = Math.max(1, Math.ceil((overlapEnd.getTime() - overlapStart.getTime()) / (1000 * 60 * 60 * 24)));
            entry.month.plannedCost += dailyCost * overlapDays;
          }
          cursor.setMonth(cursor.getMonth() + 1);
        }
      }

      // ── Actual costs: ProjectCosts by date ──
      const costs = await db.projectCost.findMany({
        where: {
          projectId: input.projectId,
          date: { gte: startMonth },
        },
        select: { amount: true, date: true, category: true },
      });

      for (const cost of costs) {
        const monthKey = `${cost.date.getFullYear()}-${String(cost.date.getMonth() + 1).padStart(2, "0")}`;
        const entry = monthMap.get(monthKey);
        if (entry) {
          entry.month.actualCost += cost.amount;
        }
      }

      // ── IPC payments by date ──
      const payments = await db.payment.findMany({
        where: {
          projectId: input.projectId,
          status: "paid",
          paymentDate: { gte: startMonth },
        },
        select: { amount: true, paymentDate: true },
      });

      for (const payment of payments) {
        const monthKey = `${payment.paymentDate.getFullYear()}-${String(payment.paymentDate.getMonth() + 1).padStart(2, "0")}`;
        const entry = monthMap.get(monthKey);
        if (entry) {
          entry.month.ipcPaid += payment.amount;
        }
      }

      // Calculate net cash flow and cumulative totals
      let cumPlanned = 0;
      let cumActual = 0;
      for (const m of months) {
        m.netCashFlow = m.actualCost + m.ipcPaid;
        cumPlanned += m.plannedCost;
        cumActual += m.netCashFlow;
        m.cumulativePlanned = cumPlanned;
        m.cumulativeActual = cumActual;
      }

      const totals = {
        totalPlanned: months.reduce((s, m) => s + m.plannedCost, 0),
        totalActual: months.reduce((s, m) => s + m.actualCost, 0),
        totalIpcPaid: months.reduce((s, m) => s + m.ipcPaid, 0),
      };

      return { months, totals };
    }),

  /**
   * Budget vs actual variance — per BOQ item.
   *
   * Budget: BOQ quantity × rate (from current BOQ version)
   * Actual: Cumulative execution quantity × rate (from daily program tasks)
   *         + material costs linked to the BOQ item
   *
   * Returns rows grouped by BOQ section, with variance and variance %.
   */
  budgetVariance: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);

      // Get all BOQ items
      const boqItems = await db.boqItem.findMany({
        where: { projectId: input.projectId },
        select: {
          id: true, code: true, description: true, unit: true,
          quantity: true, rate: true, section: true,
        },
        orderBy: { code: "asc" },
      });

      // Get cumulative actual quantities from daily program tasks
      // (executionStatus = "done" or "partially_completed")
      const programTasks = await db.dailyProgramTask.findMany({
        where: {
          program: { projectId: input.projectId },
          boqItemId: { not: null },
          executionStatus: { in: ["done", "partially_completed"] },
        },
        select: {
          boqItemId: true,
          actualQty: true,
        },
      });

      const actualQtyByBoq = new Map<string, number>();
      for (const t of programTasks) {
        if (!t.boqItemId) continue;
        actualQtyByBoq.set(
          t.boqItemId,
          (actualQtyByBoq.get(t.boqItemId) ?? 0) + (t.actualQty ?? 0)
        );
      }

      // Get material costs linked to BOQ items
      const materialCosts = await db.projectCost.findMany({
        where: {
          projectId: input.projectId,
          boqItemId: { not: null },
          category: "material",
        },
        select: { boqItemId: true, amount: true },
      });
      const materialCostByBoq = new Map<string, number>();
      for (const c of materialCosts) {
        if (!c.boqItemId) continue;
        materialCostByBoq.set(c.boqItemId, (materialCostByBoq.get(c.boqItemId) ?? 0) + c.amount);
      }

      // Build variance rows
      const rows = boqItems.map((item) => {
        const budgetAmount = item.quantity * item.rate;
        const actualQty = actualQtyByBoq.get(item.id) ?? 0;
        const actualAmountAtBudgetRate = actualQty * item.rate;
        const actualMaterialCost = materialCostByBoq.get(item.id) ?? 0;
        // Use the higher of (actual qty × budget rate) or actual material cost
        const actualAmount = Math.max(actualAmountAtBudgetRate, actualMaterialCost);
        const variance = budgetAmount - actualAmount; // positive = under budget
        const variancePercent = budgetAmount > 0 ? (variance / budgetAmount) * 100 : 0;

        return {
          boqItemId: item.id,
          code: item.code,
          description: item.description,
          section: item.section,
          unit: item.unit,
          budgetQty: item.quantity,
          rate: item.rate,
          budgetAmount,
          actualQty,
          actualAmount,
          variance,
          variancePercent,
          status: variance > 0 ? "under" : variance < 0 ? "over" : "on_track",
        };
      });

      // Group by section
      const sectionMap = new Map<string, {
        section: string;
        items: typeof rows;
        budgetAmount: number;
        actualAmount: number;
        variance: number;
        variancePercent: number;
      }>();

      for (const row of rows) {
        const sectionName = row.section || "Uncategorized";
        const existing = sectionMap.get(sectionName) ?? {
          section: sectionName,
          items: [],
          budgetAmount: 0,
          actualAmount: 0,
          variance: 0,
          variancePercent: 0,
        };
        existing.items.push(row);
        existing.budgetAmount += row.budgetAmount;
        existing.actualAmount += row.actualAmount;
        existing.variance += row.variance;
        sectionMap.set(sectionName, existing);
      }

      // Calculate variance % per section
      const sections = Array.from(sectionMap.values()).map((s) => ({
        ...s,
        variancePercent: s.budgetAmount > 0 ? (s.variance / s.budgetAmount) * 100 : 0,
      }));

      const totals = {
        totalBudget: rows.reduce((s, r) => s + r.budgetAmount, 0),
        totalActual: rows.reduce((s, r) => s + r.actualAmount, 0),
        totalVariance: rows.reduce((s, r) => s + r.variance, 0),
        itemCount: rows.length,
        overBudgetCount: rows.filter((r) => r.variance < 0).length,
        underBudgetCount: rows.filter((r) => r.variance > 0).length,
      };

      return {
        rows,
        sections,
        totals: {
          ...totals,
          totalVariancePercent: totals.totalBudget > 0
            ? (totals.totalVariance / totals.totalBudget) * 100
            : 0,
        },
      };
    }),
});
