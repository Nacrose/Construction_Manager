import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure } from "@/server/trpc";
import { db } from "@/lib/db";
import { assertProjectMember, assertCanWrite } from "@/lib/authz";

export const materialIngredientsProcedures = {
  linkIngredient: protectedProcedure
    .input(z.object({
      ingredientId: z.string(),
      materialId: z.string().nullable(),
      projectId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertCanWrite(ctx.user, input.projectId);

      const ingredient = await db.boqIngredient.findUnique({
        where: { id: input.ingredientId },
        include: { boqItem: { select: { projectId: true } } },
      });
      if (!ingredient) throw new TRPCError({ code: "NOT_FOUND", message: "Ingredient not found." });
      if (ingredient.boqItem.projectId !== input.projectId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Ingredient doesn't belong to this project." });
      }

      const updated = await db.boqIngredient.update({
        where: { id: input.ingredientId },
        data: { materialId: input.materialId },
      });

      return { ingredient: updated };
    }),

  autoMatchIngredients: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertCanWrite(ctx.user, input.projectId);

      const ingredients = await db.boqIngredient.findMany({
        where: {
          type: "material",
          materialId: null,
          boqItem: { projectId: input.projectId },
        },
        include: { boqItem: { select: { code: true } } },
      });

      if (ingredients.length === 0) {
        return { matched: 0, unmatched: 0, total: 0 };
      }

      const materials = await db.material.findMany({
        where: { projectId: input.projectId },
        select: { id: true, name: true },
      });

      const materialByName = new Map<string, string>();
      for (const m of materials) {
        materialByName.set(m.name.toLowerCase(), m.id);
        const cleanName = m.name.toLowerCase().replace(/\s+\d+\s*(grade|type)?$/i, "").trim();
        if (cleanName) materialByName.set(cleanName, m.id);
      }

      let matched = 0;
      let unmatched = 0;
      const unmatchedNames: string[] = [];

      for (const ing of ingredients) {
        const ingName = ing.name.toLowerCase().trim();
        let materialId: string | null = null;

        if (materialByName.has(ingName)) {
          materialId = materialByName.get(ingName)!;
        } else {
          for (const [matName, matId] of materialByName.entries()) {
            if (matName.includes(ingName) || ingName.includes(matName)) {
              materialId = matId;
              break;
            }
          }
        }

        if (materialId) {
          await db.boqIngredient.update({
            where: { id: ing.id },
            data: { materialId },
          });
          matched++;
        } else {
          unmatched++;
          if (!unmatchedNames.includes(ing.name)) unmatchedNames.push(ing.name);
        }
      }

      return {
        matched,
        unmatched,
        total: ingredients.length,
        unmatchedNames: unmatchedNames.slice(0, 20),
      };
    }),

  ingredientLinks: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);

      const ingredients = await db.boqIngredient.findMany({
        where: {
          type: "material",
          boqItem: { projectId: input.projectId },
        },
        include: {
          boqItem: { select: { id: true, code: true, description: true } },
          material: { select: { id: true, name: true, code: true, unit: true, currentStock: true } },
        },
        orderBy: { boqItem: { code: "asc" } },
      });

      return { ingredients };
    }),
};
