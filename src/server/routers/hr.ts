/**
 * tRPC router for Construction HR, Labor Gangs, Time & Attendance,
 * 31-Day Muster Roll Matrix, and Site Advance Ledger.
 *
 * ADR-0005 grain: the roster shown here is the project's ACTIVE
 * ProjectStaffAssignment list joined with the org-wide Person. Row ids are
 * ASSIGNMENT ids (attendance is logged per assignment per day); advances
 * and identity fields key on the PERSON.
 *
 * Phase D: the workforce domain service
 * (src/server/services/workforce.ts) owns the invariants the schema
 * deliberately does not enforce — overlap (warning → audited override),
 * cross-project daily capacity, transfer/rehire chaining, person merge
 * and history. This router never hand-rolls them.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, projectProcedure } from "@/server/trpc";
import { db } from "@/lib/db";
import { assertProjectMember, assertCanWrite, isOrgAdmin } from "@/lib/authz";
import { assertNotLocked } from "@/lib/fiscal-year-lock";
import { withOrgContext } from "@/lib/rls";
import {
  assertAssignmentOverlapAcked,
  assertBulkDailyCapacity,
  getPersonHistory,
  mergePersons,
  transferAssignment,
} from "@/server/services/workforce";

const ASSIGNMENT_LIST_SELECT = {
  id: true,
  personId: true,
  designation: true,
  category: true,
  employmentType: true,
  dailyWage: true,
  monthlySalary: true,
  gangName: true,
  fromDate: true,
  person: {
    select: {
      id: true,
      displayName: true,
      phone: true,
      bankAccountNo: true,
      bankName: true,
      pan: true,
      idNumber: true,
      status: true,
    },
  },
} as const;

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
  itemId: z.string(), // assignment id
  name: z.string().optional(), // person-level display name
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
});

export const hrRouter = router({
  /** List the project roster (active assignments joined with persons) or attendance. */
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
        // status filter: "active" = currently-engaged assignments; other
        // values filter on the person's org-wide status.
        const statusClause =
          input.status === "all"
            ? {}
            : input.status === "active"
              ? { status: "active" as const }
              : { person: { status: input.status } };

        const whereClause = {
          projectId: input.projectId,
          ...statusClause,
          ...(input.gangName ? { gangName: input.gangName } : {}),
          ...(input.category ? { category: input.category } : {}),
          ...(input.employmentType ? { employmentType: input.employmentType } : {}),
        };

        const [assignments, allGangs] = await Promise.all([
          db.projectStaffAssignment.findMany({
            where: whereClause,
            select: ASSIGNMENT_LIST_SELECT,
            orderBy: [{ category: "asc" }, { person: { displayName: "asc" } }],
             take: 1000, // bounded (pagination sweep) — see src/lib/pagination.ts
           }),
          db.projectStaffAssignment.findMany({
            where: { projectId: input.projectId, gangName: { not: null } },
            select: { gangName: true },
            distinct: ["gangName"],
             take: 1000, // bounded (pagination sweep) — see src/lib/pagination.ts
           }),
        ]);

        const gangs = allGangs.map((g) => g.gangName).filter(Boolean) as string[];

        // Project onto the legacy row shape consumed by the HR screens:
        // roster rows are assignments (id = assignmentId) carrying the
        // person's identity fields.
        const staff = assignments.map((a) => ({
          id: a.id,
          personId: a.personId,
          name: a.person.displayName,
          designation: a.designation,
          category: a.category,
          employmentType: a.employmentType,
          phone: a.person.phone,
          dailyWage: a.dailyWage,
          monthlySalary: a.monthlySalary,
          gangName: a.gangName,
          bankAccountNo: a.person.bankAccountNo,
          bankName: a.person.bankName,
          pan: a.person.pan,
          idNumber: a.person.idNumber,
          status: a.person.status,
          fromDate: a.fromDate,
        }));

        return {
          staff,
          gangs,
          attendance: [],
        };
      } else {
        const attendance = await db.staffAttendance.findMany({
          where: { projectId: input.projectId },
          orderBy: { date: "desc" },
          include: {
            assignment: {
              select: {
                id: true,
                person: { select: { displayName: true, category: true } },
                designation: true,
                dailyWage: true,
              },
            },
          },
          take: 200,
        });
        return { staff: [], gangs: [], attendance };
      }
    }),

  /** Create a person and start an active assignment on the project. */
  create: protectedProcedure
    .input(CreateStaffSchema)
    .mutation(async ({ ctx, input }) => {
      const { projectId, joinedDate, ...data } = input;
      await assertCanWrite(ctx.user, projectId);
      if (!ctx.user.organizationId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Organization context required." });
      }

      // Duplicate detection (ADR-0005 §1: none of these facts create
      // another — a shared worker must be ONE person). When the identity
      // fields match an existing org person, still create what was asked
      // but return the candidates so the UI can offer "attach existing
      // person" / "merge" instead of accumulating duplicates.
      const identityOr = [
        ...(data.phone ? [{ phone: data.phone }] : []),
        ...(data.pan ? [{ pan: data.pan }] : []),
        ...(data.idNumber ? [{ idNumber: data.idNumber }] : []),
      ];
      const duplicateSuggestions = identityOr.length
        ? await db.person.findMany({
            where: {
              organizationId: ctx.user.organizationId,
              OR: identityOr,
              mergedIntoId: null,
            },
            select: { id: true, displayName: true, phone: true, pan: true, idNumber: true, status: true },
            take: 10,
          })
        : [];

      const person = await db.person.create({
        data: {
          organizationId: ctx.user.organizationId,
          displayName: data.name,
          category: data.category,
          employmentType: data.employmentType,
          phone: data.phone || null,
          bankAccountNo: data.bankAccountNo || null,
          bankName: data.bankName || null,
          pan: data.pan || null,
          idNumber: data.idNumber || null,
        },
      });

      const assignment = await db.projectStaffAssignment.create({
        data: {
          projectId,
          personId: person.id,
          fromDate: joinedDate ? new Date(joinedDate) : new Date(),
          designation: data.designation || null,
          category: data.category,
          employmentType: data.employmentType,
          dailyWage: data.dailyWage,
          monthlySalary: data.monthlySalary,
          gangName: data.gangName || null,
        },
      });

      return {
        staff: { id: assignment.id, personId: person.id, name: person.displayName },
        duplicateSuggestions,
      };
    }),

  /**
   * Attach an EXISTING org person to this project (shared worker /
   * returning worker) — the ADR-0005 answer to "one human, many
   * projects": a new assignment row, never a second person.
   * Overlapping active assignments elsewhere are acknowledged via
   * overrideReason (audited by the workforce service).
   */
  attach: projectProcedure("write")
    .input(
      z.object({
        personId: z.string(),
        fromDate: z.string().optional().nullable(),
        designation: z.string().optional().nullable(),
        category: z.enum(["skilled", "unskilled", "supervisor", "staff", "operator"]).default("skilled"),
        employmentType: z.enum(["daily", "monthly", "piece_rate"]).default("daily"),
        dailyWage: z.number().nonnegative().default(0),
        monthlySalary: z.number().nonnegative().default(0),
        gangName: z.string().optional().nullable(),
        overrideReason: z.string().optional().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const projectId = ctx.projectId;
      if (!ctx.user.organizationId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Organization context required." });
      }

      const person = await db.person.findFirst({
        where: { id: input.personId, organizationId: ctx.user.organizationId, mergedIntoId: null },
        select: { id: true, displayName: true, status: true },
      });
      if (!person) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Person not found in this organization." });
      }

      const fromDate = input.fromDate ? new Date(input.fromDate) : new Date();

      const assignment = await db.$transaction(async (tx) => {
        await withOrgContext(tx, ctx.user.organizationId, !!ctx.user.isSuperAdmin);
        await assertAssignmentOverlapAcked(tx, {
          personId: person.id,
          projectId,
          window: { fromDate, toDate: null },
          overrideReason: input.overrideReason,
        });
        return tx.projectStaffAssignment.create({
          data: {
            projectId,
            personId: person.id,
            fromDate,
            designation: input.designation || null,
            category: input.category,
            employmentType: input.employmentType,
            dailyWage: input.dailyWage,
            monthlySalary: input.monthlySalary,
            gangName: input.gangName || null,
          },
        });
      });

      return { assignment: { id: assignment.id, personId: person.id, name: person.displayName } };
    }),

  /**
   * Transfer / re-hire: end the engagement and open a new chained one
   * (sourceAssignmentId). History is preserved; nothing is destroyed.
   */
  transfer: projectProcedure("write")
    .input(
      z.object({
        itemId: z.string(), // assignment id
        newProjectId: z.string().optional().nullable(), // omitted → re-hire on same project
        fromDate: z.string(),
        designation: z.string().optional().nullable(),
        category: z.enum(["skilled", "unskilled", "supervisor", "staff", "operator"]).optional(),
        employmentType: z.enum(["daily", "monthly", "piece_rate"]).optional(),
        dailyWage: z.number().nonnegative().optional(),
        monthlySalary: z.number().nonnegative().optional(),
        gangName: z.string().optional().nullable(),
        overrideReason: z.string().optional().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user.organizationId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Organization context required." });
      }
      const current = await db.projectStaffAssignment.findUnique({
        where: { id: input.itemId },
        select: { id: true, projectId: true, status: true },
      });
      if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "Staff assignment not found." });

      // Record-level authorization: the ASSIGNMENT's project governs (may
      // differ from the caller's operating context), and a cross-project
      // transfer needs write on the target too — both stay inline.
      await assertCanWrite(ctx.user, current.projectId);
      if (input.newProjectId && input.newProjectId !== current.projectId) {
        await assertCanWrite(ctx.user, input.newProjectId);
        // Same-org guard: assignments are workforce facts of ONE org.
        const target = await db.project.findUnique({
          where: { id: input.newProjectId },
          select: { organizationId: true },
        });
        if (!target || target.organizationId !== ctx.user.organizationId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Target project is outside your organization." });
        }
      }

      return db.$transaction(async (tx) => {
        await withOrgContext(tx, ctx.user.organizationId, !!ctx.user.isSuperAdmin);
        return transferAssignment(tx, {
          assignmentId: current.id,
          newProjectId: input.newProjectId || null,
          terms: {
            fromDate: new Date(input.fromDate),
            designation: input.designation,
            category: input.category,
            employmentType: input.employmentType,
            dailyWage: input.dailyWage,
            monthlySalary: input.monthlySalary,
            gangName: input.gangName,
          },
          overrideReason: input.overrideReason,
          actorId: ctx.user.id,
        });
      });
    }),

  /** Org-wide person directory search (for the attach / merge flows). */
  findPersons: projectProcedure("member")
    .input(z.object({ q: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      if (!ctx.user.organizationId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Organization context required." });
      }

      const persons = await db.person.findMany({
        where: {
          organizationId: ctx.user.organizationId,
          mergedIntoId: null,
          OR: [
            { displayName: { contains: input.q, mode: "insensitive" } },
            { phone: { contains: input.q } },
            { pan: { contains: input.q, mode: "insensitive" } },
            { idNumber: { contains: input.q } },
          ],
        },
        select: {
          id: true, displayName: true, phone: true, pan: true, idNumber: true,
          status: true, category: true, employmentType: true,
          assignments: {
            where: { status: "active" },
            select: {
              id: true, fromDate: true, gangName: true, projectId: true,
              project: { select: { id: true, name: true, code: true } },
            },
          },
        },
        orderBy: { displayName: "asc" },
        take: 25,
      });
      return { persons };
    }),

  /** Cross-project person history (assignments, advances, payroll, leave). */
  getPersonHistory: projectProcedure("member")
    .input(z.object({ personId: z.string() }))
    .query(async ({ ctx, input }) => {
      return getPersonHistory(db, input.personId);
    }),

  /** Update assignment terms and/or the person's identity fields. */
  update: protectedProcedure
    .input(UpdateStaffSchema)
    .mutation(async ({ ctx, input }) => {
      const { itemId, ...data } = input;
      const assignment = await db.projectStaffAssignment.findUnique({
        where: { id: itemId },
        select: { id: true, projectId: true, personId: true },
      });
      if (!assignment) throw new TRPCError({ code: "NOT_FOUND", message: "Staff assignment not found." });
      await assertCanWrite(ctx.user, assignment.projectId);

      const {
        name, phone, bankAccountNo, bankName, pan, idNumber, status,
        ...assignmentData
      } = data;

      await db.$transaction(async (tx) => {
        await withOrgContext(tx, ctx.user.organizationId, !!ctx.user.isSuperAdmin);

        // Person-level identity fields
        const personData: Record<string, unknown> = {};
        if (name !== undefined) personData.displayName = name;
        if (phone !== undefined) personData.phone = phone;
        if (bankAccountNo !== undefined) personData.bankAccountNo = bankAccountNo;
        if (bankName !== undefined) personData.bankName = bankName;
        if (pan !== undefined) personData.pan = pan;
        if (idNumber !== undefined) personData.idNumber = idNumber;
        if (status !== undefined) personData.status = status;
        if (Object.keys(personData).length > 0) {
          await tx.person.update({ where: { id: assignment.personId }, data: personData });
        }

        // Assignment-level engagement terms
        if (Object.keys(assignmentData).length > 0) {
          await tx.projectStaffAssignment.update({
            where: { id: assignment.id },
            data: assignmentData,
          });
        }
      });

      const updated = await db.projectStaffAssignment.findUnique({
        where: { id: itemId },
        select: ASSIGNMENT_LIST_SELECT,
      });
      return { staff: updated };
    }),

  /**
   * End the assignment (soft). ADR-0005: ending an engagement destroys
   * nothing — attendance, advances, payroll and leave history survive.
   */
  delete: protectedProcedure
    .input(z.object({ itemId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const assignment = await db.projectStaffAssignment.findUnique({
        where: { id: input.itemId },
        select: { id: true, projectId: true, status: true },
      });
      if (!assignment) throw new TRPCError({ code: "NOT_FOUND", message: "Staff assignment not found." });
      await assertCanWrite(ctx.user, assignment.projectId);

      await db.projectStaffAssignment.update({
        where: { id: input.itemId },
        data: { status: "ended", toDate: new Date(), endReason: "other" },
      });
      return { ok: true };
    }),

  /**
   * Merge a duplicate person into a primary one (org-admin action).
   * Dedupe is surfaced, never auto-applied: every referencing row is
   * re-pointed, the duplicate is marked mergedIntoId, nothing is
   * destroyed. Same-payroll-run collisions fail loud (service).
   */
  mergePersons: projectProcedure("member")
    .input(
      z.object({
        primaryId: z.string(),
        duplicateId: z.string(),
        reason: z.string().optional().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user.organizationId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Organization context required." });
      }
      // Merging rewrites org-wide workforce history — an org-admin action.
      if (!isOrgAdmin(ctx.user)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Organization admin access required to merge person records." });
      }

      return db.$transaction(async (tx) => {
        await withOrgContext(tx, ctx.user.organizationId, !!ctx.user.isSuperAdmin);
        return mergePersons(tx, {
          organizationId: ctx.user.organizationId!,
          primaryId: input.primaryId,
          duplicateId: input.duplicateId,
          reason: input.reason,
          actorId: ctx.user.id,
        });
      });
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

      const [assignments, existingAttendance] = await Promise.all([
        db.projectStaffAssignment.findMany({
          where: { projectId: input.projectId, status: "active" },
          select: ASSIGNMENT_LIST_SELECT,
          orderBy: [{ gangName: "asc" }, { category: "asc" }, { person: { displayName: "asc" } }],
           take: 1000, // bounded (pagination sweep) — see src/lib/pagination.ts
         }),
        db.staffAttendance.findMany({
          where: {
            projectId: input.projectId,
            date: targetDate,
          },
           take: 1000, // bounded (pagination sweep) — see src/lib/pagination.ts
         }),
      ]);

      const attendanceMap = new Map(existingAttendance.map((a) => [a.assignmentId, a]));

      const items = assignments.map((a) => {
        const att = attendanceMap.get(a.id);
        return {
          assignmentId: a.id,
          personId: a.personId,
          name: a.person.displayName,
          designation: a.designation,
          category: a.category,
          employmentType: a.employmentType,
          gangName: a.gangName,
          dailyWage: a.dailyWage,
          status: att ? att.status : "present",
          hours: att ? att.hours : 8,
          overtime: att ? att.overtime : 0,
          remarks: att ? att.remarks || "" : "",
          isLogged: !!att,
        };
      });

      return {
        date: input.date,
        totalWorkers: assignments.length,
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
            assignmentId: z.string(), // attendance grain is [assignmentId, date] (ADR-0005)
            status: z.enum(["present", "absent", "half_day", "leave", "overtime"]),
            hours: z.number().nonnegative().default(8),
            overtime: z.number().nonnegative().default(0),
            remarks: z.string().optional().nullable(),
          })
        ),
        // Audited escape hatch for the cross-project daily-capacity check
        // (a person genuinely split across two sites on one day).
        overrideReason: z.string().optional().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertCanWrite(ctx.user, input.projectId);
      if (!ctx.user.organizationId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Organization context required." });
      }

      // Verify all assignment ids belong to input.projectId to prevent
      // cross-project attendance overwrites
      const assignmentIds = input.records.map((r) => r.assignmentId);
      const validAssignments = await db.projectStaffAssignment.findMany({
       take: 1000, // bounded (pagination sweep) — see src/lib/pagination.ts
        where: { projectId: input.projectId, id: { in: assignmentIds }, status: "active" },
        select: { id: true, personId: true },
      });
      const validIdSet = new Set(validAssignments.map((a) => a.id));
      const personByAssignment = new Map(validAssignments.map((a) => [a.id, a.personId]));
      const validRecords = input.records
        .filter((r) => validIdSet.has(r.assignmentId))
        .map((r) => ({ ...r, personId: personByAssignment.get(r.assignmentId)! }));

      const targetDate = new Date(`${input.date}T00:00:00.000Z`);

      await db.$transaction(async (tx) => {
        await withOrgContext(tx, ctx.user.organizationId, !!ctx.user.isSuperAdmin); // RLS: phase-3a/b/c tables are FORCE-scoped

        // Cross-project daily capacity (ADR-0005) — owned by the
        // workforce service, exact against the post-write state.
        await assertBulkDailyCapacity(tx, {
          date: targetDate,
          records: validRecords.map((r) => ({
            personId: r.personId,
            assignmentId: r.assignmentId,
            status: r.status,
          })),
          overrideReason: input.overrideReason,
        });

        for (const record of validRecords) {
          await tx.staffAttendance.upsert({
            where: {
              assignmentId_date: {
                assignmentId: record.assignmentId,
                date: targetDate,
              },
            },
            create: {
              projectId: input.projectId,
              assignmentId: record.assignmentId,
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

      const [assignments, attendanceRecords] = await Promise.all([
        db.projectStaffAssignment.findMany({
          where: {
            projectId: input.projectId,
            status: "active",
            ...(input.gangName ? { gangName: input.gangName } : {}),
          },
          select: ASSIGNMENT_LIST_SELECT,
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
      ]);

      // Group attendance by assignmentId and day (1..31)
      const attendanceByAssignment = new Map<string, Map<number, { status: string; hours: number; overtime: number }>>();
      for (const record of attendanceRecords) {
        const day = new Date(record.date).getUTCDate();
        if (!attendanceByAssignment.has(record.assignmentId)) {
          attendanceByAssignment.set(record.assignmentId, new Map());
        }
        attendanceByAssignment.get(record.assignmentId)!.set(day, {
          status: record.status,
          hours: record.hours,
          overtime: record.overtime,
        });
      }

      // Build 31-day matrix rows
      const rows = assignments.map((a) => {
        const dayMap = attendanceByAssignment.get(a.id) || new Map();
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
        const hourlyRate = a.dailyWage > 0 ? a.dailyWage / 8 : 0;
        const estimatedRegularWage = a.employmentType === "monthly" ? a.monthlySalary : effectiveDays * a.dailyWage;
        const estimatedOtWage = totalOvertimeHours * hourlyRate * 1.5;
        const estimatedGross = estimatedRegularWage + estimatedOtWage;

        return {
          assignmentId: a.id,
          personId: a.personId,
          name: a.person.displayName,
          designation: a.designation,
          category: a.category,
          employmentType: a.employmentType,
          gangName: a.gangName,
          dailyWage: a.dailyWage,
          monthlySalary: a.monthlySalary,
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
          totalStaff: assignments.length,
          totalPresentManDays: rows.reduce((s, r) => s + r.effectiveDays, 0),
          totalOtHours: rows.reduce((s, r) => s + r.totalOvertimeHours, 0),
          totalEstimatedGross: rows.reduce((s, r) => s + r.estimatedGross, 0),
        },
      };
    }),

  /** List cash advances and site mess deductions (person grain). */
  getStaffAdvances: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        personId: z.string().optional(),
        isRecovered: z.boolean().optional(), // true = fully recovered, false = outstanding
      })
    )
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);

      const where: any = {
        projectId: input.projectId,
        ...(input.personId ? { personId: input.personId } : {}),
      };

      const advances = await db.staffAdvance.findMany({
        where,
        include: {
          person: { select: { id: true, displayName: true, category: true } },
        },
        orderBy: { date: "desc" },
         take: 1000, // bounded (pagination sweep) — see src/lib/pagination.ts
       });

      // Post-filter on recovery state (recoveredAmount >= amount = recovered)
      const filtered =
        input.isRecovered === undefined
          ? advances
          : advances.filter((a) =>
              input.isRecovered
                ? a.recoveredAmount >= a.amount
                : a.recoveredAmount < a.amount
            );

      const totalPendingAdvances = advances
        .filter((a) => a.recoveredAmount < a.amount)
        .reduce((sum, a) => sum + (a.amount - a.recoveredAmount), 0);

      return { advances: filtered, totalPendingAdvances };
    }),

  /** Issue a cash advance or log a site deduction (person grain). */
  createStaffAdvance: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        personId: z.string(),
        date: z.string().optional(),
        amount: z.number().positive(),
        type: z.enum(["cash_advance", "mess_deduction", "safety_gear", "other"]).default("cash_advance"),
        remarks: z.string().optional().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertCanWrite(ctx.user, input.projectId);

      // FISCAL LOCK FIX (audit §4): staff advances had NO lock — a
      // back-dated advance distorted a closed fiscal year's actuals.
      await assertNotLocked(ctx.user.organizationId, input.date ? new Date(input.date) : new Date());

      // Cross-project guard: the advance must be issued to a person with an
      // ACTIVE assignment on THIS project — without this, a caller with
      // write access to project A could attach advances to people in
      // project B (leaking their names via the advances list and
      // corrupting payroll recovery inputs).
      const assignment = await db.projectStaffAssignment.findFirst({
        where: { personId: input.personId, projectId: input.projectId, status: "active" },
        select: { id: true },
      });
      if (!assignment) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Person has no active assignment on this project." });
      }

      const advance = await db.staffAdvance.create({
        data: {
          projectId: input.projectId,
          personId: input.personId,
          date: input.date ? new Date(input.date) : new Date(),
          amount: input.amount,
          type: input.type,
          remarks: input.remarks || null,
          createdById: ctx.user.id,
        },
      });

      return { advance };
    }),

  /** Delete a pending advance (only while nothing has been recovered). */
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
      if (adv.recoveredAmount > 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot delete an advance that has been (partially) recovered in a payroll run." });
      }

      await db.staffAdvance.delete({ where: { id: input.advanceId } });
      return { success: true };
    }),
});
