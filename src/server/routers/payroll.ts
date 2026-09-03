/**
 * tRPC router for Construction Payroll Management:
 * Org-Level Monthly Payroll Runs, Advance Deductions, Allowances,
 * Approval Cycles, and Worker Payslips.
 *
 * ADR-0007 grain: one PayrollRun per ORG per period (database-enforced),
 * one PayrollPersonRecord per person per run (salary computed ONCE per
 * person from attendance combined across ALL their projects), and
 * PayrollAllocation rows that split cost to projects with the hard
 * invariant Σ allocation.net ≡ record.netPayable (exact — Decimal).
 * The org-level journal entry's labor expense LINES carry projectId per
 * allocation; liability accounts and bank stay organization-level.
 *
 * Phase E money boundaries:
 *   - DRAFT  = planning. Re-saves are additive (a save never drops
 *              another project's people from the org-wide run) and
 *              consume nothing.
 *   - APPROVE = the liability boundary: advances are recovered (CAS,
 *              ledgered in PayrollAdvanceRecovery) and the org-level
 *              liability JE posts (idempotent on the run id).
 *   - DISBURSE = the settlement primitive (ADR-0006 §2): settlement JE,
 *              optional bank decrement, payslips bumped by AMOUNT.
 *   - REOPEN (approved → draft) reverses all of the above exactly
 *              (JE reversal + ledgered un-recovery); DISBURSED runs are
 *              terminal — payment status is derived from amounts.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, capabilityGuard } from "@/server/trpc";
import { db, type DbTxClient } from "@/lib/db";
import { invalidateProjectCache } from "@/lib/cache";
import { withOrgContext } from "@/lib/rls";
import { isOrgAdmin, assertOrgBankAccount } from "@/lib/authz";
import { computePayrollLine } from "@/server/utils/payroll-calc";
import { assertNotLocked } from "@/lib/fiscal-year-lock";
import { createJournalEntry, reverseJournalEntry } from "@/lib/journal-entry";
import { assertDelegation } from "@/lib/delegation";
import { transitionEntityState } from "@/server/utils/state-machine";
import { planPersonAllocations, type ManualSplitRow } from "@/server/services/payroll-allocation";
import { settlePayrollRun, derivePaymentStatus } from "@/server/utils/settlement";

/** CAS-guarded advance recovery (ADR-0007 §4): the increment only lands while
 * recoveredAmount + x ≤ amount. Never a boolean flip, never a principal
 * mutation; concurrent runs cannot double-recover. The exact amount is also
 * ledgered in PayrollAdvanceRecovery (unique per run+advance) so a reopen can
 * reverse it exactly. */
async function recoverAdvanceCas(
  tx: DbTxClient,
  args: { advanceId: string; take: number; payrollRunId: string; personRecordId: string; organizationId: string },
): Promise<void> {
  const updated = await tx.$executeRaw`
    UPDATE "StaffAdvance"
       SET "recoveredAmount" = "recoveredAmount" + ${args.take},
           "recoveredInPayrollId" = ${args.payrollRunId},
           "updatedAt" = NOW()
     WHERE "id" = ${args.advanceId}
       AND "recoveredAmount" + ${args.take} <= "amount"`;
  if (updated === 0) {
    throw new TRPCError({
      code: "CONFLICT",
      message: `Advance ${args.advanceId} was concurrently recovered or has insufficient outstanding balance — reload and retry.`,
    });
  }

  await tx.payrollAdvanceRecovery.create({
    data: {
      organizationId: args.organizationId,
      payrollRunId: args.payrollRunId,
      advanceId: args.advanceId,
      personRecordId: args.personRecordId,
      amount: args.take,
    },
  });
}

/** Reverse every advance recovery this run made (reopen path): CAS-guarded
 * decrements by the exact ledgered amounts, then the ledger rows go. */
async function reverseAdvanceRecoveries(tx: DbTxClient, runId: string): Promise<void> {
  const ledger = await tx.payrollAdvanceRecovery.findMany({
    where: { payrollRunId: runId },
    select: { id: true, advanceId: true, amount: true },
    take: 1000, // bounded (pagination sweep) — see src/lib/pagination.ts
  });
  for (const row of ledger) {
    const updated = await tx.$executeRaw`
      UPDATE "StaffAdvance"
         SET "recoveredAmount" = "recoveredAmount" - ${row.amount},
             "updatedAt" = NOW()
       WHERE "id" = ${row.advanceId}
         AND "recoveredAmount" - ${row.amount} >= 0`;
    if (updated === 0) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "An advance recovery could not be reversed cleanly — the advance ledger was concurrently modified. Contact an administrator.",
      });
    }
    await tx.payrollAdvanceRecovery.delete({ where: { id: row.id } });
  }
}

/** Person record shape needed to post the liability JE from stored state. */
const RUN_RECORD_SELECT = {
  id: true,
  personId: true,
  presentDays: true,
  halfDays: true,
  absentDays: true,
  leaveDays: true,
  overtimeHours: true,
  baseRate: true,
  regularPay: true,
  overtimePay: true,
  allowances: true,
  advanceDeduction: true,
  messDeduction: true,
  otherDeductions: true,
  tdsAmount: true,
  netPayable: true,
  paidAmount: true,
} as const;

