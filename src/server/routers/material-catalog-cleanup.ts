import { isOrgAdmin } from "@/lib/authz";
/**
 * Material Catalog cleanup, impact checks, archiving, and deletion procedures.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "@/server/trpc";
import { db } from "@/lib/db";

export const materialCatalogCleanupRouter = router({
  checkDeleteImpact: protectedProcedure
    .input(z.object({ ids: z.array(z.string()) }))
    .query(async ({ input }) => {
      const ids = input.ids;
      const [
        rateCatalogItems,
        projectMaterials,
        boqIngredients,
        presetIngredients,
        partnerSupplies,
      ] = await Promise.all([
        db.rateCatalogItem.count({ where: { materialCatalogId: { in: ids } } }),
        db.material.count({ where: { materialCatalogId: { in: ids } } }),
        db.boqIngredient.count({ where: { materialCatalogId: { in: ids } } }),
        db.globalPresetIngredient.count({
          where: { materialCatalogId: { in: ids } },
        }),
        db.partnerSupply.count({ where: { materialCatalogId: { in: ids } } }),
      ]);
      return {
        rateCatalogItems,
        projectMaterials,
        boqIngredients,
        presetIngredients,
        partnerSupplies,
        hasImpact:
          rateCatalogItems +
            projectMaterials +
            boqIngredients +
            presetIngredients +
            partnerSupplies >
          0,
      };
    }),

  deleteMany: protectedProcedure
    .input(
      z.object({
        ids: z.array(z.string()),
        force: z.boolean().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const items = await db.materialCatalog.findMany({
        where: { id: { in: input.ids } },
      });

      const isOrgAdminBool =
        ctx.user.orgRole === "org_admin" && ctx.user.organizationId !== null;

      for (const item of items) {
        const isOwner =
          item.organizationId &&
          item.organizationId === ctx.user.organizationId;
        if (!isOwner && !isOrgAdmin(ctx.user) && !isOrgAdminBool) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: `You do not have permission to delete item: ${item.name}`,
          });
        }
      }

      if (input.force && isOrgAdmin(ctx.user)) {
        const [
          rateCounts,
          matCounts,
          boqCounts,
          presetCounts,
          partnerCounts,
        ] = await Promise.all([
          db.rateCatalogItem.groupBy({
            by: ["materialCatalogId"],
            where: { materialCatalogId: { in: input.ids } },
            _count: true,
          }),
          db.material.groupBy({
            by: ["materialCatalogId"],
            where: { materialCatalogId: { in: input.ids } },
            _count: true,
          }),
          db.boqIngredient.groupBy({
            by: ["materialCatalogId"],
            where: { materialCatalogId: { in: input.ids } },
            _count: true,
          }),
          db.globalPresetIngredient.groupBy({
            by: ["materialCatalogId"],
            where: { materialCatalogId: { in: input.ids } },
            _count: true,
          }),
          db.partnerSupply.groupBy({
            by: ["materialCatalogId"],
            where: { materialCatalogId: { in: input.ids } },
            _count: true,
          }),
        ]);
        const referencedIds = new Set(
          [
            ...rateCounts.map((r: any) => r.materialCatalogId),
            ...matCounts.map((r: any) => r.materialCatalogId),
            ...boqCounts.map((r: any) => r.materialCatalogId),
            ...presetCounts.map((r: any) => r.materialCatalogId),
            ...partnerCounts.map((r: any) => r.materialCatalogId),
          ].filter(Boolean)
        );

        const safeToHardDelete = input.ids.filter(
          (id) => !referencedIds.has(id)
        );
        const mustArchive = input.ids.filter((id) => referencedIds.has(id));

        if (safeToHardDelete.length > 0) {
          await db.rateCatalogItem.deleteMany({
            where: { materialCatalogId: { in: safeToHardDelete } },
          });
          await db.materialCatalog.deleteMany({
            where: { id: { in: safeToHardDelete } },
          });
        }
        if (mustArchive.length > 0) {
          await db.materialCatalog.updateMany({
            where: { id: { in: mustArchive } },
            data: { isActive: false, archivedAt: new Date() },
          });
        }
        return {
          ok: true,
          count: items.length,
          hardDeleted: safeToHardDelete.length,
          archived: mustArchive.length,
          mode: "mixed",
        };
      }

      await db.materialCatalog.updateMany({
        where: { id: { in: input.ids } },
        data: { isActive: false, archivedAt: new Date() },
      });
      return {
        ok: true,
        count: items.length,
        archived: items.length,
        mode: "archived",
      };
    }),

  checkCategoryImpact: protectedProcedure
    .input(
      z.object({
        category: z.string(),
        subCategory: z.string().optional(),
        organizationId: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const orgId = input.organizationId ?? ctx.user.organizationId;
      const where: any = {
        isActive: true,
        category: input.category,
        ...(input.subCategory && { name: input.subCategory }),
        ...(orgId
          ? { OR: [{ organizationId: null }, { organizationId: orgId }] }
          : {}),
      };

      const items = await db.materialCatalog.findMany({
        where,
        select: { id: true, name: true, subCategory: true },
      });
      const ids = items.map((i) => i.id);

      if (ids.length === 0)
        return {
          items: [],
          totalCount: 0,
          referencedCount: 0,
          safeCount: 0,
          hasImpact: false,
        };

      const [
        rateCounts,
        matCounts,
        boqCounts,
        presetCounts,
        partnerCounts,
      ] = await Promise.all([
        db.rateCatalogItem.groupBy({
          by: ["materialCatalogId"],
          where: { materialCatalogId: { in: ids } },
          _count: true,
        }),
        db.material.groupBy({
          by: ["materialCatalogId"],
          where: { materialCatalogId: { in: ids } },
          _count: true,
        }),
        db.boqIngredient.groupBy({
          by: ["materialCatalogId"],
          where: { materialCatalogId: { in: ids } },
          _count: true,
        }),
        db.globalPresetIngredient.groupBy({
          by: ["materialCatalogId"],
          where: { materialCatalogId: { in: ids } },
          _count: true,
        }),
        db.partnerSupply.groupBy({
          by: ["materialCatalogId"],
          where: { materialCatalogId: { in: ids } },
          _count: true,
        }),
      ]);

      const refCountMap = new Map<string, number>();
      for (const rows of [
        rateCounts,
        matCounts,
        boqCounts,
        presetCounts,
        partnerCounts,
      ]) {
        for (const r of rows) {
          if (r.materialCatalogId) {
            refCountMap.set(
              r.materialCatalogId,
              (refCountMap.get(r.materialCatalogId) ?? 0) + (r._count as any)
            );
          }
        }
      }

      const itemsWithImpact = items.map((i) => ({
        ...i,
        referenceCount: refCountMap.get(i.id) ?? 0,
        hasDependencies: (refCountMap.get(i.id) ?? 0) > 0,
      }));

      const referencedCount = itemsWithImpact.filter(
        (i) => i.hasDependencies
      ).length;
      return {
        items: itemsWithImpact,
        totalCount: items.length,
        referencedCount,
        safeCount: items.length - referencedCount,
        hasImpact: referencedCount > 0,
      };
    }),

  deleteByCategory: protectedProcedure
    .input(
      z.object({
        category: z.string(),
        mode: z
          .enum(["archive_all", "delete_safe_archive_rest"])
          .default("archive_all"),
        organizationId: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!isOrgAdmin(ctx.user) && ctx.user.orgRole !== "org_admin") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only admins can bulk delete by category.",
        });
      }
      const orgId = input.organizationId ?? ctx.user.organizationId;
      const where: any = {
        isActive: true,
        category: input.category,
        ...(orgId
          ? { OR: [{ organizationId: null }, { organizationId: orgId }] }
          : {}),
      };
      const items = await db.materialCatalog.findMany({
        where,
        select: { id: true },
      });
      const ids = items.map((i) => i.id);
      if (ids.length === 0) return { ok: true, archived: 0, hardDeleted: 0 };

      if (input.mode === "archive_all" || !isOrgAdmin(ctx.user)) {
        await db.materialCatalog.updateMany({
          where: { id: { in: ids } },
          data: { isActive: false, archivedAt: new Date() },
        });
        return { ok: true, archived: ids.length, hardDeleted: 0 };
      }

      const [
        rateCounts,
        matCounts,
        boqCounts,
        presetCounts,
        partnerCounts,
      ] = await Promise.all([
        db.rateCatalogItem.groupBy({
          by: ["materialCatalogId"],
          where: { materialCatalogId: { in: ids } },
          _count: true,
        }),
        db.material.groupBy({
          by: ["materialCatalogId"],
          where: { materialCatalogId: { in: ids } },
          _count: true,
        }),
        db.boqIngredient.groupBy({
          by: ["materialCatalogId"],
          where: { materialCatalogId: { in: ids } },
          _count: true,
        }),
        db.globalPresetIngredient.groupBy({
          by: ["materialCatalogId"],
          where: { materialCatalogId: { in: ids } },
          _count: true,
        }),
        db.partnerSupply.groupBy({
          by: ["materialCatalogId"],
          where: { materialCatalogId: { in: ids } },
          _count: true,
        }),
      ]);
      const referencedIds = new Set(
        [
          ...rateCounts.map((r: any) => r.materialCatalogId),
          ...matCounts.map((r: any) => r.materialCatalogId),
          ...boqCounts.map((r: any) => r.materialCatalogId),
          ...presetCounts.map((r: any) => r.materialCatalogId),
          ...partnerCounts.map((r: any) => r.materialCatalogId),
        ].filter(Boolean)
      );

      const safeIds = ids.filter((id) => !referencedIds.has(id));
      const refIds = ids.filter((id) => referencedIds.has(id));

      if (safeIds.length > 0) {
        await db.rateCatalogItem.deleteMany({
          where: { materialCatalogId: { in: safeIds } },
        });
        await db.materialCatalog.deleteMany({ where: { id: { in: safeIds } } });
      }
      if (refIds.length > 0) {
        await db.materialCatalog.updateMany({
          where: { id: { in: refIds } },
          data: { isActive: false, archivedAt: new Date() },
        });
      }
      return { ok: true, archived: refIds.length, hardDeleted: safeIds.length };
    }),

  deleteBySubCategory: protectedProcedure
    .input(
      z.object({
        category: z.string(),
        groupName: z.string(),
        mode: z
          .enum(["archive_all", "delete_safe_archive_rest"])
          .default("archive_all"),
        organizationId: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!isOrgAdmin(ctx.user) && ctx.user.orgRole !== "org_admin") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only admins can bulk delete by subcategory group.",
        });
      }
      const orgId = input.organizationId ?? ctx.user.organizationId;
      const where: any = {
        isActive: true,
        category: input.category,
        name: input.groupName,
        ...(orgId
          ? { OR: [{ organizationId: null }, { organizationId: orgId }] }
          : {}),
      };
      const items = await db.materialCatalog.findMany({
        where,
        select: { id: true },
      });
      const ids = items.map((i) => i.id);
      if (ids.length === 0) return { ok: true, archived: 0, hardDeleted: 0 };

      if (input.mode === "archive_all" || !isOrgAdmin(ctx.user)) {
        await db.materialCatalog.updateMany({
          where: { id: { in: ids } },
          data: { isActive: false, archivedAt: new Date() },
        });
        return { ok: true, archived: ids.length, hardDeleted: 0 };
      }

      const [
        rateCounts,
        matCounts,
        boqCounts,
        presetCounts,
        partnerCounts,
      ] = await Promise.all([
        db.rateCatalogItem.groupBy({
          by: ["materialCatalogId"],
          where: { materialCatalogId: { in: ids } },
          _count: true,
        }),
        db.material.groupBy({
          by: ["materialCatalogId"],
          where: { materialCatalogId: { in: ids } },
          _count: true,
        }),
        db.boqIngredient.groupBy({
          by: ["materialCatalogId"],
          where: { materialCatalogId: { in: ids } },
          _count: true,
        }),
        db.globalPresetIngredient.groupBy({
          by: ["materialCatalogId"],
          where: { materialCatalogId: { in: ids } },
          _count: true,
        }),
        db.partnerSupply.groupBy({
          by: ["materialCatalogId"],
          where: { materialCatalogId: { in: ids } },
          _count: true,
        }),
      ]);
      const referencedIds = new Set(
        [
          ...rateCounts.map((r: any) => r.materialCatalogId),
          ...matCounts.map((r: any) => r.materialCatalogId),
          ...boqCounts.map((r: any) => r.materialCatalogId),
          ...presetCounts.map((r: any) => r.materialCatalogId),
          ...partnerCounts.map((r: any) => r.materialCatalogId),
        ].filter(Boolean)
      );

      const safeIds = ids.filter((id) => !referencedIds.has(id));
      const refIds = ids.filter((id) => referencedIds.has(id));

      if (safeIds.length > 0) {
        await db.rateCatalogItem.deleteMany({
          where: { materialCatalogId: { in: safeIds } },
        });
        await db.materialCatalog.deleteMany({ where: { id: { in: safeIds } } });
      }
      if (refIds.length > 0) {
        await db.materialCatalog.updateMany({
          where: { id: { in: refIds } },
          data: { isActive: false, archivedAt: new Date() },
        });
      }
      return { ok: true, archived: refIds.length, hardDeleted: safeIds.length };
    }),

  listArchived: protectedProcedure
    .input(
      z.object({
        organizationId: z.string().optional(),
        search: z.string().optional(),
        limit: z.number().min(1).max(1000).default(500),
      })
    )
    .query(async ({ ctx, input }) => {
      const orgId = input.organizationId ?? ctx.user.organizationId;
      const where: any[] = [];
      if (orgId && isOrgAdmin(ctx.user)) {
        where.push({ organizationId: null }, { organizationId: orgId });
      } else if (orgId) {
        where.push({ organizationId: orgId });
      } else if (isOrgAdmin(ctx.user)) {
        where.push({ organizationId: null });
      }

      const items = await db.materialCatalog.findMany({
        where: {
          OR: where.length > 0 ? where : undefined,
          isActive: false,
          ...(input.search && {
            OR: [{ name: { contains: input.search, mode: "insensitive" } }],
          }),
        },
        orderBy: [{ archivedAt: "desc" }, { category: "asc" }, { name: "asc" }],
        take: input.limit,
      });
      return { items };
    }),

  restore: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const item = await db.materialCatalog.findUnique({
        where: { id: input.id },
      });
      if (!item)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Archived item not found.",
        });

      const isOwner =
        item.organizationId &&
        item.organizationId === ctx.user.organizationId;
      const isOrgAdminBool =
        ctx.user.orgRole === "org_admin" && ctx.user.organizationId !== null;
      if (!isOwner && !isOrgAdmin(ctx.user) && !isOrgAdminBool) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You cannot restore this item.",
        });
      }

      const restored = await db.materialCatalog.update({
        where: { id: input.id },
        data: { isActive: true, archivedAt: null },
      });
      return { item: restored };
    }),

  purgeArchived: protectedProcedure
    .input(z.object({ organizationId: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      if (!isOrgAdmin(ctx.user)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only SuperAdmins can purge archived catalog items.",
        });
      }
      const orgId = input.organizationId ?? ctx.user.organizationId;
      const where: any = {
        isActive: false,
        ...(orgId
          ? { OR: [{ organizationId: null }, { organizationId: orgId }] }
          : {}),
      };

      const archivedItems = await db.materialCatalog.findMany({
        where,
        select: { id: true },
      });
      const ids = archivedItems.map((i) => i.id);
      if (ids.length === 0) return { ok: true, purged: 0, skipped: 0 };

      const [
        rateCounts,
        matCounts,
        boqCounts,
        presetCounts,
        partnerCounts,
      ] = await Promise.all([
        db.rateCatalogItem.groupBy({
          by: ["materialCatalogId"],
          where: { materialCatalogId: { in: ids } },
          _count: true,
        }),
        db.material.groupBy({
          by: ["materialCatalogId"],
          where: { materialCatalogId: { in: ids } },
          _count: true,
        }),
        db.boqIngredient.groupBy({
          by: ["materialCatalogId"],
          where: { materialCatalogId: { in: ids } },
          _count: true,
        }),
        db.globalPresetIngredient.groupBy({
          by: ["materialCatalogId"],
          where: { materialCatalogId: { in: ids } },
          _count: true,
        }),
        db.partnerSupply.groupBy({
          by: ["materialCatalogId"],
          where: { materialCatalogId: { in: ids } },
          _count: true,
        }),
      ]);
      const referencedIds = new Set(
        [
          ...rateCounts.map((r: any) => r.materialCatalogId),
          ...matCounts.map((r: any) => r.materialCatalogId),
          ...boqCounts.map((r: any) => r.materialCatalogId),
          ...presetCounts.map((r: any) => r.materialCatalogId),
          ...partnerCounts.map((r: any) => r.materialCatalogId),
        ].filter(Boolean)
      );

      const safeIds = ids.filter((id) => !referencedIds.has(id));
      const skipped = ids.filter((id) => referencedIds.has(id)).length;

      if (safeIds.length > 0) {
        await db.rateCatalogItem.deleteMany({
          where: { materialCatalogId: { in: safeIds } },
        });
        await db.materialCatalog.deleteMany({ where: { id: { in: safeIds } } });
      }
      return { ok: true, purged: safeIds.length, skipped };
    }),
});
