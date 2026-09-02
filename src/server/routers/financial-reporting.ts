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
import type { Prisma } from "@prisma/client";
import { router, reportingProcedure } from "@/server/trpc";
import { db } from "@/lib/db";
import { withOrgContext } from "@/lib/rls";
import { assertProjectMember, assertOrgAdmin, assertOrgBankAccount } from "@/lib/authz";
import { audit } from "@/lib/audit";
import { assertNotLocked, listLocks } from "@/lib/fiscal-year-lock";
import { createJournalEntry } from "@/lib/journal-entry";
import { CHART_OF_ACCOUNTS, STANDARD_COST_CODES } from "@/lib/chart-of-accounts";
import { bsToAd } from "@/lib/nepali-calendar";
import { invalidateProjectCache } from "@/lib/cache";

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
  projectPnl: reportingProcedure
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
          subcontractorId: null, // Client IPCs only
          status: { in: ["certified", "approved", "paid"] },
        },
        select: { grossAmount: true, vatAmount: true, netPayable: true, status: true, createdAt: true },
         take: 1000, // bounded (pagination sweep) — see src/lib/pagination.ts
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
         take: 1000, // bounded (pagination sweep) — see src/lib/pagination.ts
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
         take: 1000, // bounded (pagination sweep) — see src/lib/pagination.ts
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
      //
      // PERIOD-FILTER FALLBACK (audit issue #12):
      // Previously the choice between `materialConsumed` and
      // `materialCost` was `materialConsumed > 0 ? consumed : purchased`.
      // For a project that uses daily reports, `materialConsumed` could
      // be 0 in a given period (e.g. a quiet month with no daily report
      // approvals) — and the fallback would then substitute the period's
      // vendor bills, double-counting against the consumption-based
      // accounting the project uses. We detect "uses daily reports" by
      // checking if ANY DailyReport exists for the project — if so,
      // we ALWAYS use `materialConsumed` (the period-filtered value,
      // even if 0). If no daily reports exist, we fall back to vendor
      // bills (the only source of material cost for that project).
      const materialIssues = await db.projectCost.findMany({
        where: {
          projectId: input.projectId,
          category: "material",
          ...(hasDate ? { date: dateFilter } : {}),
        },
        select: { amount: true },
         take: 1000, // bounded (pagination sweep) — see src/lib/pagination.ts
       });
      const materialConsumed = materialIssues.reduce((s, c) => s + c.amount, 0);

      // Does this project use daily reports? If so, its accounting model
      // is consumption-based — we MUST use `materialConsumed` (even if 0
      // for this period) and NOT fall back to vendor bills.
      const dailyReportCount = await db.dailyReport.count({
        where: { projectId: input.projectId },
      });
      const projectUsesDailyReports = dailyReportCount > 0;

      // ── Direct Cost: Labor ────────────────────────────────
      const laborCosts = await db.projectCost.findMany({
        where: {
          projectId: input.projectId,
          category: "labor",
          ...(hasDate ? { date: dateFilter } : {}),
        },
        select: { amount: true },
         take: 1000, // bounded (pagination sweep) — see src/lib/pagination.ts
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
         take: 1000, // bounded (pagination sweep) — see src/lib/pagination.ts
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
         take: 1000, // bounded (pagination sweep) — see src/lib/pagination.ts
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
      // Material cost for the P&L:
      //   - If the project uses daily reports → consumption-based accounting.
      //     Use `materialConsumed` (the period-filtered value, even if 0).
      //     This avoids the previous bug where a quiet period (0 consumed)
      //     silently fell back to vendor bills, mixing accounting models.
      //   - If the project does NOT use daily reports → cash-basis accounting.
      //     Use `materialCost` (vendor bills in the period).
      //   - Edge case: project uses daily reports but has zero consumption
      //     AND zero vendor bills → materialCostForPnl = 0 (correct).
      const materialCostForPnl = projectUsesDailyReports
        ? materialConsumed
        : (materialConsumed > 0 ? materialConsumed : materialCost);
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
  retentionLedger: reportingProcedure
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
           take: 1000, // bounded (pagination sweep) — see src/lib/pagination.ts
         });
        projectIds = memberships.map((m) => m.projectId);
      }

      if (projectIds.length === 0) {
        return { receivables: [], payables: [], summary: { totalReceivable: 0, totalPayable: 0, netPosition: 0 } };
      }

      // ── Retention RECEIVABLE: retention deducted on Client IPCs ──
      const ipcs = await db.ipc.findMany({
        where: {
          projectId: { in: projectIds },
          subcontractorId: null, // Client IPCs only
          status: { in: ["certified", "approved", "paid"] },
        },
        include: {
          project: { select: { id: true, name: true, code: true } },
        },
         take: 1000, // bounded (pagination sweep) — see src/lib/pagination.ts
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
          // Retention release is now tracked by the `retentionReleasedAt`
          // field on the IPC itself (set by `releaseRetention`). Previously
          // this was hardcoded to `false`, so the ledger view never
          // reflected releases even after they were processed.
          isReleased: i.retentionReleasedAt !== null,
          releasedAt: i.retentionReleasedAt,
        }));

      // ── Retention PAYABLE: retention deducted on sub-bills and sub-IPCs ──
      const [subBills, subIpcs] = await Promise.all([
        db.subcontractorBill.findMany({
          where: {
            projectId: { in: projectIds },
            status: { in: ["submitted", "verified", "certified", "paid"] },
          },
          include: {
            project: { select: { id: true, name: true, code: true } },
            subcontractor: { select: { id: true, name: true, pan: true } },
          },
           take: 1000, // bounded (pagination sweep) — see src/lib/pagination.ts
         }),
        db.ipc.findMany({
          where: {
            projectId: { in: projectIds },
            subcontractorId: { not: null },
            status: { in: ["certified", "approved", "paid"] },
          },
          include: {
            project: { select: { id: true, name: true, code: true } },
            subcontractor: { select: { id: true, name: true, pan: true } },
          },
           take: 1000, // bounded (pagination sweep) — see src/lib/pagination.ts
         }),
      ]);

      const payables = [
        ...subBills
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
            isReleased: b.retentionReleasedAt !== null,
            releasedAt: b.retentionReleasedAt,
          })),
        ...subIpcs
          .filter((i) => (i.retentionAmount || 0) > 0)
          .map((i) => ({
            id: i.id,
            type: "subcontractor_retention" as const,
            projectName: i.project.name,
            projectCode: i.project.code,
            subcontractorName: i.subcontractor?.name || "Unknown",
            subcontractorPan: i.subcontractor?.pan || null,
            number: i.number,
            date: i.issueDate || i.createdAt,
            retentionAmount: i.retentionAmount || 0,
            status: i.status,
            isReleased: i.retentionReleasedAt !== null,
            releasedAt: i.retentionReleasedAt,
          })),
      ];

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
  tdsCertificate: reportingProcedure
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
      const [bsStart] = input.fiscalYear.split("/");

      // BS→AD conversion for the fiscal-year START.
      //
      // Nepal's government fiscal year runs Shrawan 1 → Asarh end (mid-July
      // to mid-July). So FY "2081/82" starts on Shrawan 1, 2081 BS.
      //
      // We use the calendar-accurate `bsToAd` library function to convert
      // Shrawan 1 of the start BS year to AD, then read the AD year off
      // that Date. This is the only correct way to do this — the previous
      // code used `parseInt(bsStart) - 56` which gave 2025 for FY 2081/82,
      // but the correct answer is 2024 (Shrawan 1, 2081 BS = Jul 16, 2024).
      // That one-year offset silently pointed every TDS certificate /
      // reconciliation quarter at the wrong fiscal year.
      //
      // The `- 56` shortcut only works for Baishakh 1 (Nepali New Year),
      // not for Shrawan 1 (fiscal year start) — because Shrawan 1 falls
      // ~3 months into the BS year, the AD year can be the same or the
      // next depending on which side of April 13/14 you're on.
      const bsStartYear = parseInt(bsStart, 10);
      let fiscalYearStartAd: Date;
      try {
        // month=4 → Shrawan (BS month 1=Baishakh, 2=Jestha, 3=Asarh, 4=Shrawan)
        fiscalYearStartAd = bsToAd(bsStartYear, 4, 1);
      } catch {
        // bsToAd throws if the year is outside the supported range
        // (2000-2099). Fall back to the approximate conversion so the
        // feature degrades gracefully instead of 500'ing.
        fiscalYearStartAd = new Date(bsStartYear - 56, 6, 16);
      }

      // Build quarter boundaries in AD. Each quarter is ~3 months long
      // starting from the fiscal year start (Shrawan 1 ≈ Jul 16).
      // We derive each quarter's start/end by adding months to the
      // fiscalYearStartAd so the boundaries stay aligned to the actual
      // BS calendar (which shifts by a day or two each year due to the
      // lunar/solar mismatch).
      const q1Start = fiscalYearStartAd;
      const q1End = new Date(q1Start); q1End.setMonth(q1End.getMonth() + 3);
      const q2Start = new Date(q1End); q2Start.setDate(q2Start.getDate() + 1);
      const q2End = new Date(q2Start); q2End.setMonth(q2End.getMonth() + 3);
      const q3Start = new Date(q2End); q3Start.setDate(q3Start.getDate() + 1);
      const q3End = new Date(q3Start); q3End.setMonth(q3End.getMonth() + 3);
      const q4Start = new Date(q3End); q4Start.setDate(q4Start.getDate() + 1);
      const q4End = new Date(q4Start); q4End.setMonth(q4End.getMonth() + 3);

      const quarterRanges: Record<string, [Date, Date]> = {
        Q1: [q1Start, q1End],
        Q2: [q2Start, q2End],
        Q3: [q3Start, q3End],
        Q4: [q4Start, q4End],
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
           take: 1000, // bounded (pagination sweep) — see src/lib/pagination.ts
         });
        projectIds = memberships.map((m) => m.projectId);
      }

      // Fetch payments with TDS deducted in the quarter.
      // Use `equals` (not `contains`) for partnerName matching —
      // substring matching causes false positives ("Sharma" matches
          // "Sharmaji"). Same fix as orgPartyStatement.
      const normalizedPartner = input.partnerName?.trim();
      const payments = await db.payment.findMany({
        where: {
          projectId: { in: projectIds },
          paymentDate: { gte: fromDate, lte: toDate },
          tdsDeducted: { gt: 0 },
          ...(normalizedPartner ? { payeeName: { equals: normalizedPartner, mode: "insensitive" } } : {}),
        },
        include: {
          project: { select: { id: true, name: true, code: true } },
        },
        orderBy: { paymentDate: "asc" },
         take: 1000, // bounded (pagination sweep) — see src/lib/pagination.ts
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
        // Normalize: collapse multiple spaces, trim, lowercase — so
        // "Sharma  Bahadur" and "Sharma Bahadur" group together.
        const key = p.payeeName.toLowerCase().replace(/\s+/g, " ").trim();
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
  tdsReconciliation: reportingProcedure
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
           take: 1000, // bounded (pagination sweep) — see src/lib/pagination.ts
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
         take: 1000, // bounded (pagination sweep) — see src/lib/pagination.ts
       });
      const tdsDeducted = payments.reduce((s, p) => s + p.tdsDeducted, 0);

      // TDS deposited: look for payments with category containing "TDS"
      // or bank transactions with "TDS" in the notes.
      //
      // ⚠ KNOWN LIMITATION: this is a heuristic based on free-text matching.
      // Any payment with "TDS" anywhere in its notes (e.g. "TDS not applicable",
      // "paid TDS last month") will be counted as a deposit — producing false
      // positives. The correct long-term fix is to add a dedicated `isTdsDeposit`
      // boolean field to the Payment model (or a separate TdsDeposit model) so
      // deposits are tracked explicitly rather than inferred from text. Until
      // then, users should manually verify the deposit list.
      //
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
         take: 1000, // bounded (pagination sweep) — see src/lib/pagination.ts
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
  cashRunway: reportingProcedure
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
         take: 1000, // bounded (pagination sweep) — see src/lib/pagination.ts
       });
      const cashBalance = bankAccounts.reduce((s, b) => s + b.currentBalance, 0);

      // ── Burn rate: average monthly actual costs (last N months) ─
      const cutoffDate = new Date();
      cutoffDate.setMonth(cutoffDate.getMonth() - input.monthsToAverage);

      const memberships = await db.projectMember.findMany({
        where: { userId: ctx.user.id },
        select: { projectId: true },
         take: 1000, // bounded (pagination sweep) — see src/lib/pagination.ts
       });
      const projectIds = memberships.map((m) => m.projectId);

      const recentCosts = await db.projectCost.findMany({
        where: {
          projectId: { in: projectIds },
          date: { gte: cutoffDate },
        },
        select: { amount: true, date: true },
         take: 1000, // bounded (pagination sweep) — see src/lib/pagination.ts
       });
      const totalRecentCosts = recentCosts.reduce((s, c) => s + c.amount, 0);
      const monthlyBurnRate = totalRecentCosts / input.monthsToAverage;
      // JSON.stringify(Infinity) returns null — use a large number + flag
      // instead so the client gets a meaningful value.
      const runwayMonths = monthlyBurnRate > 0.01 ? cashBalance / monthlyBurnRate : null;
      // `isCashSustainable` is computed below, AFTER `cashGap` is derived,
      // because sustainability depends on both burn rate AND cash position.

      // ── Total payables (due within 30 days) ────────────────
      // NOTE: subcontractor bills have status enum
      //   draft | submitted | verified | certified | paid | disputed
      // — there is NO "approved" status (their lifecycle doesn't include
      // an approval step the way IPCs / vendor bills do). The previous
      // filter `["certified", "approved"]` included "approved" as a
      // harmless dead branch — no sub-bill ever matched it. We drop it
      // here so the filter matches the actual enum.
      const [vendorBills, subBills, subIpcs] = await Promise.all([
        db.vendorBill.findMany({
          where: { projectId: { in: projectIds }, status: { in: ["unpaid", "partially_paid"] } },
          select: { netPayable: true, paidAmount: true },
           take: 1000, // bounded (pagination sweep) — see src/lib/pagination.ts
         }),
        db.subcontractorBill.findMany({
          where: { projectId: { in: projectIds }, status: { in: ["certified"] } },
          select: { netPayable: true, paidAmount: true },
           take: 1000, // bounded (pagination sweep) — see src/lib/pagination.ts
         }),
        db.ipc.findMany({
          where: {
            projectId: { in: projectIds },
            subcontractorId: { not: null },
            status: { in: ["certified", "approved"] },
          },
          select: { netPayable: true },
           take: 1000, // bounded (pagination sweep) — see src/lib/pagination.ts
         }),
      ]);

      const totalPayables =
        vendorBills.reduce((s, b) => s + Math.max(0, b.netPayable - b.paidAmount), 0) +
        subBills.reduce((s, b) => s + Math.max(0, b.netPayable - (b.paidAmount || 0)), 0) +
        subIpcs.reduce((s, i) => s + i.netPayable, 0);

      // ── Expected inflows: Client IPCs in certified/approved status ──
      const pendingIpcs = await db.ipc.findMany({
        where: {
          projectId: { in: projectIds },
          subcontractorId: null, // Client IPCs only
          status: { in: ["certified", "approved"] },
        },
        select: { netPayable: true },
         take: 1000, // bounded (pagination sweep) — see src/lib/pagination.ts
       });
      const expectedInflows = pendingIpcs.reduce((s, i) => s + i.netPayable, 0);

      // ── Cash gap: payables - cash on hand ──────────────────
      const cashGap = totalPayables - cashBalance;

      // SUSTAINABILITY verdict — now that we have all the inputs.
      // SUSTAINABILITY is more than just "burn rate is zero":
      //   - If the org is already sitting on NEGATIVE cash (overdrawn
      //     bank account), it's NOT sustainable regardless of burn rate.
      //   - If there's a positive cash gap (payables exceed cash on hand,
      //     meaning the org can't cover its near-term obligations), that's
      //     also not sustainable — even with zero burn.
      // Previously this was `monthlyBurnRate < 0.01` which reported
      // "sustainable" for an org sitting on negative cash with zero burn —
      // technically true about the burn rate but misleading as an
      // overall verdict.
      const isCashSustainable =
        monthlyBurnRate < 0.01 &&
        cashBalance >= 0 &&
        cashGap <= 0;

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
  costCodeList: reportingProcedure
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
         take: 1000, // bounded (pagination sweep) — see src/lib/pagination.ts
       });
      return { codes };
    }),

  /** Create a custom cost code. */
  costCodeCreate: reportingProcedure
    .input(z.object({
      code: z.string().min(1).max(20),
      name: z.string().min(1).max(200),
      nameNp: z.string().optional(),
      category: z.enum(["material", "labor", "equipment", "subcontract", "overhead", "revenue", "asset", "liability", "equity"]),
      parentId: z.string().optional(),
      level: z.number().int().min(1).max(5).default(1),
    }))
    .mutation(async ({ ctx, input }) => {
      // Cost codes are financial configuration records — restrict creation
      // to org admins. Previously any authenticated user could create cost
      // codes, which affect all orgs (cost codes are global, not org-scoped).
      assertOrgAdmin(ctx.user);
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
  costCodeSeed: reportingProcedure
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
  chartOfAccountsSeed: reportingProcedure
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
  fiscalYearLockList: reportingProcedure
    .query(async ({ ctx }) => {
      if (!ctx.user.organizationId) {
        return { locks: [] };
      }
      const locks = await listLocks(ctx.user.organizationId);
      return { locks };
    }),

  /** Create or update a fiscal year lock. */
  fiscalYearLockUpsert: reportingProcedure
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

      // CROSS-VALIDATION: verify startDate and endDate actually fall
      // within the stated fiscalYear. Without this, a user could create
      // a lock with `fiscalYear: "2081/82"` but
      // `startDate: 2000-01-01, endDate: 2100-12-31` — locking the
      // entire century. We parse the fiscalYear (BS format "2081/82")
      // and compute the expected AD date range using bsToAd, then
      // verify the provided dates fall within ±2 days of that range
      // (to allow for the BS calendar's ±1 day shift).
      const [bsStart] = input.fiscalYear.split("/");
      const bsStartYear = parseInt(bsStart, 10);
      let expectedStart: Date;
      let expectedEnd: Date;
      try {
        // Nepal fiscal year: Shrawan 1 of bsStartYear → Asarh end of bsStartYear+1
        expectedStart = bsToAd(bsStartYear, 4, 1); // Shrawan 1
        expectedEnd = bsToAd(bsStartYear + 1, 3, 32); // Asarh end (day 32 = last day)
      } catch {
        // bsToAd throws if year is outside supported range — skip
        // cross-validation and trust the user-provided dates.
        expectedStart = startDate;
        expectedEnd = endDate;
      }

      // Allow ±3 days tolerance for the BS calendar shift.
      const TOLERANCE_MS = 3 * 24 * 60 * 60 * 1000;
      if (
        Math.abs(startDate.getTime() - expectedStart.getTime()) > TOLERANCE_MS ||
        Math.abs(endDate.getTime() - expectedEnd.getTime()) > TOLERANCE_MS
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Start/end dates don't match fiscal year ${input.fiscalYear}. Expected: ${expectedStart.toISOString().slice(0, 10)} to ${expectedEnd.toISOString().slice(0, 10)}.`,
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
  journalEntryList: reportingProcedure
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
      let userOrgId: string | null = null;
      if (input.projectId) {
        await assertProjectMember(ctx.user, input.projectId);
        projectIds = [input.projectId];
        // Still need the org for org-level (projectId=null) lines.
        const caller = await db.user.findUnique({
          where: { id: ctx.user.id },
          select: { organizationId: true },
        });
        userOrgId = caller?.organizationId ?? null;
      } else {
        // Use org-wide scoping so org admins see all org projects.
        const user = await db.user.findUniqueOrThrow({
          where: { id: ctx.user.id },
          select: { organizationId: true },
        });
        userOrgId = user.organizationId;
        if (user.organizationId) {
          const orgProjects = await db.project.findMany({
            where: { organizationId: user.organizationId },
            select: { id: true },
             take: 1000, // bounded (pagination sweep) — see src/lib/pagination.ts
           });
          projectIds = orgProjects.map((p) => p.id);
        } else {
          const memberships = await db.projectMember.findMany({
            where: { userId: ctx.user.id },
            select: { projectId: true },
             take: 1000, // bounded (pagination sweep) — see src/lib/pagination.ts
           });
          projectIds = memberships.map((m) => m.projectId);
        }
      }

      const dateFilter: any = {};
      if (input.fromDate) dateFilter.gte = new Date(input.fromDate);
      if (input.toDate) dateFilter.lte = new Date(input.toDate);
      const hasDate = input.fromDate || input.toDate;

      // TENANT ISOLATION: an entry is visible when EITHER
      //   (a) it has at least one line linked to a project the caller can
      //       access, OR
      //   (b) it is an org-level entry (all lines projectId=null — e.g. HO
      //       expenses) OWNED BY THE CALLER'S ORG, via JournalEntry.
      //       organizationId.
      // Previously the org-level branch was just `{ projectId: null }`,
      // which matched head-office entries of EVERY organization — a
      // cross-tenant leak of other orgs' journals.
      // Org-less users (superadmin-created or org deletion) get project
      // lines only — they have no org-level entries to see.
      const accessCondition: Prisma.JournalEntryWhereInput = userOrgId
        ? {
            OR: [
              { lines: { some: { projectId: { in: projectIds } } } },
              { organizationId: userOrgId },
            ],
          }
        : {
            lines: { some: { projectId: { in: projectIds } } },
          };

      const entries = await db.journalEntry.findMany({
        where: {
          ...(input.source ? { source: input.source } : {}),
          ...(input.isPosted !== undefined ? { isPosted: input.isPosted } : {}),
          ...(hasDate ? { entryDate: dateFilter } : {}),
          ...accessCondition,
        },
        include: {
          // Only include lines for projects the caller can access, plus
          // org-level lines (projectId null) belonging to the caller's org.
          lines: {
            where: userOrgId
              ? {
                  OR: [
                    { projectId: { in: projectIds } },
                    { journalEntry: { organizationId: userOrgId } },
                  ],
                }
              : { projectId: { in: projectIds } },
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
  reportSnapshotSave: reportingProcedure
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
  reportSnapshotList: reportingProcedure
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
           take: 1000, // bounded (pagination sweep) — see src/lib/pagination.ts
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
  reportSnapshotGet: reportingProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const snapshot = await db.reportSnapshot.findUnique({
        where: { id: input.id },
      });

      if (!snapshot) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Snapshot not found." });
      }

      // Verify access: if project-scoped, check membership.
      // If org-level (projectId null), verify the snapshot belongs to
      // the caller's org — otherwise any authenticated user could
      // read any org's report snapshots by cuid.
      if (snapshot.projectId) {
        await assertProjectMember(ctx.user, snapshot.projectId);
      } else {
        // Org-level snapshot — check organizationId matches.
        if (
          snapshot.organizationId &&
          snapshot.organizationId !== ctx.user.organizationId
        ) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You do not have access to this report snapshot.",
          });
        }
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
  bankReconciliation: reportingProcedure
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
      const bankAccount = await assertOrgBankAccount(input.bankAccountId, ctx.user.organizationId);

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

      // Persist the reconciliation. If a draft already exists for the
      // same bank account + period, UPDATE it instead of creating a
      // duplicate. Previously every call created a new record, so calling
      // the procedure twice for the same period left two conflicting
      // reconciliation drafts.
      const existingRecon = await db.bankReconciliation.findFirst({
        where: {
          bankAccountId: input.bankAccountId,
          periodStart: fromDate,
          periodEnd: toDate,
          status: "draft",
        },
        select: { id: true },
      });

      const reconData = {
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
      };

      if (existingRecon) {
        await db.bankReconciliation.update({
          where: { id: existingRecon.id },
          data: reconData,
        });
      } else {
        await db.bankReconciliation.create({
          data: {
            bankAccountId: input.bankAccountId,
            periodStart: fromDate,
            periodEnd: toDate,
            ...reconData,
            status: "draft",
          },
        });
      }

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
  releaseRetention: reportingProcedure
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

      // Fetch all IPCs with outstanding retention (receivable from client).
      // CRITICAL: filter by `retentionReleasedAt: null` so already-released
      // IPCs are skipped. Without this filter, re-running the mutation
      // (double-click, accidental re-trigger) would generate the same
      // release journal entries a second time, double-crediting revenue
      // and double-releasing retention that was already released.
      const ipcsWithRetention = await db.ipc.findMany({
        where: {
          projectId: input.projectId,
          subcontractorId: null, // Client IPCs only
          retentionAmount: { gt: 0 },
          retentionReleasedAt: null,
          status: { in: ["certified", "approved", "paid"] },
        },
        select: { id: true, number: true, retentionAmount: true, grossAmount: true },
      });

      // ── SUBCONTRACTOR SIDE (payable) ──
      // Covers BOTH source kinds: subcontractor bills AND subcontractor
      // IPCs (the previous implementation released bill retention only,
      // silently skipping retention deducted on sub-IPCs).
      const [billsWithRetention, subIpcsWithRetention] = await Promise.all([
        db.subcontractorBill.findMany({
          where: {
            projectId: input.projectId,
            retentionAmount: { gt: 0 },
            retentionReleasedAt: null,
            status: { in: ["submitted", "verified", "certified", "paid"] },
          },
          select: {
            id: true, number: true, retentionAmount: true,
            subcontractorId: true, createdAt: true,
          },
          take: 1000, // bounded (pagination sweep) — see src/lib/pagination.ts
        }),
        db.ipc.findMany({
          where: {
            projectId: input.projectId,
            subcontractorId: { not: null },
            retentionAmount: { gt: 0 },
            retentionReleasedAt: null,
            status: { in: ["submitted", "certified", "approved", "paid"] },
          },
          select: {
            id: true, number: true, retentionAmount: true,
            subcontractorId: true, createdAt: true,
          },
          take: 1000, // bounded (pagination sweep) — see src/lib/pagination.ts
        }),
      ]);

      // RECONCILIATION with the ad-hoc release path (project-ops
      // releaseRetention): that path pays retention out and bumps the
      // subcontractor's release tracker, but (for partial releases) does
      // not mark the source rows. Without this reconciliation the bulk
      // release would re-release retention that already left via payment —
      // double-release. For each subcontractor, walk its outstanding rows
      // FIFO (oldest first) and treat already-paid releases as consuming
      // them: fully covered rows are marked released WITHOUT a new JE (the
      // payment path already posted Dr 2010 / Cr Bank for that money);
      // only the uncovered remainder generates a release JE.
      const releasePayments = await db.payment.findMany({
        where: {
          projectId: input.projectId,
          payeeType: "subcontractor",
          retentionReleased: { gt: 0 },
        },
        select: { payeeId: true, retentionReleased: true },
        take: 1000, // bounded (pagination sweep) — see src/lib/pagination.ts
      });
      const paidReleasedBySub = new Map<string, number>();
      for (const p of releasePayments) {
        if (!p.payeeId) continue;
        paidReleasedBySub.set(p.payeeId, (paidReleasedBySub.get(p.payeeId) ?? 0) + p.retentionReleased);
      }

      // Per-subcontractor rows: bills + sub-IPCs, FIFO by creation date.
      const rowsBySub = new Map<string, Array<{
        id: string; kind: "bill" | "ipc"; number: string;
        retentionAmount: number; createdAt: Date;
      }>>();
      for (const b of billsWithRetention) {
        if (!b.subcontractorId) continue;
        const list = rowsBySub.get(b.subcontractorId) ?? [];
        list.push({ id: b.id, kind: "bill", number: b.number, retentionAmount: b.retentionAmount, createdAt: b.createdAt });
        rowsBySub.set(b.subcontractorId, list);
      }
      for (const i of subIpcsWithRetention) {
        if (!i.subcontractorId) continue;
        const list = rowsBySub.get(i.subcontractorId) ?? [];
        list.push({ id: i.id, kind: "ipc", number: i.number, retentionAmount: i.retentionAmount, createdAt: i.createdAt });
        rowsBySub.set(i.subcontractorId, list);
      }
      for (const list of rowsBySub.values()) {
        list.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      }

      // The reconciliation output: rows to mark (no JE), rows to release
      // now (JE + mark), and per-sub tracker bumps.
      const rowsToMarkOnly: Array<{ id: string; kind: "bill" | "ipc" }> = [];
      const rowsToReleaseNow: Array<{
        id: string; kind: "bill" | "ipc"; number: string;
        amount: number; subcontractorId: string;
      }> = [];
      const trackerBumps = new Map<string, number>();
      for (const [subId, rows] of rowsBySub) {
        let paidCovered = paidReleasedBySub.get(subId) ?? 0;
        for (const row of rows) {
          const covered = Math.min(paidCovered, row.retentionAmount);
          paidCovered -= covered;
          const outstanding = row.retentionAmount - covered;
          if (outstanding > 0.01) {
            rowsToReleaseNow.push({
              id: row.id, kind: row.kind, number: row.number,
              amount: outstanding, subcontractorId: subId,
            });
            trackerBumps.set(subId, (trackerBumps.get(subId) ?? 0) + outstanding);
          } else {
            rowsToMarkOnly.push({ id: row.id, kind: row.kind });
          }
        }
      }

      const totalReceivableRetention = ipcsWithRetention.reduce((s, i) => s + i.retentionAmount, 0);
      const totalPayableRetention =
        rowsToReleaseNow.reduce((s, r) => s + r.amount, 0) +
        rowsToMarkOnly.reduce((s, r) => {
          const row = [...billsWithRetention, ...subIpcsWithRetention].find(
            (x) => x.id === r.id,
          );
          return s + (row?.retentionAmount ?? 0);
        }, 0);

      if (totalReceivableRetention === 0 && totalPayableRetention === 0) {
        return {
          released: false,
          message: "No outstanding retention to release for this project.",
        };
      }

      // Generate journal entries + release markers ATOMICALLY. Previously
      // each JE was created via `db` and then the IPC/sub-bill was updated
      // separately — a failure in between left a posted JE for a release
      // that was never marked, and re-running the mutation would post a
      // SECOND identical JE. One transaction makes the pair idempotent.
      //
      // Client retention release:
      //   Dr Client Receivable (retention now due)
      //      Cr Retention Receivable (released)
      //
      // Subcontractor retention release:
      //   Dr Retention Payable (no longer held)
      //      Cr Subcontractor Payables (now due to sub)
      await db.$transaction(async (tx) => {
        await withOrgContext(tx, ctx.user.organizationId, !!ctx.user.isSuperAdmin); // RLS: JournalEntry is FORCE-scoped
        for (const ipc of ipcsWithRetention) {
          await createJournalEntry(tx, {
            source: "retention_release",
            sourceRefId: ipc.id,
            sourceRefType: "IPC",
            description: `Retention released for IPC ${ipc.number} — project completion`,
            entryDate: new Date(),
            postedById: ctx.user.id,
            organizationId: ctx.user.organizationId ?? undefined,
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

          // Mark the IPC as released so a subsequent run of this mutation
          // (double-click, accidental re-trigger) skips it. Same transaction
          // as the JE above — both commit or neither does.
          await tx.ipc.update({
            where: { id: ipc.id },
            data: {
              retentionReleasedAt: new Date(),
              retentionReleasedById: ctx.user.id,
            },
          });
        }

        // Sub side — rows with an unpaid remainder get the release JE;
        // rows already covered by payment-path releases are only marked.
        for (const row of rowsToReleaseNow) {
          await createJournalEntry(tx, {
            source: "retention_release",
            sourceRefId: row.id,
            sourceRefType: row.kind === "bill" ? "SubcontractorBill" : "IPC",
            description: `Retention released to subcontractor — ${row.kind === "bill" ? "bill" : "IPC"} ${row.number}`,
            entryDate: new Date(),
            postedById: ctx.user.id,
            organizationId: ctx.user.organizationId ?? undefined,
            lines: [
              {
                accountCode: "2010",
                accountName: "Retention Payable (to Subcontractors)",
                debit: row.amount,
                credit: 0,
                description: `Retention released — project completed`,
                projectId: input.projectId,
                partnerId: row.subcontractorId,
              },
              {
                accountCode: "2002",
                accountName: "Subcontractor Payables",
                debit: 0,
                credit: row.amount,
                description: `Retention now due to subcontractor`,
                projectId: input.projectId,
                partnerId: row.subcontractorId,
              },
            ],
          });

          if (row.kind === "bill") {
            await tx.subcontractorBill.update({
              where: { id: row.id },
              data: {
                retentionReleasedAt: new Date(),
                retentionReleasedById: ctx.user.id,
              },
            });
          } else {
            await tx.ipc.update({
              where: { id: row.id },
              data: {
                retentionReleasedAt: new Date(),
                retentionReleasedById: ctx.user.id,
              },
            });
          }
        }

        for (const row of rowsToMarkOnly) {
          // Covered by earlier payment-path releases — mark so the row-level
          // ledger reflects reality; the release JE already exists (posted
          // by the payment path), so deliberately NO new JE here.
          if (row.kind === "bill") {
            await tx.subcontractorBill.update({
              where: { id: row.id },
              data: {
                retentionReleasedAt: new Date(),
                retentionReleasedById: ctx.user.id,
              },
            });
          } else {
            await tx.ipc.update({
              where: { id: row.id },
              data: {
                retentionReleasedAt: new Date(),
                retentionReleasedById: ctx.user.id,
              },
            });
          }
        }

        // Keep the shared release tracker in sync — both release paths
        // maintain subcontractor.totalRetentionReleased, so the payment
        // path's over-release guard and retentionSummary see bulk releases.
        for (const [subId, amount] of trackerBumps) {
          const sub = await tx.subcontractor.findUnique({
            where: { id: subId },
            select: { totalRetentionReleased: true },
          });
          await tx.subcontractor.update({
            where: { id: subId },
            data: { totalRetentionReleased: (sub?.totalRetentionReleased || 0) + amount },
          });
        }
      });

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
          subBillCount: billsWithRetention.length,
          subIpcCount: subIpcsWithRetention.length,
          subRowsMarkedFromPayments: rowsToMarkOnly.length,
          force: input.force,
          notes: input.notes,
        },
      });

      await invalidateProjectCache(input.projectId, ["cashflow", "retention"]);

      return {
        released: true,
        clientRetentionReleased: totalReceivableRetention,
        subcontractorRetentionReleased: totalPayableRetention,
        ipcCount: ipcsWithRetention.length,
        subBillCount: billsWithRetention.length,
        subIpcCount: subIpcsWithRetention.length,
        netCashImpact: totalReceivableRetention - totalPayableRetention,
      };
    }),
});
