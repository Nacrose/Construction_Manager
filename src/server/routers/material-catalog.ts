import { isOrgAdmin } from "@/lib/authz";
/**
 * Material Catalog master router merging base CRUD, search, sync, cleanup, and unrecognized trackers.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, mergeRouters } from "@/server/trpc";
import { db } from "@/lib/db";
import { materialCatalogSyncRouter } from "./material-catalog-sync";
import { materialCatalogCleanupRouter } from "./material-catalog-cleanup";
import { materialCatalogUnrecognizedRouter } from "./material-catalog-unrecognized";

function normalize(s: string) {
  return s.toLowerCase().trim().replace(/\s+/g, " ");
}

const materialCatalogBaseRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        organizationId: z.string().optional(),
        search: z.string().optional(),
        category: z.string().optional(),
        includeGlobal: z.boolean().default(true),
        limit: z.number().min(1).max(1000).default(200),
        showArchived: z.boolean().default(false),
      })
    )
    .query(async ({ ctx, input }) => {
      const orgId = input.organizationId ?? ctx.user.organizationId;
      const where: any[] = [];

      if (orgId && input.includeGlobal) {
        where.push({ organizationId: null }, { organizationId: orgId });
      } else if (orgId) {
        where.push({ organizationId: orgId });
      } else if (isOrgAdmin(ctx.user)) {
        where.push({ organizationId: null });
      }

      const items = await db.materialCatalog.findMany({
        where: {
          OR: where.length > 0 ? where : undefined,
          isActive: input.showArchived ? false : true,
          ...(input.category && { category: input.category }),
          ...(input.search && {
            OR: [
              { name: { contains: input.search, mode: "insensitive" } },
              { normalizedName: { contains: normalize(input.search) } },
            ],
          }),
        },
        orderBy: [{ category: "asc" }, { name: "asc" }],
        take: input.limit,
      });

      const deduplicatedMap = new Map<string, (typeof items)[0]>();
      for (const item of items) {
        const key = item.normalizedName || normalize(item.name);
        const existing = deduplicatedMap.get(key);
        if (!existing) {
          deduplicatedMap.set(key, item);
        } else if (
          item.organizationId !== null &&
          existing.organizationId === null
        ) {
          deduplicatedMap.set(key, item);
        }
      }

      return { items: Array.from(deduplicatedMap.values()) };
    }),

  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const item = await db.materialCatalog.findUnique({
        where: { id: input.id },
      });
      if (!item) throw new TRPCError({ code: "NOT_FOUND" });
      return { item };
    }),

  create: protectedProcedure
    .input(
      z.object({
        organizationId: z.string().optional(),
        name: z.string().min(1),
        category: z.string().optional(),
        subCategory: z.string().optional().nullable(),
        defaultUnit: z.string().optional(),
        defaultRate: z.number().min(0).optional(),
        rateSource: z.string().optional().nullable(),
        aliases: z.array(z.string()).default([]),
        isGlobal: z.boolean().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (input.isGlobal && !isOrgAdmin(ctx.user)) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const orgId = input.organizationId ?? ctx.user.organizationId;
      const fullName = input.subCategory
        ? `${input.name} ${input.subCategory}`
        : input.name;
      const normalizedName = normalize(fullName);

      const existing = await db.materialCatalog.findFirst({
        where: {
          organizationId: input.isGlobal ? null : orgId,
          normalizedName,
        },
      });
      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `"${input.name}" already exists in catalog.`,
        });
      }

      const item = await db.materialCatalog.create({
        data: {
          organizationId: input.isGlobal ? null : orgId,
          name: input.name.trim(),
          normalizedName,
          category: input.category ?? null,
          subCategory: input.subCategory ?? null,
          defaultUnit: input.defaultUnit ?? null,
          defaultRate: input.defaultRate ?? 0,
          rateSource: input.rateSource ?? null,
          aliases: input.aliases,
          isGlobal: input.isGlobal,
        },
      });

      return { item };
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().optional(),
        category: z.string().optional(),
        subCategory: z.string().optional().nullable(),
        defaultUnit: z.string().optional(),
        defaultRate: z.number().min(0).optional(),
        rateSource: z.string().optional().nullable(),
        aliases: z.array(z.string()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const item = await db.materialCatalog.findUnique({
        where: { id: input.id },
      });
      if (!item) throw new TRPCError({ code: "NOT_FOUND" });

      const isOwner =
        item.organizationId &&
        item.organizationId === ctx.user.organizationId;
      if (!isOwner && !isOrgAdmin(ctx.user)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            "You can only edit catalog items created by your organization.",
        });
      }

      const data: any = {};

      if (input.name !== undefined || input.subCategory !== undefined) {
        const newName = input.name?.trim() ?? item.name;
        const newSubCat =
          input.subCategory !== undefined
            ? input.subCategory
            : item.subCategory;
        const fullName = newSubCat ? `${newName} ${newSubCat}` : newName;
        data.normalizedName = normalize(fullName);
        if (input.name !== undefined) data.name = newName;
      }

      if (input.category !== undefined) data.category = input.category || null;
      if (input.subCategory !== undefined)
        data.subCategory = input.subCategory || null;
      if (input.defaultUnit !== undefined)
        data.defaultUnit = input.defaultUnit || null;
      if (input.defaultRate !== undefined)
        data.defaultRate = input.defaultRate;
      if (input.rateSource !== undefined)
        data.rateSource = input.rateSource || null;
      if (input.aliases !== undefined) data.aliases = input.aliases;

      const updated = await db.materialCatalog.update({
        where: { id: input.id },
        data,
      });
      return { item: updated };
    }),

  delete: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        force: z.boolean().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const item = await db.materialCatalog.findUnique({
        where: { id: input.id },
      });
      if (!item)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Catalog item not found.",
        });

      const isOwner =
        item.organizationId &&
        item.organizationId === ctx.user.organizationId;
      const isOrgAdminBool =
        ctx.user.orgRole === "org_admin" && ctx.user.organizationId !== null;
      if (!isOwner && !isOrgAdmin(ctx.user) && !isOrgAdminBool) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You can only delete items belonging to your organization.",
        });
      }

      if (input.force && isOrgAdmin(ctx.user)) {
        const [
          rateCatalogItems,
          projectMaterials,
          boqIngredients,
          presetIngredients,
          partnerSupplies,
        ] = await Promise.all([
          db.rateCatalogItem.count({
            where: { materialCatalogId: input.id },
          }),
          db.material.count({ where: { materialCatalogId: input.id } }),
          db.boqIngredient.count({
            where: { materialCatalogId: input.id },
          }),
          db.globalPresetIngredient.count({
            where: { materialCatalogId: input.id },
          }),
          db.partnerSupply.count({
            where: { materialCatalogId: input.id },
          }),
        ]);
        const hasRefs =
          rateCatalogItems +
            projectMaterials +
            boqIngredients +
            presetIngredients +
            partnerSupplies >
          0;
        if (hasRefs) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message:
              "Cannot hard-delete: item has active references. Archive it instead.",
          });
        }
        await db.rateCatalogItem.deleteMany({
          where: { materialCatalogId: input.id },
        });
        await db.materialCatalog.delete({ where: { id: input.id } });
        return { ok: true, mode: "hard" };
      }

      await db.materialCatalog.update({
        where: { id: input.id },
        data: { isActive: false, archivedAt: new Date() },
      });
      return { ok: true, mode: "archived" };
    }),

  search: protectedProcedure
    .input(
      z.object({
        q: z.string(),
        organizationId: z.string().optional(),
        limit: z.number().min(1).max(50).default(10),
      })
    )
    .query(async ({ ctx, input }) => {
      const orgId = input.organizationId ?? ctx.user.organizationId;
      const q = normalize(input.q);
      if (!q) return { items: [] };

      const items = await db.materialCatalog.findMany({
        where: {
          OR: [
            { organizationId: null },
            ...(orgId ? [{ organizationId: orgId }] : []),
          ],
          AND: [
            {
              OR: [
                { name: { contains: input.q, mode: "insensitive" } },
                { normalizedName: { contains: q } },
                { aliases: { has: input.q.toLowerCase() } },
              ],
            },
          ],
        },
        orderBy: [{ isGlobal: "asc" }, { name: "asc" }],
        take: input.limit,
      });

      return { items };
    }),
});

export const materialCatalogRouter = mergeRouters(
  materialCatalogBaseRouter,
  materialCatalogSyncRouter,
  materialCatalogCleanupRouter,
  materialCatalogUnrecognizedRouter
);
