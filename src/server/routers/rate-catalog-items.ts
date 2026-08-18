/**
 * Rate Catalog item CRUD and district rate manipulation.
 */
import { z } from "zod";
import { router, protectedProcedure } from "@/server/trpc";
import { db } from "@/lib/db";

export const rateCatalogItemsRouter = router({
  addItem: protectedProcedure
    .input(
      z.object({
        catalogId: z.string(),
        code: z.number(),
        materialName: z.string().min(1),
        materialCatalogId: z.string().optional(),
        unit: z.string(),
        rates: z.record(z.string(), z.number()).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const maxOrder = await db.rateCatalogItem.aggregate({
        where: { catalogId: input.catalogId },
        _max: { sortOrder: true },
      });
      const item = await db.rateCatalogItem.create({
        data: {
          catalogId: input.catalogId,
          code: input.code,
          materialName: input.materialName,
          materialCatalogId: input.materialCatalogId ?? null,
          unit: input.unit,
          sortOrder: (maxOrder._max.sortOrder ?? -1) + 1,
        },
      });
      if (input.rates) {
        for (const [district, rate] of Object.entries(input.rates)) {
          await db.rateCatalogItemRate.create({
            data: { itemId: item.id, district, rate },
          });
        }
      }
      return { item };
    }),

  updateItem: protectedProcedure
    .input(
      z.object({
        itemId: z.string(),
        materialName: z.string().optional(),
        materialCatalogId: z.string().nullable().optional(),
        unit: z.string().optional(),
        code: z.number().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const data: any = {};
      if (input.materialName !== undefined) data.materialName = input.materialName;
      if (input.unit !== undefined) data.unit = input.unit;
      if (input.code !== undefined) data.code = input.code;
      if (input.materialCatalogId !== undefined)
        data.materialCatalogId = input.materialCatalogId;
      const item = await db.rateCatalogItem.update({
        where: { id: input.itemId },
        data,
      });
      return { item };
    }),

  deleteItem: protectedProcedure
    .input(z.object({ itemId: z.string() }))
    .mutation(async ({ input }) => {
      await db.rateCatalogItem.delete({ where: { id: input.itemId } });
      return { ok: true };
    }),

  setItemRate: protectedProcedure
    .input(
      z.object({
        itemId: z.string(),
        district: z.string(),
        rate: z.number(),
      })
    )
    .mutation(async ({ input }) => {
      const r = await db.rateCatalogItemRate.upsert({
        where: {
          itemId_district: { itemId: input.itemId, district: input.district },
        },
        create: {
          itemId: input.itemId,
          district: input.district,
          rate: input.rate,
        },
        update: { rate: input.rate },
      });
      return { rate: r };
    }),

  setItemRates: protectedProcedure
    .input(
      z.object({
        itemId: z.string(),
        rates: z.record(z.string(), z.number()),
      })
    )
    .mutation(async ({ input }) => {
      for (const [district, rate] of Object.entries(input.rates)) {
        await db.rateCatalogItemRate.upsert({
          where: { itemId_district: { itemId: input.itemId, district } },
          create: { itemId: input.itemId, district, rate },
          update: { rate },
        });
      }
      return { ok: true };
    }),

  bulkSetRates: protectedProcedure
    .input(
      z.object({
        rates: z.array(
          z.object({
            itemId: z.string(),
            district: z.string(),
            rate: z.number(),
          })
        ),
      })
    )
    .mutation(async ({ input }) => {
      for (const r of input.rates) {
        await db.rateCatalogItemRate.upsert({
          where: { itemId_district: { itemId: r.itemId, district: r.district } },
          create: { itemId: r.itemId, district: r.district, rate: r.rate },
          update: { rate: r.rate },
        });
      }
      return { ok: true };
    }),

  getMissingRatesCount: protectedProcedure
    .input(
      z.object({
        catalogId: z.string().optional(),
        organizationId: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const orgId = input.organizationId ?? ctx.user.organizationId;

      let catalogIds: string[] = [];
      if (input.catalogId) {
        catalogIds = [input.catalogId];
      } else {
        const catalogs = await db.rateCatalog.findMany({
          where: { OR: [{ organizationId: orgId }, { scope: "global" }] },
          select: { id: true },
        });
        catalogIds = catalogs.map((c) => c.id);
      }

      if (catalogIds.length === 0) return { count: 0, missingItemIds: [] };

      const items = await db.rateCatalogItem.findMany({
        where: { catalogId: { in: catalogIds } },
        include: { rates: true },
      });

      const missingItems = items.filter(
        (item) =>
          item.rates.length === 0 || item.rates.every((r) => r.rate === 0)
      );

      return {
        count: missingItems.length,
        missingItemIds: missingItems.map((i) => i.id),
      };
    }),
});
