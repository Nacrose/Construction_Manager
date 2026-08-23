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
      const ipcs = await db.ipc.findMany({
        where: {
          projectId: input.projectId,
          status: { in: ["certified", "approved", "paid"] },
          ...(hasDate ? { createdAt: dateFilter } : {}),
        },
        select: { grossAmount: true, vatAmount: true, netPayable: true, status: true },
      });

      const revenue = ipcs.reduce((s, i) => s + i.grossAmount, 0);
      const vatCollected = ipcs.reduce((s, i) => s + (i.vatAmount || 0), 0);

      // ── Direct Cost: Vendor Bills (materials) ──────────────
      const vendorBills = await db.vendorBill.findMany({
        where: {
          projectId: input.projectId,
          ...(hasDate ? { billDate: dateFilter } : {}),
        },
        select: { grossAmount: true, vatAmount: true },
      });
      const materialCost = vendorBills.reduce((s, b) => s + b.grossAmount, 0);

      // ── Direct Cost: Subcontractor Bills ──────────────────
      const subBills = await db.subcontractorBill.findMany({
        where: {
          projectId: input.projectId,
          ...(hasDate ? { billDate: dateFilter } : {}),
        },
        select: { grossAmount: true },
      });
      const subcontractCost = subBills.reduce((s, b) => s + b.grossAmount, 0);

      // ── Direct Cost: Material Issues (from projectCost) ───
      const materialIssues = await db.projectCost.findMany({
        where: {
          projectId: input.projectId,
          category: "material",
          ...(hasDate ? { date: dateFilter } : {}),
        },
        select: { amount: true },
      });
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
      const directCosts = materialCost + subcontractCost + materialConsumed + laborCost + equipmentCost;
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
          ipcCount: ipcs.length,
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
          isReleased: i.status === "paid", // retention is released on final payment
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
          isReleased: b.status === "paid", // retention released on final settlement
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
      const adStartYear = parseInt(bsStart) + 56; // BS to AD approximation
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
        certificateNumber: `TDS-${input.fiscalYear}-${input.quarter}-${cert.payeeName.slice(0, 3).toUpperCase()}`,
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
      // or bank transactions with "TDS" in the notes
      const tdsDeposits = await db.payment.findMany({
        where: {
          projectId: { in: projectIds },
          paymentDate: { gte: fromDate, lte: toDate },
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
        return { cashBalance: 0, monthlyBurnRate: 0, runwayMonths: 0, cashGap: 0, expectedInflows: 0, totalPayables: 0 };
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
      const runwayMonths = monthlyBurnRate > 0 ? cashBalance / monthlyBurnRate : Infinity;

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

      let sortOrder = 0;
      if (input.parentId) {
        const parent = await db.costCode.findUnique({ where: { id: input.parentId } });
        if (parent) {
          sortOrder = parent.sortOrder;
        }
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

      for (const sc of STANDARD_COST_CODES) {
        const existing = await db.costCode.findUnique({ where: { code: sc.code } });
        if (existing) {
          skipped++;
          continue;
        }

        // Find parent by code (for level 2+ codes)
        let parentId: string | null = null;
        if (sc.level > 1) {
          const parentCode = sc.code.split(".").slice(0, -1).join(".") + (sc.code.split(".").length > 2 ? "" : ".0");
          const parent = await db.costCode.findUnique({ where: { code: parentCode } });
          if (parent) parentId = parent.id;
        } else {
          // Level 1: check if a "X.0" parent exists
          const parentCode = sc.code + ".0";
          // Actually for level 1, the code IS the parent (e.g., "1.0" is the parent of "1.1")
          // So level-1 codes have no parent.
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
      }

      await audit({
        userId: ctx.user.id,
        action: "cost_code.seed",
        entityType: "cost_code",
        entityId: "bulk",
        metadata: { inserted, skipped, total: STANDARD_COST_CODES.length },
      });

      return { inserted, skipped, total: STANDARD_COST_CODES.length };
    }),

  /** Seed chart of accounts (for journal entry system). */
  chartOfAccountsSeed: protectedProcedure
    .mutation(async ({ ctx }) => {
      assertOrgAdmin(ctx.user);

      let inserted = 0;
      let skipped = 0;

      for (const acc of CHART_OF_ACCOUNTS) {
        // Check if already exists by code (using the accountCode field
        // on CostCode — we store COA entries as CostCodes too, with
        // category matching the account type)
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
      }

      return { inserted, skipped, total: CHART_OF_ACCOUNTS.length };
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
          startDate: new Date(input.startDate),
          endDate: new Date(input.endDate),
          isLocked: input.isLocked,
          lockedById: input.isLocked ? ctx.user.id : null,
          lockedAt: input.isLocked ? new Date() : null,
          lockNotes: input.lockNotes || null,
        },
        update: {
          startDate: new Date(input.startDate),
          endDate: new Date(input.endDate),
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
          lines: {
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
      periodLabel: z.string().optional(),
      snapshotData: z.string(), // JSON stringified report result
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
          OR: [
            { projectId: { in: projectIds } },
            { organizationId: ctx.user.organizationId ?? "___none___" },
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

      return {
        ...snapshot,
        snapshotData: JSON.parse(snapshot.snapshotData),
      };
    }),
});
