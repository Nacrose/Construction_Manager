import { isOrgAdmin } from "@/lib/authz";
/**
 * tRPC router for projects and members.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "@/server/trpc";
import { db } from "@/lib/db";
import { assertProjectMember, assertProjectManager, assertProjectAdmin } from "@/lib/authz";
import { audit } from "@/lib/audit";
import bcrypt from "bcryptjs";

const CreateProjectSchema = z.object({
  name: z.string().min(1).max(200),
  code: z
    .string()
    .min(1)
    .max(50)
    .regex(/^[A-Z0-9-]+$/i, "Code must be alphanumeric with dashes"),
  client: z.string().max(200).optional(),
  location: z.string().max(200).optional(),
  contractValue: z.number().nonnegative().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  description: z.string().max(2000).optional(),
});

const UpdateProjectSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(200).optional(),
  client: z.string().max(200).optional(),
  location: z.string().max(200).optional(),
  contractValue: z.number().nonnegative().optional(),
  startDate: z.string().datetime().nullable().optional(),
  endDate: z.string().datetime().nullable().optional(),
  status: z.enum(["active", "on_hold", "completed", "archived"]).optional(),
  description: z.string().max(2000).optional(),
  // Cost rate overrides
  skilledWageRate: z.number().nonnegative().nullable().optional(),
  unskilledWageRate: z.number().nonnegative().nullable().optional(),
  supervisorWageRate: z.number().nonnegative().nullable().optional(),
  ownedEquipRate: z.number().nonnegative().nullable().optional(),
  hiredEquipRate: z.number().nonnegative().nullable().optional(),
  fuelPricePerLiter: z.number().nonnegative().nullable().optional(),
});

const AddMemberSchema = z.object({
  projectId: z.string(),
  email: z.string().email().toLowerCase(),
  name: z.string().optional(),
  role: z.enum(["project_manager", "engineer", "coordinator", "client", "inspector"]),
});

const UpdateMemberSchema = z.object({
  projectId: z.string(),
  memberId: z.string(),
  role: z.enum(["project_manager", "engineer", "coordinator", "client", "inspector"]),
});

export const projectRouter = router({
  /** List all projects the user belongs to. */
  list: protectedProcedure.query(async ({ ctx }) => {
    // Impersonation: a platform admin acting as a tenant sees ONLY the
    // impersonated org's projects — scoped app-side (RLS is not reliable
    // per-request under connection pooling).
    if (ctx.user.impersonating) {
      const orgProjects = await db.project.findMany({
        where: { organizationId: ctx.user.organizationId },
        include: {
          _count: { select: { rfis: true, members: true } },
          organization: { select: { id: true, name: true, code: true } },
        },
        orderBy: { updatedAt: "desc" },
      });
      return {
        projects: orgProjects.map((p) => ({
          ...p,
          myRole: "engineer",
          rfiCount: p._count.rfis,
          memberCount: p._count.members,
          _count: undefined,
        })),
      };
    }

    // Super admins (non-impersonating) see all projects across orgs
    if (isOrgAdmin(ctx.user)) {
      const allProjects = await db.project.findMany({
        include: {
          _count: { select: { rfis: true, members: true } },
          organization: { select: { id: true, name: true, code: true } },
        },
        orderBy: { updatedAt: "desc" },
      });
      return {
        projects: allProjects.map((p) => ({
          ...p,
          myRole: "project_manager",
          rfiCount: p._count.rfis,
          memberCount: p._count.members,
          _count: undefined,
        })),
      };
    }

    // Regular users: show projects they're a member of OR they created
    const projectOrgWhere = ctx.user.organizationId ? { organizationId: ctx.user.organizationId } : {};

    // Get project IDs from memberships
    const memberships = await db.projectMember.findMany({
      where: {
        userId: ctx.user.id,
        project: projectOrgWhere,
      },
      select: {
        role: true,
        projectId: true,
        project: {
          include: {
            _count: { select: { rfis: true, members: true } },
          },
        },
      },
      orderBy: { project: { updatedAt: "desc" } },
    });

    // Also get projects the user created (in case they created one but
    // weren't auto-added as a member)
    const createdProjects = await db.project.findMany({
      where: {
        createdById: ctx.user.id,
        ...projectOrgWhere,
        id: { notIn: memberships.map((m) => m.projectId) },
      },
      include: {
        _count: { select: { rfis: true, members: true } },
      },
      orderBy: { updatedAt: "desc" },
    });

    const memberProjects = memberships.map((m) => ({
      ...m.project,
      myRole: m.role,
      rfiCount: m.project._count.rfis,
      memberCount: m.project._count.members,
      _count: undefined,
    }));

    const creatorProjects = createdProjects.map((p) => ({
      ...p,
      myRole: "project_manager",
      rfiCount: p._count.rfis,
      memberCount: p._count.members,
      _count: undefined,
    }));

    return { projects: [...memberProjects, ...creatorProjects] };
  }),

  /** Get a single project. */
  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const role = await assertProjectMember(ctx.user, input.id);
      const project = await db.project.findUnique({
        where: { id: input.id },
        include: {
          members: {
            include: {
              user: { select: { id: true, name: true, email: true, role: true } },
            },
          },
          _count: { select: { rfis: true } },
        },
      });
      if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found." });

      return { project, myRole: role };
    }),

  /** Create a project. */
  create: protectedProcedure
    .input(CreateProjectSchema)
    .mutation(async ({ ctx, input }) => {
      // Super admins must have an org to create projects (prevent orphan projects)
      if (isOrgAdmin(ctx.user) && !ctx.user.organizationId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Super admins must join an organization before creating projects." });
      }

      const existing = await db.project.findFirst({
        where: { code: input.code, organizationId: ctx.user.organizationId ?? null },
        select: { id: true },
      });
      if (existing) {
        throw new TRPCError({ code: "CONFLICT", message: "Project code already exists." });
      }

      const project = await db.$transaction(async (tx) => {
        const proj = await tx.project.create({
          data: {
            name: input.name,
            code: input.code,
            client: input.client,
            location: input.location,
            contractValue: input.contractValue,
            startDate: input.startDate ? new Date(input.startDate) : null,
            endDate: input.endDate ? new Date(input.endDate) : null,
            description: input.description,
            createdById: ctx.user.id,
            organizationId: ctx.user.organizationId, // Auto-assign to user's org
            members: {
              create: { userId: ctx.user.id, role: "project_manager" },
            },
          },
        });

        // Auto-create the three analysis libraries
        const libs = [
          { name: "Client's Estimate", purpose: "client_estimate" as const, isDefault: true },
          { name: "Contractor Bid", purpose: "contractor_bid" as const, isDefault: false },
          { name: "Contractor's Actual", purpose: "contractor_actual" as const, isDefault: false },
        ];
        for (const lib of libs) {
          await tx.analysisLibrary.create({
            data: {
              projectId: proj.id,
              name: lib.name,
              purpose: lib.purpose,
              isDefault: lib.isDefault,
            },
          });
        }

        return proj;
      });

      await audit({
        userId: ctx.user.id,
        projectId: project.id,
        action: "project.create",
        entityType: "project",
        entityId: project.id,
        metadata: { code: project.code, name: project.name },
      });

      return { project };
    }),

  /** Update project basic info or status. */
  update: protectedProcedure
    .input(UpdateProjectSchema)
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      const role = await assertProjectMember(ctx.user, id);

      // All project metadata (name, client, contractValue, dates, status,
      // description, cost rate overrides) is admin-tier — only project
      // managers and coordinators may change any of it. Read-only roles
      // (engineer, client, inspector) cannot mutate project fields.
      if (role !== "project_manager" && role !== "coordinator") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only Project Manager or Coordinator can update project details.",
        });
      }

      const project = await db.project.update({
        where: { id },
        data: {
          ...(data.name !== undefined && { name: data.name }),
          ...(data.client !== undefined && { client: data.client }),
          ...(data.location !== undefined && { location: data.location }),
          ...(data.contractValue !== undefined && { contractValue: data.contractValue }),
          ...(data.startDate !== undefined && { startDate: data.startDate ? new Date(data.startDate) : null }),
          ...(data.endDate !== undefined && { endDate: data.endDate ? new Date(data.endDate) : null }),
          ...(data.status !== undefined && { status: data.status }),
          ...(data.description !== undefined && { description: data.description }),
          // Cost rate overrides (null = use default)
          ...(data.skilledWageRate !== undefined && { skilledWageRate: data.skilledWageRate }),
          ...(data.unskilledWageRate !== undefined && { unskilledWageRate: data.unskilledWageRate }),
          ...(data.supervisorWageRate !== undefined && { supervisorWageRate: data.supervisorWageRate }),
          ...(data.ownedEquipRate !== undefined && { ownedEquipRate: data.ownedEquipRate }),
          ...(data.hiredEquipRate !== undefined && { hiredEquipRate: data.hiredEquipRate }),
          ...(data.fuelPricePerLiter !== undefined && { fuelPricePerLiter: data.fuelPricePerLiter }),
        },
      });

      await audit({
        userId: ctx.user.id,
        projectId: id,
        action: "project.update",
        entityType: "project",
        entityId: id,
        metadata: data,
      });

      return { project };
    }),

  /** Soft-archive a project. */
  archive: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertProjectManager(ctx.user, input.id);

      const project = await db.project.update({
        where: { id: input.id },
        data: { status: "archived" },
      });

      await audit({
        userId: ctx.user.id,
        projectId: input.id,
        action: "project.archive",
        entityType: "project",
        entityId: input.id,
      });

      return { project };
    }),

  /** List project members. */
  listMembers: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertProjectAdmin(ctx.user, input.projectId);
      const members = await db.projectMember.findMany({
        where: { projectId: input.projectId },
        include: {
          user: { select: { id: true, name: true, email: true, role: true } },
        },
        orderBy: { createdAt: "asc" },
      });
      return { members };
    }),

  /** Add project member. */
  addMember: protectedProcedure
    .input(AddMemberSchema)
    .mutation(async ({ ctx, input }) => {
      await assertProjectAdmin(ctx.user, input.projectId);

      // Fetch the project so we can verify the new member belongs to the
      // same organization as the project.
      const project = await db.project.findUnique({
        where: { id: input.projectId },
        select: { organizationId: true },
      });
      if (!project) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Project not found." });
      }

      let member = await db.user.findUnique({ where: { email: input.email } });
      if (member) {
        // Cross-organization membership is not allowed.
        if (member.organizationId !== project.organizationId) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "User belongs to a different organization.",
          });
        }
      } else {
        const tempPassword = Math.random().toString(36).slice(-12);
        member = await db.user.create({
          data: {
            email: input.email,
            name: input.name || input.email.split("@")[0],
            role: input.role,
            passwordHash: await bcrypt.hash(tempPassword, 12),
            organizationId: project.organizationId, // Inherit project's org
            orgRole: "member",
          },
        });
      }

      const existing = await db.projectMember.findUnique({
        where: { projectId_userId: { projectId: input.projectId, userId: member.id } },
      });
      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "User is already a member of this project.",
        });
      }

      const membership = await db.projectMember.create({
        data: { projectId: input.projectId, userId: member.id, role: input.role },
        include: { user: { select: { id: true, name: true, email: true, role: true } } },
      });

      await audit({
        userId: ctx.user.id,
        projectId: input.projectId,
        action: "project.member.add",
        entityType: "project",
        entityId: input.projectId,
        metadata: { email: input.email, role: input.role },
      });

      return { member: membership };
    }),

  /** Update project member role. */
  updateMember: protectedProcedure
    .input(UpdateMemberSchema)
    .mutation(async ({ ctx, input }) => {
      await assertProjectAdmin(ctx.user, input.projectId);

      const membership = await db.projectMember.findUnique({
        where: { id: input.memberId },
        select: { userId: true, projectId: true },
      });
      if (!membership || membership.projectId !== input.projectId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Member not found." });
      }

      const updated = await db.projectMember.update({
        where: { id: input.memberId },
        data: { role: input.role },
        include: { user: { select: { id: true, name: true, email: true, role: true } } },
      });

      await audit({
        userId: ctx.user.id,
        projectId: input.projectId,
        action: "project.member.update",
        entityType: "project",
        entityId: input.projectId,
        metadata: { email: updated.user.email, role: input.role },
      });

      return { member: updated };
    }),

  /** Remove project member. */
  removeMember: protectedProcedure
    .input(z.object({ projectId: z.string(), memberId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertProjectAdmin(ctx.user, input.projectId);

      const membership = await db.projectMember.findUnique({
        where: { id: input.memberId },
        select: { userId: true, projectId: true },
      });
      if (!membership || membership.projectId !== input.projectId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Member not found." });
      }

      if (membership.userId === ctx.user.id) {
        const pmCount = await db.projectMember.count({
          where: { projectId: input.projectId, role: "project_manager" },
        });
        if (pmCount <= 1) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Cannot remove the last project manager.",
          });
        }
      }

      await db.projectMember.delete({ where: { id: input.memberId } });

      await audit({
        userId: ctx.user.id,
        projectId: input.projectId,
        action: "project.member.remove",
        entityType: "project",
        entityId: input.projectId,
        metadata: { userId: membership.userId },
      });

      return { ok: true };
    }),

  /** Lock or unlock the BOQ of a project. */
  lockBoq: protectedProcedure
    .input(z.object({ projectId: z.string(), locked: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await assertProjectAdmin(ctx.user, input.projectId);
      const project = await db.project.update({
        where: { id: input.projectId },
        data: { boqLocked: input.locked },
      });
      await audit({
        userId: ctx.user.id,
        projectId: input.projectId,
        action: input.locked ? "project.boq.lock" : "project.boq.unlock",
        entityType: "project",
        entityId: input.projectId,
        metadata: { code: project.code },
      });
      return { success: true, project };
    }),

  // ─── Org Admin: User Management ────────────────────────────
  // Org admins can create/manage users within their own organization.
  // Super admins can manage users across all organizations.

  /** List all users in the current user's organization */
  listOrgUsers: protectedProcedure
    .query(async ({ ctx }) => {
      if (!ctx.user.organizationId) {
        return { users: [] };
      }
      const users = await db.user.findMany({
        where: { organizationId: ctx.user.organizationId },
        orderBy: { createdAt: "desc" },
        select: {
          id: true, email: true, name: true, role: true,
          orgRole: true, createdAt: true,
        },
      });
      return { users };
    }),

  /** Create a new user within the current user's organization (org admin only) */
  createOrgUser: protectedProcedure
    .input(z.object({
      name: z.string().min(1),
      email: z.string().email().toLowerCase(),
      password: z.string().min(8),
      role: z.enum(["project_manager", "engineer", "coordinator", "client", "inspector"]),
    }))
    .mutation(async ({ ctx, input }) => {
      // Must have an org
      if (!ctx.user.organizationId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You don't belong to an organization." });
      }
      // Must be org admin or super admin
      if (ctx.user.orgRole !== "org_admin" && !isOrgAdmin(ctx.user)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only organization admins can create users." });
      }

      // Check email not taken
      const existing = await db.user.findUnique({ where: { email: input.email } });
      if (existing) {
        throw new TRPCError({ code: "CONFLICT", message: "Email already registered." });
      }

      const bcrypt = await import("bcryptjs");
      const user = await db.user.create({
        data: {
          email: input.email,
          name: input.name,
          passwordHash: await bcrypt.hash(input.password, 12),
          role: input.role,
          organizationId: ctx.user.organizationId,
          orgRole: "member",
        },
      });

      await audit({
        userId: ctx.user.id,
        projectId: undefined,
        action: "org.user.create",
        entityType: "user",
        entityId: user.id,
        metadata: { email: input.email, name: input.name, role: input.role },
      });

      return { user: { id: user.id, email: user.email, name: user.name, role: user.role } };
    }),

  /** Update a user's role within the org (org admin only) */
  updateOrgUserRole: protectedProcedure
    .input(z.object({
      userId: z.string(),
      role: z.enum(["project_manager", "engineer", "coordinator", "client", "inspector"]),
    }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.orgRole !== "org_admin" && !isOrgAdmin(ctx.user)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only organization admins can change roles." });
      }

      // Verify target user is in the same org
      const target = await db.user.findUnique({ where: { id: input.userId } });
      if (!target || (target.organizationId !== ctx.user.organizationId && !isOrgAdmin(ctx.user))) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found." });
      }

      await db.user.update({
        where: { id: input.userId },
        data: { role: input.role },
      });

      await audit({
        userId: ctx.user.id,
        projectId: undefined,
        action: "org.user.update_role",
        entityType: "user",
        entityId: input.userId,
        metadata: { oldRole: target.role, newRole: input.role },
      });

      return { ok: true };
    }),

  /** Reset a user's password (org admin only) */
  resetOrgUserPassword: protectedProcedure
    .input(z.object({
      userId: z.string(),
      newPassword: z.string().min(8),
    }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.orgRole !== "org_admin" && !isOrgAdmin(ctx.user)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only organization admins can reset passwords." });
      }

      const target = await db.user.findUnique({ where: { id: input.userId } });
      if (!target || (target.organizationId !== ctx.user.organizationId && !isOrgAdmin(ctx.user))) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found." });
      }

      const bcrypt = await import("bcryptjs");
      await db.user.update({
        where: { id: input.userId },
        data: { passwordHash: await bcrypt.hash(input.newPassword, 12) },
      });
      // Kill all sessions
      await db.session.deleteMany({ where: { userId: input.userId } });

      await audit({
        userId: ctx.user.id,
        projectId: undefined,
        action: "org.user.reset_password",
        entityType: "user",
        entityId: input.userId,
        metadata: { email: target.email },
      });

      return { ok: true };
    }),

  /** Remove a user from the org (org admin only — deactivates, doesn't delete) */
  removeOrgUser: protectedProcedure
    .input(z.object({ userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.orgRole !== "org_admin" && !isOrgAdmin(ctx.user)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only organization admins can remove users." });
      }
      if (input.userId === ctx.user.id) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "You cannot remove yourself." });
      }

      const target = await db.user.findUnique({ where: { id: input.userId } });
      if (!target || (target.organizationId !== ctx.user.organizationId && !isOrgAdmin(ctx.user))) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found." });
      }

      // Deactivate instead of delete (preserve data integrity)
      await db.user.update({
        where: { id: input.userId },
        data: { deactivatedAt: new Date(), deactivatedReason: "Removed by org admin" },
      });
      await db.session.deleteMany({ where: { userId: input.userId } });

      await audit({
        userId: ctx.user.id,
        projectId: undefined,
        action: "org.user.remove",
        entityType: "user",
        entityId: input.userId,
        metadata: { email: target.email },
      });

      return { ok: true };
    }),
});
