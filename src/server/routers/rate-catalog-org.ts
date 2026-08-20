import { isOrgAdmin } from "@/lib/authz";
/**
 * Hierarchical Org Rate Catalog (Inheritance Model & Overrides).
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "@/server/trpc";
import { db } from "@/lib/db";

export const rateCatalogOrgRouter = router({
  listOrgCatalogs: protectedProcedure
    .input(
      z.object({
        organizationId: z.string().optional(),
        fiscalYear: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const orgId = input.organizationId ?? ctx.user.organizationId;
      if (!orgId)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Organization ID is required.",
        });

      const where: any = { organizationId: orgId };
      if (input.fiscalYear) where.fiscalYear = input.fiscalYear;

      const orgCatalogs = await db.orgRateCatalog.findMany({
        where,
        include: {
          parentGlobalCatalog: {
            select: {
              id: true,
              name: true,
              fiscalYear: true,
              districts: true,
              isBaseline: true,
            },
          },
          _count: {
            select: { overrides: true, projectOverrides: true },
          },
        },
        orderBy: [{ fiscalYear: "desc" }, { createdAt: "desc" }],
      });

      return { orgCatalogs };
    }),

  createOrgCatalog: protectedProcedure
    .input(
      z.object({
        organizationId: z.string().optional(),
        parentGlobalCatalogId: z.string(),
        name: z.string().min(1),
        fiscalYear: z.string().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const orgId = input.organizationId ?? ctx.user.organizationId;
      if (!orgId)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Organization ID is required.",
        });

      if (ctx.user.orgRole !== "org_admin" && !isOrgAdmin(ctx.user)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only Org Admins can create Org Rate Catalogs.",
        });
      }

      const parent = await db.rateCatalog.findUnique({
        where: { id: input.parentGlobalCatalogId },
      });
      if (!parent || parent.scope !== "global") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Parent global rate catalog not found.",
        });
      }

      const existing = await db.orgRateCatalog.findUnique({
        where: {
          organizationId_fiscalYear: {
            organizationId: orgId,
            fiscalYear: input.fiscalYear,
          },
        },
      });

      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `An Org Rate Catalog for fiscal year ${input.fiscalYear} already exists.`,
        });
      }

      const orgCatalog = await db.orgRateCatalog.create({
        data: {
          organizationId: orgId,
          parentGlobalCatalogId: input.parentGlobalCatalogId,
          name: input.name.trim(),
          fiscalYear: input.fiscalYear.trim(),
          isActive: true,
        },
        include: {
          parentGlobalCatalog: true,
        },
      });

      return { orgCatalog };
    }),

  getOrgCatalog: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const orgCatalog = await db.orgRateCatalog.findUnique({
        where: { id: input.id },
        include: {
          parentGlobalCatalog: {
            include: {
              items: {
                include: { rates: true, globalMaterial: true },
              },
            },
          },
          overrides: {
            include: {
              orgMaterialEntry: {
                include: { globalMaterial: true },
              },
            },
          },
        },
      });

      if (!orgCatalog) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Org rate catalog not found.",
        });
      }

      return { orgCatalog };
    }),

  setOrgOverride: protectedProcedure
    .input(
      z.object({
        orgCatalogId: z.string(),
        orgMaterialEntryId: z.string(),
        district: z.string(),
        rate: z.number().min(0),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.orgRole !== "org_admin" && !isOrgAdmin(ctx.user)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only Org Admins can set rate overrides.",
        });
      }

      // Verify the org catalog belongs to the caller's organization
      const orgCatalog = await db.orgRateCatalog.findUnique({
        where: { id: input.orgCatalogId },
        select: { organizationId: true },
      });
      if (!orgCatalog) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Org rate catalog not found." });
      }
      if (orgCatalog.organizationId !== ctx.user.organizationId && !ctx.user.isSuperAdmin) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Cannot modify another organization's rate catalog." });
      }

      const override = await db.orgRateOverride.upsert({
        where: {
          orgCatalogId_orgMaterialEntryId_district: {
            orgCatalogId: input.orgCatalogId,
            orgMaterialEntryId: input.orgMaterialEntryId,
            district: input.district,
          },
        },
        create: {
          orgCatalogId: input.orgCatalogId,
          orgMaterialEntryId: input.orgMaterialEntryId,
          district: input.district,
          rate: input.rate,
        },
        update: {
          rate: input.rate,
        },
      });

      return { override };
    }),

  setProjectOverride: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        orgCatalogId: z.string(),
        materialId: z.string(),
        rate: z.number().min(0),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Auth: verify project membership
      const membership = await db.projectMember.findFirst({
        where: { projectId: input.projectId, userId: ctx.user.id },
      });
      if (!membership && !ctx.user.isSuperAdmin) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not a member of this project." });
      }
      // Only managers+ can set rate overrides
      const canWrite = ["owner", "admin", "manager"].includes(membership?.role ?? "") || ctx.user.isSuperAdmin;
      if (!canWrite) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Insufficient permissions to set rate overrides." });
      }

      const override = await db.projectRateOverride.upsert({
        where: {
          projectId_materialId: {
            projectId: input.projectId,
            materialId: input.materialId,
          },
        },
        create: {
          projectId: input.projectId,
          orgCatalogId: input.orgCatalogId,
          materialId: input.materialId,
          rate: input.rate,
        },
        update: {
          rate: input.rate,
        },
      });

      return { override };
    }),

  resolveEffectiveRates: protectedProcedure
    .input(
      z.object({
        district: z.string(),
        orgCatalogId: z.string().optional(),
        globalCatalogId: z.string().optional(),
        projectId: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      // Auth: verify membership if scoped to org or project
      if (input.projectId) {
        const membership = await db.projectMember.findFirst({
          where: { projectId: input.projectId, userId: ctx.user.id },
        });
        if (!membership && !ctx.user.isSuperAdmin) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Not a member of this project." });
        }
      } else if (input.orgCatalogId || input.globalCatalogId) {
        const orgId = ctx.user.organizationId;
        if (!orgId && !ctx.user.isSuperAdmin) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Organization membership required." });
        }
      }

      let globalCatalogId = input.globalCatalogId;
      let orgCatalog: any = null;

      if (input.orgCatalogId) {
        orgCatalog = await db.orgRateCatalog.findUnique({
          where: { id: input.orgCatalogId },
          include: { overrides: { where: { district: input.district } } },
        });
        if (orgCatalog) {
          globalCatalogId = orgCatalog.parentGlobalCatalogId;
        }
      }

      const globalRates = globalCatalogId
        ? await db.rateCatalogItem.findMany({
            where: { catalogId: globalCatalogId },
            include: {
              rates: { where: { district: input.district } },
              globalMaterial: true,
            },
          })
        : [];

      // Key by materialCatalogId (the link between RateCatalogItem and MaterialCatalog)
      const rateMap = new Map<
        string,
        {
          materialName: string;
          unit: string;
          rate: number;
          source: "global" | "org_override" | "project_override";
          globalMaterialId: string | null;
          materialCatalogId: string | null;
        }
      >();

      for (const item of globalRates) {
        const rateVal = item.rates[0]?.rate ?? 0;
        const key = item.materialCatalogId || item.globalMaterialId || item.id;
        rateMap.set(key, {
          materialName: item.materialName,
          unit: item.unit,
          rate: rateVal,
          source: "global",
          globalMaterialId: item.globalMaterialId,
          materialCatalogId: item.materialCatalogId,
        });
      }

      // Apply org overrides — match by orgMaterialEntry's globalMaterialId
      if (orgCatalog?.overrides) {
        for (const ov of orgCatalog.overrides) {
          const orgEntry = await db.orgMaterialEntry.findUnique({
            where: { id: ov.orgMaterialEntryId },
            select: { globalMaterialId: true },
          });
          const key = orgEntry?.globalMaterialId || ov.orgMaterialEntryId;
          const existing = rateMap.get(key);
          if (existing) {
            existing.rate = ov.rate;
            existing.source = "org_override";
          }
        }
      }

      // Apply project overrides — match by material's catalog link
      if (input.projectId) {
        const projOverrides = await db.projectRateOverride.findMany({
          where: { projectId: input.projectId },
          include: { material: { select: { materialCatalogId: true, orgMaterialEntryId: true } } },
        });
        for (const pov of projOverrides) {
          const key = pov.material?.materialCatalogId || pov.materialId;
          const entry = rateMap.get(key);
          if (entry) {
            entry.rate = pov.rate;
            entry.source = "project_override";
          }
        }
      }

      return {
        district: input.district,
        rates: Array.from(rateMap.entries()).map(([id, data]) => ({
          id,
          ...data,
        })),
      };
    }),
});
