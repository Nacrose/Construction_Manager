/**
 * tRPC router for Leave Management.
 *
 * Phase E: input-level authorization is declarative via createDomainRouter
 * (proc.member / proc.write / proc.admin). Record-level guards (approve/reject
 * by id — the record's project governs) stay in the handlers by design.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createDomainRouter, protectedProcedure } from "@/server/trpc";
import { db } from "@/lib/db";
import { assertProjectMember, assertProjectAdmin } from "@/lib/authz";
import { withOrgContext } from "@/lib/rls";

const { router, proc } = createDomainRouter();

export const leaveRouter = router({
  /** List leave requests for a project, with optional status filter. */
  list: proc.member
    .input(z.object({
      projectId: z.string(),
      status: z.enum(["pending", "approved", "rejected"]).optional(),
    }))
    .query(async ({ input }) => {
      const where: Record<string, unknown> = { projectId: input.projectId };
      if (input.status) where.status = input.status;

      const leaves = await db.leaveRequest.findMany({
        where,
        orderBy: { createdAt: "desc" },
        include: {
          staff: { select: { name: true, designation: true, category: true } },
          approvedBy: { select: { name: true } },
          createdBy: { select: { name: true } },
        },
      });
      return { leaves };
    }),

  /** Get single leave request. */
  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const leave = await db.leaveRequest.findUnique({
        where: { id: input.id },
        select: { projectId: true, staffId: true, leaveType: true, startDate: true, endDate: true, totalDays: true, reason: true, status: true, approvedById: true, createdById: true },
      });
      if (!leave) throw new TRPCError({ code: "NOT_FOUND", message: "Leave request not found." });
      // IDOR guard: verify the caller is a member of the project the
      // leave belongs to. Previously this procedure returned leave data
      // to ANY authenticated user — leaking HR-sensitive PII (staff
      // name, leave type, dates, reason) across tenants.
      await assertProjectMember(ctx.user, leave.projectId);

      // Re-fetch with includes for the response shape (now that we've
      // verified the caller is authorized).
      const leaveWithIncludes = await db.leaveRequest.findUnique({
        where: { id: input.id },
        include: {
          staff: { select: { name: true, designation: true, category: true } },
          approvedBy: { select: { name: true } },
          createdBy: { select: { name: true } },
        },
      });
      return { leave: leaveWithIncludes };
    }),

  /** Create leave request. Auto-calculate totalDays from date difference. */
  create: proc.write
    .input(z.object({
      projectId: z.string(),
      staffId: z.string(),
      leaveType: z.string().default("casual"),
      startDate: z.string(),
      endDate: z.string(),
      reason: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Cross-project guard: the leave must be filed for a staff member
      // of THIS project — without this, a caller with write access to
      // project A could file leaves for staff in project B (leaking their
      // names/dates via the project leave list).
      const staff = await db.staff.findFirst({
        where: { id: input.staffId, projectId: input.projectId },
        select: { id: true },
      });
      if (!staff) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Staff not found in this project." });
      }

      const start = new Date(input.startDate);
      const end = new Date(input.endDate);
      const diffMs = end.getTime() - start.getTime();
      const totalDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24)) + 1; // inclusive of both start and end

      if (totalDays <= 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "End date must be on or after start date." });
      }

      const leave = await db.leaveRequest.create({
        data: {
          projectId: input.projectId,
          staffId: input.staffId,
          leaveType: input.leaveType,
          startDate: start,
          endDate: end,
          totalDays,
          reason: input.reason,
          createdById: ctx.user.id,
        },
      });
      return { leave };
    }),

  /** PM approves leave request. */
  approve: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const leave = await db.leaveRequest.findUnique({
        where: { id: input.id },
        select: { projectId: true, status: true, staffId: true, totalDays: true, leaveType: true, createdById: true },
      });
      if (!leave) throw new TRPCError({ code: "NOT_FOUND", message: "Leave request not found." });

      // Segregation of duties: Creator cannot approve their own leave request
      if (leave.createdById && leave.createdById === ctx.user.id && !ctx.user.isSuperAdmin) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Segregation of duties violation: you cannot approve a leave request you created.",
        });
      }

      await assertProjectAdmin(ctx.user, leave.projectId);

      if (leave.status !== "pending") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Only pending requests can be approved." });
      }

      const currentYear = new Date().getFullYear();

      // STATUS UPDATE + LEAVE BALANCE UPSERT — ONE TRANSACTION
      const updated = await db.$transaction(async (tx) => {
        await withOrgContext(tx, ctx.user.organizationId, !!ctx.user.isSuperAdmin);

        const req = await tx.leaveRequest.update({
          where: { id: input.id },
          data: {
            status: "approved",
            approvedById: ctx.user.id,
            approvedAt: new Date(),
          },
        });

        // Update LeaveBalance: increment taken, decrement remaining
        await tx.leaveBalance.upsert({
          where: {
            projectId_staffId_leaveType_year: {
              projectId: leave.projectId,
              staffId: leave.staffId,
              leaveType: leave.leaveType,
              year: currentYear,
            },
          },
          update: {
            taken: { increment: leave.totalDays },
            remaining: { decrement: leave.totalDays },
          },
          create: {
            projectId: leave.projectId,
            staffId: leave.staffId,
            leaveType: leave.leaveType,
            year: currentYear,
            totalAllowed: 0,
            taken: leave.totalDays,
            remaining: -leave.totalDays,
          },
        });

        return req;
      });

      return { leave: updated };
    }),

  /** PM/coordinator rejects leave request. */
  reject: protectedProcedure
    .input(z.object({ id: z.string(), rejectionReason: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const leave = await db.leaveRequest.findUnique({
        where: { id: input.id },
        select: { projectId: true, status: true },
      });
      if (!leave) throw new TRPCError({ code: "NOT_FOUND", message: "Leave request not found." });
      await assertProjectAdmin(ctx.user, leave.projectId);

      if (leave.status !== "pending") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Only pending requests can be rejected." });
      }

      const updated = await db.leaveRequest.update({
        where: { id: input.id },
        data: {
          status: "rejected",
          rejectionReason: input.rejectionReason,
        },
      });
      return { leave: updated };
    }),

  /** Get leave balances for a staff member (by year). */
  getBalances: proc.member
    .input(z.object({
      projectId: z.string(),
      staffId: z.string(),
      year: z.number().optional(),
    }))
    .query(async ({ input }) => {
      const year = input.year || new Date().getFullYear();

      const balances = await db.leaveBalance.findMany({
        where: {
          projectId: input.projectId,
          staffId: input.staffId,
          year,
        },
        orderBy: { leaveType: "asc" },
      });
      return { balances };
    }),

  /** PM sets annual leave allowances (creates/updates LeaveBalance records). */
  updateBalances: proc.admin
    .input(z.object({
      projectId: z.string(),
      staffId: z.string(),
      leaveType: z.string(),
      year: z.number(),
      totalAllowed: z.number().min(0),
    }))
    .mutation(async ({ input }) => {
      const existing = await db.leaveBalance.findUnique({
        where: {
          projectId_staffId_leaveType_year: {
            projectId: input.projectId,
            staffId: input.staffId,
            leaveType: input.leaveType,
            year: input.year,
          },
        },
      });

      const taken = existing?.taken ?? 0;
      const balance = await db.leaveBalance.upsert({
        where: {
          projectId_staffId_leaveType_year: {
            projectId: input.projectId,
            staffId: input.staffId,
            leaveType: input.leaveType,
            year: input.year,
          },
        },
        update: {
          totalAllowed: input.totalAllowed,
          remaining: input.totalAllowed - taken,
        },
        create: {
          projectId: input.projectId,
          staffId: input.staffId,
          leaveType: input.leaveType,
          year: input.year,
          totalAllowed: input.totalAllowed,
          taken: 0,
          remaining: input.totalAllowed,
        },
      });
      return { balance };
    }),
});
