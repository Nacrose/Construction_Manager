import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { getFreshDb } from "@/lib/db";
import { assertCanWrite, assertProjectMember } from "@/lib/authz";
import { TRPCError } from "@trpc/server";

export const variationOrderRouter = router({
  /** List all Variation Orders for a project */
  list: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);
      const db = getFreshDb();
      return db.variationOrder.findMany({
        where: { projectId: input.projectId },
        orderBy: { createdAt: "desc" },
        include: { _count: { select: { items: true } } },
      });
    }),

  /** Get a single Variation Order by ID */
  get: protectedProcedure
    .input(z.object({ id: z.string(), projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);
      const db = getFreshDb();
      // IDOR guard: verify the VO belongs to the project the caller
      // was authorized on. Previously this fetched by id only.
      const vo = await db.variationOrder.findFirst({
        where: { id: input.id, projectId: input.projectId },
        include: {
          items: {
            include: { boqItem: true },
            orderBy: { boqCode: "asc" },
          },
        },
      });
      if (!vo) throw new TRPCError({ code: "NOT_FOUND" });
      return vo;
    }),

  /** Create a new Draft Variation Order */
  create: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        number: z.string().min(1),
        title: z.string().min(1),
        description: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertCanWrite(ctx.user, input.projectId);
      const db = getFreshDb();

      // Check for unique VO number
      const existing = await db.variationOrder.findUnique({
        where: { projectId_number: { projectId: input.projectId, number: input.number } },
      });
      if (existing) {
        throw new TRPCError({ code: "CONFLICT", message: "Variation Order number must be unique." });
      }

      return db.variationOrder.create({
        data: {
          projectId: input.projectId,
          number: input.number,
          title: input.title,
          description: input.description,
          status: "draft",
        },
      });
    }),

  /** Update a Variation Order and its items */
  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        projectId: z.string(),
        title: z.string().min(1),
        description: z.string().optional(),
        items: z.array(
          z.object({
            id: z.string().optional(), // if undefined, it's a new item being added
            boqItemId: z.string().nullable().optional(), // null for completely new extra items
            boqCode: z.string(),
            boqDesc: z.string(),
            unit: z.string(),
            previousQty: z.number().default(0),
            newQty: z.number().default(0),
            previousRate: z.number().default(0),
            newRate: z.number().default(0),
          })
        ),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertCanWrite(ctx.user, input.projectId);
      const db = getFreshDb();

      const vo = await db.variationOrder.findFirst({
        where: { id: input.id, projectId: input.projectId },
      });
      if (!vo || vo.status === "approved") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot update an approved Variation Order." });
      }

      // We'll update the VO details, delete old items, and insert new items.
      await db.$transaction(async (tx) => {
        await tx.variationOrder.update({
          where: { id: input.id },
          data: {
            title: input.title,
            description: input.description,
          },
        });

        // Delete existing items
        await tx.variationOrderItem.deleteMany({
          where: { variationOrderId: input.id },
        });

        // Insert new items
        if (input.items.length > 0) {
          await tx.variationOrderItem.createMany({
            data: input.items.map((item) => ({
              variationOrderId: input.id,
              boqItemId: item.boqItemId || null,
              boqCode: item.boqCode,
              boqDesc: item.boqDesc,
              unit: item.unit,
              previousQty: item.previousQty,
              newQty: item.newQty,
              previousRate: item.previousRate,
              newRate: item.newRate,
            })),
          });
        }
      });

      return { success: true };
    }),

  /** Change status (specifically for approval to merge changes into BOQ) */
  updateStatus: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        projectId: z.string(),
        status: z.enum(["draft", "submitted", "approved", "rejected"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertCanWrite(ctx.user, input.projectId);
      const db = getFreshDb();

      const vo = await db.variationOrder.findFirst({
        where: { id: input.id, projectId: input.projectId },
        include: { items: true },
      });

      if (!vo) throw new TRPCError({ code: "NOT_FOUND" });
      if (vo.status === "approved") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Variation Order is already approved and locked." });
      }

      await db.$transaction(async (tx) => {
        const updateData: any = { status: input.status };

        if (input.status === "approved") {
          updateData.dateApproved = new Date();

          // Pre-fetch libraries and sortOrder for any new extra items
          const libraries = await tx.analysisLibrary.findMany({
            where: { projectId: input.projectId },
          });
          const maxSortResult = await tx.boqItem.aggregate({
            where: { projectId: input.projectId },
            _max: { sortOrder: true },
          });
          let currentSortOrder = (maxSortResult._max.sortOrder ?? -1) + 1;

          // Merge VO items into BOQ
          for (const item of vo.items) {
            if (item.boqItemId) {
              const existingBoq = await tx.boqItem.findUnique({ where: { id: item.boqItemId } });
              if (existingBoq) {
                const baseQty = existingBoq.baselineQty ?? existingBoq.quantity;
                const baseRate = existingBoq.baselineRate ?? existingBoq.rate;
                await tx.boqItem.update({
                  where: { id: item.boqItemId },
                  data: {
                    baselineQty: baseQty,
                    baselineRate: baseRate,
                    quantity: item.newQty,
                    rate: item.newRate,
                    amount: item.newQty * item.newRate,
                  },
                });
              }
            } else {
              const createdBoq = await tx.boqItem.create({
                data: {
                  projectId: input.projectId,
                  code: item.boqCode,
                  description: item.boqDesc,
                  unit: item.unit,
                  quantity: item.newQty,
                  rate: item.newRate,
                  amount: item.newQty * item.newRate,
                  baselineQty: 0,
                  baselineRate: 0,
                  tags: JSON.stringify(["extra_item", vo.number]),
                  sortOrder: currentSortOrder++,
                },
              });

              // Auto-create analysis records for all libraries
              for (const lib of libraries) {
                await tx.rateAnalysis.create({
                  data: {
                    boqItemId: createdBoq.id,
                    libraryId: lib.id,
                    name: lib.name,
                    batchSize: 1,
                    isDefault: lib.isDefault,
                  },
                });
              }
            }
          }

          // Create a BOQ version snapshot after merging
          const lastVersion = await tx.boqVersion.aggregate({
            where: { projectId: input.projectId },
            _max: { versionNumber: true },
          });
          const versionNumber = (lastVersion._max.versionNumber ?? 0) + 1;

          const boqItems = await tx.boqItem.findMany({
            where: { projectId: input.projectId },
            orderBy: { sortOrder: "asc" },
            select: { id: true, code: true, description: true, unit: true, quantity: true, rate: true, amount: true },
          });

          await tx.boqVersion.create({
            data: {
              projectId: input.projectId,
              versionNumber,
              variationOrderId: input.id,
              notes: `VO ${vo.number}: ${vo.title}`,
              status: "approved",
              items: {
                create: boqItems.map((bi) => ({
                  boqItemId: bi.id,
                  code: bi.code,
                  description: bi.description,
                  unit: bi.unit,
                  quantity: bi.quantity,
                  rate: bi.rate,
                  amount: bi.amount,
                })),
              },
            },
          });
        }

        await tx.variationOrder.update({
          where: { id: input.id },
          data: updateData,
        });
      });

      return { success: true };
    }),
});
