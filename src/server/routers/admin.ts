/**
 * Platform admin router — cross-organization management for the superadmin.
 *
 * Every procedure requires `ctx.user.isSuperAdmin`. The superadmin is seeded
 * via /api/setup (SETUP_SECRET) and can also be granted/revoked from this
 * console via `admin.updateUser` (isSuperAdmin flag).
 *
 * Scope: organizations + users management (no billing/trials — those are out
 * of scope for this build).
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "@/server/trpc";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { hashPassword } from "@/lib/auth";
import { ensureSchema } from "@/lib/ensure-schema";
import { Prisma } from "@prisma/client";

const ROLES = ["project_manager", "engineer", "coordinator", "client", "inspector"] as const;

/** Middleware: only platform superadmins may use these procedures. */
const superAdminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!ctx.user?.isSuperAdmin) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Superadmin access required." });
  }
  return next({ ctx });
});

/** Derive a unique org code from a display name. */
async function generateOrgCode(name: string): Promise<string> {
  const base = name
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 30) || "ORG";
  let code = base;
  let suffix = 1;
  while (await db.organization.findUnique({ where: { code } })) {
    code = `${base}-${suffix++}`;
  }
  return code;
}

export const adminRouter = router({
  // ── Dashboard stats ───────────────────────────────────────────
  stats: superAdminProcedure.query(async () => {
    const [orgCount, userCount, activeUsers] = await Promise.all([
      db.organization.count(),
      db.user.count(),
      db.user.count({ where: { deactivatedAt: null } }),
    ]);
    return { orgCount, userCount, activeUsers };
  }),

  // ── Organizations ─────────────────────────────────────────────
  listOrganizations: superAdminProcedure
    .input(
      z
        .object({ search: z.string().optional(), take: z.number().min(1).max(100).default(50), skip: z.number().min(0).default(0) })
        .default({ take: 50, skip: 0 }),
    )
    .query(async ({ input }) => {
      const where: Prisma.OrganizationWhereInput = input.search
        ? { OR: [{ name: { contains: input.search, mode: "insensitive" as const } }, { code: { contains: input.search, mode: "insensitive" as const } }] }
        : {};
      const [orgs, total] = await Promise.all([
        db.organization.findMany({
          where,
          orderBy: { createdAt: "desc" },
          take: input.take,
          skip: input.skip,
          include: { _count: { select: { users: true, projects: true } } },
        }),
        db.organization.count({ where }),
      ]);
      return { orgs, total };
    }),

  createOrganization: superAdminProcedure
    .input(
      z.object({
        name: z.string().min(1),
        code: z.string().optional(),
        status: z.string().default("active"),
        // Optional initial org-admin account
        adminName: z.string().optional(),
        adminEmail: z.string().email().optional(),
        adminPassword: z.string().min(8).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const code = input.code?.trim() || (await generateOrgCode(input.name));
      const org = await db.organization.create({
        data: { name: input.name, code, status: input.status },
      });

      let adminUser: { id: string; email: string } | null = null;
      if (input.adminEmail && input.adminName && input.adminPassword) {
        const existing = await db.user.findUnique({ where: { email: input.adminEmail.toLowerCase() } });
        if (existing) {
          throw new TRPCError({ code: "CONFLICT", message: "Admin email already registered." });
        }
        const user = await db.user.create({
          data: {
            email: input.adminEmail.toLowerCase(),
            name: input.adminName,
            passwordHash: await hashPassword(input.adminPassword),
            role: "project_manager",
            orgRole: "org_admin",
            organizationId: org.id,
          },
        });
        adminUser = { id: user.id, email: user.email };
      }

      await audit({ userId: ctx.user.id, action: "admin.org.create", entityType: "organization", entityId: org.id, metadata: { name: org.name, code: org.code } });
      return { org, adminUser };
    }),

  updateOrganization: superAdminProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).optional(),
        status: z.string().optional(),
        logoUrl: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      const org = await db.organization.update({ where: { id }, data });
      await audit({ userId: ctx.user.id, action: "admin.org.update", entityType: "organization", entityId: id, metadata: data });
      return { org };
    }),

  // ── Users (cross-org) ─────────────────────────────────────────
  listUsers: superAdminProcedure
    .input(
      z
        .object({
          search: z.string().optional(),
          organizationId: z.string().optional(),
          take: z.number().min(1).max(100).default(50),
          skip: z.number().min(0).default(0),
        })
        .default({ take: 50, skip: 0 }),
    )
    .query(async ({ input }) => {
      const where: Prisma.UserWhereInput = {};
      if (input.organizationId) where.organizationId = input.organizationId;
      if (input.search) {
        where.OR = [
          { name: { contains: input.search, mode: "insensitive" as const } },
          { email: { contains: input.search, mode: "insensitive" as const } },
        ];
      }
      const [users, total] = await Promise.all([
        db.user.findMany({
          where,
          orderBy: { createdAt: "desc" },
          take: input.take,
          skip: input.skip,
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            orgRole: true,
            isSuperAdmin: true,
            deactivatedAt: true,
            createdAt: true,
            organization: { select: { id: true, name: true, code: true } },
          },
        }),
        db.user.count({ where }),
      ]);
      return { users, total };
    }),

  createUser: superAdminProcedure
    .input(
      z.object({
        name: z.string().min(1),
        email: z.string().email().toLowerCase(),
        password: z.string().min(8),
        role: z.enum(ROLES),
        organizationId: z.string().nullable().optional(),
        orgRole: z.enum(["org_admin", "member"]).default("member"),
        isSuperAdmin: z.boolean().default(false),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await db.user.findUnique({ where: { email: input.email } });
      if (existing) throw new TRPCError({ code: "CONFLICT", message: "Email already registered." });

      if (input.organizationId) {
        const org = await db.organization.findUnique({ where: { id: input.organizationId } });
        if (!org) throw new TRPCError({ code: "NOT_FOUND", message: "Organization not found." });
      }

      const user = await db.user.create({
        data: {
          email: input.email,
          name: input.name,
          passwordHash: await hashPassword(input.password),
          role: input.role,
          organizationId: input.organizationId ?? null,
          orgRole: input.orgRole,
          isSuperAdmin: input.isSuperAdmin,
        },
      });
      await audit({ userId: ctx.user.id, action: "admin.user.create", entityType: "user", entityId: user.id, metadata: { email: user.email, orgRole: user.orgRole, isSuperAdmin: user.isSuperAdmin } });
      return { user: { id: user.id, email: user.email } };
    }),

  // Run the baseline schema migration (server-side; no SETUP_SECRET needed).
  runDbSetup: superAdminProcedure.mutation(async () => {
    return ensureSchema();
  }),

  listAuditLogs: superAdminProcedure
    .input(z.object({ take: z.number().min(1).max(200).default(100) }).default({ take: 100 }))
    .query(async ({ input }) => {
      return db.auditLog.findMany({
        orderBy: { createdAt: "desc" },
        take: input.take,
        include: { user: { select: { name: true, email: true } } },
      });
    }),

  updateUser: superAdminProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().optional(),
        role: z.enum(ROLES).optional(),
        orgRole: z.enum(["org_admin", "member"]).optional(),
        organizationId: z.string().nullable().optional(),
        isSuperAdmin: z.boolean().optional(),
        deactivatedAt: z.boolean().optional(), // true = deactivate, false = reactivate
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, deactivatedAt, ...rest } = input;
      const target = await db.user.findUnique({ where: { id } });
      if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "User not found." });

      const data: Prisma.UserUpdateInput = {};
      if (rest.name !== undefined) data.name = rest.name;
      if (rest.role !== undefined) data.role = rest.role;
      if (rest.orgRole !== undefined) data.orgRole = rest.orgRole;
      if (rest.organizationId !== undefined) {
        data.organization = rest.organizationId
          ? { connect: { id: rest.organizationId } }
          : { disconnect: true };
      }
      if (rest.isSuperAdmin !== undefined) data.isSuperAdmin = rest.isSuperAdmin;
      if (deactivatedAt === true) data.deactivatedAt = new Date();
      if (deactivatedAt === false) data.deactivatedAt = null;

      const user = await db.user.update({ where: { id }, data });
      if (user.deactivatedAt) {
        await db.session.deleteMany({ where: { userId: id } });
      }
      await audit({ userId: ctx.user.id, action: "admin.user.update", entityType: "user", entityId: id, metadata: { ...rest, deactivated: deactivatedAt } });
      return { user: { id: user.id, email: user.email, isSuperAdmin: user.isSuperAdmin, orgRole: user.orgRole } };
    }),
});
