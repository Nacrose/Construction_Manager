/**
 * tRPC router for BOQ versioning (snapshot & diff).
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "@/server/trpc";
import { db } from "@/lib/db";
import { assertProjectMember, assertCanWrite, assertProjectManager } from "@/lib/authz";
import { audit } from "@/lib/audit";
import { withOrgContext } from "@/lib/rls";
import { transitionEntityState } from "@/server/utils/state-machine";

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
         take: 1000, // bounded (pagination sweep) — see src/lib/pagination.ts
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
   * Uses a retry loop on unique-constraint violation to handle the
   * TOCTOU race between reading max(versionNumber) and inserting.
   */
  create: protectedProcedure
    .input(z.object({ projectId: z.string(), notes: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      await assertCanWrite(ctx.user, input.projectId);

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

      // Retry loop: read max(versionNumber) → create. If a concurrent
      // request inserts the same versionNumber between our read and
      // insert, the unique constraint [projectId, versionNumber] will
      // throw P2002. We retry with an incremented number.
      const MAX_RETRIES = 5;
      let version;
      let versionNumber = 0;
      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        const last = await db.boqVersion.aggregate({
          where: { projectId: input.projectId },
          _max: { versionNumber: true },
        });
        versionNumber = (last._max.versionNumber ?? 0) + 1;

        try {
          version = await db.boqVersion.create({
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
          break; // success
        } catch (err: any) {
          // P2002 = unique constraint violation on [projectId, versionNumber].
          // Retry with the next versionNumber.
          if (attempt < MAX_RETRIES - 1 && err?.code === "P2002") {
            continue;
          }
          throw err; // different error or out of retries
        }
      }

      if (!version) {
        throw new TRPCError({ code: "CONFLICT", message: "Failed to create BOQ version after multiple retries. Please try again." });
      }

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
      // H-7 PRIVILEGE-TIER FIX: approving a version locks the project BOQ
      // PERMANENTLY (the baseline becomes immutable) — that is a
      // project-manager decision, not an engineer one. assertCanWrite
      // admitted any implicit engineer.
      await assertProjectManager(ctx.user, input.projectId);

      const found = await db.boqVersion.findUnique({
        where: { id: input.versionId },
        select: { id: true, projectId: true, status: true },
      });
      if (!found || found.projectId !== input.projectId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Version not found." });
      }

      // Engine transition (CAS on the draft status) + project BOQ lock — ONE
      // TRANSACTION. Previously the status flip and the lock were two
      // separate writes: a crash between them left an approved version with
      // an unlocked project BOQ (edits leaking into an approved baseline).
      const updated = await db.$transaction(async (tx) => {
        await withOrgContext(tx, ctx.user.organizationId, !!ctx.user.isSuperAdmin); // RLS: org-scoped tx
        const result = await transitionEntityState(tx, {
          model: "boqVersion",
          id: input.versionId,
          targetState: "approved",
          userId: ctx.user.id,
          userName: ctx.user.name,
          projectId: input.projectId,
          allowedCurrentStates: ["draft"],
          skipEventEmit: true, // boqVersion has no event consumers today
        });

        // Auto-lock the BOQ when the first version is approved
        const project = await tx.project.findUnique({
          where: { id: input.projectId },
          select: { boqLocked: true },
        });
        if (!project?.boqLocked) {
          await tx.project.update({
            where: { id: input.projectId },
            data: { boqLocked: true },
          });
        }

        return result.entity;
      });

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
           take: 1000, // bounded (pagination sweep) — see src/lib/pagination.ts
         });
        rightItems = current;
        rightLabel = "Current";
      }

      // Match by code first, then fall back to boqItemId (stable ID
      // that doesn't change even if the code was renamed).
      const leftMapByCode = new Map(left.items.map((i) => [i.code, i]));
      const leftMapById = new Map(left.items.map((i) => [i.boqItemId, i]));
      const diffRows: Array<{
        code: string; description: string; unit: string;
        leftQty: number; leftRate: number; leftAmount: number;
        rightQty: number; rightRate: number; rightAmount: number;
        qtyDiff: number; rateDiff: number; amountDiff: number;
        isRenamed: boolean;
      }> = [];

      for (const right of rightItems) {
        // Try matching by code first, then by boqItemId
        let l = leftMapByCode.get(right.code);
        let isRenamed = false;
        if (!l && (right as any).boqItemId) {
          l = leftMapById.get((right as any).boqItemId);
          if (l) isRenamed = true; // found by ID but not by code = code was renamed
        }
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
          isRenamed,
        });
      }

      // Find left items not present on the right (deleted items)
      const rightCodes = new Set(rightItems.map((i) => i.code));
      const rightIds = new Set(rightItems.map((i: any) => i.boqItemId).filter(Boolean));
      for (const l of left.items) {
        // Check by both code and boqItemId
        if (!rightCodes.has(l.code) && !rightIds.has(l.boqItemId)) {
          diffRows.push({
            code: l.code, description: l.description, unit: l.unit,
            leftQty: l.quantity, leftRate: l.rate, leftAmount: l.amount,
            rightQty: 0, rightRate: 0, rightAmount: 0,
            qtyDiff: -l.quantity, rateDiff: -l.rate, amountDiff: -l.amount,
            isRenamed: false,
          });
        }
      }

      const leftLabel = `V${left.versionNumber}`;
      return { diffRows, leftLabel, rightLabel };
    }),
});
