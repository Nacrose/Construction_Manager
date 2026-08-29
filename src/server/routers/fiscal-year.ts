import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "@/server/trpc";
import { db } from "@/lib/db";
import { withOrgContext } from "@/lib/rls";
import { assertProjectMember, assertCanWrite } from "@/lib/authz";

export const fiscalYearRouter = router({
  previewFiscalYearSwitch: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        targetFiscalYear: z.string(),
        district: z.string().optional().default("Morang"),
      })
    )
    .query(async ({ ctx, input }) => {
      // IDOR guard: caller must be a member of the project to preview
      // its fiscal-year switch (which exposes material rates, BOQ items,
      // and ingredient details).
      await assertProjectMember(ctx.user, input.projectId);
      const project = await db.project.findUnique({
        where: { id: input.projectId },
        include: {
          materials: {
            include: {
              catalogMaterial: true,
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
      const targetCatalog = await db.rateBook.findFirst({
        where: {
          fiscalYear: targetFY,
          OR: [
            { scope: "global" },
            ...(project.organizationId ? [{ organizationId: project.organizationId }] : []),
          ],
        },
        include: {
          catalogRates: {
            where: { district: input.district },
            include: { material: true },
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

      // Map target rates by materialId / normalized material name
      const targetRateMap = new Map<string, number>();
      for (const rateEntry of targetCatalog.catalogRates) {
        targetRateMap.set(rateEntry.materialId, rateEntry.rate);
        if (rateEntry.material) {
          targetRateMap.set(rateEntry.material.normalizedName, rateEntry.rate);
          targetRateMap.set(rateEntry.material.name.toLowerCase().trim(), rateEntry.rate);
        }
      }

      // Compute remaining estimated quantities from BOQ ingredients
      const qtyMap = new Map<string, number>();
      for (const boqItem of project.boqItems) {
        for (const ing of boqItem.ingredients) {
          if (ing.type === "material" && ing.name) {
            const key = ing.catalogMaterialId || ing.name.toLowerCase().trim();
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
        const key = mat.catalogMaterialId || mat.name.toLowerCase().trim();
        const oldRate = mat.catalogMaterial?.defaultRate || 0;
        const newRate = targetRateMap.get(key) || (mat.catalogMaterialId ? targetRateMap.get(mat.catalogMaterialId) : undefined) || oldRate;
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
    .input(
      z.object({
        projectId: z.string(),
        targetFiscalYear: z.string(),
        district: z.string().optional().default("Morang"),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // IDOR guard: executing a fiscal-year switch is a write operation
      // that updates material rates, BOQ item rates, and creates audit
      // log entries. Caller must have write access to the project.
      await assertCanWrite(ctx.user, input.projectId);
      const project = await db.project.findUnique({
        where: { id: input.projectId },
        include: {
          materials: {
            include: {
              catalogMaterial: true,
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

      const targetCatalog = await db.rateBook.findFirst({
        where: {
          fiscalYear: toFY,
          OR: [
            { scope: "global" },
            ...(project.organizationId ? [{ organizationId: project.organizationId }] : []),
          ],
        },
        include: {
          catalogRates: {
            where: { district: input.district },
            include: { material: true },
          },
        },
      });

      if (!targetCatalog) {
        throw new TRPCError({ code: "NOT_FOUND", message: `No rate catalog found for FY ${toFY}.` });
      }

      const targetRateMap = new Map<string, number>();
      for (const rateEntry of targetCatalog.catalogRates) {
        targetRateMap.set(rateEntry.materialId, rateEntry.rate);
        if (rateEntry.material) {
          targetRateMap.set(rateEntry.material.normalizedName, rateEntry.rate);
          targetRateMap.set(rateEntry.material.name.toLowerCase().trim(), rateEntry.rate);
        }
      }

      const qtyMap = new Map<string, number>();
      for (const boqItem of project.boqItems) {
        for (const ing of boqItem.ingredients) {
          if (ing.type === "material" && ing.name) {
            const key = ing.catalogMaterialId || ing.name.toLowerCase().trim();
            const currentQty = qtyMap.get(key) || 0;
            qtyMap.set(key, currentQty + (ing.quantity * (boqItem.quantity || 1)));
          }
        }
      }

      let totalCostImpact = 0;
      const entriesToCreate: any[] = [];

      for (const mat of project.materials) {
        const key = mat.catalogMaterialId || mat.name.toLowerCase().trim();
        const oldRate = mat.catalogMaterial?.defaultRate || 0;
        const newRate = targetRateMap.get(key) || (mat.catalogMaterialId ? targetRateMap.get(mat.catalogMaterialId) : undefined) || oldRate;
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
        await withOrgContext(tx, ctx.user.organizationId, !!ctx.user.isSuperAdmin);
        await tx.marketRateRevisionLog.create({
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
    .input(
      z.object({
        projectId: z.string(),
        limit: z.number().min(1).max(100).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      // IDOR guard: caller must be a project member to read its
      // market-rate revision logs (which contain user emails and rate
      // change history).
      await assertProjectMember(ctx.user, input.projectId);
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
    .input(
      z.object({
        sourceCatalogId: z.string(),
        targetFiscalYear: z.string(),
        inflationMultiplier: z.number().min(0.5).max(3.0).default(1.0),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user.isSuperAdmin) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only SuperAdmins can roll forward baseline rate catalogs." });
      }

      const sourceCatalog = await db.rateBook.findUnique({
        where: { id: input.sourceCatalogId },
        include: {
          catalogRates: true,
        },
      });

      if (!sourceCatalog) throw new TRPCError({ code: "NOT_FOUND", message: "Source catalog not found." });

      const newCatalogName = `District Rates ${input.targetFiscalYear}`;

      await db.$transaction(async (tx) => {
        await withOrgContext(tx, ctx.user.organizationId, !!ctx.user.isSuperAdmin);
        // Create new catalog
        const newCatalog = await tx.rateBook.create({
          data: {
            name: newCatalogName,
            fiscalYear: input.targetFiscalYear,
            scope: "global",
            districts: sourceCatalog.districts,
            isActive: true,
            isBaseline: true,
            sourceCatalogId: sourceCatalog.id,
          },
        });

        // Copy rates with multiplier
        if (sourceCatalog.catalogRates.length > 0) {
          await tx.rateEntry.createMany({
            data: sourceCatalog.catalogRates.map((r) => ({
              materialId: r.materialId,
              rateCatalogId: newCatalog.id,
              district: r.district,
              rate: Math.round(r.rate * input.inflationMultiplier * 100) / 100,
              sourceRateEntryId: r.id,
            })),
          });
        }
      });

      return { success: true, targetFiscalYear: input.targetFiscalYear };
    }),
});
