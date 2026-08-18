// @ts-nocheck
/**
 * tRPC router for Project Dashboard — aggregates data for transparency dashboards.
 *
 * Endpoints:
 *   - activityFeed: recent audit logs for a project
 *   - costVsBudget: actual costs (ProjectCost) vs budget (BOQ amounts) by category
 *   - rfiMetrics: RFI response time stats + overdue RFIs
 *   - progressSCurve: planned vs actual cumulative progress over time
 */
import { z } from "zod";
import { router, protectedProcedure } from "@/server/trpc";
import { db } from "@/lib/db";
import { assertProjectMember } from "@/lib/authz";

export const dashboardRouter = router({
  /** Activity Feed — recent audit logs for a project. */
  activityFeed: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      limit: z.number().min(1).max(200).default(50),
      action: z.string().optional(), // filter by action prefix (e.g. "rfi.", "daily_report.")
    }))
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);

      const where: any = { projectId: input.projectId };
      if (input.action) {
        where.action = { startsWith: input.action };
      }

      const logs = await db.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: input.limit,
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
      });

      return { logs };
    }),

  /** Cost vs Budget — actual costs vs BOQ budget amounts, broken down by category. */
  costVsBudget: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);

      // Get all project costs grouped by category
      const costs = await db.projectCost.findMany({
        where: { projectId: input.projectId },
        select: { amount: true, category: true, date: true },
      });

      const byCategory: Record<string, number> = {};
      for (const c of costs) {
        byCategory[c.category] = (byCategory[c.category] ?? 0) + c.amount;
      }
      const totalActual = costs.reduce((s, c) => s + c.amount, 0);

      // Get BOQ total (budget)
      const boqItems = await db.boqItem.findMany({
        where: { projectId: input.projectId },
        select: { amount: true, category: true, section: true },
      });
      const totalBudget = boqItems.reduce((s, b) => s + b.amount, 0);

      // Group BOQ by section for section-level variance
      const budgetBySection: Record<string, number> = {};
      for (const b of boqItems) {
        const key = b.section || b.category || "Uncategorized";
        budgetBySection[key] = (budgetBySection[key] ?? 0) + b.amount;
      }

      // Get project contract value (for overall comparison)
      const project = await db.project.findUnique({
        where: { id: input.projectId },
        select: { contractValue: true, startDate: true, endDate: true },
      });

      // Calculate time-based burn rate (daily cost for last 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const recentCosts = costs.filter(c => new Date(c.date) >= thirtyDaysAgo);
      const last30DaysTotal = recentCosts.reduce((s, c) => s + c.amount, 0);
      const dailyBurnRate = last30DaysTotal / 30;

      // Project duration for linear budget pacing
      const totalDays = project?.startDate && project?.endDate
        ? Math.max(1, Math.round((new Date(project.endDate).getTime() - new Date(project.startDate).getTime()) / 86400000))
        : 1;
      const expectedDailyBudget = totalBudget / totalDays;

      return {
        totalBudget,
        totalActual,
        totalVariance: totalBudget - totalActual,
        variancePct: totalBudget > 0 ? Math.round(((totalBudget - totalActual) / totalBudget) * 100) : 0,
        byCategory,
        budgetBySection,
        contractValue: project?.contractValue ?? 0,
        dailyBurnRate,
        expectedDailyBudget,
        burnRatePct: expectedDailyBudget > 0 ? Math.round((dailyBurnRate / expectedDailyBudget) * 100) : 0,
      };
    }),

  /** RFI Metrics — response time, overdue count, status breakdown. */
  rfiMetrics: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);

      const rfis = await db.rfi.findMany({
        where: { projectId: input.projectId },
        select: {
          id: true,
          number: true,
          subject: true,
          status: true,
          priority: true,
          submittedAt: true,
          respondedAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
      });

      // Status breakdown
      const byStatus: Record<string, number> = {};
      for (const r of rfis) {
        byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
      }

      // Response time stats (for submitted+ RFIs with both timestamps)
      const responseTimes: number[] = [];
      for (const r of rfis) {
        if (r.submittedAt && r.respondedAt) {
          const hours = (new Date(r.respondedAt).getTime() - new Date(r.submittedAt).getTime()) / 3600000;
          responseTimes.push(hours);
        }
      }

      const avgResponseHours = responseTimes.length > 0
        ? responseTimes.reduce((s, h) => s + h, 0) / responseTimes.length
        : 0;
      const maxResponseHours = responseTimes.length > 0 ? Math.max(...responseTimes) : 0;
      const minResponseHours = responseTimes.length > 0 ? Math.min(...responseTimes) : 0;

      // Overdue RFIs (submitted but not responded, > 48 hours for normal, > 24 for urgent)
      const now = new Date();
      const overdue = rfis.filter(r => {
        if (r.status !== "submitted" || !r.submittedAt) return false;
        const hoursSinceSubmit = (now.getTime() - new Date(r.submittedAt).getTime()) / 3600000;
        const threshold = r.priority === "urgent" ? 24 : r.priority === "high" ? 36 : 48;
        return hoursSinceSubmit > threshold;
      });

      return {
        total: rfis.length,
        byStatus,
        avgResponseHours: Math.round(avgResponseHours),
        maxResponseHours: Math.round(maxResponseHours),
        minResponseHours: Math.round(minResponseHours),
        respondedCount: responseTimes.length,
        overdue: overdue.map(r => ({
          id: r.id,
          number: r.number,
          subject: r.subject,
          priority: r.priority,
          submittedAt: r.submittedAt,
          hoursOverdue: Math.round((now.getTime() - new Date(r.submittedAt!).getTime()) / 3600000),
        })),
      };
    }),

  /** Progress S-Curve — planned vs actual cumulative progress over time. */
  progressSCurve: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);

      // Get all Gantt tasks for the active version
      const activeVersion = await db.ganttVersion.findFirst({
        where: { projectId: input.projectId, isActive: true },
        select: { id: true },
      });

      const versionId = activeVersion?.id;
      if (!versionId) {
        return { planned: [], actual: [], summary: { totalPlanned: 0, totalActual: 0, avgProgress: 0 } };
      }

      const tasks = await db.ganttTask.findMany({
        where: { projectId: input.projectId, versionId },
        select: {
          id: true,
          startDate: true,
          endDate: true,
          duration: true,
          progress: true,
          plannedValue: true,
          boqLinks: { select: { quantity: true, boqItem: { select: { amount: true } } } },
        },
      });

      if (tasks.length === 0) {
        return { planned: [], actual: [], summary: { totalPlanned: 0, totalActual: 0, avgProgress: 0 } };
      }

      // Calculate total planned value
      const totalPlannedValue = tasks.reduce((s, t) => {
        const boqValue = t.boqLinks.reduce((bs, bl) => bs + (bl.boqItem?.amount || 0), 0);
        return s + (t.plannedValue || boqValue);
      }, 0);

      // Build planned S-curve: for each week from project start to end,
      // calculate cumulative planned value based on task durations
      const projectStart = tasks.reduce((min: Date, t) => t.startDate < min ? t.startDate : min, tasks[0].startDate);
      const projectEnd = tasks.reduce((max: Date, t) => t.endDate > max ? t.endDate : max, tasks[0].endDate);
      const totalDays = Math.max(1, Math.round((projectEnd.getTime() - projectStart.getTime()) / 86400000));

      // Sample every 7 days (weekly)
      const plannedCurve: { date: string; value: number; pct: number }[] = [];
      const weeks = Math.ceil(totalDays / 7);
      for (let w = 0; w <= weeks; w++) {
        const date = new Date(projectStart);
        date.setDate(date.getDate() + w * 7);
        if (date > projectEnd) date.setTime(projectEnd.getTime());

        // Sum planned value of tasks that should be complete by this date
        let cumulativePlanned = 0;
        for (const t of tasks) {
          const taskStart = new Date(t.startDate);
          const taskEnd = new Date(t.endDate);
          if (date >= taskEnd) {
            // Fully complete
            const boqValue = t.boqLinks.reduce((bs, bl) => bs + (bl.boqItem?.amount || 0), 0);
            cumulativePlanned += t.plannedValue || boqValue;
          } else if (date > taskStart) {
            // Partially complete (linear distribution)
            const taskDuration = Math.max(1, (taskEnd.getTime() - taskStart.getTime()) / 86400000);
            const elapsed = (date.getTime() - taskStart.getTime()) / 86400000;
            const pct = Math.min(1, elapsed / taskDuration);
            const boqValue = t.boqLinks.reduce((bs, bl) => bs + (bl.boqItem?.amount || 0), 0);
            cumulativePlanned += (t.plannedValue || boqValue) * pct;
          }
        }

        plannedCurve.push({
          date: date.toISOString(),
          value: Math.round(cumulativePlanned),
          pct: totalPlannedValue > 0 ? Math.round((cumulativePlanned / totalPlannedValue) * 100) : 0,
        });
      }

      // Build actual curve from daily reports
      const reports = await db.dailyReport.findMany({
        where: {
          projectId: input.projectId,
          status: { in: ["submitted", "approved", "archived"] },
        },
        select: {
          reportDate: true,
          workProgress: true,
        },
        orderBy: { reportDate: "asc" },
      });

      // For each report, calculate the material cost (as proxy for earned value)
      // We use the BOQ ingredient cost × actualQty as "earned value"
      const boqItems = await db.boqItem.findMany({
        where: { projectId: input.projectId },
        include: { ingredients: { where: { type: "material" } } },
      });
      const boqMap = new Map(boqItems.map(b => [b.code, b]));

      let cumulativeActual = 0;
      const actualCurve: { date: string; value: number; pct: number }[] = [];

      for (const report of reports) {
        let dayValue = 0;
        try {
          const progress = JSON.parse(report.workProgress || "[]");
          if (Array.isArray(progress)) {
            for (const p of progress) {
              const actualQty = Number(p.actualQty) || 0;
              if (actualQty <= 0) continue;
              const boqItem = boqMap.get(p.boqCode);
              if (!boqItem) continue;
              // Earned value = actualQty × BOQ rate
              dayValue += actualQty * boqItem.rate;
            }
          }
        } catch { /* ignore */ }

        cumulativeActual += dayValue;
        actualCurve.push({
          date: new Date(report.reportDate).toISOString(),
          value: Math.round(cumulativeActual),
          pct: totalPlannedValue > 0 ? Math.round((cumulativeActual / totalPlannedValue) * 100) : 0,
        });
      }

      const avgProgress = tasks.length > 0
        ? Math.round(tasks.reduce((s, t) => s + t.progress, 0) / tasks.length)
        : 0;

      return {
        planned: plannedCurve,
        actual: actualCurve,
        summary: {
          totalPlanned: Math.round(totalPlannedValue),
          totalActual: cumulativeActual,
          avgProgress,
          projectStart: projectStart.toISOString(),
          projectEnd: projectEnd.toISOString(),
        },
      };
    }),

  // ─────────────────────────────────────────────────────────
  // DELAY REGISTER
  // ─────────────────────────────────────────────────────────

  /** Delay Register — tasks with execution delays (partial/uncompleted/postponed). */
  delayRegister: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);

      const tasks = await db.dailyProgramTask.findMany({
        where: {
          program: { projectId: input.projectId },
          executionStatus: { in: ["partially_completed", "uncompleted", "postponed"] },
        },
        include: {
          program: { select: { programDate: true, status: true } },
          rfi: { select: { id: true, number: true, subject: true } },
          ganttTask: { select: { id: true, code: true, name: true } },
          boqItem: { select: { code: true, description: true, unit: true } },
          subcontractor: { select: { id: true, name: true } },
        },
        orderBy: { program: { programDate: "desc" } },
        take: 100,
      });

      const delays = tasks.map(t => {
        const planned = t.plannedQty || 0;
        const actual = t.actualQty || 0;
        const remaining = Math.max(0, planned - actual);
        const delayDays = t.delayReason ? 1 : 0; // simplified
        return {
          id: t.id,
          taskName: t.taskName,
          date: t.program?.programDate,
          boqCode: t.boqCode,
          boqDesc: t.boqDesc,
          location: t.location,
          plannedQty: planned,
          actualQty: actual,
          remainingQty: remaining,
          unit: t.unit,
          executionStatus: t.executionStatus,
          delayReason: t.delayReason,
          delayNotes: t.delayNotes,
          isEotCandidate: t.isEotCandidate,
          rfiNumber: t.rfi?.number,
          ganttTaskCode: t.ganttTask?.code,
          ganttTaskName: t.ganttTask?.name,
          subcontractorName: t.subcontractor?.name,
        };
      });

      const stats = {
        total: delays.length,
        byStatus: {
          partially_completed: delays.filter(d => d.executionStatus === "partially_completed").length,
          uncompleted: delays.filter(d => d.executionStatus === "uncompleted").length,
          postponed: delays.filter(d => d.executionStatus === "postponed").length,
        },
        eotCandidates: delays.filter(d => d.isEotCandidate).length,
        byReason: delays.reduce((acc, d) => {
          if (d.delayReason) acc[d.delayReason] = (acc[d.delayReason] ?? 0) + 1;
          return acc;
        }, {} as Record<string, number>),
      };

      return { delays, stats };
    }),

  // ─────────────────────────────────────────────────────────
  // QUALITY TEST REGISTER
  // ─────────────────────────────────────────────────────────

  /** Quality Test Register — material test results from daily reports. */
  qualityTestRegister: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);

      const reports = await db.dailyReport.findMany({
        where: { projectId: input.projectId },
        select: {
          number: true,
          reportDate: true,
          materialReceived: true,
        },
        orderBy: { reportDate: "desc" },
        take: 100,
      });

      const tests: any[] = [];
      for (const report of reports) {
        if (!report.materialReceived) continue;
        try {
          const materials = JSON.parse(report.materialReceived);
          if (!Array.isArray(materials)) continue;
          for (const m of materials) {
            if (m.testStatus && m.testStatus !== "na") {
              tests.push({
                reportNumber: report.number,
                reportDate: report.reportDate,
                materialName: m.name,
                qty: m.qty,
                unit: m.unit,
                supplier: m.supplier,
                vehicleNo: m.vehicleNo,
                testStatus: m.testStatus,
              });
            }
          }
        } catch { /* ignore */ }
      }

      const stats = {
        total: tests.length,
        passed: tests.filter(t => t.testStatus === "passed").length,
        failed: tests.filter(t => t.testStatus === "failed").length,
        pending: tests.filter(t => t.testStatus === "pending").length,
        passRate: tests.length > 0 ? Math.round((tests.filter(t => t.testStatus === "passed").length / tests.length) * 100) : 0,
      };

      return { tests, stats };
    }),

  // ─────────────────────────────────────────────────────────
  // PHOTOGRAPHIC TIMELINE
  // ─────────────────────────────────────────────────────────

  /** Photographic Timeline — site photos from daily report attachments. */
  photoTimeline: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      limit: z.number().min(1).max(200).default(50),
    }))
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);

      const attachments = await db.dailyReportAttachment.findMany({
        where: {
          report: { projectId: input.projectId },
          fileType: { startsWith: "image/" },
        },
        include: {
          report: { select: { number: true, reportDate: true } },
        },
        orderBy: { uploadedAt: "desc" },
        take: input.limit,
      });

      const photos = attachments.map(a => ({
        id: a.id,
        fileName: a.fileName,
        fileType: a.fileType,
        fileSize: a.fileSize,
        reportNumber: a.report.number,
        reportDate: a.report.reportDate,
        uploadedAt: a.uploadedAt,
        latitude: a.latitude,
        longitude: a.longitude,
        takenAt: a.takenAt,
        // Note: data field is intentionally NOT included here (too large for list view)
        // Use the existing attachment download endpoint to get the actual image
      }));

      // Group by date for timeline
      const byDate: Record<string, typeof photos> = {};
      for (const p of photos) {
        const dateKey = new Date(p.reportDate).toISOString().slice(0, 10);
        if (!byDate[dateKey]) byDate[dateKey] = [];
        byDate[dateKey].push(p);
      }

      return {
        photos,
        byDate,
        total: photos.length,
        withGeo: photos.filter(p => p.latitude != null && p.longitude != null).length,
      };
    }),

  // ─────────────────────────────────────────────────────────
  // CASH FLOW FORECAST
  // ─────────────────────────────────────────────────────────

  /** Cash Flow Forecast — IPC billing vs actual costs over time. */
  cashFlow: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);

      // Get all IPCs (billing/revenue)
      const ipcs = await db.ipc.findMany({
        where: { projectId: input.projectId },
        select: {
          number: true,
          period: true,
          status: true,
          grossAmount: true,
          retentionAmount: true,
          advanceRecovery: true,
          netPayable: true,
          issueDate: true,
        },
        orderBy: { issueDate: "asc" },
      });

      // Get all project costs by month
      const costs = await db.projectCost.findMany({
        where: { projectId: input.projectId },
        select: { amount: true, date: true, category: true },
      });

      // Group costs by month
      const costsByMonth: Record<string, number> = {};
      for (const c of costs) {
        const monthKey = new Date(c.date).toISOString().slice(0, 7); // YYYY-MM
        costsByMonth[monthKey] = (costsByMonth[monthKey] ?? 0) + c.amount;
      }

      // Group IPC billing by month
      const billingByMonth: Record<string, number> = {};
      for (const ipc of ipcs) {
        if (!ipc.issueDate) continue;
        const monthKey = new Date(ipc.issueDate).toISOString().slice(0, 7);
        billingByMonth[monthKey] = (billingByMonth[monthKey] ?? 0) + ipc.netPayable;
      }

      // Build combined timeline
      const allMonths = new Set([...Object.keys(costsByMonth), ...Object.keys(billingByMonth)]);
      const sortedMonths = Array.from(allMonths).sort();

      const timeline = sortedMonths.map(month => {
        const billed = billingByMonth[month] ?? 0;
        const spent = costsByMonth[month] ?? 0;
        return {
          month,
          billed,
          spent,
          net: billed - spent,
          cumulative: 0, // calculated below
        };
      });

      // Calculate cumulative
      let cumulative = 0;
      for (const t of timeline) {
        cumulative += t.net;
        t.cumulative = cumulative;
      }

      // Summary
      const totalBilled = ipcs.reduce((s, i) => s + i.netPayable, 0);
      const totalSpent = costs.reduce((s, c) => s + c.amount, 0);
      const totalRetention = ipcs.reduce((s, i) => s + i.retentionAmount, 0);
      const totalAdvanceRecovered = ipcs.reduce((s, i) => s + i.advanceRecovery, 0);

      return {
        timeline,
        summary: {
          totalBilled,
          totalSpent,
          netCashFlow: totalBilled - totalSpent,
          totalRetention,
          totalAdvanceRecovered,
          pendingIPCs: ipcs.filter(i => i.status === "draft" || i.status === "submitted").length,
          certifiedIPCs: ipcs.filter(i => i.status === "certified" || i.status === "approved").length,
          paidIPCs: ipcs.filter(i => i.status === "paid").length,
        },
      };
    }),

  // ─────────────────────────────────────────────────────────
  // ENHANCED VISITOR LOG
  // ─────────────────────────────────────────────────────────

  /** Enhanced Visitor Log — all site visitors across daily reports. */
  visitorLog: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);

      const reports = await db.dailyReport.findMany({
        where: { projectId: input.projectId },
        select: {
          number: true,
          reportDate: true,
          siteVisits: true,
        },
        orderBy: { reportDate: "desc" },
        take: 200,
      });

      const visitors: any[] = [];
      for (const report of reports) {
        if (!report.siteVisits) continue;
        try {
          const visits = JSON.parse(report.siteVisits);
          if (!Array.isArray(visits)) continue;
          for (const v of visits) {
            if (!v.visitor && !v.organization) continue;
            visitors.push({
              reportNumber: report.number,
              reportDate: report.reportDate,
              visitor: v.visitor || "—",
              organization: v.organization || "—",
              purpose: v.purpose || "—",
              timeIn: v.timeIn || "—",
              timeOut: v.timeOut || "—",
            });
          }
        } catch { /* ignore */ }
      }

      // Group by organization
      const byOrg: Record<string, number> = {};
      for (const v of visitors) {
        byOrg[v.organization] = (byOrg[v.organization] ?? 0) + 1;
      }

      return {
        visitors,
        total: visitors.length,
        uniqueOrganizations: Object.keys(byOrg).length,
        byOrg,
      };
    }),
});
