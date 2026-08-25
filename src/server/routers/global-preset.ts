/**
 * tRPC router for global and org-level presets.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "@/server/trpc";
import { db } from "@/lib/db";
import { isOrgAdmin, assertCanWrite } from "@/lib/authz";
import { recalcAnalysis } from "@/server/utils/boq-calc";

const CreatePresetSchema = z.object({
  name: z.string().min(1).max(200),
  source: z.string().default("Custom"),
  category: z.string().default("General"),
  description: z.string().optional(),
  batchSize: z.number().positive().default(1),
});

const UpdatePresetSchema = z.object({
  presetId: z.string(),
  name: z.string().min(1).max(200).optional(),
  source: z.string().optional(),
  category: z.string().optional(),
  description: z.string().nullable().optional(),
  batchSize: z.number().positive().optional(),
});

const CreateIngredientSchema = z.object({
  presetId: z.string(),
  name: z.string().min(1).max(200),
  type: z.string().default("material"),
  calcMode: z.enum(["fixed", "percentage"]).default("fixed"),
  quantity: z.number().default(0),
  unit: z.string().default(""),
  percentage: z.number().default(0),
  pctBase: z.string().default(""),
  rate: z.number().default(0),
  amount: z.number().default(0),
  catalogMaterialId: z.string().optional().nullable(),
  materialCatalogId: z.string().optional().nullable(),
});

const UpdateIngredientSchema = z.object({
  presetId: z.string(),
  ingredientId: z.string(),
  name: z.string().optional(),
  type: z.string().optional(),
  calcMode: z.string().optional(),
  quantity: z.number().optional(),
  unit: z.string().optional(),
  percentage: z.number().optional(),
  pctBase: z.string().optional(),
  rate: z.number().optional(),
  catalogMaterialId: z.string().optional().nullable(),
  materialCatalogId: z.string().optional().nullable(),
});

export const globalPresetRouter = router({
  /** List all global presets. */
  list: protectedProcedure
    .input(
      z.object({
        category: z.string().optional(),
        q: z.string().optional(),
        limit: z.number().min(1).max(500).default(500),
      })
    )
    .query(async ({ input }) => {
      const presets = await db.globalPresetAnalysis.findMany({
        where: {
          ...(input.category && input.category !== "all" && { category: input.category }),
          ...(input.q && {
            OR: [
              { name: { contains: input.q, mode: "insensitive" } },
              { description: { contains: input.q, mode: "insensitive" } },
              { category: { contains: input.q, mode: "insensitive" } },
              { source: { contains: input.q, mode: "insensitive" } },
            ],
          }),
        },
        include: { _count: { select: { ingredients: true } } },
        orderBy: [{ category: "asc" }, { name: "asc" }],
        take: input.limit,
      });

      return { presets };
    }),

  /** Get a single preset with ingredients. */
  get: protectedProcedure
    .input(z.object({ presetId: z.string() }))
    .query(async ({ ctx, input }) => {
      const preset = await db.globalPresetAnalysis.findUnique({
        where: { id: input.presetId },
        include: {
          ingredients: {
            orderBy: { sortOrder: "asc" },
            include: { catalogMaterial: { select: { id: true, name: true, defaultUnit: true } } },
          },
        },
      });
      if (!preset) throw new TRPCError({ code: "NOT_FOUND", message: "Preset not found." });

      // IDOR guard: org-scoped presets are only readable by members of
      // that org. Global presets (organizationId == null) are readable
      // by anyone authenticated. Previously this returned any preset
      // by cuid — cross-tenant leak of org-scoped rate analyses.
      if (preset.organizationId && preset.organizationId !== ctx.user.organizationId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "This preset belongs to a different organization." });
      }

      return { preset: { ...preset, ingredients: preset.ingredients ?? [] } };
    }),

  /** Create a new preset (empty, or with initial data). */
  create: protectedProcedure
    .input(CreatePresetSchema)
    .mutation(async ({ ctx, input }) => {
      if (!isOrgAdmin(ctx.user) && ctx.user.orgRole !== "org_admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required." });
      }
      const preset = await db.globalPresetAnalysis.create({
        data: {
          name: input.name,
          source: input.source,
          category: input.category,
          description: input.description,
          batchSize: input.batchSize,
        },
      });
      return { preset };
    }),

  /** Update preset metadata. */
  update: protectedProcedure
    .input(UpdatePresetSchema)
    .mutation(async ({ ctx, input }) => {
      if (!isOrgAdmin(ctx.user) && ctx.user.orgRole !== "org_admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required." });
      }
      const { presetId, ...data } = input;
      const preset = await db.globalPresetAnalysis.update({
        where: { id: presetId },
        data: {
          ...(data.name !== undefined && { name: data.name }),
          ...(data.source !== undefined && { source: data.source }),
          ...(data.category !== undefined && { category: data.category }),
          ...(data.description !== undefined && { description: data.description }),
          ...(data.batchSize !== undefined && { batchSize: data.batchSize }),
        },
      });
      return { preset };
    }),

  /** Delete a preset. */
  delete: protectedProcedure
    .input(z.object({ presetId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (!isOrgAdmin(ctx.user) && ctx.user.orgRole !== "org_admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required." });
      }
      await db.globalPresetAnalysis.delete({ where: { id: input.presetId } });
      return { ok: true };
    }),

  /** Add an ingredient to a preset. */
  addIngredient: protectedProcedure
    .input(CreateIngredientSchema)
    .mutation(async ({ ctx, input }) => {
      if (!isOrgAdmin(ctx.user) && ctx.user.orgRole !== "org_admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required." });
      }
      const { presetId, materialCatalogId, catalogMaterialId, ...data } = input;
      const maxOrder = await db.globalPresetIngredient.aggregate({
        where: { presetId },
        _max: { sortOrder: true },
      });
      const ingredient = await db.globalPresetIngredient.create({
        data: {
          ...data,
          presetId,
          catalogMaterialId: catalogMaterialId || materialCatalogId || null,
          sortOrder: (maxOrder._max.sortOrder ?? -1) + 1,
        },
      });
      return { ingredient };
    }),

  /** Update a preset ingredient. */
  updateIngredient: protectedProcedure
    .input(UpdateIngredientSchema)
    .mutation(async ({ ctx, input }) => {
      if (!isOrgAdmin(ctx.user) && ctx.user.orgRole !== "org_admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required." });
      }
      const { ingredientId, presetId, materialCatalogId, catalogMaterialId, ...data } = input;
      const finalCatalogId =
        catalogMaterialId !== undefined
          ? catalogMaterialId
          : materialCatalogId !== undefined
          ? materialCatalogId
          : undefined;

      const ingredient = await db.globalPresetIngredient.update({
        where: { id: ingredientId },
        data: {
          ...(data.name !== undefined && { name: data.name }),
          ...(data.type !== undefined && { type: data.type }),
          ...(data.calcMode !== undefined && { calcMode: data.calcMode }),
          ...(data.quantity !== undefined && { quantity: data.quantity }),
          ...(data.unit !== undefined && { unit: data.unit }),
          ...(data.percentage !== undefined && { percentage: data.percentage }),
          ...(data.pctBase !== undefined && { pctBase: data.pctBase }),
          ...(data.rate !== undefined && { rate: data.rate }),
          ...(finalCatalogId !== undefined && { catalogMaterialId: finalCatalogId }),
        },
      });
      return { ingredient };
    }),

  /** Delete a preset ingredient. */
  deleteIngredient: protectedProcedure
    .input(z.object({ presetId: z.string(), ingredientId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (!isOrgAdmin(ctx.user) && ctx.user.orgRole !== "org_admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required." });
      }
      await db.globalPresetIngredient.delete({ where: { id: input.ingredientId } });
      return { ok: true };
    }),

  /**
   * Load a global preset into a specific rate analysis of a BOQ item.
   * Auto-pulls district rates from RateEntry (CatalogRate).
   */
  load: protectedProcedure
    .input(
      z.object({
        boqItemId: z.string(),
        presetId: z.string(),
        rateAnalysisId: z.string(),
        projectId: z.string().optional(),
        rateCatalogId: z.string().optional(),
        district: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const item = await db.boqItem.findUnique({
        where: { id: input.boqItemId },
        select: { projectId: true },
      });
      if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "BOQ item not found." });
      await assertCanWrite(ctx.user, item.projectId);

      const preset = await db.globalPresetAnalysis.findUnique({
        where: { id: input.presetId },
        include: {
          ingredients: {
            orderBy: { sortOrder: "asc" },
            include: { catalogMaterial: true },
          },
        },
      });
      if (!preset) throw new TRPCError({ code: "NOT_FOUND", message: "Preset not found." });

      // IDOR guard: org-scoped preset must belong to the caller's org.
      if (preset.organizationId && preset.organizationId !== ctx.user.organizationId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "This preset belongs to a different organization." });
      }

      const analysis = await db.rateAnalysis.findUnique({
        where: { id: input.rateAnalysisId },
        select: { id: true, boqItemId: true },
      });
      if (!analysis || analysis.boqItemId !== input.boqItemId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Rate analysis not found." });
      }

      // Pre-fetch catalog item rates for rate auto-pull (v2 CatalogRate)
      const catalogRates = new Map<string, number>();
      if (input.rateCatalogId && input.district) {
        const v2Rates = await db.rateEntry.findMany({
          where: { rateCatalogId: input.rateCatalogId, district: input.district },
          include: { material: { select: { id: true, name: true, normalizedName: true } } },
        });
        for (const r of v2Rates) {
          if (r.rate > 0) {
            catalogRates.set(r.materialId, r.rate);
            if (r.material) {
              catalogRates.set(r.material.normalizedName, r.rate);
              catalogRates.set(r.material.name.toLowerCase().trim(), r.rate);
            }
          }
        }
      }

      const projectMaterials = await db.material.findMany({
        where: { projectId: item.projectId, isActive: true },
        select: { id: true, name: true, catalogMaterialId: true },
      });

      await db.$transaction(async (tx) => {
        await tx.boqIngredient.deleteMany({ where: { rateAnalysisId: input.rateAnalysisId } });

        for (const ing of preset.ingredients) {
          let rate = ing.rate;
          const unit = ing.unit;

          // Auto-pull rate from catalog by catalogMaterialId, normalizedName, or exact name
          if (ing.catalogMaterialId && catalogRates.has(ing.catalogMaterialId)) {
            rate = catalogRates.get(ing.catalogMaterialId)!;
          } else if (catalogRates.has(ing.name.toLowerCase().trim())) {
            rate = catalogRates.get(ing.name.toLowerCase().trim())!;
          }

          let amount = ing.amount;
          if (ing.calcMode === "fixed") {
            const qtyWithPct = ing.quantity + (ing.quantity * ing.percentage) / 100;
            amount = qtyWithPct * rate;
          }

          // Match against project Resource Library
          const matchedResource = projectMaterials.find(
            (m) =>
              (ing.catalogMaterialId && m.catalogMaterialId === ing.catalogMaterialId) ||
              m.name.toLowerCase().trim() === ing.name.toLowerCase().trim()
          );

          await tx.boqIngredient.create({
            data: {
              boqItemId: input.boqItemId,
              rateAnalysisId: input.rateAnalysisId,
              name: ing.name,
              type: ing.type,
              calcMode: ing.calcMode,
              quantity: ing.quantity,
              unit,
              percentage: ing.percentage,
              pctBase: ing.pctBase,
              rate,
              amount,
              sortOrder: ing.sortOrder,
              materialId: matchedResource?.id || null,
              catalogMaterialId: ing.catalogMaterialId,
              rateDistrict: input.district || null,
            },
          });
        }

        await tx.rateAnalysis.update({
          where: { id: input.rateAnalysisId },
          data: { batchSize: preset.batchSize },
        });
      });

      await recalcAnalysis(input.rateAnalysisId, input.boqItemId);

      return {
        loaded: preset.ingredients.length,
        presetName: preset.name,
        batchSize: preset.batchSize,
        rateSource: input.district ? `${input.district}` : "preset default",
      };
    }),

  /** Save a project rate analysis as a new global/org preset. */
  saveFromAnalysis: protectedProcedure
    .input(
      z.object({
        rateAnalysisId: z.string(),
        presetName: z.string().min(1).max(200),
        source: z.string().default("Custom"),
        category: z.string().default("General"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!isOrgAdmin(ctx.user) && ctx.user.orgRole !== "org_admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required." });
      }
      const analysis = await db.rateAnalysis.findUnique({
        where: { id: input.rateAnalysisId },
        include: {
          ingredients: { orderBy: { sortOrder: "asc" } },
          boqItem: { select: { projectId: true } },
        },
      });
      if (!analysis) throw new TRPCError({ code: "NOT_FOUND", message: "Rate analysis not found." });

      // IDOR guard: the source rate analysis must belong to a project
      // the caller can access. Without this, an org admin could pull
      // rate analyses from any project across tenants into their own
      // org preset library.
      if (analysis.boqItem?.projectId) {
        const { assertProjectMember } = await import("@/lib/authz");
        try {
          await assertProjectMember(ctx.user, analysis.boqItem.projectId);
        } catch {
          throw new TRPCError({ code: "FORBIDDEN", message: "You don't have access to the project this rate analysis belongs to." });
        }
      }

      const preset = await db.globalPresetAnalysis.create({
        data: {
          organizationId: ctx.user.organizationId ?? null,
          name: input.presetName,
          source: input.source,
          category: input.category,
          batchSize: analysis.batchSize,
          scope: ctx.user.organizationId ? "org" : "global",
          ingredients: {
            create: analysis.ingredients.map((ing) => ({
              name: ing.name,
              type: ing.type,
              calcMode: ing.calcMode,
              quantity: ing.quantity,
              unit: ing.unit,
              percentage: ing.percentage,
              pctBase: ing.pctBase,
              rate: ing.rate,
              amount: ing.amount,
              sortOrder: ing.sortOrder,
              catalogMaterialId: ing.catalogMaterialId,
            })),
          },
        },
        include: { ingredients: true },
      });

      return { preset, ingredientsCopied: analysis.ingredients.length };
    }),

  // ─── Org-Level Preset Catalog ────────────────────────────────

  /** List presets for an organization (includes global presets). */
  listOrg: protectedProcedure
    .input(
      z.object({
        organizationId: z.string().optional(),
        category: z.string().optional(),
        q: z.string().optional(),
        includeGlobal: z.boolean().default(true),
      })
    )
    .query(async ({ ctx, input }) => {
      const orgId = input.organizationId ?? ctx.user.organizationId;
      const where: any = [];
      if (orgId && input.includeGlobal) {
        where.push({ organizationId: null }, { organizationId: orgId });
      } else if (orgId) {
        where.push({ organizationId: orgId });
      } else {
        where.push({ organizationId: null });
      }

      const queryWhere: any = where.length > 0 ? { OR: where } : {};
      if (input.category && input.category !== "all") queryWhere.category = input.category;
      if (input.q) queryWhere.name = { contains: input.q, mode: "insensitive" };

      const presets = await db.globalPresetAnalysis.findMany({
        where: queryWhere,
        include: { _count: { select: { ingredients: true } } },
        orderBy: [{ category: "asc" }, { name: "asc" }],
        take: 500,
      });
      return { presets };
    }),

  /** Import a global preset to the organization. */
  importGlobal: protectedProcedure
    .input(
      z.object({
        presetId: z.string(),
        organizationId: z.string().optional(),
        name: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const globalPreset = await db.globalPresetAnalysis.findUnique({
        where: { id: input.presetId },
        include: { ingredients: true },
      });
      if (!globalPreset || globalPreset.organizationId !== null) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Global preset not found." });
      }
      const orgId = input.organizationId ?? ctx.user.organizationId;
      if (!orgId) throw new TRPCError({ code: "BAD_REQUEST", message: "Organization ID required." });

      // IDOR guard: the caller must be an org admin of the target org.
      // Without this, an org admin of Org A could import a global preset
      // into Org B by passing `organizationId: orgB_id`.
      if (!ctx.user.isSuperAdmin) {
        if (orgId !== ctx.user.organizationId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "You can only import presets into your own organization." });
        }
        if (!isOrgAdmin(ctx.user) && ctx.user.orgRole !== "org_admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Only organization admins can import presets." });
        }
      }

      const preset = await db.globalPresetAnalysis.create({
        data: {
          organizationId: orgId,
          name: input.name ?? globalPreset.name,
          source: globalPreset.source,
          category: globalPreset.category,
          description: globalPreset.description,
          batchSize: globalPreset.batchSize,
          fiscalYear: globalPreset.fiscalYear,
          scope: "org",
          sourcePresetId: globalPreset.id,
          ingredients: {
            create: globalPreset.ingredients.map((ing) => ({
              name: ing.name,
              type: ing.type,
              calcMode: ing.calcMode,
              quantity: ing.quantity,
              unit: ing.unit,
              percentage: ing.percentage,
              pctBase: ing.pctBase,
              rate: ing.rate,
              amount: ing.amount,
              sortOrder: ing.sortOrder,
              catalogMaterialId: ing.catalogMaterialId,
            })),
          },
        },
      });
      return { preset };
    }),

  /** Copy a preset with optional rate inflation (for the active fiscal year). */
  copyWithInflation: protectedProcedure
    .input(
      z.object({
        sourcePresetId: z.string(),
        name: z.string(),
        fiscalYear: z.string().optional(),
        inflationPct: z.number().default(0),
        organizationId: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const source = await db.globalPresetAnalysis.findUnique({
        where: { id: input.sourcePresetId },
        include: { ingredients: true },
      });
      if (!source) throw new TRPCError({ code: "NOT_FOUND", message: "Source preset not found." });

      const orgId = input.organizationId ?? ctx.user.organizationId;
      const factor = 1 + input.inflationPct / 100;

      const preset = await db.globalPresetAnalysis.create({
        data: {
          organizationId:
            source.organizationId === null && !isOrgAdmin(ctx.user) ? orgId : source.organizationId,
          name: input.name,
          source: source.source,
          category: source.category,
          description: source.description,
          batchSize: source.batchSize,
          fiscalYear: input.fiscalYear ?? source.fiscalYear,
          scope: "org",
          ingredients: {
            create: source.ingredients.map((ing) => ({
              name: ing.name,
              type: ing.type,
              calcMode: ing.calcMode,
              quantity: ing.quantity,
              unit: ing.unit,
              percentage: ing.percentage,
              pctBase: ing.pctBase,
              rate: ing.calcMode === "fixed" ? Math.round(ing.rate * factor) : ing.rate,
              amount: ing.calcMode === "fixed" ? Math.round(ing.amount * factor) : ing.amount,
              sortOrder: ing.sortOrder,
              catalogMaterialId: ing.catalogMaterialId,
            })),
          },
        },
      });
      return { preset };
    }),
});
