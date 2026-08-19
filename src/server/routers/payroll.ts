/**
 * tRPC router for Payroll Calculator.
 * Computes payroll on-the-fly from attendance data — no persistence layer.
 */
import { z } from "zod";
import { router, protectedProcedure } from "@/server/trpc";
import { db } from "@/lib/db";
import { assertProjectMember } from "@/lib/authz";

export const payrollRouter = router({
  /** Calculate payroll for a given project and month (YYYY-MM). */
  calculate: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      month: z.string().regex(/^\d{4}-\d{2}$/, "Month must be YYYY-MM format"),
    }))
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);

      const [yearStr, monthStr] = input.month.split("-");
      const year = parseInt(yearStr, 10);
      const month = parseInt(monthStr, 10);

      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0, 23, 59, 59, 999);

      // Fetch all staff for the project
      const staffList = await db.staff.findMany({
        where: { projectId: input.projectId, status: "active" },
        orderBy: { name: "asc" },
      });

      // Fetch all attendance records for this month
      const attendanceRecords = await db.staffAttendance.findMany({
        where: {
          projectId: input.projectId,
          date: { gte: startDate, lte: endDate },
        },
      });

      // Group attendance by staffId
      const attendanceByStaff = new Map<string, typeof attendanceRecords>();
      for (const record of attendanceRecords) {
        const existing = attendanceByStaff.get(record.staffId) || [];
        existing.push(record);
        attendanceByStaff.set(record.staffId, existing);
      }

      // Calculate payroll for each staff member
      const payrollItems = staffList.map((staff) => {
        const records = attendanceByStaff.get(staff.id) || [];
        const regularDays = records.filter((r) => r.status === "present").length;
        const overtimeHours = records.reduce((sum, r) => sum + (r.overtime || 0), 0);

        const hourlyRate = staff.dailyWage / 8;
        const regularPay = regularDays * staff.dailyWage;
        const overtimePay = overtimeHours * hourlyRate * 1.5;
        const total = regularPay + overtimePay;

        return {
          staffId: staff.id,
          staffName: staff.name,
          designation: staff.designation,
          category: staff.category,
          dailyWage: staff.dailyWage,
          regularDays,
          overtimeHours,
          regularPay,
          overtimePay,
          total,
        };
      });

      // Summary totals
      const summary = {
        totalRegularPay: payrollItems.reduce((sum, item) => sum + item.regularPay, 0),
        totalOvertimePay: payrollItems.reduce((sum, item) => sum + item.overtimePay, 0),
        grandTotal: payrollItems.reduce((sum, item) => sum + item.total, 0),
        staffCount: payrollItems.length,
      };

      return { payrollItems, summary };
    }),
});
