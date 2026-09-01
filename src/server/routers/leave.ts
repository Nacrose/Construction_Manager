/**
 * tRPC router for Leave Management.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "@/server/trpc";
import { db } from "@/lib/db";
import { assertProjectMember, assertCanWrite, assertProjectAdmin } from "@/lib/authz";

import { canTransition } from "@/server/utils/state-machine";
import { emitDomainEvent } from "@/server/utils/domain-events";

export const leaveRouter = router({
  /** List leave requests for a project, with optional status filter. */
  list: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      status: z.enum(["pending", "approved", "rejected"]).optional(),
    }))
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);
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
      await assertProjectMember(ctx.user, leave.projectId);

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
  create: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      staffId: z.string(),
      leaveType: z.string().default("casual"),
      startDate: z.string(),
      endDate: z.string(),
      reason: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertCanWrite(ctx.user, input.projectId);

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
      const totalDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24)) + 1;

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

  /** PM/coordinator approves leave request. */
  approve: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const leave = await db.leaveRequest.findUnique({
        where: { id: input.id },
        select: { projectId: true, status: true, staffId: true, totalDays: true, leaveType: true },
      });
      if (!leave) throw new TRPCError({ code: "NOT_FOUND", message: "Leave request not found." });
      await assertProjectAdmin(ctx.user, leave.projectId);

      const check = canTransition("leave", leave.status, "approved");
      if (!check.allowed) {
        throw new TRPCError({ code: "BAD_REQUEST", message: check.reason || "Only pending requests can be approved." });
      }

      const now = new Date();
      const updated = await db.leaveRequest.update({
        where: { id: input.id },
        data: {
          status: "approved",
          approvedById: ctx.user.id,
          approvedAt: now,
        },
      });

      emitDomainEvent({
        type: "lifecycle.transitioned",
        projectId: leave.projectId,
        actorUserId: ctx.user.id,
        entityType: "leave",
        entityId: input.id,
        title: "LEAVE marked as APPROVED",
        message: `Leave request approved.`,
        metadata: {
          entityId: input.id,
          model: "leave",
          previousState: leave.status,
          newState: "approved",
        },
      });

      const currentYear = new Date().getFullYear();

      // Update LeaveBalance: increment taken, decrement remaining
      await db.leaveBalance.upsert({
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

      const check = canTransition("leave", leave.status, "rejected");
      if (!check.allowed) {
        throw new TRPCError({ code: "BAD_REQUEST", message: check.reason || "Only pending requests can be rejected." });
      }

      const updated = await db.leaveRequest.update({
        where: { id: input.id },
        data: {
          status: "rejected",
          rejectionReason: input.rejectionReason,
        },
      });

      emitDomainEvent({
        type: "lifecycle.transitioned",
        projectId: leave.projectId,
        actorUserId: ctx.user.id,
        entityType: "leave",
        entityId: input.id,
        title: "LEAVE marked as REJECTED",
        message: input.rejectionReason || "Leave request rejected.",
        metadata: {
          entityId: input.id,
          model: "leave",
          previousState: leave.status,
          newState: "rejected",
        },
      });

      return { leave: updated };
    }),



  /** Get leave balances for a staff member (by year). */
  getBalances: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      staffId: z.string(),
      year: z.number().optional(),
    }))
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);
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
  updateBalances: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      staffId: z.string(),
      leaveType: z.string(),
      year: z.number(),
      totalAllowed: z.number().min(0),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertProjectAdmin(ctx.user, input.projectId);

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
