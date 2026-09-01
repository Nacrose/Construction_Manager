/**
 * tRPC router for Construction Payroll Management:
 * Monthly Payroll Runs, Advance Deductions, Allowances, Approval Cycles, and Worker Payslips.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "@/server/trpc";
import { db } from "@/lib/db";
import { withOrgContext } from "@/lib/rls";
import { assertProjectMember, assertCanWrite, assertProjectAdmin } from "@/lib/authz";
import { computePayrollLine } from "@/server/utils/payroll-calc";
import { assertNotLocked } from "@/lib/fiscal-year-lock";
import { createJournalEntry } from "@/lib/journal-entry";
import { transitionEntityState } from "@/server/utils/state-machine";

export const payrollRouter = router({
  /** Calculate on-the-fly preview for a given project and month (YYYY-MM). */
  calculate: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        month: z.string().regex(/^\d{4}-\d{2}$/, "Month must be YYYY-MM format"),
      })
    )
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);

      const [yearStr, monthStr] = input.month.split("-");
      const year = parseInt(yearStr, 10);
      const month = parseInt(monthStr, 10);

      const daysInMonth = new Date(year, month, 0).getDate();
      const startDate = new Date(Date.UTC(year, month - 1, 1));
      const endDate = new Date(Date.UTC(year, month - 1, daysInMonth, 23, 59, 59, 999));

      const [staffList, attendanceRecords, unrecoveredAdvances, existingRun] = await Promise.all([
        db.staff.findMany({
          where: { projectId: input.projectId, status: "active" },
          orderBy: [{ gangName: "asc" }, { category: "asc" }, { name: "asc" }],
        }),
        db.staffAttendance.findMany({
          where: {
            projectId: input.projectId,
            date: { gte: startDate, lte: endDate },
          },
        }),
        db.staffAdvance.findMany({
          where: {
            projectId: input.projectId,
            isRecovered: false,
          },
        }),
        db.payrollRun.findUnique({
          where: {
            projectId_month: {
              projectId: input.projectId,
              month: input.month,
            },
          },
          include: {
            records: true,
          },
        }),
      ]);

      // Group attendance by staffId
      const attendanceByStaff = new Map<string, typeof attendanceRecords>();
      for (const record of attendanceRecords) {
        const existing = attendanceByStaff.get(record.staffId) || [];
        existing.push(record);
        attendanceByStaff.set(record.staffId, existing);
      }

      // Group unrecovered advances by staffId & type
      const advancesByStaff = new Map<string, { cashAdvances: number; messDeductions: number; otherDeductions: number }>();
      for (const adv of unrecoveredAdvances) {
        if (!advancesByStaff.has(adv.staffId)) {
          advancesByStaff.set(adv.staffId, { cashAdvances: 0, messDeductions: 0, otherDeductions: 0 });
        }
        const current = advancesByStaff.get(adv.staffId)!;
        if (adv.type === "cash_advance") current.cashAdvances += adv.amount;
        else if (adv.type === "mess_deduction") current.messDeductions += adv.amount;
        else current.otherDeductions += adv.amount;
      }

      // Compute worker lines using the shared calculation helper.
      // This ensures `calculate` (preview) and `createPayrollRun` (commit)
      // produce identical numbers — previously they could diverge.
      const payrollItems = staffList.map((staff) => {
        const records = attendanceByStaff.get(staff.id) || [];
        const adv = advancesByStaff.get(staff.id) || { cashAdvances: 0, messDeductions: 0, otherDeductions: 0 };
        return computePayrollLine(
          {
            id: staff.id,
            name: staff.name,
            designation: staff.designation,
            category: staff.category,
            employmentType: staff.employmentType,
            gangName: staff.gangName,
            dailyWage: staff.dailyWage,
            monthlySalary: staff.monthlySalary,
            bankAccountNo: staff.bankAccountNo,
            bankName: staff.bankName,
            pan: staff.pan,
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

  /** Create / Save persistent monthly Payroll Run and lock in advance recoveries. */
  createPayrollRun: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        month: z.string().regex(/^\d{4}-\d{2}$/, "Month must be YYYY-MM format"),
        notes: z.string().optional().nullable(),
        // Client sends attendance-based records. The server RECOMPUTES
        // all pay amounts (regularPay, overtimePay, tdsAmount, netPayable)
        // from the attendance + staff data — the client's submitted
        // amounts are IGNORED and only used as a sanity reference.
        // This prevents a malicious/buggy client from persisting wrong
        // net payables.
        records: z.array(
          z.object({
            staffId: z.string(),
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
      // Parse input.month (format "YYYY-MM") into a Date for fiscal-year
      // lock checking. Previously this used new Date() (today), so
      // back-dating a payroll run to a locked fiscal year bypassed the lock.
      const _payrollDate = input.month ? new Date(input.month + "-01") : new Date();
      await assertNotLocked(ctx.user.organizationId, _payrollDate);

      // ── Server-side recomputation ──────────────────────────────
      // Fetch fresh staff + attendance + advances data and recompute
      // all pay amounts. Client-submitted amounts are NOT trusted.
      const [yearStr, monthStr] = input.month.split("-");
      const year = parseInt(yearStr, 10);
      const month = parseInt(monthStr, 10);
      const daysInMonth = new Date(year, month, 0).getDate();
      const startDate = new Date(Date.UTC(year, month - 1, 1));
      const endDate = new Date(Date.UTC(year, month - 1, daysInMonth, 23, 59, 59, 999));

      const staffIds = input.records.map((r) => r.staffId);

      const [staffList, attendanceRecords, unrecoveredAdvances] = await Promise.all([
        db.staff.findMany({
          where: { id: { in: staffIds }, projectId: input.projectId, status: "active" },
        }),
        db.staffAttendance.findMany({
          where: {
            projectId: input.projectId,
            staffId: { in: staffIds },
            date: { gte: startDate, lte: endDate },
          },
        }),
        db.staffAdvance.findMany({
          where: {
            projectId: input.projectId,
            staffId: { in: staffIds },
            isRecovered: false,
          },
        }),
      ]);

      // Verify every submitted staffId exists and belongs to the project.
      const staffMap = new Map(staffList.map((s) => [s.id, s]));
      for (const rec of input.records) {
        if (!staffMap.has(rec.staffId)) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `Staff member ${rec.staffId} not found in this project.`,
          });
        }
      }

      // Group attendance by staffId
      const attendanceByStaff = new Map<string, typeof attendanceRecords>();
      for (const record of attendanceRecords) {
        const existing = attendanceByStaff.get(record.staffId) || [];
        existing.push(record);
        attendanceByStaff.set(record.staffId, existing);
      }

      // Group unrecovered advances by staffId & type
      const advancesByStaff = new Map<string, { cashAdvances: number; messDeductions: number; otherDeductions: number }>();
      for (const adv of unrecoveredAdvances) {
        if (!advancesByStaff.has(adv.staffId)) {
          advancesByStaff.set(adv.staffId, { cashAdvances: 0, messDeductions: 0, otherDeductions: 0 });
        }
        const current = advancesByStaff.get(adv.staffId)!;
        if (adv.type === "cash_advance") current.cashAdvances += adv.amount;
        else if (adv.type === "mess_deduction") current.messDeductions += adv.amount;
        else current.otherDeductions += adv.amount;
      }

      // Recompute each record server-side using the shared helper.
      const computedRecords = input.records.map((rec) => {
        const staff = staffMap.get(rec.staffId)!;
        const attendance = attendanceByStaff.get(rec.staffId) || [];
        const advances = advancesByStaff.get(rec.staffId) || { cashAdvances: 0, messDeductions: 0, otherDeductions: 0 };
        const computed = computePayrollLine(
          {
            id: staff.id,
            name: staff.name,
            designation: staff.designation,
            category: staff.category,
            employmentType: staff.employmentType,
            gangName: staff.gangName,
            dailyWage: staff.dailyWage,
            monthlySalary: staff.monthlySalary,
            bankAccountNo: staff.bankAccountNo,
            bankName: staff.bankName,
            pan: staff.pan,
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

      // CRITICAL: payroll-calc.ts clamps `netPayable = Math.max(0, gross - totalDeductions)`.
      // When a staff member's deductions exceed their gross (a real situation
      // — e.g. advance recovery after a big Dashain/Tihar advance, combined
      // with a low-attendance period), the clamp silently drops the
      // shortfall. The journal entry balance is then broken:
      //
      //   Dr Direct Labor = totalGross
      //   Cr Salary Payable + TDS + Advances + Mess/Other
      //      = totalNetPayable + totalTds + totalAdvancesRecovered + totalMessAndOther
      //
      // Without any clamp, those are equal. With clamp:
      //   credits > debits by exactly Σ(max(0, totalDeductions - gross))
      //   for each clamped staff member.
      //
      // `createJournalEntry`'s own balance check then throws
      // "Unbalanced journal entry", failing the entire payroll run for
      // every staff member, not just the one edge case.
      //
      // Fix: track the clamped shortfall (`deductionExcess`) and add it
      // as an extra DEBIT line in the JE — "Staff Advance Recoverable"
      // (account 2040) is the right place to track the un-recovered
      // amount, since the shortfall represents an amount we still owe
      // the staff member / that they owe us back. This keeps the entry
      // balanced and surfaces the shortfall in the GL so the org can
      // see the cumulative deduction-excess in one place.
      const totalMessAndOther = computedRecords.reduce(
        (s, { computed }) => s + computed.messDeduction + computed.otherDeductions, 0,
      );
      const deductionExcess = computedRecords.reduce((s, { computed }) => {
        const shortfall = computed.totalDeductions - computed.gross;
        return s + (shortfall > 0 ? shortfall : 0);
      }, 0);

      const payrollRun = await db.$transaction(async (tx) => {
        await withOrgContext(tx, ctx.user.organizationId, !!ctx.user.isSuperAdmin);
        // Upsert the main run
        const run = await tx.payrollRun.upsert({
          where: {
            projectId_month: {
              projectId: input.projectId,
              month: input.month,
            },
          },
          create: {
            projectId: input.projectId,
            month: input.month,
            status: "draft",
            totalStaffCount: computedRecords.length,
            totalGross,
            totalAllowances,
            totalDeductions,
            totalAdvancesRecovered,
            totalNetPayable,
            notes: input.notes || null,
          },
          update: {
            totalStaffCount: computedRecords.length,
            totalGross,
            totalAllowances,
            totalDeductions,
            totalAdvancesRecovered,
            totalNetPayable,
            notes: input.notes || null,
          },
        });

        // Delete old records for this run if updating draft
        await tx.payrollStaffRecord.deleteMany({ where: { payrollRunId: run.id } });

        // Insert line item records — use SERVER-COMPUTED values,
        // NOT the client-submitted ones.
        for (const { computed, remarks } of computedRecords) {
          await tx.payrollStaffRecord.create({
            data: {
              payrollRunId: run.id,
              staffId: computed.staffId,
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
        }

        // IDEMPOTENCY: check for an existing payroll JE before creating JE and deducting advances.
        // Re-saving a draft (or using reopen) would otherwise duplicate
        // the journal entry and double-deduct staff advances. This is
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

        // Mark associated unrecovered advances as recovered in this payroll run.
        // IMPORTANT: Only mark the DEDUCTED PORTION as recovered, not the full
        // advance amount. Only runs once when the payroll run and JE are first generated.
        //
        // Strategy: for each staff member, deduct advances in FIFO order
        // (oldest first) until the deducted amount is consumed. Any advance
        // that is partially recovered gets its remaining balance carried
        // forward (isRecovered stays false).
        // Use server-computed deduction amounts (not client-supplied)
        // for advance recovery — ensures consistency with the persisted
        // payroll record values.
        const staffWithAdvanceRecovery = computedRecords
          .filter(({ computed }) => computed.advanceDeduction > 0 || computed.messDeduction > 0)
          .map(({ computed }) => computed.staffId);

        if (staffWithAdvanceRecovery.length > 0) {
          for (const { computed } of computedRecords) {
            const totalDeduction = computed.advanceDeduction + computed.messDeduction;
            if (totalDeduction <= 0) continue;

            // Fetch this staff's unrecovered advances, oldest first
            const staffAdvances = await tx.staffAdvance.findMany({
              where: {
                projectId: input.projectId,
                staffId: computed.staffId,
                isRecovered: false,
              },
              orderBy: { date: "asc" },
            });

            // Apply the deduction in FIFO order, marking advances as
            // recovered only when their full amount is consumed.
            let remainingDeduction = totalDeduction;
            for (const adv of staffAdvances) {
              if (remainingDeduction <= 0) break;
              if (adv.amount <= remainingDeduction + 0.01) {
                // This advance is fully recovered
                await tx.staffAdvance.update({
                  where: { id: adv.id },
                  data: {
                    isRecovered: true,
                    recoveredInPayrollId: run.id,
                  },
                });
                remainingDeduction -= adv.amount;
              } else {
                // Partial recovery — don't mark as recovered, just
                // reduce the amount. We need to track the remaining
                // balance on the advance record.
                await tx.staffAdvance.update({
                  where: { id: adv.id },
                  data: {
                    amount: adv.amount - remainingDeduction,
                    // Note: isRecovered stays false — remaining balance
                    // will be recovered in a future payroll run.
                    remarks: `Partially recovered in payroll ${input.month}. Remaining: NPR ${(adv.amount - remainingDeduction).toFixed(2)}`,
                  },
                });
                remainingDeduction = 0;
              }
            }
          }
        }

        // Generate the payroll journal entry:
        // Dr Direct Labor (5010) = totalGross
        //    Cr Salary Payable (2030) = totalNetPayable
        //    Cr TDS Payable (2020) = totalTds
        //    Cr Staff Advance Recoverable (2040) = totalAdvancesRecovered
        //    Cr Cash (1001) = totalMessDeductions + totalOtherDeductions
        //    (Dr Staff Advance Recoverable (2040) = deductionExcess if any clamp)

        await createJournalEntry(tx, {
          source: "payroll",
          sourceRefId: run.id,
          sourceRefType: "PayrollRun",
          description: `Payroll for ${input.month} — ${input.projectId}`,
          entryDate: new Date(),
          postedById: ctx.user.id,
          organizationId: ctx.user.organizationId ?? undefined,
          lines: [
            {
              accountCode: "5010",
              accountName: "Direct Labor",
              debit: totalGross,
              credit: 0,
              description: `Gross payroll — ${computedRecords.length} staff — ${input.month}`,
              projectId: input.projectId,
            },
            ...(totalNetPayable > 0 ? [{
              accountCode: "2030",
              accountName: "Salary Payable",
              debit: 0,
              credit: totalNetPayable,
              description: `Net payable to staff — ${input.month}`,
              projectId: input.projectId,
            }] : []),
            ...(totalTds > 0 ? [{
              accountCode: "2020" as const,
              accountName: "TDS Payable",
              debit: 0,
              credit: totalTds,
              description: `TDS deducted from payroll — ${input.month}`,
              projectId: input.projectId,
            }] : []),
            ...(totalAdvancesRecovered > 0 ? [{
              accountCode: "2040" as const,
              accountName: "Staff Advance Recoverable",
              debit: 0,
              credit: totalAdvancesRecovered,
              description: `Cash advances recovered — ${input.month}`,
              projectId: input.projectId,
            }] : []),
            ...(totalMessAndOther > 0 ? [{
              accountCode: "1001" as const,
              accountName: "Cash on Hand",
              debit: 0,
              credit: totalMessAndOther,
              description: `Mess & other deductions retained — ${input.month}`,
              projectId: input.projectId,
            }] : []),
            // Extra DEBIT line for the clamp shortfall — only added when
            // at least one staff member's deductions exceeded their gross
            // (so their netPayable was clamped to 0). Without this line,
            // credits > debits by exactly the clamped amount and
            // createJournalEntry throws "Unbalanced journal entry", failing
            // the ENTIRE payroll run for every staff member.
            //
            // The shortfall is posted to "Staff Advance Recoverable"
            // (account 2040) as a debit — representing an amount we
            // attempted to recover but couldn't because the staff member's
            // gross pay was insufficient. This keeps the entry balanced
            // and surfaces the cumulative shortfall in the GL.
            ...(deductionExcess > 0 ? [{
              accountCode: "2040" as const,
              accountName: "Staff Advance Recoverable",
              debit: deductionExcess,
              credit: 0,
              description: `Deduction excess (clamp shortfall) — ${input.month}`,
              projectId: input.projectId,
            }] : []),
          ],
        });

        return run;
      });

      return { payrollRun };
    }),

  /** List historical payroll runs. */
  listRuns: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);

      const runs = await db.payrollRun.findMany({
        where: { projectId: input.projectId },
        orderBy: { month: "desc" },
      });

      return { runs };
    }),

  /** Get specific payroll run with worker payslip records. */
  getRun: protectedProcedure
    .input(z.object({ projectId: z.string(), runId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);

      const run = await db.payrollRun.findFirst({
        where: { id: input.runId, projectId: input.projectId },
        include: {
          records: {
            include: {
              staff: {
                select: {
                  id: true,
                  name: true,
                  designation: true,
                  category: true,
                  phone: true,
                  bankAccountNo: true,
                  bankName: true,
                  pan: true,
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
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertProjectAdmin(ctx.user, input.projectId);

      const run = await db.payrollRun.findFirst({
        where: { id: input.runId, projectId: input.projectId },
      });
      if (!run) throw new TRPCError({ code: "NOT_FOUND", message: "Payroll run not found." });
      await assertNotLocked(ctx.user.organizationId, run.createdAt);

      // Lifecycle graph (payrollRun): draft→approved→disbursed, with reopen
      // (approved|disbursed→draft) allowed to fix errors before re-approval.
      // The engine rejects out-of-order moves (e.g. disburse a draft run) with
      // BAD_REQUEST instead of silently writing them.
      const targetState =
        input.action === "approve" ? "approved" : input.action === "disburse" ? "disbursed" : "draft";
      const allowedCurrentStates =
        input.action === "approve"
          ? ["draft"]
          : input.action === "disburse"
            ? ["approved"]
            : ["approved", "disbursed"];

      const updated = await db.$transaction(async (tx) => {
        await withOrgContext(tx, ctx.user.organizationId, !!ctx.user.isSuperAdmin);

        // Transition FIRST: an invalid/out-of-order move throws before any
        // staff-record mutation is issued (both writes share the tx anyway).
        const result = await transitionEntityState(tx, {
          model: "payrollRun",
          id: input.runId,
          targetState,
          userId: ctx.user.id,
          userName: ctx.user.name,
          projectId: input.projectId,
          allowedCurrentStates,
          additionalData: {
            ...(input.action === "disburse" ? { disbursedAmount: run.totalNetPayable } : {}),
            ...(input.notes !== undefined ? { notes: input.notes } : {}),
          },
          skipEventEmit: true, // payrollRun has no event consumers today
        });

        if (input.action === "disburse") {
          await tx.payrollStaffRecord.updateMany({
            where: { payrollRunId: input.runId },
            data: { paymentStatus: "paid" },
          });
        }

        return result.entity;
      });

      return { run: updated };
    }),

  /** Update individual worker payslip payment status and reference. */
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

      // Verify the record belongs to the project the caller was authorized
      // on. Without this, a user with project A access could mutate
      // payroll staff records in project B by their cuid.
      const record = await db.payrollStaffRecord.findFirst({
        where: { id: input.recordId, payrollRun: { projectId: input.projectId } },
        include: { payrollRun: { select: { createdAt: true } } },
      });
      if (!record) throw new TRPCError({ code: "NOT_FOUND", message: "Staff record not found." });
      await assertNotLocked(ctx.user.organizationId, record.payrollRun.createdAt);

      const updated = await db.payrollStaffRecord.update({
        where: { id: input.recordId },
        data: {
          paymentStatus: input.paymentStatus,
          paymentMethod: input.paymentMethod,
          paymentReference: input.paymentReference || null,
          paidAmount: input.paidAmount !== undefined ? input.paidAmount : input.paymentStatus === "paid" ? record.netPayable : record.paidAmount,
        },
      });

      return { record: updated };
    }),
});
