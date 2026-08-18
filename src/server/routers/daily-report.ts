/**
 * tRPC router for Daily Reports.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, mergeRouters } from "@/server/trpc";
import { db } from "@/lib/db";
import { assertProjectMember } from "@/lib/authz";
import { audit } from "@/lib/audit";
import { createNotification, notifyProject } from "@/server/utils/notify";
import { dailyReportAttachmentsRouter } from "./daily-report-attachments";
import {
  syncNormalizedTables,
  processReportSubmission,
} from "@/server/services/daily-report-sync";

const CreateReportSchema = z.object({
  projectId: z.string(),
  number: z.string().min(1).max(50),
  reportDate: z.string().datetime(),
  weatherMorning: z.string().optional(),
  weatherAfternoon: z.string().optional(),
  weatherEvening: z.string().optional(),
  maxTempC: z.number().optional(),
  minTempC: z.number().optional(),
  rainfallMm: z.number().optional(),
  workforce: z.string().optional(),
  workProgress: z.string().optional(),
  equipmentUsed: z.string().optional(),
  materialReceived: z.string().optional(),
  siteVisits: z.string().optional(),
  meetings: z.string().optional(),
  problems: z.string().optional(),
  safetyNotes: z.string().optional(),
  remarks: z.string().optional(),
});

const UpdateReportSchema = z.object({
  reportId: z.string(),
  weatherMorning: z.string().optional(),
  weatherAfternoon: z.string().optional(),
  weatherEvening: z.string().optional(),
  maxTempC: z.number().optional(),
  minTempC: z.number().optional(),
  rainfallMm: z.number().optional(),
  workforce: z.string().optional(),
  workProgress: z.string().optional(),
  equipmentUsed: z.string().optional(),
  materialReceived: z.string().optional(),
  materialConsumed: z.string().optional(),
  siteVisits: z.string().optional(),
  meetings: z.string().optional(),
  problems: z.string().optional(),
  safetyNotes: z.string().optional(),
  remarks: z.string().optional(),
  status: z.enum(["draft", "submitted", "approved", "archived"]).optional(),
});

const dailyReportCoreRouter = router({
  /** List daily reports for a project. */
  listReports: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        status: z.string().optional().nullable(),
        q: z.string().optional().nullable(),
      })
    )
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);
      const queryStr = input.q?.toLowerCase();

      // Map old statuses to new ones for filtering
      const statusFilter =
        input.status && input.status !== "all"
          ? {
              in: [
                input.status,
                ...(input.status === "submitted" ? ["checked"] : []),
                ...(input.status === "draft" ? ["rejected"] : []),
              ],
            }
          : undefined;

      const reports = await db.dailyReport.findMany({
        where: {
          projectId: input.projectId,
          ...(statusFilter && { status: statusFilter }),
          ...(queryStr && {
            OR: [
              { number: { contains: queryStr } },
              { problems: { contains: queryStr } },
            ],
          }),
        },
        orderBy: { reportDate: "desc" },
        include: {
          createdBy: { select: { id: true, name: true } },
        },
      });

      const normalized = reports.map((r) => ({
        ...r,
        status:
          r.status === "checked"
            ? "submitted"
            : r.status === "rejected"
              ? "draft"
              : r.status,
      }));

      return { reports: normalized };
    }),

  /** Get daily report details. */
  getReport: protectedProcedure
    .input(z.object({ reportId: z.string() }))
    .query(async ({ ctx, input }) => {
      const report = await db.dailyReport.findUnique({
        where: { id: input.reportId },
        include: {
          project: { select: { id: true, name: true, code: true, client: true } },
          createdBy: { select: { id: true, name: true, role: true } },
          attachments: {
            orderBy: { uploadedAt: "desc" },
          },
          workforce: { orderBy: { sortOrder: "asc" } },
          workProgress: { orderBy: { sortOrder: "asc" } },
          equipmentUsed: { orderBy: { sortOrder: "asc" } },
          materialReceived: { orderBy: { sortOrder: "asc" } },
          materialConsumed: { orderBy: { sortOrder: "asc" } },
          siteVisits: { orderBy: { sortOrder: "asc" } },
          meetings: { orderBy: { sortOrder: "asc" } },
        },
      });
      if (!report) throw new TRPCError({ code: "NOT_FOUND", message: "Report not found." });
      await assertProjectMember(ctx.user, report.projectId);

      const dailyProgram = await db.dailyProgram.findUnique({
        where: {
          projectId_programDate: {
            projectId: report.projectId,
            programDate: report.reportDate,
          },
        },
        include: {
          tasks: {
            orderBy: { plannedQty: "desc" },
            include: {
              rfi: { select: { id: true, number: true, subject: true } },
              ganttTask: { select: { id: true, code: true, name: true } },
              subcontractor: { select: { id: true, name: true } },
              boqItem: {
                include: {
                  ingredients: {
                    orderBy: { sortOrder: "asc" },
                  },
                },
              },
            },
          },
        },
      });

      const carriedOverTasks = await db.dailyProgramTask.findMany({
        where: {
          carriedOverTo: {
            some: {
              program: {
                projectId: report.projectId,
                programDate: report.reportDate,
              },
            },
          },
        },
        include: {
          rfi: { select: { id: true, number: true, subject: true } },
          ganttTask: { select: { id: true, code: true, name: true } },
          program: { select: { programDate: true } },
        },
      });

      const dailyProgramWithCarryover = dailyProgram
        ? {
            ...dailyProgram,
            tasks: [
              ...dailyProgram.tasks,
              ...carriedOverTasks.map((t) => ({
                ...t,
                isCarriedOver: true,
                carriedFromDate: t.program?.programDate,
              })),
            ],
          }
        : {
            tasks: carriedOverTasks.map((t) => ({
              ...t,
              isCarriedOver: true,
              carriedFromDate: t.program?.programDate,
            })),
          };

      return { report, dailyProgram: dailyProgramWithCarryover };
    }),

  /** Create a daily report. */
  createReport: protectedProcedure
    .input(CreateReportSchema)
    .mutation(async ({ ctx, input }) => {
      const role = await assertProjectMember(ctx.user, input.projectId);
      if (role === "client" || role === "inspector") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Your role on this project is read-only.",
        });
      }

      const dup = await db.dailyReport.findUnique({
        where: { projectId_number: { projectId: input.projectId, number: input.number } },
        select: { id: true },
      });
      if (dup) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `Report number ${input.number} already exists.`,
        });
      }

      const reportDate = new Date(input.reportDate);
      const dayOfWeek = reportDate.toLocaleDateString("en-US", { weekday: "long" });

      const report = await db.dailyReport.create({
        data: {
          projectId: input.projectId,
          createdById: ctx.user.id,
          number: input.number,
          reportDate,
          dayOfWeek,
          weatherMorning: input.weatherMorning,
          weatherAfternoon: input.weatherAfternoon,
          weatherEvening: input.weatherEvening,
          maxTempC: input.maxTempC,
          minTempC: input.minTempC,
          rainfallMm: input.rainfallMm,
          problems: input.problems,
          safetyNotes: input.safetyNotes,
          remarks: input.remarks,
        },
      });

      await syncNormalizedTables(report.id, {
        workforce: input.workforce,
        workProgress: input.workProgress,
        equipmentUsed: input.equipmentUsed,
        materialReceived: input.materialReceived,
        materialConsumed: (input as any).materialConsumed,
        siteVisits: input.siteVisits,
        meetings: input.meetings,
      });

      await audit({
        userId: ctx.user.id,
        projectId: input.projectId,
        action: "daily_report.create",
        entityType: "daily_report",
        entityId: report.id,
        metadata: { number: report.number },
      });

      return { report };
    }),

  /** Update/PATCH daily report & handle material consumption on approval. */
  updateReport: protectedProcedure
    .input(UpdateReportSchema)
    .mutation(async ({ ctx, input }) => {
      const { reportId, ...data } = input;
      const report = await db.dailyReport.findUnique({
        where: { id: reportId },
        select: { id: true, projectId: true, status: true, number: true },
      });
      if (!report) throw new TRPCError({ code: "NOT_FOUND", message: "Report not found." });

      const role = await assertProjectMember(ctx.user, report.projectId);
      if (role === "client" || role === "inspector") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Your role on this project is read-only.",
        });
      }

      const updateData: Record<string, any> = {};
      if (report.status === "draft") {
        for (const key of [
          "weatherMorning",
          "weatherAfternoon",
          "weatherEvening",
          "maxTempC",
          "minTempC",
          "rainfallMm",
          "problems",
          "safetyNotes",
          "remarks",
        ]) {
          const val = data[key as keyof typeof data];
          if (val !== undefined) updateData[key] = val;
        }
      }

      let didApprove = false;
      if (data.status !== undefined && data.status !== report.status) {
        const isAdmin = role === "project_manager" || role === "coordinator";
        const transition = `${report.status}→${data.status}`;
        const allowed: Record<string, boolean> = {
          "draft→submitted": isAdmin,
          "submitted→draft": isAdmin,
          "submitted→approved": isAdmin,
          "approved→archived": isAdmin,
          "approved→submitted": isAdmin,
        };
        if (!allowed[transition]) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Status transition ${transition} is not permitted for your role.`,
          });
        }
        updateData.status = data.status;
        if (data.status === "submitted") {
          updateData.preparedAt = new Date();
          updateData.submittedAt = new Date();
          updateData.submittedById = ctx.user.id;
        }
        if (data.status === "approved") {
          updateData.approvedAt = new Date();
          updateData.clientApprovedAt = new Date();
          updateData.clientApprovedById = ctx.user.id;
          didApprove = true;
        }
        if (data.status === "archived") {
          updateData.archivedAt = new Date();
        }
      }

      const updated = await db.dailyReport.update({
        where: { id: reportId },
        data: updateData,
      });

      if (didApprove) {
        const fullReport = await db.dailyReport.findUnique({
          where: { id: reportId },
          include: {
            materialConsumed: { orderBy: { sortOrder: "asc" } },
            workProgress: { orderBy: { sortOrder: "asc" } },
          },
        });

        if (fullReport) {
          const consumptions: { materialId: string; quantity: number; rate?: number }[] = [];

          if (fullReport.materialConsumed.length > 0) {
            for (const item of fullReport.materialConsumed) {
              if (item.materialId && item.quantity > 0) {
                consumptions.push({
                  materialId: item.materialId,
                  quantity: item.quantity,
                  rate: 0,
                });
              }
            }
          }

          if (consumptions.length === 0 && fullReport.workProgress.length > 0) {
            const theoreticalMap = new Map<string, { quantity: number; rate: number }>();

            for (const progItem of fullReport.workProgress) {
              const boqCode = progItem.boqCode;
              const actualQty = progItem.actualQty || 0;
              if (!boqCode || actualQty <= 0) continue;

              const boqItem = await db.boqItem.findFirst({
                where: { projectId: report.projectId, code: boqCode },
                include: { ingredients: true },
              });

              if (boqItem) {
                const matIngredients = boqItem.ingredients.filter(
                  (ig) => ig.type === "material"
                );
                for (const ing of matIngredients) {
                  const theoreticalQty = actualQty * ing.quantity;

                  const mat = await db.material.findFirst({
                    where: {
                      projectId: report.projectId,
                      name: { equals: ing.name },
                    },
                  });

                  if (mat) {
                    const existing = theoreticalMap.get(mat.id);
                    if (existing) {
                      existing.quantity += theoreticalQty;
                    } else {
                      theoreticalMap.set(mat.id, {
                        quantity: theoreticalQty,
                        rate: mat.minStock > 0 ? mat.minStock : 0,
                      });
                    }
                  }
                }
              }
            }

            for (const [matId, val] of theoreticalMap.entries()) {
              consumptions.push({
                materialId: matId,
                quantity: val.quantity,
                rate: val.rate,
              });
            }
          }

          if (consumptions.length > 0) {
            await db.$transaction(async (tx) => {
              for (const cons of consumptions) {
                const material = await tx.material.findUnique({
                  where: { id: cons.materialId },
                });
                if (material) {
                  const deductQty = cons.quantity;
                  const newStock = Math.max(0, material.currentStock - deductQty);

                  await tx.materialTransaction.create({
                    data: {
                      materialId: cons.materialId,
                      projectId: report.projectId,
                      type: "issue",
                      quantity: deductQty,
                      unit: material.unit,
                      rate: cons.rate ?? 0,
                      reference: report.number,
                      remarks: `Auto-deducted from Daily Report ${report.number} approval`,
                      createdById: ctx.user.id,
                      paymentType: "payable",
                    },
                  });

                  await tx.material.update({
                    where: { id: cons.materialId },
                    data: { currentStock: newStock },
                  });
                }
              }
            });
          }
        }
      }

      if (data.status === "submitted" && report.status === "draft") {
        await processReportSubmission({
          reportId,
          projectId: report.projectId,
          userId: ctx.user.id,
        });
      }

      const hasJsonFields = [
        "workforce",
        "workProgress",
        "equipmentUsed",
        "materialReceived",
        "materialConsumed",
        "siteVisits",
        "meetings",
      ].some((k) => (data as any)[k] !== undefined);
      if (hasJsonFields) {
        await syncNormalizedTables(reportId, {
          workforce: (data as any).workforce ?? null,
          workProgress: (data as any).workProgress ?? null,
          equipmentUsed: (data as any).equipmentUsed ?? null,
          materialReceived: (data as any).materialReceived ?? null,
          materialConsumed: (data as any).materialConsumed ?? null,
          siteVisits: (data as any).siteVisits ?? null,
          meetings: (data as any).meetings ?? null,
        });
      }

      await audit({
        userId: ctx.user.id,
        projectId: report.projectId,
        action: "daily_report.update",
        entityType: "daily_report",
        entityId: reportId,
        metadata: { number: report.number, changes: updateData },
      });

      if (data.status && data.status !== report.status) {
        const fullReport = await db.dailyReport.findUnique({
          where: { id: reportId },
          select: { createdById: true, number: true, reportDate: true },
        });
        if (fullReport) {
          const dateStr = fullReport.reportDate.toLocaleDateString();
          if (data.status === "submitted") {
            await notifyProject({
              projectId: report.projectId,
              type: "daily_report_submitted",
              title: `Daily report submitted: ${fullReport.number}`,
              message: `Report for ${dateStr} is awaiting review.`,
              metadata: {
                reportId,
                number: fullReport.number,
                entityType: "daily_report",
                entityId: reportId,
              },
              excludeUserId: ctx.user.id,
              postToChannel: true,
            });
          } else if (["approved", "archived"].includes(data.status as string)) {
            if (fullReport.createdById !== ctx.user.id) {
              await createNotification({
                userId: fullReport.createdById,
                projectId: report.projectId,
                type: `daily_report_${data.status}`,
                title: `Daily report ${data.status}: ${fullReport.number}`,
                message: `Your report for ${dateStr} has been ${data.status}.`,
                metadata: {
                  reportId,
                  number: fullReport.number,
                  entityType: "daily_report",
                  entityId: reportId,
                },
                postToChannel: true,
              });
            }
          }
        }
      }

      return { report: updated };
    }),

  /** Send daily report via email. */
  emailReport: protectedProcedure
    .input(
      z.object({
        reportId: z.string(),
        to: z.string().email(),
        subject: z.string().optional(),
        message: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const report = await db.dailyReport.findUnique({
        where: { id: input.reportId },
        include: {
          project: { select: { name: true, code: true } },
          createdBy: { select: { name: true } },
        },
      });
      if (!report) throw new TRPCError({ code: "NOT_FOUND", message: "Report not found." });
      await assertProjectMember(ctx.user, report.projectId);

      const subject =
        input.subject ||
        `Daily Report ${report.number} — ${report.project.name}`;

      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #1a1a1a;">Daily Site Report: ${report.number}</h2>
          <p><strong>Project:</strong> ${report.project.name} (${report.project.code})</p>
          <p><strong>Date:</strong> ${report.reportDate ? new Date(report.reportDate).toLocaleDateString() : "N/A"}</p>
          <p><strong>Day:</strong> ${report.dayOfWeek || "N/A"}</p>
          <p><strong>Prepared by:</strong> ${report.createdBy?.name ?? "N/A"}</p>
          <hr style="border: 1px solid #e5e5e5;" />
          ${report.weatherMorning ? `<p><strong>Weather (AM):</strong> ${report.weatherMorning}</p>` : ""}
          ${report.weatherAfternoon ? `<p><strong>Weather (PM):</strong> ${report.weatherAfternoon}</p>` : ""}
          ${report.maxTempC ? `<p><strong>Temperature:</strong> ${report.minTempC ?? ""}°C – ${report.maxTempC}°C</p>` : ""}
          ${report.rainfallMm ? `<p><strong>Rainfall:</strong> ${report.rainfallMm} mm</p>` : ""}
          <hr style="border: 1px solid #e5e5e5;" />
          ${report.problems ? `<p><strong>Problems/Issues:</strong><br/>${report.problems}</p>` : ""}
          ${report.safetyNotes ? `<p><strong>Safety Notes:</strong><br/>${report.safetyNotes}</p>` : ""}
          ${report.remarks ? `<p><strong>Remarks:</strong><br/>${report.remarks}</p>` : ""}
          <hr style="border: 1px solid #e5e5e5;" />
          ${input.message ? `<p><strong>Note:</strong> ${input.message}</p>` : ""}
          <p style="color: #888; font-size: 12px;">This report was generated by Construction Manager</p>
        </div>
      `;

      const { sendEmail } = await import("@/server/utils/email");
      const sent = await sendEmail({ to: input.to, subject, html });

      if (!sent) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to send email. Please check SMTP configuration.",
        });
      }

      return { sent: true };
    }),

  /** Delete daily report. */
  deleteReport: protectedProcedure
    .input(z.object({ reportId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const report = await db.dailyReport.findUnique({
        where: { id: input.reportId },
        select: {
          id: true,
          projectId: true,
          status: true,
          number: true,
          createdById: true,
        },
      });
      if (!report) throw new TRPCError({ code: "NOT_FOUND", message: "Report not found." });

      const role = await assertProjectMember(ctx.user, report.projectId);
      const isAuthor = report.createdById === ctx.user.id;
      const isAdmin = role === "project_manager" || role === "coordinator";
      const isWriter = role === "engineer" || isAdmin;

      if (!isAdmin && !isAuthor && !isWriter) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have permission to delete this report.",
        });
      }

      if (report.status !== "draft" && !isAdmin) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only draft reports can be deleted.",
        });
      }

      await db.dailyReport.delete({ where: { id: input.reportId } });

      await audit({
        userId: ctx.user.id,
        projectId: report.projectId,
        action: "daily_report.delete",
        entityType: "daily_report",
        entityId: input.reportId,
        metadata: { number: report.number },
      });

      return { ok: true };
    }),
});

export const dailyReportRouter = mergeRouters(
  dailyReportCoreRouter,
  dailyReportAttachmentsRouter
);
