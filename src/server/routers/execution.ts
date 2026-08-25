/**
 * Execution router — auto-generate daily programs, resource leveling,
 * and look-ahead material requirements.
 *
 * Auto-generate daily program:
 *  - For a given date, finds all Gantt tasks scheduled to be active
 *  - Creates DailyProgramTask entries for each (with BOQ links)
 *  - Returns count of tasks created
 *
 * Resource leveling:
 *  - Detects over-allocated resources (staff/equipment assigned to
 *    overlapping tasks on the same day)
 *  - Returns conflicts with suggested resolutions
 *
 * Look-ahead material requirements:
 *  - For a date range, aggregates all BOQ-linked tasks
 *  - For each task, calculates material requirements from BoqIngredient
 *  - Returns total material quantities needed per material
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "@/server/trpc";
import { db } from "@/lib/db";
import { assertProjectMember, assertCanWrite } from "@/lib/authz";
import { audit } from "@/lib/audit";

export const executionRouter = router({
  /**
   * Auto-generate a daily program for a specific date.
   *
   * Finds all Gantt tasks in the active version that are scheduled to
   * be active on the given date (startDate <= date <= endDate), and
   * creates DailyProgramTask entries for each.
   *
   * If a program already exists for that date, appends to it (does not
   * duplicate tasks already added).
   */
  autoGenerateProgram: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      date: z.string().datetime(),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertCanWrite(ctx.user, input.projectId);

      const targetDate = new Date(input.date);
      const dayStart = new Date(targetDate);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(targetDate);
      dayEnd.setHours(23, 59, 59, 999);

      // Find or create the DailyProgram for this date
      let program = await db.dailyProgram.findUnique({
        where: {
          projectId_programDate: {
            projectId: input.projectId,
            programDate: dayStart,
          },
        },
        include: { tasks: { select: { ganttTaskId: true } } },
      });

      if (!program) {
        program = await db.dailyProgram.create({
          data: {
            projectId: input.projectId,
            programDate: dayStart,
            status: "draft",
          },
          include: { tasks: { select: { ganttTaskId: true } } },
        });
      }

      // Find the active Gantt version
      const activeVersion = await db.ganttVersion.findFirst({
        where: { projectId: input.projectId, isActive: true },
        select: { id: true },
      });
      if (!activeVersion) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "No active Gantt version found. Create a version first.",
        });
      }

      // Find tasks active on this date (overlap with the day)
      const where: any = {
        projectId: input.projectId,
        versionId: activeVersion.id,
        startDate: { lte: dayEnd },
        endDate: { gte: dayStart },
        isMilestone: false, // don't add milestones as program tasks
      };

      const tasks = await db.ganttTask.findMany({
        where,
        include: {
          boqLinks: {
            include: {
              boqItem: {
                select: { id: true, code: true, description: true, unit: true },
              },
            },
          },
          resourceAssignments: {
            include: {
              staffRole: { select: { id: true, name: true } },
              staff: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: { sortOrder: "asc" },
      });

      // Find all parent task IDs in the active version to exclude summary containers
      const allVersionTasks = await db.ganttTask.findMany({
        where: { projectId: input.projectId, versionId: activeVersion.id },
        select: { parentId: true },
      });
      const parentIds = new Set(allVersionTasks.map((t) => t.parentId).filter(Boolean));

      // Skip tasks already in the program and summary tasks
      const existingTaskIds = new Set(program.tasks.map((t) => t.ganttTaskId).filter(Boolean));
      const newTasks = tasks.filter((t) => !existingTaskIds.has(t.id) && !parentIds.has(t.id));

      // Create DailyProgramTask entries
      const programTasks: Array<{
        programId: string;
        ganttTaskId: string;
        taskName: string;
        boqItemId: string | null;
        boqCode: string | null;
        boqDesc: string | null;
        plannedQty: number;
        unit: string | null;
        paymentType: string;
        assignedTo: string | null;
      }> = [];

      for (const task of newTasks) {
        // If task has BOQ links, create one program task per BOQ link
        if (task.boqLinks.length > 0) {
          for (const link of task.boqLinks) {
            // Calculate planned quantity for this day
            // (distribute total quantity across task duration)
            const taskDurationDays = Math.max(1, Math.ceil(
              (new Date(task.endDate).getTime() - new Date(task.startDate).getTime()) / (1000 * 60 * 60 * 24)
            ));
            const dailyQty = link.quantity / taskDurationDays;

            // Get assigned staff/role
            const assignment = task.resourceAssignments[0];
            const assignedTo = assignment?.staff?.name ?? assignment?.staffRole?.name ?? null;

            programTasks.push({
              programId: program.id,
              ganttTaskId: task.id,
              taskName: task.name,
              boqItemId: link.boqItem.id,
              boqCode: link.boqItem.code,
              boqDesc: link.boqItem.description,
              plannedQty: Math.round(dailyQty * 100) / 100,
              unit: link.boqItem.unit,
              paymentType: "payable",
              assignedTo,
            });
          }
        } else {
          // No BOQ link — just create a generic task entry
          const assignment = task.resourceAssignments[0];
          const assignedTo = assignment?.staff?.name ?? assignment?.staffRole?.name ?? null;

          programTasks.push({
            programId: program.id,
            ganttTaskId: task.id,
            taskName: task.name,
            boqItemId: null,
            boqCode: task.code,
            boqDesc: null,
            plannedQty: 0,
            unit: null,
            paymentType: "payable",
            assignedTo,
          });
        }
      }

      if (programTasks.length > 0) {
        await db.dailyProgramTask.createMany({ data: programTasks });
      }

      await audit({
        userId: ctx.user.id,
        projectId: input.projectId,
        action: "program.auto_generate",
        entityType: "daily_program",
        entityId: program.id,
        metadata: {
          date: dayStart.toISOString(),
          tasksAdded: programTasks.length,
          tasksSkipped: existingTaskIds.size,
        },
      });

      return {
        programId: program.id,
        tasksAdded: programTasks.length,
        tasksSkipped: existingTaskIds.size,
        totalActiveTasks: tasks.length,
      };
    }),

  /**
   * Resource leveling — detect over-allocations.
   *
   * For each day in the given range, checks if any staff or equipment
   * is assigned to multiple tasks simultaneously (overlap > 50% of day).
   *
   * Returns conflicts with suggestions (e.g., "John is on 2 tasks on
   * 2026-01-15 — consider rescheduling one").
   */
  resourceConflicts: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      fromDate: z.string().datetime().optional(),
      toDate: z.string().datetime().optional(),
    }))
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);

      // Find the active Gantt version
      const activeVersion = await db.ganttVersion.findFirst({
        where: { projectId: input.projectId, isActive: true },
        select: { id: true },
      });
      if (!activeVersion) return { conflicts: [], stats: { total: 0, byType: {} } };

      // Get all tasks with resource assignments in the date range
      const where: any = {
        projectId: input.projectId,
        versionId: activeVersion.id,
      };
      if (input.fromDate || input.toDate) {
        where.startDate = {};
        if (input.toDate) where.startDate.lte = new Date(input.toDate);
        if (input.fromDate) where.endDate = { gte: new Date(input.fromDate) };
      }

      const tasks = await db.ganttTask.findMany({
        where,
        include: {
          resourceAssignments: {
            include: {
              staff: { select: { id: true, name: true } },
              staffRole: { select: { id: true, name: true } },
              equipment: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: { startDate: "asc" },
      });

      // Build a map: resourceId → list of (taskId, taskName, startDate, endDate)
      type Allocation = {
        resourceId: string;
        resourceName: string;
        resourceType: "staff" | "role" | "equipment";
        taskId: string;
        taskName: string;
        startDate: Date;
        endDate: Date;
      };

      const allocationsByResource = new Map<string, Allocation[]>();

      for (const task of tasks) {
        for (const ra of task.resourceAssignments) {
          if (ra.staff) {
            const key = `staff:${ra.staff.id}`;
            const list = allocationsByResource.get(key) ?? [];
            list.push({
              resourceId: ra.staff.id,
              resourceName: ra.staff.name,
              resourceType: "staff",
              taskId: task.id,
              taskName: task.name,
              startDate: task.startDate,
              endDate: task.endDate,
            });
            allocationsByResource.set(key, list);
          }
          if (ra.staffRole) {
            const key = `role:${ra.staffRole.id}`;
            const list = allocationsByResource.get(key) ?? [];
            list.push({
              resourceId: ra.staffRole.id,
              resourceName: ra.staffRole.name,
              resourceType: "role",
              taskId: task.id,
              taskName: task.name,
              startDate: task.startDate,
              endDate: task.endDate,
            });
            allocationsByResource.set(key, list);
          }
          if (ra.equipment) {
            const key = `equipment:${ra.equipment.id}`;
            const list = allocationsByResource.get(key) ?? [];
            list.push({
              resourceId: ra.equipment.id,
              resourceName: ra.equipment.name,
              resourceType: "equipment",
              taskId: task.id,
              taskName: task.name,
              startDate: task.startDate,
              endDate: task.endDate,
            });
            allocationsByResource.set(key, list);
          }
        }
      }

      // Find overlapping allocations per resource
      type Conflict = {
        resourceId: string;
        resourceName: string;
        resourceType: string;
        task1Id: string;
        task1Name: string;
        task2Id: string;
        task2Name: string;
        overlapStart: Date;
        overlapEnd: Date;
        overlapDays: number;
        suggestion: string;
      };

      const conflicts: Conflict[] = [];

      for (const [key, allocations] of allocationsByResource) {
        if (allocations.length < 2) continue;

        // Sort by start date
        const sorted = [...allocations].sort((a, b) => a.startDate.getTime() - b.startDate.getTime());

        // Check each pair for overlap
        for (let i = 0; i < sorted.length; i++) {
          for (let j = i + 1; j < sorted.length; j++) {
            const a = sorted[i];
            const b = sorted[j];
            const overlapStart = new Date(Math.max(a.startDate.getTime(), b.startDate.getTime()));
            const overlapEnd = new Date(Math.min(a.endDate.getTime(), b.endDate.getTime()));
            if (overlapStart < overlapEnd) {
              const overlapDays = Math.ceil((overlapEnd.getTime() - overlapStart.getTime()) / (1000 * 60 * 60 * 24));
              conflicts.push({
                resourceId: a.resourceId,
                resourceName: a.resourceName,
                resourceType: a.resourceType,
                task1Id: a.taskId,
                task1Name: a.taskName,
                task2Id: b.taskId,
                task2Name: b.taskName,
                overlapStart,
                overlapEnd,
                overlapDays,
                suggestion: `Reschedule "${b.taskName}" to start after "${a.taskName}" ends (${overlapEnd.toLocaleDateString()})`,
              });
            }
          }
        }
      }

      // Stats by type
      const byType: Record<string, number> = {};
      for (const c of conflicts) {
        byType[c.resourceType] = (byType[c.resourceType] ?? 0) + 1;
      }

      return {
        conflicts: conflicts.sort((a, b) => a.overlapStart.getTime() - b.overlapStart.getTime()),
        stats: {
          total: conflicts.length,
          byType,
        },
      };
    }),

  /**
   * Look-ahead material requirements.
   *
   * For a date range, aggregates all BOQ-linked Gantt tasks that are
   * active during that period. For each task, calculates material
   * requirements from BoqIngredient (quantity per unit × task quantity).
   *
   * Returns:
   *  - materials: total quantity needed per material, with breakdown by task
   *  - byDate: daily material requirements (for procurement scheduling)
   */
  materialRequirements: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      fromDate: z.string().datetime(),
      toDate: z.string().datetime(),
    }))
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);

      const fromDate = new Date(input.fromDate);
      const toDate = new Date(input.toDate);

      // Find the active Gantt version
      const activeVersion = await db.ganttVersion.findFirst({
        where: { projectId: input.projectId, isActive: true },
        select: { id: true },
      });
      if (!activeVersion) {
        return { materials: [], byDate: [], totals: { materialCount: 0, totalCost: 0 } };
      }

      // Get tasks active in the date range
      const tasks = await db.ganttTask.findMany({
        where: {
          projectId: input.projectId,
          versionId: activeVersion.id,
          startDate: { lte: toDate },
          endDate: { gte: fromDate },
        },
        include: {
          boqLinks: {
            include: {
              boqItem: {
                include: {
                  rateAnalyses: {
                    include: {
                      ingredients: {
                        where: { type: "material" },
                      },
                    },
                  },
                  ingredients: {
                    where: { type: "material" },
                  },
                },
              },
            },
          },
        },
        orderBy: { startDate: "asc" },
      });

      // Aggregate material requirements
      type MaterialReq = {
        materialName: string;
        unit: string;
        totalQty: number;
        rate: number;
        totalCost: number;
        tasks: Array<{
          taskName: string;
          taskStartDate: Date;
          taskEndDate: Date;
          quantity: number;
        }>;
      };

      const materialMap = new Map<string, MaterialReq>();

      for (const task of tasks) {
        for (const link of task.boqLinks) {
          const taskQty = link.quantity;

          // Select ingredients from default rate analysis, or unassigned top-level ingredients
          const defaultAnalysis =
            link.boqItem.rateAnalyses?.find((ra) => ra.isDefault) ||
            link.boqItem.rateAnalyses?.[0];

          let effectiveIngredients = defaultAnalysis?.ingredients?.length
            ? defaultAnalysis.ingredients
            : link.boqItem.ingredients.filter((i) => !i.rateAnalysisId);

          if (effectiveIngredients.length === 0 && link.boqItem.ingredients.length > 0) {
            effectiveIngredients = link.boqItem.ingredients;
          }

          for (const ing of effectiveIngredients) {
            const key = ing.name;
            const requiredQty = ing.quantity * taskQty;

            const existing = materialMap.get(key) ?? {
              materialName: ing.name,
              unit: ing.unit,
              totalQty: 0,
              rate: ing.rate,
              totalCost: 0,
              tasks: [],
            };

            existing.totalQty += requiredQty;
            existing.totalCost += requiredQty * ing.rate;
            existing.tasks.push({
              taskName: task.name,
              taskStartDate: task.startDate,
              taskEndDate: task.endDate,
              quantity: requiredQty,
            });

            materialMap.set(key, existing);
          }
        }
      }

      const materials = Array.from(materialMap.values()).sort((a, b) => b.totalCost - a.totalCost);

      // By-date breakdown (for each day in range, sum material needs)
      const byDate: Array<{ date: string; totalQty: number; cost: number }> = [];
      const cursor = new Date(fromDate);
      cursor.setHours(0, 0, 0, 0);
      while (cursor <= toDate) {
        let dayQty = 0;
        let dayCost = 0;
        for (const m of materials) {
          for (const t of m.tasks) {
            // Check if task is active on this day
            if (cursor >= new Date(t.taskStartDate) && cursor <= new Date(t.taskEndDate)) {
              const taskDays = Math.max(1, Math.ceil(
                (new Date(t.taskEndDate).getTime() - new Date(t.taskStartDate).getTime()) / (1000 * 60 * 60 * 24)
              ));
              dayQty += t.quantity / taskDays;
              dayCost += (t.quantity / taskDays) * m.rate;
            }
          }
        }
        byDate.push({
          date: cursor.toISOString().split("T")[0],
          totalQty: Math.round(dayQty * 100) / 100,
          cost: Math.round(dayCost * 100) / 100,
        });
        cursor.setDate(cursor.getDate() + 1);
      }

      return {
        materials,
        byDate,
        totals: {
          materialCount: materials.length,
          totalCost: materials.reduce((s, m) => s + m.totalCost, 0),
        },
      };
    }),
});
