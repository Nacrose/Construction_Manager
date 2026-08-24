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
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "@/server/trpc";
import { db } from "@/lib/db";
import { assertProjectMember, assertOrgAdmin } from "@/lib/authz";
import { assertNotLocked } from "@/lib/fiscal-year-lock";
import { audit } from "@/lib/audit";
import { createJournalEntry } from "@/lib/journal-entry";
import { hoOverheadCodeForCategory, accountNameForCode } from "@/server/utils/overhead-account-mapping";

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
            const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0, 23, 59, 59, 999);
            const overlapStart = new Date(Math.max(taskStart.getTime(), monthStart.getTime()));
            const overlapEnd = new Date(Math.min(taskEnd.getTime(), monthEnd.getTime()));
            if (overlapStart <= overlapEnd) {
              const overlapDays = Math.max(1, Math.ceil((overlapEnd.getTime() - overlapStart.getTime()) / (1000 * 60 * 60 * 24)));
              entry.month.plannedCost += dailyCost * overlapDays;
            }
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

      // ── Client inflows: IPCs that have been paid by the client ──
      //
      // CRITICAL FIX: previously this block queried the `Payment` table
      // (`db.payment.findMany({ status: "paid", ... })`) and labeled the
      // result `ipcPaid`. But the Payment model is exclusively for
      // OUTGOING payments (vendor / subcontractor / supplier / staff) —
      // there is no "client" payeeType. So the old code was treating
      // outgoing vendor payments as client inflows, and `netCashFlow`
      // was effectively `outflow - outflow` instead of `inflow - outflow`.
      //
      // The correct source for client inflows is the IPC model itself:
      // IPCs go `draft → submitted → certified → approved → paid`, where
      // `paid` means the client has paid the IPC's net payable. We use
      // `issueDate` (when the IPC was issued / billing raised) as the
      // period marker, since that's the closest available proxy for
      // "when the cash was received" (the schema doesn't yet have a
      // dedicated `clientPaidAt` field — TODO for a future migration).
      const paidIpcs = await db.ipc.findMany({
        where: {
          projectId: input.projectId,
          status: "paid",
          issueDate: { gte: startMonth, not: null },
        },
        select: { netPayable: true, issueDate: true },
      });

      for (const ipc of paidIpcs) {
        if (!ipc.issueDate) continue;
        const monthKey = `${ipc.issueDate.getFullYear()}-${String(ipc.issueDate.getMonth() + 1).padStart(2, "0")}`;
        const entry = monthMap.get(monthKey);
        if (entry) {
          entry.month.ipcPaid += ipc.netPayable;
        }
      }

      // Calculate net cash flow and cumulative totals.
      // Net cash flow = INFLOW - OUTFLOW.
      //   INFLOW  = ipcPaid (money received from client via IPC payments)
      //   OUTFLOW = actualCost (money spent on materials, labor, equipment)
      // Previously this was `actualCost + ipcPaid` which summed both
      // as outflows — a positive netCashFlow meant you were LOSING money,
      // which is backwards.
      let cumPlanned = 0;
      let cumActual = 0;
      for (const m of months) {
        m.netCashFlow = m.ipcPaid - m.actualCost;
        cumPlanned += m.plannedCost;
        cumActual += m.actualCost;
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

      // ── Committed Cost: open PO items (ordered but not yet received) ──
      // A PO item is "committed" if the PO is not cancelled and the
      // received quantity is less than the ordered quantity.
      const openPoItems = await db.purchaseOrderItem.findMany({
        where: {
          purchaseOrder: {
            projectId: input.projectId,
            status: { in: ["draft", "sent", "partially_received"] },
          },
        },
        select: {
          materialId: true,
          quantity: true,
          rate: true,
          amount: true,
          receivedQty: true,
        },
      });

      // Build committed cost map by material (not BOQ — committed costs
      // are per-material, not per-BOQ-item). We'll aggregate at the
      // section level instead.
      const totalCommitted = openPoItems.reduce((s, poi) => {
        const remaining = Math.max(0, poi.quantity - (poi.receivedQty ?? 0));
        return s + remaining * poi.rate;
      }, 0);

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
        committed: {
          totalCommitted,
          openPOItemCount: openPoItems.length,
          openPOsRemaining: openPoItems.reduce((s, poi) => s + Math.max(0, poi.quantity - (poi.receivedQty ?? 0)), 0),
        },
        totals: {
          ...totals,
          totalCommitted,
          totalForecast: totals.totalActual + totalCommitted, // actual + committed
          totalVariancePercent: totals.totalBudget > 0
            ? (totals.totalVariance / totals.totalBudget) * 100
            : 0,
          forecastVariance: totals.totalBudget - (totals.totalActual + totalCommitted), // budget - forecast
        },
      };
    }),

  // ─────────────────────────────────────────────────────────────
  // Organization-Level Finance & Central Payables Suite
  // ─────────────────────────────────────────────────────────────

  /** Organization Summary KPIs (Cash/Bank, Total Payables, Total Receivables, Profit) */
  orgSummary: protectedProcedure.query(async ({ ctx }) => {
    const user = await db.user.findUniqueOrThrow({
      where: { id: ctx.user.id },
      select: { organizationId: true },
    });

    const memberships = await db.projectMember.findMany({
      where: { userId: ctx.user.id },
      select: { projectId: true },
    });
    const projectIds = memberships.map((m) => m.projectId);

    const [
      bankAccounts,
      vendorBills,
      subBills,
      ipcs,
      payments,
      hoExpenses,
    ] = await Promise.all([
      user.organizationId
        ? db.companyBankAccount.findMany({
            where: { organizationId: user.organizationId, status: "active" },
          })
        : [],
      db.vendorBill.findMany({
        where: { projectId: { in: projectIds }, status: { in: ["unpaid", "partially_paid"] } },
        select: { netPayable: true, paidAmount: true },
      }),
      db.subcontractorBill.findMany({
        where: {
          projectId: { in: projectIds },
          status: { in: ["submitted", "verified", "certified", "approved"] },
        },
        select: { netPayable: true, paidAmount: true },
      }),
      db.ipc.findMany({
        where: { projectId: { in: projectIds }, status: { in: ["certified", "approved", "paid"] } },
        select: { grossAmount: true, netPayable: true, status: true },
      }),
      db.payment.findMany({
        where: { projectId: { in: projectIds }, status: "paid" },
        select: { amount: true, tdsDeducted: true },
      }),
      user.organizationId
        ? db.headOfficeExpense.findMany({
            where: { organizationId: user.organizationId },
            select: { amount: true },
          })
        : [],
    ]);

    const totalCashBankBalance = bankAccounts.reduce((s, b) => s + b.currentBalance, 0);

    const totalVendorPayables = vendorBills.reduce(
      (s, b) => s + Math.max(0, b.netPayable - b.paidAmount),
      0
    );
    const totalSubPayables = subBills.reduce(
      (s, b) => s + Math.max(0, b.netPayable - (b.paidAmount || 0)),
      0
    );
    const totalPayables = totalVendorPayables + totalSubPayables;

    const totalRevenueCertified = ipcs.reduce((s, i) => s + i.grossAmount, 0);
    const totalRevenueCollected = ipcs
      .filter((i) => i.status === "paid")
      .reduce((s, i) => s + i.netPayable, 0);
    const totalClientReceivables = Math.max(0, totalRevenueCertified - totalRevenueCollected);

    const totalTdsWithheld = payments.reduce((s, p) => s + p.tdsDeducted, 0);
    const totalHeadOfficeExpenses = hoExpenses.reduce((s, e) => s + e.amount, 0);

    return {
      totalCashBankBalance,
      totalPayables,
      totalVendorPayables,
      totalSubPayables,
      totalClientReceivables,
      totalRevenueCertified,
      totalRevenueCollected,
      totalTdsWithheld,
      totalHeadOfficeExpenses,
      bankAccountsCount: bankAccounts.length,
      activeProjectsCount: projectIds.length,
    };
  }),

  /** Consolidated Multi-Project Payables Grouped by Supplier / Subcontractor */
  orgPayables: protectedProcedure
    .input(
      z.object({
        search: z.string().optional(),
        type: z.enum(["all", "vendor", "subcontractor"]).optional(),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      // SCOPING FIX: previously this used projectMember.findMany({ userId })
      // which only returned projects the user is a MEMBER of — an org admin
      // who isn't a member of every project couldn't see org-wide payables.
      // Now we scope by organizationId so all org members see all org
      // projects (the intended behavior for an "org payables" view).
      const user = await db.user.findUniqueOrThrow({
        where: { id: ctx.user.id },
        select: { organizationId: true },
      });

      let projectIds: string[];
      if (user.organizationId) {
        const orgProjects = await db.project.findMany({
          where: { organizationId: user.organizationId },
          select: { id: true },
        });
        projectIds = orgProjects.map((p) => p.id);
      } else {
        // No org — fall back to membership-based scoping.
        const memberships = await db.projectMember.findMany({
          where: { userId: ctx.user.id },
          select: { projectId: true },
        });
        projectIds = memberships.map((m) => m.projectId);
      }

      if (projectIds.length === 0) {
        return { suppliers: [], totalDue: 0, totalBills: 0 };
      }

      const [vendorBills, subBills] = await Promise.all([
        db.vendorBill.findMany({
          where: {
            projectId: { in: projectIds },
            status: { in: ["unpaid", "partially_paid"] },
          },
          include: {
            partner: { select: { id: true, name: true, pan: true, phone: true } },
            project: { select: { id: true, name: true, code: true } },
          },
          orderBy: { billDate: "asc" },
        }),
        db.subcontractorBill.findMany({
          where: {
            projectId: { in: projectIds },
            status: { in: ["submitted", "verified", "certified", "approved"] },
          },
          include: {
            subcontractor: { select: { id: true, name: true, pan: true, phone: true } },
            project: { select: { id: true, name: true, code: true } },
          },
          orderBy: { billDate: "asc" },
        }),
      ]);

      // Normalize all open bills into a unified structure
      type OpenBill = {
        id: string;
        billType: "vendor" | "subcontractor";
        projectId: string;
        projectName: string;
        projectCode: string;
        supplierName: string;
        supplierPan: string | null;
        supplierPhone: string | null;
        billNumber: string;
        billDate: string;
        grossAmount: number;
        tdsAmount: number;
        netPayable: number;
        paidAmount: number;
        balanceDue: number;
        status: string;
      };

      const allBills: OpenBill[] = [];

      if (!input?.type || input.type === "all" || input.type === "vendor") {
        vendorBills.forEach((vb) => {
          const balance = Math.max(0, vb.netPayable - vb.paidAmount);
          if (balance > 0) {
            allBills.push({
              id: vb.id,
              billType: "vendor",
              projectId: vb.projectId,
              projectName: vb.project.name,
              projectCode: vb.project.code,
              supplierName: vb.partner?.name || "Unknown Vendor",
              supplierPan: vb.partner?.pan || null,
              supplierPhone: vb.partner?.phone || null,
              billNumber: vb.billNumber,
              billDate: vb.billDate.toISOString(),
              grossAmount: vb.grossAmount,
              tdsAmount: vb.tdsAmount,
              netPayable: vb.netPayable,
              paidAmount: vb.paidAmount,
              balanceDue: balance,
              status: vb.status,
            });
          }
        });
      }

      if (!input?.type || input.type === "all" || input.type === "subcontractor") {
        subBills.forEach((sb) => {
          const balance = Math.max(0, sb.netPayable - (sb.paidAmount || 0));
          if (balance > 0) {
            allBills.push({
              id: sb.id,
              billType: "subcontractor",
              projectId: sb.projectId,
              projectName: sb.project.name,
              projectCode: sb.project.code,
              supplierName: sb.subcontractor?.name || "Subcontractor",
              supplierPan: sb.subcontractor?.pan || null,
              supplierPhone: sb.subcontractor?.phone || null,
              billNumber: sb.number,
              billDate: sb.billDate.toISOString(),
              grossAmount: sb.grossAmount,
              tdsAmount: sb.tdsAmount,
              netPayable: sb.netPayable,
              paidAmount: sb.paidAmount || 0,
              balanceDue: balance,
              status: sb.status,
            });
          }
        });
      }

      // Group by Supplier Name + PAN
      const supplierMap = new Map<
        string,
        {
          key: string;
          name: string;
          pan: string | null;
          phone: string | null;
          type: "vendor" | "subcontractor";
          totalDue: number;
          billsCount: number;
          projectCodes: string[];
          bills: OpenBill[];
        }
      >();

      allBills.forEach((b) => {
        const key = `${b.supplierName.trim().toLowerCase()}_${b.supplierPan || ""}`;
        if (!supplierMap.has(key)) {
          supplierMap.set(key, {
            key,
            name: b.supplierName,
            pan: b.supplierPan,
            phone: b.supplierPhone,
            type: b.billType,
            totalDue: 0,
            billsCount: 0,
            projectCodes: [],
            bills: [],
          });
        }

        const sup = supplierMap.get(key)!;
        sup.totalDue += b.balanceDue;
        sup.billsCount += 1;
        if (!sup.projectCodes.includes(b.projectCode)) {
          sup.projectCodes.push(b.projectCode);
        }
        sup.bills.push(b);
      });

      let suppliers = Array.from(supplierMap.values()).sort((a, b) => b.totalDue - a.totalDue);

      if (input?.search) {
        const q = input.search.toLowerCase();
        suppliers = suppliers.filter(
          (s) =>
            s.name.toLowerCase().includes(q) ||
            s.pan?.toLowerCase().includes(q) ||
            s.projectCodes.some((c) => c.toLowerCase().includes(q))
        );
      }

      const totalDue = suppliers.reduce((s, sup) => s + sup.totalDue, 0);

      return {
        suppliers,
        totalDue,
        totalBills: allBills.length,
      };
    }),

  /** Master Company Day Book (All Projects + Head Office) */
  orgMasterDayBook: protectedProcedure
    .input(
      z.object({
        projectId: z.string().optional(),
        fromDate: z.string().optional(),
        toDate: z.string().optional(),
        search: z.string().optional(),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const user = await db.user.findUniqueOrThrow({
        where: { id: ctx.user.id },
        select: { organizationId: true },
      });

      // IDOR FIX: if a specific projectId is requested, verify the caller
      // has access to it BEFORE using it as a filter. Without this check,
      // any authenticated user could pass any projectId (including from
      // another org) and see all its payments, vendor bills, sub-bills,
      // and IPCs — a direct cross-tenant data leak.
      let projectIds: string[];
      if (input?.projectId) {
        await assertProjectMember(ctx.user, input.projectId);
        projectIds = [input.projectId];
      } else {
        // Org-wide view: scope to projects in the caller's org.
        // Previously this used projectMember.findMany({ userId }) which
        // only returned projects the user is a MEMBER of — an org admin
        // who isn't a member of every project couldn't see org-wide
        // data. Now we scope by organizationId so all org members see
        // all org projects (the intended behavior for an "org master
        // day book").
        if (user.organizationId) {
          const orgProjects = await db.project.findMany({
            where: { organizationId: user.organizationId },
            select: { id: true },
          });
          projectIds = orgProjects.map((p) => p.id);
        } else {
          // No org — fall back to membership-based scoping.
          const memberships = await db.projectMember.findMany({
            where: { userId: ctx.user.id },
            select: { projectId: true },
          });
          projectIds = memberships.map((m) => m.projectId);
        }
      }

      const [payments, vendorBills, subBills, ipcs, hoExpenses] = await Promise.all([
        db.payment.findMany({
          where: {
            projectId: { in: projectIds },
            ...(input?.fromDate || input?.toDate
              ? {
                  paymentDate: {
                    ...(input.fromDate ? { gte: new Date(input.fromDate) } : {}),
                    ...(input.toDate ? { lte: new Date(input.toDate) } : {}),
                  },
                }
              : {}),
          },
          include: { project: { select: { id: true, name: true, code: true } } },
          orderBy: { paymentDate: "desc" },
          take: 5000,
        }),
        db.vendorBill.findMany({
          where: {
            projectId: { in: projectIds },
            ...(input?.fromDate || input?.toDate
              ? {
                  billDate: {
                    ...(input.fromDate ? { gte: new Date(input.fromDate) } : {}),
                    ...(input.toDate ? { lte: new Date(input.toDate) } : {}),
                  },
                }
              : {}),
          },
          include: {
            partner: true,
            project: { select: { id: true, name: true, code: true } },
          },
          orderBy: { billDate: "desc" },
          take: 5000,
        }),
        db.subcontractorBill.findMany({
          where: {
            projectId: { in: projectIds },
            ...(input?.fromDate || input?.toDate
              ? {
                  billDate: {
                    ...(input.fromDate ? { gte: new Date(input.fromDate) } : {}),
                    ...(input.toDate ? { lte: new Date(input.toDate) } : {}),
                  },
                }
              : {}),
          },
          include: {
            subcontractor: true,
            project: { select: { id: true, name: true, code: true } },
          },
          orderBy: { billDate: "desc" },
          take: 5000,
        }),
        db.ipc.findMany({
          where: {
            projectId: { in: projectIds },
            ...(input?.fromDate || input?.toDate
              ? {
                  createdAt: {
                    ...(input.fromDate ? { gte: new Date(input.fromDate) } : {}),
                    ...(input.toDate ? { lte: new Date(input.toDate) } : {}),
                  },
                }
              : {}),
          },
          include: { project: { select: { id: true, name: true, code: true } } },
          orderBy: { createdAt: "desc" },
        }),
        user.organizationId && !input?.projectId
          ? db.headOfficeExpense.findMany({
              where: {
                organizationId: user.organizationId,
                ...(input?.fromDate || input?.toDate
                  ? {
                      date: {
                        ...(input.fromDate ? { gte: new Date(input.fromDate) } : {}),
                        ...(input.toDate ? { lte: new Date(input.toDate) } : {}),
                      },
                    }
                  : {}),
              },
              orderBy: { date: "desc" },
            })
          : [],
      ]);

      const entries: Array<{
        id: string;
        source: "payment" | "vendor_bill" | "subcontractor_bill" | "ipc" | "head_office";
        projectName: string;
        projectCode: string;
        voucherNo: string;
        voucherType: string;
        date: string;
        miti: string;
        accountHead: string;
        particulars: string;
        debit: number;
        credit: number;
        paymentMode: string | null;
        chequeNo: string | null;
        partyPan: string | null;
      }> = [];

      // 1. Payments
      payments.forEach((p) => {
        entries.push({
          id: p.id,
          source: "payment",
          projectName: p.project.name,
          projectCode: p.project.code,
          voucherNo: p.accountingVoucherNo || `PV-${p.id.slice(-5).toUpperCase()}`,
          voucherType: (p.voucherType || "payment").toUpperCase(),
          date: p.paymentDate.toISOString(),
          miti: p.paymentMiti || "—",
          accountHead: p.category || "Project Expense",
          particulars: `${p.payeeName} - ${p.notes || "Disbursement"}`,
          debit: p.amount,
          credit: 0,
          paymentMode: p.paymentMode,
          chequeNo: p.chequeNo,
          partyPan: p.partyPan,
        });
      });

      // 2. Vendor Bills
      vendorBills.forEach((b) => {
        entries.push({
          id: b.id,
          source: "vendor_bill",
          projectName: b.project.name,
          projectCode: b.project.code,
          voucherNo: b.billNumber,
          voucherType: "PURCHASE BILL",
          date: b.billDate.toISOString(),
          miti: "—",
          accountHead: "Materials & Supplies",
          particulars: `Purchase from ${b.partner?.name || "Vendor"}`,
          debit: 0,
          credit: b.netPayable,
          paymentMode: "Credit Bill",
          chequeNo: null,
          partyPan: b.partner?.pan || null,
        });
      });

      // 3. Subcontractor Bills
      subBills.forEach((b) => {
        entries.push({
          id: b.id,
          source: "subcontractor_bill",
          projectName: b.project.name,
          projectCode: b.project.code,
          voucherNo: b.number,
          voucherType: "SUB BILL",
          date: b.billDate.toISOString(),
          miti: "—",
          accountHead: "Subcontractor Work",
          particulars: `${b.subcontractor?.name || "Subcontractor"} - Period: ${b.period || "Work"}`,
          debit: 0,
          credit: b.netPayable,
          paymentMode: "Certified Bill",
          chequeNo: null,
          partyPan: b.subcontractor?.pan || null,
        });
      });

      // 4. IPCs
      ipcs.forEach((i) => {
        entries.push({
          id: i.id,
          source: "ipc",
          projectName: i.project.name,
          projectCode: i.project.code,
          voucherNo: i.number,
          voucherType: "IPC REVENUE",
          date: i.createdAt.toISOString(),
          miti: "—",
          accountHead: "Contract Revenue",
          particulars: `IPC #${i.number} Client Bill (Gross: ${i.grossAmount})`,
          debit: i.grossAmount,
          credit: 0,
          paymentMode: "Govt Bill",
          chequeNo: null,
          partyPan: null,
        });
      });

      // 5. Head Office Expenses
      hoExpenses.forEach((e) => {
        entries.push({
          id: e.id,
          source: "head_office",
          projectName: "Head Office (केन्द्रीय कार्यालय)",
          projectCode: "HQ",
          voucherNo: e.voucherNo || `HO-${e.id.slice(-5).toUpperCase()}`,
          voucherType: "HQ EXPENSE",
          date: e.date.toISOString(),
          miti: e.miti || "—",
          accountHead: e.category,
          particulars: e.particulars,
          debit: e.amount,
          credit: 0,
          paymentMode: e.paymentMode,
          chequeNo: e.chequeNo,
          partyPan: null,
        });
      });

      entries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      let filtered = entries;
      if (input?.search) {
        const q = input.search.toLowerCase();
        filtered = entries.filter(
          (e) =>
            e.particulars.toLowerCase().includes(q) ||
            e.voucherNo.toLowerCase().includes(q) ||
            e.projectName.toLowerCase().includes(q) ||
            e.projectCode.toLowerCase().includes(q) ||
            e.partyPan?.toLowerCase().includes(q)
        );
      }

      const totalDebit = filtered.reduce((s, e) => s + e.debit, 0);
      const totalCredit = filtered.reduce((s, e) => s + e.credit, 0);

      return {
        entries: filtered,
        summary: {
          totalDebit,
          totalCredit,
          count: filtered.length,
        },
      };
    }),

  /** Multi-Project Party Statement of Account */
  orgPartyStatement: protectedProcedure
    .input(z.object({ partyName: z.string(), partyPan: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const memberships = await db.projectMember.findMany({
        where: { userId: ctx.user.id },
        select: { projectId: true },
      });
      const projectIds = memberships.map((m) => m.projectId);

      // PARTY NAME MATCHING:
      // Previously this used `contains` (substring match), so searching
      // for "Sharma" would match "Sharma", "Sharma Bahadur", "Bishnu
      // Sharma", AND "Sharmaji" — false positives everywhere. Switched
      // to `equals` with `mode: "insensitive"` so only exact (case-
      // insensitive) name matches are returned. If the caller wants
      // substring matching, they can use the dedicated `search` endpoint.
      // We also normalize by trimming the input so "  Sharma  " matches
      // a stored "Sharma".
      const normalizedName = input.partyName.trim();
      const [vendorBills, subBills, payments] = await Promise.all([
        db.vendorBill.findMany({
          where: {
            projectId: { in: projectIds },
            OR: [
              { partner: { name: { equals: normalizedName, mode: "insensitive" } } },
              ...(input.partyPan ? [{ partner: { pan: input.partyPan } }] : []),
            ],
          },
          include: { project: { select: { id: true, name: true, code: true } } },
          orderBy: { billDate: "asc" },
        }),
        db.subcontractorBill.findMany({
          where: {
            projectId: { in: projectIds },
            OR: [
              { subcontractor: { name: { equals: normalizedName, mode: "insensitive" } } },
              ...(input.partyPan ? [{ subcontractor: { pan: input.partyPan } }] : []),
            ],
          },
          include: { project: { select: { id: true, name: true, code: true } } },
          orderBy: { billDate: "asc" },
        }),
        db.payment.findMany({
          where: {
            projectId: { in: projectIds },
            OR: [
              { payeeName: { equals: normalizedName, mode: "insensitive" } },
              ...(input.partyPan ? [{ partyPan: input.partyPan }] : []),
            ],
          },
          include: { project: { select: { id: true, name: true, code: true } } },
          orderBy: { paymentDate: "asc" },
        }),
      ]);

      const transactions: Array<{
        id: string;
        date: string;
        projectCode: string;
        voucherNo: string;
        voucherType: string;
        particulars: string;
        debit: number;
        credit: number;
        runningBalance: number;
      }> = [];

      vendorBills.forEach((b) => {
        transactions.push({
          id: b.id,
          date: b.billDate.toISOString(),
          projectCode: b.project.code,
          voucherNo: b.billNumber,
          voucherType: "Purchase Bill",
          particulars: `[${b.project.code}] Materials Bill #${b.billNumber} (Gross: ${b.grossAmount}, VAT: ${b.vatAmount}, TDS: ${b.tdsAmount})`,
          debit: 0,
          credit: b.netPayable,
          runningBalance: 0,
        });
      });

      subBills.forEach((b) => {
        transactions.push({
          id: b.id,
          date: b.billDate.toISOString(),
          projectCode: b.project.code,
          voucherNo: b.number,
          voucherType: "Subcontractor Bill",
          particulars: `[${b.project.code}] Certified Bill #${b.number} (Period: ${b.period || "Work Done"})`,
          debit: 0,
          credit: b.netPayable,
          runningBalance: 0,
        });
      });

      payments.forEach((p) => {
        transactions.push({
          id: p.id,
          date: p.paymentDate.toISOString(),
          projectCode: p.project.code,
          voucherNo: p.accountingVoucherNo || `PV-${p.id.slice(-5)}`,
          voucherType: "Payment Voucher",
          particulars: `[${p.project.code}] Paid via ${p.paymentMode} ${p.chequeNo ? `(Cheque #${p.chequeNo})` : ""} - TDS: ${p.tdsDeducted}`,
          debit: p.amount,
          credit: 0,
          runningBalance: 0,
        });
      });

      // Chronological sort
      transactions.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      let running = 0;
      transactions.forEach((t) => {
        running += t.credit - t.debit; // Credit increases payable, Debit reduces payable
        t.runningBalance = running;
      });

      const totalDebit = transactions.reduce((s, t) => s + t.debit, 0);
      const totalCredit = transactions.reduce((s, t) => s + t.credit, 0);

      return {
        partyName: input.partyName,
        partyPan: input.partyPan || null,
        transactions: transactions.reverse(),
        totalBilled: totalCredit,
        totalPaid: totalDebit,
        closingBalanceDue: running,
      };
    }),

  /** Company Bank Accounts List */
  orgBankAccounts: protectedProcedure.query(async ({ ctx }) => {
    const user = await db.user.findUniqueOrThrow({
      where: { id: ctx.user.id },
      select: { organizationId: true },
    });

    if (!user.organizationId) {
      return { accounts: [] };
    }

    const accounts = await db.companyBankAccount.findMany({
      where: { organizationId: user.organizationId },
      orderBy: { isDefault: "desc" },
    });

    return { accounts };
  }),

  /** Create a Company Bank Account */
  createBankAccount: protectedProcedure
    .input(
      z.object({
        bankName: z.string().min(1, "Bank name required"),
        accountNumber: z.string().min(1, "Account number required"),
        accountName: z.string().min(1, "Account name required"),
        accountType: z.enum(["current", "saving", "overdraft", "petty_cash"]).default("current"),
        branch: z.string().optional(),
        openingBalance: z.number().default(0),
        isDefault: z.boolean().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Bank accounts are org-wide financial assets — only org admins
      // should be able to create them.
      assertOrgAdmin(ctx.user);
      await assertNotLocked(ctx.user.organizationId);
      const user = await db.user.findUniqueOrThrow({
        where: { id: ctx.user.id },
        select: { organizationId: true },
      });

      if (!user.organizationId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "User does not belong to an organization." });
      }

      if (input.isDefault) {
        await db.companyBankAccount.updateMany({
          where: { organizationId: user.organizationId },
          data: { isDefault: false },
        });
      }

      const account = await db.companyBankAccount.create({
        data: {
          organizationId: user.organizationId,
          bankName: input.bankName.trim(),
          accountNumber: input.accountNumber.trim(),
          accountName: input.accountName.trim(),
          accountType: input.accountType,
          branch: input.branch?.trim() || null,
          openingBalance: input.openingBalance,
          currentBalance: input.openingBalance,
          isDefault: input.isDefault,
        },
      });

      return { account };
    }),

  /** Settle Multi-Project Bills from Organization Level (Central Cheque / Transfer) */
  orgSettleMultiBill: protectedProcedure
    .input(
      z.object({
        companyBankAccountId: z.string().optional(),
        paymentMode: z.enum(["cheque", "bank_transfer", "cash", "mobile_pay", "connectips"]),
        chequeNo: z.string().optional(),
        paymentDate: z.string(),
        paymentMiti: z.string().optional(),
        bills: z.array(
          z.object({
            billId: z.string(),
            billType: z.enum(["vendor", "subcontractor"]),
            projectId: z.string(),
            supplierName: z.string(),
            partyPan: z.string().optional().nullable(),
            billNumber: z.string(),
            amountToPay: z.number().positive(),
            tdsDeducted: z.number().default(0),
            netPaid: z.number().positive(),
          })
        ).min(1, "At least one bill must be selected"),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // SECURITY: org-wide settlement is an admin-tier financial action.
      // Caller must be an org admin AND belong to an organization.
      assertOrgAdmin(ctx.user);
      // Pass the payment date (not today) so back-dated payments to
      // locked fiscal years are correctly rejected. Previously this
      // used new Date() which let users bypass the lock by back-dating.
      await assertNotLocked(ctx.user.organizationId, input.paymentDate ? new Date(input.paymentDate) : new Date());
      const callerOrgId = ctx.user.organizationId;
      if (!callerOrgId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You don't belong to an organization." });
      }

      // SECURITY: if a bank account is specified, it must belong to the
      // caller's org — otherwise an org admin of Org A could pay Org B
      // bills by referencing Org B's bank account ID.
      if (input.companyBankAccountId) {
        const bank = await db.companyBankAccount.findUnique({
          where: { id: input.companyBankAccountId },
          select: { organizationId: true },
        });
        if (!bank || bank.organizationId !== callerOrgId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Bank account not found in your organization." });
        }
      }

      // SECURITY: every bill passed by the caller must be verified to
      // belong to a project in the caller's org. Without this, an
      // authenticated org admin could settle arbitrary bills across
      // tenants by their cuid (which leak via shared audit logs, search
      // results, etc.).
      const projectIds = Array.from(new Set(input.bills.map((b) => b.projectId)));
      const orgProjects = await db.project.findMany({
        where: { id: { in: projectIds }, organizationId: callerOrgId },
        select: { id: true },
      });
      const orgProjectIdSet = new Set(orgProjects.map((p) => p.id));
      for (const b of input.bills) {
        if (!orgProjectIdSet.has(b.projectId)) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Bill references a project outside your organization.",
          });
        }
      }

      // Fetch each bill and verify it belongs to the stated project + org
      // before mutating it. Previously this code called findUnique on
      // the bill ID with no project/org scoping, so a malicious caller
      // could pay an unrelated bill by cuid.
      for (const b of input.bills) {
        if (b.billType === "vendor") {
          const vb = await db.vendorBill.findUnique({
            where: { id: b.billId },
            select: { projectId: true },
          });
          if (!vb || !orgProjectIdSet.has(vb.projectId)) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Vendor bill not found." });
          }
        } else {
          const sb = await db.subcontractorBill.findUnique({
            where: { id: b.billId },
            select: { projectId: true },
          });
          if (!sb || !orgProjectIdSet.has(sb.projectId)) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Subcontractor bill not found." });
          }
        }
      }

      const totalDisbursement = input.bills.reduce((s, b) => s + b.netPaid, 0);

      // Perform updates inside a transaction
      await db.$transaction(async (tx) => {
        for (const b of input.bills) {
          // 1. Record payment for each bill linked to its specific project
          const payment = await tx.payment.create({
            data: {
              projectId: b.projectId,
              payeeType: b.billType,
              payeeName: b.supplierName,
              partyPan: b.partyPan,
              invoiceNumber: b.billNumber,
              amount: b.amountToPay,
              tdsDeducted: b.tdsDeducted,
              netPaid: b.netPaid,
              paymentDate: new Date(input.paymentDate),
              paymentMiti: input.paymentMiti,
              paymentMode: input.paymentMode,
              chequeNo: input.chequeNo,
              companyBankAccountId: input.companyBankAccountId || null,
              category: b.billType === "vendor" ? "Materials" : "Subcontractor",
              notes: input.notes
                ? `Central Org Payment: ${input.notes}`
                : `Central Cheque #${input.chequeNo || "Direct"} payment`,
              status: "paid",
            },
          });

          // 1b. Generate the journal entry for THIS bill's payment.
          // Previously the multi-bill settlement path recorded Payment
          // rows and updated bill statuses but never called
          // `createJournalEntry`, so the General Ledger / Trial Balance
          // silently missed every central cheque-run payment. The
          // single-bill paths (vendor-bill.ts, subcontractor-bill.ts)
          // already generate JEs — this brings the bulk path to parity.
          //
          // Dr Sundry Creditors (2001) / Subcontractor Payables (2002) = amountToPay
          //    Cr TDS Payable (2020) = tdsDeducted
          //    Cr Bank (1010) / Cash (1001) = netPaid
          const creditorAccountCode = b.billType === "vendor" ? "2001" : "2002";
          const creditorAccountName =
            b.billType === "vendor" ? "Sundry Creditors" : "Subcontractor Payables";
          const bankCode = input.paymentMode === "cash" ? "1001" : "1010";
          const bankName = input.paymentMode === "cash" ? "Cash" : "Bank";

          await createJournalEntry(tx, {
            source: "payment",
            sourceRefId: payment.id,
            sourceRefType: "Payment",
            description: `Central cheque run — ${b.billType} payment to ${b.supplierName} (${b.billNumber})`,
            entryDate: new Date(input.paymentDate),
            postedById: ctx.user.id,
            lines: [
              {
                accountCode: creditorAccountCode,
                accountName: creditorAccountName,
                debit: b.amountToPay,
                credit: 0,
                description: `Payment to ${b.supplierName} — bill ${b.billNumber}`,
                projectId: b.projectId,
              },
              ...(b.tdsDeducted > 0 ? [{
                accountCode: "2020" as const,
                accountName: "TDS Payable",
                debit: 0,
                credit: b.tdsDeducted,
                description: `TDS deducted on payment to ${b.supplierName}`,
                projectId: b.projectId,
              }] : []),
              {
                accountCode: bankCode,
                accountName: bankName,
                debit: 0,
                credit: b.netPaid,
                description: `Net payment via ${input.paymentMode}${input.chequeNo ? ` (cheque #${input.chequeNo})` : ""}`,
                projectId: b.projectId,
              },
            ],
          });

          // 2. Auto-settle VendorBill or SubcontractorBill
          if (b.billType === "vendor") {
            const vb = await tx.vendorBill.findUnique({ where: { id: b.billId } });
            if (vb) {
              const newPaid = vb.paidAmount + b.amountToPay;
              const isPaid = newPaid >= vb.netPayable - 0.01;
              await tx.vendorBill.update({
                where: { id: b.billId },
                data: {
                  paidAmount: newPaid,
                  status: isPaid ? "paid" : "partially_paid",
                },
              });
            }
          } else {
            const sb = await tx.subcontractorBill.findUnique({ where: { id: b.billId } });
            if (sb) {
              const newPaid = (sb.paidAmount || 0) + b.amountToPay;
              const isPaid = newPaid >= sb.netPayable - 0.01;
              await tx.subcontractorBill.update({
                where: { id: b.billId },
                data: {
                  paidAmount: newPaid,
                  status: isPaid ? "paid" : "partially_paid",
                },
              });
            }
          }
        }

        // 3. Decrement Central Company Bank Account balance if specified.
        // Use an atomic UPDATE ... = currentBalance - $1 instead of
        // read-then-write — otherwise two concurrent settle calls racing
        // on the same bank account produce a lost update.
        if (input.companyBankAccountId) {
          await tx.$executeRaw`
            UPDATE "CompanyBankAccount"
            SET "currentBalance" = "currentBalance" - ${totalDisbursement}
            WHERE "id" = ${input.companyBankAccountId}
          `;
        }
      });

      await audit({
        userId: ctx.user.id,
        projectId: undefined,
        action: "finance.orgSettleMultiBill",
        entityType: "organization",
        entityId: callerOrgId,
        metadata: {
          billCount: input.bills.length,
          totalDisbursement,
          paymentMode: input.paymentMode,
          chequeNo: input.chequeNo,
        },
      });

      return {
        ok: true,
        settledBillsCount: input.bills.length,
        totalDisbursement,
      };
    }),

  /** Head Office Expenses */
  listHeadOfficeExpenses: protectedProcedure.query(async ({ ctx }) => {
    const user = await db.user.findUniqueOrThrow({
      where: { id: ctx.user.id },
      select: { organizationId: true },
    });

    if (!user.organizationId) return { expenses: [], total: 0 };

    const expenses = await db.headOfficeExpense.findMany({
      where: { organizationId: user.organizationId },
      include: { bankAccount: true },
      orderBy: { date: "desc" },
    });

    const total = expenses.reduce((s, e) => s + e.amount, 0);

    return { expenses, total };
  }),

  createHeadOfficeExpense: protectedProcedure
    .input(
      z.object({
        category: z.string().min(1, "Category required"),
        particulars: z.string().min(1, "Particulars required"),
        amount: z.number().positive("Amount must be positive"),
        date: z.string(),
        miti: z.string().optional(),
        paymentMode: z.string().default("bank_transfer"),
        bankAccountId: z.string().optional(),
        chequeNo: z.string().optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      assertOrgAdmin(ctx.user);
      // Pass the expense date (not today) so back-dated expenses to
      // locked fiscal years are correctly rejected.
      await assertNotLocked(ctx.user.organizationId, input.date ? new Date(input.date) : new Date());
      const user = await db.user.findUniqueOrThrow({
        where: { id: ctx.user.id },
        select: { organizationId: true },
      });

      if (!user.organizationId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "No organization assigned." });
      }

      // Verify the bank account belongs to the caller's org.
      if (input.bankAccountId) {
        const bank = await db.companyBankAccount.findUnique({
          where: { id: input.bankAccountId },
          select: { organizationId: true },
        });
        if (!bank || bank.organizationId !== user.organizationId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Bank account not found in your organization." });
        }
      }

      // Wrap the expense creation + journal entry + bank balance decrement
      // in a single transaction so they're atomic. Previously these were
      // separate operations — if the JE failed, the expense was created
      // with no GL entry; if the bank decrement failed, the JE was posted
      // with no balance change. Now any failure rolls back all three.
      const expense = await db.$transaction(async (tx) => {
        const exp = await tx.headOfficeExpense.create({
          data: {
            organizationId: user.organizationId!,
            category: input.category,
            particulars: input.particulars,
            amount: input.amount,
            date: new Date(input.date),
            miti: input.miti || null,
            paymentMode: input.paymentMode,
            bankAccountId: input.bankAccountId || null,
            chequeNo: input.chequeNo || null,
            notes: input.notes || null,
          },
        });

        // Generate the journal entry for the head office expense.
        // Dr Head Office Overhead (6100 series based on category) NPR amount
        //    Cr Bank (1010) / Cash (1001) NPR amount
        //
        // We map the free-text `category` field to a chart-of-accounts code.
        // Unknown categories fall back to "6199" (Head Office - Misc).
        const hoAccountCode = hoOverheadCodeForCategory(input.category);
        const hoAccountName = accountNameForCode(hoAccountCode) || "Head Office Overhead";
        const bankCode = input.paymentMode === "cash" ? "1001" : "1010";
        const bankName = input.paymentMode === "cash" ? "Cash" : "Bank";

        await createJournalEntry(tx, {
          source: "head_office_expense",
          sourceRefId: exp.id,
          sourceRefType: "HeadOfficeExpense",
          description: `HO expense: ${input.particulars} (${input.category})`,
          entryDate: new Date(input.date),
          postedById: ctx.user.id,
          lines: [
            {
              accountCode: hoAccountCode,
              accountName: hoAccountName,
              debit: input.amount,
              credit: 0,
              description: input.particulars,
            },
            {
              accountCode: bankCode,
              accountName: bankName,
              debit: 0,
              credit: input.amount,
              description: `Paid via ${input.paymentMode}${input.chequeNo ? ` (cheque #${input.chequeNo})` : ""}`,
            },
          ],
        });

        // Atomic balance decrement inside the same transaction.
        if (input.bankAccountId) {
          await tx.$executeRaw`
            UPDATE "CompanyBankAccount"
            SET "currentBalance" = "currentBalance" - ${input.amount}
            WHERE "id" = ${input.bankAccountId}
          `;
        }

        return exp;
      });

      await audit({
        userId: ctx.user.id,
        projectId: undefined,
        action: "finance.createHeadOfficeExpense",
        entityType: "head_office_expense",
        entityId: expense.id,
        metadata: {
          category: input.category,
          amount: input.amount,
          paymentMode: input.paymentMode,
          bankAccountId: input.bankAccountId || null,
        },
      });

      return { expense };
    }),
});

