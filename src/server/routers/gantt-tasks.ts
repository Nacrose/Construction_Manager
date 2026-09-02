/**
 * Gantt task CRUD, CPM calculation, reordering, and daily report sync.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { addDays, differenceInDays } from "date-fns";
import { router, protectedProcedure } from "@/server/trpc";
import { db } from "@/lib/db";
import { getDefaultLibraryId } from "@/lib/default-library";
import { assertProjectMember, assertCanWrite } from "@/lib/authz";
import { audit } from "@/lib/audit";
import { recalculateWbsCodes } from "@/lib/wbs";
import { withOrgContext, withTenantTx } from "@/lib/rls";
import { recalculateProjectSchedule, recalculateProjectScheduleForUser } from "@/server/utils/gantt-cpm-engine";
import { BUILT_IN_TEMPLATES, type WorkPackageTemplateDef } from "@/server/utils/work-package-templates";

// ─── Draft check helper ───────────────────────────────────────
export async function assertVersionIsEditable(taskId: string): Promise<void> {
  const task = await db.ganttTask.findUnique({
    where: { id: taskId },
    select: { versionId: true },
  });
  if (!task) throw new TRPCError({ code: "NOT_FOUND", message: "Task not found." });
  if (!task.versionId) return;
  const version = await db.ganttVersion.findUnique({
    where: { id: task.versionId },
    select: { status: true },
  });
  if (!version) return;
  if (version.status !== "DRAFT") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message:
        "Only draft versions can be edited. This version is " +
        version.status.toLowerCase() +
        ".",
    });
  }
}

const isoStartDate = z.string().transform((v) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T00:00:00.000Z` : v)).pipe(z.string().datetime());
const isoEndDate = z.string().transform((v) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T23:59:59.000Z` : v)).pipe(z.string().datetime());

const CreateTaskSchema = z.object({
  versionId: z.string().optional(),
  selectedCostLibraryId: z.string().nullable().optional(),
  projectId: z.string(),
  name: z.string().min(1).max(300),
  code: z.string().optional(),
  parentId: z.string().nullable().optional(),
  startDate: isoStartDate,
  endDate: isoEndDate,
  duration: z.number().int().min(0).default(1),
  progress: z.number().min(0).max(100).default(0),
  plannedValue: z.number().min(0).default(0),
  laborCount: z.number().int().min(0).default(0),
  isMilestone: z.boolean().default(false),
  dependencies: z.string().optional(),
  sortOrder: z.number().optional(),
  taskType: z.string().optional(),
  notes: z.string().nullable().optional(),
  workHours: z.number().optional(),
  estimated: z.boolean().optional(),
  ignoreResourceCalendar: z.boolean().optional(),
});

const UpdateTaskSchema = z.object({
  versionId: z.string().optional(),
  selectedCostLibraryId: z.string().nullable().optional(),
  taskId: z.string(),
  name: z.string().min(1).max(300).optional(),
  code: z.string().nullable().optional(),
  parentId: z.string().nullable().optional(),
  startDate: isoStartDate.optional(),
  endDate: isoEndDate.optional(),
  actualStartDate: isoStartDate.nullable().optional(),
  actualEndDate: isoEndDate.nullable().optional(),
  duration: z.number().int().min(0).optional(),
  progress: z.number().min(0).max(100).optional(),
  plannedValue: z.number().min(0).optional(),
  laborCount: z.number().int().min(0).optional(),
  isMilestone: z.boolean().optional(),
  dependencies: z.string().nullable().optional(),
  sortOrder: z.number().optional(),
  taskType: z.string().optional(),
  notes: z.string().nullable().optional(),
  workHours: z.number().optional(),
  estimated: z.boolean().optional(),
  ignoreResourceCalendar: z.boolean().optional(),
});

const ReorderSchema = z.object({
  projectId: z.string(),
  taskId: z.string(),
  direction: z.enum(["up", "down", "indent", "outdent"]),
});

export const ganttTasksRouter = router({
  /** List all Gantt tasks for a project. */
  list: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        versionId: z.string().optional(),
        costLibraryId: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);
      const database = db;

      let targetVersionId = input.versionId;
      if (!targetVersionId) {
        let defaultVer = await database.ganttVersion.findFirst({
          where: { projectId: input.projectId, isActive: true },
        });
        if (!defaultVer)
          defaultVer = await database.ganttVersion.findFirst({
            where: { projectId: input.projectId },
          });
        if (defaultVer) targetVersionId = defaultVer.id;
      }

      const whereClause = targetVersionId
        ? { projectId: input.projectId, versionId: targetVersionId }
        : { projectId: input.projectId };

      const defaultLibId =
        input.costLibraryId ?? (await getDefaultLibraryId(input.projectId));
      const ingredientWhere = (
        defaultLibId
          ? { rateAnalysis: { libraryId: defaultLibId } }
          : { rateAnalysis: { library: { purpose: "client_estimate" } } }
      ) as any;

      let tasks = await database.ganttTask.findMany({
        where: whereClause,
        orderBy: { sortOrder: "asc" },
        include: {
          predecessors: true,
          boqLinks: {
            include: {
              boqItem: {
                select: {
                  id: true,
                  code: true,
                  description: true,
                  unit: true,
                  rate: true,
                  rateAnalyses: { include: { library: true } },
                  ingredients: {
                    where: ingredientWhere,
                    select: {
                      id: true,
                      name: true,
                      type: true,
                      calcMode: true,
                      quantity: true,
                      unit: true,
                      percentage: true,
                      pctBase: true,
                      rate: true,
                      amount: true,
                    },
                  },
                },
              },
            },
          },
        },
         take: 1000, // bounded (pagination sweep) — see src/lib/pagination.ts
       });

      if (tasks.length > 0 && tasks.some((t) => !t.code)) {
        // RLS: GanttTask is FORCE-scoped — lazy WBS recode runs on a
        // context-pinned transaction, not the pooled client.
        await withTenantTx(ctx.user, async (tx) => {
          await recalculateWbsCodes(input.projectId, targetVersionId, tx);
        });
        tasks = await database.ganttTask.findMany({
          where: whereClause,
          orderBy: { sortOrder: "asc" },
          include: {
            predecessors: true,
            boqLinks: {
              include: {
                boqItem: {
                  select: {
                    id: true,
                    code: true,
                    description: true,
                    unit: true,
                    rate: true,
                    ingredients: {
                      where: ingredientWhere,
                      select: {
                        id: true,
                        name: true,
                        type: true,
                        calcMode: true,
                        quantity: true,
                        unit: true,
                        percentage: true,
                        pctBase: true,
                        rate: true,
                        amount: true,
                      },
                    },
                  },
                },
              },
            },
          },
           take: 1000, // bounded (pagination sweep) — see src/lib/pagination.ts
         });
      }

      return { tasks };
    }),

  /** Create a new Gantt task. */
  create: protectedProcedure
    .input(CreateTaskSchema)
    .mutation(async ({ ctx, input }) => {
      const role = await assertProjectMember(ctx.user, input.projectId);
      if (role === "client" || role === "inspector") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Your role on this project is read-only.",
        });
      }

      if (input.versionId) {
        // IDOR guard: verify the version belongs to the project the
        // caller was authorized on. Without this, a user with project A
        // access could create tasks in project B's version by passing
        // that version's cuid.
        const version = await db.ganttVersion.findFirst({
          where: { id: input.versionId, projectId: input.projectId },
          select: { status: true },
        });
        if (!version) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Version not found in this project." });
        }
        if (version.status !== "DRAFT") {
          throw new TRPCError({
            code: "FORBIDDEN",
            message:
              "Cannot add tasks to a " + version.status.toLowerCase() + " version.",
          });
        }
      }

      let sortOrder = input.sortOrder;
      if (sortOrder === undefined) {
        const max = await db.ganttTask.aggregate({
          where: input.parentId
            ? { projectId: input.projectId, parentId: input.parentId }
            : { projectId: input.projectId, parentId: null },
          _max: { sortOrder: true },
        });
        sortOrder = (max._max.sortOrder ?? -1) + 1;
      }

      let targetVersionId = input.versionId;
      if (!targetVersionId) {
        const activeVersion = await db.ganttVersion.findFirst({
          where: { projectId: input.projectId, isActive: true },
          select: { id: true, status: true },
        });
        if (activeVersion && activeVersion.status === "DRAFT") {
          targetVersionId = activeVersion.id;
        } else if (activeVersion) {
          targetVersionId = activeVersion.id;
        }
      }

      const task = await withTenantTx(ctx.user, async (tx) => {
        const created = await tx.ganttTask.create({
          data: {
            projectId: input.projectId,
            versionId: targetVersionId,
            parentId: input.parentId ?? null,
            code: input.code,
            name: input.name,
            startDate: new Date(input.startDate),
            endDate: new Date(input.endDate),
            duration: input.duration,
            progress: input.progress,
            selectedCostLibraryId: input.selectedCostLibraryId,
            plannedValue: input.plannedValue,
            laborCount: input.laborCount,
            isMilestone: input.isMilestone,
            dependencies: input.dependencies,
            sortOrder,
          },
        });
        // RLS: GanttTask is FORCE-scoped — recalc must run on the
        // context-pinned tx, not the pooled client.
        await recalculateWbsCodes(input.projectId, targetVersionId, tx);
        return created;
      });

      await audit({
        userId: ctx.user.id,
        projectId: input.projectId,
        action: "gantt.create",
        entityType: "gantt_task",
        entityId: task.id,
        metadata: { name: task.name },
      });

      const withCode = await db.ganttTask.findUnique({ where: { id: task.id } });
      return { task: withCode ?? task };
    }),

  /** Update an existing Gantt task (patch). */
  update: protectedProcedure
    .input(UpdateTaskSchema)
    .mutation(async ({ ctx, input }) => {
      const { taskId, ...data } = input;

      const task = await db.ganttTask.findUnique({
        where: { id: input.taskId },
        select: { id: true, projectId: true, versionId: true, name: true, duration: true },
      });
      if (!task) throw new TRPCError({ code: "NOT_FOUND", message: "Task not found." });

      await assertVersionIsEditable(input.taskId);

      const role = await assertProjectMember(ctx.user, task.projectId);
      if (role === "client" || role === "inspector") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Your role on this project is read-only.",
        });
      }

      // RLS: GanttTask is FORCE-scoped — the write AND the recalculations
      // run inside one context-pinned transaction (atomic: the persisted
      // dates always match the dependency graph or none of it changes).
      const structureChanged =
        data.parentId !== undefined || data.sortOrder !== undefined;
      const dateChanged =
        data.startDate !== undefined ||
        data.endDate !== undefined ||
        data.duration !== undefined ||
        data.dependencies !== undefined;

      const updated = await withTenantTx(ctx.user, async (tx) => {
        const u = await tx.ganttTask.update({
          where: { id: taskId },
          data: {
            ...(data.name !== undefined && { name: data.name }),
            ...(data.code !== undefined && { code: data.code }),
            ...(data.parentId !== undefined && { parentId: data.parentId }),
            ...(data.startDate !== undefined && {
              startDate: new Date(data.startDate),
            }),
            ...(data.endDate !== undefined && { endDate: new Date(data.endDate) }),
            ...(data.actualStartDate !== undefined && {
              actualStartDate: data.actualStartDate
                ? new Date(data.actualStartDate)
                : null,
            }),
            ...(data.actualEndDate !== undefined && {
              actualEndDate: data.actualEndDate ? new Date(data.actualEndDate) : null,
            }),
            ...(data.duration !== undefined && { duration: data.duration }),
            ...(data.progress !== undefined && {
              progress: data.progress,
              isProgressEdited: true,
            }),
            ...(data.plannedValue !== undefined && {
              plannedValue: data.plannedValue,
            }),
            ...(data.laborCount !== undefined && { laborCount: data.laborCount }),
            ...(data.isMilestone !== undefined && { isMilestone: data.isMilestone }),
            ...(data.dependencies !== undefined && {
              dependencies: data.dependencies,
            }),
            ...(data.sortOrder !== undefined && { sortOrder: data.sortOrder }),
            ...(data.taskType !== undefined && { taskType: data.taskType }),
            ...(data.notes !== undefined && { notes: data.notes }),
            ...(data.workHours !== undefined && { workHours: data.workHours }),
            ...(data.estimated !== undefined && { estimated: data.estimated }),
            ...(data.ignoreResourceCalendar !== undefined && {
              ignoreResourceCalendar: data.ignoreResourceCalendar,
            }),
          },
        });

        if (structureChanged) {
          await recalculateWbsCodes(task.projectId, task.versionId, tx);
        }

        // Automatically cascade downstream dates if dates, duration, or
        // dependencies changed. (The legacy inline "mini-CPM" that used to
        // live here duplicated ~50 lines of 24h-calendar arithmetic from
        // the engine — without calendar awareness — and its result was
        // immediately overwritten by this full recalculation. Deleted;
        // the engine is the single scheduling authority.)
        if (dateChanged) {
          await recalculateProjectSchedule(task.projectId, task.versionId, {
            useCalendar: true,
            tx,
          });
        }
        return u;
      });

      const refreshed = structureChanged || dateChanged
        ? await db.ganttTask.findUnique({ where: { id: taskId } })
        : updated;

      await audit({
        userId: ctx.user.id,
        projectId: task.projectId,
        action: "gantt.update",
        entityType: "gantt_task",
        entityId: taskId,
        metadata: { name: task.name, changes: data },
      });

      return { task: refreshed ?? updated };
    }),

  /** Delete a task. */
  delete: protectedProcedure
    .input(z.object({ taskId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const task = await db.ganttTask.findUnique({
        where: { id: input.taskId },
        select: { id: true, projectId: true, versionId: true, name: true, duration: true },
      });
      if (!task) throw new TRPCError({ code: "NOT_FOUND", message: "Task not found." });

      await assertVersionIsEditable(input.taskId);

      const role = await assertProjectMember(ctx.user, task.projectId);
      if (role === "client" || role === "inspector") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Your role on this project is read-only.",
        });
      }

      // RLS: delete + both recalculations atomically, with tenant context
      // pinned (GanttTask is FORCE-scoped — pooled writes/recalcs can
      // silently no-op when the session-level GUC is lost to pool rotation).
      await withTenantTx(ctx.user, async (tx) => {
        await tx.ganttTask.delete({ where: { id: input.taskId } });
        await recalculateWbsCodes(task.projectId, task.versionId, tx);
        await recalculateProjectSchedule(task.projectId, task.versionId, {
          useCalendar: true,
          tx,
        });
      });

      await audit({
        userId: ctx.user.id,
        projectId: task.projectId,
        action: "gantt.delete",
        entityType: "gantt_task",
        entityId: input.taskId,
        metadata: { name: task.name },
      });

      return { ok: true };
    }),

  /** Recalculate all task dates based on dependency constraints (CPM forward pass). */
  calculateAll: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        versionId: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const role = await assertProjectMember(ctx.user, input.projectId);
      if (role === "client" || role === "inspector") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Your role on this project is read-only.",
        });
      }

      const { updatedCount, cycleDetected, cyclicTaskNames, criticalPath, durationMismatches } =
        await recalculateProjectScheduleForUser(ctx.user, input.projectId, input.versionId);

      return {
        updatedCount,
        criticalPath,
        durationMismatches,
        ...(cycleDetected
          ? {
              warning: `Circular dependency detected involving: ${cyclicTaskNames.join(", ")}. These tasks could not be scheduled.`,
            }
          : {}),
        ...(durationMismatches.length > 0
          ? {
              durationWarning:
                `${durationMismatches.length} task(s) have a stored duration that ` +
                `disagrees with their date span (e.g. "${durationMismatches[0].name}": ` +
                `duration ${durationMismatches[0].duration}d vs dates implying ` +
                `${durationMismatches[0].impliedDurationDays}d). They keep their authored ` +
                `dates until a dependency is added.`,
            }
          : {}),
      };
    }),

  /** Reorder a task (up/down/indent/outdent). */
  reorder: protectedProcedure
    .input(ReorderSchema)
    .mutation(async ({ ctx, input }) => {
      const role = await assertProjectMember(ctx.user, input.projectId);
      if (role === "client" || role === "inspector") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Your role on this project is read-only.",
        });
      }

      const task = await db.ganttTask.findUnique({
        where: { id: input.taskId },
        select: {
          id: true,
          parentId: true,
          sortOrder: true,
          name: true,
          projectId: true,
          versionId: true,
        },
      });
      if (!task || task.projectId !== input.projectId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Task not found." });
      }

      await assertVersionIsEditable(input.taskId);

      const siblings = await db.ganttTask.findMany({
        where: { projectId: input.projectId, parentId: task.parentId },
        orderBy: { sortOrder: "asc" },
        select: { id: true, sortOrder: true, parentId: true },
      });
      const idx = siblings.findIndex((s) => s.id === input.taskId);
      if (idx < 0)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Task not found among siblings.",
        });

      if (input.direction === "up") {
        if (idx === 0)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Already the first sibling.",
          });
        const prev = siblings[idx - 1];
        // Converted from array-form $transaction (RLS phase 3c): GanttTask
        // is FORCE-scoped — updates need transaction-scoped org context.
        await db.$transaction(async (tx) => {
          await withOrgContext(tx, ctx.user.organizationId, !!ctx.user.isSuperAdmin); // RLS: GanttTask is FORCE-scoped (phase 3c)
          await tx.ganttTask.update({
            where: { id: input.taskId },
            data: { sortOrder: prev.sortOrder },
          });
          await tx.ganttTask.update({
            where: { id: prev.id },
            data: { sortOrder: task.sortOrder },
          });
        });
      } else if (input.direction === "down") {
        if (idx === siblings.length - 1)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Already the last sibling.",
          });
        const next = siblings[idx + 1];
        // Converted from array-form $transaction (RLS phase 3c): GanttTask
        // is FORCE-scoped — updates need transaction-scoped org context.
        await db.$transaction(async (tx) => {
          await withOrgContext(tx, ctx.user.organizationId, !!ctx.user.isSuperAdmin); // RLS: GanttTask is FORCE-scoped (phase 3c)
          await tx.ganttTask.update({
            where: { id: input.taskId },
            data: { sortOrder: next.sortOrder },
          });
          await tx.ganttTask.update({
            where: { id: next.id },
            data: { sortOrder: task.sortOrder },
          });
        });
      } else if (input.direction === "indent") {
        if (idx === 0)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Cannot indent the first sibling.",
          });
        const newParent = siblings[idx - 1];
        const maxChild = await db.ganttTask.aggregate({
          where: { projectId: input.projectId, parentId: newParent.id },
          _max: { sortOrder: true },
        });
        const newSort = (maxChild._max.sortOrder ?? -1) + 1;
        // RLS: GanttTask is FORCE-scoped — writes need context-pinned tx.
        await withTenantTx(ctx.user, async (tx) => {
          await tx.ganttTask.update({
            where: { id: input.taskId },
            data: { parentId: newParent.id, sortOrder: newSort },
          });
        });
      } else if (input.direction === "outdent") {
        if (!task.parentId)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Cannot outdent a top-level task.",
          });
        const parent = await db.ganttTask.findUnique({
          where: { id: task.parentId },
          select: { id: true, parentId: true, sortOrder: true },
        });
        if (!parent)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Parent task not found.",
          });
        const parentSiblings = await db.ganttTask.findMany({
          where: { projectId: input.projectId, parentId: parent.parentId },
          orderBy: { sortOrder: "asc" },
          select: { id: true, sortOrder: true },
        });
        const toBump = parentSiblings.filter((s) => s.sortOrder > parent.sortOrder);
        // Converted from array-form $transaction (RLS phase 3c): GanttTask
        // is FORCE-scoped — updates need transaction-scoped org context.
        await db.$transaction(async (tx) => {
          await withOrgContext(tx, ctx.user.organizationId, !!ctx.user.isSuperAdmin); // RLS: GanttTask is FORCE-scoped (phase 3c)
          for (const s of toBump) {
            await tx.ganttTask.update({
              where: { id: s.id },
              data: { sortOrder: s.sortOrder + 1 },
            });
          }
          await tx.ganttTask.update({
            where: { id: input.taskId },
            data: {
              parentId: parent.parentId,
              sortOrder: parent.sortOrder + 1,
            },
          });
        });
      }

      // RLS: WBS recode on the context-pinned tx (GanttTask is FORCE-scoped;
      // the pooled recode silently saw 0 tasks when the session GUC was lost).
      await withTenantTx(ctx.user, async (tx) => {
        await recalculateWbsCodes(input.projectId, task.versionId, tx);
      });

      await audit({
        userId: ctx.user.id,
        projectId: input.projectId,
        action: "gantt.reorder",
        entityType: "gantt_task",
        entityId: input.taskId,
        metadata: { direction: input.direction, name: task.name },
      });

      return { ok: true };
    }),

  /** Move a task before/after another task or as its child. */
  move: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        taskId: z.string(),
        targetTaskId: z.string(),
        position: z.enum(["before", "after", "asChild"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const role = await assertProjectMember(ctx.user, input.projectId);
      if (role === "client" || role === "inspector") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Your role on this project is read-only.",
        });
      }

      const task = await db.ganttTask.findUnique({
        where: { id: input.taskId },
        select: {
          id: true,
          parentId: true,
          sortOrder: true,
          name: true,
          projectId: true,
          versionId: true,
        },
      });
      if (!task || task.projectId !== input.projectId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Task not found." });
      }

      await assertVersionIsEditable(input.taskId);

      const target = await db.ganttTask.findUnique({
        where: { id: input.targetTaskId },
        select: { id: true, parentId: true, sortOrder: true },
      });
      if (!target) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Target task not found.",
        });
      }

      if (input.taskId === input.targetTaskId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot move a task relative to itself.",
        });
      }

      if (input.position === "asChild") {
        // Prevent cyclic parent-child hierarchy loop (moving a task into one of its own descendants)
        let currAncestor: string | null = target.parentId;
        while (currAncestor) {
          if (currAncestor === input.taskId) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Cannot move a task into one of its own descendant subtasks.",
            });
          }
          const p = await db.ganttTask.findUnique({
            where: { id: currAncestor },
            select: { parentId: true },
          });
          currAncestor = p?.parentId ?? null;
        }

        const maxChild = await db.ganttTask.aggregate({
          where: { projectId: input.projectId, parentId: target.id },
          _max: { sortOrder: true },
        });
        const newSort = (maxChild._max.sortOrder ?? -1) + 1;
        await withTenantTx(ctx.user, async (tx) => {
          await tx.ganttTask.update({
            where: { id: input.taskId },
            data: { parentId: target.id, sortOrder: newSort },
          });
        });
      } else {
        let siblings = await db.ganttTask.findMany({
          where: { projectId: input.projectId, parentId: target.parentId },
          orderBy: { sortOrder: "asc" },
          select: { id: true, sortOrder: true },
        });

        siblings = siblings.filter((s) => s.id !== input.taskId);

        const targetIdx = siblings.findIndex((s) => s.id === input.targetTaskId);
        if (targetIdx < 0)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Target not found among siblings.",
          });

        const insertIdx = input.position === "before" ? targetIdx : targetIdx + 1;
        siblings.splice(insertIdx, 0, { id: input.taskId, sortOrder: 0 });

        // Converted from array-form $transaction (RLS): GanttTask is
        // FORCE-scoped — array form cannot set the org GUC, so this runs
        // as an interactive transaction with tenant context.
        await withTenantTx(ctx.user, async (tx) => {
          for (let i = 0; i < siblings.length; i++) {
            await tx.ganttTask.update({
              where: { id: siblings[i].id },
              data: { sortOrder: (i + 1) * 10, parentId: target.parentId },
            });
          }
        });
      }

      await withTenantTx(ctx.user, async (tx) => {
        await recalculateWbsCodes(input.projectId, task.versionId, tx);
      });

      await audit({
        userId: ctx.user.id,
        projectId: input.projectId,
        action: "gantt.move",
        entityType: "gantt_task",
        entityId: input.taskId,
        metadata: {
          name: task.name,
          targetId: input.targetTaskId,
          position: input.position,
        },
      });

      return { ok: true };
    }),

  /** Sync daily report progress to execution schedule tasks. */
  syncDailyReports: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        executionVersionId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertCanWrite(ctx.user, input.projectId);

      const execVersion = await db.ganttVersion.findFirst({
        where: { id: input.executionVersionId, projectId: input.projectId },
        select: { id: true },
      });
      if (!execVersion) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Gantt execution version not found for this project." });
      }

      const [reports, progressItems, tasks] = await Promise.all([
        db.dailyReport.findMany({
          where: { projectId: input.projectId },
          select: { id: true, reportDate: true },
          orderBy: { reportDate: "asc" },
        }),
        db.dailyReportProgress.findMany({
          where: {
            report: { projectId: input.projectId },
            ganttTaskId: { not: null },
          },
          include: {
            report: { select: { reportDate: true } },
          },
          orderBy: { report: { reportDate: "asc" } },
        }),
        db.ganttTask.findMany({
          where: { versionId: input.executionVersionId, projectId: input.projectId },
          include: { boqLinks: true },
        }),
      ]);

      const taskActuals = new Map<
        string,
        {
          totalActualQty: number;
          earliestDate: Date | null;
          latestDate: Date | null;
        }
      >();

      for (const item of progressItems) {
        if (!item.ganttTaskId) continue;
        const entry = taskActuals.get(item.ganttTaskId) ?? {
          totalActualQty: 0,
          earliestDate: null,
          latestDate: null,
        };
        const qty = item.actualQty || 0;
        entry.totalActualQty += qty;

        const reportDate = new Date(item.report.reportDate);
        if (qty > 0) {
          if (!entry.earliestDate || reportDate < entry.earliestDate) {
            entry.earliestDate = reportDate;
          }
          if (!entry.latestDate || reportDate > entry.latestDate) {
            entry.latestDate = reportDate;
          }
        }
        taskActuals.set(item.ganttTaskId, entry);
      }

      let updated = 0;
      const pendingUpdates: Array<{
        id: string;
        data: {
          progress: number;
          actualStartDate: Date | null;
          actualEndDate: Date | null;
          isProgressEdited: boolean;
        };
      }> = [];

      for (const task of tasks) {
        const actualData = taskActuals.get(task.id);
        if (!actualData) continue;

        const totalPlannedQty = task.boqLinks.reduce(
          (sum, link) => sum + (link.quantity || 0),
          0
        );

        let newProgress = task.progress;
        if (totalPlannedQty > 0) {
          newProgress = Math.min(
            100,
            Math.round((actualData.totalActualQty / totalPlannedQty) * 100)
          );
        } else if (actualData.totalActualQty > 0) {
          newProgress = 100;
        }

        const newActualStart = actualData.earliestDate ?? task.actualStartDate;
        const newActualEnd =
          newProgress >= 100 ? (actualData.latestDate ?? task.actualEndDate) : null;

        const hasChanged =
          Math.abs(newProgress - task.progress) > 0.01 ||
          newActualStart?.getTime() !== task.actualStartDate?.getTime() ||
          newActualEnd?.getTime() !== task.actualEndDate?.getTime();

        if (hasChanged) {
          updated++;
          pendingUpdates.push({
            id: task.id,
            data: {
              progress: newProgress,
              actualStartDate: newActualStart,
              actualEndDate: newActualEnd,
              isProgressEdited: true,
            },
          });
        }
      }

      // RLS: GanttTask is FORCE-scoped — the batch runs in one
      // context-pinned transaction (also atomic: no half-synced progress).
      if (pendingUpdates.length > 0) {
        await withTenantTx(ctx.user, async (tx) => {
          for (const p of pendingUpdates) {
            await tx.ganttTask.update({ where: { id: p.id }, data: p.data });
          }
        });
      }

      await audit({
        userId: ctx.user.id,
        projectId: input.projectId,
        action: "gantt.syncDailyReports",
        entityType: "gantt_version",
        entityId: input.executionVersionId,
        metadata: { updated, totalReports: reports.length },
      });

      return { updated, totalReports: reports.length };
    }),

  /** List all standard built-in templates and custom saved templates for the project/organization. */
  listTemplates: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);
      const project = await db.project.findUnique({
        where: { id: input.projectId },
        select: { organizationId: true },
      });

      const customTemplates = await db.ganttTaskTemplate.findMany({
        where: {
          OR: [
            { projectId: input.projectId },
            ...(project?.organizationId ? [{ organizationId: project.organizationId }] : []),
          ],
        },
        orderBy: { createdAt: "desc" },
        take: 500, // template reference list; cap is a safety net
      });

      const formattedCustom: WorkPackageTemplateDef[] = customTemplates.map((t) => {
        let parsedData: any = {};
        try {
          parsedData = JSON.parse(t.data);
        } catch {
          parsedData = { subtasks: [], totalDurationDays: 1, subtaskCount: 0 };
        }
        return {
          id: t.id,
          name: t.name,
          category: "custom",
          categoryLabel: "My Saved Templates",
          description: t.description || "Custom project work package template",
          tags: ["Custom", "Project Saved"],
          totalDurationDays: parsedData.totalDurationDays || 1,
          subtaskCount: parsedData.subtasks?.length || 0,
          subtasks: parsedData.subtasks || [],
        };
      });

      return {
        templates: [...BUILT_IN_TEMPLATES, ...formattedCustom],
      };
    }),

  /** Save an existing task branch as a reusable Work Package Template. */
  saveAsTemplate: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        taskId: z.string(),
        name: z.string().min(1).max(200),
        category: z.string().default("custom"),
        description: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertCanWrite(ctx.user, input.projectId);
      const project = await db.project.findUnique({
        where: { id: input.projectId },
        select: { organizationId: true },
      });

      const allTasks = await db.ganttTask.findMany({
        where: { projectId: input.projectId },
        include: { predecessors: true },
      });

      const rootTask = allTasks.find((t) => t.id === input.taskId);
      if (!rootTask) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Source task not found" });
      }

      // Collect all descendants recursively
      const subtreeMap = new Map<string, typeof rootTask>();
      subtreeMap.set(rootTask.id, rootTask);
      let added = true;
      while (added) {
        added = false;
        for (const t of allTasks) {
          if (t.parentId && subtreeMap.has(t.parentId) && !subtreeMap.has(t.id)) {
            subtreeMap.set(t.id, t);
            added = true;
          }
        }
      }

      const tasksInSubtree = Array.from(subtreeMap.values());
      const childTasks = tasksInSubtree.filter((t) => t.id !== rootTask.id);

      // Map task IDs to sequential temp IDs "1", "2", ...
      const idToTempId = new Map<string, string>();
      childTasks.forEach((t, idx) => {
        idToTempId.set(t.id, String(idx + 1));
      });

      const subtasks = childTasks.map((t, idx) => {
        const predecessors = (t.predecessors || [])
          .filter((p) => idToTempId.has(p.predecessorId))
          .map((p) => ({
            tempId: idToTempId.get(p.predecessorId)!,
            type: p.type as "FS" | "SS" | "FF" | "SF",
            offset: p.offset || 0,
          }));

        return {
          tempId: String(idx + 1),
          name: t.name,
          duration: t.duration || 1,
          taskType: t.taskType,
          laborCount: t.laborCount || 0,
          isMilestone: t.isMilestone,
          predecessorTempIds: predecessors,
        };
      });

      const totalDurationDays = rootTask.duration || 1;

      const template = await db.ganttTaskTemplate.create({
        data: {
          organizationId: project?.organizationId || null,
          projectId: input.projectId,
          name: input.name,
          category: input.category,
          description: input.description || `Saved from task ${rootTask.name}`,
          data: JSON.stringify({
            subtasks,
            totalDurationDays,
          }),
          createdById: ctx.user.id,
        },
      });

      await audit({
        userId: ctx.user.id,
        projectId: input.projectId,
        action: "gantt.saveTemplate",
        entityType: "gantt_template",
        entityId: template.id,
        metadata: { name: input.name, subtaskCount: subtasks.length },
      });

      return { templateId: template.id, name: template.name };
    }),

  /** Insert a full work package hierarchy from a template with automated date offsets and dependencies. */
  insertFromTemplate: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        versionId: z.string().optional(),
        templateId: z.string(),
        targetParentId: z.string().nullable().optional(),
        startDate: z.string(),
        customName: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertCanWrite(ctx.user, input.projectId);
      const rootStartDate = new Date(input.startDate);

      // IDOR guard on versionId: verify the version belongs to the
      // project the caller was authorized on.
      if (input.versionId) {
        const version = await db.ganttVersion.findFirst({
          where: { id: input.versionId, projectId: input.projectId },
          select: { id: true },
        });
        if (!version) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Version not found in this project." });
        }
      }

      let templateDef: WorkPackageTemplateDef | null = null;
      if (input.templateId.startsWith("builtin-")) {
        templateDef = BUILT_IN_TEMPLATES.find((t) => t.id === input.templateId) || null;
      } else {
        const custom = await db.ganttTaskTemplate.findUnique({
          where: { id: input.templateId },
        });
        if (custom) {
          // IDOR guard on template: organization-scoped templates are
          // only usable by members of that org. Project-scoped templates
          // require project membership (already enforced above). Global
          // templates (organizationId == null AND projectId == null)
          // are usable by anyone.
          if (custom.organizationId && custom.organizationId !== ctx.user.organizationId) {
            throw new TRPCError({
              code: "FORBIDDEN",
              message: "Template belongs to a different organization.",
            });
          }
          try {
            const parsed = JSON.parse(custom.data);
            templateDef = {
              id: custom.id,
              name: custom.name,
              category: "custom",
              categoryLabel: "My Saved Templates",
              description: custom.description || "",
              tags: ["Custom"],
              totalDurationDays: parsed.totalDurationDays || 1,
              subtaskCount: parsed.subtasks?.length || 0,
              subtasks: parsed.subtasks || [],
            };
          } catch {
            templateDef = null;
          }
        }
      }

      if (!templateDef) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Template not found" });
      }

      // Simulate forward pass for subtasks to compute start offsets
      const subtaskDates = new Map<string, { startOffset: number; endOffset: number; duration: number }>();
      for (const st of templateDef.subtasks) {
        let maxPredEnd = 0;
        for (const pred of st.predecessorTempIds || []) {
          const predDates = subtaskDates.get(pred.tempId);
          if (predDates) {
            if (pred.type === "SS") {
              maxPredEnd = Math.max(maxPredEnd, predDates.startOffset + pred.offset);
            } else if (pred.type === "FF") {
              maxPredEnd = Math.max(maxPredEnd, predDates.endOffset + pred.offset - st.duration);
            } else {
              maxPredEnd = Math.max(maxPredEnd, predDates.endOffset + pred.offset);
            }
          }
        }
        subtaskDates.set(st.tempId, {
          startOffset: maxPredEnd,
          endOffset: maxPredEnd + st.duration,
          duration: st.duration,
        });
      }

      const totalSpanDays = Math.max(
        1,
        ...Array.from(subtaskDates.values()).map((d) => d.endOffset),
        templateDef.totalDurationDays
      );
      const rootEndDate = addDays(rootStartDate, totalSpanDays - 1);

      const maxSort = await db.ganttTask.aggregate({
        where: { projectId: input.projectId },
        _max: { sortOrder: true },
      });
      let nextSort = (maxSort._max.sortOrder ?? 0) + 10;

      // Determine active version
      let targetVersionId = input.versionId;
      if (!targetVersionId) {
        const activeVer = await db.ganttVersion.findFirst({
          where: { projectId: input.projectId, isActive: true },
          select: { id: true },
        });
        targetVersionId = activeVer?.id;
      }

      // RLS: GanttTask is FORCE-scoped — the whole multi-step insert
      // (parent + subtasks + dependencies + WBS + CPM recalc) runs as ONE
      // context-pinned transaction: either the template lands complete
      // or nothing lands.
      const parentTask = await withTenantTx(ctx.user, async (tx) => {
        const parent = await tx.ganttTask.create({
          data: {
            projectId: input.projectId,
            versionId: targetVersionId,
            parentId: input.targetParentId || null,
            name: input.customName || templateDef.name,
            startDate: rootStartDate,
            endDate: rootEndDate,
            duration: totalSpanDays,
            progress: 0,
            sortOrder: nextSort++,
            taskType: "fixed_duration",
          },
        });

        const tempIdToDbId = new Map<string, string>();

        for (const st of templateDef.subtasks) {
          const offsetInfo = subtaskDates.get(st.tempId) || { startOffset: 0, endOffset: st.duration, duration: st.duration };
          const stStart = addDays(rootStartDate, offsetInfo.startOffset);
          const stEnd = addDays(rootStartDate, Math.max(0, offsetInfo.endOffset - 1));

          const createdSub = await tx.ganttTask.create({
            data: {
              projectId: input.projectId,
              versionId: targetVersionId,
              parentId: parent.id,
              name: st.name,
              startDate: stStart,
              endDate: stEnd,
              duration: st.duration,
              progress: 0,
              laborCount: st.laborCount || 0,
              taskType: st.taskType || "fixed_duration",
              isMilestone: st.isMilestone || false,
              sortOrder: nextSort++,
            },
          });
          tempIdToDbId.set(st.tempId, createdSub.id);
        }

        // Create dependency connections
        for (const st of templateDef.subtasks) {
          const succId = tempIdToDbId.get(st.tempId);
          if (!succId) continue;
          for (const pred of st.predecessorTempIds || []) {
            const predId = tempIdToDbId.get(pred.tempId);
            if (!predId) continue;
            await tx.taskDependency.create({
              data: {
                predecessorId: predId,
                successorId: succId,
                type: pred.type || "FS",
                offset: pred.offset || 0,
              },
            }).catch(() => {});
          }
        }

        await recalculateWbsCodes(input.projectId, targetVersionId, tx);
        await recalculateProjectSchedule(input.projectId, targetVersionId, {
          useCalendar: true,
          tx,
        });
        return parent;
      });

      await audit({
        userId: ctx.user.id,
        projectId: input.projectId,
        action: "gantt.insertTemplate",
        entityType: "gantt_task",
        entityId: parentTask.id,
        metadata: { templateId: input.templateId, subtaskCount: templateDef.subtasks.length },
      });

      return { parentTaskId: parentTask.id, name: parentTask.name };
    }),

  /** Directly replicate an existing task branch, shifting all dates to a new start date with dependencies intact. */
  replicateBranch: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        versionId: z.string().optional(),
        taskId: z.string(),
        newStartDate: z.string(),
        newName: z.string().optional(),
        targetParentId: z.string().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertCanWrite(ctx.user, input.projectId);

      // IDOR guard on versionId.
      if (input.versionId) {
        const version = await db.ganttVersion.findFirst({
          where: { id: input.versionId, projectId: input.projectId },
          select: { id: true },
        });
        if (!version) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Version not found in this project." });
        }
      }

      let targetVersionId = input.versionId;
      if (!targetVersionId) {
        const activeVer = await db.ganttVersion.findFirst({
          where: { projectId: input.projectId, isActive: true },
          select: { id: true },
        });
        targetVersionId = activeVer?.id;
      }

      const allTasks = await db.ganttTask.findMany({
        where: {
          projectId: input.projectId,
          ...(targetVersionId ? { versionId: targetVersionId } : {}),
        },
        include: { predecessors: true, boqLinks: true },
      });

      const rootTask = allTasks.find((t) => t.id === input.taskId);
      if (!rootTask) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Source task not found" });
      }

      // Collect subtree
      const subtreeMap = new Map<string, typeof rootTask>();
      subtreeMap.set(rootTask.id, rootTask);
      let added = true;
      while (added) {
        added = false;
        for (const t of allTasks) {
          if (t.parentId && subtreeMap.has(t.parentId) && !subtreeMap.has(t.id)) {
            subtreeMap.set(t.id, t);
            added = true;
          }
        }
      }

      const tasksInSubtree = Array.from(subtreeMap.values());
      const origStart = new Date(rootTask.startDate);
      const targetStart = new Date(input.newStartDate);
      const dayOffset = differenceInDays(targetStart, origStart);

      const maxSort = await db.ganttTask.aggregate({
        where: { projectId: input.projectId },
        _max: { sortOrder: true },
      });
      let nextSort = (maxSort._max.sortOrder ?? 0) + 10;

      const oldToNewId = new Map<string, string>();

      // Create root clone first
      const rootNewStart = addDays(new Date(rootTask.startDate), dayOffset);
      const rootNewEnd = addDays(new Date(rootTask.endDate), dayOffset);

      // RLS: GanttTask is FORCE-scoped — the whole clone (root + subtasks
      // + dependencies + WBS + CPM recalc) runs as ONE context-pinned
      // transaction: either the branch lands complete or nothing lands.
      const clonedRoot = await withTenantTx(ctx.user, async (tx) => {
        const root = await tx.ganttTask.create({
          data: {
            projectId: input.projectId,
            versionId: targetVersionId,
            parentId: input.targetParentId !== undefined ? input.targetParentId : rootTask.parentId,
            name: input.newName || `${rootTask.name} (Copy)`,
            startDate: rootNewStart,
            endDate: rootNewEnd,
            duration: rootTask.duration,
          progress: 0,
          plannedValue: rootTask.plannedValue,
          laborCount: rootTask.laborCount,
          assignees: rootTask.assignees,
          taskType: rootTask.taskType,
          isMilestone: rootTask.isMilestone,
          workHours: rootTask.workHours,
          constraintType: rootTask.constraintType,
          constraintDate: rootTask.constraintDate ? addDays(new Date(rootTask.constraintDate), dayOffset) : null,
          deadline: rootTask.deadline ? addDays(new Date(rootTask.deadline), dayOffset) : null,
          notes: rootTask.notes,
          effortDriven: rootTask.effortDriven,
          estimated: rootTask.estimated,
          ignoreResourceCalendar: rootTask.ignoreResourceCalendar,
          priority: rootTask.priority,
          earnedValueMethod: rootTask.earnedValueMethod,
          sortOrder: nextSort,
          boqLinks: {
            create: rootTask.boqLinks.map((link) => ({
              boqItemId: link.boqItemId,
              quantity: link.quantity,
            })),
          },
        },
      });
      oldToNewId.set(rootTask.id, root.id);
      nextSort++;

      // Create subtasks in hierarchy order
      const subtasks = tasksInSubtree.filter((t) => t.id !== rootTask.id);
      for (const st of subtasks) {
        const parentId = oldToNewId.get(st.parentId || "") || root.id;
        const stStart = addDays(new Date(st.startDate), dayOffset);
        const stEnd = addDays(new Date(st.endDate), dayOffset);

        const clonedSub = await tx.ganttTask.create({
          data: {
            projectId: input.projectId,
            versionId: targetVersionId,
            parentId,
            name: st.name,
            startDate: stStart,
            endDate: stEnd,
            duration: st.duration,
            progress: 0,
            plannedValue: st.plannedValue,
            laborCount: st.laborCount,
            assignees: st.assignees,
            taskType: st.taskType,
            isMilestone: st.isMilestone,
            workHours: st.workHours,
            constraintType: st.constraintType,
            constraintDate: st.constraintDate ? addDays(new Date(st.constraintDate), dayOffset) : null,
            deadline: st.deadline ? addDays(new Date(st.deadline), dayOffset) : null,
            notes: st.notes,
            effortDriven: st.effortDriven,
            estimated: st.estimated,
            ignoreResourceCalendar: st.ignoreResourceCalendar,
            priority: st.priority,
            earnedValueMethod: st.earnedValueMethod,
            sortOrder: nextSort++,
            boqLinks: {
              create: st.boqLinks.map((link) => ({
                boqItemId: link.boqItemId,
                quantity: link.quantity,
              })),
            },
          },
        });
        oldToNewId.set(st.id, clonedSub.id);
      }

      // Recreate internal dependency links between cloned tasks
      for (const t of tasksInSubtree) {
        const newSuccId = oldToNewId.get(t.id);
        if (!newSuccId) continue;
        for (const pred of t.predecessors || []) {
          const newPredId = oldToNewId.get(pred.predecessorId);
          if (!newPredId) continue;
          await tx.taskDependency.create({
            data: {
              predecessorId: newPredId,
              successorId: newSuccId,
              type: pred.type,
              offset: pred.offset,
            },
          }).catch(() => {});
        }
      }

        await recalculateWbsCodes(input.projectId, targetVersionId, tx);
        await recalculateProjectSchedule(input.projectId, targetVersionId, {
          useCalendar: true,
          tx,
        });
        return root;
      });

      await audit({
        userId: ctx.user.id,
        projectId: input.projectId,
        action: "gantt.replicateBranch",
        entityType: "gantt_task",
        entityId: clonedRoot.id,
        metadata: { sourceTaskId: input.taskId, clonedCount: tasksInSubtree.length },
      });

      return { rootTaskId: clonedRoot.id, name: clonedRoot.name, totalCloned: tasksInSubtree.length };
    }),

  /** Delete a custom saved template. */
  deleteTemplate: protectedProcedure
    .input(z.object({ templateId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const template = await db.ganttTaskTemplate.findUnique({
        where: { id: input.templateId },
      });
      if (!template) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Template not found" });
      }
      if (template.projectId) {
        await assertCanWrite(ctx.user, template.projectId);
      }
      await db.ganttTaskTemplate.delete({
        where: { id: input.templateId },
      });
      return { success: true };
    }),
});
