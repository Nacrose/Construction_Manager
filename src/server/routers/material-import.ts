import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "@/server/trpc";
import { db } from "@/lib/db";
import { findSimilarMaterials, SimilarityMatch } from "@/lib/fuzzy-match";

const ImportRowSchema = z.object({
  rawName: z.string().min(1),
  category: z.string().optional().nullable(),
  subCategory: z.string().optional().nullable(),
  unit: z.string().optional().nullable(),
  defaultRate: z.number().optional().nullable(),
  code: z.string().optional().nullable(),
});

export const materialImportRouter = router({
  tallyImportRows: protectedProcedure
    .input(z.object({
      rows: z.array(ImportRowSchema).min(1).max(500),
      organizationId: z.string().optional(),
      scope: z.enum(["global", "org"]).default("org"),
    }))
    .mutation(async ({ ctx, input }) => {
      const orgId = input.organizationId ?? ctx.user.organizationId;
      if (input.scope === "org" && !orgId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Organization ID is required." });
      }

      const tallies = await Promise.all(
        input.rows.map(async (row, index) => {
          const suggestions = await findSimilarMaterials({
            name: row.rawName,
            scope: input.scope,
            organizationId: orgId,
            threshold: 0.35,
            limit: 3,
          });

          const topMatch = suggestions[0];
          let status: "exact" | "similar" | "unique" = "unique";
          let recommendedAction: "link_existing" | "add_alias" | "create_new" = "create_new";

          if (topMatch) {
            if (topMatch.matchType === "exact" || topMatch.score >= 0.98 || topMatch.matchType === "alias") {
              status = "exact";
              recommendedAction = "link_existing";
            } else if (topMatch.score >= 0.65 || topMatch.matchType === "token_sort") {
              status = "similar";
              recommendedAction = topMatch.matchType === "token_sort" ? "add_alias" : "link_existing";
            }
          }

          return {
            index,
            row,
            status,
            recommendedAction,
            topMatch: topMatch || null,
            suggestions,
          };
        })
      );

      const exactCount = tallies.filter((t) => t.status === "exact").length;
      const similarCount = tallies.filter((t) => t.status === "similar").length;
      const uniqueCount = tallies.filter((t) => t.status === "unique").length;

      return {
        tallies,
        summary: {
          total: tallies.length,
          exactCount,
          similarCount,
          uniqueCount,
        },
      };
    }),

  commitImport: protectedProcedure
    .input(z.object({
      organizationId: z.string().optional(),
      scope: z.enum(["global", "org"]).default("org"),
      items: z.array(z.object({
        rawName: z.string(),
        category: z.string().optional().nullable(),
        subCategory: z.string().optional().nullable(),
        unit: z.string().optional().nullable(),
        defaultRate: z.number().optional().nullable(),
        code: z.string().optional().nullable(),
        action: z.enum(["link_existing", "add_alias", "create_new"]),
        targetId: z.string().optional().nullable(), // ID of existing item to link or add alias to
      })).min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const orgId = input.organizationId ?? ctx.user.organizationId;
      if (input.scope === "org" && !orgId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Organization ID is required." });
      }

      let createdCount = 0;
      let linkedCount = 0;
      let aliasCount = 0;

      await db.$transaction(async (tx) => {
        for (const item of input.items) {
          if (item.action === "link_existing" && item.targetId) {
            // If in Org scope, ensure adoption
            if (input.scope === "org" && orgId) {
              const existingOrg = await tx.orgMaterialEntry.findFirst({
                where: {
                  organizationId: orgId,
                  OR: [{ id: item.targetId }, { globalMaterialId: item.targetId }],
                },
              });

              if (!existingOrg) {
                // Adopt global material into org
                await tx.orgMaterialEntry.create({
                  data: {
                    organizationId: orgId,
                    globalMaterialId: item.targetId,
                    localName: item.rawName,
                    localUnit: item.unit || "unit",
                    localCategory: item.category || null,
                    defaultRate: item.defaultRate || 0,
                    isActive: true,
                  },
                });
              }
            }
            linkedCount++;
          } else if (item.action === "add_alias" && item.targetId) {
            // Append alias to global or org item
            if (input.scope === "global") {
              const target = await tx.globalMaterialCatalog.findUnique({ where: { id: item.targetId } });
              if (target && !target.aliases.includes(item.rawName)) {
                await tx.globalMaterialCatalog.update({
                  where: { id: item.targetId },
                  data: { aliases: [...target.aliases, item.rawName] },
                });
              }
            }
            aliasCount++;
          } else {
            // Create new item
            const norm = item.rawName.toLowerCase().trim().replace(/[,.()\-]/g, " ").replace(/\s+/g, " ").split(" ").sort().join(" ");

            if (input.scope === "global") {
              await tx.globalMaterialCatalog.create({
                data: {
                  name: item.rawName.trim(),
                  normalizedName: norm,
                  code: item.code?.trim() || null,
                  category: item.category?.trim() || null,
                  subCategory: item.subCategory?.trim() || null,
                  defaultUnit: item.unit?.trim() || "unit",
                  defaultRate: item.defaultRate || 0,
                  aliases: [],
                  isActive: true,
                },
              });
            } else if (orgId) {
              await tx.orgMaterialEntry.create({
                data: {
                  organizationId: orgId,
                  globalMaterialId: null,
                  isCustom: true,
                  localName: item.rawName.trim(),
                  localUnit: item.unit?.trim() || "unit",
                  localCategory: item.category?.trim() || null,
                  localSubCategory: item.subCategory?.trim() || null,
                  localCode: item.code?.trim() || null,
                  defaultRate: item.defaultRate || 0,
                  isActive: true,
                },
              });
            }
            createdCount++;
          }
        }
      });

      return {
        success: true,
        createdCount,
        linkedCount,
        aliasCount,
        totalProcessed: input.items.length,
      };
    }),
});
