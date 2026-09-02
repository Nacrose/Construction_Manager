/**
 * tRPC router for Construction Payroll Management:
 * Org-Level Monthly Payroll Runs, Advance Deductions, Allowances,
 * Approval Cycles, and Worker Payslips.
 *
 * ADR-0007 grain: one PayrollRun per ORG per period (database-enforced),
 * one PayrollPersonRecord per person per run (salary computed once per
 * person), and PayrollAllocation rows that split cost to projects with the
 * hard invariant Σ allocation.net ≡ record.netPayable (exact — Decimal).
 * The org-level journal entry's labor expense LINES carry projectId per
 * allocation; liability accounts and bank stay organization-level.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "@/server/trpc";
import { db } from "@/lib/db";
import { invalidateProjectCache } from "@/lib/cache";
import { withOrgContext } from "@/lib/rls";
import { assertProjectMember, assertCanWrite, assertProjectAdmin, assertOrgBankAccount } from "@/lib/authz";
import { computePayrollLine } from "@/server/utils/payroll-calc";
import { assertNotLocked } from "@/lib/fiscal-year-lock";
import { createJournalEntry } from "@/lib/journal-entry";
import { assertDelegation } from "@/lib/delegation";
import { decrementBankBalanceInTx } from "@/lib/bank-balance";
import { transitionEntityState } from "@/server/utils/state-machine";

/** CAS-guarded advance recovery (ADR-0007): the increment only lands while
 * recoveredAmount + x ≤ amount. Never a boolean flip, never a principal
 * mutation; concurrent runs cannot double-recover. */
async function recoverAdvanceCas(
  tx: any,
  advanceId: string,
  take: number,
  payrollRunId: string,
): Promise<void> {
  const updated = await tx.$executeRaw`
    UPDATE "StaffAdvance"
       SET "recoveredAmount" = "recoveredAmount" + ${take},
           "recoveredInPayrollId" = ${payrollRunId},
           "updatedAt" = NOW()
     WHERE "id" = ${advanceId}
       AND "recoveredAmount" + ${take} <= "amount"`;
  if (updated === 0) {
    throw new TRPCError({
      code: "CONFLICT",
      message: `Advance ${advanceId} was concurrently recovered or has insufficient outstanding balance — reload and retry.`,
    });
  }
}

