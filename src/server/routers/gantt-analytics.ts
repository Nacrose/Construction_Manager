/**
 * Gantt dual schedules (planning + execution), variance tracking, EVM, leveling, cashflow, and what-if scenarios.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "@/server/trpc";
import { db } from "@/lib/db";
import { assertProjectMember, assertCanWrite } from "@/lib/authz";
import { audit } from "@/lib/audit";
import { withOrgContext, withTenantTx } from "@/lib/rls";
import { cloneDependencies, cloneResourceAssignments } from "./gantt-versions";
import {
  recalculateProjectSchedule,
  recalculateProjectScheduleForUser,
} from "@/server/utils/gantt-cpm-engine";

export const ganttAnalyticsRouter = router({
  /** List all schedules (planning + execution) with revision chain info. */
  listSchedules: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);

      const versions = await db.ganttVersion.findMany({
        where: { projectId: input.projectId },
        include: {
          revisionOf: { select: { id: true, versionNumber: true, name: true } },
          _count: { select: { tasks: true } },
        },
        orderBy: { createdAt: "desc" },
      });

      const planning = versions.filter((v) => v.scheduleType === "PLANNING");
      const execution = versions.filter((v) => v.scheduleType === "EXECUTION");

      return { planning, execution, all: versions };
    }),

  /** Create an EXECUTION schedule from an approved PLANNING baseline. */
  createExecutionSchedule: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        planningVersionId: z.string(),
        name: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertCanWrite(ctx.user, input.projectId);

      const planningVersion = await db.ganttVersion.findFirst({
        where: {
          id: input.planningVersionId,
          projectId: input.projectId,
          scheduleType: "PLANNING",
        },
        select: { id: true, versionNumber: true, name: true, status: true },
      });
      if (!planningVersion) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Planning version not found.",
        });
      }
      if (planningVersion.status !== "APPROVED") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Can only create execution from an APPROVED planning schedule.",
        });
      }

      const existing = await db.ganttVersion.findFirst({
        where: {
          projectId: input.projectId,
          scheduleType: "EXECUTION",
          baseVersionId: input.planningVersionId,
        },
        select: { id: true },
      });
      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message:
            "An execution schedule already exists for this planning baseline.",
        });
      }

      const maxVersion = await db.ganttVersion.aggregate({
        where: { projectId: input.projectId },
        _max: { versionNumber: true },
      });
      const nextVersionNumber = (maxVersion._max.versionNumber ?? 0) + 1;

      const execVersion = await db.$transaction(async (tx) => {
        await withOrgContext(tx, ctx.user.organizationId, !!ctx.user.isSuperAdmin); // RLS: phase-3a/b/c tables are FORCE-scoped
        await tx.ganttVersion.updateMany({
          where: {
            projectId: input.projectId,
            scheduleType: "EXECUTION",
            isActive: true,
          },
          data: { isActive: false },
        });

        const newExec = await tx.ganttVersion.create({
          data: {
            projectId: input.projectId,
            versionNumber: nextVersionNumber,
            name:
              input.name ||
              `Execution — ${planningVersion.name || "Baseline v" + planningVersion.versionNumber}`,
            baseVersionId: input.planningVersionId,
            scheduleType: "EXECUTION",
            status: "APPROVED",
            isActive: true,
          },
        });

        const sourceTasks = await tx.ganttTask.findMany({
          where: { versionId: input.planningVersionId },
          include: { boqLinks: true },
          orderBy: { sortOrder: "asc" },
        });

        const idMap = new Map<string, string>();
        for (const task of sourceTasks) {
          const newTask = await tx.ganttTask.create({
            data: {
              projectId: input.projectId,
              versionId: newExec.id,
              planningTaskId: task.id,
              name: task.name,
              code: task.code,
              startDate: task.startDate,
              endDate: task.endDate,
              duration: task.duration,
              progress: 0,
              baseProgress: 0,
              isProgressEdited: false,
              baseVersionId: input.planningVersionId,
              sortOrder: task.sortOrder,
              laborCount: task.laborCount,
              assignees: task.assignees,
              isMilestone: task.isMilestone,
              plannedValue: task.plannedValue,
              workHours: task.workHours,
              taskType: task.taskType,
              constraintType: task.constraintType,
              constraintDate: task.constraintDate,
              deadline: task.deadline,
              notes: task.notes,
              effortDriven: task.effortDriven,
              estimated: task.estimated,
              ignoreResourceCalendar: task.ignoreResourceCalendar,
              priority: task.priority,
              earnedValueMethod: task.earnedValueMethod,
              boqLinks: {
                create: task.boqLinks.map((link) => ({
                  boqItemId: link.boqItemId,
                  quantity: link.quantity,
                })),
              },
            },
          });
          idMap.set(task.id, newTask.id);
        }

        for (const task of sourceTasks) {
          if (!task.parentId && !task.dependencies) continue;
          let newDeps = task.dependencies;
          if (newDeps) {
            try {
              const deps = JSON.parse(newDeps);
              newDeps = JSON.stringify(
                deps.map((d: any) => ({
                  ...d,
                  taskId: idMap.get(d.taskId) ?? d.taskId,
                }))
              );
            } catch {
              /* ignore */
            }
          }
          await tx.ganttTask.update({
            where: { id: idMap.get(task.id)! },
            data: {
              parentId: task.parentId ? idMap.get(task.parentId) : null,
              dependencies: newDeps,
            },
          });
        }

        await cloneDependencies(idMap, tx);
        await cloneResourceAssignments(idMap, tx);

        return newExec;
      });

      await audit({
        userId: ctx.user.id,
        projectId: input.projectId,
        action: "gantt.createExecution",
        entityType: "gantt_version",
        entityId: execVersion.id,
        metadata: {
          name: execVersion.name,
          planningVersionId: input.planningVersionId,
        },
      });

      return { version: execVersion };
    }),

  /** Get variance data for an execution schedule vs its planning baseline. */
  getVariance: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        executionVersionId: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);

      const execVersion = await db.ganttVersion.findFirst({
        where: { id: input.executionVersionId, projectId: input.projectId },
        select: { id: true, baseVersionId: true },
      });
      if (!execVersion) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Gantt execution version not found for this project." });
      }

      const execTasks = await db.ganttTask.findMany({
        where: { versionId: input.executionVersionId, projectId: input.projectId },
        include: {
          planningTask: {
            select: {
              id: true,
              name: true,
              code: true,
              startDate: true,
              endDate: true,
              duration: true,
              progress: true,
            },
          },
        },
        orderBy: { sortOrder: "asc" },
      });

      // If any tasks lack direct planningTask FK, match against base version by code or unique name
      const fallbackPlanMap = new Map<string, any>();
      if (execVersion?.baseVersionId) {
        const baseTasks = await db.ganttTask.findMany({
          where: { versionId: execVersion.baseVersionId, projectId: input.projectId },
          select: {
            id: true,
            name: true,
            code: true,
            parentId: true,
            startDate: true,
            endDate: true,
            duration: true,
            progress: true,
          },
        });

        // Count name frequencies to prevent collisions across multiple floors/blocks
        const nameFrequency = new Map<string, number>();
        for (const bt of baseTasks) {
          const normName = bt.name.toLowerCase().trim();
          nameFrequency.set(normName, (nameFrequency.get(normName) || 0) + 1);
        }

        for (const bt of baseTasks) {
          const normName = bt.name.toLowerCase().trim();
          if (bt.code) fallbackPlanMap.set(`code:${bt.code}`, bt);
          if (bt.parentId) fallbackPlanMap.set(`parent:${bt.parentId}::${normName}`, bt);
          // Only permit plain name fallback if this task name appears uniquely once in baseline
          if (nameFrequency.get(normName) === 1) {
            fallbackPlanMap.set(`name:${normName}`, bt);
          }
        }
      }

      type VarianceRow = {
        taskId: string;
        taskName: string;
        taskCode: string | null;
        plannedStart: Date;
        plannedEnd: Date;
        plannedDuration: number;
        plannedProgress: number;
        actualStart: Date | null;
        actualEnd: Date | null;
        actualDuration: number;
        actualProgress: number;
        startVariance: number | null;
        endVariance: number | null;
        durationVariance: number | null;
        progressVariance: number | null;
        status: "on_time" | "delayed" | "ahead" | "not_started" | "completed";
      };

      const rows: VarianceRow[] = [];
      let totalDelay = 0;
      let totalAhead = 0;
      let tasksDelayed = 0;
      let tasksOnTime = 0;
      let tasksAhead = 0;
      let tasksNotStarted = 0;

      for (const task of execTasks) {
        const plan =
          task.planningTask ||
          (task.code ? fallbackPlanMap.get(`code:${task.code}`) : null) ||
          fallbackPlanMap.get(`name:${task.name.toLowerCase().trim()}`) ||
          null;

        const plannedStart = plan ? new Date(plan.startDate) : new Date(task.startDate);
        const plannedEnd = plan ? new Date(plan.endDate) : new Date(task.endDate);
        const plannedDuration = plan ? plan.duration : task.duration;
        const plannedProgress = plan ? plan.progress : 0;
        const actualStart = task.actualStartDate
          ? new Date(task.actualStartDate)
          : null;
        const actualEnd = task.actualEndDate ? new Date(task.actualEndDate) : null;

        const startVariance = actualStart
          ? Math.round(
              (actualStart.getTime() - plannedStart.getTime()) /
                (1000 * 60 * 60 * 24)
            )
          : null;
        const endVariance = actualEnd
          ? Math.round(
              (actualEnd.getTime() - plannedEnd.getTime()) / (1000 * 60 * 60 * 24)
            )
          : null;

        const actualDuration =
          actualStart && actualEnd
            ? Math.round(
                (actualEnd.getTime() - actualStart.getTime()) /
                  (1000 * 60 * 60 * 24)
              ) + 1
            : task.duration;
        const durationVariance = actualDuration - plan.duration;
        const progressVariance = task.progress - plan.progress;

        let status: VarianceRow["status"] = "on_time";
        if (task.progress === 0 && !actualStart) {
          status = "not_started";
          tasksNotStarted++;
        } else if (task.progress >= 100) {
          status = "completed";
          if (endVariance !== null && endVariance > 0) {
            tasksDelayed++;
            totalDelay += endVariance;
          } else if (endVariance !== null && endVariance < 0) {
            tasksAhead++;
            totalAhead += Math.abs(endVariance);
          } else {
            tasksOnTime++;
          }
        } else if (endVariance !== null && endVariance > 0) {
          status = "delayed";
          tasksDelayed++;
          totalDelay += endVariance;
        } else if (endVariance !== null && endVariance < 0) {
          status = "ahead";
          tasksAhead++;
          totalAhead += Math.abs(endVariance);
        } else if (startVariance !== null && startVariance > 0) {
          status = "delayed";
          tasksDelayed++;
          totalDelay += startVariance;
        } else {
          tasksOnTime++;
        }

        rows.push({
          taskId: task.id,
          taskName: task.name,
          taskCode: task.code,
          plannedStart,
          plannedEnd,
          plannedDuration: plan.duration,
          plannedProgress: plan.progress,
          actualStart,
          actualEnd,
          actualDuration,
          actualProgress: task.progress,
          startVariance,
          endVariance,
          durationVariance,
          progressVariance,
          status,
        });
      }

      return {
        rows,
        summary: {
          totalTasks: rows.length,
          tasksDelayed,
          tasksOnTime,
          tasksAhead,
          tasksNotStarted,
          totalDelayDays: totalDelay,
          totalAheadDays: totalAhead,
          avgDelayDays:
            tasksDelayed > 0 ? Math.round(totalDelay / tasksDelayed) : 0,
        },
      };
    }),

  /** Detect resource over-allocation conflicts for a version. */
  getResourceConflicts: protectedProcedure
    .input(z.object({ projectId: z.string(), versionId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);

      // IDOR guard: see getEVM for rationale.
      const versionBelongsToProject = await db.ganttVersion.findFirst({
        where: { id: input.versionId, projectId: input.projectId },
        select: { id: true },
      });
      if (!versionBelongsToProject) {
        return { conflicts: [], proposals: [], totalConflicts: 0, affectedResources: 0 };
      }

      const assignments = await db.resourceAssignment.findMany({
        where: {
          task: { versionId: input.versionId },
          OR: [{ staffId: { not: null } }, { equipmentId: { not: null } }],
        },
        include: {
          task: {
            select: {
              id: true,
              name: true,
              code: true,
              startDate: true,
              endDate: true,
              sortOrder: true,
            },
          },
          staff: { select: { id: true, name: true } },
          equipment: { select: { id: true, name: true, code: true } },
          staffRole: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "asc" },
      });

      const { detectConflicts, proposeLeveling } = await import(
        "@/server/utils/resource-leveling"
      );

      const conflicts = detectConflicts(assignments as any);

      // Float-aware leveling: run the CPM backward pass over the same
      // version so proposals delay the task with MORE slack, never the
      // critical one when avoidable. Fail-soft: without float data the
      // heuristic falls back to delaying the later task.
      let floatByTaskId: Map<string, number> | undefined;
      try {
        const { computeCpmSchedule } = await import(
          "@/server/utils/gantt-cpm-engine"
        );
        const [schedTasks, schedDeps] = await Promise.all([
          db.ganttTask.findMany({
            where: { versionId: input.versionId },
            select: {
              id: true,
              name: true,
              startDate: true,
              endDate: true,
              duration: true,
              isMilestone: true,
              ignoreResourceCalendar: true,
            },
          }),
          db.taskDependency.findMany({
            where: { successor: { versionId: input.versionId } },
            select: {
              predecessorId: true,
              successorId: true,
              type: true,
              offset: true,
            },
          }),
        ]);
        const { metrics } = computeCpmSchedule(
          schedTasks,
          schedDeps.map((d) => ({
            predecessorId: d.predecessorId,
            successorId: d.successorId,
            type: d.type as any,
            offset: d.offset,
          })),
          { useCalendar: true }
        );
        floatByTaskId = new Map(
          Array.from(metrics.values(), (m) => [m.id, m.totalFloatDays])
        );
      } catch {
        /* float data optional */
      }

      const levelingProposals = proposeLeveling(conflicts, floatByTaskId);

      return {
        conflicts,
        proposals: levelingProposals,
        totalConflicts: conflicts.length,
        affectedResources: new Set(conflicts.map((c) => c.resourceId)).size,
      };
    }),

  /** Calculate EVM metrics for a version's tasks. */
  getEVM: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        versionId: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);

      let targetVersionId = input.versionId;
      if (!targetVersionId) {
        const active = await db.ganttVersion.findFirst({
          where: { projectId: input.projectId, isActive: true },
          select: { id: true },
        });
        if (active) targetVersionId = active.id;
      }

      if (!targetVersionId) {
        return { error: "No version found" };
      }

      // IDOR guard: verify the resolved version actually belongs to the
      // project the caller was authorized on. Without this check, a user
      // with project A access could pass versionId from project B and
      // read its tasks, BOQ links, and IPC payments.
      const versionBelongsToProject = await db.ganttVersion.findFirst({
        where: { id: targetVersionId, projectId: input.projectId },
        select: { id: true },
      });
      if (!versionBelongsToProject) {
        return { error: "No version found" };
      }

      const tasks = await db.ganttTask.findMany({
        where: { versionId: targetVersionId },
        include: {
          boqLinks: {
            include: {
              boqItem: {
                select: { id: true, rate: true, quantity: true, amount: true },
              },
            },
          },
        },
        orderBy: { sortOrder: "asc" },
      });

      const taskBoqItemIds = new Set<string>();
      for (const task of tasks) {
        for (const link of task.boqLinks) {
          taskBoqItemIds.add(link.boqItemId);
        }
      }

      let ipcItems: Array<{ boqItemId: string; totalPaid: number }> = [];
      if (taskBoqItemIds.size > 0) {
        const idArray = Array.from(taskBoqItemIds);
        try {
          const placeholders = idArray.map((_, i) => `$${i + 1}`).join(",");
          ipcItems = (await db.$queryRawUnsafe(
            `SELECT i."boqItemId", COALESCE(SUM(i."amount"), 0)::float AS "totalPaid"
             FROM "IpcItem" i
             JOIN "Ipc" p ON i."ipcId" = p."id"
             WHERE i."boqItemId" IN (${placeholders})
             AND p."status" = 'approved'
             GROUP BY i."boqItemId"`,
            ...idArray
          )) as any;
        } catch {
          /* ignore */
        }
      }

      const actualCostMap = new Map<string, number>();
      for (const item of ipcItems as any[]) {
        actualCostMap.set(item.boqItemId, Number(item.totalPaid) || 0);
      }

      const evmTasks = tasks.map((task) => {
        const boqCost = task.boqLinks.reduce((sum, link) => {
          return sum + link.quantity * (link.boqItem.rate || 0);
        }, 0);
        const plannedCost =
          task.boqLinks.length > 0 ? boqCost : (task.plannedValue || 0);

        const actualCost = task.boqLinks.reduce((sum, link) => {
          const totalPaidForItem = actualCostMap.get(link.boqItemId) ?? 0;
          if (totalPaidForItem === 0) return sum;
          const allTasksForItem = tasks.filter((t) =>
            t.boqLinks.some((bl) => bl.boqItemId === link.boqItemId)
          );
          const totalPlannedQty = allTasksForItem.reduce(
            (s, t) =>
              s +
              (t.boqLinks.find((bl) => bl.boqItemId === link.boqItemId)?.quantity ??
                0),
            0
          );
          const taskQty = link.quantity;
          const proportion = totalPlannedQty > 0 ? taskQty / totalPlannedQty : 1;
          return sum + totalPaidForItem * proportion;
        }, 0);

        return {
          id: task.id,
          name: task.name,
          code: task.code,
          startDate: task.startDate,
          endDate: task.endDate,
          progress: task.progress,
          plannedCost,
          actualCost,
        };
      });

      const { calculateEVM } = await import("@/server/utils/evm");
      // Calendar-aware PV: planned value accrues over WORKING days only,
      // so Saturdays/Dashain no longer register as phantom schedule slip.
      const { refreshHolidayCache } = await import("@/server/utils/holiday-db");
      await refreshHolidayCache();
      const result = calculateEVM(evmTasks, undefined, { useCalendar: true });

      return result;
    }),

  /** Apply leveling proposals — batch-updates task dates to resolve conflicts. */
  applyLeveling: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        proposals: z.array(
          z.object({
            taskId: z.string(),
            newStartDate: z.string().datetime(),
            newEndDate: z.string().datetime(),
          })
        ),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertCanWrite(ctx.user, input.projectId);

      const taskIds = input.proposals.map((p) => p.taskId);
      const tasks = await db.ganttTask.findMany({
        where: { id: { in: taskIds }, projectId: input.projectId },
        select: { id: true, versionId: true },
      });
      if (tasks.length !== taskIds.length) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "One or more tasks do not belong to this project.",
        });
      }

      const versionIds = [
        ...new Set(tasks.map((t) => t.versionId).filter(Boolean)),
      ] as string[];
      const versions = await db.ganttVersion.findMany({
        where: { id: { in: versionIds } },
        select: { id: true, status: true },
      });
      const nonDraft = versions.filter((v) => v.status !== "DRAFT");
      if (nonDraft.length > 0) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            "Cannot modify tasks in an approved/locked schedule. Edit a DRAFT version instead.",
        });
      }

      const results: Array<{ taskId: string; success: boolean }> = [];
      // RLS: GanttTask is FORCE-scoped — the whole batch applies in one
      // context-pinned transaction (atomic: no half-leveled schedule).
      await withTenantTx(ctx.user, async (tx) => {
        for (const proposal of input.proposals) {
          try {
            await tx.ganttTask.update({
              where: { id: proposal.taskId },
              data: {
                startDate: new Date(proposal.newStartDate),
                endDate: new Date(proposal.newEndDate),
              },
            });
            results.push({ taskId: proposal.taskId, success: true });
          } catch {
            results.push({ taskId: proposal.taskId, success: false });
          }
        }
      });

      const appliedCount = results.filter((r) => r.success).length;
      if (appliedCount > 0) {
        for (const vId of versionIds) {
          // RLS: tenant-context-pinned recalc (GanttTask is FORCE-scoped).
          await recalculateProjectScheduleForUser(ctx.user, input.projectId, vId);
        }
      }

      await audit({
        userId: ctx.user.id,
        projectId: input.projectId,
        action: "gantt.applyLeveling",
        entityType: "gantt_task",
        entityId: input.projectId,
        metadata: {
          applied: appliedCount,
          failed: results.filter((r) => !r.success).length,
        },
      });

      return { results, applied: appliedCount };
    }),

  /** Forecast cash flow based on scheduled task costs over time. */
  getCashFlow: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        versionId: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);

      let targetVersionId = input.versionId;
      if (!targetVersionId) {
        const active = await db.ganttVersion.findFirst({
          where: { projectId: input.projectId, isActive: true },
          select: { id: true },
        });
        if (active) targetVersionId = active.id;
      }

      if (!targetVersionId) return { months: [], totalPlanned: 0, totalBilled: 0 };

      // IDOR guard: see getEVM for rationale.
      const versionBelongsToProject = await db.ganttVersion.findFirst({
        where: { id: targetVersionId, projectId: input.projectId },
        select: { id: true },
      });
      if (!versionBelongsToProject) {
        return { months: [], totalPlanned: 0, totalBilled: 0 };
      }

      const tasks = await db.ganttTask.findMany({
        where: { versionId: targetVersionId },
        include: {
          boqLinks: { include: { boqItem: { select: { rate: true } } } },
        },
        orderBy: { sortOrder: "asc" },
      });

      const monthlyPlanned = new Map<string, number>();
      let totalPlanned = 0;

      for (const task of tasks) {
        const boqCost = task.boqLinks.reduce(
          (sum, link) => sum + link.quantity * (link.boqItem.rate || 0),
          0
        );
        const taskCost =
          task.boqLinks.length > 0 ? boqCost : (task.plannedValue || 0);
        totalPlanned += taskCost;

        const start = new Date(task.startDate);
        const end = new Date(task.endDate);
        const days = Math.max(
          1,
          Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1
        );
        const dailyCost = taskCost / days;

        const current = new Date(start);
        while (current <= end) {
          const monthKey = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, "0")}`;
          monthlyPlanned.set(
            monthKey,
            (monthlyPlanned.get(monthKey) ?? 0) + dailyCost
          );
          current.setDate(current.getDate() + 1);
        }
      }

      const ipcs = await db.ipc
        .findMany({
          where: { projectId: input.projectId, status: "approved" },
          select: { period: true, grossAmount: true, issueDate: true },
        })
        .catch(() => []);

      const monthlyBilled = new Map<string, number>();
      let totalBilled = 0;
      for (const ipc of ipcs as any[]) {
        const dateStr =
          ipc.period || ipc.issueDate?.toISOString() || new Date().toISOString();
        const date = new Date(dateStr);
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
        monthlyBilled.set(
          monthKey,
          (monthlyBilled.get(monthKey) ?? 0) + (Number(ipc.grossAmount) || 0)
        );
        totalBilled += Number(ipc.grossAmount) || 0;
      }

      const allMonths = new Set([...monthlyPlanned.keys(), ...monthlyBilled.keys()]);
      const months = Array.from(allMonths)
        .sort()
        .map((key) => {
          const [year, month] = key.split("-");
          const date = new Date(parseInt(year), parseInt(month) - 1, 1);
          return {
            month: date.toLocaleString("en-US", { month: "short", year: "2-digit" }),
            monthKey: key,
            planned: Math.round(monthlyPlanned.get(key) ?? 0),
            billed: Math.round(monthlyBilled.get(key) ?? 0),
            cumulative: 0,
          };
        });

      let cumPlanned = 0;
      let cumBilled = 0;
      for (const m of months) {
        cumPlanned += m.planned;
        cumBilled += m.billed;
        m.cumulative = Math.round(cumPlanned - cumBilled);
      }

      return {
        months,
        totalPlanned: Math.round(totalPlanned),
        totalBilled: Math.round(totalBilled),
      };
    }),

  /** Create a what-if scenario. */
  createScenario: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        sourceVersionId: z.string(),
        name: z.string().min(1).max(100),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertCanWrite(ctx.user, input.projectId);

      const maxVersion = await db.ganttVersion.aggregate({
        where: { projectId: input.projectId },
        _max: { versionNumber: true },
      });
      const nextVersionNumber = (maxVersion._max.versionNumber ?? 0) + 1;

      const scenario = await db.$transaction(async (tx) => {
        await withOrgContext(tx, ctx.user.organizationId, !!ctx.user.isSuperAdmin); // RLS: phase-3a/b/c tables are FORCE-scoped
        const sc = await tx.ganttVersion.create({
          data: {
            projectId: input.projectId,
            versionNumber: nextVersionNumber,
            name: `Scenario: ${input.name}`,
            baseVersionId: input.sourceVersionId,
            scheduleType: "PLANNING",
            status: "DRAFT",
            description: `What-if scenario based on v${input.sourceVersionId}`,
          },
        });

        const sourceTasks = await tx.ganttTask.findMany({
          where: { versionId: input.sourceVersionId },
          include: { boqLinks: true },
          orderBy: { sortOrder: "asc" },
        });

        const idMap = new Map<string, string>();
        for (const task of sourceTasks) {
          const newTask = await tx.ganttTask.create({
            data: {
              projectId: input.projectId,
              versionId: sc.id,
              name: task.name,
              code: task.code,
              startDate: task.startDate,
              endDate: task.endDate,
              duration: task.duration,
              progress: task.progress,
              baseProgress: task.baseProgress,
              isProgressEdited: false,
              baseVersionId: input.sourceVersionId,
              sortOrder: task.sortOrder,
              laborCount: task.laborCount,
              assignees: task.assignees,
              isMilestone: task.isMilestone,
              plannedValue: task.plannedValue,
              workHours: task.workHours,
              taskType: task.taskType,
              constraintType: task.constraintType,
              constraintDate: task.constraintDate,
              deadline: task.deadline,
              notes: task.notes,
              effortDriven: task.effortDriven,
              estimated: task.estimated,
              ignoreResourceCalendar: task.ignoreResourceCalendar,
              priority: task.priority,
              earnedValueMethod: task.earnedValueMethod,
              boqLinks: {
                create: task.boqLinks.map((link) => ({
                  boqItemId: link.boqItemId,
                  quantity: link.quantity,
                })),
              },
            },
          });
          idMap.set(task.id, newTask.id);
        }

        for (const task of sourceTasks) {
          if (!task.parentId && !task.dependencies) continue;
          let newDeps = task.dependencies;
          if (newDeps) {
            try {
              const deps = JSON.parse(newDeps);
              newDeps = JSON.stringify(
                deps.map((d: any) => ({
                  ...d,
                  taskId: idMap.get(d.taskId) ?? d.taskId,
                }))
              );
            } catch {
              /* ignore */
            }
          }
          await tx.ganttTask.update({
            where: { id: idMap.get(task.id)! },
            data: {
              parentId: task.parentId ? idMap.get(task.parentId) : null,
              dependencies: newDeps,
            },
          });
        }

        await cloneDependencies(idMap, tx);
        await cloneResourceAssignments(idMap, tx);

        return sc;
      });

      await audit({
        userId: ctx.user.id,
        projectId: input.projectId,
        action: "gantt.createScenario",
        entityType: "gantt_version",
        entityId: scenario.id,
        metadata: {
          name: input.name,
          sourceVersionId: input.sourceVersionId,
        },
      });

      return { version: scenario };
    }),
});
