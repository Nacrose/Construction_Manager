import { isOrgAdmin } from "@/lib/authz";
/**
 * Material Catalog synchronization (global to org, project inventory import, and sync preview).
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "@/server/trpc";
import { db } from "@/lib/db";

function normalize(s: string) {
  return s.toLowerCase().trim().replace(/\s+/g, " ");
}

export const materialCatalogSyncRouter = router({
  bulkImportToProject: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        catalogItemIds: z.array(z.string()).min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const projectMember = await db.projectMember.findFirst({
        where: { projectId: input.projectId, userId: ctx.user.id },
      });
      if (!projectMember && !isOrgAdmin(ctx.user)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You are not a member of this project.",
        });
      }
      if (
        projectMember?.role === "client" ||
        projectMember?.role === "inspector"
      ) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Read-only project role." });
      }

      const catalogItems = await db.materialCatalog.findMany({
        where: { id: { in: input.catalogItemIds } },
      });

      const existingProjectMaterials = await db.material.findMany({
        where: { projectId: input.projectId },
        select: { materialCatalogId: true, name: true, subCategory: true },
      });
      const existingCatalogIds = new Set(
        existingProjectMaterials.map((m) => m.materialCatalogId).filter(Boolean)
      );
      const existingSpecs = new Set(
        existingProjectMaterials.map((m) =>
          m.subCategory
            ? `${m.name} — ${m.subCategory}`.toLowerCase()
            : m.name.toLowerCase()
        )
      );

      const toCreate = catalogItems.filter((ci) => {
        const fullSpec = ci.subCategory
          ? `${ci.name} — ${ci.subCategory}`.toLowerCase()
          : ci.name.toLowerCase();
        return !existingCatalogIds.has(ci.id) && !existingSpecs.has(fullSpec);
      });

      if (toCreate.length === 0) {
        return {
          count: 0,
          message: "All selected items are already in project inventory.",
        };
      }

      await db.material.createMany({
        data: toCreate.map((item) => {
          const catPrefix = (item.category || "MAT").substring(0, 3).toUpperCase();
          const specSuffix = item.subCategory
            ? `-${item.subCategory.replace(/\s+/g, "").toUpperCase()}`
            : "";
          return {
            projectId: input.projectId,
            name: item.name,
            code: `${catPrefix}${specSuffix}`,
            category: item.category || undefined,
            subCategory: item.subCategory || undefined,
            materialCatalogId: item.id,
            unit: item.defaultUnit || "unit",
            minStock: 0,
            currentStock: 0,
            reorderLevel: 0,
          };
        }),
      });

      return { count: toCreate.length };
    }),

  previewSyncFromGlobal: protectedProcedure
    .input(
      z.object({
        organizationId: z.string().optional(),
        categories: z.array(z.string()).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const orgId = input.organizationId ?? ctx.user.organizationId;
      if (!orgId)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Organization context required.",
        });

      const globalItems = await db.materialCatalog.findMany({
        where: {
          organizationId: null,
          ...(input.categories &&
            input.categories.length > 0 && {
              category: { in: input.categories },
            }),
        },
        orderBy: [{ category: "asc" }, { name: "asc" }],
      });

      const orgItems = await db.materialCatalog.findMany({
        where: { organizationId: orgId },
        select: { normalizedName: true },
      });
      const orgNormalized = new Set(orgItems.map((i) => i.normalizedName));

      const items = globalItems.map((gi) => ({
        ...gi,
        alreadySynced: orgNormalized.has(gi.normalizedName),
      }));

      const allGlobalCategories = await db.materialCatalog.findMany({
        where: { organizationId: null },
        select: { category: true },
        distinct: ["category"],
        orderBy: { category: "asc" },
      });

      return {
        items,
        categories: allGlobalCategories
          .map((c) => c.category)
          .filter(Boolean) as string[],
        totalGlobal: globalItems.length,
        alreadySynced: items.filter((i) => i.alreadySynced).length,
        pendingSync: items.filter((i) => !i.alreadySynced).length,
      };
    }),

  previewSyncToProject: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        categories: z.array(z.string()).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const orgId = ctx.user.organizationId;
      const projectMember = await db.projectMember.findFirst({
        where: { projectId: input.projectId, userId: ctx.user.id },
      });
      if (!projectMember && !isOrgAdmin(ctx.user)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not a project member." });
      }

      const catalogItems = await db.materialCatalog.findMany({
        where: {
          OR: [
            { organizationId: null },
            ...(orgId ? [{ organizationId: orgId }] : []),
          ],
          ...(input.categories &&
            input.categories.length > 0 && {
              category: { in: input.categories },
            }),
        },
        orderBy: [{ category: "asc" }, { name: "asc" }],
      });

      const deduplicatedMap = new Map<string, (typeof catalogItems)[0]>();
      for (const ci of catalogItems) {
        const key =
          ci.normalizedName ||
          normalize(ci.subCategory ? `${ci.name} ${ci.subCategory}` : ci.name);
        const existing = deduplicatedMap.get(key);
        if (!existing) {
          deduplicatedMap.set(key, ci);
        } else if (
          ci.organizationId !== null &&
          existing.organizationId === null
        ) {
          deduplicatedMap.set(key, ci);
        }
      }
      const dedupedItems = Array.from(deduplicatedMap.values());

      const projectMaterials = await db.material.findMany({
        where: { projectId: input.projectId },
        select: { materialCatalogId: true, name: true, subCategory: true },
      });

      const existingCatalogIds = new Set(
        projectMaterials.map((m) => m.materialCatalogId).filter(Boolean)
      );
      const existingNormalized = new Set(
        projectMaterials.map((m) => {
          const spec = m.subCategory ? `${m.name} ${m.subCategory}` : m.name;
          return spec.toLowerCase().trim().replace(/\s+/g, " ");
        })
      );

      const items = dedupedItems.map((ci) => {
        const ciNorm =
          ci.normalizedName ||
          (ci.subCategory ? `${ci.name} ${ci.subCategory}` : ci.name)
            .toLowerCase()
            .trim()
            .replace(/\s+/g, " ");
        const isSynced =
          existingCatalogIds.has(ci.id) || existingNormalized.has(ciNorm);
        return {
          ...ci,
          alreadySynced: isSynced,
        };
      });

      const allCategories = await db.materialCatalog.findMany({
        where: {
          OR: [
            { organizationId: null },
            ...(orgId ? [{ organizationId: orgId }] : []),
          ],
        },
        select: { category: true },
        distinct: ["category"],
        orderBy: { category: "asc" },
      });

      return {
        items,
        categories: allCategories
          .map((c) => c.category)
          .filter(Boolean) as string[],
        totalCatalog: dedupedItems.length,
        alreadySynced: items.filter((i) => i.alreadySynced).length,
        pendingSync: items.filter((i) => !i.alreadySynced).length,
      };
    }),

  syncFromGlobal: protectedProcedure
    .input(
      z.object({
        catalogItemIds: z.array(z.string()).min(1),
        organizationId: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const orgId = input.organizationId ?? ctx.user.organizationId;
      if (!orgId)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Organization context required.",
        });

      if (!isOrgAdmin(ctx.user) && ctx.user.organizationId !== orgId) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const globalItems = await db.materialCatalog.findMany({
        where: { id: { in: input.catalogItemIds }, organizationId: null },
      });

      if (globalItems.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No valid global catalog items found.",
        });
      }

      const existingOrgItems = await db.materialCatalog.findMany({
        where: { organizationId: orgId },
        select: { normalizedName: true },
      });
      const existingNormalized = new Set(
        existingOrgItems.map((i) => i.normalizedName)
      );

      const toCreate = globalItems.filter(
        (gi) => !existingNormalized.has(gi.normalizedName)
      );
      const skipped = globalItems.length - toCreate.length;

      if (toCreate.length > 0) {
        await db.materialCatalog.createMany({
          data: toCreate.map((gi) => ({
            organizationId: orgId,
            name: gi.name,
            normalizedName: gi.normalizedName,
            category: gi.category,
            subCategory: gi.subCategory,
            defaultUnit: gi.defaultUnit,
            defaultRate: gi.defaultRate,
            rateSource: gi.rateSource,
            aliases: gi.aliases,
            isGlobal: false,
          })),
        });
      }

      return {
        synced: toCreate.length,
        skipped,
        message:
          toCreate.length > 0
            ? `Synced ${toCreate.length} items to your organization catalog.${skipped > 0 ? ` Skipped ${skipped} already existing.` : ""}`
            : `All selected items already exist in your organization catalog.`,
      };
    }),
});
