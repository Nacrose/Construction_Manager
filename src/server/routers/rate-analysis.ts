/**
 * tRPC router for rate analyses and their ingredients.
 * Replaces: boq/[itemId]/rate-analyses/*, boq/[itemId]/ingredients/*
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "@/server/trpc";
import { withOrgContext } from "@/lib/rls";
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
  batchSize: z.number().positive().default(1),
  isDefault: z.boolean().default(false),
});

const UpdateAnalysisSchema = z.object({
  itemId: z.string(),
  analysisId: z.string(),
  name: z.string().optional(),
  batchSize: z.number().positive().optional(),
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
  materialId: z.string().optional().nullable(),
  catalogMaterialId: z.string().optional().nullable(),
  materialCatalogId: z.string().optional().nullable(),
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
  materialId: z.string().optional().nullable(),
  catalogMaterialId: z.string().optional().nullable(),
  materialCatalogId: z.string().optional().nullable(),
});

// ─── Helper: resolve item + assert access ──────────────────────

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
  // Modern authz helpers (assertCanWrite / assertProjectMember / ...) throw
  // TRPCError with the correct tRPC code already. Pass them through
  // untouched — remapping by message would downgrade a clean FORBIDDEN
  // into INTERNAL_SERVER_ERROR ("Authorization check failed"), turning a
  // routine 403 into a 500.
  if (err instanceof TRPCError) return err;
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
        include: {
          ingredients: {
            orderBy: { sortOrder: "asc" },
            include: {
              material: { select: { id: true, name: true, unit: true, resourceType: true, code: true } },
              catalogMaterial: { select: { id: true, name: true, defaultUnit: true, resourceType: true } },
            },
          },
        },
        orderBy: { createdAt: "asc" },
        take: 200, // analyses of a single BOQ item; cap is a safety net
      });

      return { item, analyses };
    }),

  /** List ingredients for an item (and optional analysisId) */
  listIngredients: protectedProcedure
    .input(z.object({ itemId: z.string(), analysisId: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const item = await resolveItemAndAssert(ctx.user, input.itemId, false);
      const [ingredients, analysis] = await Promise.all([
        db.boqIngredient.findMany({
          where: {
            boqItemId: item.id,
            ...(input.analysisId ? { rateAnalysisId: input.analysisId } : {}),
          },
          orderBy: { sortOrder: "asc" },
          take: 1000,
          include: {
            material: { select: { id: true, name: true, unit: true, resourceType: true, code: true } },
            catalogMaterial: { select: { id: true, name: true, defaultUnit: true, resourceType: true } },
          },
        }),
        input.analysisId
          ? db.rateAnalysis.findUnique({
              where: { id: input.analysisId },
              select: { id: true, name: true, batchSize: true, isDefault: true },
            })
          : null,
      ]);
      return {
        ingredients,
        analysis: analysis
          ? { ...analysis, ingredients }
          : { id: "", name: "Default", batchSize: 1, isDefault: true, ingredients },
      };
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
      const item = await resolveItemAndAssert(ctx.user, input.itemId, true);
      const analysis = await db.rateAnalysis.findUnique({
        where: { id: input.analysisId },
        select: { boqItemId: true, name: true },
      });
      if (!analysis || analysis.boqItemId !== input.itemId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Analysis not found." });
      }

      await db.rateAnalysis.delete({ where: { id: input.analysisId } });

      await audit({
        userId: ctx.user.id,
        projectId: item.projectId,
        action: "boq.analysis.delete",
        entityType: "boq_item",
        entityId: input.itemId,
        metadata: { code: item.code, analysisName: analysis.name },
      });

      return { ok: true };
    }),

  /** Add an ingredient to a BOQ item (or to a specific rate analysis). */
  addIngredient: protectedProcedure
    .input(CreateIngredientSchema)
    .mutation(async ({ ctx, input }) => {
      const item = await resolveItemAndAssert(ctx.user, input.itemId, true);

      let amount = 0;
      if (input.calcMode === "fixed") {
        amount = (input.quantity + (input.quantity * input.percentage) / 100) * input.rate;
      }

      let finalName = input.name;
      let finalUnit = input.unit;
      let linkedCatalogMaterialId = input.catalogMaterialId || input.materialCatalogId || null;

      // If materialId is provided (from project Resource Library), auto-fill details
      if (input.materialId) {
        const resource = await db.material.findUnique({
          where: { id: input.materialId },
          select: { id: true, name: true, unit: true, catalogMaterialId: true },
        });
        if (resource) {
          finalName = resource.name;
          finalUnit = resource.unit || finalUnit;
          if (!linkedCatalogMaterialId && resource.catalogMaterialId) {
            linkedCatalogMaterialId = resource.catalogMaterialId;
          }
        }
      }

      const ingredient = await db.boqIngredient.create({
        data: {
          boqItemId: input.itemId,
          rateAnalysisId: input.rateAnalysisId || null,
          name: finalName,
          type: input.type,
          calcMode: input.calcMode,
          quantity: input.quantity,
          unit: finalUnit,
          percentage: input.percentage,
          pctBase: input.pctBase,
          rate: input.rate,
          amount,
          sortOrder: input.sortOrder,
          materialId: input.materialId || null,
          catalogMaterialId: linkedCatalogMaterialId,
        },
      });

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
        metadata: { code: item.code, ingredient: finalName },
      });

      return { ingredient };
    }),

  /** Update an ingredient. */
  updateIngredient: protectedProcedure
    .input(UpdateIngredientSchema)
    .mutation(async ({ ctx, input }) => {
      const { itemId, ingredientId, rateAnalysisId, materialId, catalogMaterialId, materialCatalogId, ...data } = input;
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

      const finalCatalogId =
        catalogMaterialId !== undefined
          ? catalogMaterialId
          : materialCatalogId !== undefined
          ? materialCatalogId
          : undefined;

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
          ...(materialId !== undefined && { materialId }),
          ...(finalCatalogId !== undefined && { catalogMaterialId: finalCatalogId }),
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

  /** Atomically copy all ingredients from source analysis to target analysis. */
  copyIngredients: protectedProcedure
    .input(
      z.object({
        itemId: z.string(),
        sourceAnalysisId: z.string(),
        targetAnalysisId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const item = await resolveItemAndAssert(ctx.user, input.itemId, true);

      if (input.sourceAnalysisId === input.targetAnalysisId) {
        return { ok: true, copiedCount: 0 };
      }

      const sourceAnalysis = await db.rateAnalysis.findUnique({
        where: { id: input.sourceAnalysisId },
        select: { id: true, boqItemId: true },
      });
      const targetAnalysis = await db.rateAnalysis.findUnique({
        where: { id: input.targetAnalysisId },
        select: { id: true, boqItemId: true },
      });

      if (!sourceAnalysis || !targetAnalysis) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Source or target rate analysis not found." });
      }

      const sourceIngredients = await db.boqIngredient.findMany({
        where: { rateAnalysisId: input.sourceAnalysisId },
        orderBy: { sortOrder: "asc" },
      });

      await db.$transaction(async (tx) => {
        await withOrgContext(tx, ctx.user.organizationId, !!ctx.user.isSuperAdmin);
        await tx.boqIngredient.deleteMany({
          where: { rateAnalysisId: input.targetAnalysisId },
        });

        if (sourceIngredients.length > 0) {
          await tx.boqIngredient.createMany({
            data: sourceIngredients.map((ing) => ({
              boqItemId: input.itemId,
              rateAnalysisId: input.targetAnalysisId,
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
              materialId: ing.materialId,
              catalogMaterialId: ing.catalogMaterialId,
            })),
          });
        }
      });

      await recalcAnalysis(input.targetAnalysisId, input.itemId);

      await audit({
        userId: ctx.user.id,
        projectId: item.projectId,
        action: "boq.ingredient.copy",
        entityType: "boq_item",
        entityId: input.itemId,
        metadata: {
          code: item.code,
          sourceAnalysisId: input.sourceAnalysisId,
          targetAnalysisId: input.targetAnalysisId,
          count: sourceIngredients.length,
        },
      });

      return { ok: true, copiedCount: sourceIngredients.length };
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
   */
  getResources: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        purpose: z.enum(["client_estimate", "contractor_bid", "contractor_actual"]).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);

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
            include: {
              rateAnalysis: { select: { batchSize: true } },
              material: { select: { id: true, name: true, unit: true, code: true, resourceType: true } },
            },
          },
        },
        take: 2000, // resource picker feed; cap is a runaway net
      });

      const materials = new Map<string, { name: string; qty: number; cost: number; unit: string; resourceId?: string | null }>();
      const labor = new Map<string, { name: string; qty: number; cost: number; unit: string; resourceId?: string | null }>();
      const equipment = new Map<string, { name: string; qty: number; cost: number; unit: string; resourceId?: string | null }>();

      for (const item of boqItems) {
        for (const ing of item.ingredients) {
          const isDirectIngredient = !ing.rateAnalysisId;
          let totalQty: number;
          let totalCost: number;

          if (isDirectIngredient) {
            // Direct ingredients represent the TOTAL quantity for the entire BOQ item
            totalQty = ing.quantity;
            totalCost = ing.amount || (ing.rate * ing.quantity);
          } else {
            // Rate analysis ingredients represent the quantity per batch
            const batch =
              ing.rateAnalysis?.batchSize && ing.rateAnalysis.batchSize > 0
                ? ing.rateAnalysis.batchSize
                : 1;
            const perUnitQty = ing.quantity / batch;
            totalQty = item.quantity * perUnitQty;
            totalCost = ing.rate * totalQty;
          }
          
          // Use materialId as key when available for 100% exact deduplication, fallback to name|unit
          const key = ing.materialId ? `id:${ing.materialId}` : `name:${(ing.material?.name || ing.name).toLowerCase().trim()}|${ing.unit}`;
          const displayName = ing.material?.name || ing.name;
          const displayUnit = ing.material?.unit || ing.unit;

          const map = ing.type === "labor" ? labor : ing.type === "equipment" ? equipment : materials;
          const existing = map.get(key);
          if (existing) {
            existing.qty += totalQty;
            existing.cost += totalCost;
          } else {
            map.set(key, { name: displayName, qty: totalQty, cost: totalCost, unit: displayUnit, resourceId: ing.materialId });
          }
        }
      }

      const toArray = (m: Map<string, { name: string; qty: number; cost: number; unit: string; resourceId?: string | null }>) =>
        Array.from(m.values())
          .map((val) => ({
            name: val.name,
            unit: val.unit,
            totalQty: val.qty,
            totalCost: val.cost,
            resourceId: val.resourceId,
          }))
          .sort((a, b) => b.totalCost - a.totalCost);

      return {
        materials: toArray(materials),
        labor: toArray(labor),
        equipment: toArray(equipment),
        boqItemCount: boqItems.length,
      };
    }),
});
