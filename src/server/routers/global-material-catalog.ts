import { isOrgAdmin } from "@/lib/authz";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "@/server/trpc";
import { db } from "@/lib/db";

function normalize(s: string) {
  return s.toLowerCase().trim().replace(/[,.()\-]/g, " ").replace(/\s+/g, " ").split(" ").sort().join(" ");
}

export const globalMaterialCatalogRouter = router({
  list: protectedProcedure
    .input(z.object({
      search: z.string().optional(),
      category: z.string().optional(),
      isActive: z.boolean().optional(),
      limit: z.number().min(1).max(1000).default(200),
      cursor: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const where: any = {};
      if (input.isActive !== undefined) {
        where.isActive = input.isActive;
      }
      if (input.category) {
        where.category = input.category;
      }
      if (input.search) {
        const norm = normalize(input.search);
        where.OR = [
          { name: { contains: input.search, mode: "insensitive" } },
          { normalizedName: { contains: norm } },
          { aliases: { has: input.search } },
          { code: { contains: input.search, mode: "insensitive" } },
        ];
      }

      const items = await db.globalMaterialCatalog.findMany({
        where,
        orderBy: [{ category: "asc" }, { name: "asc" }],
        take: input.limit,
      });

      return { items };
    }),

  findSimilar: protectedProcedure
    .input(z.object({
      name: z.string(),
      threshold: z.number().min(0).max(1).default(0.35),
      limit: z.number().min(1).max(50).default(8),
    }))
    .query(async ({ input }) => {
      const { findSimilarMaterials } = await import("@/lib/fuzzy-match");
      const matches = await findSimilarMaterials({
        name: input.name,
        scope: "global",
        threshold: input.threshold,
        limit: input.limit,
      });
      return { matches };
    }),

  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const item = await db.globalMaterialCatalog.findUnique({
        where: { id: input.id },
        include: {
          _count: {
            select: {
              orgEntries: true,
              rateCatalogItems: true,
              boqIngredients: true,
            },
          },
        },
      });
      if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Global material not found." });
      return { item };
    }),

  categories: protectedProcedure
    .query(async () => {
      const items = await db.globalMaterialCatalog.findMany({
        where: { isActive: true },
        select: { category: true },
        distinct: ["category"],
        orderBy: { category: "asc" },
      });
      const categories = items.map((i) => i.category).filter((c): c is string => Boolean(c));
      return { categories };
    }),

  create: protectedProcedure
    .input(z.object({
      name: z.string().min(1).max(200),
      code: z.string().optional().nullable(),
      category: z.string().optional().nullable(),
      subCategory: z.string().optional().nullable(),
      defaultUnit: z.string().optional().nullable(),
      defaultRate: z.number().min(0).default(0),
      rateSource: z.string().optional().nullable(),
      aliases: z.array(z.string()).default([]),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!isOrgAdmin(ctx.user)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only SuperAdmins can create global material catalog items.",
        });
      }

      const norm = normalize(input.name);
      const existing = await db.globalMaterialCatalog.findFirst({
        where: {
          OR: [
            { normalizedName: norm },
            ...(input.code ? [{ code: input.code }] : []),
          ],
        },
      });

      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `A global material with this name or code already exists ("${existing.name}").`,
        });
      }

      const item = await db.globalMaterialCatalog.create({
        data: {
          name: input.name.trim(),
          normalizedName: norm,
          code: input.code?.trim() || null,
          category: input.category?.trim() || null,
          subCategory: input.subCategory?.trim() || null,
          defaultUnit: input.defaultUnit?.trim() || "unit",
          defaultRate: input.defaultRate || 0,
          rateSource: input.rateSource?.trim() || null,
          aliases: input.aliases || [],
          isActive: true,
        },
      });

      return { item };
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.string(),
      name: z.string().min(1).max(200).optional(),
      code: z.string().nullable().optional(),
      category: z.string().nullable().optional(),
      subCategory: z.string().nullable().optional(),
      defaultUnit: z.string().nullable().optional(),
      defaultRate: z.number().min(0).optional(),
      rateSource: z.string().nullable().optional(),
      aliases: z.array(z.string()).optional(),
      isActive: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!isOrgAdmin(ctx.user)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only SuperAdmins can modify global material catalog items.",
        });
      }

      const current = await db.globalMaterialCatalog.findUnique({ where: { id: input.id } });
      if (!current) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Global material not found." });
      }

      const data: any = { ...input };
      delete data.id;

      if (input.name && input.name !== current.name) {
        const norm = normalize(input.name);
        const duplicate = await db.globalMaterialCatalog.findFirst({
          where: { normalizedName: norm, id: { not: input.id } },
        });
        if (duplicate) {
          throw new TRPCError({
            code: "CONFLICT",
            message: `Another global material already has the normalized name "${norm}".`,
          });
        }
        data.normalizedName = norm;
        data.name = input.name.trim();
      }

      const updated = await db.globalMaterialCatalog.update({
        where: { id: input.id },
        data,
      });

      return { item: updated };
    }),

  deactivate: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (!isOrgAdmin(ctx.user)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only SuperAdmins can deactivate global material catalog items.",
        });
      }

      // Soft delete / deactivate to preserve historical referential integrity
      const updated = await db.globalMaterialCatalog.update({
        where: { id: input.id },
        data: { isActive: false },
      });

      // Mark referencing Org entries for review
      await db.orgMaterialEntry.updateMany({
        where: { globalMaterialId: input.id },
        data: { needsReview: true },
      });

      return { item: updated };
    }),
});
