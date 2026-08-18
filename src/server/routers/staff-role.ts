/**
 * tRPC router for Staff Roles — hierarchy of roles for planning schedules.
 *
 * Roles are assigned to planning tasks (e.g., "Engineer 0+000-0+5000").
 * Specific staff are assigned to roles (with date ranges for turnover).
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "@/server/trpc";
import { db } from "@/lib/db";
import { assertProjectMember, assertCanWrite } from "@/lib/authz";
import { audit } from "@/lib/audit";

const CreateRoleSchema = z.object({
  projectId: z.string(),
  parentId: z.string().optional(),
  name: z.string().min(1).max(200),
  category: z.enum(["engineer", "mason", "labor", "operator", "supervisor", "staff"]).default("staff"),
  chainageFrom: z.number().optional(),
  chainageTo: z.number().optional(),
  headcount: z.number().int().min(1).default(1),
  dailyWage: z.number().min(0).default(0),
  skills: z.array(z.string()).optional(),
  notes: z.string().optional(),
});

const UpdateRoleSchema = z.object({
  roleId: z.string(),
  name: z.string().min(1).max(200).optional(),
  category: z.enum(["engineer", "mason", "labor", "operator", "supervisor", "staff"]).optional(),
  chainageFrom: z.number().nullable().optional(),
  chainageTo: z.number().nullable().optional(),
  headcount: z.number().int().min(1).optional(),
  dailyWage: z.number().min(0).optional(),
  skills: z.array(z.string()).nullable().optional(),
  notes: z.string().nullable().optional(),
});

const AssignStaffSchema = z.object({
  staffRoleId: z.string(),
  staffId: z.string(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().nullable().optional(),
  notes: z.string().optional(),
});

export const staffRoleRouter = router({
  /** List all roles for a project as a tree (with children + current assignments). */
  list: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);

      const roles = await db.staffRole.findMany({
        where: { projectId: input.projectId },
        include: {
          children: { orderBy: { name: "asc" } },
          assignments: {
            where: { endDate: null },
            include: { staff: { select: { id: true, name: true, designation: true, category: true, dailyWage: true, status: true } } },
            orderBy: { startDate: "desc" },
          },
          _count: { select: { assignments: true } },
        },
        orderBy: [{ chainageFrom: "asc" }, { name: "asc" }],
      });

      // Build tree: top-level roles (parentId is null) with children nested recursively.
      // Step 1: Create a map of all roles with empty children arrays (overwriting Prisma's flat children)
      type TreeNode = Omit<(typeof roles)[number], "children"> & { children: TreeNode[] };
      const roleMap = new Map<string, TreeNode>();
      for (const role of roles) {
        const { children: _prismaChildren, ...rest } = role;
        roleMap.set(role.id, { ...rest, children: [] });
      }

      // Step 2: Build tree by assigning each role to its parent (or root if no parent)
      const tree: TreeNode[] = [];
      for (const role of roles) {
        const node = roleMap.get(role.id)!;
        if (role.parentId && roleMap.has(role.parentId)) {
          roleMap.get(role.parentId)!.children.push(node);
        } else if (!role.parentId) {
          tree.push(node);
        } else {
          // Parent not in map (orphaned) — add to root
          tree.push(node);
        }
      }

      return { roles: tree };
    }),

  /** Create a new staff role. */
  create: protectedProcedure
    .input(CreateRoleSchema)
    .mutation(async ({ ctx, input }) => {
      await assertCanWrite(ctx.user, input.projectId);

      const role = await db.staffRole.create({
        data: {
          projectId: input.projectId,
          parentId: input.parentId,
          name: input.name,
          category: input.category,
          chainageFrom: input.chainageFrom,
          chainageTo: input.chainageTo,
          headcount: input.headcount,
          dailyWage: input.dailyWage,
          skills: input.skills ? JSON.stringify(input.skills) : null,
          notes: input.notes,
        },
      });

      await audit({
        userId: ctx.user.id,
        projectId: input.projectId,
        action: "staffRole.create",
        entityType: "staff_role",
        entityId: role.id,
        metadata: { name: role.name, category: role.category },
      });

      return { role };
    }),

  /** Update a staff role. */
  update: protectedProcedure
    .input(UpdateRoleSchema)
    .mutation(async ({ ctx, input }) => {
      const { roleId, ...data } = input;
      const role = await db.staffRole.findUnique({
        where: { id: roleId },
        select: { id: true, projectId: true, name: true },
      });
      if (!role) throw new TRPCError({ code: "NOT_FOUND", message: "Role not found." });
      await assertCanWrite(ctx.user, role.projectId);

      const updated = await db.staffRole.update({
        where: { id: roleId },
        data: {
          ...(data.name !== undefined && { name: data.name }),
          ...(data.category !== undefined && { category: data.category }),
          ...(data.chainageFrom !== undefined && { chainageFrom: data.chainageFrom }),
          ...(data.chainageTo !== undefined && { chainageTo: data.chainageTo }),
          ...(data.headcount !== undefined && { headcount: data.headcount }),
          ...(data.dailyWage !== undefined && { dailyWage: data.dailyWage }),
          ...(data.skills !== undefined && { skills: data.skills ? JSON.stringify(data.skills) : null }),
          ...(data.notes !== undefined && { notes: data.notes }),
        },
      });

      await audit({
        userId: ctx.user.id,
        projectId: role.projectId,
        action: "staffRole.update",
        entityType: "staff_role",
        entityId: roleId,
        metadata: { name: role.name, changes: data },
      });

      return { role: updated };
    }),

  /** Delete a staff role (and its children + assignments via cascade). */
  delete: protectedProcedure
    .input(z.object({ roleId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const role = await db.staffRole.findUnique({
        where: { id: input.roleId },
        select: { id: true, projectId: true, name: true },
      });
      if (!role) throw new TRPCError({ code: "NOT_FOUND", message: "Role not found." });
      await assertCanWrite(ctx.user, role.projectId);

      await db.staffRole.delete({ where: { id: input.roleId } });

      await audit({
        userId: ctx.user.id,
        projectId: role.projectId,
        action: "staffRole.delete",
        entityType: "staff_role",
        entityId: input.roleId,
        metadata: { name: role.name },
      });

      return { ok: true };
    }),

  /** Assign a staff member to a role. */
  assignStaff: protectedProcedure
    .input(AssignStaffSchema)
    .mutation(async ({ ctx, input }) => {
      const role = await db.staffRole.findUnique({
        where: { id: input.staffRoleId },
        select: { id: true, projectId: true, name: true, headcount: true },
      });
      if (!role) throw new TRPCError({ code: "NOT_FOUND", message: "Role not found." });
      await assertCanWrite(ctx.user, role.projectId);

      // Verify staff belongs to same project
      const staff = await db.staff.findUnique({
        where: { id: input.staffId },
        select: { id: true, projectId: true, name: true },
      });
      if (!staff || staff.projectId !== role.projectId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Staff member not found in this project." });
      }

      // If this is a new current assignment (endDate is null), close any existing
      // current assignments for this role (replace the previous person)
      if (input.endDate === null || input.endDate === undefined) {
        await db.staffRoleAssignment.updateMany({
          where: { staffRoleId: input.staffRoleId, endDate: null },
          data: { endDate: new Date() },
        });
      }

      const assignment = await db.staffRoleAssignment.create({
        data: {
          staffRoleId: input.staffRoleId,
          staffId: input.staffId,
          startDate: input.startDate ? new Date(input.startDate) : new Date(),
          endDate: input.endDate ? new Date(input.endDate) : null,
          notes: input.notes,
        },
        include: { staff: true },
      });

      await audit({
        userId: ctx.user.id,
        projectId: role.projectId,
        action: "staffRole.assign",
        entityType: "staff_role",
        entityId: input.staffRoleId,
        metadata: { role: role.name, staff: staff.name },
      });

      return { assignment };
    }),

  /** Remove (end) a staff assignment from a role. */
  unassignStaff: protectedProcedure
    .input(z.object({ assignmentId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const assignment = await db.staffRoleAssignment.findUnique({
        where: { id: input.assignmentId },
        include: { staffRole: { select: { projectId: true, name: true } } },
      });
      if (!assignment) throw new TRPCError({ code: "NOT_FOUND", message: "Assignment not found." });
      await assertCanWrite(ctx.user, assignment.staffRole.projectId);

      // Set endDate to now (don't delete — preserve history)
      await db.staffRoleAssignment.update({
        where: { id: input.assignmentId },
        data: { endDate: new Date() },
      });

      await audit({
        userId: ctx.user.id,
        projectId: assignment.staffRole.projectId,
        action: "staffRole.unassign",
        entityType: "staff_role",
        entityId: assignment.staffRoleId,
        metadata: { role: assignment.staffRole.name, assignmentId: input.assignmentId },
      });

      return { ok: true };
    }),

  /** Get assignment history for a role (all past + current). */
  getHistory: protectedProcedure
    .input(z.object({ staffRoleId: z.string() }))
    .query(async ({ ctx, input }) => {
      const role = await db.staffRole.findUnique({
        where: { id: input.staffRoleId },
        select: { projectId: true },
      });
      if (!role) throw new TRPCError({ code: "NOT_FOUND", message: "Role not found." });
      await assertProjectMember(ctx.user, role.projectId);

      const assignments = await db.staffRoleAssignment.findMany({
        where: { staffRoleId: input.staffRoleId },
        include: {
          staff: { select: { id: true, name: true, designation: true, category: true, phone: true } },
        },
        orderBy: { startDate: "desc" },
      });

      return { assignments };
    }),
});
