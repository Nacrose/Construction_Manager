import { isOrgAdmin } from "@/lib/authz";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "@/server/trpc";
import { db } from "@/lib/db";

export const fiscalYearRouter = router({
  previewFiscalYearSwitch: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      targetFiscalYear: z.string(),
      district: z.string().optional().default("Morang"),
    }))
    .query(async ({ input }) => {
      const project = await db.project.findUnique({
        where: { id: input.projectId },
        include: {
          materials: {
            include: {
              orgMaterialEntry: {
                include: { globalMaterial: true },
              },
            },
          },
          boqItems: {
            include: {
              ingredients: true,
            },
          },
        },
      });

      if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found." });

      const currentFY = project.activeFiscalYear || "2080/81";
      const targetFY = input.targetFiscalYear;

      // Find target rate catalog for the target fiscal year
      const targetCatalog = await db.rateCatalog.findFirst({
        where: {
          fiscalYear: targetFY,
          OR: [
            { scope: "global" },
            ...(project.organizationId ? [{ organizationId: project.organizationId }] : []),
          ],
        },
        include: {
          items: {
            include: { rates: { where: { district: input.district } } },
          },
        },
        orderBy: { isActive: "desc" },
      });

      if (!targetCatalog) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `No rate catalog found for fiscal year ${targetFY}.`,
        });
      }

      // Map target rates by material name / globalMaterialId
      const targetRateMap = new Map<string, number>();
      for (const item of targetCatalog.items) {
        const rateVal = item.rates[0]?.rate || 0;
        if (item.globalMaterialId) targetRateMap.set(item.globalMaterialId, rateVal);
        targetRateMap.set(item.materialName.toLowerCase().trim(), rateVal);
      }

      // Compute remaining estimated quantities from BOQ ingredients
      const qtyMap = new Map<string, number>();
      for (const boqItem of project.boqItems) {
        for (const ing of boqItem.ingredients) {
          if (ing.type === "material" && ing.name) {
            const key = ing.materialCatalogId || ing.name.toLowerCase().trim();
            const currentQty = qtyMap.get(key) || 0;
            // ingredient quantity * boq item quantity
            qtyMap.set(key, currentQty + (ing.quantity * (boqItem.quantity || 1)));
          }
        }
      }

      let totalCostImpact = 0;
      let itemsIncreased = 0;
      let itemsDecreased = 0;

      const rows = project.materials.map((mat) => {
        const key = mat.orgMaterialEntry?.globalMaterialId || mat.name.toLowerCase().trim();
        const oldRate = mat.orgMaterialEntry?.defaultRate || 0;
        const newRate = targetRateMap.get(key) || oldRate;
        const rateDelta = newRate - oldRate;
        const remainingQty = qtyMap.get(key) || 0;
        const costImpact = rateDelta * remainingQty;

        totalCostImpact += costImpact;
        if (rateDelta > 0) itemsIncreased++;
        if (rateDelta < 0) itemsDecreased++;

        return {
          materialId: mat.id,
          materialName: mat.name,
          unit: mat.unit,
          oldRate,
          newRate,
          rateDelta,
          changePct: oldRate > 0 ? (rateDelta / oldRate) * 100 : 0,
          estimatedRemainingQty: remainingQty,
          costImpact,
        };
      });

      return {
        currentFiscalYear: currentFY,
        targetFiscalYear: targetFY,
        district: input.district,
        totalCostImpact,
        itemsIncreased,
        itemsDecreased,
        totalMaterials: rows.length,
        rows: rows.sort((a, b) => Math.abs(b.costImpact) - Math.abs(a.costImpact)),
      };
    }),

  executeFiscalYearSwitch: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      targetFiscalYear: z.string(),
      district: z.string().optional().default("Morang"),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const project = await db.project.findUnique({
        where: { id: input.projectId },
        include: {
          materials: {
            include: {
              orgMaterialEntry: true,
            },
          },
          boqItems: {
            include: {
              ingredients: true,
            },
          },
        },
      });

      if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found." });

      const fromFY = project.activeFiscalYear || "2080/81";
      const toFY = input.targetFiscalYear;

      const targetCatalog = await db.rateCatalog.findFirst({
        where: {
          fiscalYear: toFY,
          OR: [
            { scope: "global" },
            ...(project.organizationId ? [{ organizationId: project.organizationId }] : []),
          ],
        },
        include: {
          items: {
            include: { rates: { where: { district: input.district } } },
          },
        },
      });

      if (!targetCatalog) {
        throw new TRPCError({ code: "NOT_FOUND", message: `No rate catalog found for FY ${toFY}.` });
      }

      const targetRateMap = new Map<string, number>();
      for (const item of targetCatalog.items) {
        const rateVal = item.rates[0]?.rate || 0;
        if (item.globalMaterialId) targetRateMap.set(item.globalMaterialId, rateVal);
        targetRateMap.set(item.materialName.toLowerCase().trim(), rateVal);
      }

      const qtyMap = new Map<string, number>();
      for (const boqItem of project.boqItems) {
        for (const ing of boqItem.ingredients) {
          if (ing.type === "material" && ing.name) {
            const key = ing.materialCatalogId || ing.name.toLowerCase().trim();
            const currentQty = qtyMap.get(key) || 0;
            qtyMap.set(key, currentQty + (ing.quantity * (boqItem.quantity || 1)));
          }
        }
      }

      let totalCostImpact = 0;
      const entriesToCreate: any[] = [];

      for (const mat of project.materials) {
        const key = mat.orgMaterialEntry?.globalMaterialId || mat.name.toLowerCase().trim();
        const oldRate = mat.orgMaterialEntry?.defaultRate || 0;
        const newRate = targetRateMap.get(key) || oldRate;
        const rateDelta = newRate - oldRate;
        const remainingQty = qtyMap.get(key) || 0;
        const costImpact = rateDelta * remainingQty;
        totalCostImpact += costImpact;

        entriesToCreate.push({
          materialName: mat.name,
          district: input.district,
          oldMarketRate: oldRate,
          newMarketRate: newRate,
          rateDelta,
          estimatedRemainingQty: remainingQty,
          costImpact,
        });
      }

      // Execute transaction
      await db.$transaction(async (tx) => {
        const log = await tx.marketRateRevisionLog.create({
          data: {
            projectId: input.projectId,
            revisionType: "fiscal_year_switch",
            fromFiscalYear: fromFY,
            toFiscalYear: toFY,
            effectiveDate: new Date(),
            loggedById: ctx.user.id,
            totalCostImpact,
            notes: input.notes?.trim() || `Switched active district rate fiscal year from ${fromFY} to ${toFY}`,
            entries: {
              createMany: {
                data: entriesToCreate,
              },
            },
          },
        });

        // Update Project
        await tx.project.update({
          where: { id: input.projectId },
          data: { activeFiscalYear: toFY },
        });
      });

      return {
        success: true,
        fromFiscalYear: fromFY,
        toFiscalYear: toFY,
        totalCostImpact,
        totalEntries: entriesToCreate.length,
      };
    }),

  listProjectRevisions: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      limit: z.number().min(1).max(100).default(20),
    }))
    .query(async ({ input }) => {
      const logs = await db.marketRateRevisionLog.findMany({
        where: { projectId: input.projectId },
        include: {
          loggedBy: {
            select: { id: true, name: true, email: true },
          },
          entries: {
            take: 20,
          },
        },
        orderBy: { loggedAt: "desc" },
        take: input.limit,
      });

      return { logs };
    }),

  rollForwardCatalog: protectedProcedure
    .input(z.object({
      sourceCatalogId: z.string(),
      targetFiscalYear: z.string(),
      inflationMultiplier: z.number().min(0.5).max(3.0).default(1.0),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!isOrgAdmin(ctx.user)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only SuperAdmins can roll forward baseline rate catalogs." });
      }

      const sourceCatalog = await db.rateCatalog.findUnique({
        where: { id: input.sourceCatalogId },
        include: {
          items: {
            include: { rates: true },
          },
        },
      });

      if (!sourceCatalog) throw new TRPCError({ code: "NOT_FOUND", message: "Source catalog not found." });

      const newCatalogName = `District Rates ${input.targetFiscalYear}`;

      await db.$transaction(async (tx) => {
        // Create new catalog
        const newCatalog = await tx.rateCatalog.create({
          data: {
            name: newCatalogName,
            fiscalYear: input.targetFiscalYear,
            scope: "global",
            districts: sourceCatalog.districts,
            isActive: true,
            isBaseline: true,
          },
        });

        // Copy items and inflate rates
        for (const item of sourceCatalog.items) {
          const newItem = await tx.rateCatalogItem.create({
            data: {
              catalogId: newCatalog.id,
              code: item.code,
              materialName: item.materialName,
              unit: item.unit,
              globalMaterialId: item.globalMaterialId,
              materialCatalogId: item.materialCatalogId,
              sortOrder: item.sortOrder,
            },
          });

          for (const r of item.rates) {
            const newRateVal = Math.round(r.rate * input.inflationMultiplier);
            await tx.rateCatalogItemRate.create({
              data: {
                itemId: newItem.id,
                district: r.district,
                rate: newRateVal,
              },
            });

            // Write audit trail
            if (item.globalMaterialId) {
              await tx.rateFiscalYearAudit.create({
                data: {
                  globalMaterialId: item.globalMaterialId,
                  district: r.district,
                  fromFiscalYear: sourceCatalog.fiscalYear,
                  toFiscalYear: input.targetFiscalYear,
                  fromRate: r.rate,
                  toRate: newRateVal,
                  changePct: ((newRateVal - r.rate) / r.rate) * 100,
                },
              });
            }
          }
        }
      });

      return { success: true, targetFiscalYear: input.targetFiscalYear };
    }),
});
