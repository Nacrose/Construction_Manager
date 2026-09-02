/**
 * Gantt MS Project XML import procedures.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "@/server/trpc";
import { db } from "@/lib/db";
import { assertCanWrite } from "@/lib/authz";
import { audit } from "@/lib/audit";
import { recalculateWbsCodes } from "@/lib/wbs";
import { withTenantTx } from "@/lib/rls";
import { recalculateProjectSchedule } from "@/server/utils/gantt-cpm-engine";
import { parseMSPXML, type ParsedMSPTask } from "@/server/utils/msp-import";

export const ganttImportRouter = router({
  /** Preview an MS Project XML import without writing to DB. */
  previewImport: protectedProcedure
    .input(
      z.object({
        xml: z.string().min(1).max(5_000_000), // 5 MB cap — protects server memory
        versionId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const version = await db.ganttVersion.findUnique({
        where: { id: input.versionId },
        select: { projectId: true, versionNumber: true, scheduleType: true, status: true },
      });
      if (!version) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Version not found" });
      }
      await assertCanWrite(ctx.user, version.projectId);
      // H-6 FIX: enforce the same draft gate as every other Gantt mutation
      // (assertVersionIsEditable) — an import must never overwrite an
      // approved baseline.
      if (version.status && version.status !== "DRAFT") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Version ${version.versionNumber} is ${version.status} — imports are only allowed on DRAFT versions.`,
        });
      }

      const result = parseMSPXML(input.xml);
      if (result.tasks.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No tasks found in XML file",
        });
      }

      const existingTasks = await db.ganttTask.findMany({
        where: { versionId: input.versionId, code: { not: null } },
        select: { id: true, code: true },
      });
      const existingCodes = new Set(existingTasks.map((t) => t.code));

      const newCount = result.tasks.filter(
        (t) => !t.wbs || !existingCodes.has(t.wbs)
      ).length;
      const existingCount = result.tasks.length - newCount;

      return {
        projectName: result.projectName,
        startDate: result.startDate,
        finishDate: result.finishDate,
        taskCount: result.tasks.length,
        newCount,
        existingCount,
        resourceCount: result.resources.length,
        assignmentCount: result.assignments.length,
        warnings: result.warnings,
        previewTasks: result.tasks.slice(0, 10).map((t) => ({
          name: t.name,
          wbs: t.wbs,
          duration: t.durationDays,
          isMilestone: t.isMilestone,
        })),
      };
    }),

  /** Commit an MS Project XML import. */
  commitImport: protectedProcedure
    .input(
      z.object({
        xml: z.string().min(1).max(5_000_000), // 5 MB cap — protects server memory
        versionId: z.string(),
        mode: z.enum(["merge", "replace"]).default("merge"),
        updateExisting: z.boolean().default(true),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const version = await db.ganttVersion.findUnique({
        where: { id: input.versionId },
        select: { projectId: true, versionNumber: true, status: true },
      });
      if (!version) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Version not found" });
      }
      await assertCanWrite(ctx.user, version.projectId);
      // H-6 FIX: draft gate on the WRITE path — previously commit/preview
      // were the only Gantt mutations without it, so an import could
      // silently overwrite an approved baseline.
      if (version.status && version.status !== "DRAFT") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Version ${version.versionNumber} is ${version.status} — imports are only allowed on DRAFT versions.`,
        });
      }

      const result = parseMSPXML(input.xml);
      if (result.tasks.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No tasks found in XML file",
        });
      }

      const parentStack: Array<{
        uid: number;
        level: number;
        newId: string | null;
      }> = [];

      const uidToNewId = new Map<number, string>();

      let created = 0;
      let updated = 0;
      let skipped = 0;

      const existingByCode = new Map(
        (
          await db.ganttTask.findMany({
            where: { versionId: input.versionId, code: { not: null } },
            select: { id: true, code: true },
          })
        ).map((t) => [t.code!, t.id])
      );

      // RLS: GanttTask is FORCE-scoped — the whole import (task upserts +
      // dependency rebuild + replace-mode deletes + WBS + CPM recalc) runs
      // as ONE context-pinned transaction: either the import lands complete
      // or nothing lands. (Resource assignments below target unscoped
      // tables and stay outside the transaction.)
      let dependenciesCreated = 0;
      const { deleted } = await withTenantTx(ctx.user, async (tx) => {
        for (let i = 0; i < result.tasks.length; i++) {
          const t = result.tasks[i];

          while (
            parentStack.length > 0 &&
            parentStack[parentStack.length - 1].level >= t.outlineLevel
          ) {
            parentStack.pop();
          }
          const parentUid =
            parentStack.length > 0
              ? parentStack[parentStack.length - 1].uid
              : null;
          const parentId = parentUid ? uidToNewId.get(parentUid) ?? null : null;

          let existingId: string | null = null;
          if (t.wbs && existingByCode.has(t.wbs)) {
            existingId = existingByCode.get(t.wbs)!;
          }

          const taskData = {
          projectId: version.projectId,
          versionId: input.versionId,
          parentId,
          code: t.wbs,
          name: t.name,
          startDate: t.startDate,
          endDate: t.endDate,
          actualStartDate: t.actualStartDate,
          actualEndDate: t.actualEndDate,
          duration: t.durationDays,
          progress: t.progress,
          isMilestone: t.isMilestone,
          sortOrder: i,
          plannedValue: t.plannedCost,
          workHours: t.workHours,
          taskType: t.taskType,
          constraintType: t.constraintType,
          constraintDate: t.constraintDate,
          deadline: t.deadline,
          notes: t.notes,
          effortDriven: t.effortDriven,
          estimated: t.estimated,
          ignoreResourceCalendar: t.ignoreResourceCalendar,
          priority: t.priority,
          earnedValueMethod: t.earnedValueMethod,
        };

        if (existingId && input.updateExisting) {
          await tx.ganttTask.update({
            where: { id: existingId },
            data: taskData,
          });
          uidToNewId.set(t.uid, existingId);
          updated++;
        } else if (existingId && !input.updateExisting) {
          uidToNewId.set(t.uid, existingId);
          skipped++;
        } else {
          const newTask = await tx.ganttTask.create({ data: taskData });
          uidToNewId.set(t.uid, newTask.id);
          created++;
        }

        parentStack.push({
          uid: t.uid,
          level: t.outlineLevel,
          newId: uidToNewId.get(t.uid) ?? null,
        });
      }

      if (input.updateExisting) {
        const allTaskIds = Array.from(uidToNewId.values());
        if (allTaskIds.length > 0) {
          await tx.taskDependency.deleteMany({
            where: {
              OR: [
                { predecessorId: { in: allTaskIds } },
                { successorId: { in: allTaskIds } },
              ],
            },
          });
        }
      }

      const depRecords: Array<{
        predecessorId: string;
        successorId: string;
        type: string;
        offset: number;
      }> = [];
      for (const t of result.tasks) {
        const successorId = uidToNewId.get(t.uid);
        if (!successorId) continue;
        for (const pred of t.predecessors) {
          const predecessorId = uidToNewId.get(pred.predecessorUid);
          if (!predecessorId) continue;
          depRecords.push({
            predecessorId,
            successorId,
            type: pred.type,
            offset: pred.offsetDays,
          });
        }
      }

      dependenciesCreated = depRecords.length;
      if (depRecords.length > 0) {
        await tx.taskDependency.createMany({
          data: depRecords,
          skipDuplicates: true,
        });
      }

      let deleted = 0;
      if (input.mode === "replace") {
        const importedIds = new Set(uidToNewId.values());
        const allVersionTasks = await tx.ganttTask.findMany({
          where: { versionId: input.versionId },
          select: { id: true },
        });
        const toDelete = allVersionTasks
          .filter((t) => !importedIds.has(t.id))
          .map((t) => t.id);
        if (toDelete.length > 0) {
          await tx.ganttTask.deleteMany({ where: { id: { in: toDelete } } });
          deleted = toDelete.length;
        }
      }

      await recalculateWbsCodes(version.projectId, input.versionId, tx);
      await recalculateProjectSchedule(version.projectId, input.versionId, {
        useCalendar: true,
        tx,
      });
      return { deleted };
      });

      let assignmentsCreated = 0;
      let assignmentsSkipped = 0;

      if (result.assignments.length > 0 && result.resources.length > 0) {
        const resourceMap = new Map(result.resources.map((r) => [r.uid, r]));

        const staffList = await db.staff.findMany({
          where: { projectId: version.projectId, status: "active" },
          select: { id: true, name: true, category: true },
        });
        const staffByName = new Map<string, string>();
        for (const s of staffList) {
          staffByName.set(s.name.toLowerCase().trim(), s.id);
        }

        const staffRoles = await db.staffRole.findMany({
          where: { projectId: version.projectId },
          select: { id: true, name: true, category: true },
        });
        const roleByName = new Map<string, string>();
        for (const r of staffRoles) {
          roleByName.set(r.name.toLowerCase().trim(), r.id);
        }

        const assignmentRecords: Array<{
          taskId: string;
          staffId?: string;
          staffRoleId?: string;
          quantity: number;
          unit: string;
          startDate: Date | null;
          endDate: Date | null;
          workHours: number;
          resourceType: string;
          materialLabel: string | null;
        }> = [];

        for (const asg of result.assignments) {
          const taskId = uidToNewId.get(asg.taskUid);
          const resource = resourceMap.get(asg.resourceUid);
          if (!taskId || !resource) {
            assignmentsSkipped++;
            continue;
          }

          const resourceName = resource.name.toLowerCase().trim();
          const staffId = staffByName.get(resourceName);
          const staffRoleId = staffId ? undefined : roleByName.get(resourceName);

          if (!staffId && !staffRoleId) {
            assignmentsSkipped++;
            continue;
          }

          assignmentRecords.push({
            taskId,
            staffId,
            staffRoleId,
            quantity: asg.units,
            unit:
              resource.type === "material"
                ? (resource.materialLabel ?? "unit")
                : "person",
            startDate: asg.startDate,
            endDate: asg.endDate,
            workHours: asg.workHours,
            resourceType: resource.type,
            materialLabel: resource.materialLabel,
          });
        }

        if (assignmentRecords.length > 0) {
          if (input.updateExisting) {
            const allTaskIds = Array.from(uidToNewId.values());
            await db.resourceAssignment.deleteMany({
              where: { taskId: { in: allTaskIds } },
            });
          }

          await db.resourceAssignment.createMany({
            data: assignmentRecords.map((r) => ({
              taskId: r.taskId,
              staffId: r.staffId ?? null,
              staffRoleId: r.staffRoleId ?? null,
              equipmentId: null,
              quantity: r.quantity,
              unit: r.unit,
              startDate: r.startDate,
              endDate: r.endDate,
              workHours: r.workHours,
              resourceType: r.resourceType,
              materialLabel: r.materialLabel,
            })),
          });
          assignmentsCreated = assignmentRecords.length;
        }
      }

      await audit({
        userId: ctx.user.id,
        projectId: version.projectId,
        action: "gantt.import_msp",
        entityType: "gantt_version",
        entityId: input.versionId,
        metadata: {
          projectName: result.projectName,
          total: result.tasks.length,
          created,
          updated,
          skipped,
          deleted,
          mode: input.mode,
          assignmentsCreated,
          assignmentsSkipped,
        },
      });

      return {
        projectName: result.projectName,
        totalTasks: result.tasks.length,
        created,
        updated,
        skipped,
        deleted,
        dependenciesCreated,
        assignmentsCreated,
        assignmentsSkipped,
        warnings: result.warnings,
      };
    }),
});
