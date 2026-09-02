/**
 * tRPC router for Resource Assignments on Gantt tasks.
 *
 * In PLANNING schedules: assign generic StaffRoles to tasks
 * In EXECUTION schedules: assign specific Staff/Equipment to tasks
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "@/server/trpc";
import { db } from "@/lib/db";
import { assertProjectMember, assertCanWrite } from "@/lib/authz";
import { audit } from "@/lib/audit";
import { authErrorToTRPC } from "./rate-analysis";

export const resourceAssignmentRouter = router({
  /** List all resource assignments for a task. */
  list: protectedProcedure
    .input(z.object({ taskId: z.string() }))
    .query(async ({ ctx, input }) => {
      const task = await db.ganttTask.findUnique({
        where: { id: input.taskId },
        select: { id: true, projectId: true },
      });
      if (!task) throw new TRPCError({ code: "NOT_FOUND", message: "Task not found." });
      await assertProjectMember(ctx.user, task.projectId);

      const assignments = await db.resourceAssignment.findMany({
        where: { taskId: input.taskId },
        include: {
          staffRole: { select: { id: true, name: true, category: true, headcount: true, chainageFrom: true, chainageTo: true } },
          staff: { select: { id: true, name: true, designation: true, category: true, dailyWage: true } },
          equipment: { select: { id: true, name: true, code: true, type: true, status: true } },
        },
        orderBy: { createdAt: "asc" },
         take: 1000, // bounded (pagination sweep) — see src/lib/pagination.ts
       });

      return { assignments };
    }),

  /** Assign a staff role to a task (used in planning schedules). */
  assignRole: protectedProcedure
    .input(z.object({
      taskId: z.string(),
      staffRoleId: z.string(),
      quantity: z.number().min(1).default(1),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const task = await db.ganttTask.findUnique({
        where: { id: input.taskId },
        select: { id: true, projectId: true },
      });
      if (!task) throw new TRPCError({ code: "NOT_FOUND", message: "Task not found." });

      try {
        await assertCanWrite(ctx.user, task.projectId);
      } catch (err) {
        throw authErrorToTRPC(err);
      }

      // Verify role belongs to same project
      const role = await db.staffRole.findUnique({
        where: { id: input.staffRoleId },
        select: { id: true, projectId: true, name: true },
      });
      if (!role || role.projectId !== task.projectId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Role not found in this project." });
      }

      // Check if already assigned
      const existing = await db.resourceAssignment.findFirst({
        where: { taskId: input.taskId, staffRoleId: input.staffRoleId },
      });
      if (existing) {
        throw new TRPCError({ code: "CONFLICT", message: "This role is already assigned to this task." });
      }

      const assignment = await db.resourceAssignment.create({
        data: {
          taskId: input.taskId,
          staffRoleId: input.staffRoleId,
          quantity: input.quantity,
          notes: input.notes,
        },
        include: { staffRole: true },
      });

      await audit({
        userId: ctx.user.id,
        projectId: task.projectId,
        action: "gantt.assignRole",
        entityType: "gantt_task",
        entityId: input.taskId,
        metadata: { role: role.name, quantity: input.quantity },
      });

      return { assignment };
    }),

  /** Assign specific staff to a task (used in execution schedules). */
  assignStaff: protectedProcedure
    .input(z.object({
      taskId: z.string(),
      staffId: z.string(),
      staffRoleId: z.string().optional(), // optional: link to the role this person is filling
      quantity: z.number().min(1).default(1),
      startDate: z.string().datetime().optional(),
      endDate: z.string().datetime().nullable().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const task = await db.ganttTask.findUnique({
        where: { id: input.taskId },
        select: { id: true, projectId: true },
      });
      if (!task) throw new TRPCError({ code: "NOT_FOUND", message: "Task not found." });

      try {
        await assertCanWrite(ctx.user, task.projectId);
      } catch (err) {
        throw authErrorToTRPC(err);
      }

      const staff = await db.staff.findUnique({
        where: { id: input.staffId },
        select: { id: true, projectId: true, name: true },
      });
      if (!staff || staff.projectId !== task.projectId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Staff not found in this project." });
      }

      const assignment = await db.resourceAssignment.create({
        data: {
          taskId: input.taskId,
          staffId: input.staffId,
          staffRoleId: input.staffRoleId || null,
          quantity: input.quantity,
          startDate: input.startDate ? new Date(input.startDate) : null,
          endDate: input.endDate ? new Date(input.endDate) : null,
          notes: input.notes,
        },
        include: { staff: true, staffRole: true },
      });

      await audit({
        userId: ctx.user.id,
        projectId: task.projectId,
        action: "gantt.assignStaff",
        entityType: "gantt_task",
        entityId: input.taskId,
        metadata: { staff: staff.name },
      });

      return { assignment };
    }),

  /** Assign equipment to a task. */
  assignEquipment: protectedProcedure
    .input(z.object({
      taskId: z.string(),
      equipmentId: z.string(),
      quantity: z.number().min(1).default(1),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const task = await db.ganttTask.findUnique({
        where: { id: input.taskId },
        select: { id: true, projectId: true },
      });
      if (!task) throw new TRPCError({ code: "NOT_FOUND", message: "Task not found." });

      try {
        await assertCanWrite(ctx.user, task.projectId);
      } catch (err) {
        throw authErrorToTRPC(err);
      }

      const equipment = await db.equipment.findUnique({
        where: { id: input.equipmentId },
        select: { id: true, projectId: true, name: true },
      });
      if (!equipment || equipment.projectId !== task.projectId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Equipment not found in this project." });
      }

      const assignment = await db.resourceAssignment.create({
        data: {
          taskId: input.taskId,
          equipmentId: input.equipmentId,
          quantity: input.quantity,
          unit: "unit",
          notes: input.notes,
        },
        include: { equipment: true },
      });

      await audit({
        userId: ctx.user.id,
        projectId: task.projectId,
        action: "gantt.assignEquipment",
        entityType: "gantt_task",
        entityId: input.taskId,
        metadata: { equipment: equipment.name },
      });

      return { assignment };
    }),

  /** Remove a resource assignment. */
  remove: protectedProcedure
    .input(z.object({ assignmentId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const assignment = await db.resourceAssignment.findUnique({
        where: { id: input.assignmentId },
        include: { task: { select: { projectId: true } } },
      });
      if (!assignment) throw new TRPCError({ code: "NOT_FOUND", message: "Assignment not found." });

      try {
        await assertCanWrite(ctx.user, assignment.task.projectId);
      } catch (err) {
        throw authErrorToTRPC(err);
      }

      await db.resourceAssignment.delete({ where: { id: input.assignmentId } });

      await audit({
        userId: ctx.user.id,
        projectId: assignment.task.projectId,
        action: "gantt.removeAssignment",
        entityType: "gantt_task",
        entityId: assignment.taskId,
        metadata: { assignmentId: input.assignmentId },
      });

      return { ok: true };
    }),

  /** Get all assignments for a project (for resource loading + conflict detection). */
  listForProject: protectedProcedure
    .input(z.object({ projectId: z.string(), versionId: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);

      const assignments = await db.resourceAssignment.findMany({
        where: {
          task: {
            projectId: input.projectId,
            ...(input.versionId ? { versionId: input.versionId } : {}),
          },
        },
        include: {
          task: { select: { id: true, name: true, code: true, startDate: true, endDate: true } },
          staffRole: { select: { id: true, name: true, category: true, headcount: true } },
          staff: { select: { id: true, name: true, designation: true } },
          equipment: { select: { id: true, name: true, code: true, type: true } },
        },
        orderBy: { createdAt: "asc" },
         take: 1000, // bounded (pagination sweep) — see src/lib/pagination.ts
       });

      return { assignments };
    }),
});
