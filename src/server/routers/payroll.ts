/**
 * tRPC router for Construction Payroll Management:
 * Monthly Payroll Runs, Advance Deductions, Allowances, Approval Cycles, and Worker Payslips.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "@/server/trpc";
import { db } from "@/lib/db";
import { assertProjectMember, assertCanWrite, assertProjectAdmin } from "@/lib/authz";

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

      // Compute worker lines
      const payrollItems = staffList.map((staff) => {
        const records = attendanceByStaff.get(staff.id) || [];
        const presentDays = records.filter((r) => r.status === "present" || r.status === "overtime").length;
        const halfDays = records.filter((r) => r.status === "half_day").length;
        const absentDays = records.filter((r) => r.status === "absent").length;
        const leaveDays = records.filter((r) => r.status === "leave").length;
        const overtimeHours = records.reduce((sum, r) => sum + (r.overtime || 0), 0);

        const effectiveDays = presentDays + halfDays * 0.5;

        let regularPay = 0;
        let overtimePay = 0;
        const baseRate = staff.employmentType === "monthly" ? staff.monthlySalary : staff.dailyWage;

        if (staff.employmentType === "monthly") {
          // Monthly salary with deduction for absent days
          const perDaySalary = staff.monthlySalary / daysInMonth;
          const deductedSalary = Math.max(0, staff.monthlySalary - absentDays * perDaySalary);
          regularPay = Math.round(deductedSalary);
          const hourlyRate = (staff.monthlySalary / daysInMonth) / 8;
          overtimePay = Math.round(overtimeHours * hourlyRate * 1.5);
        } else {
          // Daily / Piece rate
          regularPay = Math.round(effectiveDays * staff.dailyWage);
          const hourlyRate = staff.dailyWage > 0 ? staff.dailyWage / 8 : 0;
          overtimePay = Math.round(overtimeHours * hourlyRate * 1.5);
        }

        const adv = advancesByStaff.get(staff.id) || { cashAdvances: 0, messDeductions: 0, otherDeductions: 0 };
        const advanceDeduction = adv.cashAdvances;
        const messDeduction = adv.messDeductions;
        const otherDeductions = adv.otherDeductions;
        const allowances = 0;
        const tdsAmount = Math.round((regularPay + overtimePay) * 0.01); // 1% standard TDS on wages

        const gross = regularPay + overtimePay + allowances;
        const totalDeductions = advanceDeduction + messDeduction + otherDeductions + tdsAmount;
        const netPayable = Math.max(0, gross - totalDeductions);

        return {
          staffId: staff.id,
          staffName: staff.name,
          designation: staff.designation,
          category: staff.category,
          employmentType: staff.employmentType,
          gangName: staff.gangName,
          baseRate,
          dailyWage: staff.dailyWage,
          monthlySalary: staff.monthlySalary,
          presentDays,
          halfDays,
          absentDays,
          leaveDays,
          effectiveDays,
          overtimeHours,
          regularPay,
          overtimePay,
          allowances,
          advanceDeduction,
          messDeduction,
          otherDeductions,
          tdsAmount,
          gross,
          totalDeductions,
          netPayable,
          bankAccountNo: staff.bankAccountNo,
          bankName: staff.bankName,
          pan: staff.pan,
        };
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
        records: z.array(
          z.object({
            staffId: z.string(),
            employmentType: z.string().default("daily"),
            presentDays: z.number().nonnegative(),
            halfDays: z.number().nonnegative().default(0),
            absentDays: z.number().nonnegative().default(0),
            leaveDays: z.number().nonnegative().default(0),
            overtimeHours: z.number().nonnegative().default(0),
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

      const totalGross = input.records.reduce((sum, r) => sum + r.regularPay + r.overtimePay + r.allowances, 0);
      const totalAllowances = input.records.reduce((sum, r) => sum + r.allowances, 0);
      const totalAdvancesRecovered = input.records.reduce((sum, r) => sum + r.advanceDeduction, 0);
      const totalDeductions = input.records.reduce(
        (sum, r) => sum + r.advanceDeduction + r.messDeduction + r.otherDeductions + r.tdsAmount,
        0
      );
      const totalNetPayable = input.records.reduce((sum, r) => sum + r.netPayable, 0);

      const payrollRun = await db.$transaction(async (tx) => {
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
            totalStaffCount: input.records.length,
            totalGross,
            totalAllowances,
            totalDeductions,
            totalAdvancesRecovered,
            totalNetPayable,
            notes: input.notes || null,
          },
          update: {
            totalStaffCount: input.records.length,
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

        // Insert line item records
        for (const rec of input.records) {
          await tx.payrollStaffRecord.create({
            data: {
              payrollRunId: run.id,
              staffId: rec.staffId,
              employmentType: rec.employmentType,
              presentDays: rec.presentDays,
              halfDays: rec.halfDays,
              absentDays: rec.absentDays,
              leaveDays: rec.leaveDays,
              overtimeHours: rec.overtimeHours,
              baseRate: rec.baseRate,
              regularPay: rec.regularPay,
              overtimePay: rec.overtimePay,
              allowances: rec.allowances,
              advanceDeduction: rec.advanceDeduction,
              messDeduction: rec.messDeduction,
              otherDeductions: rec.otherDeductions,
              tdsAmount: rec.tdsAmount,
              netPayable: rec.netPayable,
              remarks: rec.remarks || null,
            },
          });
        }

        // Mark associated unrecovered advances as recovered in this payroll run.
        // IMPORTANT: Only mark the DEDUCTED PORTION as recovered, not the full
        // advance amount. Previously this marked ALL unrecovered advances as
        // fully recovered, even if only a partial deduction was made — silently
        // writing off the remaining balance.
        //
        // Strategy: for each staff member, deduct advances in FIFO order
        // (oldest first) until the deducted amount is consumed. Any advance
        // that is partially recovered gets its remaining balance carried
        // forward (isRecovered stays false).
        const staffWithAdvanceRecovery = input.records
          .filter((r) => r.advanceDeduction > 0 || r.messDeduction > 0)
          .map((r) => r.staffId);

        if (staffWithAdvanceRecovery.length > 0) {
          for (const rec of input.records) {
            if (rec.advanceDeduction <= 0 && rec.messDeduction <= 0) continue;

            // Fetch this staff's unrecovered advances, oldest first
            const staffAdvances = await tx.staffAdvance.findMany({
              where: {
                projectId: input.projectId,
                staffId: rec.staffId,
                isRecovered: false,
              },
              orderBy: { date: "asc" },
            });

            // Apply the deduction in FIFO order, marking advances as
            // recovered only when their full amount is consumed.
            let remainingDeduction = rec.advanceDeduction + rec.messDeduction;
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

      let newStatus = run.status;
      let approvedById = run.approvedById;
      let approvedAt = run.approvedAt;
      let disbursedAmount = run.disbursedAmount;

      if (input.action === "approve") {
        newStatus = "approved";
        approvedById = ctx.user.id;
        approvedAt = new Date();
      } else if (input.action === "disburse") {
        newStatus = "disbursed";
        disbursedAmount = run.totalNetPayable;
      } else if (input.action === "reopen") {
        newStatus = "draft";
      }

      const updated = await db.$transaction(async (tx) => {
        if (input.action === "disburse") {
          await tx.payrollStaffRecord.updateMany({
            where: { payrollRunId: input.runId },
            data: { paymentStatus: "paid" },
          });
        }

        return tx.payrollRun.update({
          where: { id: input.runId },
          data: {
            status: newStatus,
            approvedById,
            approvedAt,
            disbursedAmount,
            notes: input.notes !== undefined ? input.notes : run.notes,
          },
        });
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
      });
      if (!record) throw new TRPCError({ code: "NOT_FOUND", message: "Staff record not found." });

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
