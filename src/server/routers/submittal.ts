/**
 * tRPC router for Submittals — shop drawings, material samples, product data
 * submitted to consultant/client for approval.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "@/server/trpc";
import { db } from "@/lib/db";
import { assertProjectMember, assertCanWrite } from "@/lib/authz";
import { audit } from "@/lib/audit";

import { transitionEntityState } from "@/server/utils/state-machine";

export const submittalRouter = router({
  list: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      status: z.string().optional(),
      type: z.string().optional(),
      q: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);
      const where: any = { projectId: input.projectId };
      if (input.status) where.status = input.status;
      if (input.type) where.type = input.type;
      if (input.q) {
        where.OR = [
          { number: { contains: input.q, mode: "insensitive" } },
          { title: { contains: input.q, mode: "insensitive" } },
        ];
      }
      const submittals = await db.submittal.findMany({
        where, orderBy: { createdAt: "desc" },
         take: 1000, // bounded (pagination sweep) — see src/lib/pagination.ts
       });
      return { submittals };
    }),

  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const s = await db.submittal.findUnique({ where: { id: input.id } });
      if (!s) throw new TRPCError({ code: "NOT_FOUND", message: "Submittal not found." });
      await assertProjectMember(ctx.user, s.projectId);
      return { submittal: s };
    }),

  create: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      number: z.string().min(1),
      title: z.string().min(1),
      description: z.string().optional(),
      type: z.enum(["shop_drawing", "material_sample", "product_data", "technical_spec", "other"]).default("shop_drawing"),
      category: z.string().optional(),
      scheduledDate: z.string().optional().transform((v) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T00:00:00.000Z` : v)).pipe(z.string().datetime().optional()),
      dueDate: z.string().optional().transform((v) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T00:00:00.000Z` : v)).pipe(z.string().datetime().optional()),
      linkedBoqItemId: z.string().optional(),
      linkedGanttTaskId: z.string().optional(),
      linkedDrawingId: z.string().optional(),
      fileData: z.string().max(20_000_000).optional(),
      fileName: z.string().max(255).optional(),
      fileType: z.string().max(100).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertCanWrite(ctx.user, input.projectId);
      const { projectId, ...data } = input;
      const s = await db.submittal.create({
        data: {
          projectId,
          ...data,
          scheduledDate: data.scheduledDate ? new Date(data.scheduledDate) : null,
          dueDate: data.dueDate ? new Date(data.dueDate) : null,
          createdById: ctx.user.id,
        },
      });
      await audit({ userId: ctx.user.id, projectId, action: "submittal.create", entityType: "submittal", entityId: s.id, metadata: { number: s.number } });
      return { submittal: s };
    }),

  submit: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const s = await db.submittal.findUnique({ where: { id: input.id } });
      if (!s) throw new TRPCError({ code: "NOT_FOUND" });
      await assertCanWrite(ctx.user, s.projectId);

      const { entity: updated } = await transitionEntityState(db, {
        model: "submittal",
        id: input.id,
        targetState: "submitted",
        userId: ctx.user.id,
        projectId: s.projectId,
      });

      return { submittal: updated };
    }),

  review: protectedProcedure
    .input(z.object({
      id: z.string(),
      status: z.enum(["approved", "rejected", "revise_resubmit"]),
      reviewComments: z.string().optional(),
      reviewedBy: z.string().optional(),
      returnedFileData: z.string().optional(),
      returnedFileName: z.string().optional(),
      returnedFileType: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const s = await db.submittal.findUnique({ where: { id: input.id } });
      if (!s) throw new TRPCError({ code: "NOT_FOUND" });
      await assertCanWrite(ctx.user, s.projectId);

      const { entity: updated } = await transitionEntityState(db, {
        model: "submittal",
        id: input.id,
        targetState: input.status,
        userId: ctx.user.id,
        userName: input.reviewedBy || ctx.user.name,
        notes: input.reviewComments,
        projectId: s.projectId,
        additionalData: {
          reviewComments: input.reviewComments || null,
          returnedFileData: input.returnedFileData || null,
          returnedFileName: input.returnedFileName || null,
          returnedFileType: input.returnedFileType || null,
        },
      });

      await audit({
        userId: ctx.user.id,
        projectId: s.projectId,
        action: "submittal.review",
        entityType: "submittal",
        entityId: s.id,
        metadata: { number: s.number, status: input.status, reviewedBy: input.reviewedBy || ctx.user.name },
      });
      return { submittal: updated };
    }),


  delete: protectedProcedure
    .input(z.object({ id: z.string(), projectId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertCanWrite(ctx.user, input.projectId);

      // IDOR FIX: verify the submittal belongs to input.projectId.
      const existing = await db.submittal.findFirst({
        where: { id: input.id, projectId: input.projectId },
        select: { id: true },
      });
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Submittal not found in this project." });
      }

      await db.submittal.delete({ where: { id: input.id } });
      return { ok: true };
    }),

  stats: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);
      const submittals = await db.submittal.findMany({
        where: { projectId: input.projectId },
        select: { status: true, type: true },
         take: 1000, // bounded (pagination sweep) — see src/lib/pagination.ts
       });
      return {
        total: submittals.length,
        draft: submittals.filter(s => s.status === "draft").length,
        submitted: submittals.filter(s => s.status === "submitted").length,
        approved: submittals.filter(s => s.status === "approved").length,
        rejected: submittals.filter(s => s.status === "rejected").length,
        revise: submittals.filter(s => s.status === "revise_resubmit").length,
      };
    }),
});
