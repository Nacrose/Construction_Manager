import { isOrgAdmin } from "@/lib/authz";
/**
 * tRPC router for global presets.
 * Replaces: global-presets/*, global-presets/[presetId]/load, global-presets/save-from-analysis
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "@/server/trpc";
import { db } from "@/lib/db";
import { assertCanWrite } from "@/lib/authz";
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
  type: z.string(),
  calcMode: z.enum(["fixed", "percentage"]).default("fixed"),
  quantity: z.number().default(0),
  unit: z.string().default(""),
  percentage: z.number().default(0),
  pctBase: z.string().default(""),
  rate: z.number().default(0),
  amount: z.number().default(0),
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
});

export const globalPresetRouter = router({
  /** List all global presets. */
  list: protectedProcedure
    .input(z.object({
      category: z.string().optional(),
      q: z.string().optional(),
      limit: z.number().min(1).max(500).default(500),
    }))
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
            ]
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
    .query(async ({ input }) => {
      const preset = await db.globalPresetAnalysis.findUnique({
        where: { id: input.presetId },
        include: { ingredients: { orderBy: { sortOrder: "asc" } } },
      });
      if (!preset) throw new TRPCError({ code: "NOT_FOUND", message: "Preset not found." });
      return { preset: { ...preset, ingredients: preset.ingredients ?? [] } };
    }),

  /** Create a new preset (empty, or with initial data). */
  create: protectedProcedure
    .input(CreatePresetSchema)
    .mutation(async ({ ctx, input }) => {
      // Only platform admins / org admins can manage global presets
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
      const { presetId, ...data } = input;
      const maxOrder = await db.globalPresetIngredient.aggregate({
        where: { presetId },
        _max: { sortOrder: true },
      });
      const ingredient = await db.globalPresetIngredient.create({
        data: {
          ...data,
          presetId,
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
      const { ingredientId, ...data } = input;
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

  /** Load a preset's ingredients into a target rate analysis, replacing existing ingredients.
   *  If rateCatalogId and district are provided, auto-fill rates from the catalog. */
  load: protectedProcedure
    .input(z.object({
      presetId: z.string(),
      rateAnalysisId: z.string(),
      boqItemId: z.string(),
      projectId: z.string(),
      rateCatalogId: z.string().optional(),
      district: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const boqItem = await db.boqItem.findUnique({
        where: { id: input.boqItemId },
        select: { projectId: true },
      });
      if (!boqItem) throw new TRPCError({ code: "NOT_FOUND", message: "BOQ item not found." });
      await assertCanWrite(ctx.user, boqItem.projectId);

      const preset = await db.globalPresetAnalysis.findUnique({
        where: { id: input.presetId },
        include: { ingredients: { orderBy: { sortOrder: "asc" } } },
      });
      if (!preset) throw new TRPCError({ code: "NOT_FOUND", message: "Preset not found." });

      const analysis = await db.rateAnalysis.findUnique({
        where: { id: input.rateAnalysisId },
        select: { id: true, boqItemId: true },
      });
      if (!analysis || analysis.boqItemId !== input.boqItemId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Rate analysis not found." });
      }

      // Pre-fetch catalog item rates for rate auto-pull
      let catalogRates = new Map<string, number>();
      if (input.rateCatalogId && input.district) {
        const items = await db.rateCatalogItem.findMany({
          where: { catalogId: input.rateCatalogId },
          include: { rates: { where: { district: input.district } } },
        });
        for (const item of items) {
          if (item.materialCatalogId && item.rates.length > 0) {
            catalogRates.set(item.materialCatalogId, item.rates[0].rate);
          }
        }
      }

      await db.boqIngredient.deleteMany({ where: { rateAnalysisId: input.rateAnalysisId } });

      for (const ing of preset.ingredients) {
        let rate = ing.rate;
        let unit = ing.unit;

        // Auto-pull rate from catalog if materialCatalogId is linked
        if (ing.materialCatalogId && catalogRates.has(ing.materialCatalogId)) {
          rate = catalogRates.get(ing.materialCatalogId)!;
        }

        let amount = ing.amount;
        if (ing.calcMode === "fixed") {
          const qtyWithPct = ing.quantity + (ing.quantity * ing.percentage) / 100;
          amount = qtyWithPct * rate;
        }

        await db.boqIngredient.create({
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
            materialCatalogId: ing.materialCatalogId,
          },
        });
      }

      await db.rateAnalysis.update({
        where: { id: input.rateAnalysisId },
        data: { batchSize: preset.batchSize },
      });

      await recalcAnalysis(input.rateAnalysisId, input.boqItemId);

      return {
        loaded: preset.ingredients.length,
        presetName: preset.name,
        batchSize: preset.batchSize,
        rateSource: input.district ? `${input.district}` : "preset default",
      };
    }),

  /** Save a project rate analysis as a new global preset. */
  saveFromAnalysis: protectedProcedure
    .input(z.object({
      rateAnalysisId: z.string(),
      presetName: z.string().min(1).max(200),
      source: z.string().default("Custom"),
      category: z.string().default("General"),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!isOrgAdmin(ctx.user) && ctx.user.orgRole !== "org_admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required." });
      }
      // Get the source analysis with ingredients
      const analysis = await db.rateAnalysis.findUnique({
        where: { id: input.rateAnalysisId },
        include: { ingredients: { orderBy: { sortOrder: "asc" } } },
      });
      if (!analysis) throw new TRPCError({ code: "NOT_FOUND", message: "Rate analysis not found." });

      // Create the global preset
      const preset = await db.globalPresetAnalysis.create({
        data: {
          name: input.presetName,
          source: input.source,
          category: input.category,
          batchSize: analysis.batchSize,
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
    .input(z.object({
      organizationId: z.string().optional(),
      category: z.string().optional(),
      q: z.string().optional(),
      includeGlobal: z.boolean().default(true),
    }))
    .query(async ({ ctx, input }) => {
      const orgId = input.organizationId ?? ctx.user.organizationId;
      const where: any = [];
      if (orgId && input.includeGlobal) where.push({ organizationId: null }, { organizationId: orgId });
      else if (orgId) where.push({ organizationId: orgId });
      else if (isOrgAdmin(ctx.user)) where.push({ organizationId: null });
      if (input.category) where.forEach((w: any) => w.category = input.category);
      if (input.q) where.forEach((w: any) => w.name = { contains: input.q, mode: "insensitive" });
      const presets = await db.globalPresetAnalysis.findMany({
        where: where.length > 0 ? { OR: where } : undefined,
        include: { _count: { select: { ingredients: true } } },
        orderBy: [{ category: "asc" }, { name: "asc" }],
        take: 500,
      });
      return { presets };
    }),

  /** Import a global preset to the organization. */
  importGlobal: protectedProcedure
    .input(z.object({
      presetId: z.string(),
      organizationId: z.string().optional(),
      name: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const globalPreset = await db.globalPresetAnalysis.findUnique({
        where: { id: input.presetId },
        include: { ingredients: true },
      });
      if (!globalPreset || globalPreset.organizationId !== null) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Global preset not found." });
      }
      const orgId = input.organizationId ?? ctx.user.organizationId;
      if (!orgId) throw new TRPCError({ code: "BAD_REQUEST" });

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
              materialCatalogId: ing.materialCatalogId,
            })),
          },
        },
      });
      return { preset };
    }),

  /** Copy a preset with optional rate inflation (for the active fiscal year). */
  copyWithInflation: protectedProcedure
    .input(z.object({
      sourcePresetId: z.string(),
      name: z.string(),
      fiscalYear: z.string().optional(),
      inflationPct: z.number().default(0),
      organizationId: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const source = await db.globalPresetAnalysis.findUnique({
        where: { id: input.sourcePresetId },
        include: { ingredients: true },
      });
      if (!source) throw new TRPCError({ code: "NOT_FOUND" });

      const orgId = input.organizationId ?? ctx.user.organizationId;
      const factor = 1 + input.inflationPct / 100;

      const preset = await db.globalPresetAnalysis.create({
        data: {
          organizationId: source.organizationId === null && !isOrgAdmin(ctx.user) ? orgId : source.organizationId,
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
              materialCatalogId: ing.materialCatalogId,
            })),
          },
        },
      });
      return { preset };
    }),
});
