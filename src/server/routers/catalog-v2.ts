/**
 * Unified Catalog Router (v2)
 *
 * Single router for CatalogMaterial + CatalogRate with scope-based authorization.
 * Replaces: global-material-catalog, material-catalog, material-catalog-sync,
 *           material-catalog-cleanup, material-catalog-unrecognized, org-material-entry,
 *           uncataloged-material, rate-catalog, rate-catalog-sync, rate-catalog-items,
 *           rate-catalog-org, project-rate
 *
 * Rules:
 * - Global scope: superadmin-only CRUD
 * - Org scope: org_admin can CRUD, members can read
 * - Project scope: project members can read, managers+ can write
 * - Rate catalogs reference materials at the SAME scope only
 * - Import = copy material + rate together, idempotent (no duplicates)
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "@/server/trpc";
import { db } from "@/lib/db";
import { isOrgAdmin } from "@/lib/authz";

const normalize = (s: string) =>
  s.toLowerCase().trim().replace(/[,.()\-]/g, " ").replace(/\s+/g, " ");

// ── Authorization helpers ──────────────────────────────────────────────────────

async function assertGlobalAdmin(ctx: { user: any }) {
  if (!ctx.user.isSuperAdmin) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Superadmin access required." });
  }
}

async function assertOrgAdmin(ctx: { user: any }, orgId: string) {
  const isOrgAdm =
    ctx.user.orgRole === "org_admin" ||
    isOrgAdmin(ctx.user) ||
    ctx.user.isSuperAdmin;
  if (!isOrgAdm) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Org admin access required." });
  }
  // Cross-org check: a non-superadmin can only manage their own org.
  if (ctx.user.organizationId && ctx.user.organizationId !== orgId && !ctx.user.isSuperAdmin) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Cannot modify another organization's catalog." });
  }
}

async function assertProjectMember(ctx: { user: any }, projectId: string) {
  const membership = await db.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId: ctx.user.id } },
  });
  if (!membership && !ctx.user.isSuperAdmin) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Not a member of this project." });
  }
  return membership;
}

async function assertProjectWriter(ctx: { user: any }, projectId: string) {
  const membership = await assertProjectMember(ctx, projectId);
  const role = membership?.role ?? "";
  const canWrite =
    ["project_manager", "engineer", "coordinator"].includes(role) ||
    ctx.user.isSuperAdmin;
  if (!canWrite) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Write access required." });
  }
  return membership;
}

/**
 * Verify that the caller belongs to the specified org (or is a superadmin).
 * Used for READ procedures that accept client-supplied organizationId —
 * without this check, any authenticated user could query any org's data
 * by passing a different orgId.
 */
function assertOrgMember(ctx: { user: any }, orgId: string | null | undefined) {
  if (!orgId) return;
  if (ctx.user.isSuperAdmin) return;
  if (ctx.user.organizationId !== orgId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "You can only access your own organization's data." });
  }
}

// ── Router ─────────────────────────────────────────────────────────────────────

