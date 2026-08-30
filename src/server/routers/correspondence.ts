/**
 * tRPC router for Correspondence Register — formal letter tracking.
 *
 * Full traceability and accountability for incoming/outgoing letters.
 * Key features:
 *   - Dual reference (their ref + our ref)
 *   - Informative vs Actionable classification
 *   - Category system (QC, Design, Site, Account, etc.)
 *   - Action assignment + reply drafting assignment (different people)
 *   - Deadline tracking with overdue alerts
 *   - Full lifecycle: not_started → in_progress → drafted → sent → closed
 *   - File attachments for both incoming letter and outgoing reply
 *   - Status history audit trail
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "@/server/trpc";
import { db } from "@/lib/db";
import { assertProjectMember, assertCanWrite } from "@/lib/authz";
import { audit } from "@/lib/audit";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const CreateCorrespondenceSchema = z.object({
  projectId: z.string(),
  direction: z.enum(["incoming", "outgoing"]).default("incoming"),
  theirRef: z.string().optional(),
  ourRef: z.string().optional(),
  date: z.string().datetime().optional(),
  receivedDate: z.string().datetime().optional(),
  fromParty: z.string().optional(),
  fromName: z.string().optional(),
  toParty: z.string().optional(),
  toName: z.string().optional(),
  subject: z.string().min(1),
  category: z.enum(["qc", "design", "site", "account", "contract", "safety", "procurement", "other"]).default("other"),
  letterType: z.enum(["informative", "actionable", "eot_claim", "variation_order"]).default("informative"),
  repliesToId: z.string().optional(),
  ccList: z.string().optional(), // JSON array string
  actionAssignedTo: z.string().optional(),
  replyDraftedBy: z.string().optional(),
  replyDueDate: z.string().datetime().optional(),
  // EOT fields
  eotDaysClaimed: z.number().min(0).optional(),
  eotLinkedTaskIds: z.string().optional(), // JSON array string
  fileData: z.string().max(20_000_000).optional(),
  fileName: z.string().max(255).optional(),
  fileType: z.string().max(100).optional(),
  linkedRfiId: z.string().optional(),
  linkedBoqItemId: z.string().optional(),
  linkedGanttTaskId: z.string().optional(),
  notes: z.string().optional(),
});

const UpdateReplySchema = z.object({
  id: z.string(),
  replyStatus: z.enum(["not_started", "in_progress", "drafted", "sent", "closed"]).optional(),
  replyOurRef: z.string().optional(),
  replyNotes: z.string().optional(),
  replyFileData: z.string().max(20_000_000).optional(),
  replyFileName: z.string().max(255).optional(),
  replyFileType: z.string().max(100).optional(),
  replySentDate: z.string().datetime().optional(),
});

export const correspondenceRouter = router({
  /** List all correspondence for a project (or org-wide) with optional filters. */
  list: protectedProcedure
    .input(z.object({
      projectId: z.string().optional(),
      direction: z.string().optional(), // incoming | outgoing
      category: z.string().optional(),
      replyStatus: z.string().optional(),
      letterType: z.string().optional(),
      q: z.string().optional(),
      overdue: z.boolean().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const where: any = {};

      if (input.projectId) {
        await assertProjectMember(ctx.user, input.projectId);
        where.projectId = input.projectId;
      } else {
        const orgId = ctx.user.organizationId;
        if (!orgId) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "User is not assigned to an organization" });
        }
        where.project = { organizationId: orgId };
      }

      if (input.direction) where.direction = input.direction;
      if (input.category) where.category = input.category;
      if (input.replyStatus) where.replyStatus = input.replyStatus;
      if (input.letterType) where.letterType = input.letterType;
      if (input.q) {
        where.OR = [
          { subject: { contains: input.q, mode: "insensitive" } },
          { theirRef: { contains: input.q, mode: "insensitive" } },
          { ourRef: { contains: input.q, mode: "insensitive" } },
          { fromName: { contains: input.q, mode: "insensitive" } },
        ];
      }
      if (input.overdue) {
        where.replyDueDate = { lt: new Date() };
        where.replyStatus = { in: ["not_started", "in_progress"] };
        where.letterType = "actionable";
      }

      const letters = await db.correspondence.findMany({
        where,
        include: {
          project: { select: { id: true, name: true, code: true } },
        },
        orderBy: { date: "desc" },
      });

      return { letters };
    }),

  /** Get a single correspondence with full detail. */
  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const letter = await db.correspondence.findUnique({ where: { id: input.id } });
      if (!letter) throw new TRPCError({ code: "NOT_FOUND", message: "Letter not found." });
      await assertProjectMember(ctx.user, letter.projectId);
      return { letter };
    }),

  /** Log a new letter (incoming or outgoing). */
  create: protectedProcedure
    .input(CreateCorrespondenceSchema)
    .mutation(async ({ ctx, input }) => {
      await assertCanWrite(ctx.user, input.projectId);

      // The thread parent must belong to the SAME project — otherwise a
      // writer on project A could attach their letter as a reply to
      // project B's letter, and the foreign letter's getThread would then
      // include (leak) this letter through the LetterThread relation.
      if (input.repliesToId) {
        const parent = await db.correspondence.findFirst({
          where: { id: input.repliesToId, projectId: input.projectId },
          select: { id: true },
        });
        if (!parent) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Parent letter not found in this project.",
          });
        }
      }

      // Validate file size
      if (input.fileData) {
        const estBytes = Math.ceil((input.fileData.length * 3) / 4);
        if (estBytes > MAX_FILE_SIZE) {
          throw new TRPCError({ code: "BAD_REQUEST", message: `File too large (max ${MAX_FILE_SIZE / 1024 / 1024}MB)` });
        }
      }

      // Generate ourRef if not provided
      let ourRef = input.ourRef;
      if (!ourRef) {
        const count = await db.correspondence.count({ where: { projectId: input.projectId } });
        const year = new Date().getFullYear();
        ourRef = `COR-${year}-${String(count + 1).padStart(4, "0")}`;
      }

      const letter = await db.correspondence.create({
        data: {
          projectId: input.projectId,
          direction: input.direction,
          theirRef: input.theirRef || null,
          ourRef,
          date: input.date ? new Date(input.date) : new Date(),
          receivedDate: input.receivedDate ? new Date(input.receivedDate) : null,
          fromParty: input.fromParty || null,
          fromName: input.fromName || null,
          toParty: input.toParty || null,
          toName: input.toName || null,
          subject: input.subject,
          category: input.category,
          letterType: input.letterType,
          repliesToId: input.repliesToId || null,
          ccList: input.ccList || null,
          actionAssignedTo: input.actionAssignedTo || null,
          replyDraftedBy: input.replyDraftedBy || null,
          replyDueDate: input.replyDueDate ? new Date(input.replyDueDate) : null,
          eotDaysClaimed: input.eotDaysClaimed || null,
          eotLinkedTaskIds: input.eotLinkedTaskIds || null,
          eotStatus: input.letterType === "eot_claim" ? "submitted" : null,
          fileData: input.fileData || null,
          fileName: input.fileName || null,
          fileType: input.fileType || null,
          linkedRfiId: input.linkedRfiId || null,
          linkedBoqItemId: input.linkedBoqItemId || null,
          linkedGanttTaskId: input.linkedGanttTaskId || null,
          statusHistory: JSON.stringify([{ status: "created", date: new Date().toISOString(), userId: ctx.user.id }]),
          createdById: ctx.user.id,
        },
      });

      await audit({
        userId: ctx.user.id,
        projectId: input.projectId,
        action: "correspondence.create",
        entityType: "correspondence",
        entityId: letter.id,
        metadata: { ourRef, subject: input.subject, direction: input.direction },
      });

      return { letter };
    }),

  /** Update reply status / upload reply file. */
  updateReply: protectedProcedure
    .input(UpdateReplySchema)
    .mutation(async ({ ctx, input }) => {
      const existing = await db.correspondence.findUnique({ where: { id: input.id } });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Letter not found." });
      await assertCanWrite(ctx.user, existing.projectId);

      // Validate reply file size — same cap as the incoming letter file
      // (previously only `create` checked; a reply could exceed the limit).
      if (input.replyFileData) {
        const estBytes = Math.ceil((input.replyFileData.length * 3) / 4);
        if (estBytes > MAX_FILE_SIZE) {
          throw new TRPCError({ code: "BAD_REQUEST", message: `File too large (max ${MAX_FILE_SIZE / 1024 / 1024}MB)` });
        }
      }

      // Build status history entry
      const history = existing.statusHistory ? JSON.parse(existing.statusHistory) : [];
      if (input.replyStatus && input.replyStatus !== existing.replyStatus) {
        history.push({
          status: input.replyStatus,
          date: new Date().toISOString(),
          userId: ctx.user.id,
          userName: ctx.user.name,
        });
      }

      const updated = await db.correspondence.update({
        where: { id: input.id },
        data: {
          ...(input.replyStatus && { replyStatus: input.replyStatus }),
          ...(input.replyOurRef !== undefined && { replyOurRef: input.replyOurRef || null }),
          ...(input.replyNotes !== undefined && { replyNotes: input.replyNotes || null }),
          ...(input.replyFileData && {
            replyFileData: input.replyFileData,
            replyFileName: input.replyFileName || null,
            replyFileType: input.replyFileType || null,
          }),
          ...(input.replySentDate && { replySentDate: new Date(input.replySentDate) }),
          ...(input.replyStatus === "sent" && { replySentDate: new Date() }),
          statusHistory: JSON.stringify(history),
        },
      });

      await audit({
        userId: ctx.user.id,
        projectId: existing.projectId,
        action: `correspondence.reply.${input.replyStatus ?? "updated"}`,
        entityType: "correspondence",
        entityId: input.id,
        metadata: { ourRef: existing.ourRef, replyStatus: input.replyStatus },
      });

      return { letter: updated };
    }),

  /** Get stats for dashboard (overdue, pending, by category). */
  stats: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);

      const letters = await db.correspondence.findMany({
        where: { projectId: input.projectId },
        select: {
          direction: true,
          letterType: true,
          replyStatus: true,
          replyDueDate: true,
          category: true,
        },
      });

      const now = new Date();
      const actionable = letters.filter(l => l.letterType === "actionable");
      const overdue = actionable.filter(l =>
        l.replyDueDate && l.replyDueDate < now &&
        (l.replyStatus === "not_started" || l.replyStatus === "in_progress")
      );
      const pendingReply = actionable.filter(l =>
        l.replyStatus === "not_started" || l.replyStatus === "in_progress"
      );
      const drafted = actionable.filter(l => l.replyStatus === "drafted");
      const sent = actionable.filter(l => l.replyStatus === "sent");
      const closed = actionable.filter(l => l.replyStatus === "closed");

      const byCategory: Record<string, number> = {};
      for (const l of letters) {
        byCategory[l.category] = (byCategory[l.category] ?? 0) + 1;
      }

      return {
        total: letters.length,
        incoming: letters.filter(l => l.direction === "incoming").length,
        outgoing: letters.filter(l => l.direction === "outgoing").length,
        actionable: actionable.length,
        informative: letters.filter(l => l.letterType === "informative").length,
        overdue: overdue.length,
        pendingReply: pendingReply.length,
        drafted: drafted.length,
        sent: sent.length,
        closed: closed.length,
        byCategory,
        overdueLetters: overdue,
      };
    }),

  /** Delete a letter. */
  delete: protectedProcedure
    .input(z.object({ id: z.string(), projectId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertCanWrite(ctx.user, input.projectId);

      // IDOR FIX: verify the correspondence record actually belongs to
      // input.projectId before deleting. Without this, a user with write
      // access to project A could pass projectId=projectA and id=<record
      // from project B> and delete it.
      const existing = await db.correspondence.findFirst({
        where: { id: input.id, projectId: input.projectId },
        select: { id: true },
      });
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Correspondence not found in this project." });
      }

      await db.correspondence.delete({ where: { id: input.id } });
      return { ok: true };
    }),

  /** Get a letter with its thread (parent + all replies). */
  getThread: protectedProcedure
    .input(z.object({ letterId: z.string() }))
    .query(async ({ ctx, input }) => {
      const letter = await db.correspondence.findUnique({
        where: { id: input.letterId },
        include: {
          replies: {
            orderBy: { date: "asc" },
          },
          repliesTo: true,
        },
      });
      if (!letter) throw new TRPCError({ code: "NOT_FOUND", message: "Letter not found." });
      await assertProjectMember(ctx.user, letter.projectId);
      return { letter };
    }),

  /** Update EOT claim status (for EOT letters). */
  updateEot: protectedProcedure
    .input(z.object({
      id: z.string(),
      eotStatus: z.enum(["submitted", "under_review", "approved", "rejected", "partially_approved"]),
      eotDaysGranted: z.number().min(0).optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const existing = await db.correspondence.findUnique({ where: { id: input.id } });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Letter not found." });
      await assertCanWrite(ctx.user, existing.projectId);

      const updated = await db.correspondence.update({
        where: { id: input.id },
        data: {
          eotStatus: input.eotStatus,
          eotDaysGranted: input.eotDaysGranted ?? null,
          replyNotes: input.notes || existing.replyNotes,
        },
      });

      await audit({
        userId: ctx.user.id,
        projectId: existing.projectId,
        action: `correspondence.eot.${input.eotStatus}`,
        entityType: "correspondence",
        entityId: input.id,
        metadata: { ourRef: existing.ourRef, daysGranted: input.eotDaysGranted },
      });

      return { letter: updated };
    }),
});
