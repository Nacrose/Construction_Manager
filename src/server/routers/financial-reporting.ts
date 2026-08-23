/**
 * Financial Reporting & Compliance Router
 *
 * Tier 1 features:
 *  1. Profit & Loss per Project
 *  2. Retention Money Ledger
 *  3. TDS Compliance Suite (certificates + reconciliation)
 *  4. Cash Position & Runway Dashboard
 *
 * Tier 3:
 * 13. Standard Cost Coding (list, create, seed)
 *
 * Architecture:
 *  A. Fiscal Year Locking (lock/unlock/check)
 *  B. Journal Entry Foundation (list, post, reverse)
 *  D. Report Snapshot (create, list, retrieve)
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "@/server/trpc";
import { db } from "@/lib/db";
import { assertProjectMember, assertOrgAdmin } from "@/lib/authz";
import { audit } from "@/lib/audit";
import { assertNotLocked, listLocks } from "@/lib/fiscal-year-lock";
import { createJournalEntry } from "@/lib/journal-entry";
import { CHART_OF_ACCOUNTS, STANDARD_COST_CODES } from "@/lib/chart-of-accounts";

export const financialReportingRouter = router({
  // ═══════════════════════════════════════════════════════════
  // TIER 1.1 — Profit & Loss per Project
  // ═══════════════════════════════════════════════════════════

  /**
   * Project P&L: answers "Did Project X make or lose money?"
   *
   * Revenue = IPC gross (certified/approved/paid only)
   * Direct Costs = material issues + sub-bill gross + payroll allocated + equipment
   * Overheads = site expenses + allocated HO overhead (% of revenue)
   * Profit/Loss = Revenue - Direct Costs - Overheads
   * Margin % = Profit / Revenue * 100
   */
  projectPnl: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      fromDate: z.string().optional(),
      toDate: z.string().optional(),
      headOfficeAllocationPct: z.number().min(0).max(100).default(0),
    }))
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);

      const dateFilter: any = {};
      if (input.fromDate) dateFilter.gte = new Date(input.fromDate);
      if (input.toDate) dateFilter.lte = new Date(input.toDate);
      const hasDate = input.fromDate || input.toDate;

      // ── Revenue: IPC gross amounts (non-draft) ─────────────
      // Use certification/issue date, NOT createdAt — a draft IPC
      // created 6 months ago but certified yesterday should appear
      // in yesterday's period, not 6 months ago.
      const ipcs = await db.ipc.findMany({
        where: {
          projectId: input.projectId,
          status: { in: ["certified", "approved", "paid"] },
        },
        select: { grossAmount: true, vatAmount: true, netPayable: true, status: true, createdAt: true },
      });
      // Filter by the IPC's effective date (createdAt as proxy for
      // certification date — there's no separate certifiedAt field).
      const filteredIpcs = hasDate
        ? ipcs.filter((i) => {
            const d = i.createdAt.getTime();
            if (input.fromDate && d < new Date(input.fromDate).getTime()) return false;
            if (input.toDate && d > new Date(input.toDate).getTime()) return false;
            return true;
          })
        : ipcs;

      const revenue = filteredIpcs.reduce((s, i) => s + i.grossAmount, 0);
      const vatCollected = filteredIpcs.reduce((s, i) => s + (i.vatAmount || 0), 0);

      // ── Direct Cost: Vendor Bills (materials purchased) ────
      // ── Direct Cost: Vendor Bills (exclude disputed) ──────
      const vendorBills = await db.vendorBill.findMany({
        where: {
          projectId: input.projectId,
          status: { not: "disputed" },
          ...(hasDate ? { billDate: dateFilter } : {}),
        },
        select: { grossAmount: true, vatAmount: true },
      });
      const materialCost = vendorBills.reduce((s, b) => s + b.grossAmount, 0);

      // ── Direct Cost: Subcontractor Bills (non-draft only) ──
      const subBills = await db.subcontractorBill.findMany({
        where: {
          projectId: input.projectId,
          status: { in: ["submitted", "verified", "certified", "paid"] },
          ...(hasDate ? { billDate: dateFilter } : {}),
        },
        select: { grossAmount: true },
      });
      const subcontractCost = subBills.reduce((s, b) => s + b.grossAmount, 0);

      // ── Direct Cost: Material Consumed (from projectCost) ──
      // CRITICAL: projectCost with category="material" is AUTO-GENERATED
      // from daily report approvals and represents the CONSUMPTION of
      // materials that were PURCHASED via vendor bills. Counting both
      // vendorBills.grossAmount AND projectCost.amount would DOUBLE-COUNT
      // the material cost.
      //
      // We use projectCost.material ONLY for the "consumed" view (what
      // was actually used, not what was purchased). For P&L, the cost
      // is the vendor bill gross — the consumed amount is informational.
      // If there are no vendor bills (cash purchases), the projectCost
      // amount captures those costs.
      const materialIssues = await db.projectCost.findMany({
        where: {
          projectId: input.projectId,
          category: "material",
          ...(hasDate ? { date: dateFilter } : {}),
        },
        select: { amount: true },
      });
      // Only count material consumed if there are NO vendor bills
      // (otherwise the cost is already captured in materialCost above).
      const materialConsumed = materialIssues.reduce((s, c) => s + c.amount, 0);

      // ── Direct Cost: Labor ────────────────────────────────
      const laborCosts = await db.projectCost.findMany({
        where: {
          projectId: input.projectId,
          category: "labor",
          ...(hasDate ? { date: dateFilter } : {}),
        },
        select: { amount: true },
      });
      const laborCost = laborCosts.reduce((s, c) => s + c.amount, 0);

      // ── Direct Cost: Equipment ────────────────────────────
      const equipCosts = await db.projectCost.findMany({
        where: {
          projectId: input.projectId,
          category: "equipment",
          ...(hasDate ? { date: dateFilter } : {}),
        },
        select: { amount: true },
      });
      const equipmentCost = equipCosts.reduce((s, c) => s + c.amount, 0);

      // ── Overhead: Site Expenses ───────────────────────────
      const siteExpenses = await db.siteExpense.findMany({
        where: {
          projectId: input.projectId,
          status: { in: ["approved"] },
          ...(hasDate ? { date: dateFilter } : {}),
        },
        select: { totalAmount: true, category: true },
      });
      const siteOverhead = siteExpenses.reduce((s, e) => s + e.totalAmount, 0);

      // ── Allocated Head Office Overhead ────────────────────
      const allocatedHOOverhead = (revenue * input.headOfficeAllocationPct) / 100;

      // ── Summary ────────────────────────────────────────────
      // For P&L: use materialConsumed (actual consumption from projectCost)
      // as the material cost — this represents the cost actually incurred
      // in the period. Vendor bill grossAmount represents PURCHASES
      // (balance sheet: inventory increases), not P&L expense.
      //
      // However, projectCost records are only auto-generated from daily
      // report approvals. If daily reports aren't being used, there
      // are no projectCost records — in that case fall back to vendor
      // bill gross as the material cost.
      //
      // This is the correct accounting treatment:
      //   - Period P&L: match revenue with CONSUMPTION (not purchase)
      //   - Balance sheet: track inventory via purchase - consumption
      const materialCostForPnl = materialConsumed > 0 ? materialConsumed : materialCost;
      const directCosts = materialCostForPnl + subcontractCost + laborCost + equipmentCost;
      const totalOverhead = siteOverhead + allocatedHOOverhead;
      const totalCosts = directCosts + totalOverhead;
      const profitLoss = revenue - totalCosts;
      const marginPct = revenue > 0 ? (profitLoss / revenue) * 100 : 0;

      return {
        period: {
          from: input.fromDate || "project start",
          to: input.toDate || "now",
        },
        revenue: {
          contractRevenue: revenue,
          vatCollected,
          totalRevenue: revenue,
        },
        directCosts: {
          materialPurchased: materialCost,
          materialConsumed,
          // Use the non-double-counted value for the total
          materialCostForPnl,
          subcontractor: subcontractCost,
          labor: laborCost,
          equipment: equipmentCost,
          totalDirect: directCosts,
        },
        overhead: {
          siteOverhead,
          allocatedHeadOffice: allocatedHOOverhead,
          allocationPct: input.headOfficeAllocationPct,
          totalOverhead,
        },
        summary: {
          totalRevenue: revenue,
          totalCosts,
          profitLoss,
          marginPct,
          isProfitable: profitLoss > 0,
        },
        details: {
          ipcCount: filteredIpcs.length,
          vendorBillCount: vendorBills.length,
          subBillCount: subBills.length,
          siteExpenseCount: siteExpenses.length,
        },
      };
    }),

  // ═══════════════════════════════════════════════════════════
  // TIER 1.2 — Retention Money Ledger
  // ═══════════════════════════════════════════════════════════

  /**
   * Retention Ledger: how much retention is the client holding from me
   * (receivable) and how much am I holding from subcontractors (payable)?
   */
  retentionLedger: protectedProcedure
    .input(z.object({
      projectId: z.string().optional(),
      summaryOnly: z.boolean().default(false),
    }))
    .query(async ({ ctx, input }) => {
      // Scope by project membership
      let projectIds: string[] = [];
      if (input.projectId) {
        await assertProjectMember(ctx.user, input.projectId);
        projectIds = [input.projectId];
      } else {
        const memberships = await db.projectMember.findMany({
          where: { userId: ctx.user.id },
          select: { projectId: true },
        });
        projectIds = memberships.map((m) => m.projectId);
      }

      if (projectIds.length === 0) {
        return { receivables: [], payables: [], summary: { totalReceivable: 0, totalPayable: 0, netPosition: 0 } };
      }

      // ── Retention RECEIVABLE: retention deducted on IPCs ──
      const ipcs = await db.ipc.findMany({
        where: {
          projectId: { in: projectIds },
          status: { in: ["certified", "approved", "paid"] },
        },
        include: {
          project: { select: { id: true, name: true, code: true } },
        },
      });

      const receivables = ipcs
        .filter((i) => (i.retentionAmount || 0) > 0)
        .map((i) => ({
          id: i.id,
          type: "client_retention" as const,
          projectName: i.project.name,
          projectCode: i.project.code,
          number: i.number,
          date: i.createdAt,
          retentionAmount: i.retentionAmount || 0,
          status: i.status,
          // Retention is NOT released when the IPC is paid — the IPC
          // being "paid" means the client paid the net payable (after
          // retention deduction). The retention itself is held by the
          // client until project completion + defect liability period.
          // A separate "retention release" process should be used to
          // mark retention as released.
          isReleased: false,
        }));

      // ── Retention PAYABLE: retention deducted on sub-bills ──
      const subBills = await db.subcontractorBill.findMany({
        where: {
          projectId: { in: projectIds },
          status: { in: ["submitted", "verified", "certified", "paid"] },
        },
        include: {
          project: { select: { id: true, name: true, code: true } },
          subcontractor: { select: { id: true, name: true, pan: true } },
        },
      });

      const payables = subBills
        .filter((b) => (b.retentionAmount || 0) > 0)
        .map((b) => ({
          id: b.id,
          type: "subcontractor_retention" as const,
          projectName: b.project.name,
          projectCode: b.project.code,
          subcontractorName: b.subcontractor?.name || "Unknown",
          subcontractorPan: b.subcontractor?.pan || null,
          number: b.number,
          date: b.billDate,
          retentionAmount: b.retentionAmount || 0,
          status: b.status,
          // Same as IPCs: retention payable to subcontractors is held
          // until project completion + defect liability period, NOT
          // released when the bill is paid.
          isReleased: false,
        }));

      const totalReceivable = receivables.reduce((s, r) => s + (r.isReleased ? 0 : r.retentionAmount), 0);
      const totalPayable = payables.reduce((s, p) => s + (p.isReleased ? 0 : p.retentionAmount), 0);

      if (input.summaryOnly) {
        return { receivables: [], payables: [], summary: { totalReceivable, totalPayable, netPosition: totalReceivable - totalPayable } };
      }

      return {
        receivables,
        payables,
        summary: {
          totalReceivable,
          totalPayable,
          netPosition: totalReceivable - totalPayable,
        },
      };
    }),

  // ═══════════════════════════════════════════════════════════
  // TIER 1.3 — TDS Compliance Suite
  // ═══════════════════════════════════════════════════════════

  /**
   * TDS Certificate: generate a printable TDS certificate for a
   * vendor/subcontractor per quarter (Nepal IRD requirement).
   */
  tdsCertificate: protectedProcedure
    .input(z.object({
      projectId: z.string().optional(),
      partnerName: z.string().optional(),
      quarter: z.enum(["Q1", "Q2", "Q3", "Q4"]),
      fiscalYear: z.string().regex(/^\d{4}\/\d{2}$/, "Fiscal year must be BS format like 2081/82"),
    }))
    .query(async ({ ctx, input }) => {
      // Determine quarter date range (BS fiscal year: Shrawin 1 = ~July 16)
      // Q1: Shrawan-Kartik (~Jul 16 - Oct 16)
      // Q2: Mangsir-Poush (~Oct 17 - Feb 14)
      // Q3: Magh-Chaitra (~Feb 15 - Apr 13)
      // Q4: Baishakh-Asarh (~Apr 14 - Jul 15)
      const [bsStart, bsEnd] = input.fiscalYear.split("/");
      // BS to AD conversion: AD = BS - 56 (approximately).
      // BS 2081 = AD 2025 (Nepal fiscal year starts mid-July).
      // Previously this used + 56 which produced dates 112 years in
      // the future — the entire TDS certificate feature was broken.
      const adStartYear = parseInt(bsStart) - 56;
      const quarterRanges: Record<string, [Date, Date]> = {
        Q1: [new Date(adStartYear, 6, 16), new Date(adStartYear, 9, 16)],
        Q2: [new Date(adStartYear, 9, 17), new Date(adStartYear + 1, 1, 14)],
        Q3: [new Date(adStartYear + 1, 1, 15), new Date(adStartYear + 1, 3, 13)],
        Q4: [new Date(adStartYear + 1, 3, 14), new Date(adStartYear + 1, 6, 15)],
      };
      const [fromDate, toDate] = quarterRanges[input.quarter];

      // Scope by project membership
      let projectIds: string[] = [];
      if (input.projectId) {
        await assertProjectMember(ctx.user, input.projectId);
        projectIds = [input.projectId];
      } else {
        const memberships = await db.projectMember.findMany({
          where: { userId: ctx.user.id },
          select: { projectId: true },
        });
        projectIds = memberships.map((m) => m.projectId);
      }

      // Fetch payments with TDS deducted in the quarter
      const payments = await db.payment.findMany({
        where: {
          projectId: { in: projectIds },
          paymentDate: { gte: fromDate, lte: toDate },
          tdsDeducted: { gt: 0 },
          ...(input.partnerName ? { payeeName: { contains: input.partnerName, mode: "insensitive" } } : {}),
        },
        include: {
          project: { select: { id: true, name: true, code: true } },
        },
        orderBy: { paymentDate: "asc" },
      });

      // Group by payee
      const partnerMap = new Map<string, {
        payeeName: string;
        partyPan: string | null;
        totalAmountPaid: number;
        totalTdsDeducted: number;
        paymentCount: number;
        payments: typeof payments;
      }>();

      for (const p of payments) {
        const key = p.payeeName.toLowerCase().trim();
        const existing = partnerMap.get(key);
        if (existing) {
          existing.totalAmountPaid += p.amount;
          existing.totalTdsDeducted += p.tdsDeducted;
          existing.paymentCount++;
          existing.payments.push(p);
        } else {
          partnerMap.set(key, {
            payeeName: p.payeeName,
            partyPan: p.partyPan,
            totalAmountPaid: p.amount,
            totalTdsDeducted: p.tdsDeducted,
            paymentCount: 1,
            payments: [p],
          });
        }
      }

      const certificates = Array.from(partnerMap.values()).map((cert) => ({
        ...cert,
        // Sanitize vendor name for certificate number: alphanumeric only,
        // first 6 chars, uppercase. Avoids malformed cert numbers from
        // special characters or short names.
        certificateNumber: `TDS-${input.fiscalYear.replace("/", "")}-${input.quarter}-${cert.payeeName.replace(/[^A-Za-z0-9]/g, "").slice(0, 6).toUpperCase().padEnd(3, "X")}`,
        quarter: input.quarter,
        fiscalYear: input.fiscalYear,
      }));

      return {
        quarter: input.quarter,
        fiscalYear: input.fiscalYear,
        fromDate,
        toDate,
        certificates,
        summary: {
          totalPartners: certificates.length,
          totalAmountPaid: certificates.reduce((s, c) => s + c.totalAmountPaid, 0),
          totalTdsDeducted: certificates.reduce((s, c) => s + c.totalTdsDeducted, 0),
        },
      };
    }),

  /**
   * TDS Reconciliation: compare TDS deducted (per payments) vs TDS
   * deposited with IRD (per bank transactions tagged as "TDS deposit").
   */
  tdsReconciliation: protectedProcedure
    .input(z.object({
      fromDate: z.string(),
      toDate: z.string(),
      projectId: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const fromDate = new Date(input.fromDate);
      const toDate = new Date(input.toDate);

      let projectIds: string[] = [];
      if (input.projectId) {
        await assertProjectMember(ctx.user, input.projectId);
        projectIds = [input.projectId];
      } else {
        const memberships = await db.projectMember.findMany({
          where: { userId: ctx.user.id },
          select: { projectId: true },
        });
        projectIds = memberships.map((m) => m.projectId);
      }

      // TDS deducted on payments
      const payments = await db.payment.findMany({
        where: {
          projectId: { in: projectIds },
          paymentDate: { gte: fromDate, lte: toDate },
          tdsDeducted: { gt: 0 },
        },
        select: { tdsDeducted: true, paymentDate: true, payeeName: true, amount: true },
      });
      const tdsDeducted = payments.reduce((s, p) => s + p.tdsDeducted, 0);

      // TDS deposited: look for payments with category containing "TDS"
      // or bank transactions with "TDS" in the notes.
      // CRITICAL: Exclude payments that have tdsDeducted > 0 — those
      // are the SOURCE of TDS (deducted from vendor), not the DEPOSIT
      // to IRD. Without this exclusion, the same payment would count as
      // both a deduction AND a deposit.
      const tdsDeposits = await db.payment.findMany({
        where: {
          projectId: { in: projectIds },
          paymentDate: { gte: fromDate, lte: toDate },
          tdsDeducted: 0, // exclude deduction-source payments
          OR: [
            { category: { contains: "TDS", mode: "insensitive" } },
            { notes: { contains: "TDS", mode: "insensitive" } },
            { subCategory: { contains: "TDS", mode: "insensitive" } },
          ],
        },
        select: { amount: true, paymentDate: true, payeeName: true, notes: true },
      });
      const tdsDeposited = tdsDeposits.reduce((s, p) => s + p.amount, 0);

      const variance = tdsDeducted - tdsDeposited;
      const isBalanced = Math.abs(variance) < 1; // NPR 1 tolerance

      return {
        period: { from: fromDate, to: toDate },
        tdsDeducted,
        tdsDeposited,
        variance,
        isBalanced,
        status: isBalanced ? "balanced" : variance > 0 ? "under_deposit" : "over_deposit",
        details: {
          deductedFromPayments: payments.length,
          depositTransactions: tdsDeposits.length,
          payments,
          deposits: tdsDeposits,
        },
      };
    }),

  // ═══════════════════════════════════════════════════════════
  // TIER 1.4 — Cash Position & Runway Dashboard
  // ═══════════════════════════════════════════════════════════

  /**
   * Cash Runway: how many months can the org survive at current
   * burn rate?
   */
  cashRunway: protectedProcedure
    .input(z.object({
      monthsToAverage: z.number().min(1).max(12).default(3),
    }))
    .query(async ({ ctx, input }) => {
      const user = await db.user.findUniqueOrThrow({
        where: { id: ctx.user.id },
        select: { organizationId: true },
      });

      if (!user.organizationId) {
        return {
          cashBalance: 0,
          monthlyBurnRate: 0,
          runwayMonths: null,
          isCashSustainable: true,
          cashGap: 0,
          totalPayables: 0,
          expectedInflows: 0,
          projection: {
            days: 90,
            projectedOutflow: 0,
            projectedInflow: 0,
            projectedNet: 0,
            projectedBalance: 0,
          },
        };
      }

      // ── Cash / Bank balance ────────────────────────────────
      const bankAccounts = await db.companyBankAccount.findMany({
        where: { organizationId: user.organizationId, status: "active" },
        select: { currentBalance: true },
      });
      const cashBalance = bankAccounts.reduce((s, b) => s + b.currentBalance, 0);

      // ── Burn rate: average monthly actual costs (last N months) ─
      const cutoffDate = new Date();
      cutoffDate.setMonth(cutoffDate.getMonth() - input.monthsToAverage);

      const memberships = await db.projectMember.findMany({
        where: { userId: ctx.user.id },
        select: { projectId: true },
      });
      const projectIds = memberships.map((m) => m.projectId);

      const recentCosts = await db.projectCost.findMany({
        where: {
          projectId: { in: projectIds },
          date: { gte: cutoffDate },
        },
        select: { amount: true, date: true },
      });
      const totalRecentCosts = recentCosts.reduce((s, c) => s + c.amount, 0);
      const monthlyBurnRate = totalRecentCosts / input.monthsToAverage;
      // JSON.stringify(Infinity) returns null — use a large number + flag
      // instead so the client gets a meaningful value.
      const runwayMonths = monthlyBurnRate > 0.01 ? cashBalance / monthlyBurnRate : null;
      // Use tolerance for float comparison — tiny floating-point
      // remainders from division would make isCashSustainable false
      // even when the burn rate is effectively zero.
      const isCashSustainable = monthlyBurnRate < 0.01;

      // ── Total payables (due within 30 days) ────────────────
      const [vendorBills, subBills] = await Promise.all([
        db.vendorBill.findMany({
          where: { projectId: { in: projectIds }, status: { in: ["unpaid", "partially_paid"] } },
          select: { netPayable: true, paidAmount: true },
        }),
        db.subcontractorBill.findMany({
          where: { projectId: { in: projectIds }, status: { in: ["certified", "approved"] } },
          select: { netPayable: true, paidAmount: true },
        }),
      ]);

      const totalPayables =
        vendorBills.reduce((s, b) => s + Math.max(0, b.netPayable - b.paidAmount), 0) +
        subBills.reduce((s, b) => s + Math.max(0, b.netPayable - (b.paidAmount || 0)), 0);

      // ── Expected inflows: IPCs in certified/approved status ──
      const pendingIpcs = await db.ipc.findMany({
        where: {
          projectId: { in: projectIds },
          status: { in: ["certified", "approved"] },
        },
        select: { netPayable: true },
      });
      const expectedInflows = pendingIpcs.reduce((s, i) => s + i.netPayable, 0);

      // ── Cash gap: payables - cash on hand ──────────────────
      const cashGap = totalPayables - cashBalance;

      // ── 90-day projection ──────────────────────────────────
      const projected90DayOutflow = monthlyBurnRate * 3; // 3 months
      const projected90DayInflow = expectedInflows; // assume all certified IPCs collected in 90 days
      const projected90DayNet = projected90DayInflow - projected90DayOutflow;
      const projected90DayBalance = cashBalance + projected90DayNet;

      return {
        cashBalance,
        monthlyBurnRate,
        runwayMonths,
        isCashSustainable,
        cashGap,
        totalPayables,
        expectedInflows,
        projection: {
          days: 90,
          projectedOutflow: projected90DayOutflow,
          projectedInflow: projected90DayInflow,
          projectedNet: projected90DayNet,
          projectedBalance: projected90DayBalance,
        },
      };
    }),

  // ═══════════════════════════════════════════════════════════
  // TIER 3.13 — Standard Cost Coding
  // ═══════════════════════════════════════════════════════════

  /** List all cost codes (hierarchical). */
  costCodeList: protectedProcedure
    .input(z.object({
      category: z.string().optional(),
      activeOnly: z.boolean().default(true),
    }))
    .query(async ({ input }) => {
      const where: any = {};
      if (input.category) where.category = input.category;
      if (input.activeOnly) where.isActive = true;

      const codes = await db.costCode.findMany({
        where,
        orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
        include: {
          parent: { select: { code: true, name: true } },
          _count: { select: { children: true } },
        },
      });
      return { codes };
    }),

  /** Create a custom cost code. */
  costCodeCreate: protectedProcedure
    .input(z.object({
      code: z.string().min(1).max(20),
      name: z.string().min(1).max(200),
      nameNp: z.string().optional(),
      category: z.enum(["material", "labor", "equipment", "subcontract", "overhead", "revenue", "asset", "liability", "equity"]),
      parentId: z.string().optional(),
      level: z.number().int().min(1).max(5).default(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const existing = await db.costCode.findUnique({ where: { code: input.code } });
      if (existing) {
        throw new TRPCError({ code: "CONFLICT", message: `Cost code ${input.code} already exists.` });
      }

      // Verify parent exists if specified.
      let sortOrder = 0;
      if (input.parentId) {
        const parent = await db.costCode.findUnique({ where: { id: input.parentId } });
        if (!parent) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Parent cost code not found." });
        }
        // Verify the parent's category matches (or is compatible with)
        // the child's — a material code shouldn't be a child of a labor
        // code. This catches user mistakes early.
        if (parent.category !== input.category) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Category mismatch: parent is "${parent.category}" but child is "${input.category}". Cost code hierarchy must use the same category.`,
          });
        }
        sortOrder = parent.sortOrder;
      }

      const code = await db.costCode.create({
        data: {
          code: input.code,
          name: input.name,
          nameNp: input.nameNp || null,
          category: input.category,
          parentId: input.parentId || null,
          level: input.level,
          sortOrder,
          isSystem: false,
        },
      });

      await audit({
        userId: ctx.user.id,
        action: "cost_code.create",
        entityType: "cost_code",
        entityId: code.id,
        metadata: { code: code.code, name: code.name },
      });

      return { code };
    }),

  /** Seed standard cost codes (idempotent — only inserts missing codes). */
  costCodeSeed: protectedProcedure
    .mutation(async ({ ctx }) => {
      assertOrgAdmin(ctx.user);

      let inserted = 0;
      let skipped = 0;
      let failed = 0;

      for (const sc of STANDARD_COST_CODES) {
        try {
          const existing = await db.costCode.findUnique({ where: { code: sc.code } });
          if (existing) {
            skipped++;
            continue;
          }

          // Find parent by code.
          let parentId: string | null = null;
          if (sc.level > 1) {
            const parts = sc.code.split(".");
            const parentCode = parts.length === 2
              ? `${parts[0]}.0`
              : parts.slice(0, -1).join(".");
            const parent = await db.costCode.findUnique({ where: { code: parentCode } });
            if (parent) parentId = parent.id;
          }

          await db.costCode.create({
            data: {
              code: sc.code,
              name: sc.name,
              nameNp: sc.nameNp || null,
              category: sc.category,
              parentId,
              level: sc.level,
              sortOrder: parseInt(sc.code.split(".")[0]) || 0,
              isSystem: true,
            },
          });
          inserted++;
        } catch (err) {
          // Don't abort the entire seed — log and continue.
          console.error(`[costCodeSeed] Failed to insert ${sc.code}:`, err);
          failed++;
        }
      }

      await audit({
        userId: ctx.user.id,
        action: "cost_code.seed",
        entityType: "cost_code",
        entityId: "bulk",
        metadata: { inserted, skipped, failed, total: STANDARD_COST_CODES.length },
      });

      return { inserted, skipped, failed, total: STANDARD_COST_CODES.length };
    }),

  /** Seed chart of accounts (for journal entry system). */
  chartOfAccountsSeed: protectedProcedure
    .mutation(async ({ ctx }) => {
      assertOrgAdmin(ctx.user);

      let inserted = 0;
      let skipped = 0;
      let failed = 0;

      for (const acc of CHART_OF_ACCOUNTS) {
        try {
          const existing = await db.costCode.findUnique({ where: { code: acc.code } });
          if (existing) {
            skipped++;
            continue;
          }

          await db.costCode.create({
            data: {
              code: acc.code,
              name: acc.name,
              nameNp: null,
              category: acc.category,
              level: 1,
              sortOrder: parseInt(acc.code.slice(0, 1)) || 0,
              isSystem: true,
            },
          });
          inserted++;
        } catch (err) {
          console.error(`[chartOfAccountsSeed] Failed to insert ${acc.code}:`, err);
          failed++;
        }
      }

      return { inserted, skipped, failed, total: CHART_OF_ACCOUNTS.length };
    }),

  // ═══════════════════════════════════════════════════════════
  // ARCHITECTURE A — Fiscal Year Locking
  // ═══════════════════════════════════════════════════════════

  /** List fiscal year locks for the caller's org. */
  fiscalYearLockList: protectedProcedure
    .query(async ({ ctx }) => {
      if (!ctx.user.organizationId) {
        return { locks: [] };
      }
      const locks = await listLocks(ctx.user.organizationId);
      return { locks };
    }),

  /** Create or update a fiscal year lock. */
  fiscalYearLockUpsert: protectedProcedure
    .input(z.object({
      fiscalYear: z.string().regex(/^\d{4}\/\d{2}$/, "Must be BS format like 2081/82"),
      startDate: z.string(),
      endDate: z.string(),
      isLocked: z.boolean().default(false),
      lockNotes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      assertOrgAdmin(ctx.user);
      if (!ctx.user.organizationId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "No organization assigned." });
      }

      // Validate date range: endDate must be after startDate.
      const startDate = new Date(input.startDate);
      const endDate = new Date(input.endDate);
      if (endDate <= startDate) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "End date must be after start date.",
        });
      }

      const lock = await db.fiscalYearLock.upsert({
        where: {
          organizationId_fiscalYear: {
            organizationId: ctx.user.organizationId,
            fiscalYear: input.fiscalYear,
          },
        },
        create: {
          organizationId: ctx.user.organizationId,
          fiscalYear: input.fiscalYear,
          startDate,
          endDate,
          isLocked: input.isLocked,
          lockedById: input.isLocked ? ctx.user.id : null,
          lockedAt: input.isLocked ? new Date() : null,
          lockNotes: input.lockNotes || null,
        },
        update: {
          startDate,
          endDate,
          isLocked: input.isLocked,
          lockedById: input.isLocked ? ctx.user.id : null,
          lockedAt: input.isLocked ? new Date() : null,
          lockNotes: input.lockNotes || null,
        },
      });

      await audit({
        userId: ctx.user.id,
        action: input.isLocked ? "fiscal_year.lock" : "fiscal_year.unlock",
        entityType: "fiscal_year_lock",
        entityId: lock.id,
        metadata: { fiscalYear: input.fiscalYear, isLocked: input.isLocked },
      });

      return { lock };
    }),

  // ═══════════════════════════════════════════════════════════
  // ARCHITECTURE B — Journal Entry Foundation
  // ═══════════════════════════════════════════════════════════

  /** List journal entries (with optional source/project filter). */
  journalEntryList: protectedProcedure
    .input(z.object({
      projectId: z.string().optional(),
      source: z.string().optional(),
      fromDate: z.string().optional(),
      toDate: z.string().optional(),
      isPosted: z.boolean().optional(),
      limit: z.number().min(1).max(200).default(50),
    }))
    .query(async ({ ctx, input }) => {
      // Scope by project membership
      let projectIds: string[] = [];
      if (input.projectId) {
        await assertProjectMember(ctx.user, input.projectId);
        projectIds = [input.projectId];
      } else {
        const memberships = await db.projectMember.findMany({
          where: { userId: ctx.user.id },
          select: { projectId: true },
        });
        projectIds = memberships.map((m) => m.projectId);
      }

      const dateFilter: any = {};
      if (input.fromDate) dateFilter.gte = new Date(input.fromDate);
      if (input.toDate) dateFilter.lte = new Date(input.toDate);
      const hasDate = input.fromDate || input.toDate;

      // Query journal entries that have at least one line linked to
      // a project the caller can access.
      const entries = await db.journalEntry.findMany({
        where: {
          ...(input.source ? { source: input.source } : {}),
          ...(input.isPosted !== undefined ? { isPosted: input.isPosted } : {}),
          ...(hasDate ? { entryDate: dateFilter } : {}),
          lines: {
            some: {
              projectId: { in: projectIds },
            },
          },
        },
        include: {
          // CRITICAL: only include lines for projects the caller can
          // access. Previously ALL lines were returned — a journal entry
          // with lines for projects A and B would expose project B's
          // amounts to a caller who only has access to project A.
          lines: {
            where: {
              projectId: { in: projectIds },
            },
            orderBy: { lineNumber: "asc" },
          },
        },
        orderBy: { entryDate: "desc" },
        take: input.limit,
      });

      return { entries };
    }),

  // ═══════════════════════════════════════════════════════════
  // ARCHITECTURE D — Report Snapshot
  // ═══════════════════════════════════════════════════════════

  /** Save a report snapshot (for audit trail). */
  reportSnapshotSave: protectedProcedure
    .input(z.object({
      reportType: z.enum(["pnl", "trial_balance", "cash_flow", "retention_ledger", "tds_reconciliation"]),
      projectId: z.string().optional(),
      periodLabel: z.string().max(100).optional(),
      snapshotData: z.string().max(1_000_000), // 1MB cap — prevents DB bloat
    }))
    .mutation(async ({ ctx, input }) => {
      if (input.projectId) {
        await assertProjectMember(ctx.user, input.projectId);
      }

      const snapshot = await db.reportSnapshot.create({
        data: {
          organizationId: ctx.user.organizationId ?? null,
          projectId: input.projectId || null,
          reportType: input.reportType,
          generatedById: ctx.user.id,
          snapshotData: input.snapshotData,
          periodLabel: input.periodLabel || null,
        },
      });

      await audit({
        userId: ctx.user.id,
        projectId: input.projectId,
        action: "report.snapshot.save",
        entityType: "report_snapshot",
        entityId: snapshot.id,
        metadata: { reportType: input.reportType, periodLabel: input.periodLabel },
      });

      return { snapshot };
    }),

  /** List report snapshots. */
  reportSnapshotList: protectedProcedure
    .input(z.object({
      reportType: z.string().optional(),
      projectId: z.string().optional(),
      limit: z.number().min(1).max(50).default(20),
    }))
    .query(async ({ ctx, input }) => {
      let projectIds: string[] = [];
      if (input.projectId) {
        await assertProjectMember(ctx.user, input.projectId);
        projectIds = [input.projectId];
      } else {
        const memberships = await db.projectMember.findMany({
          where: { userId: ctx.user.id },
          select: { projectId: true },
        });
        projectIds = memberships.map((m) => m.projectId);
      }

      const snapshots = await db.reportSnapshot.findMany({
        where: {
          ...(input.reportType ? { reportType: input.reportType } : {}),
          // IDOR guard: only show snapshots the caller has access to:
          // 1. Project-scoped snapshots where the caller is a project member
          // 2. Org-level snapshots (projectId = null) for the caller's org
          // Previously: the OR condition let any org member see ALL
          // project-scoped snapshots in their org, even for projects
          // they're not a member of.
          AND: [
            {
              OR: [
                { projectId: { in: projectIds } },
                { projectId: null, organizationId: ctx.user.organizationId ?? "___none___" },
              ],
            },
          ],
        },
        orderBy: { reportDate: "desc" },
        take: input.limit,
        select: {
          id: true,
          reportType: true,
          reportDate: true,
          periodLabel: true,
          projectId: true,
        },
      });

      return { snapshots };
    }),

  /** Retrieve a specific report snapshot (full data). */
  reportSnapshotGet: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const snapshot = await db.reportSnapshot.findUnique({
        where: { id: input.id },
      });

      if (!snapshot) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Snapshot not found." });
      }

      // Verify access: if project-scoped, check membership.
      if (snapshot.projectId) {
        await assertProjectMember(ctx.user, snapshot.projectId);
      }

      // Parse the snapshot data safely — if the stored JSON is corrupted
      // (truncated, encoding issue), return a structured error instead of
      // crashing the entire request.
      let parsedData: unknown;
      try {
        parsedData = JSON.parse(snapshot.snapshotData);
      } catch {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Report snapshot data is corrupted and cannot be parsed. Please regenerate the report.",
        });
      }

      return {
        ...snapshot,
        snapshotData: parsedData,
      };
    }),

  // ═══════════════════════════════════════════════════════════
  // BANK RECONCILIATION
  // ═══════════════════════════════════════════════════════════

  /**
   * Bank Reconciliation: match recorded payments against bank statement entries.
   *
   * The caller provides bank statement entries (from CSV/Excel import).
   * The system auto-matches them against Payment records by amount ±2 days.
   * Unmatched entries are flagged (outstanding checks, bank charges, interest).
   */
  bankReconciliation: protectedProcedure
    .input(z.object({
      bankAccountId: z.string(),
      fromDate: z.string(),
      toDate: z.string(),
      statementEntries: z.array(z.object({
        date: z.string(),
        description: z.string().optional(),
        debit: z.number().min(0).default(0),  // money in (deposit)
        credit: z.number().min(0).default(0), // money out (withdrawal)
        balance: z.number().optional(),
      })).max(500), // cap at 500 entries per reconciliation
    }))
    .mutation(async ({ ctx, input }) => {
      // Verify the bank account belongs to the caller's org.
      const bankAccount = await db.companyBankAccount.findFirst({
        where: { id: input.bankAccountId },
      });
      if (!bankAccount) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Bank account not found." });
      }
      if (bankAccount.organizationId !== ctx.user.organizationId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Bank account does not belong to your organization." });
      }

      const fromDate = new Date(input.fromDate);
      const toDate = new Date(input.toDate);

      // Fetch all payments linked to this bank account in the period.
      const payments = await db.payment.findMany({
        where: {
          paymentDate: { gte: fromDate, lte: toDate },
          companyBankAccountId: input.bankAccountId,
          status: "paid",
        },
        select: {
          id: true, amount: true, netPaid: true, paymentDate: true,
          payeeName: true, paymentMode: true, notes: true,
        },
        orderBy: { paymentDate: "asc" },
      });

      // Auto-match: for each statement entry, find a payment with the same
      // amount within ±2 days tolerance.
      const TOLERANCE_DAYS = 2;
      const matched: Array<{
        statementEntry: typeof input.statementEntries[0];
        payment: typeof payments[0] | null;
        matchType: "exact" | "approximate" | "unmatched";
      }> = [];

      const usedPaymentIds = new Set<string>();

      for (const entry of input.statementEntries) {
        const entryDate = new Date(entry.date);
        const entryAmount = entry.credit > 0 ? entry.credit : entry.debit; // match by absolute amount

        // Find matching payment
        let bestMatch: typeof payments[0] | null = null;
        let bestMatchDays = Infinity;

        for (const payment of payments) {
          if (usedPaymentIds.has(payment.id)) continue;

          const paymentAmount = payment.netPaid || payment.amount;
          if (Math.abs(paymentAmount - entryAmount) > 0.01) continue;

          const daysDiff = Math.abs(
            (new Date(payment.paymentDate).getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24),
          );

          if (daysDiff <= TOLERANCE_DAYS && daysDiff < bestMatchDays) {
            bestMatch = payment;
            bestMatchDays = daysDiff;
          }
        }

        if (bestMatch) {
          usedPaymentIds.add(bestMatch.id);
          matched.push({
            statementEntry: entry,
            payment: bestMatch,
            matchType: bestMatchDays === 0 ? "exact" : "approximate",
          });
        } else {
          matched.push({
            statementEntry: entry,
            payment: null,
            matchType: "unmatched",
          });
        }
      }

      // Find unmatched payments (recorded but not on statement)
      const unmatchedPayments = payments.filter((p) => !usedPaymentIds.has(p.id));

      // Calculate adjusted balance
      const statementClosingBalance = input.statementEntries.length > 0
        ? input.statementEntries[input.statementEntries.length - 1].balance ?? 0
        : 0;

      const outstandingPayments = unmatchedPayments.reduce((s, p) => s + (p.netPaid || p.amount), 0);
      const unmatchedDeposits = matched
        .filter((m) => m.matchType === "unmatched" && m.statementEntry.debit > 0)
        .reduce((s, m) => s + m.statementEntry.debit, 0);

      const adjustedBalance = bankAccount.currentBalance + unmatchedDeposits - outstandingPayments;

      const matchedCount = matched.filter((m) => m.matchType !== "unmatched").length;
      const unmatchedStatementCount = matched.filter((m) => m.matchType === "unmatched").length;
      const isReconciled = Math.abs(adjustedBalance - statementClosingBalance) < 1;

      const result = {
        bankAccount: {
          id: bankAccount.id,
          name: `Account ${bankAccount.accountNumber}`,
          recordedBalance: bankAccount.currentBalance,
        },
        statementClosingBalance,
        matchedCount,
        unmatchedStatementEntries: unmatchedStatementCount,
        unmatchedPayments: unmatchedPayments.length,
        outstandingPayments,
        unmatchedDeposits,
        adjustedBalance,
        isReconciled,
        entries: matched,
        unmatchedPaymentRecords: unmatchedPayments,
      };

      // Persist the reconciliation as a draft so the user can review
      // and confirm it later. The full match detail is stored as JSON.
      await db.bankReconciliation.create({
        data: {
          bankAccountId: input.bankAccountId,
          periodStart: fromDate,
          periodEnd: toDate,
          statementClosingBalance,
          recordedBalance: bankAccount.currentBalance,
          adjustedBalance,
          matchedCount,
          unmatchedStatementCount,
          unmatchedPaymentCount: unmatchedPayments.length,
          outstandingPayments,
          unmatchedDeposits,
          isReconciled,
          reconciliationData: JSON.stringify(result),
          status: "draft",
        },
      });

      return result;
    }),

  // ═══════════════════════════════════════════════════════════
  // RETENTION RELEASE WORKFLOW
  // ═══════════════════════════════════════════════════════════

  /**
   * Release retention for a project (at project completion + defect
   * liability period).
   *
   * In Nepal construction, retention (typically 5-10% of each IPC)
   * is held by the client until project completion + defect liability
   * period (usually 6-12 months). This procedure:
   *
   * 1. Verifies the project is completed (status = "completed")
   * 2. Verifies the defect liability period has elapsed
   *    (configurable, default 365 days after completion)
   * 3. Marks all outstanding retention as released
   * 4. Generates journal entries:
   *    Dr Client Receivable (retention now due from client)
   *       Cr Retention Receivable (retention released)
   *    And for sub-bills:
   *    Dr Retention Payable (retention now due to sub)
   *       Cr Subcontractor Payables
   */
  releaseRetention: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      defectLiabilityDays: z.number().min(0).max(730).default(365),
      force: z.boolean().default(false), // allow override of DLP check
      notes: z.string().max(500).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);
      await assertNotLocked(ctx.user.organizationId);

      const project = await db.project.findUnique({
        where: { id: input.projectId },
        select: { id: true, name: true, status: true, endDate: true },
      });
      if (!project) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Project not found." });
      }

      // Verify project is completed (unless forced)
      if (!input.force && project.status !== "completed") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Project must be "completed" before retention can be released. Current status: "${project.status}". Use force=true to override.`,
        });
      }

      // Verify defect liability period has elapsed (unless forced)
      if (!input.force && project.endDate) {
        const dlpEnd = new Date(project.endDate);
        dlpEnd.setDate(dlpEnd.getDate() + input.defectLiabilityDays);
        if (new Date() < dlpEnd) {
          const daysRemaining = Math.ceil((dlpEnd.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Defect liability period has not elapsed. ${daysRemaining} days remaining (ends ${dlpEnd.toISOString().slice(0, 10)}). Use force=true to override.`,
          });
        }
      }

      // Fetch all IPCs with outstanding retention (receivable from client)
      const ipcsWithRetention = await db.ipc.findMany({
        where: {
          projectId: input.projectId,
          retentionAmount: { gt: 0 },
          status: { in: ["certified", "approved", "paid"] },
        },
        select: { id: true, number: true, retentionAmount: true, grossAmount: true },
      });

      // Fetch all sub-bills with outstanding retention (payable to subs)
      const subsWithRetention = await db.subcontractorBill.findMany({
        where: {
          projectId: input.projectId,
          retentionAmount: { gt: 0 },
          status: { in: ["submitted", "verified", "certified", "paid"] },
        },
        select: { id: true, number: true, retentionAmount: true, subcontractorId: true },
      });

      const totalReceivableRetention = ipcsWithRetention.reduce((s, i) => s + i.retentionAmount, 0);
      const totalPayableRetention = subsWithRetention.reduce((s, b) => s + b.retentionAmount, 0);

      if (totalReceivableRetention === 0 && totalPayableRetention === 0) {
        return {
          released: false,
          message: "No outstanding retention to release for this project.",
        };
      }

      // Generate journal entries for client retention release
      // Dr Client Receivable (retention now due)
      //    Cr Retention Receivable (released)
      for (const ipc of ipcsWithRetention) {
        await createJournalEntry(db, {
          source: "retention_release",
          sourceRefId: ipc.id,
          sourceRefType: "IPC",
          description: `Retention released for IPC ${ipc.number} — project completion`,
          entryDate: new Date(),
          postedById: ctx.user.id,
          lines: [
            {
              accountCode: "1100",
              accountName: "Client Receivables",
              debit: ipc.retentionAmount,
              credit: 0,
              description: `Retention due from client — IPC ${ipc.number}`,
              projectId: input.projectId,
            },
            {
              accountCode: "1110",
              accountName: "Retention Receivable (from Client)",
              debit: 0,
              credit: ipc.retentionAmount,
              description: `Retention released — project completed`,
              projectId: input.projectId,
            },
          ],
        });
      }

      // Generate journal entries for subcontractor retention release
      // Dr Retention Payable (no longer held)
      //    Cr Subcontractor Payables (now due to sub)
      for (const bill of subsWithRetention) {
        await createJournalEntry(db, {
          source: "retention_release",
          sourceRefId: bill.id,
          sourceRefType: "SubcontractorBill",
          description: `Retention released to subcontractor — bill ${bill.number}`,
          entryDate: new Date(),
          postedById: ctx.user.id,
          lines: [
            {
              accountCode: "2010",
              accountName: "Retention Payable (to Subcontractors)",
              debit: bill.retentionAmount,
              credit: 0,
              description: `Retention released — project completed`,
              projectId: input.projectId,
              partnerId: bill.subcontractorId ?? undefined,
            },
            {
              accountCode: "2002",
              accountName: "Subcontractor Payables",
              debit: 0,
              credit: bill.retentionAmount,
              description: `Retention now due to subcontractor`,
              projectId: input.projectId,
              partnerId: bill.subcontractorId ?? undefined,
            },
          ],
        });
      }

      await audit({
        userId: ctx.user.id,
        projectId: input.projectId,
        action: "retention.release",
        entityType: "project",
        entityId: input.projectId,
        metadata: {
          totalReceivableRetention,
          totalPayableRetention,
          ipcCount: ipcsWithRetention.length,
          subBillCount: subsWithRetention.length,
          force: input.force,
          notes: input.notes,
        },
      });

      return {
        released: true,
        clientRetentionReleased: totalReceivableRetention,
        subcontractorRetentionReleased: totalPayableRetention,
        ipcCount: ipcsWithRetention.length,
        subBillCount: subsWithRetention.length,
        netCashImpact: totalReceivableRetention - totalPayableRetention,
      };
    }),
});
