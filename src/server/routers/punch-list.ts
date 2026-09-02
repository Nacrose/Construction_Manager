/**
 * tRPC router for Punch List — defect tracking for handover.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "@/server/trpc";
import { db } from "@/lib/db";
import { assertProjectMember, assertCanWrite } from "@/lib/authz";
import { audit } from "@/lib/audit";

import { transitionEntityState } from "@/server/utils/state-machine";

export const punchListRouter = router({
  list: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      status: z.string().optional(),
      severity: z.string().optional(),
      q: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);
      const where: any = { projectId: input.projectId };
      if (input.status) where.status = input.status;
      if (input.severity) where.severity = input.severity;
      if (input.q) {
        where.OR = [
          { number: { contains: input.q, mode: "insensitive" } },
          { title: { contains: input.q, mode: "insensitive" } },
          { description: { contains: input.q, mode: "insensitive" } },
        ];
      }
      const items = await db.punchItem.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: 1000, // bounded (pagination sweep) — see src/lib/pagination.ts,
      });
      return { items };
    }),

  create: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      number: z.string().min(1),
      title: z.string().min(1),
      description: z.string().min(1),
      location: z.string().optional(),
      category: z.string().optional(),
      severity: z.enum(["minor", "major", "critical"]).default("minor"),
      assignedTo: z.string().optional(),
      dueDate: z.string().optional().transform((v) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T00:00:00.000Z` : v)).pipe(z.string().datetime().optional()),
      linkedBoqItemId: z.string().optional(),
      linkedGanttTaskId: z.string().optional(),
      linkedDrawingId: z.string().optional(),
      photoData: z.string().optional(),
      photoName: z.string().optional(),
      photoType: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertCanWrite(ctx.user, input.projectId);
      const { projectId, ...data } = input;
      const item = await db.punchItem.create({
        data: {
          projectId,
          ...data,
          dueDate: data.dueDate ? new Date(data.dueDate) : null,
          createdById: ctx.user.id,
        },
      });
      await audit({ userId: ctx.user.id, projectId, action: "punch_list.create", entityType: "punch_item", entityId: item.id, metadata: { number: item.number } });
      return { item };
    }),

  updateStatus: protectedProcedure
    .input(z.object({
      id: z.string(),
      status: z.enum(["open", "in_progress", "resolved", "verified", "closed"]),
      resolvedNotes: z.string().optional(),
      resolvedBy: z.string().optional(),
      verifiedBy: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const item = await db.punchItem.findUnique({ where: { id: input.id } });
      if (!item) throw new TRPCError({ code: "NOT_FOUND" });
      await assertCanWrite(ctx.user, item.projectId);

      const { entity: updated } = await transitionEntityState(db, {
        model: "punchItem",
        id: input.id,
        targetState: input.status,
        userId: ctx.user.id,
        userName: input.resolvedBy || input.verifiedBy || ctx.user.name,
        notes: input.resolvedNotes,
        projectId: item.projectId,
      });

      await audit({
        userId: ctx.user.id,
        projectId: item.projectId,
        action: "punch_list.update_status",
        entityType: "punch_item",
        entityId: item.id,
        metadata: { number: item.number, fromStatus: item.status, toStatus: input.status },
      });
      return { item: updated };
    }),


  delete: protectedProcedure
    .input(z.object({ id: z.string(), projectId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertCanWrite(ctx.user, input.projectId);

      // IDOR FIX: verify the punch item belongs to input.projectId —
      // previously the id was deleted unchecked, so a writer on project B
      // could delete project A's defect records by id.
      const existing = await db.punchItem.findFirst({
        where: { id: input.id, projectId: input.projectId },
        select: { id: true },
      });
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Punch item not found in this project." });
      }

      await db.punchItem.delete({ where: { id: input.id } });
      return { ok: true };
    }),

  stats: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);
      const items = await db.punchItem.findMany({
        where: { projectId: input.projectId },
        select: { status: true, severity: true },
         take: 1000, // bounded (pagination sweep) — see src/lib/pagination.ts
       });
      return {
        total: items.length,
        open: items.filter(i => i.status === "open").length,
        inProgress: items.filter(i => i.status === "in_progress").length,
        resolved: items.filter(i => i.status === "resolved").length,
        verified: items.filter(i => i.status === "verified").length,
        closed: items.filter(i => i.status === "closed").length,
        critical: items.filter(i => i.severity === "critical").length,
        major: items.filter(i => i.severity === "major").length,
        minor: items.filter(i => i.severity === "minor").length,
      };
    }),
});
