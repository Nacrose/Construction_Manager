/**
 * tRPC router for analysis libraries.
 * Replaces: projects/[id]/analysis-libraries/*
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "@/server/trpc";
import { db } from "@/lib/db";
import { assertProjectMember, assertCanWrite } from "@/lib/authz";
import { recalcAnalysis } from "@/server/utils/boq-calc";
import { audit } from "@/lib/audit";
import { withOrgContext } from "@/lib/rls";

export const analysisLibraryRouter = router({
  /** List all analysis libraries for the project (auto-ensures standard 3 libraries exist). */
  list: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);

      let libraries = await db.analysisLibrary.findMany({
        where: { projectId: input.projectId },
        include: { _count: { select: { analyses: true } } },
        orderBy: { createdAt: "asc" },
      });

      // Ensure the 3 standard libraries exist idempotently
      if (libraries.length < 3) {
        const standard = [
          { name: "Client's Estimate", purpose: "client_estimate" as const, isDefault: true },
          { name: "Contractor Bid", purpose: "contractor_bid" as const, isDefault: false },
          { name: "Contractor's Actual", purpose: "contractor_actual" as const, isDefault: false },
        ];

        const boqItems = await db.boqItem.findMany({
          where: { projectId: input.projectId },
          select: { id: true },
        });

        for (const std of standard) {
          const exists = libraries.some((l) => l.purpose === std.purpose);
          if (!exists) {
            await db.$transaction(async (tx) => {
              await withOrgContext(tx, ctx.user.organizationId, !!ctx.user.isSuperAdmin); // RLS: phase-3a/b/c tables are FORCE-scoped
              const created = await tx.analysisLibrary.upsert({
                where: {
                  projectId_purpose: {
                    projectId: input.projectId,
                    purpose: std.purpose,
                  },
                },
                update: {},
                create: {
                  projectId: input.projectId,
                  name: std.name,
                  purpose: std.purpose,
                  isDefault: std.isDefault,
                },
              });

              for (const item of boqItems) {
                const raExists = await tx.rateAnalysis.findFirst({
                  where: { boqItemId: item.id, libraryId: created.id },
                });
                if (!raExists) {
                  await tx.rateAnalysis.create({
                    data: {
                      boqItemId: item.id,
                      libraryId: created.id,
                      name: std.name,
                      batchSize: 1,
                      isDefault: std.isDefault,
                    },
                  });
                }
              }
            });
          }
        }

        libraries = await db.analysisLibrary.findMany({
          where: { projectId: input.projectId },
          include: { _count: { select: { analyses: true } } },
          orderBy: { createdAt: "asc" },
        });
      }

      // Include the project's explicit default-library FK so the UI can
      // highlight which library is currently selected as default.
      const project = await db.project.findUnique({
        where: { id: input.projectId },
        select: { costLibraryId: true },
      });

      return { libraries, defaultLibraryId: project?.costLibraryId ?? null };
    }),

  /** Create an analysis library + auto-create empty analyses for ALL BOQ items. */
  updateSettings: protectedProcedure
    .input(z.object({
      libraryId: z.string(),
      districtRateCatalogId: z.string().nullable().optional(),
      selectedFiscalYear: z.string().nullable().optional(),
      selectedDistrict: z.string().nullable().optional(),
      orgRateCatalogId: z.string().nullable().optional(),
      projectRateCatalogId: z.string().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { libraryId, ...data } = input;
      const lib = await db.analysisLibrary.findUnique({ where: { id: libraryId }, select: { projectId: true } });
      if (!lib) throw new TRPCError({ code: "NOT_FOUND", message: "Library not found." });
      await assertCanWrite(ctx.user, lib.projectId);

      const updated = await db.analysisLibrary.update({
        where: { id: libraryId },
        data,
      });

      return { library: updated };
    }),

  create: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      name: z.string().min(1).max(100),
      purpose: z.enum(["client_estimate", "contractor_bid", "contractor_actual"]).default("client_estimate"),
      isDefault: z.boolean().default(false),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertCanWrite(ctx.user, input.projectId);

      // Pre-fetch BOQ items so we can create analyses inside the transaction
      const boqItems = await db.boqItem.findMany({
        where: { projectId: input.projectId },
        select: { id: true },
      });

      const library = await db.$transaction(async (tx) => {
        await withOrgContext(tx, ctx.user.organizationId, !!ctx.user.isSuperAdmin); // RLS: phase-3a/b/c tables are FORCE-scoped
        // If setting as default, unset other defaults
        if (input.isDefault) {
          await tx.analysisLibrary.updateMany({
            where: { projectId: input.projectId, isDefault: true },
            data: { isDefault: false },
          });
        }

        // Upsert library by (projectId, purpose) to guarantee no duplicates
        const created = await tx.analysisLibrary.upsert({
          where: {
            projectId_purpose: {
              projectId: input.projectId,
              purpose: input.purpose,
            },
          },
          update: {
            name: input.name,
            isDefault: input.isDefault,
          },
          create: {
            projectId: input.projectId,
            name: input.name,
            purpose: input.purpose,
            isDefault: input.isDefault,
          },
        });

        // Auto-create analyses for all BOQ items
        for (const item of boqItems) {
          const raExists = await tx.rateAnalysis.findFirst({
            where: { boqItemId: item.id, libraryId: created.id },
          });
          if (!raExists) {
            await tx.rateAnalysis.create({
              data: {
                boqItemId: item.id,
                libraryId: created.id,
                name: input.name,
                batchSize: 1,
                isDefault: input.isDefault,
              },
            });
          }
        }

        // If isDefault, also set Project.costLibraryId inside the transaction
        if (input.isDefault) {
          await tx.project.update({
            where: { id: input.projectId },
            data: { costLibraryId: created.id },
          });
        }

        return created;
      });

      return { library, analysesCreated: boqItems.length };
    }),

  /**
   * Set a library as the project's default.
   *
   * Updates BOTH:
   *   - `AnalysisLibrary.isDefault` flags (true for this library, false for
   *     all others on the project)
   *   - `Project.costLibraryId` FK - the single source of truth read by
   *     `getDefaultLibrary()` in lib/default-library.ts to decide which
   *     library to pull ingredient data from (resource requirements,
   *     look-ahead, Gantt overlay, daily program, etc.)
   */
  setDefault: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      libraryId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertCanWrite(ctx.user, input.projectId);

      // Verify the library belongs to this project
      const library = await db.analysisLibrary.findUnique({
        where: { id: input.libraryId },
        select: { id: true, projectId: true, name: true },
      });
      if (!library || library.projectId !== input.projectId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Library not found in this project.",
        });
      }

      await db.$transaction(async (tx) => {
        await withOrgContext(tx, ctx.user.organizationId, !!ctx.user.isSuperAdmin); // RLS: phase-3a/b/c tables are FORCE-scoped
        // 1. Clear isDefault on all sibling libraries
        await tx.analysisLibrary.updateMany({
          where: { projectId: input.projectId, isDefault: true },
          data: { isDefault: false },
        });

        // 2. Set isDefault on the chosen library
        await tx.analysisLibrary.update({
          where: { id: input.libraryId },
          data: { isDefault: true },
        });

        // 3. Update RateAnalysis isDefault flags across the project
        await tx.rateAnalysis.updateMany({
          where: { boqItem: { projectId: input.projectId } },
          data: { isDefault: false },
        });

        await tx.rateAnalysis.updateMany({
          where: { libraryId: input.libraryId },
          data: { isDefault: true },
        });

        // 4. Update Project.costLibraryId
        await tx.project.update({
          where: { id: input.projectId },
          data: { costLibraryId: input.libraryId },
        });
      });

      // 5. Recalculate and push rates from this library to all project BOQ items
      const analyses = await db.rateAnalysis.findMany({
        where: { libraryId: input.libraryId },
        select: { id: true, boqItemId: true },
      });

      for (const ra of analyses) {
        await recalcAnalysis(ra.id, ra.boqItemId);
      }

      await audit({
        userId: ctx.user.id,
        projectId: input.projectId,
        action: "analysis_library.set_default",
        entityType: "analysis_library",
        entityId: input.libraryId,
        metadata: { name: library.name, itemsRecalculated: analyses.length },
      });

      return { ok: true, defaultLibraryId: input.libraryId, itemsRecalculated: analyses.length };
    }),

  /** Get all BOQ items with their analysis (or empty) for this library. */
  getItems: protectedProcedure
    .input(z.object({ projectId: z.string(), libraryId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);

      // Get library info scoped to authorized project
      const library = await db.analysisLibrary.findFirst({
        where: { id: input.libraryId, projectId: input.projectId },
        select: { name: true, purpose: true },
      });
      if (!library) throw new TRPCError({ code: "NOT_FOUND", message: "Library not found in this project." });

      // Get all BOQ items
      const boqItems = await db.boqItem.findMany({
        where: { projectId: input.projectId },
        orderBy: { sortOrder: "asc" },
        select: {
          id: true, code: true, description: true, unit: true,
          quantity: true, rate: true, amount: true, section: true, sortOrder: true,
        },
      });

      // Get all analyses for this library
      const analyses = await db.rateAnalysis.findMany({
        where: { libraryId: input.libraryId },
        include: {
          ingredients: { orderBy: { sortOrder: "asc" } },
        },
      });

      // Auto-create missing analyses for BOQ items that don't have one
      const existingBoqItemIds = new Set(analyses.map((a) => a.boqItemId));
      const missingItems = boqItems.filter((item) => !existingBoqItemIds.has(item.id));
      if (missingItems.length > 0) {
        const created = await db.$transaction(
          missingItems.map((item) =>
            db.rateAnalysis.create({
              data: {
                boqItemId: item.id,
                libraryId: input.libraryId,
                name: library.name,
                batchSize: 1,
                isDefault: false,
              },
            })
          )
        );
        // Include the newly created analyses (no ingredients yet)
        for (const ra of created) {
          analyses.push({ ...ra, ingredients: [] });
        }
      }

      // Build a lookup: boqItemId -> analysis
      const analysisMap = new Map<string, typeof analyses[0]>();
      analyses.forEach((a) => analysisMap.set(a.boqItemId, a));

      // Combine: for each BOQ item, attach its analysis (or null)
      const items = boqItems.map((item) => {
        const analysis = analysisMap.get(item.id);
        return {
          ...item,
          analysisId: analysis?.id ?? null,
          analysisName: analysis?.name ?? null,
          batchSize: analysis?.batchSize ?? 1,
          ingredients: analysis?.ingredients ?? [],
          ingredientCount: analysis?.ingredients.length ?? 0,
          totalAmount: analysis?.ingredients.reduce((s, i) => s + i.amount, 0) ?? 0,
          ratePerUnit: analysis && analysis.batchSize > 0
            ? analysis.ingredients.reduce((s, i) => s + i.amount, 0) / analysis.batchSize
            : 0,
        };
      });

      return { items, library: { id: input.libraryId } };
    }),
});
