import { isOrgAdmin } from "@/lib/authz";
/**
 * Rate Catalog master router merging base CRUD, sync, items, and org inheritance.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, mergeRouters } from "@/server/trpc";
import { db } from "@/lib/db";
import { rateCatalogSyncRouter } from "./rate-catalog-sync";
import { rateCatalogItemsRouter } from "./rate-catalog-items";
import { rateCatalogOrgRouter } from "./rate-catalog-org";

const rateCatalogBaseRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        organizationId: z.string().optional(),
        scope: z.string().optional(),
        activeOnly: z.boolean().default(false),
      })
    )
    .query(async ({ ctx, input }) => {
      const orgId = input.organizationId ?? ctx.user.organizationId;
      const where: any = {};
      if (input.scope) where.scope = input.scope;
      if (input.activeOnly) where.isActive = true;
      if (orgId && input.scope !== "global") {
        where.OR = [{ organizationId: orgId }, { organizationId: null }];
      } else if (isOrgAdmin(ctx.user)) {
        where.organizationId = input.scope === "global" ? null : orgId ?? null;
      } else {
        where.organizationId = orgId;
      }

      const catalogs = await db.rateCatalog.findMany({
        where,
        orderBy: [{ fiscalYear: "desc" }, { name: "asc" }],
        include: { _count: { select: { items: true } } },
      });
      return { catalogs };
    }),

  listGlobal: protectedProcedure.query(async () => {
    const catalogs = await db.rateCatalog.findMany({
      where: { scope: "global", organizationId: null },
      include: { _count: { select: { items: true } } },
      orderBy: [{ fiscalYear: "desc" }, { name: "asc" }],
    });
    return { catalogs };
  }),

  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const catalog = await db.rateCatalog.findUnique({
        where: { id: input.id },
        include: {
          items: {
            orderBy: { code: "asc" },
            include: {
              rates: true,
              materialCatalog: true,
            },
          },
        },
      });
      if (!catalog) throw new TRPCError({ code: "NOT_FOUND" });
      return { catalog };
    }),

  create: protectedProcedure
    .input(
      z.object({
        organizationId: z.string().optional(),
        name: z.string().min(1),
        fiscalYear: z.string().min(1),
        districts: z.array(z.string()).min(1),
        scope: z.enum(["global", "org"]).default("org"),
        sourceCatalogId: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (input.scope === "global" && !isOrgAdmin(ctx.user)) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const orgId = input.organizationId ?? ctx.user.organizationId;
      const catalog = await db.rateCatalog.create({
        data: {
          organizationId: input.scope === "global" ? null : orgId,
          name: input.name,
          fiscalYear: input.fiscalYear,
          districts: input.districts,
          scope: input.scope,
          sourceCatalogId: input.sourceCatalogId,
        },
      });
      return { catalog };
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().optional(),
        fiscalYear: z.string().optional(),
        districts: z.array(z.string()).optional(),
        isActive: z.boolean().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const data: any = {};
      if (input.name !== undefined) data.name = input.name;
      if (input.fiscalYear !== undefined) data.fiscalYear = input.fiscalYear;
      if (input.districts !== undefined) data.districts = input.districts;
      if (input.isActive !== undefined) {
        if (input.isActive) {
          const cat = await db.rateCatalog.findUnique({ where: { id: input.id } });
          await db.rateCatalog.updateMany({
            where: {
              isActive: true,
              id: { not: input.id },
              organizationId: cat?.organizationId ?? null,
            },
            data: { isActive: false },
          });
        }
        data.isActive = input.isActive;
      }
      const catalog = await db.rateCatalog.update({ where: { id: input.id }, data });
      return { catalog };
    }),

  setActive: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const cat = await db.rateCatalog.findUnique({ where: { id: input.id } });
      if (!cat) throw new TRPCError({ code: "NOT_FOUND" });

      const isOwner =
        cat.organizationId && cat.organizationId === ctx.user.organizationId;
      if (!isOwner && !isOrgAdmin(ctx.user)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You can only manage rate catalogs belonging to your organization.",
        });
      }

      await db.rateCatalog.updateMany({
        where: { organizationId: cat.organizationId, isActive: true },
        data: { isActive: false },
      });
      await db.rateCatalog.update({
        where: { id: input.id },
        data: { isActive: true },
      });
      return { ok: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const cat = await db.rateCatalog.findUnique({ where: { id: input.id } });
      if (!cat) throw new TRPCError({ code: "NOT_FOUND", message: "Catalog not found." });

      const isOwner =
        cat.organizationId && cat.organizationId === ctx.user.organizationId;
      if (!isOwner && !isOrgAdmin(ctx.user)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You can only delete rate catalogs belonging to your organization.",
        });
      }

      await db.rateCatalog.delete({ where: { id: input.id } });
      return { ok: true };
    }),

  importGlobal: protectedProcedure
    .input(
      z.object({
        globalCatalogId: z.string(),
        organizationId: z.string().optional(),
        name: z.string().optional(),
        fiscalYear: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const globalCat = await db.rateCatalog.findUnique({
        where: { id: input.globalCatalogId },
        include: {
          items: {
            include: { rates: true },
          },
        },
      });
      if (!globalCat || globalCat.scope !== "global") {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Global catalog not found.",
        });
      }

      const orgId = input.organizationId ?? ctx.user.organizationId;
      if (!orgId) throw new TRPCError({ code: "BAD_REQUEST" });

      const catalog = await db.rateCatalog.create({
        data: {
          organizationId: orgId,
          name: input.name ?? globalCat.name,
          fiscalYear: input.fiscalYear ?? globalCat.fiscalYear,
          districts: globalCat.districts,
          scope: "org",
          sourceCatalogId: globalCat.id,
          items: {
            create: globalCat.items.map((item) => ({
              code: item.code,
              materialName: item.materialName,
              materialCatalogId: item.materialCatalogId,
              unit: item.unit,
              sortOrder: item.sortOrder,
              rates: {
                create: item.rates.map((r) => ({
                  district: r.district,
                  rate: r.rate,
                })),
              },
            })),
          },
        },
        include: { _count: { select: { items: true } } },
      });
      return { catalog };
    }),

  copyWithInflation: protectedProcedure
    .input(
      z.object({
        sourceCatalogId: z.string(),
        name: z.string(),
        fiscalYear: z.string(),
        inflationPct: z.number().default(0),
        organizationId: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const source = await db.rateCatalog.findUnique({
        where: { id: input.sourceCatalogId },
        include: {
          items: {
            include: { rates: true },
          },
        },
      });
      if (!source) throw new TRPCError({ code: "NOT_FOUND" });

      const orgId = input.organizationId ?? ctx.user.organizationId;
      const factor = 1 + input.inflationPct / 100;

      const catalog = await db.rateCatalog.create({
        data: {
          organizationId: orgId,
          name: input.name,
          fiscalYear: input.fiscalYear,
          districts: source.districts,
          scope:
            source.scope === "global" && isOrgAdmin(ctx.user)
              ? "global"
              : "org",
          isActive: false,
          items: {
            create: source.items.map((item) => ({
              code: item.code,
              materialName: item.materialName,
              materialCatalogId: item.materialCatalogId,
              unit: item.unit,
              sortOrder: item.sortOrder,
              rates: {
                create: item.rates.map((r) => ({
                  district: r.district,
                  rate: Math.round(r.rate * factor),
                })),
              },
            })),
          },
        },
      });
      return { catalog };
    }),
});

export const rateCatalogRouter = mergeRouters(
  rateCatalogBaseRouter,
  rateCatalogSyncRouter,
  rateCatalogItemsRouter,
  rateCatalogOrgRouter
);