type RunRecord = {
  id: string;
  personId: string;
  regularPay: number;
  overtimePay: number;
  allowances: number;
  advanceDeduction: number;
  messDeduction: number;
  otherDeductions: number;
  tdsAmount: number;
  netPayable: number;
  paidAmount: number;
};

function asRecord(row: RunRecord): RunRecord {
  return {
    id: row.id,
    personId: row.personId,
    regularPay: row.regularPay,
    overtimePay: row.overtimePay,
    allowances: row.allowances,
    advanceDeduction: row.advanceDeduction,
    messDeduction: row.messDeduction,
    otherDeductions: row.otherDeductions,
    tdsAmount: row.tdsAmount,
    netPayable: row.netPayable,
    paidAmount: row.paidAmount,
  };
}

/**
 * Post the ORG-LEVEL payroll liability journal entry from STORED run
 * state (approve boundary):
 *   Dr Direct Labor (5010) per ALLOCATION (lines carry projectId)
 *      Cr Salary Payable (2030) = totalNetPayable        (org-level)
 *      Cr TDS Payable (2020) = totalTds                  (org-level)
 *      Cr Staff Advance Recoverable (2040) = advances    (org-level)
 *      Cr Cash (1001) = mess + other deductions          (org-level)
 *      Dr Staff Advance Recoverable (2040) = deductionExcess (clamp shortfall)
 */
async function postPayrollLiabilityJe(
  tx: DbTxClient,
  args: { runId: string; period: string; organizationId: string; actorId: string },
): Promise<void> {
  const existingJe = await tx.journalEntry.findFirst({
    where: { source: "payroll", sourceRefId: args.runId },
    select: { id: true },
  });
  if (existingJe) return; // idempotent on the run id

  const records = (await tx.payrollPersonRecord.findMany({
    where: { payrollRunId: args.runId },
    select: RUN_RECORD_SELECT,
    take: 1000, // bounded (pagination sweep) — see src/lib/pagination.ts
  })).map(asRecord);

  const allocations = await tx.payrollAllocation.findMany({
    where: { payrollRunId: args.runId },
    select: { projectId: true, gross: true },
    take: 2000, // bounded (pagination sweep) — see src/lib/pagination.ts
  });

  const sum = (pick: (r: RunRecord) => number) => records.reduce((s, r) => s + pick(r), 0);
  const totalGross = sum((r) => r.regularPay + r.overtimePay + r.allowances);
  const totalTds = sum((r) => r.tdsAmount);
  const totalAdvancesRecovered = sum((r) => r.advanceDeduction);
  const totalMessAndOther = sum((r) => r.messDeduction + r.otherDeductions);
  const totalNetPayable = sum((r) => r.netPayable);
  // payroll-calc clamps netPayable at 0; when deductions exceed gross the
  // shortfall posts as an extra DEBIT on "Staff Advance Recoverable" (2040)
  // so the entry stays balanced and the shortfall shows in the GL.
  const deductionExcess = records.reduce(
    (s, r) => s + Math.max(0, r.advanceDeduction + r.messDeduction + r.otherDeductions + r.tdsAmount - (r.regularPay + r.overtimePay + r.allowances)),
    0,
  );

  await createJournalEntry(tx, {
    source: "payroll",
    sourceRefId: args.runId,
    sourceRefType: "PayrollRun",
    description: `Payroll for ${args.period} — org ${args.organizationId}`,
    entryDate: new Date(),
    postedById: args.actorId,
    organizationId: args.organizationId,
    lines: [
      ...allocations.map((alloc) => ({
        accountCode: "5010",
        accountName: "Direct Labor",
        debit: alloc.gross,
        credit: 0,
        description: `Gross payroll allocation — ${args.period}`,
        projectId: alloc.projectId,
      })),
      ...(totalNetPayable > 0 ? [{
        accountCode: "2030",
        accountName: "Salary Payable",
        debit: 0,
        credit: totalNetPayable,
        description: `Net payable — ${args.period} (org-level liability)`,
      }] : []),
      ...(totalTds > 0 ? [{
        accountCode: "2020" as const,
        accountName: "TDS Payable",
        debit: 0,
        credit: totalTds,
        description: `TDS deducted from payroll — ${args.period}`,
      }] : []),
      ...(totalAdvancesRecovered > 0 ? [{
        accountCode: "2040" as const,
        accountName: "Staff Advance Recoverable",
        debit: 0,
        credit: totalAdvancesRecovered,
        description: `Cash advances recovered — ${args.period}`,
      }] : []),
      ...(totalMessAndOther > 0 ? [{
        accountCode: "1001" as const,
        accountName: "Cash on Hand",
        debit: 0,
        credit: totalMessAndOther,
        description: `Mess & other deductions retained — ${args.period}`,
      }] : []),
      ...(deductionExcess > 0 ? [{
        accountCode: "2040" as const,
        accountName: "Staff Advance Recoverable",
        debit: deductionExcess,
        credit: 0,
        description: `Deduction excess (clamp shortfall) — ${args.period}`,
      }] : []),
    ],
  });
}

