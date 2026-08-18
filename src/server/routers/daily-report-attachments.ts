/**
 * Daily report attachments tRPC router.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "@/server/trpc";
import { db } from "@/lib/db";
import { assertProjectMember } from "@/lib/authz";
import { uploadFile } from "@/lib/storage";

export const dailyReportAttachmentsRouter = router({
  listAttachments: protectedProcedure
    .input(z.object({ reportId: z.string() }))
    .query(async ({ ctx, input }) => {
      const report = await db.dailyReport.findUnique({
        where: { id: input.reportId },
        select: { projectId: true },
      });
      if (!report) throw new TRPCError({ code: "NOT_FOUND", message: "Report not found." });
      await assertProjectMember(ctx.user, report.projectId);

      const attachments = await db.dailyReportAttachment.findMany({
        where: { reportId: input.reportId },
        orderBy: { uploadedAt: "desc" },
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
      })
    )
    .mutation(async ({ ctx, input }) => {
      const report = await db.dailyReport.findUnique({
        where: { id: input.reportId },
        select: { projectId: true },
      });
      if (!report) throw new TRPCError({ code: "NOT_FOUND", message: "Report not found." });
      await assertProjectMember(ctx.user, report.projectId);

      const stored = await uploadFile(input.data, input.fileName, input.fileType);

      const attachment = await db.dailyReportAttachment.create({
        data: {
          reportId: input.reportId,
          fileName: input.fileName,
          fileType: input.fileType,
          fileSize: input.fileSize,
          data: input.data,
          storageUrl: stored.url,
          uploadedById: ctx.user.id,
        },
      });
      return { attachment };
    }),

  deleteAttachment: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const att = await db.dailyReportAttachment.findUnique({
        where: { id: input.id },
        include: { report: { select: { projectId: true } } },
      });
      if (!att) throw new TRPCError({ code: "NOT_FOUND", message: "Attachment not found." });
      await assertProjectMember(ctx.user, att.report.projectId);
      await db.dailyReportAttachment.delete({ where: { id: input.id } });
      return { success: true };
    }),
});
