import { isOrgAdmin } from "@/lib/authz";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "@/server/trpc";
import { db } from "@/lib/db";

function normalize(s: string) {
  return s.toLowerCase().trim().replace(/[,.()\-]/g, " ").replace(/\s+/g, " ").split(" ").sort().join(" ");
}

export const orgMaterialEntryRouter = router({
  list: protectedProcedure
    .input(z.object({
      organizationId: z.string().optional(),
      search: z.string().optional(),
      category: z.string().optional(),
      isCustom: z.boolean().optional(),
      needsReview: z.boolean().optional(),
      isActive: z.boolean().optional().default(true),
      limit: z.number().min(1).max(1000).default(200),
    }))
    .query(async ({ ctx, input }) => {
      const orgId = input.organizationId ?? ctx.user.organizationId;
      if (!orgId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Organization ID is required.",
        });
      }

      const where: any = {
        organizationId: orgId,
        isActive: input.isActive,
      };

      if (input.isCustom !== undefined) {
        where.isCustom = input.isCustom;
      }
      if (input.needsReview !== undefined) {
        where.needsReview = input.needsReview;
      }
      if (input.category) {
        where.OR = [
          { localCategory: input.category },
          { globalMaterial: { category: input.category } },
        ];
      }
      if (input.search) {
        const norm = normalize(input.search);
        where.AND = [
          {
            OR: [
              { localName: { contains: input.search, mode: "insensitive" } },
              { localCode: { contains: input.search, mode: "insensitive" } },
              { globalMaterial: { name: { contains: input.search, mode: "insensitive" } } },
              { globalMaterial: { normalizedName: { contains: norm } } },
              { globalMaterial: { aliases: { has: input.search } } },
            ],
          },
        ];
      }

      const items = await db.orgMaterialEntry.findMany({
        where,
        include: {
          globalMaterial: {
            select: {
              id: true,
              name: true,
              code: true,
              category: true,
              subCategory: true,
              defaultUnit: true,
              defaultRate: true,
              rateSource: true,
              isActive: true,
            },
          },
          _count: {
            select: {
              projectMaterials: true,
              rateOverrides: true,
            },
          },
        },
        orderBy: [
          { localCategory: "asc" },
          { localName: "asc" },
        ],
        take: input.limit,
      });

      return { items };
    }),

  findSimilar: protectedProcedure
    .input(z.object({
      name: z.string(),
      organizationId: z.string().optional(),
      scope: z.enum(["global", "org", "all"]).default("all"),
      threshold: z.number().min(0).max(1).default(0.35),
      limit: z.number().min(1).max(50).default(8),
    }))
    .query(async ({ ctx, input }) => {
      const orgId = input.organizationId ?? ctx.user.organizationId;
      const { findSimilarMaterials } = await import("@/lib/fuzzy-match");
      const matches = await findSimilarMaterials({
        name: input.name,
        scope: input.scope,
        organizationId: orgId,
        threshold: input.threshold,
        limit: input.limit,
      });
      return { matches };
    }),

  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const item = await db.orgMaterialEntry.findUnique({
        where: { id: input.id },
        include: {
          globalMaterial: true,
          projectMaterials: {
            include: {
              project: {
                select: { id: true, name: true, code: true },
              },
            },
          },
          rateOverrides: true,
        },
      });

      if (!item) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Org material not found." });
      }

      if (ctx.user.organizationId && item.organizationId !== ctx.user.organizationId && !isOrgAdmin(ctx.user)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied to other organization's materials." });
      }

      return { item };
    }),

  adopt: protectedProcedure
    .input(z.object({
      organizationId: z.string().optional(),
      globalMaterialId: z.string(),
      localCode: z.string().optional().nullable(),
      localRate: z.number().min(0).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const orgId = input.organizationId ?? ctx.user.organizationId;
      if (!orgId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Organization ID is required." });
      }

      if (ctx.user.orgRole !== "org_admin" && !isOrgAdmin(ctx.user)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only Org Admins can adopt materials into catalog." });
      }

      const globalMat = await db.globalMaterialCatalog.findUnique({
        where: { id: input.globalMaterialId },
      });
      if (!globalMat) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Global material not found." });
      }

      // Check structural deduplication
      const existing = await db.orgMaterialEntry.findUnique({
        where: {
          organizationId_globalMaterialId: {
            organizationId: orgId,
            globalMaterialId: input.globalMaterialId,
          },
        },
      });

      if (existing) {
        if (!existing.isActive) {
          // Reactivate if previously deactivated
          const reactivated = await db.orgMaterialEntry.update({
            where: { id: existing.id },
            data: { isActive: true },
          });
          return { item: reactivated, reactivated: true };
        }
        throw new TRPCError({
          code: "CONFLICT",
          message: `This global material ("${globalMat.name}") is already adopted in your organization catalog.`,
        });
      }

      const entry = await db.orgMaterialEntry.create({
        data: {
          organizationId: orgId,
          globalMaterialId: globalMat.id,
          isCustom: false,
          localName: globalMat.name,
          localUnit: globalMat.defaultUnit,
          localCategory: globalMat.category,
          localSubCategory: globalMat.subCategory,
          localCode: input.localCode?.trim() || null,
          defaultRate: input.localRate ?? (globalMat.defaultRate || 0),
          rateSource: globalMat.rateSource,
          isActive: true,
        },
        include: {
          globalMaterial: true,
        },
      });

      return { item: entry };
    }),

  adoptBulk: protectedProcedure
    .input(z.object({
      organizationId: z.string().optional(),
      globalMaterialIds: z.array(z.string()).min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const orgId = input.organizationId ?? ctx.user.organizationId;
      if (!orgId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Organization ID is required." });
      }

      if (ctx.user.orgRole !== "org_admin" && !isOrgAdmin(ctx.user)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only Org Admins can adopt materials." });
      }

      const globalMats = await db.globalMaterialCatalog.findMany({
        where: { id: { in: input.globalMaterialIds } },
      });

      const existingEntries = await db.orgMaterialEntry.findMany({
        where: {
          organizationId: orgId,
          globalMaterialId: { in: input.globalMaterialIds },
        },
        select: { globalMaterialId: true },
      });
      const existingSet = new Set(existingEntries.map((e) => e.globalMaterialId));

      let addedCount = 0;
      for (const gm of globalMats) {
        if (existingSet.has(gm.id)) continue;
        await db.orgMaterialEntry.create({
          data: {
            organizationId: orgId,
            globalMaterialId: gm.id,
            isCustom: false,
            localName: gm.name,
            localUnit: gm.defaultUnit,
            localCategory: gm.category,
            localSubCategory: gm.subCategory,
            defaultRate: gm.defaultRate || 0,
            rateSource: gm.rateSource,
            isActive: true,
          },
        });
        addedCount++;
      }

      return {
        totalRequested: input.globalMaterialIds.length,
        addedCount,
        skippedCount: input.globalMaterialIds.length - addedCount,
      };
    }),

  createCustom: protectedProcedure
    .input(z.object({
      organizationId: z.string().optional(),
      name: z.string().min(1).max(200),
      category: z.string().optional().nullable(),
      subCategory: z.string().optional().nullable(),
      unit: z.string().min(1),
      code: z.string().optional().nullable(),
      defaultRate: z.number().min(0).default(0),
      rateSource: z.string().optional().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      const orgId = input.organizationId ?? ctx.user.organizationId;
      if (!orgId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Organization ID is required." });
      }

      if (ctx.user.orgRole !== "org_admin" && !isOrgAdmin(ctx.user)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only Org Admins can create custom org materials." });
      }

      const norm = normalize(input.name);

      // Check if global matching item already exists — advise adoption instead
      const matchingGlobal = await db.globalMaterialCatalog.findUnique({
        where: { normalizedName: norm },
      });

      if (matchingGlobal) {
        // Auto-adopt existing global item instead of creating duplicate custom
        const existingAdoption = await db.orgMaterialEntry.findUnique({
          where: {
            organizationId_globalMaterialId: {
              organizationId: orgId,
              globalMaterialId: matchingGlobal.id,
            },
          },
        });

        if (existingAdoption) {
          throw new TRPCError({
            code: "CONFLICT",
            message: `A matching canonical material ("${matchingGlobal.name}") is already in your organization catalog.`,
          });
        }

        const adopted = await db.orgMaterialEntry.create({
          data: {
            organizationId: orgId,
            globalMaterialId: matchingGlobal.id,
            isCustom: false,
            localName: input.name.trim(),
            localUnit: input.unit.trim(),
            localCategory: input.category?.trim() || matchingGlobal.category,
            localSubCategory: input.subCategory?.trim() || matchingGlobal.subCategory,
            localCode: input.code?.trim() || null,
            defaultRate: input.defaultRate || matchingGlobal.defaultRate || 0,
            rateSource: input.rateSource?.trim() || matchingGlobal.rateSource,
            isActive: true,
          },
        });

        return { item: adopted, matchedGlobal: true };
      }

      const customEntry = await db.orgMaterialEntry.create({
        data: {
          organizationId: orgId,
          globalMaterialId: null,
          isCustom: true,
          localName: input.name.trim(),
          localUnit: input.unit.trim(),
          localCategory: input.category?.trim() || null,
          localSubCategory: input.subCategory?.trim() || null,
          localCode: input.code?.trim() || null,
          defaultRate: input.defaultRate || 0,
          rateSource: input.rateSource?.trim() || null,
          isActive: true,
        },
      });

      // Flag into Uncataloged queue for global SuperAdmin review
      await db.uncatalogedMaterial.create({
        data: {
          level: "global",
          organizationId: orgId,
          rawName: input.name.trim(),
          normalizedName: norm,
          unit: input.unit.trim(),
          category: input.category?.trim() || null,
          sourceType: "manual",
          status: "pending",
        },
      });

      return { item: customEntry, matchedGlobal: false };
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.string(),
      localName: z.string().min(1).max(200).optional(),
      localUnit: z.string().optional().nullable(),
      localCategory: z.string().optional().nullable(),
      localSubCategory: z.string().optional().nullable(),
      localCode: z.string().optional().nullable(),
      defaultRate: z.number().min(0).optional(),
      rateSource: z.string().optional().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      const entry = await db.orgMaterialEntry.findUnique({ where: { id: input.id } });
      if (!entry) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Org material not found." });
      }

      if (ctx.user.orgRole !== "org_admin" && !isOrgAdmin(ctx.user)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only Org Admins can modify org materials." });
      }

      const { id, ...data } = input;
      const updated = await db.orgMaterialEntry.update({
        where: { id },
        data: {
          ...data,
          needsReview: false, // clearing review flag on edit
        },
        include: { globalMaterial: true },
      });

      return { item: updated };
    }),

  deactivate: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const entry = await db.orgMaterialEntry.findUnique({
        where: { id: input.id },
        include: { _count: { select: { projectMaterials: true } } },
      });

      if (!entry) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Org material not found." });
      }

      if (ctx.user.orgRole !== "org_admin" && !isOrgAdmin(ctx.user)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only Org Admins can deactivate org materials." });
      }

      const updated = await db.orgMaterialEntry.update({
        where: { id: input.id },
        data: { isActive: false },
      });

      return { item: updated };
    }),
});
