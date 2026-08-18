import { isOrgAdmin } from "@/lib/authz";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "@/server/trpc";
import { db } from "@/lib/db";
import { findSimilarMaterials } from "@/lib/fuzzy-match";

export const uncatalogedMaterialRouter = router({
  list: protectedProcedure
    .input(z.object({
      level: z.enum(["global", "org"]).default("org"),
      organizationId: z.string().optional(),
      status: z.enum(["pending", "mapped", "promoted", "ignored", "all"]).default("pending"),
      limit: z.number().min(1).max(500).default(100),
    }))
    .query(async ({ ctx, input }) => {
      const orgId = input.organizationId ?? ctx.user.organizationId;
      const where: any = { level: input.level };

      if (input.level === "org") {
        if (!orgId) throw new TRPCError({ code: "BAD_REQUEST", message: "Organization ID is required." });
        where.organizationId = orgId;
      }

      if (input.status !== "all") {
        where.status = input.status;
      }

      const items = await db.uncatalogedMaterial.findMany({
        where,
        orderBy: [{ occurrenceCount: "desc" }, { createdAt: "desc" }],
        take: input.limit,
      });

      // Compute live fuzzy suggestions for pending items
      const enriched = await Promise.all(
        items.map(async (item) => {
          if (item.status === "pending") {
            const suggestions = await findSimilarMaterials({
              name: item.rawName,
              scope: input.level === "global" ? "global" : "all",
              organizationId: orgId,
              threshold: 0.35,
              limit: 4,
            });
            return {
              ...item,
              suggestions,
            };
          }
          return {
            ...item,
            suggestions: [],
          };
        })
      );

      return { items: enriched };
    }),

  stats: protectedProcedure
    .input(z.object({
      level: z.enum(["global", "org"]).default("org"),
      organizationId: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const orgId = input.organizationId ?? ctx.user.organizationId;
      const where: any = { level: input.level };
      if (input.level === "org" && orgId) {
        where.organizationId = orgId;
      }

      const [pending, mapped, promoted, ignored] = await Promise.all([
        db.uncatalogedMaterial.count({ where: { ...where, status: "pending" } }),
        db.uncatalogedMaterial.count({ where: { ...where, status: "mapped" } }),
        db.uncatalogedMaterial.count({ where: { ...where, status: "promoted" } }),
        db.uncatalogedMaterial.count({ where: { ...where, status: "ignored" } }),
      ]);

      return { pending, mapped, promoted, ignored, total: pending + mapped + promoted + ignored };
    }),

  mapToExisting: protectedProcedure
    .input(z.object({
      id: z.string(),
      targetType: z.enum(["global", "org"]),
      targetId: z.string(), // ID of GlobalMaterialCatalog or OrgMaterialEntry
    }))
    .mutation(async ({ ctx, input }) => {
      const uncataloged = await db.uncatalogedMaterial.findUnique({ where: { id: input.id } });
      if (!uncataloged) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Uncataloged material not found." });
      }

      let orgEntryId = input.targetId;

      if (input.targetType === "global") {
        // If mapped to a global item, ensure the current org has adopted it
        const orgId = uncataloged.organizationId ?? ctx.user.organizationId;
        if (!orgId) throw new TRPCError({ code: "BAD_REQUEST", message: "Organization ID is required." });

        let adopted = await db.orgMaterialEntry.findUnique({
          where: {
            organizationId_globalMaterialId: {
              organizationId: orgId,
              globalMaterialId: input.targetId,
            },
          },
        });

        if (!adopted) {
          const globalMat = await db.globalMaterialCatalog.findUnique({ where: { id: input.targetId } });
          if (!globalMat) throw new TRPCError({ code: "NOT_FOUND", message: "Global material not found." });

          adopted = await db.orgMaterialEntry.create({
            data: {
              organizationId: orgId,
              globalMaterialId: globalMat.id,
              isCustom: false,
              localName: globalMat.name,
              localUnit: globalMat.defaultUnit,
              localCategory: globalMat.category,
              localSubCategory: globalMat.subCategory,
              defaultRate: globalMat.defaultRate || 0,
              rateSource: globalMat.rateSource,
              isActive: true,
            },
          });
        }
        orgEntryId = adopted.id;
      }

      // Remap any project Materials with this uncataloged name in this org/project
      let remappedCount = 0;
      if (uncataloged.sourceProjectId) {
        const updateRes = await db.material.updateMany({
          where: {
            projectId: uncataloged.sourceProjectId,
            name: { equals: uncataloged.rawName, mode: "insensitive" },
          },
          data: { orgMaterialEntryId: orgEntryId },
        });
        remappedCount = updateRes.count;
      }

      // Mark uncataloged item as mapped
      const updated = await db.uncatalogedMaterial.update({
        where: { id: input.id },
        data: {
          status: "mapped",
          mappedToId: orgEntryId,
        },
      });

      return { success: true, item: updated, remappedCount };
    }),

  promoteToGlobal: protectedProcedure
    .input(z.object({
      id: z.string(),
      canonicalName: z.string().min(1),
      category: z.string().optional().nullable(),
      subCategory: z.string().optional().nullable(),
      defaultUnit: z.string().optional().nullable(),
      defaultRate: z.number().min(0).default(0),
      code: z.string().optional().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!isOrgAdmin(ctx.user)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only SuperAdmins can promote items to Global Catalog." });
      }

      const uncataloged = await db.uncatalogedMaterial.findUnique({ where: { id: input.id } });
      if (!uncataloged) throw new TRPCError({ code: "NOT_FOUND", message: "Item not found." });

      const norm = input.canonicalName.toLowerCase().trim().replace(/[,.()\-]/g, " ").replace(/\s+/g, " ").split(" ").sort().join(" ");

      // Create Global Material
      const globalItem = await db.globalMaterialCatalog.create({
        data: {
          name: input.canonicalName.trim(),
          normalizedName: norm,
          code: input.code?.trim() || null,
          category: input.category?.trim() || null,
          subCategory: input.subCategory?.trim() || null,
          defaultUnit: input.defaultUnit?.trim() || "unit",
          defaultRate: input.defaultRate || 0,
          aliases: [uncataloged.rawName],
          isActive: true,
        },
      });

      // Update all matching Org custom materials to link to this new global material
      if (uncataloged.organizationId) {
        await db.orgMaterialEntry.updateMany({
          where: {
            organizationId: uncataloged.organizationId,
            localName: { equals: uncataloged.rawName, mode: "insensitive" },
          },
          data: {
            globalMaterialId: globalItem.id,
            isCustom: false,
          },
        });
      }

      // Mark uncataloged as promoted
      const updated = await db.uncatalogedMaterial.update({
        where: { id: input.id },
        data: {
          status: "promoted",
          mappedToId: globalItem.id,
        },
      });

      return { globalItem, uncataloged: updated };
    }),

  ignore: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      const updated = await db.uncatalogedMaterial.update({
        where: { id: input.id },
        data: { status: "ignored" },
      });
      return { item: updated };
    }),
});