export const catalogV2Router = router({
  // ── Material CRUD ──────────────────────────────────────────────────────────

  /** List materials by scope */
  listMaterials: protectedProcedure
    .input(
      z.object({
        scope: z.enum(["global", "org", "project"]),
        organizationId: z.string().optional(),
        projectId: z.string().optional(),
        resourceType: z.enum(["material", "labor", "equipment"]).optional(),
        search: z.string().optional(),
        category: z.string().optional(),
        activeOnly: z.boolean().default(true),
        limit: z.number().min(1).max(500).default(100),
      })
    )
    .query(async ({ ctx, input }) => {
      const where: any = { scope: input.scope };
      if (input.activeOnly) where.isActive = true;
      if (input.resourceType) where.resourceType = input.resourceType;

      if (input.scope === "global") {
        where.organizationId = null;
        where.projectId = null;
      } else if (input.scope === "org") {
        const orgId = input.organizationId ?? ctx.user.organizationId;
        if (!orgId) throw new TRPCError({ code: "BAD_REQUEST", message: "Organization ID required." });
        // Cross-org guard: verify caller belongs to this org.
        assertOrgMember(ctx, orgId);
        where.organizationId = orgId;
        where.projectId = null;
      } else {
        if (!input.projectId) throw new TRPCError({ code: "BAD_REQUEST", message: "Project ID required." });
        // Project-scoped read: verify membership.
        await assertProjectMember(ctx, input.projectId);
        where.projectId = input.projectId;
      }

      if (input.search) {
        const q = normalize(input.search);
        where.OR = [
          { name: { contains: q, mode: "insensitive" } },
          { normalizedName: { contains: q, mode: "insensitive" } },
          { code: { contains: q, mode: "insensitive" } },
          { aliases: { has: q } },
        ];
      }
      if (input.category) where.category = input.category;

      const materials = await db.catalogMaterial.findMany({
        where,
        orderBy: [{ category: "asc" }, { name: "asc" }],
        take: input.limit,
      });

      return { materials };
    }),

  /** Get catalog 3-tier hierarchy (Categories -> Subcategories -> Specs/Items) */
  getCatalogTaxonomy: protectedProcedure
    .input(
      z.object({
        scope: z.enum(["global", "org", "project"]).default("global"),
        projectId: z.string().optional(),
        organizationId: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const where: any = { isActive: true };
      if (input.scope === "global") {
        where.scope = "global";
      } else if (input.scope === "org") {
        const orgId = ctx.user.isSuperAdmin && input.organizationId ? input.organizationId : ctx.user.organizationId;
        assertOrgMember(ctx, orgId);
        where.scope = "org";
        where.organizationId = orgId;
      } else if (input.scope === "project" && input.projectId) {
        await assertProjectMember(ctx, input.projectId);
        where.scope = "project";
        where.projectId = input.projectId;
      }

      const items = await db.catalogMaterial.findMany({
        where,
        select: {
          id: true,
          name: true,
          category: true,
          subCategory: true,
          defaultUnit: true,
          defaultRate: true,
        },
        orderBy: [{ category: "asc" }, { subCategory: "asc" }, { name: "asc" }],
      });

      // Build hierarchical tree:
      // Tier 1: Category (e.g. "Cement", "Steel & Reinforcement", "Aggregates & Sand")
      // Tier 2: Material Name (e.g. "Ordinary Portland Cement (OPC)", "Pozzolana Portland Cement (PPC)", "TMT Steel Bar")
      // Tier 3: Specification / Grade (e.g. "53 Grade", "43 Grade", "12mm dia", "20mm down")
      const categoriesMap: Record<string, Record<string, Array<{ id: string; name: string; spec: string; unit: string; rate: number }>>> = {};

      for (const item of items) {
        const cat = item.category || "General Materials";
        const matName = item.name || "Standard Material";
        const specName = item.subCategory || item.name;

        if (!categoriesMap[cat]) categoriesMap[cat] = {};
        if (!categoriesMap[cat][matName]) categoriesMap[cat][matName] = [];

        categoriesMap[cat][matName].push({
          id: item.id,
          name: matName,
          spec: specName,
          unit: item.defaultUnit || "pcs",
          rate: item.defaultRate || 0,
        });
      }

      return { taxonomy: categoriesMap };
    }),

  /** Get a single material with its rate entries */
  getMaterial: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const material = await db.catalogMaterial.findUnique({
        where: { id: input.id },
        include: {
          rateEntries: { include: { rateBook: { select: { id: true, name: true, fiscalYear: true } } } },
          sourceMaterial: { select: { id: true, name: true, scope: true } },
        },
      });
      if (!material) throw new TRPCError({ code: "NOT_FOUND", message: "Material not found." });

      // SCOPING CHECK: verify the caller has access to this material's scope.
      // Global materials are readable by anyone. Org-scoped materials require
      // the caller to be in the same org. Project-scoped materials require
      // project membership. Without this, any user could read any org's or
      // project's material details by cuid — cross-tenant data leak.
      if (material.scope === "org" && material.organizationId) {
        assertOrgMember(ctx, material.organizationId);
      } else if (material.scope === "project" && material.projectId) {
        await assertProjectMember(ctx, material.projectId);
      }

      return { material };
    }),

  /** Create a material at a specific scope */
  createMaterial: protectedProcedure
    .input(
      z.object({
        scope: z.enum(["global", "org", "project"]),
        resourceType: z.enum(["material", "labor", "equipment"]).default("material"),
        organizationId: z.string().optional(),
        projectId: z.string().optional(),
        name: z.string().min(1).max(200),
        code: z.string().optional(),
        category: z.string().optional(),
        subCategory: z.string().optional(),
        defaultUnit: z.string().default(""),
        defaultRate: z.number().min(0).default(0),
        aliases: z.array(z.string()).default([]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Authorization
      if (input.scope === "global") {
        await assertGlobalAdmin(ctx);
      } else if (input.scope === "org") {
        const orgId = input.organizationId ?? ctx.user.organizationId;
        if (!orgId) throw new TRPCError({ code: "BAD_REQUEST", message: "Organization ID required." });
        await assertOrgAdmin(ctx, orgId);
      } else {
        if (!input.projectId) throw new TRPCError({ code: "BAD_REQUEST", message: "Project ID required." });
        await assertProjectWriter(ctx, input.projectId);
      }

      const baseNorm = normalize(input.name);
      const subNorm = input.subCategory?.trim() ? normalize(input.subCategory) : "";
      const compositeNorm = subNorm ? `${baseNorm} ${subNorm}` : baseNorm;
      const orgId = input.scope === "org" ? (input.organizationId ?? ctx.user.organizationId) : null;
      const projId = input.scope === "project" ? input.projectId : null;

      // Duplicate check: only reject if BOTH name AND specification/subCategory match
      const existing = await db.catalogMaterial.findFirst({
        where: {
          normalizedName: compositeNorm,
          organizationId: orgId,
          projectId: projId,
        },
      });
      if (existing) {
        const specLabel = existing.subCategory ? ` (${existing.subCategory})` : "";
        throw new TRPCError({
          code: "CONFLICT",
          message: `Material "${existing.name}${specLabel}" already exists at this scope.`,
        });
      }

      // Auto-link handling + uncataloged queue for org scope
      let sourceMaterialId: string | null = null;
      let shouldCreateUncataloged = false;
      if (input.scope === "org") {
        const globalMatch =
          (await db.catalogMaterial.findFirst({
            where: { normalizedName: compositeNorm, scope: "global", isActive: true },
          })) ||
          (await db.catalogMaterial.findFirst({
            where: { normalizedName: baseNorm, scope: "global", isActive: true },
          }));
        if (globalMatch) {
          sourceMaterialId = globalMatch.id;
        } else {
          shouldCreateUncataloged = true;
        }
      } else if (input.scope === "project" && projId) {
        // Project looks up parent org material or global material by exact composite name (name + specification)
        const project = await db.project.findUnique({ where: { id: projId }, select: { organizationId: true } });
        const orgIdForProject = project?.organizationId ?? orgId ?? ctx.user.organizationId;
        if (orgIdForProject) {
          const orgMatch = await db.catalogMaterial.findFirst({
            where: { normalizedName: compositeNorm, scope: "org", organizationId: orgIdForProject, isActive: true },
          });

          if (orgMatch) {
            sourceMaterialId = orgMatch.id;
          } else {
            // Check global match by exact composite name
            const globalMatch = await db.catalogMaterial.findFirst({
              where: { normalizedName: compositeNorm, scope: "global", isActive: true },
            });
            if (globalMatch) {
              sourceMaterialId = globalMatch.id;
            } else {
              // Custom project material / variant not in org or global catalog -> Queue for org governance review
              shouldCreateUncataloged = true;
            }
          }
        }
      }

      const material = await db.catalogMaterial.create({
        data: {
          scope: input.scope,
          resourceType: input.resourceType || "material",
          organizationId: orgId,
          projectId: projId,
          sourceMaterialId,
          name: input.name.trim(),
          normalizedName: compositeNorm,
          code: input.code?.trim() || null,
          category: input.category?.trim() || null,
          subCategory: input.subCategory?.trim() || null,
          defaultUnit: input.defaultUnit,
          defaultRate: input.defaultRate,
          aliases: input.aliases,
        },
      });

      // Auto-create operational Material row if project-scoped
      if (input.scope === "project" && projId) {
        try {
          await db.material.create({
            data: {
              projectId: projId,
              resourceType: input.resourceType || "material",
              name: input.name.trim(),
              subCategory: input.subCategory?.trim() || null,
              category: input.category?.trim() || "General",
              unit: input.defaultUnit || "each",
              catalogMaterialId: material.id,
            },
          });
        } catch (e) {
          console.error("Auto-sync to operational material table non-fatal error", e);
        }
      }

      // Auto-create rate entries in active rate books for this scope
      try {
        const rateBookWhere: any = { scope: input.scope, isActive: true };
        if (input.scope === "org") rateBookWhere.organizationId = orgId;
        if (input.scope === "project") rateBookWhere.projectId = projId;

        const rateBooks = await db.rateBook.findMany({ where: rateBookWhere });
        for (const rb of rateBooks) {
          const districts = rb.districts?.length ? rb.districts : ["Default"];
          for (const d of districts) {
            await db.rateEntry.upsert({
              where: {
                materialId_rateCatalogId_district: {
                  materialId: material.id,
                  rateCatalogId: rb.id,
                  district: d,
                },
              },
              create: {
                materialId: material.id,
                rateCatalogId: rb.id,
                district: d,
                rate: input.defaultRate || 0,
              },
              update: {},
            });
          }
        }
      } catch (e) {
        console.error("Auto-creation of rate entries in active rate books non-fatal error", e);
      }

      // Create uncataloged entry for admin review if item has no parent match
      if (shouldCreateUncataloged) {
        try {
          const targetOrgId = input.scope === "org" ? orgId : (await db.project.findUnique({ where: { id: projId! }, select: { organizationId: true } }))?.organizationId ?? ctx.user.organizationId;
          const targetLevel = input.scope === "org" ? "global" : "org";
          const fullName = input.name.trim() + (input.subCategory?.trim() ? ` (${input.subCategory.trim()})` : "");

          const existingUncat = await db.uncatalogedMaterial.findFirst({
            where: {
              normalizedName: compositeNorm,
              level: targetLevel,
              organizationId: targetLevel === "org" ? targetOrgId : null,
              status: "pending",
            },
          });

          if (existingUncat) {
            await db.uncatalogedMaterial.update({
              where: { id: existingUncat.id },
              data: { occurrenceCount: { increment: 1 } },
            });
          } else {
            await db.uncatalogedMaterial.create({
              data: {
                level: targetLevel,
                organizationId: targetLevel === "org" ? targetOrgId : null,
                sourceProjectId: projId || null,
                sourceType: input.scope === "project" ? "project_material" : "org_material",
                rawName: fullName,
                normalizedName: compositeNorm,
                unit: input.defaultUnit || null,
                category: input.category?.trim() || null,
                occurrenceCount: 1,
                status: "pending",
                suggestedMatchId: null,
              },
            });
          }
        } catch (e) {
          console.error("Failed to create uncataloged entry for material", e);
        }
      }

      return { material };
    }),

  /** Update a material (scope-appropriate fields only) */
  updateMaterial: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        resourceType: z.enum(["material", "labor", "equipment"]).optional(),
        name: z.string().min(1).max(200).optional(),
        code: z.string().optional(),
        category: z.string().optional(),
        subCategory: z.string().optional(),
        defaultUnit: z.string().optional(),
        defaultRate: z.number().min(0).optional(),
        isActive: z.boolean().optional(),
        aliases: z.array(z.string()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const material = await db.catalogMaterial.findUnique({ where: { id: input.id } });
      if (!material) throw new TRPCError({ code: "NOT_FOUND", message: "Material not found." });

      // Authorization
      if (material.scope === "global") {
        await assertGlobalAdmin(ctx);
      } else if (material.scope === "org") {
        await assertOrgAdmin(ctx, material.organizationId!);
      } else {
        await assertProjectWriter(ctx, material.projectId!);
      }

      const data: any = {};
      if (input.resourceType !== undefined) data.resourceType = input.resourceType;
      if (input.name !== undefined) {
        data.name = input.name.trim();
        data.normalizedName = normalize(input.name);
      }
      if (input.code !== undefined) data.code = input.code?.trim() || null;
      if (input.category !== undefined) data.category = input.category?.trim() || null;
      if (input.subCategory !== undefined) data.subCategory = input.subCategory?.trim() || null;
      if (input.defaultUnit !== undefined) data.defaultUnit = input.defaultUnit;
      if (input.defaultRate !== undefined) data.defaultRate = input.defaultRate;
      if (input.isActive !== undefined) data.isActive = input.isActive;
      if (input.aliases !== undefined) data.aliases = input.aliases;

      const updated = await db.catalogMaterial.update({ where: { id: input.id }, data });
      return { material: updated };
    }),

  /** Delete a material (soft-delete by setting isActive=false) */
  deleteMaterial: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const material = await db.catalogMaterial.findUnique({ where: { id: input.id } });
      if (!material) throw new TRPCError({ code: "NOT_FOUND", message: "Material not found." });

      if (material.scope === "global") {
        await assertGlobalAdmin(ctx);
      } else if (material.scope === "org") {
        await assertOrgAdmin(ctx, material.organizationId!);
      } else {
        await assertProjectWriter(ctx, material.projectId!);
      }

      // Check references
      const refCount = await db.rateEntry.count({ where: { materialId: input.id } });
      if (refCount > 0) {
        // Soft delete
        await db.catalogMaterial.update({ where: { id: input.id }, data: { isActive: false } });
        return { softDeleted: true, refCount };
      }

      // Hard delete if no references
      await db.catalogMaterial.delete({ where: { id: input.id } });
      return { hardDeleted: true };
    }),

  /** Bulk delete materials (soft or hard) */
  bulkDeleteMaterials: protectedProcedure
    .input(z.object({ ids: z.array(z.string()).min(1), force: z.boolean().default(false) }))
    .mutation(async ({ ctx, input }) => {
      let archived = 0;
      let hardDeleted = 0;
      let skipped = 0;
      for (const id of input.ids) {
        const material = await db.catalogMaterial.findUnique({ where: { id } });
        if (!material) { skipped++; continue; }
        if (material.scope === "global") await assertGlobalAdmin(ctx);
        else if (material.scope === "org") await assertOrgAdmin(ctx, material.organizationId!);
        else await assertProjectWriter(ctx, material.projectId!);

        const refCount = await db.rateEntry.count({ where: { materialId: id } });
        const hasRefs = refCount > 0;
        // Also check downstream catalogMaterialId refs
        const boqRefs = await db.boqIngredient.count({ where: { catalogMaterialId: id } });
        const hasAnyRefs = hasRefs || boqRefs > 0;

        if (input.force && !hasAnyRefs) {
          await db.catalogMaterial.delete({ where: { id } });
          hardDeleted++;
        } else {
          await db.catalogMaterial.update({ where: { id }, data: { isActive: false } });
          archived++;
        }
      }
      const mode = hardDeleted > 0 && archived > 0 ? "mixed" : hardDeleted > 0 ? "hard" : "archived";
      return { count: archived + hardDeleted, archived, hardDeleted, skipped, mode };
    }),

  /** Purge archived (hard delete all isActive=false) */
  purgeArchived: protectedProcedure
    .input(z.object({ scope: z.enum(["global", "org", "project"]).optional(), organizationId: z.string().optional(), projectId: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      // Only superAdmin for global purge, orgAdmin for org, projectWriter for project
      if (!input.scope || input.scope === "global") await assertGlobalAdmin(ctx);
      else if (input.scope === "org") await assertOrgAdmin(ctx, input.organizationId ?? ctx.user.organizationId!);
      else await assertProjectWriter(ctx, input.projectId!);

      const where: any = { isActive: false };
      if (input.scope) where.scope = input.scope;
      if (input.organizationId) where.organizationId = input.organizationId;
      if (input.projectId) where.projectId = input.projectId;

      const archived = await db.catalogMaterial.findMany({ where, select: { id: true } });
      let purged = 0;
      let skipped = 0;
      for (const a of archived) {
        const refCount = await db.rateEntry.count({ where: { materialId: a.id } });
        const boqRefs = await db.boqIngredient.count({ where: { catalogMaterialId: a.id } });
        if (refCount > 0 || boqRefs > 0) { skipped++; continue; }
        await db.catalogMaterial.delete({ where: { id: a.id } });
        purged++;
      }
      return { purged, skipped };
    }),

  /** Check deletion impact for single/multiple materials */
  getDeleteImpact: protectedProcedure
    .input(z.object({ ids: z.array(z.string()) }))
    .query(async ({ input }) => {
      const ids = input.ids;
      if (ids.length === 0) {
        return {
          rateCatalogItems: 0,
          projectMaterials: 0,
          boqIngredients: 0,
          presetIngredients: 0,
          partnerSupplies: 0,
          hasImpact: false,
        };
      }
      const [
        rateEntries,
        projectMaterials,
        boqIngredients,
        presetIngredients,
        partnerSupplies,
      ] = await Promise.all([
        db.rateEntry.count({ where: { materialId: { in: ids } } }),
        db.material.count({ where: { catalogMaterialId: { in: ids } } }),
        db.boqIngredient.count({ where: { catalogMaterialId: { in: ids } } }),
        db.globalPresetIngredient.count({ where: { catalogMaterialId: { in: ids } } }),
        db.partnerSupply.count({ where: { catalogMaterialId: { in: ids } } }),
      ]);
      const totalRefs =
        rateEntries +
        projectMaterials +
        boqIngredients +
        presetIngredients +
        partnerSupplies;

      return {
        rateCatalogItems: rateEntries,
        projectMaterials,
        boqIngredients,
        presetIngredients,
        partnerSupplies,
        hasImpact: totalRefs > 0,
      };
    }),

  /** Check deletion impact for an entire category / subcategory */
  getCategoryImpact: protectedProcedure
    .input(
      z.object({
        category: z.string(),
        subCategory: z.string().optional(),
        scope: z.enum(["global", "org", "project"]).optional(),
        organizationId: z.string().optional(),
        projectId: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const where: any = { category: input.category };
      if (input.subCategory) where.subCategory = input.subCategory;
      if (input.scope) where.scope = input.scope;
      if (input.organizationId) {
        assertOrgMember(ctx, input.organizationId);
        where.organizationId = input.organizationId;
      }
      if (input.projectId) {
        await assertProjectMember(ctx, input.projectId);
        where.projectId = input.projectId;
      }

      const materials = await db.catalogMaterial.findMany({
        where,
        select: { id: true },
      });
      const ids = materials.map((m) => m.id);
      if (ids.length === 0) {
        return { totalCount: 0, referencedCount: 0, safeCount: 0, ids: [] };
      }

      const [rateCounts, matCounts, boqCounts, presetCounts, partnerCounts] = await Promise.all([
        db.rateEntry.groupBy({ by: ["materialId"], where: { materialId: { in: ids } }, _count: true }),
        db.material.groupBy({ by: ["catalogMaterialId"], where: { catalogMaterialId: { in: ids } }, _count: true }),
        db.boqIngredient.groupBy({ by: ["catalogMaterialId"], where: { catalogMaterialId: { in: ids } }, _count: true }),
        db.globalPresetIngredient.groupBy({ by: ["catalogMaterialId"], where: { catalogMaterialId: { in: ids } }, _count: true }),
        db.partnerSupply.groupBy({ by: ["catalogMaterialId"], where: { catalogMaterialId: { in: ids } }, _count: true }),
      ]);

      const refSet = new Set(
        [
          ...rateCounts.map((r: any) => r.materialId),
          ...matCounts.map((r: any) => r.catalogMaterialId),
          ...boqCounts.map((r: any) => r.catalogMaterialId),
          ...presetCounts.map((r: any) => r.catalogMaterialId),
          ...partnerCounts.map((r: any) => r.catalogMaterialId),
        ].filter(Boolean)
      );

      const referencedCount = refSet.size;
      const safeCount = ids.length - referencedCount;

      return {
        totalCount: ids.length,
        referencedCount,
        safeCount,
        ids,
      };
    }),

  // ── Rate CRUD ──────────────────────────────────────────────────────────────

  /** List rates for a rate catalog */
  listRates: protectedProcedure
    .input(
      z.object({
        rateCatalogId: z.string(),
        district: z.string().optional(),
        search: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      // SCOPING CHECK: verify the caller has access to the catalog's scope.
      const catalog = await db.rateBook.findUnique({
        where: { id: input.rateCatalogId },
        select: { scope: true, organizationId: true, projectId: true },
      });
      if (!catalog) throw new TRPCError({ code: "NOT_FOUND", message: "Rate catalog not found." });
      if (catalog.scope === "org" && catalog.organizationId) {
        assertOrgMember(ctx, catalog.organizationId);
      } else if (catalog.scope === "project" && catalog.projectId) {
        await assertProjectMember(ctx, catalog.projectId);
      }

      const where: any = { rateCatalogId: input.rateCatalogId };
      if (input.district) where.district = input.district;

      const rates = await db.rateEntry.findMany({
        where,
        include: {
          material: {
            select: { id: true, name: true, category: true, subCategory: true, defaultUnit: true, code: true },
          },
        },
        orderBy: { material: { name: "asc" } },
      });

      // Optional search filter
      let filtered = rates;
      if (input.search) {
        const q = input.search.toLowerCase();
        filtered = rates.filter(
          (r) => r.material.name.toLowerCase().includes(q) || r.material.category?.toLowerCase().includes(q)
        );
      }

      return { rates: filtered };
    }),

  /** Set a single rate for a material in a district */
  setRate: protectedProcedure
    .input(
      z.object({
        rateCatalogId: z.string(),
        materialId: z.string(),
        district: z.string(),
        rate: z.number().min(0),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const catalog = await db.rateBook.findUnique({ where: { id: input.rateCatalogId } });
      if (!catalog) throw new TRPCError({ code: "NOT_FOUND", message: "Rate catalog not found." });

      // Auth based on catalog scope
      if (catalog.scope === "global") {
        await assertGlobalAdmin(ctx);
      } else if (catalog.scope === "org") {
        await assertOrgAdmin(ctx, catalog.organizationId!);
      } else {
        await assertProjectWriter(ctx, catalog.projectId!);
      }

      // Validate material is same scope as catalog
      const material = await db.catalogMaterial.findUnique({ where: { id: input.materialId } });
      if (!material) throw new TRPCError({ code: "NOT_FOUND", message: "Material not found." });
      if (material.scope !== catalog.scope) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Material and catalog must be at the same scope." });
      }

      const rateEntry = await db.rateEntry.upsert({
        where: {
          materialId_rateCatalogId_district: {
            materialId: input.materialId,
            rateCatalogId: input.rateCatalogId,
            district: input.district,
          },
        },
        create: {
          materialId: input.materialId,
          rateCatalogId: input.rateCatalogId,
          district: input.district,
          rate: input.rate,
        },
        update: { rate: input.rate },
      });

      if (!catalog.districts.includes(input.district)) {
        await db.rateBook.update({
          where: { id: catalog.id },
          data: { districts: [...catalog.districts, input.district] },
        });
      }

      return { rate: rateEntry };
    }),

  /** Bulk set rates for multiple materials */
  bulkSetRates: protectedProcedure
    .input(
      z.object({
        rateCatalogId: z.string(),
        rates: z.array(
          z.object({
            materialId: z.string(),
            district: z.string(),
            rate: z.number().min(0),
          })
        ),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const catalog = await db.rateBook.findUnique({ where: { id: input.rateCatalogId } });
      if (!catalog) throw new TRPCError({ code: "NOT_FOUND", message: "Rate catalog not found." });

      if (catalog.scope === "global") {
        await assertGlobalAdmin(ctx);
      } else if (catalog.scope === "org") {
        await assertOrgAdmin(ctx, catalog.organizationId!);
      } else {
        await assertProjectWriter(ctx, catalog.projectId!);
      }

      const results: Array<{ id: string; materialId: string; rateCatalogId: string; district: string; rate: number }> = [];
      for (const r of input.rates) {
        const rateEntry = await db.rateEntry.upsert({
          where: {
            materialId_rateCatalogId_district: {
              materialId: r.materialId,
              rateCatalogId: input.rateCatalogId,
              district: r.district,
            },
          },
          create: {
            materialId: r.materialId,
            rateCatalogId: input.rateCatalogId,
            district: r.district,
            rate: r.rate,
          },
          update: { rate: r.rate },
        });
        results.push(rateEntry);
      }

      return { updated: results.length };
    }),

  /** Apply percentage escalation / multiplier to all rates in a district */
  applyDistrictMultiplier: protectedProcedure
    .input(
      z.object({
        rateCatalogId: z.string(),
        district: z.string(),
        multiplier: z.number().min(0.01).max(10), // e.g. 1.10 for +10%, 1.05 for +5%, 0.95 for -5%
        roundTo: z.number().int().min(0).max(4).default(2),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const catalog = await db.rateBook.findUnique({ where: { id: input.rateCatalogId } });
      if (!catalog) throw new TRPCError({ code: "NOT_FOUND", message: "Rate catalog not found." });

      if (catalog.scope === "global") await assertGlobalAdmin(ctx);
      else if (catalog.scope === "org") await assertOrgAdmin(ctx, catalog.organizationId!);
      else await assertProjectWriter(ctx, catalog.projectId!);

      const entries = await db.rateEntry.findMany({
        where: { rateCatalogId: catalog.id, district: input.district },
      });

      let updatedCount = 0;
      for (const entry of entries) {
        if (entry.rate > 0) {
          const rawNew = entry.rate * input.multiplier;
          const factor = Math.pow(10, input.roundTo);
          const rounded = Math.round(rawNew * factor) / factor;
          await db.rateEntry.update({
            where: { id: entry.id },
            data: { rate: rounded },
          });
          updatedCount++;
        }
      }

      return { success: true, updatedCount, multiplier: input.multiplier };
    }),

  // ── Import / Sync ──────────────────────────────────────────────────────────

  /** Import materials + rates from parent scope (idempotent) */
  importFromParent: protectedProcedure
    .input(
      z.object({
        targetScope: z.enum(["org", "project"]),
        targetOrganizationId: z.string().optional(),
        targetProjectId: z.string().optional(),
        sourceScope: z.enum(["global", "org"]),
        sourceOrganizationId: z.string().optional(),
        sourceRateCatalogId: z.string().optional(),
        targetRateCatalogId: z.string().optional(),
        materialIds: z.array(z.string()).optional(), // specific materials to import, or all
        districts: z.array(z.string()).optional(), // specific districts, or all from source catalog
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Enforce hierarchy: project can only import from org, not directly from global
      if (input.targetScope === "project" && input.sourceScope === "global") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Projects must import from their organization catalog, not directly from global. Import via org first.",
        });
      }
      // Determine target org/project
      const targetOrgId = input.targetScope === "org"
        ? (input.targetOrganizationId ?? ctx.user.organizationId)
        : null;
      const targetProjId = input.targetScope === "project" ? input.targetProjectId : null;

      if (input.targetScope === "org" && targetOrgId) {
        await assertOrgAdmin(ctx, targetOrgId);
      } else if (input.targetScope === "project" && targetProjId) {
        await assertProjectWriter(ctx, targetProjId);
      }

      // Determine source organization if source is 'org'
      let sourceOrgId: string | undefined = undefined;
      if (input.sourceScope === "org") {
        if (targetProjId) {
          const proj = await db.project.findUnique({
            where: { id: targetProjId },
            select: { organizationId: true },
          });
          sourceOrgId = proj?.organizationId ?? ctx.user.organizationId ?? undefined;
        } else {
          sourceOrgId = ctx.user.organizationId ?? undefined;
        }
        if (ctx.user.isSuperAdmin && input.sourceOrganizationId) {
          sourceOrgId = input.sourceOrganizationId;
        }
        if (!sourceOrgId) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Source organization could not be resolved." });
        }
        assertOrgMember(ctx, sourceOrgId);
      }

      // Find source materials
      const sourceWhere: any = { scope: input.sourceScope, isActive: true };
      if (input.sourceScope === "org") {
        if (sourceOrgId) {
          sourceWhere.organizationId = sourceOrgId;
        }
      } else {
        sourceWhere.organizationId = null;
        sourceWhere.projectId = null;
      }
      if (input.materialIds?.length) {
        sourceWhere.id = { in: input.materialIds };
      }

      const sourceMaterials = await db.catalogMaterial.findMany({ where: sourceWhere });

      let importedMaterials = 0;
      let skippedMaterials = 0;
      let importedRates = 0;

      for (const src of sourceMaterials) {
        // Check if already imported (idempotent)
        const existingTarget = await db.catalogMaterial.findFirst({
          where: {
            scope: input.targetScope,
            organizationId: targetOrgId,
            projectId: targetProjId,
            sourceMaterialId: src.id,
          },
        });

        let targetMaterial;
        if (existingTarget) {
          targetMaterial = existingTarget;
          skippedMaterials++;
        } else {
          targetMaterial = await db.catalogMaterial.create({
            data: {
              scope: input.targetScope,
              resourceType: src.resourceType || "material",
              organizationId: targetOrgId,
              projectId: targetProjId,
              sourceMaterialId: src.id,
              name: src.name,
              normalizedName: src.normalizedName,
              code: src.code,
              category: src.category,
              subCategory: src.subCategory,
              defaultUnit: src.defaultUnit,
              defaultRate: src.defaultRate,
              aliases: src.aliases,
            },
          });
          importedMaterials++;
        }

        // When importing to project scope, also ensure the Project Resource Library (Material) entry exists
        if (input.targetScope === "project" && targetProjId) {
          const existingProjectMat = await db.material.findFirst({
            where: {
              projectId: targetProjId,
              OR: [
                { catalogMaterialId: src.id },
                { catalogMaterialId: targetMaterial.id },
                { name: { equals: src.name, mode: "insensitive" } },
              ],
            },
          });
          if (!existingProjectMat) {
            await db.material.create({
              data: {
                projectId: targetProjId,
                resourceType: src.resourceType || "material",
                name: src.name,
                code: src.code,
                category: src.category,
                subCategory: src.subCategory,
                unit: src.defaultUnit || "unit",
                catalogMaterialId: targetMaterial.id,
                currentStock: 0,
                minStock: 0,
                reorderLevel: 0,
              },
            });
          } else if (!existingProjectMat.catalogMaterialId) {
            await db.material.update({
              where: { id: existingProjectMat.id },
              data: { catalogMaterialId: targetMaterial.id },
            });
          }
        }

        // Import rates if source catalog provided
        if (input.sourceRateCatalogId && input.targetRateCatalogId) {
          const sourceRates = await db.rateEntry.findMany({
            where: {
              rateCatalogId: input.sourceRateCatalogId,
              materialId: src.id,
              ...(input.districts?.length ? { district: { in: input.districts } } : {}),
            },
          });

          for (const sr of sourceRates) {
            const existingRate = await db.rateEntry.findFirst({
              where: {
                materialId: targetMaterial.id,
                rateCatalogId: input.targetRateCatalogId,
                district: sr.district,
              },
            });

            if (!existingRate) {
              await db.rateEntry.create({
                data: {
                  materialId: targetMaterial.id,
                  rateCatalogId: input.targetRateCatalogId,
                  district: sr.district,
                  rate: sr.rate,
                  sourceRateEntryId: sr.id,
                },
              });
              importedRates++;
            }
          }
        }
      }

      return { importedMaterials, skippedMaterials, importedRates };
    }),

  /** Preview import — show what would be added/changed */
  previewImport: protectedProcedure
    .input(
      z.object({
        targetScope: z.enum(["org", "project"]),
        targetOrganizationId: z.string().optional(),
        targetProjectId: z.string().optional(),
        sourceScope: z.enum(["global", "org"]),
        sourceOrganizationId: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      // Enforce hierarchy: project cannot preview import from global (level skipping)
      if (input.targetScope === "project" && input.sourceScope === "global") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Projects must import from their organization catalog, not directly from global.",
        });
      }

      const targetOrgId = input.targetScope === "org"
        ? (input.targetOrganizationId ?? ctx.user.organizationId)
        : null;
      const targetProjId = input.targetScope === "project" ? input.targetProjectId : null;

      // Enforce write authority on the target level
      if (input.targetScope === "org" && targetOrgId) {
        await assertOrgAdmin(ctx, targetOrgId);
      } else if (input.targetScope === "project" && targetProjId) {
        await assertProjectWriter(ctx, targetProjId);
      }

      // Determine source organization if source is 'org'
      let sourceOrgId: string | undefined = undefined;
      if (input.sourceScope === "org") {
        if (targetProjId) {
          const proj = await db.project.findUnique({
            where: { id: targetProjId },
            select: { organizationId: true },
          });
          sourceOrgId = proj?.organizationId ?? ctx.user.organizationId ?? undefined;
        } else {
          sourceOrgId = ctx.user.organizationId ?? undefined;
        }
        if (ctx.user.isSuperAdmin && input.sourceOrganizationId) {
          sourceOrgId = input.sourceOrganizationId;
        }
        if (!sourceOrgId) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Source organization could not be resolved." });
        }
        assertOrgMember(ctx, sourceOrgId);
      }

      const sourceWhere: any = { scope: input.sourceScope, isActive: true };
      if (input.sourceScope === "org") {
        if (sourceOrgId) {
          sourceWhere.organizationId = sourceOrgId;
        }
      } else {
        sourceWhere.organizationId = null;
        sourceWhere.projectId = null;
      }

      const sourceMaterials = await db.catalogMaterial.findMany({ where: sourceWhere });

      const newMaterials: Array<{ id: string; name: string; scope: string; [k: string]: any }> = [];
      const existingMaterials: Array<{ source: any; target: any }> = [];

      for (const src of sourceMaterials) {
        const existing = await db.catalogMaterial.findFirst({
          where: {
            scope: input.targetScope,
            organizationId: targetOrgId,
            projectId: targetProjId,
            sourceMaterialId: src.id,
          },
        });

        if (existing) {
          existingMaterials.push({ source: src, target: existing });
        } else {
          newMaterials.push(src);
        }
      }

      return { newMaterials, existingMaterials, totalSource: sourceMaterials.length };
    }),

  // ── Rate Catalog CRUD ──────────────────────────────────────────────────────

  /** Create a rate catalog */
  createRateCatalog: protectedProcedure
    .input(
      z.object({
        scope: z.enum(["global", "org", "project"]),
        organizationId: z.string().optional(),
        projectId: z.string().optional(),
        name: z.string().min(1),
        fiscalYear: z.string().min(1),
        districts: z.array(z.string()).default([]),
        sourceCatalogId: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (input.scope === "global") {
        await assertGlobalAdmin(ctx);
      } else if (input.scope === "org") {
        const orgId = input.organizationId ?? ctx.user.organizationId;
        await assertOrgAdmin(ctx, orgId!);
      } else {
        await assertProjectWriter(ctx, input.projectId!);
      }

      let districts = input.districts;
      let sourceRates: any[] = [];
      if (input.sourceCatalogId) {
        const srcCatalog = await db.rateBook.findUnique({
          where: { id: input.sourceCatalogId },
          include: { catalogRates: true },
        });
        if (srcCatalog) {
          if (districts.length === 0) districts = srcCatalog.districts;
          sourceRates = srcCatalog.catalogRates;
        }
      }

      const catalog = await db.rateBook.create({
        data: {
          scope: input.scope,
          organizationId: input.scope === "org" ? (input.organizationId ?? ctx.user.organizationId) : null,
          projectId: input.scope === "project" ? input.projectId : null,
          name: input.name.trim(),
          fiscalYear: input.fiscalYear.trim(),
          districts: districts.length > 0 ? districts : ["Default"],
          isActive: true,
          sourceCatalogId: input.sourceCatalogId || null,
        },
      });

      if (sourceRates.length > 0) {
        // Resolve target-scope materials (map from source material IDs to target material IDs)
        await db.rateEntry.createMany({
          data: sourceRates.map((sr: any) => ({
            materialId: sr.materialId,
            rateCatalogId: catalog.id,
            district: sr.district,
            rate: sr.rate,
            sourceRateEntryId: sr.id,
          })),
        });
      }

      return { catalog };
    }),

  /** List rate catalogs */
  listRateCatalogs: protectedProcedure
    .input(
      z.object({
        scope: z.enum(["global", "org", "project"]).optional(),
        organizationId: z.string().optional(),
        projectId: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const where: any = { isActive: true };
      if (input.scope) where.scope = input.scope;

      if (input.scope === "org" || (!input.scope && !input.projectId)) {
        const orgId = input.organizationId ?? ctx.user.organizationId;
        if (input.organizationId) assertOrgMember(ctx, input.organizationId);
        if (orgId) {
          where.OR = [
            { scope: "global" },
            { scope: "org", organizationId: orgId },
          ];
        }
      }

      if (input.projectId) {
        await assertProjectMember(ctx, input.projectId);
        where.projectId = input.projectId;
      }

      const catalogs = await db.rateBook.findMany({
        where,
        include: {
          _count: { select: { catalogRates: true } },
        },
        orderBy: [{ fiscalYear: "desc" }, { name: "asc" }],
      });

      return { catalogs };
    }),

  /** Get a rate catalog with its rates */
  getRateCatalog: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const catalog = await db.rateBook.findUnique({
        where: { id: input.id },
      });
      if (!catalog) throw new TRPCError({ code: "NOT_FOUND", message: "Rate catalog not found." });

      // Tenant & project boundary check (C-1 fix)
      if (catalog.scope === "org" && catalog.organizationId && catalog.organizationId !== ctx.user.organizationId && !ctx.user.isSuperAdmin) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You don't have access to this organization's rate catalog." });
      }
      if (catalog.scope === "project" && catalog.projectId) {
        await assertProjectMember(ctx, catalog.projectId);
      }

      const fullCatalog = await db.rateBook.findUnique({
        where: { id: input.id },
        include: {
          catalogRates: {
            include: {
              material: {
                select: { id: true, name: true, category: true, subCategory: true, defaultUnit: true, code: true, organizationId: true, scope: true, projectId: true },
              },
            },
            orderBy: { material: { name: "asc" } },
          },
        },
      });

      return { catalog: fullCatalog };
    }),

  // ── Effective Rate Resolution ──────────────────────────────────────────────

  /**
   * Sync materials from the material catalog into a rate catalog.
   * Creates CatalogRate entries (rate 0) for every material in the same scope
   * that does not yet have a rate entry in the target catalog, for each district
   * already present in the catalog. Idempotent.
   */
  syncRateCatalog: protectedProcedure
    .input(z.object({ rateCatalogId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const catalog = await db.rateBook.findUnique({ where: { id: input.rateCatalogId } });
      if (!catalog) throw new TRPCError({ code: "NOT_FOUND", message: "Rate catalog not found." });

      if (catalog.scope === "global") await assertGlobalAdmin(ctx);
      else if (catalog.scope === "org") await assertOrgAdmin(ctx, catalog.organizationId!);
      else await assertProjectWriter(ctx, catalog.projectId!);

      // Materials in the same scope as the catalog become rate entries.
      const materialWhere: any = { scope: catalog.scope, isActive: true };
      if (catalog.scope === "org") materialWhere.organizationId = catalog.organizationId;
      if (catalog.scope === "project") materialWhere.projectId = catalog.projectId;

      const materials = await db.catalogMaterial.findMany({ where: materialWhere });

      const existing = await db.rateEntry.findMany({
        where: { rateCatalogId: catalog.id },
        select: { materialId: true, district: true },
      });
      const existingKeys = new Set(existing.map((r) => `${r.materialId}::${r.district}`));

      const districts = catalog.districts?.length ? catalog.districts : [""];
      let addedMaterials = 0;
      let addedRates = 0;

      for (const mat of materials) {
        let materialHadEntry = false;
        for (const district of districts) {
          const key = `${mat.id}::${district}`;
          if (existingKeys.has(key)) {
            materialHadEntry = true;
            continue;
          }
          // upsert on the unique (materialId, rateCatalogId, district) tuple
          // so concurrent / repeated syncs can never create duplicates.
          await db.rateEntry.upsert({
            where: {
              materialId_rateCatalogId_district: {
                materialId: mat.id,
                rateCatalogId: catalog.id,
                district,
              },
            },
            create: {
              materialId: mat.id,
              rateCatalogId: catalog.id,
              district,
              rate: mat.defaultRate ?? 0,
            },
            update: {},
          });
          existingKeys.add(key);
          addedRates++;
          materialHadEntry = true;
        }
        if (materialHadEntry) addedMaterials++;
      }

      return { addedMaterials, addedRates, totalMaterials: materials.length };
    }),

  /** Resolve effective rates for a district, layered global → org → project */
  resolveEffectiveRates: protectedProcedure
    .input(
      z.object({
        district: z.string(),
        globalCatalogId: z.string().optional(),
        orgCatalogId: z.string().optional(),
        projectCatalogId: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      // SCOPING CHECK: verify the caller has access to each catalog's scope.
      // Without this, any user can resolve rates using another org's catalog.
      const catalogIds = [input.globalCatalogId, input.orgCatalogId, input.projectCatalogId].filter(Boolean) as string[];
      if (catalogIds.length > 0) {
        const catalogs = await db.rateBook.findMany({
          where: { id: { in: catalogIds } },
          select: { id: true, scope: true, organizationId: true, projectId: true },
        });
        for (const c of catalogs) {
          if (c.scope === "org" && c.organizationId) assertOrgMember(ctx, c.organizationId);
          else if (c.scope === "project" && c.projectId) await assertProjectMember(ctx, c.projectId);
        }
      }

      // Start with global rates
      const globalRates = input.globalCatalogId
        ? await db.rateEntry.findMany({
            where: { rateCatalogId: input.globalCatalogId, district: input.district },
            include: {
              material: {
                select: {
                  id: true,
                  name: true,
                  normalizedName: true,
                  defaultUnit: true,
                  category: true,
                  sourceMaterialId: true,
                },
              },
            },
          })
        : [];

      type EffectiveRateItem = {
        materialId: string;
        materialName: string;
        normalizedName: string;
        sourceMaterialId: string | null;
        unit: string;
        category: string | null;
        rate: number;
        source: "global" | "org_override" | "project_override";
      };

      const rateMap = new Map<string, EffectiveRateItem>();

      for (const r of globalRates) {
        rateMap.set(r.materialId, {
          materialId: r.materialId,
          materialName: r.material.name,
          normalizedName: r.material.normalizedName,
          sourceMaterialId: r.material.sourceMaterialId,
          unit: r.material.defaultUnit,
          category: r.material.category,
          rate: r.rate,
          source: "global",
        });
      }

      // Helper to find matching entry in rateMap
      const findExisting = (mat: { id: string; sourceMaterialId: string | null; normalizedName: string }) => {
        if (rateMap.has(mat.id)) return rateMap.get(mat.id);
        if (mat.sourceMaterialId && rateMap.has(mat.sourceMaterialId)) {
          return rateMap.get(mat.sourceMaterialId);
        }
        for (const item of rateMap.values()) {
          if (item.normalizedName === mat.normalizedName || (item.sourceMaterialId && item.sourceMaterialId === mat.id)) {
            return item;
          }
        }
        return undefined;
      };

      // Layer org overrides
      if (input.orgCatalogId) {
        const orgRates = await db.rateEntry.findMany({
          where: { rateCatalogId: input.orgCatalogId, district: input.district },
          include: {
            material: {
              select: {
                id: true,
                name: true,
                normalizedName: true,
                defaultUnit: true,
                category: true,
                sourceMaterialId: true,
              },
            },
          },
        });
        for (const r of orgRates) {
          const existing = findExisting(r.material);
          if (existing) {
            existing.rate = r.rate;
            existing.source = "org_override";
          } else {
            rateMap.set(r.materialId, {
              materialId: r.materialId,
              materialName: r.material.name,
              normalizedName: r.material.normalizedName,
              sourceMaterialId: r.material.sourceMaterialId,
              unit: r.material.defaultUnit,
              category: r.material.category,
              rate: r.rate,
              source: "org_override",
            });
          }
        }
      }

      // Layer project overrides
      if (input.projectCatalogId) {
        const projRates = await db.rateEntry.findMany({
          where: { rateCatalogId: input.projectCatalogId, district: input.district },
          include: {
            material: {
              select: {
                id: true,
                name: true,
                normalizedName: true,
                defaultUnit: true,
                category: true,
                sourceMaterialId: true,
              },
            },
          },
        });
        for (const r of projRates) {
          const existing = findExisting(r.material);
          if (existing) {
            existing.rate = r.rate;
            existing.source = "project_override";
          } else {
            rateMap.set(r.materialId, {
              materialId: r.materialId,
              materialName: r.material.name,
              normalizedName: r.material.normalizedName,
              sourceMaterialId: r.material.sourceMaterialId,
              unit: r.material.defaultUnit,
              category: r.material.category,
              rate: r.rate,
              source: "project_override",
            });
          }
        }
      }

      return {
        district: input.district,
        rates: Array.from(rateMap.values()).map(({ normalizedName: _nn, sourceMaterialId: _sId, ...rest }) => rest),
      };
    }),

  // ── Substitutes ────────────────────────────────────────────────────────────

  /** Add a material substitute */
  addSubstitute: protectedProcedure
    .input(
      z.object({
        materialId: z.string(),
        substituteId: z.string(),
        priority: z.number().default(0),
        reason: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const material = await db.catalogMaterial.findUnique({ where: { id: input.materialId } });
      if (!material) throw new TRPCError({ code: "NOT_FOUND", message: "Material not found." });

      if (material.scope === "global") await assertGlobalAdmin(ctx);
      else if (material.scope === "org") await assertOrgAdmin(ctx, material.organizationId!);
      else await assertProjectWriter(ctx, material.projectId!);

      const sub = await db.materialSubstitute.upsert({
        where: {
          materialId_substituteId: { materialId: input.materialId, substituteId: input.substituteId },
        },
        create: {
          materialId: input.materialId,
          substituteId: input.substituteId,
          priority: input.priority,
          reason: input.reason,
        },
        update: { priority: input.priority, reason: input.reason },
      });

      return { substitute: sub };
    }),

  /** List substitutes for a material */
  listSubstitutes: protectedProcedure
    .input(z.object({ materialId: z.string() }))
    .query(async ({ ctx, input }) => {
      const mat = await db.catalogMaterial.findUnique({
        where: { id: input.materialId },
        select: { scope: true, organizationId: true, projectId: true },
      });
      if (mat) {
        if (mat.scope === "org" && mat.organizationId) assertOrgMember(ctx, mat.organizationId);
        else if (mat.scope === "project" && mat.projectId) await assertProjectMember(ctx, mat.projectId);
      }

      const subs = await db.materialSubstitute.findMany({
        where: { materialId: input.materialId },
        include: {
          substitute: { select: { id: true, name: true, category: true, defaultUnit: true, defaultRate: true } },
        },
        orderBy: { priority: "asc" },
      });
      return { substitutes: subs };
    }),

  // ── Search (for ingredient picker) ────────────────────────────────────────

  /** Search materials across global + org scope */
  search: protectedProcedure
    .input(
      z.object({
        q: z.string().min(1),
        organizationId: z.string().optional(),
        scope: z.enum(["global", "org", "all"]).default("all"),
        limit: z.number().min(1).max(50).default(10),
      })
    )
    .query(async ({ ctx, input }) => {
      const orgId = input.organizationId ?? ctx.user.organizationId;
      // Cross-org guard: verify caller belongs to this org.
      if (input.organizationId) assertOrgMember(ctx, input.organizationId);
      const q = normalize(input.q);

      const where: any = {
        isActive: true,
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { normalizedName: { contains: q, mode: "insensitive" } },
          { code: { contains: q, mode: "insensitive" } },
          { aliases: { has: q } },
        ],
      };

      if (input.scope === "global") {
        where.scope = "global";
        where.organizationId = null;
      } else if (input.scope === "org" && orgId) {
        where.scope = "org";
        where.organizationId = orgId;
      } else {
        // Search both global and org
        where.scope = { in: ["global", "org"] };
        where.OR.push({ organizationId: null });
        if (orgId) where.OR.push({ organizationId: orgId });
      }

      const materials = await db.catalogMaterial.findMany({
        where,
        orderBy: [{ scope: "asc" }, { name: "asc" }], // org before global
        take: input.limit,
      });

      return { materials };
    }),

  /** Fuzzy find similar materials (typo prevention) — uses pg_trgm */
  findSimilar: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1),
        scope: z.enum(["global", "org", "project", "all"]).default("all"),
        organizationId: z.string().optional(),
        projectId: z.string().optional(),
        threshold: z.number().min(0).max(1).default(0.35),
        limit: z.number().min(1).max(20).default(6),
      })
    )
    .query(async ({ ctx, input }) => {
      // Cross-org guard: verify caller belongs to this org.
      if (input.organizationId) assertOrgMember(ctx, input.organizationId);
      if (input.projectId) await assertProjectMember(ctx, input.projectId);
      const { findSimilarMaterials } = await import("@/lib/fuzzy-match");
      const matches = await findSimilarMaterials({
        name: input.name,
        scope: input.scope as any,
        organizationId: input.organizationId ?? ctx.user.organizationId ?? null,
        projectId: input.projectId ?? null,
        threshold: input.threshold,
        limit: input.limit,
      });
      return { matches };
    }),

  /** Update rate catalog metadata */
  updateRateCatalog: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).optional(),
        fiscalYear: z.string().min(1).optional(),
        districts: z.array(z.string()).optional(),
        isActive: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const catalog = await db.rateBook.findUnique({ where: { id: input.id } });
      if (!catalog) throw new TRPCError({ code: "NOT_FOUND", message: "Rate catalog not found." });

      if (catalog.scope === "global") await assertGlobalAdmin(ctx);
      else if (catalog.scope === "org") await assertOrgAdmin(ctx, catalog.organizationId!);
      else await assertProjectWriter(ctx, catalog.projectId!);

      const data: any = {};
      if (input.name !== undefined) data.name = input.name.trim();
      if (input.fiscalYear !== undefined) data.fiscalYear = input.fiscalYear.trim();
      if (input.districts !== undefined) data.districts = input.districts;
      if (input.isActive !== undefined) data.isActive = input.isActive;

      const updated = await db.rateBook.update({ where: { id: input.id }, data });
      return { catalog: updated };
    }),

  /** Copy rate catalog to a new fiscal year with percentage inflation */
  copyWithInflation: protectedProcedure
    .input(
      z.object({
        sourceCatalogId: z.string(),
        newFiscalYear: z.string().min(1),
        name: z.string().min(1),
        inflationPct: z.number().min(-100).max(500).default(0),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const source = await db.rateBook.findUnique({
        where: { id: input.sourceCatalogId },
        include: { catalogRates: true },
      });
      if (!source) throw new TRPCError({ code: "NOT_FOUND", message: "Source rate catalog not found." });

      if (source.scope === "global") await assertGlobalAdmin(ctx);
      else if (source.scope === "org") await assertOrgAdmin(ctx, source.organizationId!);
      else await assertProjectWriter(ctx, source.projectId!);

      const multiplier = 1 + input.inflationPct / 100;

      const newCatalog = await db.rateBook.create({
        data: {
          scope: source.scope,
          organizationId: source.organizationId,
          projectId: source.projectId,
          name: input.name.trim(),
          fiscalYear: input.newFiscalYear.trim(),
          districts: source.districts,
          isActive: true,
          sourceCatalogId: source.id,
        },
      });

      if (source.catalogRates.length > 0) {
        await db.rateEntry.createMany({
          data: source.catalogRates.map((r) => ({
            materialId: r.materialId,
            rateCatalogId: newCatalog.id,
            district: r.district,
            rate: Math.round(r.rate * multiplier * 100) / 100,
            sourceRateEntryId: r.id,
          })),
        });
      }

      return { catalog: newCatalog, copiedRatesCount: source.catalogRates.length };
    }),

  /** Preview merging two materials */
  previewMerge: protectedProcedure
    .input(
      z.object({
        level: z.enum(["global", "org", "project"]).default("org"),
        winnerId: z.string(),
        loserId: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      if (input.winnerId === input.loserId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Winner and loser cannot be the same material." });
      }

      const [winner, loser, boqIngredients, presetIngredients, rateProfileItems, partnerSupplies, materials, transactions, rateEntries] = await Promise.all([
        db.catalogMaterial.findUnique({ where: { id: input.winnerId } }),
        db.catalogMaterial.findUnique({ where: { id: input.loserId } }),
        db.boqIngredient.count({ where: { catalogMaterialId: input.loserId } }),
        db.globalPresetIngredient.count({ where: { catalogMaterialId: input.loserId } }),
        db.rateProfileItem.count({ where: { catalogMaterialId: input.loserId } }),
        db.partnerSupply.count({ where: { catalogMaterialId: input.loserId } }),
        db.material.count({ where: { catalogMaterialId: input.loserId } }),
        db.materialTransaction.count({ where: { catalogMaterialId: input.loserId } }),
        db.rateEntry.count({ where: { materialId: input.loserId } }),
      ]);

      if (!winner || !loser) {
        throw new TRPCError({ code: "NOT_FOUND", message: "One or both materials not found." });
      }

      if (
        winner.scope !== loser.scope ||
        winner.organizationId !== loser.organizationId ||
        winner.projectId !== loser.projectId
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Cannot merge materials across different scopes, organizations, or projects.",
        });
      }

      if (winner.scope === "org" && winner.organizationId) {
        assertOrgMember(ctx, winner.organizationId);
      } else if (winner.scope === "project" && winner.projectId) {
        await assertProjectMember(ctx, winner.projectId);
      }

      const totalRows =
        boqIngredients +
        presetIngredients +
        rateProfileItems +
        partnerSupplies +
        materials +
        transactions +
        rateEntries;

      return {
        winner: { id: winner.id, name: winner.name, category: winner.category, unit: winner.defaultUnit },
        loser: { id: loser.id, name: loser.name, category: loser.category, unit: loser.defaultUnit },
        affectedCounts: {
          boqIngredients,
          presetIngredients,
          rateProfileItems,
          partnerSupplies,
          projectMaterials: materials,
          transactions,
          rateEntries,
          totalRows,
        },
      };
    }),

  /** Atomically merge duplicate material into winner */
  executeMerge: protectedProcedure
    .input(
      z.object({
        level: z.enum(["global", "org", "project"]).default("org"),
        winnerId: z.string(),
        loserId: z.string(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (input.winnerId === input.loserId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Winner and loser cannot be the same." });
      }

      const winner = await db.catalogMaterial.findUnique({ where: { id: input.winnerId } });
      const loser = await db.catalogMaterial.findUnique({ where: { id: input.loserId } });
      if (!winner || !loser) throw new TRPCError({ code: "NOT_FOUND", message: "Material not found." });

      if (
        winner.scope !== loser.scope ||
        winner.organizationId !== loser.organizationId ||
        winner.projectId !== loser.projectId
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Cannot merge materials across different scopes, organizations, or projects.",
        });
      }

      if (input.level === "global" || winner.scope === "global") await assertGlobalAdmin(ctx);
      else if (input.level === "org" || winner.scope === "org") await assertOrgAdmin(ctx, winner.organizationId!);
      else await assertProjectWriter(ctx, winner.projectId!);

      let totalRowsRemapped = 0;
      const affectedTables: string[] = [];

      await db.$transaction(async (tx) => {
        // 1. Remap BoqIngredient
        const boqRes = await tx.boqIngredient.updateMany({
          where: { catalogMaterialId: loser.id },
          data: { catalogMaterialId: winner.id },
        });
        if (boqRes.count > 0) {
          affectedTables.push("BoqIngredient");
          totalRowsRemapped += boqRes.count;
        }

        // 2. Remap GlobalPresetIngredient
        const presetRes = await tx.globalPresetIngredient.updateMany({
          where: { catalogMaterialId: loser.id },
          data: { catalogMaterialId: winner.id },
        });
        if (presetRes.count > 0) {
          affectedTables.push("GlobalPresetIngredient");
          totalRowsRemapped += presetRes.count;
        }

        // 3. Remap RateProfileItem
        const rpiRes = await tx.rateProfileItem.updateMany({
          where: { catalogMaterialId: loser.id },
          data: { catalogMaterialId: winner.id },
        });
        if (rpiRes.count > 0) {
          affectedTables.push("RateProfileItem");
          totalRowsRemapped += rpiRes.count;
        }

        // 4. Remap PartnerSupply
        const psRes = await tx.partnerSupply.updateMany({
          where: { catalogMaterialId: loser.id },
          data: { catalogMaterialId: winner.id },
        });
        if (psRes.count > 0) {
          affectedTables.push("PartnerSupply");
          totalRowsRemapped += psRes.count;
        }

        // 5. Remap Material (project inventory)
        const matRes = await tx.material.updateMany({
          where: { catalogMaterialId: loser.id },
          data: { catalogMaterialId: winner.id },
        });
        if (matRes.count > 0) {
          affectedTables.push("Material");
          totalRowsRemapped += matRes.count;
        }

        // 6. Remap MaterialTransaction
        const txRes = await tx.materialTransaction.updateMany({
          where: { catalogMaterialId: loser.id },
          data: { catalogMaterialId: winner.id },
        });
        if (txRes.count > 0) {
          affectedTables.push("MaterialTransaction");
          totalRowsRemapped += txRes.count;
        }

        // 7. Remap CatalogMaterial imports
        await tx.catalogMaterial.updateMany({
          where: { sourceMaterialId: loser.id },
          data: { sourceMaterialId: winner.id },
        });

        // 8. Remap RateEntry (delete duplicates for winner's catalogs, remap remainder)
        const winnerRateKeys = new Set(
          (await tx.rateEntry.findMany({ where: { materialId: winner.id } })).map(
            (r) => `${r.rateCatalogId}::${r.district}`
          )
        );
        const loserRates = await tx.rateEntry.findMany({ where: { materialId: loser.id } });
        for (const lr of loserRates) {
          const key = `${lr.rateCatalogId}::${lr.district}`;
          if (winnerRateKeys.has(key)) {
            await tx.rateEntry.delete({ where: { id: lr.id } });
          } else {
            await tx.rateEntry.update({
              where: { id: lr.id },
              data: { materialId: winner.id },
            });
            totalRowsRemapped++;
          }
        }

        // 9. Union aliases on winner
        const combinedAliases = Array.from(
          new Set([...winner.aliases, ...loser.aliases, loser.name])
        );
        await tx.catalogMaterial.update({
          where: { id: winner.id },
          data: { aliases: combinedAliases },
        });

        // 10. Audit Log
        await tx.materialMergeLog.create({
          data: {
            level: input.level,
            winnerId: winner.id,
            loserId: loser.id,
            mergedById: ctx.user.id,
            affectedTables,
            totalRowsRemapped,
            notes: input.notes?.trim() || null,
          },
        });

        // 11. Delete loser material
        await tx.catalogMaterial.delete({ where: { id: loser.id } });
      });

      return {
        success: true,
        totalRowsRemapped,
        affectedTables,
      };
    }),

  /** Tally excel rows against fuzzy database match */
  tallyImportRows: protectedProcedure
    .input(
      z.object({
        rows: z
          .array(
            z.object({
              rawName: z.string().min(1),
              category: z.string().optional().nullable(),
              subCategory: z.string().optional().nullable(),
              unit: z.string().optional().nullable(),
              defaultRate: z.number().optional().nullable(),
              code: z.string().optional().nullable(),
            })
          )
          .min(1)
          .max(500),
        organizationId: z.string().optional(),
        scope: z.enum(["global", "org"]).default("org"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const orgId = input.organizationId ?? ctx.user.organizationId;
      // Authz: org scope requires org admin + cross-org guard.
      // Global scope requires superadmin.
      if (input.scope === "org" && orgId) {
        assertOrgMember(ctx, orgId);
        if (!isOrgAdmin(ctx.user) && ctx.user.orgRole !== "org_admin" && !ctx.user.isSuperAdmin) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Org admin access required." });
        }
      }
      if (input.scope === "global" && !ctx.user.isSuperAdmin) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Superadmin access required for global catalog." });
      }
      if (input.scope === "org" && !orgId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Organization ID is required." });
      }

      const { findSimilarMaterials } = await import("@/lib/fuzzy-match");
      const tallies = await Promise.all(
        input.rows.map(async (row, index) => {
          const suggestions = await findSimilarMaterials({
            name: row.rawName,
            scope: input.scope,
            organizationId: orgId,
            threshold: 0.35,
            limit: 3,
          });

          const topMatch = suggestions[0];
          let status: "exact" | "similar" | "unique" = "unique";
          let recommendedAction: "link_existing" | "add_alias" | "create_new" = "create_new";

          if (topMatch) {
            if (topMatch.matchType === "exact" || topMatch.score >= 0.98 || topMatch.matchType === "alias") {
              status = "exact";
              recommendedAction = "link_existing";
            } else if (topMatch.score >= 0.65 || topMatch.matchType === "token_sort") {
              status = "similar";
              recommendedAction = topMatch.matchType === "token_sort" ? "add_alias" : "link_existing";
            }
          }

          return {
            index,
            row,
            status,
            recommendedAction,
            topMatch: topMatch || null,
            suggestions,
          };
        })
      );

      const exactCount = tallies.filter((t) => t.status === "exact").length;
      const similarCount = tallies.filter((t) => t.status === "similar").length;
      const uniqueCount = tallies.filter((t) => t.status === "unique").length;

      return {
        tallies,
        summary: {
          total: tallies.length,
          exactCount,
          similarCount,
          uniqueCount,
        },
      };
    }),

  /** Commit excel imported materials */
  commitImport: protectedProcedure
    .input(
      z.object({
        organizationId: z.string().optional(),
        scope: z.enum(["global", "org"]).default("org"),
        items: z
          .array(
            z.object({
              rawName: z.string(),
              category: z.string().optional().nullable(),
              subCategory: z.string().optional().nullable(),
              unit: z.string().optional().nullable(),
              defaultRate: z.number().optional().nullable(),
              code: z.string().optional().nullable(),
              action: z.enum(["link_existing", "add_alias", "create_new"]),
              targetId: z.string().optional().nullable(),
            })
          )
          .min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const orgId = input.organizationId ?? ctx.user.organizationId;
      if (input.scope === "org" && !orgId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Organization ID is required." });
      }

      if (input.scope === "global") await assertGlobalAdmin(ctx);
      else await assertOrgAdmin(ctx, orgId!);

      let createdCount = 0;
      let linkedCount = 0;
      let aliasCount = 0;

      await db.$transaction(async (tx) => {
        for (const item of input.items) {
          if (item.action === "link_existing" && item.targetId) {
            linkedCount++;
          } else if (item.action === "add_alias" && item.targetId) {
            const target = await tx.catalogMaterial.findUnique({ where: { id: item.targetId } });
            if (target && !target.aliases.includes(item.rawName)) {
              await tx.catalogMaterial.update({
                where: { id: item.targetId },
                data: { aliases: [...target.aliases, item.rawName] },
              });
            }
            aliasCount++;
          } else {
            // Create new CatalogMaterial
            const normalizedName = normalize(item.rawName);
            const existing = await tx.catalogMaterial.findFirst({
              where: {
                normalizedName,
                scope: input.scope,
                organizationId: input.scope === "org" ? orgId : null,
              },
            });

            if (!existing) {
              await tx.catalogMaterial.create({
                data: {
                  scope: input.scope,
                  organizationId: input.scope === "org" ? orgId : null,
                  name: item.rawName.trim(),
                  normalizedName,
                  code: item.code?.trim() || null,
                  category: item.category?.trim() || null,
                  subCategory: item.subCategory?.trim() || null,
                  defaultUnit: item.unit?.trim() || "",
                  defaultRate: item.defaultRate || 0,
                  aliases: [item.rawName],
                  isActive: true,
                },
              });
              createdCount++;
            } else {
              linkedCount++;
            }
          }
        }
      });

      return {
        createdCount,
        linkedCount,
        aliasCount,
      };
    }),
});

