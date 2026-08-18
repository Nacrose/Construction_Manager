/**
 * tRPC router for BOQ versioning (snapshot & diff).
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "@/server/trpc";
import { db } from "@/lib/db";
import { assertProjectMember, assertCanWrite } from "@/lib/authz";
import { audit } from "@/lib/audit";

export const boqVersionRouter = router({
  /** List all versions for a project. */
  list: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);
      const versions = await db.boqVersion.findMany({
        where: { projectId: input.projectId },
        orderBy: { versionNumber: "desc" },
        include: { _count: { select: { items: true } } },
      });
      return { versions };
    }),

  /** Get a single version with all its items. */
  get: protectedProcedure
    .input(z.object({ projectId: z.string(), versionId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);
      const version = await db.boqVersion.findUnique({
        where: { id: input.versionId },
        include: { items: true },
      });
      if (!version || version.projectId !== input.projectId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Version not found." });
      }
      return { ...version, items: version.items };
    }),

  /**
   * Create a new version by snapshotting the current BOQ.
   */
  create: protectedProcedure
    .input(z.object({ projectId: z.string(), notes: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      await assertCanWrite(ctx.user, input.projectId);

      const last = await db.boqVersion.aggregate({
        where: { projectId: input.projectId },
        _max: { versionNumber: true },
      });
      const versionNumber = (last._max.versionNumber ?? 0) + 1;

      const items = await db.boqItem.findMany({
        where: { projectId: input.projectId },
        orderBy: { sortOrder: "asc" },
        select: {
          id: true, code: true, description: true, unit: true,
          quantity: true, rate: true, amount: true,
        },
      });

      if (items.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot create a version snapshot when BOQ is empty." });
      }

      const version = await db.boqVersion.create({
        data: {
          projectId: input.projectId,
          versionNumber,
          notes: input.notes,
          status: "draft",
          items: {
            create: items.map((item) => ({
              boqItemId: item.id,
              code: item.code,
              description: item.description,
              unit: item.unit,
              quantity: item.quantity,
              rate: item.rate,
              amount: item.amount,
            })),
          },
        },
      });

      await audit({
        userId: ctx.user.id,
        projectId: input.projectId,
        action: "boq_version.create",
        entityType: "boq_version",
        entityId: version.id,
        metadata: { versionNumber },
      });

      return { version };
    }),

  /** Approve a draft version. */
  approve: protectedProcedure
    .input(z.object({ projectId: z.string(), versionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertCanWrite(ctx.user, input.projectId);

      const found = await db.boqVersion.findUnique({
        where: { id: input.versionId },
        select: { id: true, projectId: true, status: true },
      });
      if (!found || found.projectId !== input.projectId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Version not found." });
      }
      if (found.status !== "draft") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Only draft versions can be approved." });
      }

      const updated = await db.boqVersion.update({
        where: { id: input.versionId },
        data: { status: "approved" },
      });

      // Auto-lock the BOQ when the first version is approved
      const project = await db.project.findUnique({
        where: { id: input.projectId },
        select: { boqLocked: true },
      });
      if (!project?.boqLocked) {
        await db.project.update({
          where: { id: input.projectId },
          data: { boqLocked: true },
        });
      }

      await audit({
        userId: ctx.user.id,
        projectId: input.projectId,
        action: "boq_version.approve",
        entityType: "boq_version",
        entityId: input.versionId,
      });

      return { version: updated };
    }),

  /**
   * Diff: compare current live BOQ items against a version,
   * or compare two versions against each other.
   */
  diff: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      versionId: z.string(),
      vsVersionId: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);

      const left = await db.boqVersion.findUnique({
        where: { id: input.versionId },
        include: { items: true },
      });
      if (!left || left.projectId !== input.projectId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Left version not found." });
      }

      let rightItems: Array<{ code: string; description: string; unit: string; quantity: number; rate: number; amount: number }>;
      let rightLabel: string;

      if (input.vsVersionId) {
        const right = await db.boqVersion.findUnique({
          where: { id: input.vsVersionId },
          include: { items: true },
        });
        if (!right || right.projectId !== input.projectId) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Right version not found." });
        }
        rightItems = right.items;
        rightLabel = `V${right.versionNumber}`;
      } else {
        const current = await db.boqItem.findMany({
          where: { projectId: input.projectId },
          orderBy: { sortOrder: "asc" },
        });
        rightItems = current;
        rightLabel = "Current";
      }

      const leftMap = new Map(left.items.map((i) => [i.code, i]));
      const diffRows: Array<{
        code: string; description: string; unit: string;
        leftQty: number; leftRate: number; leftAmount: number;
        rightQty: number; rightRate: number; rightAmount: number;
        qtyDiff: number; rateDiff: number; amountDiff: number;
      }> = [];

      for (const right of rightItems) {
        const l = leftMap.get(right.code);
        const leftQty = l?.quantity ?? 0;
        const leftRate = l?.rate ?? 0;
        const leftAmount = l?.amount ?? 0;
        diffRows.push({
          code: right.code, description: right.description, unit: right.unit,
          leftQty, leftRate, leftAmount,
          rightQty: right.quantity, rightRate: right.rate, rightAmount: right.amount,
          qtyDiff: right.quantity - leftQty,
          rateDiff: right.rate - leftRate,
          amountDiff: right.amount - leftAmount,
        });
      }

      const rightCodes = new Set(rightItems.map((i) => i.code));
      for (const l of left.items) {
        if (!rightCodes.has(l.code)) {
          diffRows.push({
            code: l.code, description: l.description, unit: l.unit,
            leftQty: l.quantity, leftRate: l.rate, leftAmount: l.amount,
            rightQty: 0, rightRate: 0, rightAmount: 0,
            qtyDiff: -l.quantity, rateDiff: -l.rate, amountDiff: -l.amount,
          });
        }
      }

      const leftLabel = `V${left.versionNumber}`;
      return { diffRows, leftLabel, rightLabel };
    }),
});
