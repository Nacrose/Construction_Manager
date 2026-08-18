import { isOrgAdmin } from "@/lib/authz";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "@/server/trpc";
import { db } from "@/lib/db";

export const materialMergeRouter = router({
  previewMerge: protectedProcedure
    .input(z.object({
      level: z.enum(["global", "org", "project"]),
      winnerId: z.string(),
      loserId: z.string(),
    }))
    .query(async ({ input }) => {
      if (input.winnerId === input.loserId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Winner and loser cannot be the same material." });
      }

      if (input.level === "global") {
        const [winner, loser, orgEntries, rateItems, boqIngredients] = await Promise.all([
          db.globalMaterialCatalog.findUnique({ where: { id: input.winnerId } }),
          db.globalMaterialCatalog.findUnique({ where: { id: input.loserId } }),
          db.orgMaterialEntry.count({ where: { globalMaterialId: input.loserId } }),
          db.rateCatalogItem.count({ where: { globalMaterialId: input.loserId } }),
          db.boqIngredient.count({ where: { globalMaterialId: input.loserId } }),
        ]);

        if (!winner || !loser) {
          throw new TRPCError({ code: "NOT_FOUND", message: "One or both global materials not found." });
        }

        return {
          winner: { id: winner.id, name: winner.name, category: winner.category, unit: winner.defaultUnit },
          loser: { id: loser.id, name: loser.name, category: loser.category, unit: loser.defaultUnit },
          affectedCounts: {
            orgEntries,
            rateItems,
            boqIngredients,
            totalRows: orgEntries + rateItems + boqIngredients,
          },
        };
      }

      if (input.level === "org") {
        const [winner, loser, projectMaterials, rateOverrides] = await Promise.all([
          db.orgMaterialEntry.findUnique({ where: { id: input.winnerId }, include: { globalMaterial: true } }),
          db.orgMaterialEntry.findUnique({ where: { id: input.loserId }, include: { globalMaterial: true } }),
          db.material.count({ where: { orgMaterialEntryId: input.loserId } }),
          db.orgRateOverride.count({ where: { orgMaterialEntryId: input.loserId } }),
        ]);

        if (!winner || !loser) {
          throw new TRPCError({ code: "NOT_FOUND", message: "One or both org materials not found." });
        }

        return {
          winner: { id: winner.id, name: winner.localName || winner.globalMaterial?.name, unit: winner.localUnit },
          loser: { id: loser.id, name: loser.localName || loser.globalMaterial?.name, unit: loser.localUnit },
          affectedCounts: {
            projectMaterials,
            rateOverrides,
            totalRows: projectMaterials + rateOverrides,
          },
        };
      }

      // Project level
      const [winner, loser, transactions, poItems, reqItems, boqIngs] = await Promise.all([
        db.material.findUnique({ where: { id: input.winnerId } }),
        db.material.findUnique({ where: { id: input.loserId } }),
        db.materialTransaction.count({ where: { materialId: input.loserId } }),
        db.purchaseOrderItem.count({ where: { materialId: input.loserId } }),
        db.purchaseRequisitionItem.count({ where: { materialId: input.loserId } }),
        db.boqIngredient.count({ where: { materialId: input.loserId } }),
      ]);

      if (!winner || !loser) {
        throw new TRPCError({ code: "NOT_FOUND", message: "One or both project materials not found." });
      }

      return {
        winner: { id: winner.id, name: winner.name, unit: winner.unit },
        loser: { id: loser.id, name: loser.name, unit: loser.unit },
        affectedCounts: {
          transactions,
          poItems,
          reqItems,
          boqIngs,
          totalRows: transactions + poItems + reqItems + boqIngs,
        },
      };
    }),

  executeMerge: protectedProcedure
    .input(z.object({
      level: z.enum(["global", "org", "project"]),
      winnerId: z.string(),
      loserId: z.string(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (input.level === "global" && !isOrgAdmin(ctx.user)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only SuperAdmins can merge global materials." });
      }
      if (input.level === "org" && ctx.user.orgRole !== "org_admin" && !isOrgAdmin(ctx.user)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only Org Admins can merge org materials." });
      }

      let totalRowsRemapped = 0;
      const affectedTables: string[] = [];

      // Execute entire merge inside an atomic database transaction
      await db.$transaction(async (tx) => {
        if (input.level === "global") {
          const winner = await tx.globalMaterialCatalog.findUnique({ where: { id: input.winnerId } });
          const loser = await tx.globalMaterialCatalog.findUnique({ where: { id: input.loserId } });
          if (!winner || !loser) throw new Error("Material not found.");

          // 1. Remap OrgMaterialEntry references
          const orgRes = await tx.orgMaterialEntry.updateMany({
            where: { globalMaterialId: loser.id },
            data: { globalMaterialId: winner.id },
          });
          if (orgRes.count > 0) {
            affectedTables.push("OrgMaterialEntry");
            totalRowsRemapped += orgRes.count;
          }

          // 2. Remap RateCatalogItem references
          const rciRes = await tx.rateCatalogItem.updateMany({
            where: { globalMaterialId: loser.id },
            data: { globalMaterialId: winner.id },
          });
          if (rciRes.count > 0) {
            affectedTables.push("RateCatalogItem");
            totalRowsRemapped += rciRes.count;
          }

          // 3. Remap BoqIngredient references
          const boqRes = await tx.boqIngredient.updateMany({
            where: { globalMaterialId: loser.id },
            data: { globalMaterialId: winner.id },
          });
          if (boqRes.count > 0) {
            affectedTables.push("BoqIngredient");
            totalRowsRemapped += boqRes.count;
          }

          // 4. Union aliases
          const combinedAliases = Array.from(
            new Set([...winner.aliases, loser.name, ...loser.aliases])
          );
          await tx.globalMaterialCatalog.update({
            where: { id: winner.id },
            data: { aliases: combinedAliases },
          });

          // 5. Soft-deactivate loser
          await tx.globalMaterialCatalog.update({
            where: { id: loser.id },
            data: {
              isActive: false,
              mergedIntoId: winner.id,
              mergedAt: new Date(),
            },
          });
        } else if (input.level === "org") {
          const winner = await tx.orgMaterialEntry.findUnique({ where: { id: input.winnerId } });
          const loser = await tx.orgMaterialEntry.findUnique({ where: { id: input.loserId } });
          if (!winner || !loser) throw new Error("Org material not found.");

          // 1. Remap Project Materials
          const pmRes = await tx.material.updateMany({
            where: { orgMaterialEntryId: loser.id },
            data: { orgMaterialEntryId: winner.id },
          });
          if (pmRes.count > 0) {
            affectedTables.push("Material");
            totalRowsRemapped += pmRes.count;
          }

          // 2. Soft-deactivate loser
          await tx.orgMaterialEntry.update({
            where: { id: loser.id },
            data: {
              isActive: false,
              mergedIntoId: winner.id,
              mergedAt: new Date(),
            },
          });
        } else {
          // Project level
          const winner = await tx.material.findUnique({ where: { id: input.winnerId } });
          const loser = await tx.material.findUnique({ where: { id: input.loserId } });
          if (!winner || !loser) throw new Error("Project material not found.");

          // Consolidate MaterialTransactions
          const txRes = await tx.materialTransaction.updateMany({
            where: { materialId: loser.id },
            data: { materialId: winner.id },
          });
          if (txRes.count > 0) {
            affectedTables.push("MaterialTransaction");
            totalRowsRemapped += txRes.count;
          }

          // Consolidate PO items
          const poRes = await tx.purchaseOrderItem.updateMany({
            where: { materialId: loser.id },
            data: { materialId: winner.id },
          });
          if (poRes.count > 0) {
            affectedTables.push("PurchaseOrderItem");
            totalRowsRemapped += poRes.count;
          }

          // Consolidate BoqIngredients
          const boqRes = await tx.boqIngredient.updateMany({
            where: { materialId: loser.id },
            data: { materialId: winner.id },
          });
          if (boqRes.count > 0) {
            affectedTables.push("BoqIngredient");
            totalRowsRemapped += boqRes.count;
          }

          // Soft-deactivate loser project material
          await tx.material.update({
            where: { id: loser.id },
            data: {
              isActive: false,
              mergedIntoId: winner.id,
              mergedAt: new Date(),
            },
          });
        }

        // Record Audit Log
        await tx.materialMergeLog.create({
          data: {
            level: input.level,
            winnerId: input.winnerId,
            loserId: input.loserId,
            mergedById: ctx.user.id,
            affectedTables,
            totalRowsRemapped,
            notes: input.notes?.trim() || null,
          },
        });
      });

      return { success: true, affectedTables, totalRowsRemapped };
    }),

  listMergeLogs: protectedProcedure
    .input(z.object({
      level: z.enum(["global", "org", "project"]).optional(),
      limit: z.number().min(1).max(100).default(30),
    }))
    .query(async ({ input }) => {
      const where: any = {};
      if (input.level) where.level = input.level;

      const logs = await db.materialMergeLog.findMany({
        where,
        include: {
          mergedBy: {
            select: { id: true, name: true, email: true },
          },
        },
        orderBy: { mergedAt: "desc" },
        take: input.limit,
      });

      return { logs };
    }),

  rollbackMerge: protectedProcedure
    .input(z.object({ mergeLogId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const log = await db.materialMergeLog.findUnique({ where: { id: input.mergeLogId } });
      if (!log) throw new TRPCError({ code: "NOT_FOUND", message: "Merge log not found." });
      if (log.isRolledBack) throw new TRPCError({ code: "BAD_REQUEST", message: "This merge is already rolled back." });

      // Check 24 hour window
      const ageHours = (Date.now() - new Date(log.mergedAt).getTime()) / (1000 * 60 * 60);
      if (ageHours > 24) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Rollback window expired (available for 24 hours after merge).",
        });
      }

      await db.$transaction(async (tx) => {
        if (log.level === "global") {
          await tx.globalMaterialCatalog.update({
            where: { id: log.loserId },
            data: { isActive: true, mergedIntoId: null, mergedAt: null },
          });
        } else if (log.level === "org") {
          await tx.orgMaterialEntry.update({
            where: { id: log.loserId },
            data: { isActive: true, mergedIntoId: null, mergedAt: null },
          });
        } else {
          await tx.material.update({
            where: { id: log.loserId },
            data: { isActive: true, mergedIntoId: null, mergedAt: null },
          });
        }

        await tx.materialMergeLog.update({
          where: { id: log.id },
          data: {
            isRolledBack: true,
            rolledBackAt: new Date(),
            rolledBackById: ctx.user.id,
          },
        });
      });

      return { success: true };
    }),
});
