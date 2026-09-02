/**
 * tRPC router for RFIs.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "@/server/trpc";
import { db } from "@/lib/db";
import { assertProjectMember, assertCanWrite, assertProjectAdmin } from "@/lib/authz";
import { audit } from "@/lib/audit";
import { createNotification, notifyProject } from "@/server/utils/notify";
import { paginationInput, pageArgs, pageResult } from "@/lib/pagination";
import {
  canTransition,
  transitionEntityState,
} from "@/server/utils/state-machine";
import { uploadFile, deleteFile } from "@/lib/storage";
import { withOrgContext } from "@/lib/rls";
import {
  isAllowedAttachmentType,
  snapshotRfiItems,
} from "@/server/utils/workflow-helpers";

// MIME-type whitelist check — delegates to the shared helper so the
// allowed-types set is defined in one place and tested by unit tests.
function assertAllowedAttachmentType(fileType: string): void {
  if (!isAllowedAttachmentType(fileType)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `File type "${fileType}" is not allowed. Allowed types: images (JPEG/PNG/GIF/WebP), PDF, Office docs, TXT/CSV, ZIP.`,
    });
  }
}

// Map discipline → eligible roles for auto-routing
const DISCIPLINE_ROUTES: Record<string, string[]> = {
  civil: ["project_manager", "coordinator"],
  structural: ["project_manager", "coordinator"],
  electrical: ["project_manager", "coordinator"],
  mechanical: ["project_manager", "coordinator"],
  architectural: ["project_manager", "coordinator"],
};

const RfiItemSchema = z.object({
  boqItemId: z.string().nullable().optional(),
  boqCode: z.string().optional(),
  boqDesc: z.string().optional(),
  quantity: z.number().optional(),
  unit: z.string().optional(),
  paymentType: z.enum(["payable", "unpayable", "temporary"]).default("payable"),
  remark: z.string().optional(),
});

const CreateRfiSchema = z.object({
  projectId: z.string(),
  number: z.string().min(1).max(50),
  subject: z.string().min(1).max(300),
  description: z.string().max(5000).optional(),
  location: z.string().max(500).optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
  discipline: z
    .enum(["civil", "structural", "electrical", "mechanical", "architectural"])
    .optional(),
  workDate: z.string().optional().transform((v) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T00:00:00.000Z` : v)).pipe(z.string().datetime().optional()),
  inspectionStartTime: z.string().datetime().optional(),
  inspectionEndTime: z.string().datetime().optional(),
  ganttTaskId: z.string().nullable().optional(),
  boqItemId: z.string().nullable().optional(),
  drawingId: z.string().nullable().optional(),
  subcontractorId: z.string().nullable().optional(),
  assignedToId: z.string().nullable().optional(),
  pinX: z.number().nullable().optional(),
  pinY: z.number().nullable().optional(),
  costImpact: z.boolean().default(false),
  scheduleImpact: z.boolean().default(false),
  items: z.array(RfiItemSchema).default([]),
});

const UpdateRfiSchema = z.object({
  id: z.string(),
  subject: z.string().min(1).max(300).optional(),
  description: z.string().max(5000).optional(),
  location: z.string().max(500).nullable().optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
  discipline: z
    .enum(["civil", "structural", "electrical", "mechanical", "architectural"])
    .optional(),
  workDate: z.string().nullable().optional().transform((v) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T00:00:00.000Z` : v)).pipe(z.string().datetime().nullable().optional()),
  inspectionStartTime: z.string().datetime().nullable().optional(),
  inspectionEndTime: z.string().datetime().nullable().optional(),
  ganttTaskId: z.string().nullable().optional(),
  boqItemId: z.string().nullable().optional(),
  drawingId: z.string().nullable().optional(),
  subcontractorId: z.string().nullable().optional(),
  assignedToId: z.string().nullable().optional(),
  pinX: z.number().nullable().optional(),
  pinY: z.number().nullable().optional(),
  costImpact: z.boolean().optional(),
  scheduleImpact: z.boolean().optional(),
  status: z.enum(["draft", "submitted", "approved", "rejected", "closed"]).optional(),
  items: z.array(RfiItemSchema).optional(),
});

const RespondSchema = z.object({
  id: z.string(),
  response: z.string().min(1).max(5000),
  decision: z.enum(["info", "approved", "rejected", "clarifications_requested"]),
});

/** Delete RFI items for a draft RFI, then recreate from the supplied items array.
 *  Centralized as a module-scope helper so the update flow doesn't accidentally
 *  do this twice (which was a real bug — see git history).
 *
 *  Preserves quantity exactly as supplied, including 0 — previous code used
 *  `item.quantity || null` which silently coerced 0 to null, hiding
 *  legitimate "zero-quantity" line items.
 */