export const payrollRouter = router({
  /** Calculate on-the-fly preview for a given project and period (YYYY-MM). */
  calculate: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        month: z.string().regex(/^\d{4}-\d{2}$/, "Month must be YYYY-MM format"),
      })
    )
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);
      if (!ctx.user.organizationId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Organization context required." });
      }

      const [yearStr, monthStr] = input.month.split("-");
      const year = parseInt(yearStr, 10);
      const month = parseInt(monthStr, 10);

      const daysInMonth = new Date(year, month, 0).getDate();
      const startDate = new Date(Date.UTC(year, month - 1, 1));
      const endDate = new Date(Date.UTC(year, month - 1, daysInMonth, 23, 59, 59, 999));

      const [assignments, attendanceRecords, existingRun] = await Promise.all([
        db.projectStaffAssignment.findMany({
          where: { projectId: input.projectId, status: "active" },
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
          orderBy: [{ gangName: "asc" }, { category: "asc" }, { person: { displayName: "asc" } }],
           take: 1000, // bounded (pagination sweep) — see src/lib/pagination.ts
         }),
        db.staffAttendance.findMany({
          where: {
            projectId: input.projectId,
            date: { gte: startDate, lte: endDate },
          },
           take: 1000, // bounded (pagination sweep) — see src/lib/pagination.ts
         }),
        db.payrollRun.findUnique({
          where: {
            organizationId_period: {
              organizationId: ctx.user.organizationId,
              period: input.month,
            },
          },
          include: {
            records: true,
          },
        }),
      ]);

      // Deduplicate persons (a shared worker on two assignments of this
      // project is ONE payroll person record).
      const personByAssignment = new Map<string, (typeof assignments)[number]>();
      const persons = new Map<string, (typeof assignments)[number]["person"] & {
        assignment: (typeof assignments)[number];
      }>();
      for (const a of assignments) {
        personByAssignment.set(a.id, a);
        if (!persons.has(a.personId)) {
          persons.set(a.personId, { ...a.person, assignment: a });
        }
      }

      // Outstanding advances of the persons being paid (ADR-0007: advances
      // belong to the PERSON; outstanding = amount - recoveredAmount)
      const personIds = [...persons.keys()];
      const unrecoveredAdvances = personIds.length
        ? await db.staffAdvance.findMany({
            where: {
              personId: { in: personIds },
              recoveredAmount: { lt: db.staffAdvance.fields.amount },
            },
             take: 1000, // bounded (pagination sweep) — see src/lib/pagination.ts
           })
        : [];

      // Group attendance by personId (combined across the person's
      // assignments on this project).
      const attendanceByPerson = new Map<string, typeof attendanceRecords>();
      for (const record of attendanceRecords) {
        const assignment = personByAssignment.get(record.assignmentId);
        if (!assignment) continue;
        const existing = attendanceByPerson.get(assignment.personId) || [];
        existing.push(record);
        attendanceByPerson.set(assignment.personId, existing);
      }

      // Group outstanding advances by personId & type (outstanding = amount - recoveredAmount)
      const advancesByPerson = new Map<string, { cashAdvances: number; messDeductions: number; otherDeductions: number }>();
      for (const adv of unrecoveredAdvances) {
        if (!advancesByPerson.has(adv.personId)) {
          advancesByPerson.set(adv.personId, { cashAdvances: 0, messDeductions: 0, otherDeductions: 0 });
        }
        const outstanding = adv.amount - adv.recoveredAmount;
        const current = advancesByPerson.get(adv.personId)!;
        if (adv.type === "cash_advance") current.cashAdvances += outstanding;
        else if (adv.type === "mess_deduction") current.messDeductions += outstanding;
        else current.otherDeductions += outstanding;
      }

      // Compute person lines using the shared calculation helper.
      // This ensures `calculate` (preview) and `createPayrollRun` (commit)
      // produce identical numbers — previously they could diverge.
      const payrollItems = [...persons.values()].map((p) => {
        const records = attendanceByPerson.get(p.id) || [];
        const adv = advancesByPerson.get(p.id) || { cashAdvances: 0, messDeductions: 0, otherDeductions: 0 };
        const a = p.assignment;
        return computePayrollLine(
          {
            id: p.id,
            name: p.displayName,
            designation: a.designation,
            category: a.category,
            employmentType: a.employmentType,
            gangName: a.gangName,
            dailyWage: a.dailyWage,
            monthlySalary: a.monthlySalary,
            bankAccountNo: p.bankAccountNo,
            bankName: p.bankName,
            pan: p.pan,
          },
          records.map((r) => ({
            date: r.date,
            status: r.status,
            hours: r.hours,
            overtime: r.overtime,
          })),
          adv,
          daysInMonth,
        );
      });

      // Summary totals
      const summary = {
        totalStaff: payrollItems.length,
        totalRegularPay: payrollItems.reduce((sum, item) => sum + item.regularPay, 0),
        totalOvertimePay: payrollItems.reduce((sum, item) => sum + item.overtimePay, 0),
        totalGross: payrollItems.reduce((sum, item) => sum + item.gross, 0),
        totalAdvanceRecoveries: payrollItems.reduce((sum, item) => sum + item.advanceDeduction, 0),
        totalMessDeductions: payrollItems.reduce((sum, item) => sum + item.messDeduction, 0),
        totalTds: payrollItems.reduce((sum, item) => sum + item.tdsAmount, 0),
        grandTotal: payrollItems.reduce((sum, item) => sum + item.netPayable, 0),
      };

      return {
        month: input.month,
        daysInMonth,
        payrollItems,
        summary,
        existingRun,
      };
    }),

  /** Create / Save persistent org-level Payroll Run and lock in advance recoveries. */
  createPayrollRun: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        month: z.string().regex(/^\d{4}-\d{2}$/, "Month must be YYYY-MM format"),
        notes: z.string().optional().nullable(),
        // Client sends attendance-based records per PERSON. The server
        // RECOMPUTES all pay amounts (regularPay, overtimePay, tdsAmount,
        // netPayable) from the attendance + person data — the client's
        // submitted amounts are IGNORED and only used as a sanity reference.
        // This prevents a malicious/buggy client from persisting wrong
        // net payables.
        records: z.array(
          z.object({
            personId: z.string(),
            // Attendance summary (used for server-side recomputation)
            presentDays: z.number().nonnegative(),
            halfDays: z.number().nonnegative().default(0),
            absentDays: z.number().nonnegative().default(0),
            leaveDays: z.number().nonnegative().default(0),
            overtimeHours: z.number().nonnegative().default(0),
            // Client-submitted amounts (for reference only — server recomputes)
            employmentType: z.string().default("daily"),
            baseRate: z.number().nonnegative(),
            regularPay: z.number().nonnegative(),
            overtimePay: z.number().nonnegative().default(0),
            allowances: z.number().nonnegative().default(0),
            advanceDeduction: z.number().nonnegative().default(0),
            messDeduction: z.number().nonnegative().default(0),
            otherDeductions: z.number().nonnegative().default(0),
            tdsAmount: z.number().nonnegative().default(0),
            netPayable: z.number().nonnegative(),
            remarks: z.string().optional().nullable(),
          })
        ),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertCanWrite(ctx.user, input.projectId);
      if (!ctx.user.organizationId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Organization context required." });
      }
      // Parse input.month (format "YYYY-MM") into a Date for fiscal-year
      // lock checking. Previously this used new Date() (today), so
      // back-dating a payroll run to a locked fiscal year bypassed the lock.
      const _payrollDate = input.month ? new Date(input.month + "-01") : new Date();
      await assertNotLocked(ctx.user.organizationId, _payrollDate);

      // ── Server-side recomputation ──────────────────────────────
      // Fetch fresh assignments + attendance + advances data and recompute
      // all pay amounts. Client-submitted amounts are NOT trusted.
      const [yearStr, monthStr] = input.month.split("-");
      const year = parseInt(yearStr, 10);
      const month = parseInt(monthStr, 10);
      const daysInMonth = new Date(year, month, 0).getDate();
      const startDate = new Date(Date.UTC(year, month - 1, 1));
      const endDate = new Date(Date.UTC(year, month - 1, daysInMonth, 23, 59, 59, 999));

      const personIds = [...new Set(input.records.map((r) => r.personId))];

      const [assignments, attendanceRecords, unrecoveredAdvances, org] = await Promise.all([
        // Active assignments of these persons on the AUTHORIZED project
        db.projectStaffAssignment.findMany({
         take: 1000, // bounded (pagination sweep) — see src/lib/pagination.ts
          where: { personId: { in: personIds }, projectId: input.projectId, status: "active" },
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
        }),
        db.staffAttendance.findMany({
         take: 1000, // bounded (pagination sweep) — see src/lib/pagination.ts
          where: {
            projectId: input.projectId,
            assignment: { personId: { in: personIds } },
            date: { gte: startDate, lte: endDate },
          },
        }),
        db.staffAdvance.findMany({
          where: { personId: { in: personIds } },
          orderBy: { date: "asc" }, // FIFO recovery order
           take: 1000, // bounded (pagination sweep) — see src/lib/pagination.ts
        }),
        db.organization.findUnique({
          where: { id: ctx.user.organizationId },
          select: { id: true, activePolicyVersionId: true },
        }),
      ]);

      if (!org) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Organization not found." });
      }

      // Verify every submitted personId has an ACTIVE assignment on the
      // authorized project (and collect their terms).
      const assignmentByPerson = new Map<string, (typeof assignments)[number]>();
      for (const a of assignments) {
        // a person may hold several assignments on this project — the
        // first (oldest) one carries the pay terms for the person record.
        if (!assignmentByPerson.has(a.personId)) assignmentByPerson.set(a.personId, a);
      }
      for (const rec of input.records) {
        if (!assignmentByPerson.has(rec.personId)) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `Person ${rec.personId} has no active assignment in this project.`,
          });
        }
      }

      // Group attendance by personId
      const assignmentById = new Map(assignments.map((a) => [a.id, a]));
      const attendanceByPerson = new Map<string, typeof attendanceRecords>();
      for (const record of attendanceRecords) {
        const assignment = assignmentById.get(record.assignmentId);
        if (!assignment) continue;
        const existing = attendanceByPerson.get(assignment.personId) || [];
        existing.push(record);
        attendanceByPerson.set(assignment.personId, existing);
      }

      // Group outstanding advances by personId & type (outstanding only)
      const advancesByPerson = new Map<string, { cashAdvances: number; messDeductions: number; otherDeductions: number }>();
      for (const adv of unrecoveredAdvances.filter((a) => a.amount - a.recoveredAmount > 0)) {
        if (!advancesByPerson.has(adv.personId)) {
          advancesByPerson.set(adv.personId, { cashAdvances: 0, messDeductions: 0, otherDeductions: 0 });
        }
        const outstanding = adv.amount - adv.recoveredAmount;
        const current = advancesByPerson.get(adv.personId)!;
        if (adv.type === "cash_advance") current.cashAdvances += outstanding;
        else if (adv.type === "mess_deduction") current.messDeductions += outstanding;
        else current.otherDeductions += outstanding;
      }

      // Recompute each record server-side using the shared helper.
      const computedRecords = input.records.map((rec) => {
        const assignment = assignmentByPerson.get(rec.personId)!;
        const attendance = attendanceByPerson.get(rec.personId) || [];
        const advances = advancesByPerson.get(rec.personId) || { cashAdvances: 0, messDeductions: 0, otherDeductions: 0 };
        const computed = computePayrollLine(
          {
            id: rec.personId,
            name: assignment.person.displayName,
            designation: assignment.designation,
            category: assignment.category,
            employmentType: assignment.employmentType,
            gangName: assignment.gangName,
            dailyWage: assignment.dailyWage,
            monthlySalary: assignment.monthlySalary,
            bankAccountNo: assignment.person.bankAccountNo,
            bankName: assignment.person.bankName,
            pan: assignment.person.pan,
          },
          attendance.map((r) => ({
            date: r.date,
            status: r.status,
            hours: r.hours,
            overtime: r.overtime,
          })),
          advances,
          daysInMonth,
        );
        return { rec, computed, remarks: rec.remarks };
      });

      // Use the server-computed values for totals.
      const totalGross = computedRecords.reduce((sum, { computed }) => sum + computed.gross, 0);
      const totalAllowances = computedRecords.reduce((sum, { computed }) => sum + computed.allowances, 0);
      const totalAdvancesRecovered = computedRecords.reduce((sum, { computed }) => sum + computed.advanceDeduction, 0);
      const totalDeductions = computedRecords.reduce((sum, { computed }) => sum + computed.totalDeductions, 0);
      const totalTds = computedRecords.reduce((sum, { computed }) => sum + computed.tdsAmount, 0);
      const totalNetPayable = computedRecords.reduce((sum, { computed }) => sum + computed.netPayable, 0);

      // H-16: delegation gate with the recomputed run total — payroll had
      // NO DelegationAction at all before, so org role/maxAmount rules
      // never applied to one of the largest recurring money movements.
      await assertDelegation(ctx.user, "create_payroll_run", totalNetPayable);

      // payroll-calc.ts clamps `netPayable = Math.max(0, gross - totalDeductions)`.
      // When a person's deductions exceed their gross the clamp silently
      // drops the shortfall and would break the JE balance. Track it and
      // post it as an extra DEBIT line on "Staff Advance Recoverable" (2040)
      // so the entry stays balanced and the shortfall shows in the GL.
      const totalMessAndOther = computedRecords.reduce(
        (s, { computed }) => s + computed.messDeduction + computed.otherDeductions, 0,
      );
      const deductionExcess = computedRecords.reduce((s, { computed }) => {
        const shortfall = computed.totalDeductions - computed.gross;
        return s + (shortfall > 0 ? shortfall : 0);
      }, 0);

      const payrollRun = await db.$transaction(async (tx) => {
        await withOrgContext(tx, ctx.user.organizationId, !!ctx.user.isSuperAdmin);
        // Upsert the ORG-level run (one per org per period — database-enforced)
        const run = await tx.payrollRun.upsert({
          where: {
            organizationId_period: {
              organizationId: ctx.user.organizationId!,
              period: input.month,
            },
          },
          create: {
            organizationId: ctx.user.organizationId!,
            period: input.month,
            status: "draft",
            policyVersionId: org.activePolicyVersionId, // bind the run to the ACTIVE policy (ADR-0004)
            totalPersonCount: computedRecords.length,
            totalGross,
            totalAllowances,
            totalDeductions,
            totalAdvancesRecovered,
            totalNetPayable,
            notes: input.notes || null,
          },
          update: {
            policyVersionId: org.activePolicyVersionId,
            totalPersonCount: computedRecords.length,
            totalGross,
            totalAllowances,
            totalDeductions,
            totalAdvancesRecovered,
            totalNetPayable,
            notes: input.notes || null,
          },
        });

        // Delete old person records for this run if updating draft
        await tx.payrollPersonRecord.deleteMany({ where: { payrollRunId: run.id } });

        // Insert person records — use SERVER-COMPUTED values,
        // NOT the client-submitted ones. One record per person per run.
        const createdRecords: Array<{ id: string; personId: string; netPayable: number; gross: number; allowances: number; advanceDeduction: number; tdsAmount: number }> = [];
        for (const { computed, remarks } of computedRecords) {
          const created = await tx.payrollPersonRecord.create({
            data: {
              organizationId: ctx.user.organizationId!,
              payrollRunId: run.id,
              personId: computed.personId,
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
              remarks: remarks || null,
            },
          });
          createdRecords.push({
            id: created.id,
            personId: computed.personId,
            netPayable: computed.netPayable,
            gross: computed.gross,
            allowances: computed.allowances,
            advanceDeduction: computed.advanceDeduction,
            tdsAmount: computed.tdsAmount,
          });
        }

        // ── Allocations (ADR-0007) ─────────────────────────────────
        // Split each person record's cost across the person's ACTIVE
        // assignments on this project by actual attendance days; the
        // residual lands on the primary assignment so Σ net ≡ record net
        // EXACTLY (single-assignment persons get one 1:1 allocation).
        // Multi-project allocation UI + combined attendance lands in the
        // payroll-allocation service phase; the invariant machinery is
        // already exact here.
        for (const rec of createdRecords) {
          const personAssignments = assignments.filter(
            (a) => a.personId === rec.personId && a.status === "active",
          );
          const ordered = [...personAssignments].sort(
            (a, b) => new Date(a.fromDate).getTime() - new Date(b.fromDate).getTime(),
          );
          const primary = ordered[0];
          if (!primary) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `Person ${rec.personId} lost their active assignment while saving the run — reload and retry.`,
            });
          }

          // Attendance days per assignment for this person (this period)
          const attendanceForPerson = attendanceByPerson.get(rec.personId) || [];
          const daysByAssignment = new Map<string, number>();
          for (const r of attendanceForPerson) {
            const effective =
              (r.status === "present" || r.status === "overtime" ? 1 : 0) +
              (r.status === "half_day" ? 0.5 : 0);
            if (effective > 0) {
              daysByAssignment.set(r.assignmentId, (daysByAssignment.get(r.assignmentId) ?? 0) + effective);
            }
          }
          const totalDays = ordered.reduce((s, a) => s + (daysByAssignment.get(a.id) ?? 0), 0);

          let remainingNet = rec.netPayable;
          let remainingGross = rec.gross;
          let remainingAllowances = rec.allowances;
          let remainingAdvance = rec.advanceDeduction;
          let remainingTds = rec.tdsAmount;

          for (let i = 0; i < ordered.length; i++) {
            const a = ordered[i];
            const isPrimary = i === ordered.length - 1; // residual on the LAST (most recent) assignment
            const share =
              totalDays > 0 && !isPrimary
                ? (daysByAssignment.get(a.id) ?? 0) / totalDays
                : 1;

            const net = isPrimary ? remainingNet : round2(rec.netPayable * share);
            const gross = isPrimary ? remainingGross : round2(rec.gross * share);
            const allowances = isPrimary ? remainingAllowances : round2(rec.allowances * share);
            const advanceDeduction = isPrimary ? remainingAdvance : round2(rec.advanceDeduction * share);
            const tdsAmount = isPrimary ? remainingTds : round2(rec.tdsAmount * share);

            remainingNet = round2(remainingNet - net);
            remainingGross = round2(remainingGross - gross);
            remainingAllowances = round2(remainingAllowances - allowances);
            remainingAdvance = round2(remainingAdvance - advanceDeduction);
            remainingTds = round2(remainingTds - tdsAmount);

            await tx.payrollAllocation.create({
              data: {
                organizationId: ctx.user.organizationId!,
                payrollRunId: run.id,
                personRecordId: rec.id,
                assignmentId: a.id,
                projectId: a.projectId,
                basis: totalDays > 0 ? "actual_days" : "allocation_percent",
                presentDays: daysByAssignment.get(a.id) ?? 0,
                gross,
                allowances,
                advanceDeduction,
                tdsAmount,
                net,
              },
            });
          }
        }

        // IDEMPOTENCY: check for an existing payroll JE before creating JE and deducting advances.
        // Re-saving a draft (or using reopen) would otherwise duplicate
        // the journal entry and double-deduct person advances. This is
        // normal workflow, not an edge case.
        const existingJe = await tx.journalEntry.findFirst({
          where: { source: "payroll", sourceRefId: run.id },
          select: { id: true, entryNumber: true },
        });
        if (existingJe) {
          // JE already exists for this payroll run — advances were already recovered.
          // Skip creation and avoid double-deduction.
          return run;
        }

        // Recover outstanding advances via the settlement primitive:
        // FIFO (oldest first), CAS-guarded increments on recoveredAmount.
        // Only the DEDUCTED PORTION is recovered, never the full advance,
        // and only once per run (JE idempotency guard above).
        for (const { computed } of computedRecords) {
          const totalDeduction = computed.advanceDeduction + computed.messDeduction;
          if (totalDeduction <= 0) continue;

          // This person's outstanding advances, oldest first
          const personAdvances = (
            await tx.staffAdvance.findMany({
              where: { personId: computed.personId },
              orderBy: { date: "asc" },
               take: 1000, // bounded (pagination sweep) — see src/lib/pagination.ts
             })
          ).filter((a) => a.amount - a.recoveredAmount > 0);

          let remainingDeduction = totalDeduction;
          for (const adv of personAdvances) {
            if (remainingDeduction <= 0) break;
            const outstanding = adv.amount - adv.recoveredAmount;
            const take = Math.min(outstanding, remainingDeduction);
            // CAS-guarded increment: fails loudly if concurrently recovered
            await recoverAdvanceCas(tx, adv.id, take, run.id);
            remainingDeduction = round2(remainingDeduction - take);
          }
        }

        // Generate the ORG-LEVEL payroll journal entry:
        //   Dr Direct Labor (5010) per ALLOCATION (lines carry projectId)
        //      Cr Salary Payable (2030) = totalNetPayable        (org-level)
        //      Cr TDS Payable (2020) = totalTds                  (org-level)
        //      Cr Staff Advance Recoverable (2040) = advances    (org-level)
        //      Cr Cash (1001) = mess + other deductions          (org-level)
        //   Dr Staff Advance Recoverable (2040) = deductionExcess if any clamp

        // Labor expense lines: one per allocation across all person records
        const laborLines = [] as Array<{
          accountCode: string;
          accountName: string;
          debit: number;
          credit: number;
          description: string;
          projectId?: string;
        }>;
        for (const rec of createdRecords) {
          const allocations = await tx.payrollAllocation.findMany({
           take: 1000, // bounded (pagination sweep) — see src/lib/pagination.ts
            where: { personRecordId: rec.id },
            select: { projectId: true, gross: true },
          });
          for (const alloc of allocations) {
            laborLines.push({
              accountCode: "5010",
              accountName: "Direct Labor",
              debit: alloc.gross,
              credit: 0,
              description: `Gross payroll allocation — ${input.month}`,
              projectId: alloc.projectId,
            });
          }
        }

        await createJournalEntry(tx, {
          source: "payroll",
          sourceRefId: run.id,
          sourceRefType: "PayrollRun",
          description: `Payroll for ${input.month} — org ${ctx.user.organizationId}`,
          entryDate: new Date(),
          postedById: ctx.user.id,
          organizationId: ctx.user.organizationId ?? undefined,
          lines: [
            ...laborLines,
            ...(totalNetPayable > 0 ? [{
              accountCode: "2030",
              accountName: "Salary Payable",
              debit: 0,
              credit: totalNetPayable,
              description: `Net payable — ${input.month} (org-level liability)`,
            }] : []),
            ...(totalTds > 0 ? [{
              accountCode: "2020" as const,
              accountName: "TDS Payable",
              debit: 0,
              credit: totalTds,
              description: `TDS deducted from payroll — ${input.month}`,
            }] : []),
            ...(totalAdvancesRecovered > 0 ? [{
              accountCode: "2040" as const,
              accountName: "Staff Advance Recoverable",
              debit: 0,
              credit: totalAdvancesRecovered,
              description: `Cash advances recovered — ${input.month}`,
            }] : []),
            ...(totalMessAndOther > 0 ? [{
              accountCode: "1001" as const,
              accountName: "Cash on Hand",
              debit: 0,
              credit: totalMessAndOther,
              description: `Mess & other deductions retained — ${input.month}`,
            }] : []),
            ...(deductionExcess > 0 ? [{
              accountCode: "2040" as const,
              accountName: "Staff Advance Recoverable",
              debit: deductionExcess,
              credit: 0,
              description: `Deduction excess (clamp shortfall) — ${input.month}`,
            }] : []),
          ],
        });

        return run;
      });

      return { payrollRun };
    }),

  /** List historical payroll runs (org-level, newest first). */
  listRuns: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);
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

  /** Get specific payroll run with person payslip records. */
  getRun: protectedProcedure
    .input(z.object({ projectId: z.string(), runId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);

      const run = await db.payrollRun.findFirst({
        where: {
          id: input.runId,
          organizationId: ctx.user.organizationId ?? undefined,
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
      return { run };
    }),

  /** Update payroll run status: draft → approved → disbursed. */
  updateRunStatus: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        runId: z.string(),
        action: z.enum(["approve", "disburse", "reopen"]),
        notes: z.string().optional().nullable(),
        // H-10: central bank account the net payroll is drawn on. When
        // set, the account's currentBalance is atomically decremented in
        // the same transaction as the settlement JE.
        companyBankAccountId: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertProjectAdmin(ctx.user, input.projectId);

      const run = await db.payrollRun.findFirst({
        where: { id: input.runId, organizationId: ctx.user.organizationId ?? undefined },
      });
      if (!run) throw new TRPCError({ code: "NOT_FOUND", message: "PayrollRun not found." });

      // FISCAL LOCK FIX (audit §4): check the PAYROLL MONTH the run is
      // for, not the row's createdAt — a run created this month for a
      // locked month passed the old check and back-dated the whole run.
      const [payrollYear, payrollMonth] = run.period.split("-").map(Number);
      await assertNotLocked(
        ctx.user.organizationId,
        new Date(Date.UTC(payrollYear, (payrollMonth || 1) - 1, 15)),
      );

      // H-16: delegation on disbursement — money leaves the org.
      if (input.action === "disburse") {
        await assertDelegation(ctx.user, "disburse_payroll", run.totalNetPayable);
      }

      if (input.action === "disburse" && input.companyBankAccountId) {
        await assertOrgBankAccount(input.companyBankAccountId, ctx.user.organizationId);
      }

      // Lifecycle graph (payrollRun): draft→approved→disbursed. H-10 FIX:
      // reopen (→draft) is now allowed only from "approved" — reopening a
      // DISBURSED run would desync the records from the settlement JE
      // posted below (the idempotency guard would skip re-posting on the
      // next disbursement, leaving the ledger permanently wrong).
      const targetState =
        input.action === "approve" ? "approved" : input.action === "disburse" ? "disbursed" : "draft";
      const allowedCurrentStates =
        input.action === "approve"
          ? ["draft"]
          : input.action === "disburse"
            ? ["approved"]
            : ["approved"];

      const updated = await db.$transaction(async (tx) => {
        await withOrgContext(tx, ctx.user.organizationId, !!ctx.user.isSuperAdmin);

        // Transition FIRST: an invalid/out-of-order move throws before any
        // record mutation is issued (both writes share the tx anyway).
        const result = await transitionEntityState(tx, {
          model: "payrollRun",
          id: input.runId,
          targetState,
          userId: ctx.user.id,
          userName: ctx.user.name,
          allowedCurrentStates,
          additionalData: {
            ...(input.action === "disburse" ? { disbursedAmount: run.totalNetPayable } : {}),
            ...(input.notes !== undefined ? { notes: input.notes } : {}),
          },
          skipEventEmit: true, // payrollRun has no event consumers today
        });

        if (input.action === "disburse") {
          await tx.payrollPersonRecord.updateMany({
            where: { payrollRunId: input.runId },
            data: { paymentStatus: "paid" },
          });

          // H-10 SETTLEMENT: the liability JE was posted at draft save
          // (Dr 5010 Direct Labor / Cr 2030 Salary Payable …) but
          // disbursement only flipped statuses — Salary Payable was never
          // debited and no bank movement was recorded, so the trial
          // balance showed phantom payroll liabilities forever. Settle it:
          //   Dr 2030 Salary Payable  = totalNetPayable (liability cleared)
          //      Cr 1010 Bank          = totalNetPayable (cash out)
          // Both lines are ORG-LEVEL (projectId null) — the settlement
          // clears the org's liability from the org's bank.
          // JE idempotency: @@unique([source, sourceRefId]) keyed on the
          // run id makes double-posting on retry impossible.
          const netPayable = run.totalNetPayable;
          if (netPayable > 0) {
            await createJournalEntry(tx, {
              source: "payroll_disbursement",
              sourceRefId: run.id,
              sourceRefType: "PayrollRun",
              description: `Payroll disbursement — ${run.period}`,
              entryDate: new Date(),
              postedById: ctx.user.id,
              organizationId: ctx.user.organizationId ?? undefined,
              lines: [
                {
                  accountCode: "2030",
                  accountName: "Salary Payable",
                  debit: netPayable,
                  credit: 0,
                  description: `Salary payable settled — ${run.period}`,
                },
                {
                  accountCode: "1010",
                  accountName: "Bank",
                  debit: 0,
                  credit: netPayable,
                  description: `Net payroll disbursed — ${run.period}`,
                },
              ],
            });
          }

          // H-10: atomic bank decrement in the same tx when a central
          // account is selected (negative-balance guard is enforced
          // globally per audit P2 item 30).
          if (input.companyBankAccountId && netPayable > 0) {
            await decrementBankBalanceInTx(tx, input.companyBankAccountId, netPayable);
          }
        }

        return result.entity;
      });

      // Disbursement moves payroll into the cash outflow picture.
      await invalidateProjectCache(input.projectId, ["cashflow"]);
      return { run: updated };
    }),

  /** Update individual person payslip payment status and reference. */
  updateStaffPayment: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        recordId: z.string(),
        paymentStatus: z.enum(["unpaid", "paid", "partial"]),
        paymentMethod: z.enum(["cash", "bank_transfer", "cheque"]).default("cash"),
        paymentReference: z.string().optional().nullable(),
        paidAmount: z.number().nonnegative().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertCanWrite(ctx.user, input.projectId);

      // Verify the record belongs to the caller's org (org-level runs).
      // Without this, a user from org A could mutate payroll records of
      // org B by their cuid.
      const record = await db.payrollPersonRecord.findFirst({
        where: {
          id: input.recordId,
          payrollRun: { organizationId: ctx.user.organizationId ?? undefined },
        },
        include: { payrollRun: { select: { status: true, createdAt: true, period: true } } },
      });
      if (!record) throw new TRPCError({ code: "NOT_FOUND", message: "Payroll record not found." });

      // H-7 FIX: payslips can only be marked paid while the RUN is in a
      // payment-eligible state. Previously a payslip could be flipped to
      // "paid" (with an arbitrary paidAmount — uncapped against
      // netPayable) while the run was still a DRAFT, creating phantom
      // payment state that disbursement never agreed with.
      const runStatus = record.payrollRun.status;
      if (runStatus === "draft") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This payroll run is still a draft — disburse the run before marking individual payslips paid.",
        });
      }

      // Cap: a payslip can never be marked overpaid against its net payable.
      const targetPaidAmount =
        input.paidAmount !== undefined
          ? input.paidAmount
          : input.paymentStatus === "paid"
            ? record.netPayable
            : record.paidAmount;
      if (targetPaidAmount > record.netPayable + 0.01) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Paid amount (${targetPaidAmount}) exceeds the payslip net payable (${record.netPayable}).`,
        });
      }

      await assertNotLocked(ctx.user.organizationId, record.payrollRun.createdAt);

      const updated = await db.payrollPersonRecord.update({
        where: { id: input.recordId },
        data: {
          paymentStatus: input.paymentStatus,
          paymentMethod: input.paymentMethod,
          paymentReference: input.paymentReference || null,
          paidAmount: targetPaidAmount,
        },
      });

      return { record: updated };
    }),
});

/** Round to 2 decimal places without float drift beyond cents. */
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
