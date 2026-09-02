import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { getFreshDb } from "@/lib/db";
import { assertCanWrite, assertProjectMember } from "@/lib/authz";
import { assertNotLocked } from "@/lib/fiscal-year-lock";
import { TRPCError } from "@trpc/server";
import { audit } from "@/lib/audit";
import { withOrgContext } from "@/lib/rls";
import { transitionEntityState } from "@/server/utils/state-machine";
import { emitDomainEvent } from "@/server/utils/domain-events";


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
         take: 1000, // bounded (pagination sweep) — see src/lib/pagination.ts
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
        await withOrgContext(tx, ctx.user.organizationId, !!ctx.user.isSuperAdmin); // RLS: phase-3a/b/c tables are FORCE-scoped
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
      // VO approval generates a journal entry — check fiscal lock for the JE date.
      if (input.status === "approved") {
        await assertNotLocked(ctx.user.organizationId);
      }
      const db = getFreshDb();

      const vo = await db.variationOrder.findFirst({
        where: { id: input.id, projectId: input.projectId },
        include: { items: true },
      });

      if (!vo) throw new TRPCError({ code: "NOT_FOUND" });

      await db.$transaction(async (tx) => {
        await withOrgContext(tx, ctx.user.organizationId, !!ctx.user.isSuperAdmin); // RLS: phase-3a/b/c tables are FORCE-scoped

        // Engine transition replaces the hand-rolled canTransition + update
        // pair: graph validation + CAS-claim happen at the write point, so
        // an invalid edge (e.g. re-approval of an approved VO) or a
        // concurrent status flip aborts the whole transaction — the BOQ
        // merge below can never commit for a stale read. dateApproved
        // rides additionalData — the engine strips reserved keys.
        await transitionEntityState(tx, {
          model: "variationOrder",
          id: input.id,
          targetState: input.status,
          userId: ctx.user.id,
          userName: ctx.user.name,
          projectId: input.projectId,
          additionalData: input.status === "approved" ? { dateApproved: new Date() } : undefined,
        });

        if (input.status === "approved") {
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

        // VO APPROVAL — NO REVENUE JOURNAL ENTRY (intentionally).
        //
        // A VO approval is a CONTRACT-VALUE event, not a revenue event:
        // this mutation copies the VO items into an approved BoqVersion,
        // and subsequent IPCs bill those BOQ quantities — at which point
        // ipcBillingEntry recognizes the revenue (Dr 1100 / Cr 4001).
        //
        // The previous code ALSO posted "Dr Client Receivables / Cr
        // Contract Revenue" here at approval time, which double-counted
        // every VO with IPC billing (two Cr 4001 postings for the same
        // quantities), inflated Client Receivables by the VO delta, and
        // had no idempotency guard (re-approval = duplicate JE).
        // Removing this entry fixes all three issues; the audit metadata
        // after the transaction still records the value change.
      }); // end of $transaction

      // Audit log (was missing entirely)
      // Recompute itemsWithoutBaseline for the audit metadata — it was
      // computed inside the transaction but we need it here too.
      const itemsWithoutBaselineAudit: string[] = [];
      let totalValueChangeAudit = 0;
      if (input.status === "approved") {
        for (const item of vo.items) {
          if (item.boqItemId) {
            const existing = await db.boqItem.findUnique({
              where: { id: item.boqItemId },
              select: { baselineQty: true, baselineRate: true, code: true, quantity: true, rate: true },
            });
            if (!existing || existing.baselineQty == null || existing.baselineRate == null) {
              itemsWithoutBaselineAudit.push(existing?.code || item.boqItemId);
              const estOldQty = existing?.quantity ?? item.newQty;
              const estOldRate = existing?.rate ?? item.newRate;
              totalValueChangeAudit += (item.newQty * item.newRate) - (estOldQty * estOldRate);
            } else {
              totalValueChangeAudit += (item.newQty * item.newRate) - (existing.baselineQty * existing.baselineRate);
            }
          } else {
            totalValueChangeAudit += item.newQty * item.newRate;
          }
        }
      }
      await audit({
        userId: ctx.user.id,
        projectId: input.projectId,
        action: `variation_order.${input.status}`,
        entityType: "variation_order",
        entityId: input.id,
        metadata: {
          number: vo.number,
          status: input.status,
          totalValueChange: totalValueChangeAudit,
          itemsWithoutBaseline: itemsWithoutBaselineAudit.length > 0 ? itemsWithoutBaselineAudit : undefined,
        },
      });

      emitDomainEvent({
        type: "lifecycle.transitioned",
        projectId: input.projectId,
        actorUserId: ctx.user.id,
        title: `Variation Order ${input.status === "approved" ? "Approved" : input.status === "rejected" ? "Rejected" : "Updated"} (${vo.number})`,
        message: `Variation Order ${vo.number} marked as ${input.status} by ${ctx.user.name || "User"}.`,
        entityType: "variationOrder",
        entityId: input.id,
        metadata: { model: "variationOrder", from: vo.status, to: input.status },
      });

      return { success: true };
    }),
});

