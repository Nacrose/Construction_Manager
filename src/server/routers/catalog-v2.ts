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
  if (ctx.user.orgRole !== "org_admin" && !isOrgAdmin(ctx.user) && !ctx.user.isSuperAdmin) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Org admin access required." });
  }
  if (ctx.user.organizationId !== orgId && !ctx.user.isSuperAdmin) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Cannot modify another organization's catalog." });
  }
}

async function assertProjectMember(ctx: { user: any }, projectId: string) {
  const membership = await db.projectMember.findFirst({
    where: { projectId, userId: ctx.user.id },
  });
  if (!membership && !ctx.user.isSuperAdmin) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Not a member of this project." });
  }
  return membership;
}

async function assertProjectWriter(ctx: { user: any }, projectId: string) {
  const membership = await assertProjectMember(ctx, projectId);
  const canWrite = ["owner", "admin", "manager"].includes(membership?.role ?? "") || ctx.user.isSuperAdmin;
  if (!canWrite) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Manager+ access required." });
  }
  return membership;
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
        search: z.string().optional(),
        category: z.string().optional(),
        activeOnly: z.boolean().default(true),
        limit: z.number().min(1).max(500).default(100),
      })
    )
    .query(async ({ ctx, input }) => {
      const where: any = { scope: input.scope };
      if (input.activeOnly) where.isActive = true;

      if (input.scope === "global") {
        where.organizationId = null;
        where.projectId = null;
      } else if (input.scope === "org") {
        const orgId = input.organizationId ?? ctx.user.organizationId;
        if (!orgId) throw new TRPCError({ code: "BAD_REQUEST", message: "Organization ID required." });
        where.organizationId = orgId;
        where.projectId = null;
      } else {
        if (!input.projectId) throw new TRPCError({ code: "BAD_REQUEST", message: "Project ID required." });
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

  /** Get a single material with its rate entries */
  getMaterial: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const material = await db.catalogMaterial.findUnique({
        where: { id: input.id },
        include: {
          rateEntries: { include: { rateCatalog: { select: { id: true, name: true, fiscalYear: true } } } },
          sourceMaterial: { select: { id: true, name: true, scope: true } },
        },
      });
      if (!material) throw new TRPCError({ code: "NOT_FOUND", message: "Material not found." });
      return { material };
    }),

  /** Create a material at a specific scope */
  createMaterial: protectedProcedure
    .input(
      z.object({
        scope: z.enum(["global", "org", "project"]),
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

      const norm = normalize(input.name);
      const orgId = input.scope === "org" ? (input.organizationId ?? ctx.user.organizationId) : null;
      const projId = input.scope === "project" ? input.projectId : null;

      // Duplicate check
      const existing = await db.catalogMaterial.findFirst({
        where: { normalizedName: norm, organizationId: orgId, projectId: projId },
      });
      if (existing) {
        throw new TRPCError({ code: "CONFLICT", message: `Material "${existing.name}" already exists at this scope.` });
      }

      const material = await db.catalogMaterial.create({
        data: {
          scope: input.scope,
          organizationId: orgId,
          projectId: projId,
          name: input.name.trim(),
          normalizedName: norm,
          code: input.code?.trim() || null,
          category: input.category?.trim() || null,
          subCategory: input.subCategory?.trim() || null,
          defaultUnit: input.defaultUnit,
          defaultRate: input.defaultRate,
          aliases: input.aliases,
        },
      });

      return { material };
    }),

  /** Update a material (scope-appropriate fields only) */
  updateMaterial: protectedProcedure
    .input(
      z.object({
        id: z.string(),
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
      const refCount = await db.catalogRate.count({ where: { materialId: input.id } });
      if (refCount > 0) {
        // Soft delete
        await db.catalogMaterial.update({ where: { id: input.id }, data: { isActive: false } });
        return { softDeleted: true, refCount };
      }

      // Hard delete if no references
      await db.catalogMaterial.delete({ where: { id: input.id } });
      return { hardDeleted: true };
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
    .query(async ({ input }) => {
      const where: any = { rateCatalogId: input.rateCatalogId };
      if (input.district) where.district = input.district;

      const rates = await db.catalogRate.findMany({
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
      const catalog = await db.rateCatalog.findUnique({ where: { id: input.rateCatalogId } });
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

      const rateEntry = await db.catalogRate.upsert({
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
      const catalog = await db.rateCatalog.findUnique({ where: { id: input.rateCatalogId } });
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
        const rateEntry = await db.catalogRate.upsert({
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

      // Find source materials
      const sourceWhere: any = { scope: input.sourceScope, isActive: true };
      if (input.sourceScope === "org") {
        sourceWhere.organizationId = input.sourceOrganizationId;
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

        // Import rates if source catalog provided
        if (input.sourceRateCatalogId && input.targetRateCatalogId) {
          const sourceRates = await db.catalogRate.findMany({
            where: {
              rateCatalogId: input.sourceRateCatalogId,
              materialId: src.id,
              ...(input.districts?.length ? { district: { in: input.districts } } : {}),
            },
          });

          for (const sr of sourceRates) {
            const existingRate = await db.catalogRate.findFirst({
              where: {
                materialId: targetMaterial.id,
                rateCatalogId: input.targetRateCatalogId,
                district: sr.district,
              },
            });

            if (!existingRate) {
              await db.catalogRate.create({
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
      const targetOrgId = input.targetScope === "org"
        ? (input.targetOrganizationId ?? ctx.user.organizationId)
        : null;
      const targetProjId = input.targetScope === "project" ? input.targetProjectId : null;

      const sourceWhere: any = { scope: input.sourceScope, isActive: true };
      if (input.sourceScope === "org") {
        sourceWhere.organizationId = input.sourceOrganizationId;
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

      const catalog = await db.rateCatalog.create({
        data: {
          scope: input.scope,
          organizationId: input.scope === "org" ? (input.organizationId ?? ctx.user.organizationId) : null,
          projectId: input.scope === "project" ? input.projectId : null,
          name: input.name.trim(),
          fiscalYear: input.fiscalYear.trim(),
          districts: input.districts,
          isActive: true,
        },
      });

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
      const where: any = {};
      if (input.scope) where.scope = input.scope;
      if (input.organizationId) where.organizationId = input.organizationId;
      else if (!input.scope) where.organizationId = ctx.user.organizationId;
      if (input.projectId) where.projectId = input.projectId;

      const catalogs = await db.rateCatalog.findMany({
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
    .query(async ({ input }) => {
      const catalog = await db.rateCatalog.findUnique({
        where: { id: input.id },
        include: {
          catalogRates: {
            include: {
              material: {
                select: { id: true, name: true, category: true, subCategory: true, defaultUnit: true, code: true },
              },
            },
            orderBy: { material: { name: "asc" } },
          },
        },
      });
      if (!catalog) throw new TRPCError({ code: "NOT_FOUND", message: "Rate catalog not found." });
      return { catalog };
    }),

  // ── Effective Rate Resolution ──────────────────────────────────────────────

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
      // Start with global rates
      const globalRates = input.globalCatalogId
        ? await db.catalogRate.findMany({
            where: { rateCatalogId: input.globalCatalogId, district: input.district },
            include: { material: { select: { id: true, name: true, defaultUnit: true, category: true } } },
          })
        : [];

      const rateMap = new Map<
        string,
        {
          materialId: string;
          materialName: string;
          unit: string;
          category: string | null;
          rate: number;
          source: "global" | "org_override" | "project_override";
        }
      >();

      for (const r of globalRates) {
        rateMap.set(r.materialId, {
          materialId: r.materialId,
          materialName: r.material.name,
          unit: r.material.defaultUnit,
          category: r.material.category,
          rate: r.rate,
          source: "global",
        });
      }

      // Layer org overrides
      if (input.orgCatalogId) {
        const orgRates = await db.catalogRate.findMany({
          where: { rateCatalogId: input.orgCatalogId, district: input.district },
          include: { material: { select: { id: true, name: true, defaultUnit: true, category: true } } },
        });
        for (const r of orgRates) {
          const existing = rateMap.get(r.materialId);
          if (existing) {
            existing.rate = r.rate;
            existing.source = "org_override";
          } else {
            rateMap.set(r.materialId, {
              materialId: r.materialId,
              materialName: r.material.name,
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
        const projRates = await db.catalogRate.findMany({
          where: { rateCatalogId: input.projectCatalogId, district: input.district },
          include: { material: { select: { id: true, name: true, defaultUnit: true, category: true } } },
        });
        for (const r of projRates) {
          const existing = rateMap.get(r.materialId);
          if (existing) {
            existing.rate = r.rate;
            existing.source = "project_override";
          } else {
            rateMap.set(r.materialId, {
              materialId: r.materialId,
              materialName: r.material.name,
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
        rates: Array.from(rateMap.values()),
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
    .query(async ({ input }) => {
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
});
