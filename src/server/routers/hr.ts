/**
 * tRPC router for Construction HR, Labor Gangs, Time & Attendance,
 * 31-Day Muster Roll Matrix, and Site Advance Ledger.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "@/server/trpc";
import { db } from "@/lib/db";
import { assertProjectMember, assertCanWrite } from "@/lib/authz";

const CreateStaffSchema = z.object({
  projectId: z.string(),
  name: z.string().min(1),
  designation: z.string().optional().nullable(),
  category: z.enum(["skilled", "unskilled", "supervisor", "staff", "operator"]).default("skilled"),
  employmentType: z.enum(["daily", "monthly", "piece_rate"]).default("daily"),
  phone: z.string().optional().nullable(),
  dailyWage: z.number().nonnegative().default(0),
  monthlySalary: z.number().nonnegative().default(0),
  gangName: z.string().optional().nullable(),
  bankAccountNo: z.string().optional().nullable(),
  bankName: z.string().optional().nullable(),
  pan: z.string().optional().nullable(),
  idNumber: z.string().optional().nullable(),
  joinedDate: z.string().optional().nullable(),
});

const UpdateStaffSchema = z.object({
  itemId: z.string(),
  name: z.string().optional(),
  designation: z.string().nullable().optional(),
  category: z.enum(["skilled", "unskilled", "supervisor", "staff", "operator"]).optional(),
  employmentType: z.enum(["daily", "monthly", "piece_rate"]).optional(),
  phone: z.string().nullable().optional(),
  dailyWage: z.number().nonnegative().optional(),
  monthlySalary: z.number().nonnegative().optional(),
  gangName: z.string().nullable().optional(),
  bankAccountNo: z.string().nullable().optional(),
  bankName: z.string().nullable().optional(),
  pan: z.string().nullable().optional(),
  idNumber: z.string().nullable().optional(),
  status: z.enum(["active", "inactive", "left"]).optional(),
  joinedDate: z.string().nullable().optional(),
});

export const hrRouter = router({
  /** List staff / labor directory with filters. */
  list: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        tab: z.enum(["staff", "attendance"]).default("staff"),
        status: z.enum(["all", "active", "inactive", "left"]).optional().default("active"),
        gangName: z.string().optional(),
        category: z.string().optional(),
        employmentType: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);

      if (input.tab === "staff") {
        const whereClause: any = {
          projectId: input.projectId,
          ...(input.status !== "all" ? { status: input.status } : {}),
          ...(input.gangName ? { gangName: input.gangName } : {}),
          ...(input.category ? { category: input.category } : {}),
          ...(input.employmentType ? { employmentType: input.employmentType } : {}),
        };

        const [staff, allGangs] = await Promise.all([
          db.staff.findMany({
            where: whereClause,
            orderBy: [{ category: "asc" }, { name: "asc" }],
          }),
          db.staff.findMany({
            where: { projectId: input.projectId, gangName: { not: null } },
            select: { gangName: true },
            distinct: ["gangName"],
          }),
        ]);

        const gangs = allGangs.map((g) => g.gangName).filter(Boolean) as string[];

        return {
          staff,
          gangs,
          attendance: [],
        };
      } else {
        const attendance = await db.staffAttendance.findMany({
          where: { projectId: input.projectId },
          orderBy: { date: "desc" },
          include: { staff: { select: { name: true, designation: true, category: true, dailyWage: true } } },
          take: 200,
        });
        return { staff: [], gangs: [], attendance };
      }
    }),

  /** Create new staff / labor record. */
  create: protectedProcedure
    .input(CreateStaffSchema)
    .mutation(async ({ ctx, input }) => {
      const { projectId, ...data } = input;
      await assertCanWrite(ctx.user, projectId);

      const staff = await db.staff.create({
        data: {
          projectId,
          name: data.name,
          designation: data.designation || null,
          category: data.category,
          employmentType: data.employmentType,
          phone: data.phone || null,
          dailyWage: data.dailyWage,
          monthlySalary: data.monthlySalary,
          gangName: data.gangName || null,
          bankAccountNo: data.bankAccountNo || null,
          bankName: data.bankName || null,
          pan: data.pan || null,
          idNumber: data.idNumber || null,
          joinedDate: data.joinedDate ? new Date(data.joinedDate) : new Date(),
        },
      });
      return { staff };
    }),

  /** Update staff / labor record. */
  update: protectedProcedure
    .input(UpdateStaffSchema)
    .mutation(async ({ ctx, input }) => {
      const { itemId, ...data } = input;
      const item = await db.staff.findUnique({ where: { id: itemId }, select: { projectId: true } });
      if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Staff not found." });
      await assertCanWrite(ctx.user, item.projectId);

      const updateData: any = { ...data };
      if (data.joinedDate !== undefined) {
        updateData.joinedDate = data.joinedDate ? new Date(data.joinedDate) : null;
      }

      const updated = await db.staff.update({ where: { id: itemId }, data: updateData });
      return { staff: updated };
    }),

  /** Delete staff / labor record. */
  delete: protectedProcedure
    .input(z.object({ itemId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const item = await db.staff.findUnique({ where: { id: input.itemId }, select: { projectId: true } });
      if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Staff not found." });
      await assertCanWrite(ctx.user, item.projectId);

      await db.staff.delete({ where: { id: input.itemId } });
      return { ok: true };
    }),

  /** Get attendance for all active workers on a specific date (YYYY-MM-DD). */
  getAttendanceByDate: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        date: z.string(), // "YYYY-MM-DD"
      })
    )
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);

      const targetDate = new Date(`${input.date}T00:00:00.000Z`);

      const [staffList, existingAttendance] = await Promise.all([
        db.staff.findMany({
          where: { projectId: input.projectId, status: "active" },
          orderBy: [{ gangName: "asc" }, { category: "asc" }, { name: "asc" }],
        }),
        db.staffAttendance.findMany({
          where: {
            projectId: input.projectId,
            date: targetDate,
          },
        }),
      ]);

      const attendanceMap = new Map(existingAttendance.map((a) => [a.staffId, a]));

      const items = staffList.map((s) => {
        const att = attendanceMap.get(s.id);
        return {
          staffId: s.id,
          staffName: s.name,
          designation: s.designation,
          category: s.category,
          employmentType: s.employmentType,
          gangName: s.gangName,
          dailyWage: s.dailyWage,
          status: att ? att.status : "present",
          hours: att ? att.hours : 8,
          overtime: att ? att.overtime : 0,
          remarks: att ? att.remarks || "" : "",
          isLogged: !!att,
        };
      });

      return {
        date: input.date,
        totalWorkers: staffList.length,
        loggedCount: existingAttendance.length,
        items,
      };
    }),

  /** Bulk save/update attendance for all workers on a date. */
  bulkLogAttendance: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        date: z.string(), // "YYYY-MM-DD"
        records: z.array(
          z.object({
            staffId: z.string(),
            status: z.enum(["present", "absent", "half_day", "leave", "overtime"]),
            hours: z.number().nonnegative().default(8),
            overtime: z.number().nonnegative().default(0),
            remarks: z.string().optional().nullable(),
          })
        ),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertCanWrite(ctx.user, input.projectId);

      // Verify all staff IDs belong to input.projectId to prevent cross-project attendance overwrites
      const staffIds = input.records.map((r) => r.staffId);
      const validStaff = await db.staff.findMany({
        where: { projectId: input.projectId, id: { in: staffIds } },
        select: { id: true },
      });
      const validStaffIdSet = new Set(validStaff.map((s) => s.id));
      const validRecords = input.records.filter((r) => validStaffIdSet.has(r.staffId));

      const targetDate = new Date(`${input.date}T00:00:00.000Z`);

      await db.$transaction(async (tx) => {
        for (const record of validRecords) {
          await tx.staffAttendance.upsert({
            where: {
              staffId_date: {
                staffId: record.staffId,
                date: targetDate,
              },
            },
            create: {
              projectId: input.projectId,
              staffId: record.staffId,
              date: targetDate,
              status: record.status,
              hours: record.hours,
              overtime: record.overtime,
              remarks: record.remarks || null,
            },
            update: {
              status: record.status,
              hours: record.hours,
              overtime: record.overtime,
              remarks: record.remarks || null,
            },
          });
        }
      });

      return { success: true, count: input.records.length };
    }),

  /** 31-Day Monthly Muster Roll Matrix for Field Audits & Payroll */
  getMusterRoll: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        month: z.string().regex(/^\d{4}-\d{2}$/, "Month must be YYYY-MM format"),
        gangName: z.string().optional(),
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

      const [staffList, attendanceRecords] = await Promise.all([
        db.staff.findMany({
          where: {
            projectId: input.projectId,
            status: "active",
            ...(input.gangName ? { gangName: input.gangName } : {}),
          },
          orderBy: [{ gangName: "asc" }, { category: "asc" }, { name: "asc" }],
        }),
        db.staffAttendance.findMany({
          where: {
            projectId: input.projectId,
            date: { gte: startDate, lte: endDate },
          },
        }),
      ]);

      // Group attendance by staffId and day (1..31)
      const staffMap = new Map<string, Map<number, { status: string; hours: number; overtime: number }>>();
      for (const record of attendanceRecords) {
        const day = new Date(record.date).getUTCDate();
        if (!staffMap.has(record.staffId)) {
          staffMap.set(record.staffId, new Map());
        }
        staffMap.get(record.staffId)!.set(day, {
          status: record.status,
          hours: record.hours,
          overtime: record.overtime,
        });
      }

      // Build 31-day matrix rows
      const rows = staffList.map((staff) => {
        const dayMap = staffMap.get(staff.id) || new Map();
        const days: Record<number, { status: string; overtime: number }> = {};

        let presentDays = 0;
        let halfDays = 0;
        let absentDays = 0;
        let leaveDays = 0;
        let totalOvertimeHours = 0;

        for (let d = 1; d <= daysInMonth; d++) {
          const att = dayMap.get(d);
          if (att) {
            days[d] = { status: att.status, overtime: att.overtime };
            if (att.status === "present") presentDays += 1;
            else if (att.status === "half_day") halfDays += 1;
            else if (att.status === "absent") absentDays += 1;
            else if (att.status === "leave") leaveDays += 1;
            else if (att.status === "overtime") {
              presentDays += 1;
            }
            totalOvertimeHours += att.overtime || 0;
          } else {
            days[d] = { status: "unlogged", overtime: 0 };
          }
        }

        const effectiveDays = presentDays + halfDays * 0.5;
        const hourlyRate = staff.dailyWage > 0 ? staff.dailyWage / 8 : 0;
        const estimatedRegularWage = staff.employmentType === "monthly" ? staff.monthlySalary : effectiveDays * staff.dailyWage;
        const estimatedOtWage = totalOvertimeHours * hourlyRate * 1.5;
        const estimatedGross = estimatedRegularWage + estimatedOtWage;

        return {
          staffId: staff.id,
          name: staff.name,
          designation: staff.designation,
          category: staff.category,
          employmentType: staff.employmentType,
          gangName: staff.gangName,
          dailyWage: staff.dailyWage,
          monthlySalary: staff.monthlySalary,
          days,
          presentDays,
          halfDays,
          absentDays,
          leaveDays,
          effectiveDays,
          totalOvertimeHours,
          estimatedGross,
        };
      });

      return {
        month: input.month,
        daysInMonth,
        rows,
        summary: {
          totalStaff: staffList.length,
          totalPresentManDays: rows.reduce((s, r) => s + r.effectiveDays, 0),
          totalOtHours: rows.reduce((s, r) => s + r.totalOvertimeHours, 0),
          totalEstimatedGross: rows.reduce((s, r) => s + r.estimatedGross, 0),
        },
      };
    }),

  /** List cash advances and site mess deductions. */
  getStaffAdvances: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        staffId: z.string().optional(),
        isRecovered: z.boolean().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);

      const where: any = {
        projectId: input.projectId,
        ...(input.staffId ? { staffId: input.staffId } : {}),
        ...(input.isRecovered !== undefined ? { isRecovered: input.isRecovered } : {}),
      };

      const advances = await db.staffAdvance.findMany({
        where,
        include: {
          staff: { select: { id: true, name: true, designation: true, category: true } },
        },
        orderBy: { date: "desc" },
      });

      const totalPendingAdvances = advances
        .filter((a) => !a.isRecovered)
        .reduce((sum, a) => sum + a.amount, 0);

      return { advances, totalPendingAdvances };
    }),

  /** Issue a cash advance or log a site deduction. */
  createStaffAdvance: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        staffId: z.string(),
        date: z.string().optional(),
        amount: z.number().positive(),
        type: z.enum(["cash_advance", "mess_deduction", "safety_gear", "other"]).default("cash_advance"),
        remarks: z.string().optional().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertCanWrite(ctx.user, input.projectId);

      const advance = await db.staffAdvance.create({
        data: {
          projectId: input.projectId,
          staffId: input.staffId,
          date: input.date ? new Date(input.date) : new Date(),
          amount: input.amount,
          type: input.type,
          remarks: input.remarks || null,
          createdById: ctx.user.id,
        },
      });

      return { advance };
    }),

  /** Delete a pending advance. */
  deleteStaffAdvance: protectedProcedure
    .input(z.object({ advanceId: z.string(), projectId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertCanWrite(ctx.user, input.projectId);

      // Verify the advance belongs to the project the caller was
      // authorized on — without this, a user with project A access
      // could delete advances in project B by their cuid.
      const adv = await db.staffAdvance.findFirst({
        where: { id: input.advanceId, projectId: input.projectId },
      });
      if (!adv) throw new TRPCError({ code: "NOT_FOUND", message: "Advance not found." });
      if (adv.isRecovered) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot delete an advance that has already been recovered in a payroll run." });
      }

      await db.staffAdvance.delete({ where: { id: input.advanceId } });
      return { success: true };
    }),
});
