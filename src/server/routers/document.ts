/**
 * tRPC router for Documents and Drawings.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "@/server/trpc";
import { db } from "@/lib/db";
import { assertProjectMember, assertCanWrite } from "@/lib/authz";
import { audit } from "@/lib/audit";

const CreateDocSchema = z.object({
  projectId: z.string(),
  number: z.string().min(1),
  title: z.string().min(1),
  type: z.string().default("general"),
  discipline: z.string().optional(),
  revision: z.string().default("A"),
  issuedDate: z.string().datetime().optional(),
  receivedFrom: z.string().optional(),
});

const UpdateDocSchema = z.object({
  itemId: z.string(),
  title: z.string().optional(),
  type: z.string().optional(),
  discipline: z.string().nullable().optional(),
  status: z.string().optional(),
  revision: z.string().optional(),
  receivedFrom: z.string().nullable().optional(),
});

const CreateDrawingSchema = z.object({
  projectId: z.string(),
  number: z.string().min(1),
  title: z.string().min(1),
  discipline: z.string().optional(),
  revision: z.string().default("A"),
  issuedDate: z.string().datetime().optional(),
  fileData: z.string().optional(),
  fileName: z.string().optional(),
  fileType: z.string().optional(),
  ganttTaskId: z.string().optional(),
});

const UpdateDrawingSchema = z.object({
  itemId: z.string(),
  title: z.string().optional(),
  discipline: z.string().nullable().optional(),
  status: z.string().optional(),
  revision: z.string().optional(),
  scaleValue: z.number().nullable().optional(),
  scaleUnit: z.string().nullable().optional(),
});

export const documentRouter = router({
  /** List documents & transmittals for a project. */
  listDocuments: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      type: z.string().optional().nullable(),
      q: z.string().optional().nullable(),
    }))
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);
      const queryStr = input.q?.toLowerCase();

      const documents = await db.document.findMany({
        where: {
          projectId: input.projectId,
          ...(input.type && input.type !== "all" && { type: input.type }),
          ...(queryStr && {
            OR: [{ number: { contains: queryStr } }, { title: { contains: queryStr } }],
          }),
        },
        orderBy: { createdAt: "desc" },
        include: { _count: { select: { revisions: true } } },
      });

      const transmittals = await db.transmittal.findMany({
        where: { projectId: input.projectId },
        orderBy: { date: "desc" },
        include: { _count: { select: { items: true } } },
      });

      return { documents, transmittals };
    }),

  /** Create a document. */
  createDocument: protectedProcedure
    .input(CreateDocSchema)
    .mutation(async ({ ctx, input }) => {
      const { projectId, ...data } = input;
      await assertCanWrite(ctx.user, projectId);
      const doc = await db.document.create({
        data: {
          projectId,
          number: data.number,
          title: data.title,
          type: data.type,
          discipline: data.discipline,
          revision: data.revision,
          issuedDate: data.issuedDate ? new Date(data.issuedDate) : null,
          receivedFrom: data.receivedFrom,
        },
      });
      return { document: doc };
    }),

  /** Update a document. */
  updateDocument: protectedProcedure
    .input(UpdateDocSchema)
    .mutation(async ({ ctx, input }) => {
      const { itemId, ...data } = input;
      const item = await db.document.findUnique({ where: { id: itemId }, select: { projectId: true } });
      if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Document not found." });
      await assertCanWrite(ctx.user, item.projectId);

      const updated = await db.document.update({ where: { id: itemId }, data });
      return { document: updated };
    }),

  /** Delete a document. */
  deleteDocument: protectedProcedure
    .input(z.object({ itemId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const item = await db.document.findUnique({ where: { id: input.itemId }, select: { projectId: true } });
      if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Document not found." });
      await assertCanWrite(ctx.user, item.projectId);

      await db.document.delete({ where: { id: input.itemId } });
      return { ok: true };
    }),

  /** List drawings for a project. */
  listDrawings: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      discipline: z.string().optional().nullable(),
      q: z.string().optional().nullable(),
      setId: z.string().optional().nullable(),
    }))
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);
      const queryStr = input.q?.toLowerCase();

      const drawings = await db.drawing.findMany({
        where: {
          projectId: input.projectId,
          ...(input.discipline && input.discipline !== "all" && { discipline: input.discipline }),
          ...(input.setId === "none" && { drawingSetId: null }),
          ...(input.setId && input.setId !== "none" && input.setId !== "all" && { drawingSetId: input.setId }),
          ...(queryStr && {
            OR: [{ number: { contains: queryStr } }, { title: { contains: queryStr } }],
          }),
        },
        orderBy: { createdAt: "desc" },
        select: {
          id: true, number: true, title: true, discipline: true, status: true,
          revision: true, issuedDate: true, fileName: true, fileType: true,
          ganttTaskId: true, approvalStatus: true, approvedAt: true, approvalNotes: true,
          createdById: true, createdAt: true, updatedAt: true, drawingSetId: true,
          ganttTask: { select: { id: true, code: true, name: true } },
          drawingSet: { select: { id: true, name: true } },
          _count: { select: { revisions: true, rfis: true } },
        },
      });

      return { drawings };
    }),

  /** Create a drawing. */
  createDrawing: protectedProcedure
    .input(CreateDrawingSchema)
    .mutation(async ({ ctx, input }) => {
      const { projectId, ...data } = input;
      await assertCanWrite(ctx.user, projectId);
      const drawing = await db.drawing.create({
        data: {
          projectId,
          number: data.number,
          title: data.title,
          discipline: data.discipline,
          revision: data.revision,
          issuedDate: data.issuedDate ? new Date(data.issuedDate) : null,
          fileData: data.fileData,
          fileName: data.fileName,
          fileType: data.fileType,
          ganttTaskId: data.ganttTaskId || null,
          createdById: ctx.user.id,
        },
      });

      // Also create the first revision record for audit trail
      await db.drawingRevision.create({
        data: {
          drawingId: drawing.id,
          revision: data.revision,
          issuedDate: data.issuedDate ? new Date(data.issuedDate) : new Date(),
          description: "Initial upload",
          issuedBy: ctx.user.name,
          fileData: data.fileData,
          fileName: data.fileName,
          fileType: data.fileType,
          createdById: ctx.user.id,
        },
      });

      return { drawing };
    }),

  /** Update a drawing. */
  updateDrawing: protectedProcedure
    .input(UpdateDrawingSchema)
    .mutation(async ({ ctx, input }) => {
      const { itemId, ...data } = input;
      const item = await db.drawing.findUnique({ where: { id: itemId }, select: { projectId: true } });
      if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Drawing not found." });
      await assertCanWrite(ctx.user, item.projectId);

      const updated = await db.drawing.update({ where: { id: itemId }, data });
      return { drawing: updated };
    }),

  /** Delete a drawing. */
  deleteDrawing: protectedProcedure
    .input(z.object({ itemId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const item = await db.drawing.findUnique({ where: { id: input.itemId }, select: { projectId: true } });
      if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Drawing not found." });
      await assertCanWrite(ctx.user, item.projectId);

      await db.drawing.delete({ where: { id: input.itemId } });
      return { ok: true };
    }),

  /** Get a single drawing with full revision history and linked RFIs. */
  getDrawing: protectedProcedure
    .input(z.object({ drawingId: z.string() }))
    .query(async ({ ctx, input }) => {
      const drawing = await db.drawing.findUnique({
        where: { id: input.drawingId },
        include: {
          ganttTask: { select: { id: true, code: true, name: true } },
          revisions: {
            orderBy: { issuedDate: "desc" },
          },
          rfis: {
            select: { id: true, number: true, subject: true, status: true, pinX: true, pinY: true },
            orderBy: { createdAt: "desc" },
          },
        },
      });
      if (!drawing) throw new TRPCError({ code: "NOT_FOUND", message: "Drawing not found." });
      await assertProjectMember(ctx.user, drawing.projectId);
      return { drawing };
    }),

  /** Add a new revision to a drawing — creates revision record + updates the drawing's current file. */
  addRevision: protectedProcedure
    .input(z.object({
      drawingId: z.string(),
      revision: z.string().min(1),
      description: z.string().optional(),
      fileData: z.string().optional(),
      fileName: z.string().optional(),
      fileType: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const drawing = await db.drawing.findUnique({
        where: { id: input.drawingId },
        select: { projectId: true, number: true },
      });
      if (!drawing) throw new TRPCError({ code: "NOT_FOUND", message: "Drawing not found." });
      await assertCanWrite(ctx.user, drawing.projectId);

      // Create revision record
      const rev = await db.drawingRevision.create({
        data: {
          drawingId: input.drawingId,
          revision: input.revision,
          description: input.description || null,
          issuedBy: ctx.user.name,
          fileData: input.fileData || null,
          fileName: input.fileName || null,
          fileType: input.fileType || null,
          createdById: ctx.user.id,
        },
      });

      // Update drawing's current revision + file
      await db.drawing.update({
        where: { id: input.drawingId },
        data: {
          revision: input.revision,
          fileData: input.fileData || undefined,
          fileName: input.fileName || undefined,
          fileType: input.fileType || undefined,
          issuedDate: new Date(),
          approvalStatus: "pending", // new revision needs re-approval
          approvedAt: null,
          approvedById: null,
          approvalNotes: null,
        },
      });

      await audit({
        userId: ctx.user.id,
        projectId: drawing.projectId,
        action: "drawing.add_revision",
        entityType: "drawing",
        entityId: input.drawingId,
        metadata: { number: drawing.number, revision: input.revision },
      });

      return { revision: rev };
    }),

  /** Approve or reject a drawing (internal / consultant / client). */
  approveDrawing: protectedProcedure
    .input(z.object({
      drawingId: z.string(),
      approvalStatus: z.enum(["approved_internal", "approved_consultant", "approved_client", "rejected"]),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const drawing = await db.drawing.findUnique({
        where: { id: input.drawingId },
        select: { projectId: true, number: true },
      });
      if (!drawing) throw new TRPCError({ code: "NOT_FOUND", message: "Drawing not found." });
      await assertCanWrite(ctx.user, drawing.projectId);

      const updated = await db.drawing.update({
        where: { id: input.drawingId },
        data: {
          approvalStatus: input.approvalStatus,
          approvedAt: input.approvalStatus === "rejected" ? null : new Date(),
          approvedById: input.approvalStatus === "rejected" ? null : ctx.user.id,
          approvalNotes: input.notes || null,
        },
      });

      await audit({
        userId: ctx.user.id,
        projectId: drawing.projectId,
        action: `drawing.approve.${input.approvalStatus}`,
        entityType: "drawing",
        entityId: input.drawingId,
        metadata: { number: drawing.number, notes: input.notes },
      });

      return { drawing: updated };
    }),

  /** Create an RFI directly from a drawing — pre-fills the drawing reference. */
  createRfiFromDrawing: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      drawingId: z.string(),
      subject: z.string().min(1),
      description: z.string().optional(),
      pinX: z.number().min(0).max(1).optional(),
      pinY: z.number().min(0).max(1).optional(),
      priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertCanWrite(ctx.user, input.projectId);

      // Generate RFI number
      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      const countData = await db.rfi.count({ where: { projectId: input.projectId, createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } } });
      const rfiNumber = `RFI-${dateStr}-${String(countData + 1).padStart(3, "0")}`;

      const rfi = await db.rfi.create({
        data: {
          projectId: input.projectId,
          createdById: ctx.user.id,
          number: rfiNumber,
          subject: input.subject,
          description: input.description || `RFI raised from drawing. See drawing for pin location.`,
          drawingId: input.drawingId,
          pinX: input.pinX ?? null,
          pinY: input.pinY ?? null,
          priority: input.priority,
        },
      });

      await audit({
        userId: ctx.user.id,
        projectId: input.projectId,
        action: "rfi.create_from_drawing",
        entityType: "rfi",
        entityId: rfi.id,
        metadata: { number: rfiNumber, drawingId: input.drawingId },
      });

      return { rfi };
    }),

  /** Get revisions for a drawing — used for revision selector dropdown. */
  getRevisions: protectedProcedure
    .input(z.object({ drawingId: z.string() }))
    .query(async ({ ctx, input }) => {
      const drawing = await db.drawing.findUnique({
        where: { id: input.drawingId },
        select: { projectId: true, number: true, revision: true },
      });
      if (!drawing) throw new TRPCError({ code: "NOT_FOUND", message: "Drawing not found." });
      await assertProjectMember(ctx.user, drawing.projectId);

      const revisions = await db.drawingRevision.findMany({
        where: { drawingId: input.drawingId },
        orderBy: { issuedDate: "desc" },
        select: {
          id: true, revision: true, issuedDate: true, description: true,
          issuedBy: true, approvalStatus: true, fileName: true, fileType: true,
          createdAt: true,
        },
      });

      // Suggest next revision letter
      const usedLetters = revisions.map(r => r.revision.toUpperCase());
      let nextRevision = "A";
      if (usedLetters.length > 0) {
        // Find the highest letter and increment
        const lastLetter = usedLetters.sort().pop()!;
        if (/^[A-Z]$/.test(lastLetter)) {
          nextRevision = String.fromCharCode(lastLetter.charCodeAt(0) + 1);
        } else {
          // Numeric revision — increment
          const num = parseInt(lastLetter);
          if (!isNaN(num)) nextRevision = String(num + 1).padStart(2, "0");
        }
      }

      return { revisions, nextRevision, drawingNumber: drawing.number };
    }),

  /** Get a specific revision's file data (base64) for the viewer. */
  getRevisionFile: protectedProcedure
    .input(z.object({ revisionId: z.string() }))
    .query(async ({ ctx, input }) => {
      const rev = await db.drawingRevision.findUnique({
        where: { id: input.revisionId },
        include: { drawing: { select: { projectId: true } } },
      });
      if (!rev) throw new TRPCError({ code: "NOT_FOUND", message: "Revision not found." });
      await assertProjectMember(ctx.user, rev.drawing.projectId);

      return {
        fileData: rev.fileData,
        fileName: rev.fileName,
        fileType: rev.fileType,
        revision: rev.revision,
        description: rev.description,
      };
    }),

  // ─────────────────────────────────────────────────────────
  // DRAWING MARKUPS — annotations overlaid on drawings
  // ─────────────────────────────────────────────────────────

  /** List markups for a drawing (optionally filtered by revision). */
  listMarkups: protectedProcedure
    .input(z.object({ drawingId: z.string(), revisionId: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const drawing = await db.drawing.findUnique({
        where: { id: input.drawingId },
        select: { projectId: true },
      });
      if (!drawing) throw new TRPCError({ code: "NOT_FOUND", message: "Drawing not found." });
      await assertProjectMember(ctx.user, drawing.projectId);

      const markups = await db.drawingMarkup.findMany({
        where: {
          drawingId: input.drawingId,
          ...(input.revisionId ? { OR: [{ revisionId: input.revisionId }, { revisionId: null }] } : {}),
        },
        orderBy: { createdAt: "desc" },
        select: {
          id: true, type: true, x: true, y: true, w: true, h: true,
          x2: true, y2: true, rotation: true, color: true, strokeWidth: true,
          opacity: true, text: true, points: true, stampType: true,
          linkedItemId: true, linkedItemType: true, createdById: true, createdAt: true,
        },
      });

      return { markups };
    }),

  /** Add a markup to a drawing. */
  addMarkup: protectedProcedure
    .input(z.object({
      drawingId: z.string(),
      revisionId: z.string().optional(),
      type: z.enum(["cloud", "arrow", "text", "pin", "highlight", "measurement", "freehand", "callout", "stamp", "area"]),
      x: z.number().min(0).max(1),
      y: z.number().min(0).max(1),
      w: z.number().optional(),
      h: z.number().optional(),
      x2: z.number().min(0).max(1).optional(),
      y2: z.number().min(0).max(1).optional(),
      rotation: z.number().optional(),
      color: z.string().default("#ef4444"),
      strokeWidth: z.number().optional(),
      opacity: z.number().optional(),
      text: z.string().optional(),
      points: z.string().optional(),
      stampType: z.string().optional(),
      linkedItemId: z.string().optional(),
      linkedItemType: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const drawing = await db.drawing.findUnique({
        where: { id: input.drawingId },
        select: { projectId: true },
      });
      if (!drawing) throw new TRPCError({ code: "NOT_FOUND", message: "Drawing not found." });
      await assertCanWrite(ctx.user, drawing.projectId);

      const markup = await db.drawingMarkup.create({
        data: {
          drawingId: input.drawingId,
          revisionId: input.revisionId || null,
          type: input.type,
          x: input.x,
          y: input.y,
          w: input.w || null,
          h: input.h || null,
          x2: input.x2 ?? null,
          y2: input.y2 ?? null,
          rotation: input.rotation || null,
          color: input.color,
          strokeWidth: input.strokeWidth ?? null,
          opacity: input.opacity ?? null,
          text: input.text || null,
          points: input.points || null,
          stampType: input.stampType || null,
          linkedItemId: input.linkedItemId || null,
          linkedItemType: input.linkedItemType || null,
          createdById: ctx.user.id,
        },
      });

      return { markup };
    }),

  /** Delete a markup. */
  deleteMarkup: protectedProcedure
    .input(z.object({ markupId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const markup = await db.drawingMarkup.findUnique({
        where: { id: input.markupId },
        include: { drawing: { select: { projectId: true } } },
      });
      if (!markup) throw new TRPCError({ code: "NOT_FOUND", message: "Markup not found." });
      await assertCanWrite(ctx.user, markup.drawing.projectId);

      await db.drawingMarkup.delete({ where: { id: input.markupId } });
      return { ok: true };
    }),

  // ─────────────────────────────────────────────────────────
  // DRAWING SETS — group drawings
  // ─────────────────────────────────────────────────────────

  /** List drawing sets for a project. */
  listSets: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);

      const sets = await db.drawingSet.findMany({
        where: { projectId: input.projectId },
        include: { _count: { select: { drawings: true } } },
        orderBy: { name: "asc" },
      });

      return { sets };
    }),

  /** Create a drawing set. */
  createSet: protectedProcedure
    .input(z.object({ projectId: z.string(), name: z.string().min(1), description: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      await assertCanWrite(ctx.user, input.projectId);
      const set = await db.drawingSet.create({
        data: { projectId: input.projectId, name: input.name, description: input.description || null },
      });
      return { set };
    }),

  /** Assign a drawing to a set. */
  assignToSet: protectedProcedure
    .input(z.object({ drawingId: z.string(), setId: z.string().nullable() }))
    .mutation(async ({ ctx, input }) => {
      const drawing = await db.drawing.findUnique({
        where: { id: input.drawingId },
        select: { projectId: true },
      });
      if (!drawing) throw new TRPCError({ code: "NOT_FOUND", message: "Drawing not found." });
      await assertCanWrite(ctx.user, drawing.projectId);

      await db.drawing.update({
        where: { id: input.drawingId },
        data: { drawingSetId: input.setId },
      });
      return { ok: true };
    }),
});
