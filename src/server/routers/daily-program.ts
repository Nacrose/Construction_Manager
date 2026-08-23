/**
 * tRPC router for Daily Programs.
 * Extracted from daily-report.ts for maintainability.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { DEFAULT_COST_RATES, getLaborWage, getEquipmentRate, resolveProjectRates } from "@/lib/cost-rates";
import { router, protectedProcedure } from "@/server/trpc";
import { db, getFreshDb } from "@/lib/db";
import { getDefaultLibraryId } from "@/lib/default-library";
import { assertProjectMember, assertCanWrite, assertProjectManager } from "@/lib/authz";
import { audit } from "@/lib/audit";
import { createNotification, notifyProjectMembers, notifyProject } from "@/server/utils/notify";

const TaskSchema = z.object({
  rfiId: z.string().nullable().optional(),
  rfiItemId: z.string().nullable().optional(),
  ganttTaskId: z.string().nullable().optional(),
  subcontractorId: z.string().nullable().optional(),
  taskName: z.string().min(1),
  location: z.string().optional(),
  boqItemId: z.string().nullable().optional(),
  boqCode: z.string().optional(),
  boqDesc: z.string().optional(),
  plannedQty: z.number().default(0),
  unit: z.string().optional(),
  paymentType: z.enum(["payable", "unpayable", "temporary"]).default("payable"),
  assignedTo: z.string().optional(),
  remarks: z.string().optional(),
  executionStatus: z.enum(["planned", "done", "partially_completed", "uncompleted", "postponed"]).default("planned"),
  actualQty: z.number().optional(),
  batchedQty: z.number().optional(),
  payableQty: z.number().optional(),
  delayReason: z.string().nullable().optional(),
  delayNotes: z.string().nullable().optional(),
  isEotCandidate: z.boolean().default(false),
  carriedOverFromId: z.string().nullable().optional(),
});

const CreateProgramSchema = z.object({
  projectId: z.string(),
  programDate: z.string().transform((v) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T00:00:00.000Z` : v)),
  notes: z.string().optional(),
  tasks: z.array(TaskSchema).default([]),
});

export const dailyProgramRouter = router({
  getApprovedDailyProgramByDate: protectedProcedure
    .input(z.object({ projectId: z.string(), programDate: z.string().transform((v) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T00:00:00.000Z` : v)) }))
    .query(async ({ ctx, input }) => {
      const role = await assertProjectMember(ctx.user, input.projectId);
      if (role === "client" || role === "inspector") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Your role on this project is read-only." });
      }

      const program = await db.dailyProgram.findUnique({
        where: {
          projectId_programDate: {
            projectId: input.projectId,
            programDate: new Date(input.programDate),
          },
        },
        include: {
          tasks: {
            include: {
              rfi: { select: { id: true, number: true, subject: true } },
              ganttTask: { select: { id: true, code: true, name: true } },
              subcontractor: { select: { id: true, name: true } },
            },
          },
        },
      });

      // Only return if approved
      if (program && program.status !== "approved") return null;

      // Fetch carried-over tasks for this date
      const carriedOverTasks = await db.dailyProgramTask.findMany({
        where: {
          carriedOverTo: {
            some: {
              program: {
                projectId: input.projectId,
                programDate: new Date(input.programDate),
              },
            },
          },
        },
        include: {
          rfi: { select: { id: true, number: true, subject: true } },
          ganttTask: { select: { id: true, code: true, name: true } },
          subcontractor: { select: { id: true, name: true } },
          program: { select: { programDate: true } },
        },
      });

      // Attach carried-over tasks
      const programWithCarryover = program ? {
        ...program,
        tasks: [
          ...program.tasks,
          ...carriedOverTasks.map(t => ({
            ...t,
            isCarriedOver: true,
            carriedFromDate: t.program?.programDate,
          })),
        ],
      } : { tasks: carriedOverTasks.map(t => ({
        ...t,
        isCarriedOver: true,
        carriedFromDate: t.program?.programDate,
      })) };

      return programWithCarryover;
    }),

  getProgramResources: protectedProcedure
    .input(z.object({ projectId: z.string(), programDate: z.string().transform((v) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T00:00:00.000Z` : v)) }))
    .query(async ({ ctx, input }) => {
      const role = await assertProjectMember(ctx.user, input.projectId);
      if (role === "client" || role === "inspector") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Your role on this project is read-only." });
      }

      const date = new Date(input.programDate);

      // Look up any program (draft or approved) for that date — draft is fine because we just want suggestions
      const program = await db.dailyProgram.findUnique({
        where: {
          projectId_programDate: {
            projectId: input.projectId,
            programDate: date,
          },
        },
        include: {
          tasks: {
            select: {
              id: true,
              ganttTaskId: true,
              taskName: true,
              location: true,
              boqCode: true,
              boqDesc: true,
            },
          },
        },
      });

      // Also fetch carried-over tasks for that date
      const carriedOverTasks = await db.dailyProgramTask.findMany({
        where: {
          carriedOverTo: {
            some: {
              program: {
                projectId: input.projectId,
                programDate: date,
              },
            },
          },
        },
        select: {
          id: true,
          ganttTaskId: true,
          taskName: true,
          location: true,
          boqCode: true,
          boqDesc: true,
        },
      });

      const allTasks = [...(program?.tasks ?? []), ...carriedOverTasks];
      const ganttTaskIds = Array.from(
        new Set(allTasks.map(t => t.ganttTaskId).filter((id): id is string => !!id))
      );

      // Fetch ResourceAssignments for those Gantt tasks that are active on this date
      let assignments: any[] = [];
      if (ganttTaskIds.length > 0) {
        assignments = await db.resourceAssignment.findMany({
          where: {
            taskId: { in: ganttTaskIds },
            OR: [
              { startDate: null },
              { startDate: { lte: date } },
            ],
          },
          include: {
            staff: {
              select: {
                id: true, name: true, designation: true, category: true, dailyWage: true,
              },
            },
            staffRole: {
              select: {
                id: true, name: true, category: true, headcount: true, dailyWage: true,
              },
            },
            equipment: {
              select: {
                id: true, name: true, code: true, type: true, model: true,
                status: true, fuelRate: true,
              },
            },
            task: { select: { id: true, code: true, name: true } },
          },
        });
      }

      // Filter to assignments whose endDate is null or >= date
      const active = assignments.filter((a: any) => !a.endDate || new Date(a.endDate) >= date);

      // Aggregate workforce rows
      const workforceMap = new Map<string, any>();
      for (const a of active) {
        if (a.staffId && a.staff) {
          const key = `staff:${a.staffId}`;
          const existing = workforceMap.get(key);
          const qty = Math.max(1, Math.round(a.quantity || 1));
          if (existing) {
            existing.headcount += qty;
          } else {
            workforceMap.set(key, {
              staffId: a.staff.id,
              staffName: a.staff.name,
              company: a.staff.designation || "—",
              trade: a.staff.category || a.staff.designation || "",
              skill: a.staff.category === "skilled" ? "skilled" : "unskilled",
              headcount: qty,
              regHours: 8 * qty,
              otHours: 0,
              location: "",
            });
          }
        } else if (a.staffRoleId && a.staffRole) {
          const key = `role:${a.staffRoleId}`;
          const existing = workforceMap.get(key);
          const qty = Math.max(1, Math.round((a.quantity || 1) * (a.staffRole.headcount || 1)));
          if (existing) {
            existing.headcount += qty;
          } else {
            workforceMap.set(key, {
              staffRoleId: a.staffRole.id,
              staffName: a.staffRole.name,
              company: a.staffRole.name,
              trade: a.staffRole.category || "",
              skill: a.staffRole.category === "skilled" ? "skilled" : "unskilled",
              headcount: qty,
              regHours: 8 * qty,
              otHours: 0,
              location: "",
            });
          }
        }
      }

      // Aggregate equipment rows (one per equipment, regardless of how many tasks use it)
      const equipmentMap = new Map<string, any>();
      for (const a of active) {
        if (a.equipmentId && a.equipment) {
          const key = `equip:${a.equipmentId}`;
          if (!equipmentMap.has(key)) {
            equipmentMap.set(key, {
              equipmentId: a.equipment.id,
              equipmentName: a.equipment.name,
              id: a.equipment.code || "",
              type: a.equipment.type || a.equipment.name,
              ownership: "owned",
              workingHours: 0,
              idleHours: 0,
              breakdownHours: 0,
              operator: "",
              fuel: 0,
              location: "",
            });
          }
        }
      }

      // Also return project-wide master lists for the dropdown picker
      const [staffList, equipmentList] = await Promise.all([
        db.staff.findMany({
          where: { projectId: input.projectId, status: "active" },
          select: {
            id: true, name: true, designation: true, category: true, dailyWage: true,
          },
          orderBy: { name: "asc" },
        }),
        db.equipment.findMany({
          where: { projectId: input.projectId },
          select: {
            id: true, name: true, code: true, type: true, model: true,
            status: true, fuelRate: true,
          },
          orderBy: { name: "asc" },
        }),
      ]);

      return {
        hasProgram: !!program || carriedOverTasks.length > 0,
        programTaskCount: allTasks.length,
        workforce: Array.from(workforceMap.values()),
        equipment: Array.from(equipmentMap.values()),
        staffList,
        equipmentList,
      };
    }),

  fetchWeather: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      reportDate: z.string().transform((v) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T00:00:00.000Z` : v)),
      latitude: z.number().optional(),
      longitude: z.number().optional(),
    }))
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);

      let lat = input.latitude;
      let lng = input.longitude;
      let locationName: string | undefined;

      // If no explicit coords provided, look up project & geocode its location
      if (lat == null || lng == null) {
        const project = await db.project.findUnique({
          where: { id: input.projectId },
          select: { location: true, name: true },
        });

        if (!project) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Project not found." });
        }

        // Try project location string, fall back to project name
        const query = project.location?.trim() || project.name.trim();
        if (!query) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Project has no location set. Add a location (e.g. 'Kathmandu, Nepal') in project settings.",
          });
        }

        // Geocode via open-meteo (free, no API key)
        try {
          const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=1&language=en&format=json`;
          const geoRes = await fetch(geoUrl, { next: { revalidate: 86400 } });
          if (!geoRes.ok) throw new Error(`Geocoding API returned ${geoRes.status}`);
          const geoData = await geoRes.json() as any;
          if (!geoData?.results?.length) {
            throw new Error(`Could not geocode location "${query}". Try a more specific location like "Kathmandu, Nepal".`);
          }
          const first = geoData.results[0];
          lat = first.latitude;
          lng = first.longitude;
          locationName = [first.name, first.admin1, first.country].filter(Boolean).join(", ");
        } catch (e: any) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `Weather lookup failed: ${e.message}`,
          });
        }
      }

      if (lat == null || lng == null) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Could not determine coordinates." });
      }

      // Fetch historical/daily weather for the report date.
      // open-meteo archive API covers past dates; forecast API covers today + 16d forward.
      const reportDate = new Date(input.reportDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const diffDays = Math.round((reportDate.getTime() - today.getTime()) / 86400000);

      const isoDate = reportDate.toISOString().slice(0, 10);
      const todayIso = today.toISOString().slice(0, 10);

      let weatherData: any;
      try {
        if (diffDays < -5) {
          // Past date beyond forecast window → use archive API
          const archiveUrl =
            `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lng}` +
            `&start_date=${isoDate}&end_date=${isoDate}` +
            `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum` +
            `&hourly=weather_code,precipitation` +
            `&timezone=auto`;
          const res = await fetch(archiveUrl, { next: { revalidate: 3600 } });
          if (!res.ok) throw new Error(`Archive API returned ${res.status}`);
          weatherData = await res.json();
        } else {
          // Recent or future date → use forecast API
          const forecastUrl =
            `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
            `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum` +
            `&hourly=weather_code,precipitation` +
            `&timezone=auto&forecast_days=16&past_days=5`;
          const res = await fetch(forecastUrl, { next: { revalidate: 1800 } });
          if (!res.ok) throw new Error(`Forecast API returned ${res.status}`);
          weatherData = await res.json();
        }
      } catch (e: any) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Weather API call failed: ${e.message}`,
        });
      }

      // Parse weather code → simplified category
      const mapWeatherCode = (code: number | undefined): string => {
        if (code == null) return "clear";
        if (code === 0) return "clear";
        if (code <= 3) return "cloudy";
        if (code >= 45 && code <= 48) return "fog";
        if (code >= 51 && code <= 67) return "rain";
        if (code >= 71 && code <= 77) return "cloudy"; // snow — keep simple
        if (code >= 80 && code <= 82) return "rain";
        if (code >= 95) return "storm";
        return "overcast";
      };

      // Find daily index for our target date
      const dailyDates: string[] = weatherData?.daily?.time ?? [];
      const idx = dailyDates.indexOf(isoDate);
      if (idx < 0) {
        // Forecast may not have today's date if it's already late evening — try todayIso as fallback
        const fallbackIdx = dailyDates.indexOf(todayIso);
        if (fallbackIdx < 0) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `Weather data not available for ${isoDate}.`,
          });
        }
      }
      const dateIdx = idx >= 0 ? idx : dailyDates.indexOf(todayIso);

      const maxTempC = weatherData?.daily?.temperature_2m_max?.[dateIdx];
      const minTempC = weatherData?.daily?.temperature_2m_min?.[dateIdx];
      const rainfallMm = weatherData?.daily?.precipitation_sum?.[dateIdx];

      // Hourly weather codes for morning (06:00), afternoon (13:00), evening (19:00)
      const hourlyTimes: string[] = weatherData?.hourly?.time ?? [];
      const hourlyCodes: number[] = weatherData?.hourly?.weather_code ?? [];
      const hourlyPrecip: number[] = weatherData?.hourly?.precipitation ?? [];

      const findHourlyIdx = (hour: number): number | undefined => {
        const target = `${isoDate}T${String(hour).padStart(2, "0")}:00`;
        const i = hourlyTimes.indexOf(target);
        return i >= 0 ? i : undefined;
      };

      const morningIdx = findHourlyIdx(6);
      const afternoonIdx = findHourlyIdx(13);
      const eveningIdx = findHourlyIdx(19);

      return {
        location: locationName,
        latitude: lat,
        longitude: lng,
        weatherMorning: morningIdx != null ? mapWeatherCode(hourlyCodes[morningIdx]) : undefined,
        weatherAfternoon: afternoonIdx != null ? mapWeatherCode(hourlyCodes[afternoonIdx]) : undefined,
        weatherEvening: eveningIdx != null ? mapWeatherCode(hourlyCodes[eveningIdx]) : undefined,
        maxTempC: typeof maxTempC === "number" ? Math.round(maxTempC * 10) / 10 : undefined,
        minTempC: typeof minTempC === "number" ? Math.round(minTempC * 10) / 10 : undefined,
        rainfallMm: typeof rainfallMm === "number" ? Math.round(rainfallMm * 10) / 10 : undefined,
        source: diffDays < -5 ? "open-meteo archive" : "open-meteo forecast",
      };
    }),

  approveProgram: protectedProcedure
    .input(z.object({ programId: z.string(), projectId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertProjectManager(ctx.user, input.projectId);

      const program = await db.dailyProgram.findUnique({
        where: { id: input.programId },
      });
      if (!program) throw new TRPCError({ code: "NOT_FOUND", message: "Daily program not found." });
      if (program.projectId !== input.projectId) throw new TRPCError({ code: "FORBIDDEN", message: "Project mismatch." });
      if (program.status === "approved") return { program }; // Idempotent

      const updated = await db.dailyProgram.update({
        where: { id: input.programId },
        data: {
          status: "approved",
          approvedAt: new Date(),
          approvedById: ctx.user.id,
        },
      });

      await audit({
        userId: ctx.user.id,
        projectId: input.projectId,
        action: "daily_program.approve",
        entityType: "daily_program",
        entityId: input.programId,
        metadata: { programDate: program.programDate.toISOString() },
      });

      // Notify project members that the daily program is approved for execution (internal + channel)
      await notifyProject({
        projectId: input.projectId,
        type: "daily_program_approved",
        title: "Daily program approved",
        message: `Daily program for ${program.programDate.toLocaleDateString()} is approved. Field teams can now execute the planned work.`,
        metadata: { programId: input.programId, programDate: program.programDate.toISOString(), entityType: "daily_program", entityId: input.programId },
        excludeUserId: ctx.user.id,
        postToChannel: true,
      });

      return { program: updated };
    }),

  listPrograms: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);
      const programs = await db.dailyProgram.findMany({
        where: { projectId: input.projectId },
        orderBy: { programDate: "desc" },
        include: {
          tasks: {
            include: {
              rfi: { select: { id: true, number: true } },
              ganttTask: { select: { id: true, code: true, name: true } },
              boqItem: {
                include: {
                  ingredients: {
                    orderBy: { sortOrder: "asc" },
                  },
                },
              },
            },
          },
          _count: { select: { tasks: true } },
        },
      });
      return { programs };
    }),

  createProgram: protectedProcedure
    .input(CreateProgramSchema)
    .mutation(async ({ ctx, input }) => {
      await assertCanWrite(ctx.user, input.projectId);
      const date = new Date(input.programDate);

      const dup = await db.dailyProgram.findUnique({
        where: { projectId_programDate: { projectId: input.projectId, programDate: date } },
        select: { id: true },
      });
      if (dup) {
        throw new TRPCError({ code: "CONFLICT", message: "A program already exists for this date." });
      }

      const program = await db.dailyProgram.create({
        data: {
          projectId: input.projectId,
          programDate: date,
          notes: input.notes,
          tasks: input.tasks.length ? { create: input.tasks } : undefined,
        },
        include: { tasks: true },
      });

      return { program };
    }),

  listAvailableRfis: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);
      const database = getFreshDb();

      // Use the project's default library instead of hardcoded client_estimate
      const defaultLibId = await getDefaultLibraryId(input.projectId);
      const ingredientFilter = defaultLibId
        ? { rateAnalysis: { libraryId: defaultLibId } }
        : { rateAnalysis: { library: { purpose: "client_estimate" as const } } };

      const rfis = await database.rfi.findMany({
        where: {
          projectId: input.projectId,
          status: "approved",
          items: { some: {} },
        },
        orderBy: { number: "asc" },
        select: {
          id: true,
          number: true,
          subject: true,
          location: true,
          ganttTaskId: true,
          ganttTask: { select: { id: true, code: true, name: true } },
          drawing: { select: { id: true, number: true, title: true, revision: true } },
          items: {
            include: {
              boqItem: {
                select: {
                  id: true,
                  code: true,
                  description: true,
                  unit: true,
                  rate: true,
                  ingredients: {
                    where: ingredientFilter as any,
                    select: {
                      id: true,
                      name: true,
                      type: true,
                      quantity: true,
                      unit: true,
                      rate: true,
                      amount: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

      return { rfis };
    }),

  listBacklog: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);
      const now = new Date();
      now.setHours(0, 0, 0, 0);

      const backlogTasks = await db.dailyProgramTask.findMany({
        where: {
          program: {
            projectId: input.projectId,
            programDate: { lt: now }, // Past programs only
          },
          executionStatus: { in: ["partially_completed", "uncompleted", "postponed"] },
          carriedOverTo: { none: {} }, // Not yet carried over
        },
        orderBy: [{ program: { programDate: "desc" } }, { taskName: "asc" }],
        include: {
          program: { select: { id: true, programDate: true } },
          rfi: { select: { id: true, number: true, subject: true } },
        },
      });

      return { backlogTasks };
    }),

  addBacklogToProgram: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      programId: z.string(),
      taskIds: z.array(z.string()),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertCanWrite(ctx.user, input.projectId);

      const tasks = await db.dailyProgramTask.findMany({
        where: { id: { in: input.taskIds } },
        include: { program: { select: { programDate: true } } },
      });

      if (!tasks.length) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No tasks found." });
      }

      const carryOverTasks = tasks.map(t => {
        const remaining = (t.plannedQty || 0) - (t.actualQty || 0);
        return {
          programId: input.programId,
          rfiId: t.rfiId,
          rfiItemId: t.rfiItemId,
          ganttTaskId: t.ganttTaskId,
          taskName: t.taskName,
          location: t.location,
          boqItemId: t.boqItemId,
          boqCode: t.boqCode,
          boqDesc: t.boqDesc,
          plannedQty: Math.max(0, remaining),
          unit: t.unit,
          paymentType: t.paymentType || "payable",
          assignedTo: t.assignedTo,
          remarks: t.remarks,
          carriedOverFromId: t.id,
          executionStatus: "planned",
          actualQty: 0,
        };
      });

      await db.dailyProgramTask.createMany({ data: carryOverTasks });

      return { success: true, count: carryOverTasks.length };
    }),

  listBacklogTasks: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);
      const database = getFreshDb();

      const backlogTasks = await database.dailyProgramTask.findMany({
        where: {
          program: { projectId: input.projectId },
          executionStatus: "postponed",
          carriedOverTo: { none: {} }, // Has not been carried over yet
        },
        orderBy: { program: { programDate: "asc" } },
        include: {
          program: { select: { programDate: true } }
        }
      });

      return { backlogTasks };
    }),

  updateTaskExecution: protectedProcedure
    .input(z.object({
      taskId: z.string(),
      executionStatus: z.enum(["planned", "done", "partially_completed", "uncompleted", "postponed"]),
      actualQty: z.number().optional(),
      batchedQty: z.number().optional(),
      payableQty: z.number().optional(),
      delayReason: z.string().nullable().optional(),
      delayNotes: z.string().nullable().optional(),
      isEotCandidate: z.boolean().default(false),
      carryOverAction: z.enum(["tomorrow", "postpone", "none"]).optional(),
      projectId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertCanWrite(ctx.user, input.projectId);
      
      const task = await db.dailyProgramTask.findUnique({
        where: { id: input.taskId },
        include: { program: true }
      });
      
      if (!task) throw new TRPCError({ code: "NOT_FOUND", message: "Task not found" });

      const batched = input.batchedQty !== undefined ? input.batchedQty : (input.actualQty ?? 0);
      const payable = input.payableQty !== undefined ? input.payableQty : (input.actualQty ?? 0);

      const updateData: any = {
        executionStatus: input.executionStatus,
        actualQty: input.actualQty ?? batched,
        batchedQty: batched,
        payableQty: payable,
        delayReason: input.delayReason,
        delayNotes: input.delayNotes,
        isEotCandidate: input.isEotCandidate,
      };

      // Handle Carry Over logic
      if (
        (input.executionStatus === "partially_completed" || input.executionStatus === "uncompleted") &&
        input.carryOverAction === "tomorrow"
      ) {
        const tomorrow = new Date(task.program.programDate);
        tomorrow.setDate(tomorrow.getDate() + 1);

        // Find or create tomorrow's program
        let nextProgram = await db.dailyProgram.findUnique({
          where: { projectId_programDate: { projectId: input.projectId, programDate: tomorrow } }
        });

        if (!nextProgram) {
          nextProgram = await db.dailyProgram.create({
            data: {
              projectId: input.projectId,
              programDate: tomorrow,
              status: "draft",
            }
          });
        }

        const remainingQty = Math.max(0, task.plannedQty - (input.actualQty ?? 0));

        // Create the carry-over task
        await db.dailyProgramTask.create({
          data: {
            programId: nextProgram.id,
            taskName: task.taskName,
            rfiId: task.rfiId,
            rfiItemId: task.rfiItemId,
            ganttTaskId: task.ganttTaskId,
            location: task.location,
            boqItemId: task.boqItemId,
            boqCode: task.boqCode,
            boqDesc: task.boqDesc,
            plannedQty: remainingQty,
            unit: task.unit,
            paymentType: task.paymentType,
            assignedTo: task.assignedTo,
            remarks: `Carried over from ${task.program.programDate.toDateString()}`,
            carriedOverFromId: task.id,
            executionStatus: "planned"
          }
        });
      }

      const updatedTask = await db.dailyProgramTask.update({
        where: { id: input.taskId },
        data: updateData
      });

      return { task: updatedTask };
    }),

  updateProgram: protectedProcedure
    .input(z.object({
      programId: z.string(),
      projectId: z.string(),
      programDate: z.string().transform((v) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T00:00:00.000Z` : v)),
      notes: z.string().optional(),
      tasks: z.array(TaskSchema).default([]),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertCanWrite(ctx.user, input.projectId);
      const database = getFreshDb();

      const existing = await database.dailyProgram.findUnique({
        where: { id: input.programId },
      });
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Daily program not found." });
      }
      if (existing.status === "approved") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Approved programs cannot be edited. Delete and recreate." });
      }

      await database.$transaction(async (tx) => {
        // Delete all old tasks first
        await tx.dailyProgramTask.deleteMany({
          where: { programId: input.programId },
        });

        // Update program date, notes and create fresh tasks
        await tx.dailyProgram.update({
          where: { id: input.programId },
          data: {
            programDate: input.programDate,
            notes: input.notes,
            tasks: {
              create: input.tasks,
            },
          },
        });
      });

      return { success: true };
    }),

  deleteProgram: protectedProcedure
    .input(z.object({ programId: z.string(), projectId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertCanWrite(ctx.user, input.projectId);
      const database = getFreshDb();

      const existing = await database.dailyProgram.findUnique({
        where: { id: input.programId },
      });
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Daily program not found." });
      }

      await database.dailyProgram.delete({
        where: { id: input.programId },
      });
      return { success: true };
    }),

  resyncProgram: protectedProcedure
    .input(z.object({ programId: z.string(), projectId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertCanWrite(ctx.user, input.projectId);

      const program = await db.dailyProgram.findUnique({
        where: { id: input.programId },
        include: { tasks: true },
      });
      if (!program) throw new TRPCError({ code: "NOT_FOUND", message: "Program not found." });

      const approvedRfis = await db.rfi.findMany({
        where: {
          projectId: input.projectId,
          status: "approved",
          workDate: program.programDate,
        },
        include: { items: true },
      });

      const created: string[] = [];
      const updated: string[] = [];
      const removed: string[] = [];

      // Remove tasks whose linked RFI is no longer approved for this date
      // Also remove orphaned tasks (rfiId=null) that were likely from a deleted RFI
      for (const task of program.tasks) {
        if (task.rfiId) {
          const match = approvedRfis.find(r => r.id === task.rfiId);
          if (!match) {
            await db.dailyProgramTask.delete({ where: { id: task.id } });
            removed.push(task.taskName);
          }
        } else if ((task.boqItemId || task.rfiItemId) && !task.ganttTaskId && !task.carriedOverFromId) {
          // Orphaned: was linked to an RFI that's been deleted (rfiId set to null by cascade, boqItemId/rfiItemId remain)
          await db.dailyProgramTask.delete({ where: { id: task.id } });
          removed.push(task.taskName);
        }
      }

      // Create or update tasks for current approved RFIs
      for (const rfi of approvedRfis) {
        const existing = program.tasks.find(t => t.rfiId === rfi.id);
        const items = rfi.items || [];

        if (existing) {
          await db.dailyProgramTask.update({
            where: { id: existing.id },
            data: {
              taskName: rfi.subject,
              location: rfi.location,
              ganttTaskId: rfi.ganttTaskId,
              subcontractorId: rfi.subcontractorId,
            },
          });
          updated.push(rfi.number);
        } else {
          if (items.length > 0) {
            await db.dailyProgramTask.createMany({
              data: items.map((item: any) => ({
                programId: program.id,
                rfiId: rfi.id,
                rfiItemId: item.id,
                taskName: `${rfi.subject}${item.boqDesc ? ` - ${item.boqDesc}` : ""}`.trim(),
                location: rfi.location,
                boqItemId: item.boqItemId,
                boqCode: item.boqCode,
                boqDesc: item.boqDesc,
                plannedQty: item.quantity || 0,
                unit: item.unit,
                paymentType: item.paymentType || "payable",
                ganttTaskId: rfi.ganttTaskId,
                subcontractorId: rfi.subcontractorId,
              })),
            });
          } else {
            await db.dailyProgramTask.create({
              data: {
                programId: program.id,
                rfiId: rfi.id,
                taskName: rfi.subject,
                location: rfi.location,
                plannedQty: 0,
                ganttTaskId: rfi.ganttTaskId,
                subcontractorId: rfi.subcontractorId,
              },
            });
          }
          created.push(rfi.number);
        }
      }

      await audit({
        userId: ctx.user.id,
        projectId: input.projectId,
        action: "daily_program.resync",
        entityType: "daily_program",
        entityId: input.programId,
        metadata: { created: created.length, updated: updated.length, removed: removed.length },
      });

      return { created, updated, removed };
    }),

  requestCancellation: protectedProcedure
    .input(z.object({
      taskId: z.string(),
      projectId: z.string(),
      reason: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertCanWrite(ctx.user, input.projectId);
      const task = await db.dailyProgramTask.findUnique({
        where: { id: input.taskId },
        select: { id: true, cancellationStatus: true },
      });
      if (!task) throw new TRPCError({ code: "NOT_FOUND", message: "Task not found." });
      if (task.cancellationStatus === "pending") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Cancellation already requested for this task." });
      }
      await db.dailyProgramTask.update({
        where: { id: input.taskId },
        data: {
          cancellationStatus: "pending",
          cancellationRequestedAt: new Date(),
          cancellationRequestedBy: ctx.user.id,
          cancellationReason: input.reason,
        },
      });

      // Notify PMs and coordinators that a cancellation request needs review
      await notifyProjectMembers({
        projectId: input.projectId,
        type: "task_cancellation_requested",
        title: "Task cancellation requested",
        message: `A field team requested cancellation of a daily program task. Reason: ${input.reason}`,
        metadata: { taskId: input.taskId },
        excludeUserId: ctx.user.id,
      });

      return { success: true };
    }),

  reviewCancellation: protectedProcedure
    .input(z.object({
      taskId: z.string(),
      projectId: z.string(),
      approved: z.boolean(),
      response: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const role = await assertProjectMember(ctx.user, input.projectId);
      if (role !== "project_manager" && role !== "coordinator") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only PM or coordinator can review cancellations." });
      }
      const task = await db.dailyProgramTask.findUnique({
        where: { id: input.taskId },
        select: { id: true, cancellationStatus: true, taskName: true, cancellationRequestedBy: true },
      });
      if (!task) throw new TRPCError({ code: "NOT_FOUND", message: "Task not found." });
      if (task.cancellationStatus !== "pending") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No pending cancellation for this task." });
      }
      const updateData: any = {
        cancellationRespondedAt: new Date(),
        cancellationApprovedBy: ctx.user.id,
        cancellationResponse: input.response || null,
        cancellationStatus: input.approved ? "approved" : "rejected",
      };
      if (input.approved) {
        updateData.executionStatus = "cancelled";
      }
      await db.dailyProgramTask.update({
        where: { id: input.taskId },
        data: updateData,
      });

      // Notify the requester of the decision
      if (task.cancellationRequestedBy && task.cancellationRequestedBy !== ctx.user.id) {
        await createNotification({
          userId: task.cancellationRequestedBy,
          projectId: input.projectId,
          type: `task_cancellation_${input.approved ? "approved" : "rejected"}`,
          title: `Cancellation ${input.approved ? "approved" : "rejected"}`,
          message: `Your cancellation request for "${task.taskName}" was ${input.approved ? "approved" : "rejected"}.${input.response ? ` Note: ${input.response}` : ""}`,
          metadata: { taskId: input.taskId },
        });
      }

      return { success: true };
    }),

  listPendingCancellations: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      const role = await assertProjectMember(ctx.user, input.projectId);
      if (role !== "project_manager" && role !== "coordinator") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only PM or coordinator can view pending cancellations." });
      }
      const tasks = await db.dailyProgramTask.findMany({
        where: {
          program: { projectId: input.projectId },
          cancellationStatus: "pending",
        },
        orderBy: { cancellationRequestedAt: "desc" },
        include: {
          program: { select: { id: true, programDate: true } },
          rfi: { select: { id: true, number: true, subject: true } },
        },
      });
      return { tasks };
    }),

});
