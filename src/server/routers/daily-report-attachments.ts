/**
 * Daily report attachments tRPC router.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "@/server/trpc";
import { db } from "@/lib/db";
import { assertProjectMember, assertCanWrite } from "@/lib/authz";
import { audit } from "@/lib/audit";
import { uploadFile, deleteFile } from "@/lib/storage";
import { isAllowedAttachmentType } from "@/server/utils/workflow-helpers";

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

export const dailyReportAttachmentsRouter = router({
  listAttachments: protectedProcedure
    .input(z.object({ reportId: z.string() }))
    .query(async ({ ctx, input }) => {
      const report = await db.dailyReport.findUnique({
        where: { id: input.reportId },
        select: { projectId: true },
      });
      if (!report) throw new TRPCError({ code: "NOT_FOUND", message: "Report not found." });
      // DIRECTION FIX (audit §4): viewing report photos is a READ —
      // clients/inspectors legitimately see them; requiring write access
      // locked read-only roles out of their own reports.
      await assertProjectMember(ctx.user, report.projectId);

      // Select only metadata columns — NOT the `data` base64 column.
      // Previously this returned ALL columns, so listing attachments
      // pulled down every photo's base64 payload.
      const attachments = await db.dailyReportAttachment.findMany({
        where: { reportId: input.reportId },
        orderBy: { uploadedAt: "desc" },
        select: {
          id: true,
          reportId: true,
          fileName: true,
          fileType: true,
          fileSize: true,
          storageUrl: true,
          uploadedById: true,
          latitude: true,
          longitude: true,
          takenAt: true,
          uploadedAt: true,
        },
         take: 1000, // bounded (pagination sweep) — see src/lib/pagination.ts
       });
      return { attachments };
    }),

  uploadAttachment: protectedProcedure
    .input(
      z.object({
        reportId: z.string(),
        fileName: z.string().min(1),
        fileType: z.string().min(1),
        fileSize: z.number().int().positive().max(10 * 1024 * 1024),
        data: z.string().min(1).max(14 * 1024 * 1024), // base64
        latitude: z.number().optional(),
        longitude: z.number().optional(),
        takenAt: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const report = await db.dailyReport.findUnique({
        where: { id: input.reportId },
        select: { projectId: true, project: { select: { organizationId: true } } },
      });
      if (!report) throw new TRPCError({ code: "NOT_FOUND", message: "Report not found." });
      // Use assertCanWrite (not assertProjectMember) so read-only roles
      // (client / inspector) cannot upload attachments either.
      await assertCanWrite(ctx.user, report.projectId);

      // MIME whitelist — prevents upload of executable / script-bearing
      // formats that could be served back as active content (SVG XSS, etc.).
      assertAllowedAttachmentType(input.fileType);

      // Upload to storage — registered to the owning org so
      // /api/files/[key] can enforce tenant isolation (audit C-4).
      const orgId = report.project.organizationId ?? ctx.user.organizationId;
      if (!orgId) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Project has no owning organization; cannot register stored file." });
      }
      const stored = await uploadFile(input.data, input.fileName, input.fileType, {
        organizationId: orgId,
        projectId: report.projectId,
      });

      const attachment = await db.dailyReportAttachment.create({
        data: {
          reportId: input.reportId,
          fileName: input.fileName,
          fileType: input.fileType,
          fileSize: input.fileSize,
          data: input.data,
          storageUrl: stored.url,
          uploadedById: ctx.user.id,
          latitude: input.latitude ?? null,
          longitude: input.longitude ?? null,
          takenAt: input.takenAt ? new Date(input.takenAt) : null,
        },
      });

      await audit({
        userId: ctx.user.id,
        projectId: report.projectId,
        action: "daily_report.uploadAttachment",
        entityType: "daily_report_attachment",
        entityId: attachment.id,
        metadata: {
          reportId: input.reportId,
          fileName: input.fileName,
          fileSize: input.fileSize,
          fileType: input.fileType,
        },
      });

      return { attachment };
    }),

  /** Fetch the base64 `data` column for a single attachment.
   *
   *  Added so clients can download an attachment's binary content on
   *  demand — `listAttachments` and `getReport` now return only metadata.
   *  Previously every getReport call downloaded ALL attachments' base64
   *  payloads (could be 100+ MB for photo-heavy reports).
   */
  getAttachmentData: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const att = await db.dailyReportAttachment.findUnique({
        where: { id: input.id },
        select: { id: true, data: true, fileType: true, fileName: true, report: { select: { projectId: true } } },
      });
      if (!att) throw new TRPCError({ code: "NOT_FOUND", message: "Attachment not found." });
      // DIRECTION FIX (audit §4): read, not write (see listAttachments).
      await assertProjectMember(ctx.user, att.report.projectId);
      return { data: att.data, fileType: att.fileType, fileName: att.fileName };
    }),

  deleteAttachment: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const att = await db.dailyReportAttachment.findUnique({
        where: { id: input.id },
        include: { report: { select: { projectId: true } } },
      });
      if (!att) throw new TRPCError({ code: "NOT_FOUND", message: "Attachment not found." });
      // Use assertCanWrite (not assertProjectMember) so read-only roles
      // (client / inspector) cannot delete other users' attachments.
      await assertCanWrite(ctx.user, att.report.projectId);

      // Clean up the file in object storage — previously only the DB
      // row was deleted, leaving the uploaded file orphaned.
      if (att.storageUrl) {
        await deleteFile(att.storageUrl).catch(() => {
          /* best-effort — don't block the delete if storage cleanup fails */
        });
      }

      await db.dailyReportAttachment.delete({ where: { id: input.id } });

      await audit({
        userId: ctx.user.id,
        projectId: att.report.projectId,
        action: "daily_report.deleteAttachment",
        entityType: "daily_report_attachment",
        entityId: input.id,
        metadata: { reportId: att.reportId, fileName: att.fileName },
      });

      return { success: true };
    }),
});
