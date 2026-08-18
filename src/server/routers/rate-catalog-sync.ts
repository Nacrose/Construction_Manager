/**
 * Rate Catalog synchronization with Material Catalog (preview, sync, and pruning).
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "@/server/trpc";
import { db } from "@/lib/db";

export async function getEligibleMaterialsForCatalog(catalog: {
  scope: string;
  organizationId: string | null;
  projectId: string | null;
}) {
  if (catalog.scope === "project" && catalog.projectId) {
    const projMats = await db.material.findMany({
      where: { projectId: catalog.projectId },
      select: {
        id: true,
        name: true,
        subCategory: true,
        unit: true,
        materialCatalogId: true,
      },
    });
    return projMats.map((m) => ({
      id: m.materialCatalogId || m.id,
      name: m.name,
      subCategory: m.subCategory,
      defaultUnit: m.unit || "unit",
      category: m.subCategory ? "Project Materials" : "General",
    }));
  }

  if (catalog.organizationId === null) {
    const globalMats = await db.globalMaterialCatalog.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        subCategory: true,
        defaultUnit: true,
        category: true,
      },
      orderBy: [{ category: "asc" }, { name: "asc" }],
    });
    return globalMats.map((m) => ({
      ...m,
      category: m.category || "General",
    }));
  }

  const orgMats = await db.orgMaterialEntry.findMany({
    where: { organizationId: catalog.organizationId, isActive: true },
    include: { globalMaterial: true },
    orderBy: [{ localCategory: "asc" }, { localName: "asc" }],
  });

  return orgMats.map((m) => ({
    id: m.globalMaterialId || m.id,
    name: m.localName || m.globalMaterial?.name || "Unnamed Material",
    subCategory: m.localSubCategory || m.globalMaterial?.subCategory,
    defaultUnit: m.localUnit || m.globalMaterial?.defaultUnit || "unit",
    category: m.localCategory || m.globalMaterial?.category || "General",
  }));
}

export const rateCatalogSyncRouter = router({
  previewSync: protectedProcedure
    .input(z.object({ catalogId: z.string() }))
    .query(async ({ ctx, input }) => {
      const catalog = await db.rateCatalog.findUnique({
        where: { id: input.catalogId },
      });
      if (!catalog) throw new TRPCError({ code: "NOT_FOUND", message: "Catalog not found." });

      const materialItems = await getEligibleMaterialsForCatalog(catalog);

      const existingItems = await db.rateCatalogItem.findMany({
        where: { catalogId: input.catalogId },
        include: {
          rates: true,
          _count: {
            select: {
              boqIngredients: true,
              projectRateEntries: true,
            },
          },
        },
      });

      const normalizeStr = (s: string) => s.toLowerCase().trim().replace(/\s+/g, " ");

      const eligibleIds = new Set(materialItems.map((m) => m.id));
      const eligibleNormalizedNames = new Set<string>();

      for (const m of materialItems) {
        const displayName = m.subCategory ? `${m.name} — ${m.subCategory}` : m.name;
        eligibleNormalizedNames.add(normalizeStr(displayName));
        eligibleNormalizedNames.add(normalizeStr(m.name));
      }

      const existingIds = new Set(
        existingItems.map((i) => i.materialCatalogId).filter(Boolean)
      );
      const existingNames = new Set(
        existingItems.map((i) => normalizeStr(i.materialName))
      );

      const items = materialItems.map((m) => {
        const displayName = m.subCategory ? `${m.name} — ${m.subCategory}` : m.name;
        const norm = normalizeStr(displayName);
        const alreadySynced = existingIds.has(m.id) || existingNames.has(norm);
        return {
          id: m.id,
          name: m.name,
          subCategory: m.subCategory,
          category: m.category || "General",
          unit: m.defaultUnit || "unit",
          alreadySynced,
        };
      });

      const orphanedItems = existingItems
        .filter((item) => {
          const hasValidId =
            item.materialCatalogId && eligibleIds.has(item.materialCatalogId);
          const hasValidName = eligibleNormalizedNames.has(
            normalizeStr(item.materialName)
          );
          return !hasValidId && !hasValidName;
        })
        .map((item) => ({
          id: item.id,
          code: item.code,
          materialName: item.materialName,
          unit: item.unit,
          ratesCount: item.rates.length,
          boqUsageCount: item._count.boqIngredients,
          isUsedInBoq: item._count.boqIngredients > 0,
          materialCatalogId: item.materialCatalogId,
        }));

      const categories = Array.from(new Set(items.map((i) => i.category))).sort();
      const safeToPruneCount = orphanedItems.filter((i) => !i.isUsedInBoq).length;

      return {
        items,
        categories,
        totalItems: items.length,
        alreadySyncedCount: items.filter((i) => i.alreadySynced).length,
        pendingCount: items.filter((i) => !i.alreadySynced).length,
        orphanedItems,
        orphanedCount: orphanedItems.length,
        safeToPruneCount,
      };
    }),

  pruneOrphanedItems: protectedProcedure
    .input(
      z.object({
        catalogId: z.string(),
        itemIds: z.array(z.string()).optional(),
        pruneAllSafe: z.boolean().default(false),
      })
    )
    .mutation(async ({ input }) => {
      const catalog = await db.rateCatalog.findUnique({
        where: { id: input.catalogId },
      });
      if (!catalog) throw new TRPCError({ code: "NOT_FOUND", message: "Rate catalog not found." });

      const normalizeStr = (s: string) => s.toLowerCase().trim().replace(/\s+/g, " ");
      let targetIds: string[] = [];

      if (input.itemIds && input.itemIds.length > 0) {
        const items = await db.rateCatalogItem.findMany({
          where: { id: { in: input.itemIds }, catalogId: input.catalogId },
          include: { _count: { select: { boqIngredients: true } } },
        });

        const blocked = items.filter((i) => i._count.boqIngredients > 0);
        if (blocked.length > 0) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: `Cannot prune ${blocked.length} item(s) because they are actively referenced in project BOQ rate analyses.`,
          });
        }
        targetIds = items.map((i) => i.id);
      } else if (input.pruneAllSafe) {
        const materialItems = await getEligibleMaterialsForCatalog(catalog);
        const eligibleIds = new Set(materialItems.map((m) => m.id));
        const eligibleNormalizedNames = new Set<string>();

        for (const m of materialItems) {
          const displayName = m.subCategory ? `${m.name} — ${m.subCategory}` : m.name;
          eligibleNormalizedNames.add(normalizeStr(displayName));
          eligibleNormalizedNames.add(normalizeStr(m.name));
        }

        const existingItems = await db.rateCatalogItem.findMany({
          where: { catalogId: input.catalogId },
          include: { _count: { select: { boqIngredients: true } } },
        });

        const safeOrphans = existingItems.filter((i) => {
          const hasValidId =
            i.materialCatalogId && eligibleIds.has(i.materialCatalogId);
          const hasValidName = eligibleNormalizedNames.has(
            normalizeStr(i.materialName)
          );
          const isOrphan = !hasValidId && !hasValidName;
          const isSafe = i._count.boqIngredients === 0;
          return isOrphan && isSafe;
        });

        targetIds = safeOrphans.map((i) => i.id);
      }

      if (targetIds.length === 0) {
        return { ok: true, count: 0, message: "No orphaned items to prune." };
      }

      await db.rateCatalogItemRate.deleteMany({
        where: { itemId: { in: targetIds } },
      });

      await db.rateCatalogItem.deleteMany({
        where: { id: { in: targetIds } },
      });

      return {
        ok: true,
        count: targetIds.length,
        message: `Successfully pruned ${targetIds.length} item(s) from rate catalog.`,
      };
    }),

  syncWithMaterialCatalog: protectedProcedure
    .input(
      z.object({
        catalogId: z.string(),
        selectedMaterialIds: z.array(z.string()).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const catalog = await db.rateCatalog.findUnique({
        where: { id: input.catalogId },
      });
      if (!catalog) throw new TRPCError({ code: "NOT_FOUND", message: "Rate catalog not found." });

      const allEligibleMaterials = await getEligibleMaterialsForCatalog(catalog);
      const materialItems =
        input.selectedMaterialIds && input.selectedMaterialIds.length > 0
          ? allEligibleMaterials.filter((m) =>
              input.selectedMaterialIds!.includes(m.id)
            )
          : allEligibleMaterials;

      const existingItems = await db.rateCatalogItem.findMany({
        where: { catalogId: input.catalogId },
        include: { rates: true },
      });

      const normalizeStr = (s: string) => s.toLowerCase().trim().replace(/\s+/g, " ");

      const eligibleIds = new Set(allEligibleMaterials.map((m) => m.id));
      const eligibleNormalizedNames = new Set<string>();

      for (const m of allEligibleMaterials) {
        const displayName = m.subCategory ? `${m.name} — ${m.subCategory}` : m.name;
        eligibleNormalizedNames.add(normalizeStr(displayName));
        eligibleNormalizedNames.add(normalizeStr(m.name));
      }

      let addedCount = 0;
      let removedCount = 0;

      for (const mcItem of materialItems) {
        const displayName = mcItem.subCategory
          ? `${mcItem.name} — ${mcItem.subCategory}`
          : mcItem.name;
        const normName = normalizeStr(displayName);

        const exists = existingItems.some(
          (i) =>
            (i.materialCatalogId && i.materialCatalogId === mcItem.id) ||
            normalizeStr(i.materialName) === normName
        );

        if (!exists) {
          const maxOrder = await db.rateCatalogItem.aggregate({
            where: { catalogId: input.catalogId },
            _max: { sortOrder: true, code: true },
          });

          await db.rateCatalogItem.create({
            data: {
              catalogId: input.catalogId,
              code: (maxOrder._max.code ?? 0) + 1,
              materialName: displayName,
              materialCatalogId: mcItem.id,
              unit: mcItem.defaultUnit || "unit",
              sortOrder: (maxOrder._max.sortOrder ?? -1) + 1,
            },
          });
          addedCount++;
        }
      }

      const orphanedItems = existingItems.filter((i) => {
        const hasValidId =
          i.materialCatalogId && eligibleIds.has(i.materialCatalogId);
        const hasValidName = eligibleNormalizedNames.has(
          normalizeStr(i.materialName)
        );
        return !hasValidId && !hasValidName;
      });

      if (orphanedItems.length > 0) {
        await db.rateCatalogItem.deleteMany({
          where: { id: { in: orphanedItems.map((i) => i.id) } },
        });
        removedCount = orphanedItems.length;
      }

      let parentCatalog: {
        id: string;
        items: {
          materialCatalogId: string | null;
          rates: { district: string; rate: number }[];
        }[];
      } | null = null;

      if (catalog.scope === "org" && catalog.organizationId) {
        parentCatalog = (await db.rateCatalog.findFirst({
          where: {
            organizationId: null,
            scope: "global",
            fiscalYear: catalog.fiscalYear,
          },
          include: { items: { include: { rates: true } } },
          orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
        })) as any;
      } else if (catalog.scope === "project" && catalog.projectId) {
        const proj = await db.project.findUnique({
          where: { id: catalog.projectId },
          select: { organizationId: true },
        });
        if (proj?.organizationId) {
          parentCatalog = (await db.rateCatalog.findFirst({
            where: {
              organizationId: proj.organizationId,
              scope: "org",
              fiscalYear: catalog.fiscalYear,
            },
            include: { items: { include: { rates: true } } },
            orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
          })) as any;
        }
      }

      let ratesInherited = 0;
      if (parentCatalog) {
        const parentRatesMap = new Map<
          string,
          { district: string; rate: number }[]
        >();
        for (const parentItem of parentCatalog.items) {
          if (parentItem.materialCatalogId) {
            parentRatesMap.set(parentItem.materialCatalogId, parentItem.rates);
          }
        }

        const allCurrentItems = await db.rateCatalogItem.findMany({
          where: { catalogId: input.catalogId },
          include: { rates: true },
        });

        for (const rateItem of allCurrentItems) {
          if (!rateItem.materialCatalogId) continue;
          const parentRates = parentRatesMap.get(rateItem.materialCatalogId);
          if (!parentRates || parentRates.length === 0) continue;

          for (const pr of parentRates) {
            const existsAlready = rateItem.rates.some(
              (r) => r.district === pr.district
            );
            if (!existsAlready && pr.rate > 0) {
              await db.rateCatalogItemRate.create({
                data: {
                  itemId: rateItem.id,
                  district: pr.district,
                  rate: pr.rate,
                },
              });
              ratesInherited++;
            }
          }
        }
      }

      return { addedCount, removedCount, ratesInherited };
    }),
});
