/**
 * tRPC router for BOQ items.
 * Replaces: projects/[id]/boq/route.ts, boq/[itemId]/route.ts, projects/[id]/boq/reorder/route.ts
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "@/server/trpc";
import { db } from "@/lib/db";
import { assertProjectMember, assertCanWrite } from "@/lib/authz";
import { audit } from "@/lib/audit";
import { recalcItemRate } from "@/server/utils/boq-calc";

// ─── Zod schemas ───────────────────────────────────────────────

const CreateBoqSchema = z.object({
  projectId: z.string(),
  code: z.string().min(1).max(50),
  description: z.string().min(1).max(500),
  unit: z.string().min(1).max(20),
  quantity: z.number().min(0).default(0),
  rate: z.number().min(0).default(0),
  category: z.string().optional(),
  section: z.string().optional(),
  tags: z.array(z.string()).optional(),
  sortOrder: z.number().optional(),
});

const UpdateBoqSchema = z.object({
  itemId: z.string(),
  code: z.string().min(1).max(50).optional(),
  description: z.string().min(1).max(500).optional(),
  unit: z.string().min(1).max(20).optional(),
  quantity: z.number().min(0).optional(),
  rate: z.number().min(0).optional(),
  category: z.string().nullable().optional(),
  section: z.string().nullable().optional(),
  tags: z.array(z.string()).nullable().optional(),
  sortOrder: z.number().optional(),
});

const ReorderSchema = z.object({
  projectId: z.string(),
  items: z.array(z.object({ id: z.string().min(1), sortOrder: z.number().int() })).min(1).max(500),
});

const LockBoqItemSchema = z.object({
  itemId: z.string(),
  locked: z.boolean(),
});

// ─── Router ────────────────────────────────────────────────────

export const boqRouter = router({
  /** List all BOQ items for a project, with ingredients. */
  list: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);

      const items = await db.boqItem.findMany({
        where: { projectId: input.projectId },
        orderBy: { sortOrder: "asc" },
        include: { ingredients: { orderBy: { type: "asc" } } },
      });

      // Aggregate executed quantities from linked daily program tasks
      const taskActuals = await db.dailyProgramTask.groupBy({
        by: ["boqItemId"],
        where: {
          boqItemId: { in: items.map((i) => i.id) },
          actualQty: { gt: 0 },
        },
        _sum: {
          actualQty: true,
        },
      });

      const actualMap = new Map<string, number>();
      for (const t of taskActuals) {
        if (t.boqItemId) {
          actualMap.set(t.boqItemId, t._sum.actualQty ?? 0);
        }
      }

      const itemsWithExecution = items.map((item) => {
        const executedQty = actualMap.get(item.id) ?? 0;
        const executedPct = item.quantity > 0 ? Math.min(100, Math.round((executedQty / item.quantity) * 100)) : 0;
        return {
          ...item,
          executedQty,
          executedPct,
        };
      });

      return { items: itemsWithExecution };
    }),

  /** Create a new BOQ item. */
  create: protectedProcedure
    .input(CreateBoqSchema)
    .mutation(async ({ ctx, input }) => {
      const role = await assertProjectMember(ctx.user, input.projectId);
      if (role === "client" || role === "inspector") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Your role on this project is read-only." });
      }

      // Check if BOQ is locked
      const project = await db.project.findUnique({ where: { id: input.projectId }, select: { boqLocked: true } });
      if (project?.boqLocked) {
        throw new TRPCError({ code: "FORBIDDEN", message: "BOQ is locked." });
      }

      // Check for duplicate code
      const dup = await db.boqItem.findUnique({
        where: { projectId_code: { projectId: input.projectId, code: input.code } },
        select: { id: true },
      });
      if (dup) {
        throw new TRPCError({ code: "CONFLICT", message: `BOQ code ${input.code} already exists.` });
      }

      // Determine sortOrder if not provided
      let sortOrder = input.sortOrder;
      if (sortOrder === undefined) {
        const max = await db.boqItem.aggregate({
          where: { projectId: input.projectId },
          _max: { sortOrder: true },
        });
        sortOrder = (max._max.sortOrder ?? -1) + 1;
      }

      // Pre-fetch libraries so we can create analyses inside the transaction
      const libraries = await db.analysisLibrary.findMany({ where: { projectId: input.projectId } });

      // Create the BOQ item + auto-create analysis records for each library
      // in a single transaction so we don't end up with an orphan BOQ item
      // if analysis creation fails midway.
      const item = await db.$transaction(async (tx) => {
        const created = await tx.boqItem.create({
          data: {
            projectId: input.projectId,
            code: input.code,
            description: input.description,
            unit: input.unit,
            quantity: input.quantity,
            rate: input.rate,
            amount: input.quantity * input.rate,
            category: input.category,
            section: input.section,
            tags: input.tags ? JSON.stringify(input.tags) : null,
            sortOrder,
          },
          include: { ingredients: true },
        });

        // Auto-create analysis records for all libraries
        for (const lib of libraries) {
          await tx.rateAnalysis.create({
            data: {
              boqItemId: created.id,
              libraryId: lib.id,
              name: lib.name,
              batchSize: 1,
              isDefault: lib.isDefault,
            },
          });
        }

        return created;
      });

      await audit({
        userId: ctx.user.id,
        projectId: input.projectId,
        action: "boq.create",
        entityType: "boq_item",
        entityId: item.id,
        metadata: { code: item.code },
      });

      return { item };
    }),

  /** Update a BOQ item (inline edit). */
  update: protectedProcedure
    .input(UpdateBoqSchema)
    .mutation(async ({ ctx, input }) => {
      const { itemId, ...data } = input;

      const item = await db.boqItem.findUnique({
        where: { id: itemId },
        select: { id: true, projectId: true, code: true, quantity: true, locked: true },
      });
      if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "BOQ item not found." });

      const role = await assertProjectMember(ctx.user, item.projectId);
      if (role === "client" || role === "inspector") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Your role on this project is read-only." });
      }

      // Check if BOQ is locked
      const project = await db.project.findUnique({ where: { id: item.projectId }, select: { boqLocked: true } });
      if (project?.boqLocked) {
        throw new TRPCError({ code: "FORBIDDEN", message: "BOQ is locked." });
      }

      // Check if item is individually locked
      if (item.locked) {
        throw new TRPCError({ code: "FORBIDDEN", message: "This BOQ item is locked." });
      }

      // Check for duplicate code if code is changing
      if (data.code && data.code !== item.code) {
        const dup = await db.boqItem.findUnique({
          where: { projectId_code: { projectId: item.projectId, code: data.code } },
          select: { id: true },
        });
        if (dup && dup.id !== itemId) {
          throw new TRPCError({
            code: "CONFLICT",
            message: `BOQ code "${data.code}" is already in use by another item in this project.`,
          });
        }
      }

      // Recompute amount from final quantity + rate
      const quantity = data.quantity ?? item.quantity;
      let rate = data.rate;
      if (rate === undefined) {
        const full = await db.boqItem.findUnique({ where: { id: itemId }, select: { rate: true } });
        rate = full?.rate ?? 0;
      }

      let updated = await db.boqItem.update({
        where: { id: itemId },
        data: {
          ...(data.code !== undefined && { code: data.code }),
          ...(data.description !== undefined && { description: data.description }),
          ...(data.unit !== undefined && { unit: data.unit }),
          ...(data.quantity !== undefined && { quantity: data.quantity }),
          ...(data.rate !== undefined && { rate: data.rate }),
          ...(data.category !== undefined && { category: data.category }),
          ...(data.section !== undefined && { section: data.section }),
          ...(data.tags !== undefined && { tags: data.tags === null ? null : JSON.stringify(data.tags) }),
          ...(data.sortOrder !== undefined && { sortOrder: data.sortOrder }),
          amount: quantity * (rate ?? 0),
        },
        include: { ingredients: true },
      });

      // If quantity changed on an item with direct legacy ingredients (and rate wasn't explicitly overridden),
      // recalibrate rate = total / new_quantity
      if (data.quantity !== undefined && data.quantity !== item.quantity && data.rate === undefined) {
        const directIngs = await db.boqIngredient.count({
          where: { boqItemId: itemId, rateAnalysisId: null },
        });
        if (directIngs > 0) {
          await recalcItemRate(itemId);
          const refreshed = await db.boqItem.findUnique({
            where: { id: itemId },
            include: { ingredients: true },
          });
          if (refreshed) updated = refreshed;
        }
      }

      await audit({
        userId: ctx.user.id,
        projectId: item.projectId,
        action: "boq.update",
        entityType: "boq_item",
        entityId: itemId,
        metadata: { code: item.code, changes: data },
      });

      return { item: updated };
    }),

  /** Delete a BOQ item. */
  delete: protectedProcedure
    .input(z.object({ itemId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const item = await db.boqItem.findUnique({
        where: { id: input.itemId },
        select: { id: true, projectId: true, code: true, locked: true },
      });
      if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "BOQ item not found." });

      const role = await assertProjectMember(ctx.user, item.projectId);
      if (role === "client" || role === "inspector") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Your role on this project is read-only." });
      }

      // Check if BOQ is locked
      const project = await db.project.findUnique({ where: { id: item.projectId }, select: { boqLocked: true } });
      if (project?.boqLocked) {
        throw new TRPCError({ code: "FORBIDDEN", message: "BOQ is locked." });
      }

      // Check if item is individually locked
      if (item.locked) {
        throw new TRPCError({ code: "FORBIDDEN", message: "This BOQ item is locked." });
      }

      await db.boqItem.delete({ where: { id: input.itemId } });
      await audit({
        userId: ctx.user.id,
        projectId: item.projectId,
        action: "boq.delete",
        entityType: "boq_item",
        entityId: input.itemId,
        metadata: { code: item.code },
      });

      return { ok: true };
    }),

  /** Lock or unlock an individual BOQ item. */
  lockItem: protectedProcedure
    .input(LockBoqItemSchema)
    .mutation(async ({ ctx, input }) => {
      const item = await db.boqItem.findUnique({
        where: { id: input.itemId },
        select: { id: true, projectId: true, code: true },
      });
      if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "BOQ item not found." });

      const role = await assertProjectMember(ctx.user, item.projectId);
      if (role === "client" || role === "inspector") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Your role on this project is read-only." });
      }

      const updated = await db.boqItem.update({
        where: { id: input.itemId },
        data: { locked: input.locked },
        include: { ingredients: true },
      });

      await audit({
        userId: ctx.user.id,
        projectId: item.projectId,
        action: input.locked ? "boq.lock" : "boq.unlock",
        entityType: "boq_item",
        entityId: input.itemId,
        metadata: { code: item.code },
      });

      return { item: updated };
    }),

  /** Bulk-update sort orders (drag-to-reorder). */
  reorder: protectedProcedure
    .input(ReorderSchema)
    .mutation(async ({ ctx, input }) => {
      await assertCanWrite(ctx.user, input.projectId);

      // Check if BOQ is locked
      const project = await db.project.findUnique({ where: { id: input.projectId }, select: { boqLocked: true } });
      if (project?.boqLocked) {
        throw new TRPCError({ code: "FORBIDDEN", message: "BOQ is locked." });
      }

      // Verify every item belongs to this project
      const ids = input.items.map((i) => i.id);
      const owned = await db.boqItem.findMany({
        where: { id: { in: ids }, projectId: input.projectId },
        select: { id: true },
      });
      if (owned.length !== ids.length) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "One or more items do not belong to this project." });
      }

      await db.$transaction(
        input.items.map((it) =>
          db.boqItem.update({ where: { id: it.id }, data: { sortOrder: it.sortOrder } })
        )
      );

      await audit({
        userId: ctx.user.id,
        projectId: input.projectId,
        action: "boq.reorder",
        entityType: "boq_item",
        entityId: input.projectId,
        metadata: { count: input.items.length },
      });

      return { ok: true };
    }),
});
