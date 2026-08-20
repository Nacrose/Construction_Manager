import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "@/server/trpc";
import { db } from "@/lib/db";

export const projectRateRouter = router({
  // Save or update a manually entered project rate for a rate catalog item
  saveProjectRate: protectedProcedure
    .input(
      z.object({
        catalogItemId: z.string(),
        rate: z.number().min(0),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const item = await db.rateCatalogItem.findUnique({
        where: { id: input.catalogItemId },
        include: { catalog: true },
      });
      if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Rate item not found." });

      // Upsert into RateCatalogItemRate with special district tag "__PROJECT__"
      const rateEntry = await db.rateCatalogItemRate.upsert({
        where: {
          itemId_district: {
            itemId: input.catalogItemId,
            district: "__PROJECT__",
          },
        },
        create: {
          itemId: input.catalogItemId,
          district: "__PROJECT__",
          rate: input.rate,
        },
        update: {
          rate: input.rate,
        },
      });

      // Auto-sync rate to Org Rate Catalog column if this catalog belongs to a project
      if (item.catalog.projectId) {
        const proj = await db.project.findUnique({
          where: { id: item.catalog.projectId },
          select: { name: true, organizationId: true },
        });
        if (proj?.organizationId) {
          const orgCatalog = await db.rateCatalog.findFirst({
            where: { organizationId: proj.organizationId, scope: "org", fiscalYear: item.catalog.fiscalYear },
            include: { items: true },
            orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
          });
          if (orgCatalog) {
            const column = await db.projectRateColumn.upsert({
              where: {
                rateCatalogId_projectId: {
                  rateCatalogId: orgCatalog.id,
                  projectId: item.catalog.projectId,
                },
              },
              create: {
                rateCatalogId: orgCatalog.id,
                projectId: item.catalog.projectId,
                projectName: proj.name,
                fiscalYear: item.catalog.fiscalYear,
              },
              update: {
                projectName: proj.name,
                syncedAt: new Date(),
              },
            });

            const orgItem = orgCatalog.items.find(
              (oi) =>
                (oi.materialCatalogId && oi.materialCatalogId === item.materialCatalogId) ||
                oi.materialName.toLowerCase().trim() === item.materialName.toLowerCase().trim()
            );

            if (orgItem) {
              await db.projectRateColumnEntry.upsert({
                where: {
                  columnId_rateCatalogItemId: {
                    columnId: column.id,
                    rateCatalogItemId: orgItem.id,
                  },
                },
                create: {
                  columnId: column.id,
                  rateCatalogItemId: orgItem.id,
                  rate: input.rate,
                },
                update: {
                  rate: input.rate,
                },
              });
            }
          }
        }
      }

      return { success: true, rateEntry };
    }),

  // Push all manually entered project rates to the Organization Rate Catalog as a new project column
  syncProjectRatesToOrg: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        orgRateCatalogId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const project = await db.project.findUnique({
        where: { id: input.projectId },
        select: { id: true, name: true, organizationId: true },
      });
      if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found." });

      const orgCatalog = await db.rateCatalog.findUnique({
        where: { id: input.orgRateCatalogId },
        include: { items: true },
      });
      if (!orgCatalog) throw new TRPCError({ code: "NOT_FOUND", message: "Org rate catalog not found." });

      // Find project rate catalog items that have a "__PROJECT__" rate
      const projectCatalog = await db.rateCatalog.findFirst({
        where: { projectId: input.projectId, fiscalYear: orgCatalog.fiscalYear },
        include: {
          items: {
            include: {
              rates: { where: { district: "__PROJECT__" } },
            },
          },
        },
      });

      if (!projectCatalog || projectCatalog.items.length === 0) {
        return { count: 0, message: "No project rates found to sync." };
      }

      // Upsert ProjectRateColumn in org rate catalog
      const column = await db.projectRateColumn.upsert({
        where: {
          rateCatalogId_projectId: {
            rateCatalogId: input.orgRateCatalogId,
            projectId: input.projectId,
          },
        },
        create: {
          rateCatalogId: input.orgRateCatalogId,
          projectId: input.projectId,
          projectName: project.name,
          fiscalYear: orgCatalog.fiscalYear,
        },
        update: {
          projectName: project.name,
          syncedAt: new Date(),
        },
      });

      let syncedCount = 0;
      for (const pItem of projectCatalog.items) {
        const projectRate = pItem.rates[0]?.rate;
        if (projectRate === undefined || projectRate === null) continue;

        // Find matching item in org catalog by materialCatalogId or materialName
        const orgItem = orgCatalog.items.find(
          (oi) =>
            (oi.materialCatalogId && oi.materialCatalogId === pItem.materialCatalogId) ||
            oi.materialName.toLowerCase().trim() === pItem.materialName.toLowerCase().trim()
        );

        if (orgItem) {
          await db.projectRateColumnEntry.upsert({
            where: {
              columnId_rateCatalogItemId: {
                columnId: column.id,
                rateCatalogItemId: orgItem.id,
              },
            },
            create: {
              columnId: column.id,
              rateCatalogItemId: orgItem.id,
              rate: projectRate,
            },
            update: {
              rate: projectRate,
            },
          });
          syncedCount++;
        }
      }

      return { count: syncedCount, columnId: column.id, message: `Successfully synced ${syncedCount} project rate(s) to Org Rate Catalog.` };
    }),

  // Get project rates keyed by materialCatalogId for auto-fill on ingredient selection
  // Now uses CatalogRate (v2) with fallback to legacy ProjectRateColumnEntry
  getProjectRates: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input }) => {
      const rateMap: Record<string, number> = {};

      // Try v2: look up CatalogRate entries for project-scoped rate catalogs
      const projectCatalogs = await db.rateCatalog.findMany({
        where: { projectId: input.projectId, scope: "project" },
        select: { id: true },
      });

      if (projectCatalogs.length > 0) {
        const catalogIds = projectCatalogs.map((c) => c.id);
        const rates = await db.catalogRate.findMany({
          where: { rateCatalogId: { in: catalogIds } },
          include: { material: { select: { id: true } } },
        });
        for (const r of rates) {
          if (r.rate > 0) {
            rateMap[r.materialId] = r.rate;
          }
        }
      }

      // Fallback: legacy ProjectRateColumnEntry
      if (Object.keys(rateMap).length === 0) {
        const entries = await db.projectRateColumnEntry.findMany({
          where: { column: { projectId: input.projectId } },
          include: { rateCatalogItem: { select: { materialCatalogId: true } } },
        });
        for (const e of entries) {
          if (e.rateCatalogItem?.materialCatalogId && e.rate > 0) {
            rateMap[e.rateCatalogItem.materialCatalogId] = e.rate;
          }
        }
      }

      return { rateMap };
    }),

  // Get project rate columns for an org catalog (to display side-by-side in org catalog view)
  getOrgProjectColumns: protectedProcedure
    .input(z.object({ rateCatalogId: z.string() }))
    .query(async ({ input }) => {
      const columns = await db.projectRateColumn.findMany({
        where: { rateCatalogId: input.rateCatalogId },
        include: {
          rates: true,
        },
        orderBy: { projectName: "asc" },
      });
      return { columns };
    }),
});