/** Recover the advanceDeduction+messDeduction of every stored record (FIFO,
 * CAS-guarded, ledgered). Runs at the approve boundary; the liability JE
 * idempotency + ledger unique make retries safe. */
async function recoverRecordAdvances(
  tx: DbTxClient,
  args: { runId: string; organizationId: string },
): Promise<void> {
  const records = (await tx.payrollPersonRecord.findMany({
    where: { payrollRunId: args.runId },
    select: RUN_RECORD_SELECT,
    take: 1000, // bounded (pagination sweep) — see src/lib/pagination.ts
  })).map(asRecord);

  for (const record of records) {
    const totalDeduction = record.advanceDeduction + record.messDeduction;
    if (totalDeduction <= 0) continue;

    // This person's outstanding advances, oldest first (FIFO).
    const personAdvances = (
      await tx.staffAdvance.findMany({
        where: { personId: record.personId },
        orderBy: { date: "asc" },
        take: 1000, // bounded (pagination sweep) — see src/lib/pagination.ts
      })
    ).filter((a) => a.amount - a.recoveredAmount > 0);

    let remainingDeduction = totalDeduction;
    for (const adv of personAdvances) {
      if (remainingDeduction <= 0) break;
      const outstanding = adv.amount - adv.recoveredAmount;
      const take = Math.min(outstanding, remainingDeduction);
      await recoverAdvanceCas(tx, {
        advanceId: adv.id,
        take,
        payrollRunId: args.runId,
        personRecordId: record.id,
        organizationId: args.organizationId,
      });
      remainingDeduction = round2(remainingDeduction - take);
    }
    // A residual > 0 here would mean outstanding advances < the deducted
    // amount — impossible while deductions are computed from the same
    // outstanding pool; if a race creates one, the recovery CAS above
    // already failed loudly.
  }
}

