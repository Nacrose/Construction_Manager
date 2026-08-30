/**
 * Gantt task dependencies, BOQ item links, and cycle detection router.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "@/server/trpc";
import { db } from "@/lib/db";
import { getDefaultLibraryId } from "@/lib/default-library";
import { assertProjectMember } from "@/lib/authz";
import { audit } from "@/lib/audit";
import { assertVersionIsEditable } from "./gantt-tasks";
import {
  detectCycle,
  recalculateProjectScheduleForUser,
} from "@/server/utils/gantt-cpm-engine";

const LinkBoqSchema = z.object({
  taskId: z.string(),
  boqItemId: z.string().min(1),
  quantity: z.number().min(0).default(0),
});

export const ganttDependenciesRouter = router({
  /** Get BOQ links for a task. */
  listBoqLinks: protectedProcedure
    .input(z.object({ taskId: z.string() }))
    .query(async ({ ctx, input }) => {
      const task = await db.ganttTask.findUnique({
        where: { id: input.taskId },
        select: { id: true, projectId: true },
      });
      if (!task) throw new TRPCError({ code: "NOT_FOUND", message: "Task not found." });
      await assertProjectMember(ctx.user, task.projectId);

      const defaultLibId = await getDefaultLibraryId(task.projectId);
      const ingredientFilter = defaultLibId
        ? { rateAnalysis: { libraryId: defaultLibId } }
        : { rateAnalysis: { library: { purpose: "client_estimate" as const } } };

      const links = await db.taskBoqLink.findMany({
        where: { taskId: input.taskId },
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
        orderBy: { createdAt: "asc" },
      });

      return { links };
    }),

  /** Link a BOQ item to a Gantt task with a planned quantity. */
  linkBoq: protectedProcedure
    .input(LinkBoqSchema)
    .mutation(async ({ ctx, input }) => {
      const task = await db.ganttTask.findUnique({
        where: { id: input.taskId },
        select: { id: true, projectId: true, name: true, duration: true },
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

      const boqItem = await db.boqItem.findUnique({
        where: { id: input.boqItemId },
        select: { id: true, projectId: true, code: true },
      });
      if (!boqItem || boqItem.projectId !== task.projectId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "BOQ item not found in this project.",
        });
      }

      const link = await db.taskBoqLink.upsert({
        where: {
          taskId_boqItemId: { taskId: input.taskId, boqItemId: input.boqItemId },
        },
        update: { quantity: input.quantity },
        create: {
          taskId: input.taskId,
          boqItemId: input.boqItemId,
          quantity: input.quantity,
        },
      });

      await audit({
        userId: ctx.user.id,
        projectId: task.projectId,
        action: "gantt.boq_link",
        entityType: "gantt_task",
        entityId: input.taskId,
        metadata: {
          taskName: task.name,
          boqCode: boqItem.code,
          quantity: input.quantity,
        },
      });

      return { link };
    }),

  /** Remove a BOQ item attachment from a task. */
  unlinkBoq: protectedProcedure
    .input(z.object({ taskId: z.string(), linkId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const task = await db.ganttTask.findUnique({
        where: { id: input.taskId },
        select: { id: true, projectId: true },
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

      await db.taskBoqLink.deleteMany({
        where: { id: input.linkId, taskId: input.taskId },
      });
      return { ok: true };
    }),

  /** Add a dependency (predecessor) to a task. */
  addDependency: protectedProcedure
    .input(
      z.object({
        taskId: z.string(),
        predecessorId: z.string(),
        type: z.enum(["FS", "SS", "FF", "SF"]).default("FS"),
        offset: z.number().int().default(0),
      })
    )
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

      const pred = await db.ganttTask.findUnique({
        where: { id: input.predecessorId },
        select: { id: true, projectId: true, name: true },
      });
      if (!pred) throw new TRPCError({ code: "NOT_FOUND", message: "Predecessor task not found." });
      if (pred.projectId !== task.projectId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Predecessor must be in the same project.",
        });
      }
      if (input.taskId === input.predecessorId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "A task cannot depend on itself.",
        });
      }

      // ── Cycle Detection (scoped to version) ──
      const existingDeps = await db.taskDependency.findMany({
        where: {
          successor: {
            projectId: task.projectId,
            ...(task.versionId ? { versionId: task.versionId } : {}),
          },
        },
        select: { predecessorId: true, successorId: true },
      });

      const { hasCycle } = detectCycle(existingDeps, [
        { predecessorId: input.predecessorId, successorId: input.taskId },
      ]);

      if (hasCycle) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Cannot link '${pred.name}' → '${task.name}': creates a circular dependency loop.`,
        });
      }

      await db.taskDependency.upsert({
        where: {
          predecessorId_successorId: {
            predecessorId: input.predecessorId,
            successorId: input.taskId,
          },
        },
        update: { type: input.type, offset: input.offset },
        create: {
          predecessorId: input.predecessorId,
          successorId: input.taskId,
          type: input.type,
          offset: input.offset,
        },
      });

      // ── Automated Forward-Pass CPM Cascade ──
      // RLS: tenant-context-pinned recalc (GanttTask is FORCE-scoped).
      const { updatedCount } = await recalculateProjectScheduleForUser(
        ctx.user,
        task.projectId,
        task.versionId
      );

      await audit({
        userId: ctx.user.id,
        projectId: task.projectId,
        action: "gantt.add_dependency",
        entityType: "gantt_task",
        entityId: input.taskId,
        metadata: { taskName: task.name, predecessorId: input.predecessorId, updatedCount },
      });

      return { ok: true, updatedCount };
    }),

  /** Remove a dependency from a task. */
  removeDependency: protectedProcedure
    .input(z.object({ taskId: z.string(), predecessorId: z.string() }))
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

      const result = await db.taskDependency.deleteMany({
        where: { successorId: input.taskId, predecessorId: input.predecessorId },
      });
      if (result.count === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `No dependency found for task ${input.taskId} -> predecessor ${input.predecessorId}`,
        });
      }

      // ── Automated Forward-Pass CPM Cascade ──
      // RLS: tenant-context-pinned recalc (GanttTask is FORCE-scoped).
      const { updatedCount } = await recalculateProjectScheduleForUser(
        ctx.user,
        task.projectId,
        task.versionId
      );

      return { ok: true, updatedCount };
    }),

  /**
   * Replace all dependencies for a task (used for bulk update + recalculate).
   */
  setDependencies: protectedProcedure
    .input(
      z.object({
        taskId: z.string(),
        dependencies: z.array(
          z.object({
            predecessorId: z.string(),
            type: z.enum(["FS", "SS", "FF", "SF"]),
            offset: z.number().int().default(0),
          })
        ),
      })
    )
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

      const predecessorIds = input.dependencies.map((d) => d.predecessorId);
      const predecessors = await db.ganttTask.findMany({
        where: { id: { in: predecessorIds }, projectId: task.projectId },
        select: { id: true, name: true, startDate: true, endDate: true },
      });
      const foundIds = new Set(predecessors.map((p) => p.id));
      const missingIds = predecessorIds.filter((id) => !foundIds.has(id));
      if (missingIds.length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Predecessor tasks not found: ${missingIds.join(", ")}`,
        });
      }

      // ── Cycle Detection (scoped to version) ──
      const existingDeps = await db.taskDependency.findMany({
        where: {
          successor: {
            projectId: task.projectId,
            ...(task.versionId ? { versionId: task.versionId } : {}),
          },
        },
        select: { predecessorId: true, successorId: true },
      });

      const { hasCycle } = detectCycle(
        existingDeps,
        input.dependencies.map((d) => ({
          predecessorId: d.predecessorId,
          successorId: input.taskId,
        })),
        input.taskId // exclude existing dependencies for this successor
      );

      if (hasCycle) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Cannot apply dependencies to '${task.name}': one or more dependencies create a circular loop.`,
        });
      }

      await db.taskDependency.deleteMany({ where: { successorId: input.taskId } });
      if (input.dependencies.length > 0) {
        await db.taskDependency.createMany({
          data: input.dependencies.map((d) => ({
            predecessorId: d.predecessorId,
            successorId: input.taskId,
            type: d.type,
            offset: d.offset,
          })),
        });
      }

      // ── Automated Forward-Pass CPM Cascade to edited task & all downstream successors ──
      // RLS: tenant-context-pinned recalc (GanttTask is FORCE-scoped).
      const { updatedCount } = await recalculateProjectScheduleForUser(
        ctx.user,
        task.projectId,
        task.versionId
      );

      await audit({
        userId: ctx.user.id,
        projectId: task.projectId,
        action: "gantt.set_dependencies",
        entityType: "gantt_task",
        entityId: input.taskId,
        metadata: { taskName: task.name, count: input.dependencies.length, updatedCount },
      });

      return { ok: true, updatedCount };
    }),

  /** Check if adding a dependency would create a cycle. */
  wouldCreateCycle: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        predecessorId: z.string(),
        successorId: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);

      const succTask = await db.ganttTask.findUnique({
        where: { id: input.successorId },
        select: { versionId: true },
      });

      const allDeps = await db.taskDependency.findMany({
        where: {
          successor: {
            projectId: input.projectId,
            ...(succTask?.versionId ? { versionId: succTask.versionId } : {}),
          },
        },
        select: { predecessorId: true, successorId: true },
      });

      const result = detectCycle(allDeps, [
        { predecessorId: input.predecessorId, successorId: input.successorId },
      ]);

      return result;
    }),
});