async function replaceRfiItems(rfiId: string, items: Array<any>) {
  await db.rfiItem.deleteMany({ where: { rfiId } });
  if (items.length > 0) {
    await db.rfiItem.createMany({
      data: items.map((item) => ({
        rfiId,
        boqItemId: item.boqItemId || null,
        boqCode: item.boqCode || null,
        boqDesc: item.boqDesc || null,
        quantity: item.quantity,
        unit: item.unit || null,
        paymentType: item.paymentType || "payable",
        remark: item.remark || null,
      })),
    });
  }
}

export const rfiRouter = router({
  /** List RFIs in a project. */
  /** Bounded, cursor-paged register. */
  list: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      status: z.string().optional().nullable(),
      q: z.string().optional().nullable(),
      ...paginationInput,
    }))
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);
      const queryStr = input.q?.toLowerCase();

      const page = pageArgs(input);
      const rows = await db.rfi.findMany({
        where: {
          projectId: input.projectId,
          ...(input.status && { status: input.status }),
          ...(queryStr && {
            OR: [
              { subject: { contains: queryStr } },
              { number: { contains: queryStr } },
              { description: { contains: queryStr } },
            ],
          }),
        },
        orderBy: page.orderBy,
        take: page.take,
        ...(page.cursor ? { cursor: page.cursor, skip: page.skip } : {}),
        select: {
          id: true,
          number: true,
          subject: true,
          status: true,
          priority: true,
          discipline: true,
          location: true,
          workDate: true,
          costImpact: true,
          scheduleImpact: true,
          createdAt: true,
          submittedAt: true,
          inspectionStartTime: true,
          inspectionEndTime: true,
          createdBy: { select: { id: true, name: true } },
          assignedTo: { select: { id: true, user: { select: { id: true, name: true, role: true } } } },
          ganttTask: { select: { id: true, code: true, name: true } },
          boqItem: { select: { id: true, code: true, description: true, unit: true, rate: true } },
          drawing: { select: { id: true, number: true, title: true, revision: true } },
          subcontractor: { select: { id: true, name: true, contact: true, phone: true } },
          items: { include: { boqItem: { select: { id: true, code: true, description: true, unit: true, rate: true } } } },
          _count: { select: { attachments: true, responses: true } },
          dailyProgramTasks: {
            select: { plannedQty: true, actualQty: true, carriedOverFromId: true },
          },
        },
      });

      const { items, hasMore, nextCursor } = pageResult(rows, input);
      return { rfis: items, hasMore, nextCursor };
    }),

  /** Get RFI details. */
  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const rfi = await db.rfi.findUnique({
        where: { id: input.id },
        include: {
          project: { select: { id: true, name: true, code: true, client: true } },
          items: { include: { boqItem: { select: { id: true, code: true, description: true, unit: true, rate: true } } } },
          attachments: true,
          comments: {
            include: { author: { select: { id: true, name: true } } },
            orderBy: { createdAt: "asc" },
          },
          responses: {
            include: { responder: { select: { id: true, name: true, role: true } } },
            orderBy: { createdAt: "desc" },
          },
          createdBy: { select: { id: true, name: true, role: true } },
          assignedTo: { select: { id: true, role: true, user: { select: { id: true, name: true, role: true } } } },
          ganttTask: { select: { id: true, code: true, name: true } },
          boqItem: { select: { id: true, code: true, description: true, unit: true, rate: true } },
          drawing: { select: { id: true, number: true, title: true, revision: true } },
          subcontractor: { select: { id: true, name: true, contact: true, phone: true } },
        },
      });
      if (!rfi) throw new TRPCError({ code: "NOT_FOUND", message: "RFI not found." });
      await assertProjectMember(ctx.user, rfi.projectId);

      return { rfi };
    }),

  /** Create an RFI. */
  create: protectedProcedure
    .input(CreateRfiSchema)
    .mutation(async ({ ctx, input }) => {
      await assertCanWrite(ctx.user, input.projectId);
      const dup = await db.rfi.findUnique({
        where: { projectId_number: { projectId: input.projectId, number: input.number } },
        select: { id: true },
      });
      if (dup) {
        throw new TRPCError({ code: "CONFLICT", message: `RFI number ${input.number} already exists.` });
      }

      // Auto-route: if discipline is set and no explicit assignee, find a matching project member
      let assignedToId = input.assignedToId ?? null;
      if (!assignedToId && input.discipline) {
        const disciplineRole = DISCIPLINE_ROUTES[input.discipline] ?? "project_manager";
        const member = await db.projectMember.findFirst({
          where: { projectId: input.projectId, role: { in: disciplineRole } },
          select: { id: true },
          orderBy: { createdAt: "asc" },
        });
        assignedToId = member?.id ?? null;
      }

      const rfi = await db.rfi.create({
        data: {
          projectId: input.projectId,
          createdById: ctx.user.id,
          number: input.number,
          subject: input.subject,
          description: input.description ?? "",
          location: input.location ?? null,
          priority: input.priority,
          discipline: input.discipline,
          workDate: input.workDate ? new Date(input.workDate) : null,
          inspectionStartTime: input.inspectionStartTime ? new Date(input.inspectionStartTime) : null,
          inspectionEndTime: input.inspectionEndTime ? new Date(input.inspectionEndTime) : null,
          ganttTaskId: input.ganttTaskId ?? null,
          boqItemId: input.boqItemId ?? null,
          drawingId: input.drawingId ?? null,
          subcontractorId: input.subcontractorId ?? null,
          assignedToId,
          pinX: input.pinX ?? null,
          pinY: input.pinY ?? null,
          costImpact: input.costImpact,
          scheduleImpact: input.scheduleImpact,
          items: input.items.length ? { create: input.items } : undefined,
        },
        include: { items: { include: { boqItem: { select: { id: true, code: true, description: true, unit: true, rate: true } } } } },
      });

      await audit({
        userId: ctx.user.id,
        projectId: input.projectId,
        action: "rfi.create",
        entityType: "rfi",
        entityId: rfi.id,
        metadata: { number: rfi.number, subject: rfi.subject },
      });

      // Notify the assigned member (if any) that a new RFI was created
      if (assignedToId) {
        const assignee = await db.projectMember.findUnique({
          where: { id: assignedToId },
          select: { userId: true },
        });
        if (assignee && assignee.userId !== ctx.user.id) {
          await createNotification({
            userId: assignee.userId,
            projectId: input.projectId,
            type: "rfi_created",
            title: `New RFI assigned: ${rfi.number}`,
            message: `${rfi.subject}${input.priority === "urgent" || input.priority === "high" ? ` (Priority: ${input.priority})` : ""}`,
            metadata: { rfiId: rfi.id, number: rfi.number, entityType: "rfi", entityId: rfi.id },
            postToChannel: true,
          });
        }
      }

      return { rfi };
    }),

  /** Update/PATCH RFI. */
  update: protectedProcedure
    .input(UpdateRfiSchema)
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      const rfi = await db.rfi.findUnique({ where: { id }, select: { projectId: true, status: true, number: true } });
      if (!rfi) throw new TRPCError({ code: "NOT_FOUND", message: "RFI not found." });

      const role = await assertCanWrite(ctx.user, rfi.projectId);
      const isWriter = role === "project_manager" || role === "coordinator" || role === "engineer";
      const isAdmin = role === "project_manager" || role === "coordinator";

      const updateData: Record<string, any> = {};
      if (rfi.status === "draft" && isWriter) {
        if (data.subject !== undefined) updateData.subject = data.subject;
        if (data.description !== undefined) updateData.description = data.description;
        if (data.priority !== undefined) updateData.priority = data.priority;
        if (data.discipline !== undefined) updateData.discipline = data.discipline;
        if (data.workDate !== undefined) updateData.workDate = data.workDate ? new Date(data.workDate) : null;
        if (data.inspectionStartTime !== undefined) updateData.inspectionStartTime = data.inspectionStartTime ? new Date(data.inspectionStartTime) : null;
        if (data.inspectionEndTime !== undefined) updateData.inspectionEndTime = data.inspectionEndTime ? new Date(data.inspectionEndTime) : null;
        if (data.ganttTaskId !== undefined) updateData.ganttTaskId = data.ganttTaskId || null;
        if (data.boqItemId !== undefined) updateData.boqItemId = data.boqItemId || null;
        if (data.drawingId !== undefined) updateData.drawingId = data.drawingId || null;
        if (data.subcontractorId !== undefined) updateData.subcontractorId = data.subcontractorId || null;
        if (data.location !== undefined) updateData.location = data.location || null;
        if (data.assignedToId !== undefined) updateData.assignedToId = data.assignedToId ?? null;
        if (data.pinX !== undefined) updateData.pinX = data.pinX ?? null;
        if (data.pinY !== undefined) updateData.pinY = data.pinY ?? null;
        if (data.costImpact !== undefined) updateData.costImpact = data.costImpact;
        if (data.scheduleImpact !== undefined) updateData.scheduleImpact = data.scheduleImpact;

        if (data.items !== undefined && rfi.status === "draft" && isWriter) {
          // Single source of truth for item replacement — see replaceRfiItems.
          await replaceRfiItems(id, data.items);
        }
      }

      if (data.status !== undefined && data.status !== rfi.status) {
        const transition = `${rfi.status}→${data.status}`;
        // Declarative graph check (state-machine.ts) + role gate: writers
        // may submit a draft; only admins may decide/close.
        if (!canTransition("rfi", rfi.status, data.status).allowed) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Invalid status transition ${transition}.`,
          });
        }
        const needsAdmin = data.status !== "submitted";
        if (needsAdmin ? !isAdmin : !isWriter) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Status transition ${transition} is not permitted for your role.`,
          });
        }
        if (data.status === "submitted") updateData.submittedAt = new Date();
        if (["approved", "rejected", "closed"].includes(data.status)) {
          updateData.respondedAt = new Date();
        }
      }

      const statusChange =
        data.status !== undefined && data.status !== rfi.status;
      const fieldUpdateData = { ...updateData };
      if (statusChange) delete fieldUpdateData.status; // engine owns the status column (CAS)

      const updated = statusChange
        ? (
            await transitionEntityState(db, {
              model: "rfi",
              id,
              projectId: rfi.projectId,
              targetState: data.status!,
              additionalData: fieldUpdateData,
              userId: ctx.user.id,
              userName: ctx.user.name,
              skipEventEmit: true, // explicit notifications below
            })
          ).entity
        : await db.rfi.update({ where: { id }, data: updateData });

      // Notify on submit — PMs and coordinators need to review (internal + channel)
      if (data.status === "submitted" && rfi.status !== "submitted") {
        await notifyProject({
          projectId: rfi.projectId,
          type: "rfi_submitted",
          title: `RFI submitted for review: ${rfi.number}`,
          message: `${updated.subject} — awaiting your response.`,
          metadata: { rfiId: id, number: rfi.number, entityType: "rfi", entityId: id },
          excludeUserId: ctx.user.id,
          postToChannel: true,
        });
      }

      // Notify the RFI creator when their RFI is approved/rejected/closed (internal + channel)
      if (["approved", "rejected", "closed"].includes(data.status as string) &&
          rfi.status !== data.status) {
        const creator = await db.rfi.findUnique({
          where: { id },
          select: { createdById: true, subject: true },
        });
        if (creator && creator.createdById !== ctx.user.id) {
          await createNotification({
            userId: creator.createdById,
            projectId: rfi.projectId,
            type: `rfi_${data.status}`,
            title: `RFI ${data.status}: ${rfi.number}`,
            message: `${creator.subject} has been ${data.status}.`,
            metadata: { rfiId: id, number: rfi.number, entityType: "rfi", entityId: id },
            postToChannel: true,
          });
        }
      }

      // NOTE: items are replaced inside the draft block above (single source
      // of truth via `replaceRfiItems`). The duplicate block that previously
      // lived here was removed — it ran immediately after the first one,
      // silently coerced `quantity: 0` to `null`, and doubled the write load.

      // Auto-add approved RFI to daily program if workDate is set
      if (data.status === "approved" && rfi.status !== "approved") {
        const approvedRfi = await db.rfi.findUnique({
          where: { id },
          select: { workDate: true, subject: true, location: true, ganttTaskId: true, items: { include: { boqItem: { select: { id: true, code: true, description: true, unit: true } } } } },
        });
        if (approvedRfi?.workDate) {
          const programDate = new Date(approvedRfi.workDate);
          programDate.setHours(0, 0, 0, 0);
          let program = await db.dailyProgram.findFirst({
            where: { projectId: rfi.projectId, programDate },
          });
          if (!program) {
            program = await db.dailyProgram.create({
              data: { projectId: rfi.projectId, programDate, status: "draft" },
            });
          }
          const existingTask = await db.dailyProgramTask.findFirst({
            where: { rfiId: id, programId: program.id },
          });
          if (!existingTask) {
            const rfiItems = approvedRfi.items || [];
            if (rfiItems.length > 0) {
              await db.dailyProgramTask.createMany({
                  data: rfiItems.map((item: any) => ({
                    programId: program.id,
                    rfiId: id,
                    rfiItemId: item.id,
                    taskName: `${approvedRfi.subject}${item.boqDesc ? ` - ${item.boqDesc}` : ""}`.trim(),
                    location: approvedRfi.location,
                    ganttTaskId: approvedRfi.ganttTaskId,
                    boqItemId: item.boqItemId,
                  boqCode: item.boqCode,
                  boqDesc: item.boqDesc,
                  plannedQty: item.quantity || 0,
                  unit: item.unit,
                  paymentType: item.paymentType || "payable",
                })),
              });
            } else {
              await db.dailyProgramTask.create({
                  data: {
                    programId: program.id,
                    rfiId: id,
                    taskName: approvedRfi.subject,
                    location: approvedRfi.location,
                    ganttTaskId: approvedRfi.ganttTaskId,
                    plannedQty: 0,
                },
              });
            }
          }
        }
      }

      await audit({
        userId: ctx.user.id,
        projectId: rfi.projectId,
        action: "rfi.update",
        entityType: "rfi",
        entityId: id,
        metadata: {
          number: rfi.number,
          changes: updateData,
          // Include the items array snapshot so the audit trail can
          // reconstruct what BOQ items were on the RFI at this point.
          // Previously the items array went through a delete+recreate path
          // with NO audit entry, making historical reconstruction impossible.
          itemsSnapshot: snapshotRfiItems(data.items as any),
        },
      });

      return { rfi: updated };
    }),

  /** Delete RFI. */
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const rfi = await db.rfi.findUnique({
        where: { id: input.id },
        select: { id: true, projectId: true, status: true, createdById: true, number: true },
      });
      if (!rfi) throw new TRPCError({ code: "NOT_FOUND", message: "RFI not found." });

      const role = await assertCanWrite(ctx.user, rfi.projectId);
      const isAuthor = rfi.createdById === ctx.user.id;
      const isPm = role === "project_manager";

      if (!isPm && !isAuthor) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only the author or a Project Manager can delete RFIs." });
      }
      if (isAuthor && !isPm && rfi.status !== "draft") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "You can only delete your own draft RFIs." });
      }

      // Remove related program tasks first (prevents orphaned tasks with null rfiId)
      await db.dailyProgramTask.deleteMany({ where: { rfiId: input.id } });

      // Clean up any attachment files in object storage before deleting the
      // DB rows. Previously the cascade delete would remove the rows but
      // leave the uploaded files orphaned in public/uploads/ or S3 forever.
      const attachments = await db.rfiAttachment.findMany({
        where: { rfiId: input.id },
        select: { storageUrl: true },
      });
      for (const att of attachments) {
        if (att.storageUrl) {
          await deleteFile(att.storageUrl).catch(() => {
            /* best-effort — don't block the delete if storage cleanup fails */
          });
        }
      }

      await db.rfi.delete({ where: { id: input.id } });

      await audit({
        userId: ctx.user.id,
        projectId: rfi.projectId,
        action: "rfi.delete",
        entityType: "rfi",
        entityId: input.id,
        metadata: { number: rfi.number },
      });

      return { ok: true };
    }),

  /** Respond to an RFI.
   *
   *  Status transition semantics:
   *    - decision="approved"        → status becomes "approved"
   *    - decision="rejected"         → status becomes "rejected"
   *    - decision="info" | "clarifications_requested" → status stays "submitted"
   *
   *  The "info" / "clarifications_requested" decisions intentionally keep
   *  the RFI in `submitted` state — they record a responder note without
   *  closing the RFI. This bypasses the `update` route's transition
   *  whitelist (which doesn't include `submitted→submitted`) by design:
   *  the respond route is a separate, admin-only path with its own audit
   *  trail. Both routes write to the same audit log, so transitions are
   *  still reconstructable.
   */
  respond: protectedProcedure
    .input(RespondSchema)
    .mutation(async ({ ctx, input }) => {
      const rfi = await db.rfi.findUnique({
        where: { id: input.id },
        select: { id: true, projectId: true, status: true, number: true },
      });
      if (!rfi) throw new TRPCError({ code: "NOT_FOUND", message: "RFI not found." });

      await assertProjectAdmin(ctx.user, rfi.projectId);
      if (rfi.status !== "submitted") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Only submitted RFIs can be responded to." });
      }

      // Converted from array-form $transaction (RLS phase 3c): array form
      // cannot run set_config, and Rfi is now FORCE-scoped — the update
      // would fail closed on a context-less connection.
      const [response] = await db.$transaction(async (tx) => {
        await withOrgContext(tx, ctx.user.organizationId, !!ctx.user.isSuperAdmin); // RLS: Rfi is FORCE-scoped
        const created = await tx.rfiResponse.create({
          data: {
            rfiId: input.id,
            responderId: ctx.user.id,
            response: input.response,
            decision: input.decision,
          },
        });
        if (input.decision === "approved" || input.decision === "rejected") {
          // Engine transition: CAS on the submitted status — a concurrent
          // decision can no longer double-write or double-notify.
          await transitionEntityState(tx, {
            model: "rfi",
            id: input.id,
            projectId: rfi.projectId,
            targetState: input.decision,
            additionalData: { respondedAt: new Date() },
            userId: ctx.user.id,
            userName: ctx.user.name,
            skipEventEmit: true, // explicit creator notification below
          });
        } else {
          // Info / clarifications_requested: RFI stays submitted (no graph
          // transition) — record the response with a CAS guard so a
          // concurrent decision can't be silently overwritten.
          const claimed = await tx.rfi.updateMany({
            where: { id: input.id, status: "submitted" },
            data: { respondedAt: new Date() },
          });
          if (claimed.count === 0) {
            throw new TRPCError({
              code: "CONFLICT",
              message: "RFI status just changed — reload and retry.",
            });
          }
        }
        return [created] as const;
      });

      await audit({
        userId: ctx.user.id,
        projectId: rfi.projectId,
        action: "rfi.respond",
        entityType: "rfi",
        entityId: input.id,
        metadata: { number: rfi.number, decision: input.decision },
      });

      // Notify the RFI creator that a response was recorded
      const creator = await db.rfi.findUnique({
        where: { id: input.id },
        select: { createdById: true, subject: true },
      });
      if (creator && creator.createdById !== ctx.user.id) {
        await createNotification({
          userId: creator.createdById,
          projectId: rfi.projectId,
          type: `rfi_response_${input.decision}`,
          title: `RFI response: ${rfi.number}`,
          message: `${creator.subject} — decision: ${input.decision.replace("_", " ")}`,
          metadata: { rfiId: input.id, number: rfi.number, decision: input.decision },
        });
      }

      return { response };
    }),

  /** Get project members who can be assigned to RFIs (PM, coordinator, engineer). */
  assignableMembers: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);
      const members = await db.projectMember.findMany({
        where: { projectId: input.projectId, role: { in: ["project_manager", "coordinator", "engineer"] } },
        select: { id: true, role: true, user: { select: { id: true, name: true, email: true, role: true } } },
        orderBy: { user: { name: "asc" } },
         take: 1000, // bounded (pagination sweep) — see src/lib/pagination.ts
       });
      return { members };
    }),

  /** Upload a file attachment to an RFI. */
  uploadAttachment: protectedProcedure
    .input(z.object({
      rfiId: z.string(),
      fileName: z.string().min(1),
      fileType: z.string().min(1),
      fileSize: z.number().int().positive().max(10 * 1024 * 1024),
      data: z.string().min(1).max(14 * 1024 * 1024), // base64-encoded file content
    }))
    .mutation(async ({ ctx, input }) => {
      const rfi = await db.rfi.findUnique({
        where: { id: input.rfiId },
        select: { projectId: true, project: { select: { organizationId: true } } },
      });
      if (!rfi) throw new TRPCError({ code: "NOT_FOUND", message: "RFI not found." });
      // DIRECTION FIX (audit §4): uploading an attachment is a WRITE —
      // assertProjectMember admitted read-only roles (client/inspector).
      await assertCanWrite(ctx.user, rfi.projectId);

      // MIME whitelist — prevents upload of executable / script-bearing
      // formats that could be served back as active content.
      assertAllowedAttachmentType(input.fileType);

      // Upload to storage — registered to the owning org so
      // /api/files/[key] can enforce tenant isolation (audit C-4).
      const orgId = rfi.project.organizationId ?? ctx.user.organizationId;
      if (!orgId) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Project has no owning organization; cannot register stored file." });
      }
      const stored = await uploadFile(input.data, input.fileName, input.fileType, {
        organizationId: orgId,
        projectId: rfi.projectId,
      });

      const attachment = await db.rfiAttachment.create({
        data: {
          rfiId: input.rfiId,
          fileName: input.fileName,
          fileType: input.fileType,
          fileSize: input.fileSize,
          data: input.data,
          storageUrl: stored.url,
          uploadedById: ctx.user.id,
        },
      });

      await audit({
        userId: ctx.user.id,
        projectId: rfi.projectId,
        action: "rfi.uploadAttachment",
        entityType: "rfi_attachment",
        entityId: attachment.id,
        metadata: { rfiId: input.rfiId, fileName: input.fileName, fileSize: input.fileSize, fileType: input.fileType },
      });

      return { attachment };
    }),

  /** Delete an attachment. */
  deleteAttachment: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const att = await db.rfiAttachment.findUnique({ where: { id: input.id }, include: { rfi: { select: { projectId: true } } } });
      if (!att) throw new TRPCError({ code: "NOT_FOUND", message: "Attachment not found." });
      // Use assertCanWrite (not assertProjectMember) so read-only roles
      // (client / inspector) cannot delete other users' attachments.
      await assertCanWrite(ctx.user, att.rfi.projectId);

      // Clean up the file in object storage — previously only the DB
      // row was deleted, leaving the uploaded file orphaned.
      if (att.storageUrl) {
        await deleteFile(att.storageUrl).catch(() => {
          /* best-effort — don't block the delete if storage cleanup fails */
        });
      }

      await db.rfiAttachment.delete({ where: { id: input.id } });

      await audit({
        userId: ctx.user.id,
        projectId: att.rfi.projectId,
        action: "rfi.deleteAttachment",
        entityType: "rfi_attachment",
        entityId: input.id,
        metadata: { rfiId: att.rfiId, fileName: att.fileName },
      });

      return { success: true };
    }),

  /** Add a comment to an RFI (threaded — parentId for replies). */
  addComment: protectedProcedure
    .input(z.object({
      rfiId: z.string(),
      content: z.string().min(1).max(5000),
      parentId: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const rfi = await db.rfi.findUnique({ where: { id: input.rfiId }, select: { projectId: true } });
      if (!rfi) throw new TRPCError({ code: "NOT_FOUND", message: "RFI not found." });
      await assertProjectMember(ctx.user, rfi.projectId);

      const comment = await db.rfiComment.create({
        data: {
          rfiId: input.rfiId,
          authorId: ctx.user.id,
          content: input.content,
          parentId: input.parentId ?? null,
        },
        include: { author: { select: { id: true, name: true } } },
      });

      await audit({
        userId: ctx.user.id,
        projectId: rfi.projectId,
        action: "rfi.addComment",
        entityType: "rfi_comment",
        entityId: comment.id,
        metadata: { rfiId: input.rfiId, parentId: input.parentId ?? null, contentLength: input.content.length },
      });

      return { comment };
    }),

  /** Delete a comment. */
  deleteComment: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const comment = await db.rfiComment.findUnique({ where: { id: input.id }, include: { rfi: { select: { projectId: true } } } });
      if (!comment) throw new TRPCError({ code: "NOT_FOUND", message: "Comment not found." });
      await assertProjectMember(ctx.user, comment.rfi.projectId);
      if (comment.authorId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "You can only delete your own comments." });
      await db.rfiComment.delete({ where: { id: input.id } });

      await audit({
        userId: ctx.user.id,
        projectId: comment.rfi.projectId,
        action: "rfi.deleteComment",
        entityType: "rfi_comment",
        entityId: input.id,
        metadata: { rfiId: comment.rfiId },
      });

      return { success: true };
    }),

  /** Bulk create RFIs from CSV/JSON array. */
  bulkCreate: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      rfis: z.array(z.object({
        number: z.string().min(1).max(50),
        subject: z.string().min(1).max(300),
        description: z.string().max(5000).default(""),
        location: z.string().max(500).optional(),
        priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
        discipline: z.enum(["civil", "structural", "electrical", "mechanical", "architectural", "none"]).optional(),
        workDate: z.string().optional(),
        costImpact: z.boolean().default(false),
        scheduleImpact: z.boolean().default(false),
        status: z.enum(["draft", "submitted"]).default("draft"),
      })).min(1).max(500),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertCanWrite(ctx.user, input.projectId);
      const created = await db.rfi.createManyAndReturn({
        data: input.rfis.map((r) => ({
          projectId: input.projectId,
          createdById: ctx.user.id,
          number: r.number,
          subject: r.subject,
          description: r.description,
          location: r.location ?? null,
          priority: r.priority,
          discipline: r.discipline === "none" ? null : r.discipline ?? null,
          workDate: r.workDate ? new Date(r.workDate) : null,
          costImpact: r.costImpact,
          scheduleImpact: r.scheduleImpact,
          status: r.status,
        })),
      });

      await audit({
        userId: ctx.user.id,
        projectId: input.projectId,
        action: "rfi.bulkCreate",
        entityType: "rfi",
        entityId: input.projectId,
        metadata: { count: created.length, numbers: created.map((r: any) => r.number) },
      });

      return { count: created.length };
    }),

  /** Search past RFIs (knowledge base) matching subject/description/discipline. */
  searchSimilar: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      subject: z.string().optional(),
      description: z.string().optional(),
      discipline: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);
      const terms = [input.subject, input.description].filter(Boolean).join(" ").toLowerCase().split(/\s+/).filter(Boolean);
      if (terms.length === 0) return { rfis: [] };

      const rfis = await db.rfi.findMany({
        where: {
          projectId: input.projectId,
          status: { not: "draft" },
          ...(input.discipline && input.discipline !== "none" && { discipline: input.discipline }),
          OR: terms.map((t) => ({
            OR: [
              { subject: { contains: t } },
              { description: { contains: t } },
            ],
          })),
        },
        take: 5,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          number: true,
          subject: true,
          discipline: true,
          status: true,
          createdAt: true,
          responses: {
            take: 1,
            orderBy: { createdAt: "desc" },
            select: { decision: true, response: true, createdAt: true },
          },
          createdBy: { select: { name: true } },
        },
      });
      return { rfis };
    }),

  /** Get count of RFIs created on a specific date for unique number generation. */
  countAll: protectedProcedure
    .input(z.object({ projectId: z.string(), dateStr: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);
      const prefix = `RFI-${input.dateStr}-`;
      const count = await db.rfi.count({
        where: {
          projectId: input.projectId,
          number: { startsWith: prefix },
        },
      });
      return { count };
    }),
});