export const payrollRouter = router({
  /**
   * Org-wide payroll PREVIEW for a period: every person with an active
   * assignment anywhere in the org, salary computed ONCE per person from
   * attendance combined across ALL their projects (ADR-0007 §1).
   * `projectId` is accepted as the caller's operating context only — it
   * badges which rows are engaged on the calling project; the preview is
   * always the org-wide roster the run will cover.
   */
  calculate: protectedProcedure
    .input(
      z.object({
        projectId: z.string().optional(),
        month: z.string().regex(/^\d{4}-\d{2}$/, "Month must be YYYY-MM format"),
      })
    )
    .query(async ({ ctx, input }) => {
      if (!ctx.user.organizationId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Organization context required." });
      }
      const organizationId = ctx.user.organizationId;

      const [yearStr, monthStr] = input.month.split("-");
      const year = parseInt(yearStr, 10);
      const month = parseInt(monthStr, 10);
      const daysInMonth = new Date(year, month, 0).getDate();
      const startDate = new Date(Date.UTC(year, month - 1, 1));
      const endDate = new Date(Date.UTC(year, month - 1, daysInMonth, 23, 59, 59, 999));

      // ALL active assignments org-wide (the run's person universe).
      const assignments = await db.projectStaffAssignment.findMany({
        where: { person: { organizationId }, status: "active" },
        include: {
          person: {
            select: {
              id: true,
              displayName: true,
              bankAccountNo: true,
              bankName: true,
              pan: true,
            },
          },
        },
        orderBy: { fromDate: "asc" },
        take: 1000, // bounded (pagination sweep) — see src/lib/pagination.ts
      });

      // Deduplicate persons — earliest (primary) assignment carries terms.
      const primaryByPerson = new Map<string, (typeof assignments)[number]>();
      const assignmentsByPerson = new Map<string, Array<(typeof assignments)[number]>>();
      for (const a of assignments) {
        if (!primaryByPerson.has(a.personId)) primaryByPerson.set(a.personId, a);
        const list = assignmentsByPerson.get(a.personId) || [];
        list.push(a);
        assignmentsByPerson.set(a.personId, list);
      }

      const assignmentIds = assignments.map((a) => a.id);
      const personIds = [...primaryByPerson.keys()];

      const [attendanceRecords, unrecoveredAdvances, existingRun] = await Promise.all([
        assignmentIds.length
          ? db.staffAttendance.findMany({
              where: { assignmentId: { in: assignmentIds }, date: { gte: startDate, lte: endDate } },
              take: 5000, // bounded — one month of attendance for the org roster
            })
          : Promise.resolve([] as any[]),
        personIds.length
          ? db.staffAdvance.findMany({
              where: { personId: { in: personIds } },
              orderBy: { date: "asc" },
              take: 1000, // bounded (pagination sweep) — see src/lib/pagination.ts
            })
          : Promise.resolve([] as any[]),
        db.payrollRun.findUnique({
          where: {
            organizationId_period: { organizationId, period: input.month },
          },
          include: {
            records: {
              include: {
                allocations: {
                  include: {
                    project: { select: { id: true, name: true, code: true } },
                  },
                },
              },
            },
          },
        }),
      ]);

      // Attendance grouped per person (combined across ALL projects).
      const assignmentById = new Map(assignments.map((a) => [a.id, a]));
      const attendanceByPerson = new Map<string, any[]>();
      for (const record of attendanceRecords) {
        const assignment = assignmentById.get(record.assignmentId);
        if (!assignment) continue;
        const list = attendanceByPerson.get(assignment.personId) || [];
        list.push(record);
        attendanceByPerson.set(assignment.personId, list);
      }

      // Outstanding advances grouped per person & type (outstanding only).
      const advancesByPerson = new Map<string, { cashAdvances: number; messDeductions: number; otherDeductions: number }>();
      for (const adv of unrecoveredAdvances) {
        if (adv.amount - adv.recoveredAmount <= 0) continue;
        if (!advancesByPerson.has(adv.personId)) {
          advancesByPerson.set(adv.personId, { cashAdvances: 0, messDeductions: 0, otherDeductions: 0 });
        }
        const outstanding = adv.amount - adv.recoveredAmount;
        const current = advancesByPerson.get(adv.personId)!;
        if (adv.type === "cash_advance") current.cashAdvances += outstanding;
        else if (adv.type === "mess_deduction") current.messDeductions += outstanding;
        else current.otherDeductions += outstanding;
      }

      const payrollItems = personIds.map((personId) => {
        const primary = primaryByPerson.get(personId)!;
        const records = attendanceByPerson.get(personId) || [];
        const adv = advancesByPerson.get(personId) || { cashAdvances: 0, messDeductions: 0, otherDeductions: 0 };
        const line = computePayrollLine(
          {
            id: personId,
            name: primary.person.displayName,
            designation: primary.designation,
            category: primary.category,
            employmentType: primary.employmentType,
            gangName: primary.gangName,
            dailyWage: primary.dailyWage,
            monthlySalary: primary.monthlySalary,
            bankAccountNo: primary.person.bankAccountNo,
            bankName: primary.person.bankName,
            pan: primary.person.pan,
          },
          records.map((r: any) => ({
            date: r.date,
            status: r.status,
            hours: r.hours,
            overtime: r.overtime,
          })),
          adv,
          daysInMonth,
        );
        return {
          ...line,
          projectNames: assignmentsByPerson.get(personId)!.map((a) => a.projectId),
          onCallingProject: input.projectId
            ? assignmentsByPerson.get(personId)!.some((a) => a.projectId === input.projectId)
            : true,
        };
      });

      // Sort: this project's people first, then the rest (org-wide roster).
      payrollItems.sort((a, b) => Number(b.onCallingProject) - Number(a.onCallingProject));

      const summary = {
        totalStaff: payrollItems.length,
        totalRegularPay: payrollItems.reduce((sum2, item) => sum2 + item.regularPay, 0),
        totalOvertimePay: payrollItems.reduce((sum2, item) => sum2 + item.overtimePay, 0),
        totalGross: payrollItems.reduce((sum2, item) => sum2 + item.gross, 0),
        totalAdvanceRecoveries: payrollItems.reduce((sum2, item) => sum2 + item.advanceDeduction, 0),
        totalMessDeductions: payrollItems.reduce((sum2, item) => sum2 + item.messDeduction, 0),
        totalTds: payrollItems.reduce((sum2, item) => sum2 + item.tdsAmount, 0),
        grandTotal: payrollItems.reduce((sum2, item) => sum2 + item.netPayable, 0),
      };

      return {
        month: input.month,
        daysInMonth,
        payrollItems,
        summary,
        existingRun: existingRun
          ? {
              ...existingRun,
              records: existingRun.records.map((r: any) => ({
                ...r,
                paymentStatus: derivePaymentStatus(r.paidAmount, r.netPayable),
              })),
            }
          : null,
      };
    }),

  /**
   * Create / update a DRAFT org-level run. Additive by design: submitted
   * person records are (re)computed from org-wide data; records for other
   * persons already in the run are KEPT — saving from one project never
   * wipes another project's people (the org-wide run belongs to the org).
   * Drafts consume nothing: advances are recovered and the liability JE
   * posts at APPROVE.
   */
  createPayrollRun: protectedProcedure
    .use(capabilityGuard({ workforcePlanning: true })) // ADR-0004: workforce planning is a capability
    .input(
      z.object({
        month: z.string().regex(/^\d{4}-\d{2}$/, "Month must be YYYY-MM format"),
        notes: z.string().optional().nullable(),
        records: z.array(
          z.object({
            personId: z.string(),
            remarks: z.string().optional().nullable(),
            // Audited manual split (ADR-0007 §2): every row requires an
            // overrideReason and the split must balance to the cent.
            manualAllocations: z
              .array(
                z.object({
                  assignmentId: z.string(),
                  gross: z.number().nonnegative(),
                  allowances: z.number().nonnegative().default(0),
                  advanceDeduction: z.number().nonnegative().default(0),
                  tdsAmount: z.number().nonnegative().default(0),
                  net: z.number().nonnegative(),
                  overrideReason: z.string().min(3),
                })
              )
              .optional()
              .nullable(),
          })
        ),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user.organizationId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Organization context required." });
      }
      const organizationId = ctx.user.organizationId;

      // Payroll is an ORG-level function (ADR-0007): the run aggregates the
      // org's workforce cost, so the org's admins own it.
      if (!isOrgAdmin(ctx.user)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Organization admin access required to save payroll runs." });
      }

      // Parse input.month (format "YYYY-MM") into a Date for fiscal-year
      // lock checking — back-dating a run into a locked year is refused.
      const payrollDate = input.month ? new Date(input.month + "-01") : new Date();
      await assertNotLocked(organizationId, payrollDate);

      const existingRun = await db.payrollRun.findUnique({
        where: { organizationId_period: { organizationId, period: input.month } },
        select: { id: true, status: true },
      });
      if (existingRun && existingRun.status !== "draft") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `The ${input.month} run is ${existingRun.status} — approved and disbursed runs are immutable. Reopen it (if approved) before editing.`,
        });
      }

      const [yearStr, monthStr] = input.month.split("-");
      const year = parseInt(yearStr, 10);
      const month = parseInt(monthStr, 10);
      const daysInMonth = new Date(year, month, 0).getDate();
      const startDate = new Date(Date.UTC(year, month - 1, 1));
      const endDate = new Date(Date.UTC(year, month - 1, daysInMonth, 23, 59, 59, 999));

      const submittedPersonIds = [...new Set(input.records.map((r) => r.personId))];

      // Every submitted person must hold an ACTIVE assignment somewhere in
      // the org; the terms come from their primary (earliest) assignment.
      const assignments = await db.projectStaffAssignment.findMany({
        where: {
          personId: { in: submittedPersonIds },
          person: { organizationId },
          status: "active",
        },
        include: {
          person: {
            select: {
              id: true,
              displayName: true,
              bankAccountNo: true,
              bankName: true,
              pan: true,
            },
          },
        },
        orderBy: { fromDate: "asc" },
      });

      const assignmentsByPerson = new Map<string, typeof assignments>();
      for (const a of assignments) {
        const list = assignmentsByPerson.get(a.personId) || [];
        list.push(a);
        assignmentsByPerson.set(a.personId, list);
      }
      for (const personId of submittedPersonIds) {
        if (!assignmentsByPerson.has(personId)) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `Person ${personId} has no active assignment in this organization.`,
          });
        }
      }

      const allAssignmentIds = assignments.map((a) => a.id);
      const [attendanceRecords, advances] = await Promise.all([
        allAssignmentIds.length
          ? db.staffAttendance.findMany({
              where: { assignmentId: { in: allAssignmentIds }, date: { gte: startDate, lte: endDate } },
              take: 5000, // bounded — one month of org attendance
            })
          : Promise.resolve([] as any[]),
        db.staffAdvance.findMany({
          where: { personId: { in: submittedPersonIds } },
          orderBy: { date: "asc" }, // FIFO recovery order
          take: 1000, // bounded (pagination sweep) — see src/lib/pagination.ts
        }),
      ]);

      const assignmentById = new Map(assignments.map((a) => [a.id, a]));
      const attendanceByPerson = new Map<string, any[]>();
      for (const record of attendanceRecords) {
        const assignment = assignmentById.get(record.assignmentId);
        if (!assignment) continue;
        const list = attendanceByPerson.get(assignment.personId) || [];
        list.push(record);
        attendanceByPerson.set(assignment.personId, list);
      }

      const advancesByPerson = new Map<string, { cashAdvances: number; messDeductions: number; otherDeductions: number }>();
      for (const adv of advances.filter((a: any) => a.amount - a.recoveredAmount > 0)) {
        if (!advancesByPerson.has(adv.personId)) {
          advancesByPerson.set(adv.personId, { cashAdvances: 0, messDeductions: 0, otherDeductions: 0 });
        }
        const outstanding = adv.amount - adv.recoveredAmount;
        const current = advancesByPerson.get(adv.personId)!;
        if (adv.type === "cash_advance") current.cashAdvances += outstanding;
        else if (adv.type === "mess_deduction") current.messDeductions += outstanding;
        else current.otherDeductions += outstanding;
      }

      // Server-side recomputation — client-submitted amounts are never trusted.
      const computedByPerson = new Map<string, ReturnType<typeof computePayrollLine>>();
      for (const rec of input.records) {
        const personAssignments = assignmentsByPerson.get(rec.personId)!;
        const primary = personAssignments[0];
        const attendance = attendanceByPerson.get(rec.personId) || [];
        const adv = advancesByPerson.get(rec.personId) || { cashAdvances: 0, messDeductions: 0, otherDeductions: 0 };
        computedByPerson.set(
          rec.personId,
          computePayrollLine(
            {
              id: rec.personId,
              name: primary.person.displayName,
              designation: primary.designation,
              category: primary.category,
              employmentType: primary.employmentType,
              gangName: primary.gangName,
              dailyWage: primary.dailyWage,
              monthlySalary: primary.monthlySalary,
              bankAccountNo: primary.person.bankAccountNo,
              bankName: primary.person.bankName,
              pan: primary.person.pan,
            },
            attendance.map((r: any) => ({
              date: r.date,
              status: r.status,
              hours: r.hours,
              overtime: r.overtime,
            })),
            adv,
            daysInMonth,
          ),
        );
      }

      const payrollRun = await db.$transaction(async (tx) => {
        await withOrgContext(tx, organizationId, !!ctx.user.isSuperAdmin);

        const org = await tx.organization.findUnique({
          where: { id: organizationId },
          select: { activePolicyVersionId: true },
        });

        // Upsert the ORG-level run (one per org per period — database-enforced).
        const run = await tx.payrollRun.upsert({
          where: {
            organizationId_period: { organizationId, period: input.month },
          },
          create: {
            organizationId,
            period: input.month,
            status: "draft",
            policyVersionId: org?.activePolicyVersionId ?? null, // bind to the ACTIVE policy (ADR-0004)
            notes: input.notes || null,
          },
          update: {
            policyVersionId: org?.activePolicyVersionId ?? null,
            notes: input.notes || null,
          },
        });

        // Replace the submitted persons' records; keep everyone else's
        // (additive re-save). Totals are recomputed from ALL records below.
        await tx.payrollPersonRecord.deleteMany({
          where: { payrollRunId: run.id, personId: { in: submittedPersonIds } },
        });

        const inserted: Array<{ record: RunRecord; computed: ReturnType<typeof computePayrollLine>; remarks: string | null }> = [];
        for (const rec of input.records) {
          const computed = computedByPerson.get(rec.personId)!;
          const created = await tx.payrollPersonRecord.create({
            data: {
              organizationId,
              payrollRunId: run.id,
              personId: rec.personId,
              employmentType: computed.employmentType,
              presentDays: computed.presentDays,
              halfDays: computed.halfDays,
              absentDays: computed.absentDays,
              leaveDays: computed.leaveDays,
              overtimeHours: computed.overtimeHours,
              baseRate: computed.baseRate,
              regularPay: computed.regularPay,
              overtimePay: computed.overtimePay,
              allowances: computed.allowances,
              advanceDeduction: computed.advanceDeduction,
              messDeduction: computed.messDeduction,
              otherDeductions: computed.otherDeductions,
              tdsAmount: computed.tdsAmount,
              netPayable: computed.netPayable,
              remarks: rec.remarks || null,
            },
          });
          inserted.push({ record: asRecord(created), computed, remarks: rec.remarks || null });
        }

        // ── Allocations (ADR-0007 §2) — across ALL the person's active
        // assignments org-wide: actual days → allocationPercent → residual;
        // manual splits require an overrideReason and balance to the cent.
        for (const { record, computed } of inserted) {
          const rec = input.records.find((r) => r.personId === record.personId)!;
          const personAssignments = assignmentsByPerson.get(record.personId)!;

          const effectiveDays = new Map<string, number>();
          const attendance = attendanceByPerson.get(record.personId) || [];
          for (const r of attendance) {
            const effective =
              (r.status === "present" || r.status === "overtime" ? 1 : 0) +
              (r.status === "half_day" ? 0.5 : 0);
            if (effective > 0) {
              effectiveDays.set(r.assignmentId, (effectiveDays.get(r.assignmentId) ?? 0) + effective);
            }
          }

          let planned;
          try {
            planned = planPersonAllocations({
              assignments: personAssignments.map((a) => ({
                id: a.id,
                projectId: a.projectId,
                fromDate: a.fromDate,
                allocationPercent: a.allocationPercent === null ? null : Number(a.allocationPercent),
              })),
              effectiveDays,
              cost: {
                netPayable: computed.netPayable,
                gross: computed.gross,
                allowances: computed.allowances,
                advanceDeduction: computed.advanceDeduction,
                tdsAmount: computed.tdsAmount,
              },
              manual: rec.manualAllocations as ManualSplitRow[] | null | undefined,
            });
          } catch (err: any) {
            throw new TRPCError({ code: "BAD_REQUEST", message: err?.message || "Invalid allocation split." });
          }

          for (const alloc of planned) {
            await tx.payrollAllocation.create({
              data: {
                organizationId,
                payrollRunId: run.id,
                personRecordId: record.id,
                assignmentId: alloc.assignmentId,
                projectId: alloc.projectId,
                basis: alloc.basis,
                presentDays: alloc.presentDays,
                allocationPercent: alloc.allocationPercent,
                gross: alloc.gross,
                allowances: alloc.allowances,
                advanceDeduction: alloc.advanceDeduction,
                tdsAmount: alloc.tdsAmount,
                net: alloc.net,
                overrideReason: alloc.overrideReason,
              },
            });
          }
        }

        // Recompute run totals from ALL records (submitted + kept).
        const allRecords = (await tx.payrollPersonRecord.findMany({
          where: { payrollRunId: run.id },
          select: RUN_RECORD_SELECT,
          take: 1000, // bounded (pagination sweep) — see src/lib/pagination.ts
        })).map(asRecord);

        const totalGross = allRecords.reduce((s, r) => s + r.regularPay + r.overtimePay + r.allowances, 0);
        const totalAllowances = allRecords.reduce((s, r) => s + r.allowances, 0);
        const totalDeductions = allRecords.reduce(
          (s, r) => s + r.advanceDeduction + r.messDeduction + r.otherDeductions + r.tdsAmount, 0,
        );
        const totalAdvancesRecovered = allRecords.reduce((s, r) => s + r.advanceDeduction, 0);
        const totalNetPayable = allRecords.reduce((s, r) => s + r.netPayable, 0);

        const updatedRun = await tx.payrollRun.update({
          where: { id: run.id },
          data: {
            totalPersonCount: allRecords.length,
            totalGross: round2(totalGross),
            totalAllowances: round2(totalAllowances),
            totalDeductions: round2(totalDeductions),
            totalAdvancesRecovered: round2(totalAdvancesRecovered),
            totalNetPayable: round2(totalNetPayable),
          },
        });

        return updatedRun;
      });

      return { payrollRun };
    }),

  /** List historical payroll runs (org-wide, newest first). */
  listRuns: protectedProcedure
    .query(async ({ ctx }) => {
      if (!ctx.user.organizationId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Organization context required." });
      }

      const runs = await db.payrollRun.findMany({
        where: { organizationId: ctx.user.organizationId },
        orderBy: { period: "desc" },
        take: 1000, // bounded (pagination sweep) — see src/lib/pagination.ts
      });

      return { runs };
    }),

  /** Get a specific payroll run with person payslip records (derived payment status). */
  getRun: protectedProcedure
    .input(z.object({ runId: z.string() }))
    .query(async ({ ctx, input }) => {
      if (!ctx.user.organizationId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Organization context required." });
      }

      const run = await db.payrollRun.findFirst({
        where: {
          id: input.runId,
          organizationId: ctx.user.organizationId,
        },
        include: {
          records: {
            include: {
              person: {
                select: {
                  id: true,
                  displayName: true,
                  phone: true,
                  bankAccountNo: true,
                  bankName: true,
                  pan: true,
                },
              },
              allocations: {
                include: {
                  project: { select: { id: true, name: true, code: true } },
                  assignment: { select: { id: true, designation: true, gangName: true } },
                },
              },
            },
          },
        },
      });

      if (!run) throw new TRPCError({ code: "NOT_FOUND", message: "Payroll run not found." });

      return {
        run: {
          ...run,
          records: run.records.map((r) => ({
            ...r,
            paymentStatus: derivePaymentStatus(r.paidAmount, r.netPayable),
          })),
        },
      };
    }),

  /**
   * Run lifecycle: approve (liability boundary), disburse (settlement
   * primitive), reopen (exact reversal). ORG-admin authority — the run is
   * org-wide; a project role neither grants nor constrains it.
   */
  updateRunStatus: protectedProcedure
    .input(
      z.object({
        runId: z.string(),
        action: z.enum(["approve", "disburse", "reopen"]),
        notes: z.string().optional().nullable(),
        // Central bank account the net payroll is drawn on. When set, the
        // account's currentBalance is atomically decremented in the same
        // transaction as the settlement JE.
        companyBankAccountId: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user.organizationId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Organization context required." });
      }
      const organizationId = ctx.user.organizationId;

      if (!isOrgAdmin(ctx.user)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Organization admin access required to approve, disburse, or reopen payroll runs." });
      }

      const run = await db.payrollRun.findFirst({
        where: { id: input.runId, organizationId },
      });
      if (!run) throw new TRPCError({ code: "NOT_FOUND", message: "PayrollRun not found." });

      // FISCAL LOCK: check the PAYROLL MONTH the run is for, not the row's
      // createdAt — a run created this month for a locked month passed the
      // old check and back-dated the whole run.
      const [payrollYear, payrollMonth] = run.period.split("-").map(Number);
      await assertNotLocked(organizationId, new Date(Date.UTC(payrollYear, (payrollMonth || 1) - 1, 15)));

      // H-16: delegation on money movement — approve posts the liability,
      // disburse moves the cash.
      if (input.action === "approve") {
        await assertDelegation(ctx.user, "create_payroll_run", run.totalNetPayable);
      }
      if (input.action === "disburse") {
        await assertDelegation(ctx.user, "disburse_payroll", run.totalNetPayable);
        if (input.companyBankAccountId) {
          await assertOrgBankAccount(input.companyBankAccountId, organizationId);
        }
      }

      // Lifecycle (payrollRun graph): draft → approved → disbursed.
      // Reopen (approved → draft) reverses exactly; disbursed is terminal —
      // a disbursed run's settlement JE and paidAmounts cannot be undone
      // through this endpoint.
      const targetState =
        input.action === "approve" ? "approved" : input.action === "disburse" ? "disbursed" : "draft";

      const updated = await db.$transaction(async (tx) => {
        await withOrgContext(tx, organizationId, !!ctx.user.isSuperAdmin);

        // Transition FIRST: an invalid/out-of-order move throws before any
        // money moves (everything shares the tx anyway).
        const result = await transitionEntityState(tx, {
          model: "payrollRun",
          id: input.runId,
          targetState,
          userId: ctx.user.id,
          userName: ctx.user.name,
          allowedCurrentStates:
            input.action === "approve" ? ["draft"] : input.action === "disburse" ? ["approved"] : ["approved"],
          additionalData: {
            ...(input.action === "disburse" ? { disbursedAmount: run.totalNetPayable } : {}),
            ...(input.notes !== undefined ? { notes: input.notes } : {}),
          },
          skipEventEmit: true, // payrollRun has no event consumers today
        });

        if (input.action === "approve") {
          // The liability boundary: recover advances (CAS + ledger) and
          // post the org-level liability JE from stored state.
          await recoverRecordAdvances(tx, { runId: run.id, organizationId });
          await postPayrollLiabilityJe(tx, {
            runId: run.id,
            period: run.period,
            organizationId,
            actorId: ctx.user.id,
          });
        }

        if (input.action === "disburse") {
          // Settlement primitive (ADR-0006 §2): settlement JE + optional
          // bank decrement + payslips bumped by AMOUNT (status is derived).
          await settlePayrollRun(tx, {
            organizationId,
            runId: run.id,
            period: run.period,
            totalNetPayable: run.totalNetPayable,
            actorId: ctx.user.id,
            companyBankAccountId: input.companyBankAccountId ?? null,
          });
        }

        if (input.action === "reopen") {
          // Exact reversal of the approve boundary: JE reversal first
          // (a hook failure must never strand advances un-recovered), then
          // the ledgered un-recovery, then payslip amounts reset.
          const liabilityJe = await tx.journalEntry.findFirst({
            where: { source: "payroll", sourceRefId: run.id },
            select: { id: true },
          });
          if (liabilityJe) {
            await reverseJournalEntry(tx, liabilityJe.id, `Payroll run ${run.period} reopened`);
          }
          await reverseAdvanceRecoveries(tx, run.id);
          await tx.payrollPersonRecord.updateMany({
            where: { payrollRunId: run.id },
            data: { paidAmount: 0 },
          });
        }

        return result.entity;
      });

      // Disbursement moves payroll into the cash outflow picture; the org
      // span of the run means every touched project's cache is stale.
      await invalidateProjectCache(organizationId, ["cashflow"]);
      return { run: updated };
    }),

  /**
   * Record a per-payslip payment (partial or full) — CAS increment on
   * paidAmount (never over net, never a status flip; the status is
   * derived from amounts, ADR-0006 §2).
   */
  updateStaffPayment: protectedProcedure
    .input(
      z.object({
        recordId: z.string(),
        amount: z.number().positive(),
        paymentMethod: z.enum(["cash", "bank_transfer", "cheque"]).default("cash"),
        paymentReference: z.string().optional().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user.organizationId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Organization context required." });
      }
      if (!isOrgAdmin(ctx.user)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Organization admin access required to record payslip payments." });
      }

      // Verify the record belongs to the caller's org (org-level runs).
      const record = await db.payrollPersonRecord.findFirst({
        where: {
          id: input.recordId,
          payrollRun: { organizationId: ctx.user.organizationId },
        },
        include: { payrollRun: { select: { status: true, period: true } } },
      });
      if (!record) throw new TRPCError({ code: "NOT_FOUND", message: "Payroll record not found." });

      // Payslips can only be paid while the run is in a payment-eligible
      // state — a draft has no posted liability to settle against.
      if (record.payrollRun.status === "draft") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This payroll run is still a draft — approve it before recording payslip payments.",
        });
      }

      await assertNotLocked(ctx.user.organizationId, record.createdAt);

      await db.$transaction(async (tx) => {
        await withOrgContext(tx, ctx.user.organizationId, !!ctx.user.isSuperAdmin);

        // CAS increment: paidAmount + amount ≤ netPayable — concurrent
        // payments cannot overpay a payslip.
        const updated = await tx.$executeRaw`
          UPDATE "PayrollPersonRecord"
             SET "paidAmount" = "paidAmount" + ${input.amount},
                 "paymentMethod" = ${input.paymentMethod},
                 "paymentReference" = ${input.paymentReference || null},
                 "updatedAt" = NOW()
           WHERE "id" = ${input.recordId}
             AND "paidAmount" + ${input.amount} <= "netPayable" + 0.01`;
        if (updated === 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "This payment would exceed the payslip's net payable — reload and check the outstanding amount.",
          });
        }
      });

      const fresh = await db.payrollPersonRecord.findUnique({ where: { id: input.recordId } });
      return {
        record: fresh
          ? { ...fresh, paymentStatus: derivePaymentStatus(fresh.paidAmount, fresh.netPayable) }
          : null,
      };
    }),
});

/** Round to 2 decimal places without float drift beyond cents. */
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
