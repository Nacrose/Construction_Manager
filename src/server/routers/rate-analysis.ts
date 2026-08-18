// @ts-nocheck
/**
 * tRPC router for rate analyses and their ingredients.
 * Replaces: boq/[itemId]/rate-analyses/*, boq/[itemId]/ingredients/*
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "@/server/trpc";
import { db } from "@/lib/db";
import { getDefaultLibraryId } from "@/lib/default-library";
import { assertProjectMember, assertCanWrite } from "@/lib/authz";
import { audit } from "@/lib/audit";
import { recalcItemRate, recalcAnalysis } from "@/server/utils/boq-calc";
import type { AuthUser } from "@/lib/auth";

// ─── Zod schemas ───────────────────────────────────────────────

const CreateAnalysisSchema = z.object({
  itemId: z.string(),
  name: z.string().min(1).max(100),
  batchSize: z.number().min(0).default(1),
  isDefault: z.boolean().default(false),
});

const UpdateAnalysisSchema = z.object({
  itemId: z.string(),
  analysisId: z.string(),
  name: z.string().optional(),
  batchSize: z.number().optional(),
  isDefault: z.boolean().optional(),
});

const CreateIngredientSchema = z.object({
  itemId: z.string(),
  rateAnalysisId: z.string().optional(),
  name: z.string().min(1).max(200),
  type: z.enum(["material", "labor", "equipment", "overhead"]),
  calcMode: z.enum(["fixed", "percentage"]).default("fixed"),
  quantity: z.number().min(0).default(0),
  unit: z.string().default(""),
  percentage: z.number().min(0).max(100).default(0),
  pctBase: z.string().default(""),
  rate: z.number().min(0).default(0),
  sortOrder: z.number().default(0),
});

const UpdateIngredientSchema = z.object({
  itemId: z.string(),
  ingredientId: z.string(),
  rateAnalysisId: z.string().optional(),
  name: z.string().min(1).max(200).optional(),
  type: z.enum(["material", "labor", "equipment", "overhead"]).optional(),
  calcMode: z.enum(["fixed", "percentage"]).optional(),
  quantity: z.number().min(0).optional(),
  unit: z.string().optional(),
  percentage: z.number().min(0).max(100).optional(),
  pctBase: z.string().optional(),
  rate: z.number().min(0).optional(),
});

// ─── Helper: resolve item + assert access ──────────────────────

/**
 * Load a BOQ item by ID and assert the user's access to its project.
 *
 * @param user         The authenticated user (from tRPC context)
 * @param itemId       The BOQ item ID to load
 * @param requireWrite If true, requires write access (excludes client/inspector)
 * @returns            The BOQ item with id, projectId, and code
 * @throws             TRPCError NOT_FOUND if item doesn't exist
 * @throws             TRPCError FORBIDDEN if user is not a project member
 * @throws             TRPCError FORBIDDEN if user is read-only and requireWrite=true
 */
async function resolveItemAndAssert(
  user: AuthUser,
  itemId: string,
  requireWrite: boolean
): Promise<{ id: string; projectId: string; code: string }> {
  const item = await db.boqItem.findUnique({
    where: { id: itemId },
    select: { id: true, projectId: true, code: true },
  });
  if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "BOQ item not found." });

  try {
    if (requireWrite) {
      await assertCanWrite(user, item.projectId);
    } else {
      await assertProjectMember(user, item.projectId);
    }
  } catch (err) {
    throw authErrorToTRPC(err);
  }
  return item;
}

/** Convert an auth error (FORBIDDEN, READ_ONLY, etc.) to a TRPCError. */
export function authErrorToTRPC(err: unknown): TRPCError {
  const code = err instanceof Error ? err.message : "UNKNOWN";
  switch (code) {
    case "FORBIDDEN":
      return new TRPCError({ code: "FORBIDDEN", message: "You are not a member of this project." });
    case "READ_ONLY":
      return new TRPCError({ code: "FORBIDDEN", message: "Your role on this project is read-only." });
    case "REQUIRES_ADMIN":
      return new TRPCError({ code: "FORBIDDEN", message: "This action requires admin role." });
    case "REQUIRES_PROJECT_MANAGER":
      return new TRPCError({ code: "FORBIDDEN", message: "This action requires Project Manager role." });
    default:
      return new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Authorization check failed." });
  }
}

