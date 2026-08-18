import { isOrgAdmin } from "@/lib/authz";
/**
 * tRPC router for Report Templates — saved PDF layouts for the cell-based designer.
 *
 * Templates can be scoped as:
 *   - "global"     : visible to everyone in the org (org-wide standard)
 *   - "project"    : visible only within one project
 *   - "user"       : private to the user who created it
 *
 * Each template stores a JSON layout (cells with positions, content, styling)
 * and is tagged with an entityType ("daily_report", "rfi", "boq", ...) so the
 * token sidebar in the designer knows which tokens are valid.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "@/server/trpc";
import { db } from "@/lib/db";
import { assertProjectMember, assertProjectManager } from "@/lib/authz";
import { audit } from "@/lib/audit";

const CreateTemplateSchema = z.object({
  name: z.string().min(1).max(200),
  entityType: z.string().min(1),
  scope: z.enum(["global", "organization", "project", "user"]).default("user"),
  projectId: z.string().optional(),
  layout: z.string(), // JSON string
  isDefault: z.boolean().default(false),
});

const UpdateTemplateSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(200).optional(),
  layout: z.string().optional(),
  isDefault: z.boolean().optional(),
});

export const reportTemplateRouter = router({
  /**
   * List templates visible to the current user for a given entityType + optional project.
   * Returns global + org + project + user-scoped templates, merged.
   */
  list: protectedProcedure
    .input(z.object({
      entityType: z.string(),
      projectId: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      // If projectId provided, ensure user is a member
      if (input.projectId) {
        await assertProjectMember(ctx.user, input.projectId);
      }

      const where = {
        entityType: input.entityType,
        OR: [
          { scope: "global" },
          ...(ctx.user.organizationId ? [{ scope: "global", organizationId: ctx.user.organizationId }] : []),
          ...(ctx.user.organizationId ? [{ scope: "organization", organizationId: ctx.user.organizationId }] : []),
          ...(input.projectId ? [{ scope: "project", projectId: input.projectId }] : []),
          { scope: "user", ownerId: ctx.user.id },
        ],
      };

      const templates = await db.reportTemplate.findMany({
        where,
        orderBy: [
          { isDefault: "desc" },
          { name: "asc" },
        ],
        include: {
          owner: { select: { id: true, name: true } },
        },
      });

      return { templates };
    }),

  /** Get a single template by ID (must be visible to the user). */
  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const tpl = await db.reportTemplate.findUnique({
        where: { id: input.id },
        include: { owner: { select: { id: true, name: true } } },
      });
      if (!tpl) throw new TRPCError({ code: "NOT_FOUND", message: "Template not found." });

      // Visibility check
      const isVisible =
        tpl.scope === "global" ||
        (tpl.scope === "organization" && tpl.organizationId === ctx.user.organizationId) ||
        (tpl.scope === "project" && tpl.projectId != null && await canSeeProject(ctx.user.id, tpl.projectId)) ||
        (tpl.scope === "user" && tpl.ownerId === ctx.user.id);
      if (!isVisible) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You don't have access to this template." });
      }
      return { template: tpl };
    }),

  /** Create a new template. */
  create: protectedProcedure
    .input(CreateTemplateSchema)
    .mutation(async ({ ctx, input }) => {
      // Project scope requires project membership
      if (input.scope === "project" && input.projectId) {
        await assertProjectMember(ctx.user, input.projectId);
      }
      // Global / organization scope requires PM role on at least one project (or super admin)
      if (input.scope === "global" || input.scope === "organization") {
        if (!isOrgAdmin(ctx.user) && ctx.user.orgRole !== "org_admin") {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Only organization admins can create global/organization templates.",
          });
        }
      }

      const tpl = await db.reportTemplate.create({
        data: {
          name: input.name,
          entityType: input.entityType,
          scope: input.scope,
          projectId: input.scope === "project" ? input.projectId : null,
          ownerId: ctx.user.id,
          organizationId: ctx.user.organizationId,
          layout: input.layout,
          isDefault: input.isDefault,
        },
      });

      await audit({
        userId: ctx.user.id,
        projectId: input.projectId,
        action: "report_template.create",
        entityType: "report_template",
        entityId: tpl.id,
        metadata: { name: tpl.name, entityType: tpl.entityType, scope: tpl.scope },
      });

      return { template: tpl };
    }),

  /** Update an existing template. */
  update: protectedProcedure
    .input(UpdateTemplateSchema)
    .mutation(async ({ ctx, input }) => {
      const existing = await db.reportTemplate.findUnique({ where: { id: input.id } });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Template not found." });

      // Only owner, project PM, or org admin can edit
      const canEdit =
        existing.ownerId === ctx.user.id ||
        isOrgAdmin(ctx.user) ||
        ctx.user.orgRole === "org_admin" ||
        (existing.projectId && await isProjectManager(ctx.user.id, existing.projectId));
      if (!canEdit) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You can only edit templates you own." });
      }

      const updated = await db.reportTemplate.update({
        where: { id: input.id },
        data: {
          ...(input.name !== undefined && { name: input.name }),
          ...(input.layout !== undefined && { layout: input.layout }),
          ...(input.isDefault !== undefined && { isDefault: input.isDefault }),
        },
      });

      return { template: updated };
    }),

  /** Delete a template. */
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await db.reportTemplate.findUnique({ where: { id: input.id } });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Template not found." });

      const canDelete =
        existing.ownerId === ctx.user.id ||
        isOrgAdmin(ctx.user) ||
        ctx.user.orgRole === "org_admin" ||
        (existing.projectId && await isProjectManager(ctx.user.id, existing.projectId));
      if (!canDelete) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You can only delete templates you own." });
      }

      await db.reportTemplate.delete({ where: { id: input.id } });
      return { ok: true };
    }),

  /** List all global templates (super admin). */
  listGlobal: protectedProcedure
    .query(async () => {
      const templates = await db.reportTemplate.findMany({
        where: { scope: "global" },
        orderBy: [{ isDefault: "desc" }, { name: "asc" }],
        include: { owner: { select: { id: true, name: true } } },
      });
      return { templates };
    }),
});

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

async function canSeeProject(userId: string, projectId: string): Promise<boolean> {
  const m = await db.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
    select: { id: true },
  });
  return !!m;
}

async function isProjectManager(userId: string, projectId: string): Promise<boolean> {
  const m = await db.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
    select: { role: true },
  });
  return m?.role === "project_manager" || m?.role === "coordinator";
}