// ─── Router ────────────────────────────────────────────────────

export const rateAnalysisRouter = router({
  /** List all rate analyses for a BOQ item, with ingredients. */
  list: protectedProcedure
    .input(z.object({ itemId: z.string() }))
    .query(async ({ ctx, input }) => {
      const item = await db.boqItem.findUnique({
        where: { id: input.itemId },
        select: { id: true, projectId: true, code: true, description: true, unit: true, quantity: true, rate: true },
      });
      if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "BOQ item not found." });
      await assertProjectMember(ctx.user, item.projectId);

      const analyses = await db.rateAnalysis.findMany({
        where: { boqItemId: input.itemId, libraryId: { not: null } },
        include: { ingredients: { orderBy: { sortOrder: "asc" } } },
        orderBy: { createdAt: "asc" },
      });

      return { item, analyses };
    }),

  /** Create a new rate analysis. */
  create: protectedProcedure
    .input(CreateAnalysisSchema)
    .mutation(async ({ ctx, input }) => {
      const _item = await resolveItemAndAssert(ctx.user, input.itemId, true);

      // If setting as default, unset other defaults
      if (input.isDefault) {
        await db.rateAnalysis.updateMany({
          where: { boqItemId: input.itemId, isDefault: true },
          data: { isDefault: false },
        });
      }

      const analysis = await db.rateAnalysis.create({
        data: {
          boqItemId: input.itemId,
          name: input.name,
          batchSize: input.batchSize,
          isDefault: input.isDefault,
        },
      });

      return { analysis };
    }),

  /** Update analysis metadata (name, batchSize, isDefault). */
  update: protectedProcedure
    .input(UpdateAnalysisSchema)
    .mutation(async ({ ctx, input }) => {
      const { itemId, analysisId, ...data } = input;
      await resolveItemAndAssert(ctx.user, itemId, true);

      const analysis = await db.rateAnalysis.findUnique({
        where: { id: analysisId },
        select: { boqItemId: true },
      });
      if (!analysis || analysis.boqItemId !== itemId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Analysis not found." });
      }

      if (data.isDefault) {
        await db.rateAnalysis.updateMany({
          where: { boqItemId: itemId, isDefault: true },
          data: { isDefault: false },
        });
      }

      const updated = await db.rateAnalysis.update({
        where: { id: analysisId },
        data: {
          ...(data.name !== undefined && { name: data.name }),
          ...(data.batchSize !== undefined && { batchSize: data.batchSize }),
          ...(data.isDefault !== undefined && { isDefault: data.isDefault }),
        },
      });

      return { analysis: updated };
    }),

  /** Delete an analysis and its ingredients. */
  deleteAnalysis: protectedProcedure
    .input(z.object({ itemId: z.string(), analysisId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await resolveItemAndAssert(ctx.user, input.itemId, true);

      const analysis = await db.rateAnalysis.findUnique({
        where: { id: input.analysisId },
        select: { boqItemId: true },
      });
      if (!analysis || analysis.boqItemId !== input.itemId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Analysis not found." });
      }

      await db.rateAnalysis.delete({ where: { id: input.analysisId } });
      return { ok: true };
    }),

  /** List ingredients for a specific analysis. */
  listIngredients: protectedProcedure
    .input(z.object({ itemId: z.string(), analysisId: z.string() }))
    .query(async ({ ctx, input }) => {
      const item = await db.boqItem.findUnique({
        where: { id: input.itemId },
        select: { projectId: true, unit: true, quantity: true },
      });
      if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "BOQ item not found." });
      await assertProjectMember(ctx.user, item.projectId);

      const analysis = await db.rateAnalysis.findUnique({
        where: { id: input.analysisId },
        include: { ingredients: { orderBy: { sortOrder: "asc" } } },
      });
      if (!analysis || analysis.boqItemId !== input.itemId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Analysis not found." });
      }

      return { analysis, itemUnit: item.unit, itemQty: item.quantity };
    }),

  /** Add an ingredient (to item directly, or to a rate analysis). */
  addIngredient: protectedProcedure
    .input(CreateIngredientSchema)
    .mutation(async ({ ctx, input }) => {
      const item = await resolveItemAndAssert(ctx.user, input.itemId, true);

      let amount = 0;
      if (input.calcMode === "fixed") {
        amount = (input.quantity + (input.quantity * input.percentage) / 100) * input.rate;
      }

      const ingredient = await db.boqIngredient.create({
        data: {
          boqItemId: input.itemId,
          rateAnalysisId: input.rateAnalysisId || null,
          name: input.name,
          type: input.type,
          calcMode: input.calcMode,
          quantity: input.quantity,
          unit: input.unit,
          percentage: input.percentage,
          pctBase: input.pctBase,
          rate: input.rate,
          amount,
          sortOrder: input.sortOrder,
        },
      });

      // Auto-record unrecognized materials
      if (ctx.user.organizationId && input.materialCatalogId == null) {
        const normalizedName = input.name.toLowerCase().trim().replace(/\s+/g, " ");
        const inCatalog = await db.materialCatalog.findFirst({
          where: { organizationId: ctx.user.organizationId, normalizedName },
        });
        if (!inCatalog) {
          const existing = await db.unrecognizedMaterial.findFirst({
            where: { organizationId: ctx.user.organizationId, normalizedName },
          });
          if (existing) {
            await db.unrecognizedMaterial.update({
              where: { id: existing.id },
              data: { count: existing.count + 1, unit: input.unit || existing.unit, lastUsedAt: new Date() },
            });
          } else {
            await db.unrecognizedMaterial.create({
              data: {
                organizationId: ctx.user.organizationId,
                name: input.name,
                normalizedName,
                unit: input.unit || null,
                firstProjectId: item.projectId,
              },
            });
          }
        }
      }

      // Recalculate
      if (input.rateAnalysisId) {
        await recalcAnalysis(input.rateAnalysisId, input.itemId);
      } else {
        await recalcItemRate(input.itemId);
      }

      await audit({
        userId: ctx.user.id,
        projectId: item.projectId,
        action: "boq.ingredient.add",
        entityType: "boq_item",
        entityId: input.itemId,
        metadata: { code: item.code, ingredient: input.name },
      });

      return { ingredient };
    }),

  /** Update an ingredient. */
  updateIngredient: protectedProcedure
    .input(UpdateIngredientSchema)
    .mutation(async ({ ctx, input }) => {
      const { itemId, ingredientId, rateAnalysisId, ...data } = input;
      const item = await resolveItemAndAssert(ctx.user, itemId, true);

      const ingredient = await db.boqIngredient.findUnique({ where: { id: ingredientId } });
      if (!ingredient || ingredient.boqItemId !== itemId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Ingredient not found." });
      }

      const quantity = data.quantity ?? ingredient.quantity;
      const rate = data.rate ?? ingredient.rate;
      const percentage = data.percentage ?? ingredient.percentage;
      const calcMode = data.calcMode ?? ingredient.calcMode;

      let amount = ingredient.amount;
      if (calcMode === "fixed") {
        amount = (quantity + (quantity * percentage) / 100) * rate;
      }

      const updated = await db.boqIngredient.update({
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
          amount,
        },
      });

      // Recalculate
      const analysisId = rateAnalysisId || ingredient.rateAnalysisId;
      if (analysisId) {
        await recalcAnalysis(analysisId, itemId);
      } else {
        await recalcItemRate(itemId);
      }

      await audit({
        userId: ctx.user.id,
        projectId: item.projectId,
        action: "boq.ingredient.update",
        entityType: "boq_item",
        entityId: itemId,
        metadata: { code: item.code, ingredient: updated.name },
      });

      return { ingredient: updated };
    }),

  /** Delete all ingredients of a rate analysis. */
  deleteIngredientsOfAnalysis: protectedProcedure
    .input(z.object({ itemId: z.string(), analysisId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await resolveItemAndAssert(ctx.user, input.itemId, true);
      const analysis = await db.rateAnalysis.findUnique({
        where: { id: input.analysisId },
        select: { boqItemId: true },
      });
      if (!analysis || analysis.boqItemId !== input.itemId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Analysis not found." });
      }

      await db.boqIngredient.deleteMany({ where: { rateAnalysisId: input.analysisId } });
      await recalcAnalysis(input.analysisId, input.itemId);
      return { ok: true };
    }),

  /** Delete an ingredient. */
  deleteIngredient: protectedProcedure
    .input(z.object({ itemId: z.string(), ingredientId: z.string(), rateAnalysisId: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const item = await resolveItemAndAssert(ctx.user, input.itemId, true);

      const ingredient = await db.boqIngredient.findUnique({
        where: { id: input.ingredientId },
        select: { boqItemId: true, rateAnalysisId: true },
      });
      if (!ingredient || ingredient.boqItemId !== input.itemId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Ingredient not found." });
      }

      await db.boqIngredient.delete({ where: { id: input.ingredientId } });

      // Recalculate
      const analysisId = input.rateAnalysisId || ingredient.rateAnalysisId;
      if (analysisId) {
        await recalcAnalysis(analysisId, input.itemId);
      } else {
        await recalcItemRate(input.itemId);
      }

      await audit({
        userId: ctx.user.id,
        projectId: item.projectId,
        action: "boq.ingredient.delete",
        entityType: "boq_item",
        entityId: input.itemId,
        metadata: { code: item.code },
      });

      return { ok: true };
    }),

  /**
   * Get aggregated resource requirements from the project's default library (or a specific purpose if provided).
   * Returns materials, labor, equipment grouped by type with total quantities
   * and estimated costs — live data source for procurement & planning.
   *
   * Resource calculation:
   *   Ingredients in a RateAnalysis are per-batch (of size analysis.batchSize).
   *   To get per-BOQ-unit quantities: ingQty / batchSize
   *   To get total quantities for the BOQ line: ingQty / batchSize * boqItem.quantity
   *   To get total cost: totalQty * ing.rate
   */
  getResources: protectedProcedure
    .input(z.object({ projectId: z.string(), purpose: z.enum(["client_estimate", "contractor_bid", "contractor_actual"]).optional() }))
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);

      // If caller specifies a purpose (e.g. "contractor_bid"), filter by it.
      // Otherwise, fall back to the project's default library — keeps the
      // app consistent with whatever the PM chose as the default.
      const defaultLibId = await getDefaultLibraryId(input.projectId);
      const ingredientFilter = input.purpose
        ? { rateAnalysis: { library: { purpose: input.purpose } } }
        : defaultLibId
          ? { rateAnalysis: { libraryId: defaultLibId } }
          : { rateAnalysis: { library: { purpose: "client_estimate" as const } } };

      const boqItems = await db.boqItem.findMany({
        where: { projectId: input.projectId },
        include: {
          ingredients: {
            where: ingredientFilter as any,
            include: { rateAnalysis: { select: { batchSize: true } } },
          },
        },
      });

      // Aggregate: type -> name -> { totalQty, totalCost }
      const materials = new Map<string, { qty: number; cost: number; unit: string }>();
      const labor = new Map<string, { qty: number; cost: number; unit: string }>();
      const equipment = new Map<string, { qty: number; cost: number; unit: string }>();

      for (const item of boqItems) {
        for (const ing of item.ingredients) {
          // Ingredient quantity is per-batch; divide by batchSize to get per-BOQ-unit qty,
          // then multiply by boqItem.quantity to get the total qty needed for this BOQ line.
          const batch = ing.rateAnalysis?.batchSize && ing.rateAnalysis.batchSize > 0
            ? ing.rateAnalysis.batchSize
            : 1;
          const perUnitQty = ing.quantity / batch;
          const totalQty = item.quantity * perUnitQty;
          const totalCost = ing.rate * totalQty;
          const key = `${ing.name}|${ing.unit}`;
          const map = ing.type === "labor" ? labor : ing.type === "equipment" ? equipment : materials;
          const existing = map.get(key);
          if (existing) {
            existing.qty += totalQty;
            existing.cost += totalCost;
          } else {
            map.set(key, { qty: totalQty, cost: totalCost, unit: ing.unit });
          }
        }
      }

      const toArray = (m: Map<string, { qty: number; cost: number; unit: string }>) =>
        Array.from(m.entries()).map(([key, val]) => {
          const [name] = key.split("|");
          return { name, unit: val.unit, totalQty: val.qty, totalCost: val.cost };
        }).sort((a, b) => b.totalCost - a.totalCost);

      return {
        materials: toArray(materials),
        labor: toArray(labor),
        equipment: toArray(equipment),
        boqItemCount: boqItems.length,
      };
    }),
});
