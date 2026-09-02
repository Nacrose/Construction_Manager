/**
 * Gantt versioning, approval, and revision workflow router.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "@/server/trpc";
import { db } from "@/lib/db";
import { assertProjectMember, assertCanWrite } from "@/lib/authz";
import { audit } from "@/lib/audit";
import { withOrgContext, withTenantTx } from "@/lib/rls";
import { notifyProjectMembers } from "@/server/utils/notify";
import { transitionEntityState } from "@/server/utils/state-machine";

/**
 * IDOR guard: throws FORBIDDEN if `version.projectId !== projectId`.
 * Call this on every version returned from db.ganttVersion.findUnique
 * before mutating or returning its data — the versionId is a cuid that
 * leaks via audit logs, member lists, and notifications, so a caller
 * authorized on project A could otherwise pass a versionId from
 * project B and read/mutate that version's data.
 */
function assertVersionBelongsToProject(
  version: { projectId: string } | null,
  projectId: string,
  message = "Version not found.",
): asserts version {
  if (!version) {
    throw new TRPCError({ code: "NOT_FOUND", message });
  }
  if (version.projectId !== projectId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Version does not belong to this project.",
    });
  }
}

export async function cloneDependencies(
  idMap: Map<string, string>,
  tx: any
): Promise<{ cloned: number; failed: number; errors: string[] }> {
  const oldIds = Array.from(idMap.keys());
  const result = { cloned: 0, failed: 0, errors: [] as string[] };
  if (oldIds.length === 0) return result;
  const deps = await tx.taskDependency.findMany({
    where: { OR: [{ predecessorId: { in: oldIds } }, { successorId: { in: oldIds } }] },
     take: 1000, // bounded (pagination sweep) — see src/lib/pagination.ts
   });

  // BATCHED (was one INSERT per dependency inside a try/catch loop): a
  // 500-task version with ~1000 dependency edges paid 1000 round-trips
  // per clone. One createMany with skipDuplicates preserves the P2002
  // tolerance the loop had (re-clone collisions), and in-batch collapses
  // (two old edges mapping to the same new pair) are skipped by the same
  // ON CONFLICT DO NOTHING. A batch-level failure is loud, not swallowed.
  const rows = deps
    .map((dep: { predecessorId: string; successorId: string; type: string; offset: any }) => {
      const newPred = idMap.get(dep.predecessorId);
      const newSucc = idMap.get(dep.successorId);
      if (!newPred || !newSucc) return null;
      return {
        predecessorId: newPred,
        successorId: newSucc,
        type: dep.type,
        offset: dep.offset,
      };
    })
    .filter(Boolean);

  if (rows.length === 0) return result;
  try {
    const inserted = await tx.taskDependency.createMany({
      data: rows,
      skipDuplicates: true,
    });
    result.cloned = inserted.count;
  } catch (err: any) {
    // The whole batch failed — the clone is unusable for dependency
    // purposes; report loudly (the old loop logged per-row and let the
    // version commit with silently missing edges, which is exactly the
    // failure mode the previous ERROR LOGGING FIX was chasing).
    result.failed = rows.length;
    const msg = err instanceof Error ? err.message : String(err);
    result.errors.push(`Failed to batch-clone ${rows.length} dependencies: ${msg}`);
    console.error("[cloneDependencies] Batch insert failed:", msg);
  }
  return result;
}

export async function cloneResourceAssignments(
  idMap: Map<string, string>,
  tx: any
): Promise<void> {
  const oldIds = Array.from(idMap.keys());
  if (oldIds.length === 0) return;
  const assignments = await tx.resourceAssignment.findMany({
    where: { taskId: { in: oldIds } },
     take: 1000, // bounded (pagination sweep) — see src/lib/pagination.ts
   });

  // BATCHED (was one INSERT per assignment with `.catch(() => {})` that
  // silently swallowed ALL failures — a clone could lose every resource
  // assignment with zero signal). skipDuplicates keeps the old tolerance
  // for re-clone collisions; batch failures now log loudly.
  const rows = assignments
    .map((a: { taskId: string; staffRoleId: string | null; quantity: any; unit: string | null; notes: string | null }) => {
      const newTaskId = idMap.get(a.taskId);
      if (!newTaskId) return null;
      return {
        taskId: newTaskId,
        staffRoleId: a.staffRoleId,
        staffId: null,
        equipmentId: null,
        quantity: a.quantity,
        unit: a.unit,
        notes: a.notes,
      };
    })
    .filter(Boolean);

  if (rows.length === 0) return;
  try {
    await tx.resourceAssignment.createMany({ data: rows, skipDuplicates: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[cloneResourceAssignments] Batch insert failed:", msg);
    throw err;
  }
}

const CreateVersionSchema = z.object({
  projectId: z.string(),
  name: z.string().optional(),
  description: z.string().optional(),
  baseVersionId: z.string().optional(),
});

export const ganttVersionsRouter = router({
  listVersions: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);
      let versions = await db.ganttVersion.findMany({
        where: { projectId: input.projectId },
        orderBy: { createdAt: "desc" },
        take: 500, // versions per project are few; cap is a safety net
      });
      if (versions.length === 0) {
        const defaultVer = await db.ganttVersion.create({
          data: { projectId: input.projectId, name: "Default Running", isActive: true },
        });
        versions = [defaultVer];
        // RLS: GanttTask is FORCE-scoped — backfill runs on a
        // context-pinned transaction instead of the pooled client.
        await withTenantTx(ctx.user, async (tx) => {
          await tx.ganttTask.updateMany({
            where: { projectId: input.projectId, versionId: null },
            data: { versionId: defaultVer.id },
          });
        });
      }
      return { versions };
    }),

  createVersion: protectedProcedure
    .input(CreateVersionSchema)
    .mutation(async ({ ctx, input }) => {
      const role = await assertProjectMember(ctx.user, input.projectId);
      if (role === "client" || role === "inspector")
        throw new TRPCError({ code: "FORBIDDEN", message: "Read-only" });

      const baseVersionId =
        input.baseVersionId ||
        (
          await db.ganttVersion.findFirst({
            where: { projectId: input.projectId, isActive: true },
            select: { id: true },
          })
        )?.id;

      if (!baseVersionId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "No base version found to clone from",
        });
      }

      const maxVersion = await db.ganttVersion.aggregate({
        where: { projectId: input.projectId },
        _max: { versionNumber: true },
      });
      const nextVersionNumber = (maxVersion._max.versionNumber ?? 0) + 1;

      const newVersion = await db.$transaction(async (tx) => {
        await withOrgContext(tx, ctx.user.organizationId, !!ctx.user.isSuperAdmin); // RLS: phase-3a/b/c tables are FORCE-scoped
        const newVer = await tx.ganttVersion.create({
          data: {
            projectId: input.projectId,
            versionNumber: nextVersionNumber,
            name: input.name,
            description: input.description,
            baseVersionId: baseVersionId,
            status: "DRAFT",
          },
        });

        const sourceTasks = await tx.ganttTask.findMany({
          where: { versionId: baseVersionId },
          include: { boqLinks: true },
        });

        const idMap = new Map<string, string>();
        for (const task of sourceTasks) {
          const newTask = await tx.ganttTask.create({
            data: {
              projectId: input.projectId,
              versionId: newVer.id,
              name: task.name,
              code: task.code,
              startDate: task.startDate,
              endDate: task.endDate,
              duration: task.duration,
              progress: task.progress,
              baseProgress: task.progress,
              isProgressEdited: false,
              baseVersionId: baseVersionId,
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
            } catch (e) {
              console.error(
                "[gantt.createVersion] Failed to remap dependencies for task",
                task.id,
                e
              );
            }
          }
          await tx.ganttTask.update({
            where: { id: idMap.get(task.id) },
            data: {
              parentId: task.parentId ? idMap.get(task.parentId) : null,
              dependencies: newDeps,
            },
          });
        }

        await cloneDependencies(idMap, tx);
        await cloneResourceAssignments(idMap, tx);

        return newVer;
      });

      return { version: newVersion };
    }),

  approveVersion: protectedProcedure
    .input(z.object({ projectId: z.string(), versionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const role = await assertProjectMember(ctx.user, input.projectId);
      if (role !== "project_manager") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only project managers can approve versions.",
        });
      }

      const version = await db.ganttVersion.findUnique({
        where: { id: input.versionId },
        select: { id: true, status: true, projectId: true, versionNumber: true },
      });
      assertVersionBelongsToProject(version, input.projectId);
      if (version.status !== "DRAFT") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only draft versions can be approved.",
        });
      }

      const currentActive = await db.ganttVersion.findFirst({
        where: {
          projectId: input.projectId,
          isActive: true,
          id: { not: input.versionId },
        },
      });

      await db.$transaction(async (tx) => {
        await withOrgContext(tx, ctx.user.organizationId, !!ctx.user.isSuperAdmin); // RLS: phase-3a/b/c tables are FORCE-scoped

        // Serialize concurrent approvals of DIFFERENT versions: claim the
        // currently-active version with a compare-and-swap first. Two PMs
        // approving two versions at once would otherwise BOTH archive the
        // old active version and BOTH activate themselves — leaving two
        // active versions and breaking the one-active-per-project
        // invariant. The CAS makes the second approval CONFLICT and retry
        // against the new state of the world.
        if (currentActive) {
          const archived = await tx.ganttVersion.updateMany({
            where: { id: currentActive.id, isActive: true, status: "APPROVED" },
            data: { isActive: false, status: "ARCHIVED" },
          });
          if (archived.count === 0) {
            throw new TRPCError({
              code: "CONFLICT",
              message: "The active version just changed — reload and retry.",
            });
          }
        }

        // Engine transition: CAS on the DRAFT status kills double-approval
        // of the same version (approvedAt/approvedById stamped by the
        // engine; isActive rides additionalData).
        await transitionEntityState(tx, {
          model: "ganttVersion",
          id: input.versionId,
          projectId: input.projectId,
          targetState: "APPROVED",
          additionalData: { isActive: true },
          userId: ctx.user.id,
          userName: ctx.user.name,
          skipEventEmit: true, // approval notifies via audit + UI polling
        });
      });

      return { version: { ...version, status: "APPROVED" as const } };
    }),

  createRevision: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        reason: z.string().min(1).max(500),
        name: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertCanWrite(ctx.user, input.projectId);

      const currentBaseline = await db.ganttVersion.findFirst({
        where: {
          projectId: input.projectId,
          scheduleType: "PLANNING",
          status: "APPROVED",
        },
        select: { id: true, versionNumber: true, name: true },
      });
      if (!currentBaseline) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message:
            "No approved planning baseline found. Create and approve a planning schedule first.",
        });
      }

      const pending = await db.ganttVersion.findFirst({
        where: {
          projectId: input.projectId,
          scheduleType: "PLANNING",
          revisionStatus: { in: ["DRAFT", "SUBMITTED"] },
        },
        select: { id: true },
      });
      if (pending) {
        throw new TRPCError({
          code: "CONFLICT",
          message:
            "A pending revision already exists. Approve or reject it before creating a new one.",
        });
      }

      const maxVersion = await db.ganttVersion.aggregate({
        where: { projectId: input.projectId },
        _max: { versionNumber: true },
      });
      const nextVersionNumber = (maxVersion._max.versionNumber ?? 0) + 1;

      const revision = await db.$transaction(async (tx) => {
        await withOrgContext(tx, ctx.user.organizationId, !!ctx.user.isSuperAdmin); // RLS: phase-3a/b/c tables are FORCE-scoped
        const rev = await tx.ganttVersion.create({
          data: {
            projectId: input.projectId,
            versionNumber: nextVersionNumber,
            name:
              input.name ||
              `Revision of ${currentBaseline.name || "v" + currentBaseline.versionNumber}`,
            baseVersionId: currentBaseline.id,
            scheduleType: "PLANNING",
            status: "DRAFT",
            revisionOfId: currentBaseline.id,
            revisionReason: input.reason,
            revisionStatus: "DRAFT",
          },
        });

        const sourceTasks = await tx.ganttTask.findMany({
          where: { versionId: currentBaseline.id },
          include: { boqLinks: true },
          orderBy: { sortOrder: "asc" },
        });

        const idMap = new Map<string, string>();
        for (const task of sourceTasks) {
          const newTask = await tx.ganttTask.create({
            data: {
              projectId: input.projectId,
              versionId: rev.id,
              name: task.name,
              code: task.code,
              startDate: task.startDate,
              endDate: task.endDate,
              duration: task.duration,
              progress: task.progress,
              baseProgress: task.progress,
              isProgressEdited: false,
              baseVersionId: currentBaseline.id,
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

        return rev;
      });

      await audit({
        userId: ctx.user.id,
        projectId: input.projectId,
        action: "gantt.createRevision",
        entityType: "gantt_version",
        entityId: revision.id,
        metadata: { reason: input.reason, revisionOf: currentBaseline.id },
      });

      return { version: revision };
    }),

  submitRevision: protectedProcedure
    .input(z.object({ versionId: z.string(), projectId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertCanWrite(ctx.user, input.projectId);

      const version = await db.ganttVersion.findUnique({
        where: { id: input.versionId },
        select: { id: true, scheduleType: true, revisionStatus: true, projectId: true },
      });
      assertVersionBelongsToProject(version, input.projectId);
      if (version.scheduleType !== "PLANNING") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only planning schedules can be submitted for revision.",
        });
      }
      if (version.revisionStatus !== "DRAFT") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only DRAFT revisions can be submitted.",
        });
      }

      const updated = await db.ganttVersion.update({
        where: { id: input.versionId },
        data: {
          revisionStatus: "SUBMITTED",
          submittedAt: new Date(),
          submittedById: ctx.user.id,
        },
      });

      await audit({
        userId: ctx.user.id,
        projectId: input.projectId,
        action: "gantt.submitRevision",
        entityType: "gantt_version",
        entityId: input.versionId,
      });

      await notifyProjectMembers({
        projectId: input.projectId,
        type: "revision_submitted",
        title: "Schedule revision submitted for approval",
        message: `Revision v${(version as any).versionNumber} has been submitted for approval. Review and approve/reject in the Schedule tab.`,
        metadata: { versionId: input.versionId },
        excludeUserId: ctx.user.id,
      });

      return { version: updated };
    }),

  approveRevision: protectedProcedure
    .input(
      z.object({
        versionId: z.string(),
        projectId: z.string(),
        approvalNote: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const role = await assertProjectMember(ctx.user, input.projectId);
      if (role !== "project_manager") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only project managers can approve revisions.",
        });
      }

      const version = await db.ganttVersion.findUnique({
        where: { id: input.versionId },
        select: {
          id: true,
          scheduleType: true,
          revisionStatus: true,
          revisionOfId: true,
          projectId: true,
        },
      });
      assertVersionBelongsToProject(version, input.projectId);
      if (version.revisionStatus !== "SUBMITTED") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only SUBMITTED revisions can be approved.",
        });
      }

      await db.$transaction(async (tx) => {
        await withOrgContext(tx, ctx.user.organizationId, !!ctx.user.isSuperAdmin); // RLS: phase-3a/b/c tables are FORCE-scoped
        if (version.revisionOfId) {
          // Claim-serialize the superseded active version (same rationale
          // as approveVersion: two concurrent revision approvals must not
          // both end up active).
          const archived = await tx.ganttVersion.updateMany({
            where: { id: version.revisionOfId, isActive: true },
            data: { isActive: false, status: "ARCHIVED", revisionStatus: "ARCHIVED" },
          });
          if (archived.count === 0) {
            throw new TRPCError({
              code: "CONFLICT",
              message: "The active version just changed — reload and retry.",
            });
          }
        }

        // Engine transition (CAS on the DRAFT status) — revisionStatus and
        // the approval note ride additionalData; approvedAt/approvedById
        // are stamped by the engine.
        await transitionEntityState(tx, {
          model: "ganttVersion",
          id: input.versionId,
          projectId: input.projectId,
          targetState: "APPROVED",
          additionalData: {
            isActive: true,
            revisionStatus: "APPROVED",
            approvalNote: input.approvalNote,
          },
          userId: ctx.user.id,
          userName: ctx.user.name,
          skipEventEmit: true, // notifyProjectMembers below covers comms
        });
      });

      await audit({
        userId: ctx.user.id,
        projectId: input.projectId,
        action: "gantt.approveRevision",
        entityType: "gantt_version",
        entityId: input.versionId,
        metadata: { approvalNote: input.approvalNote },
      });

      await notifyProjectMembers({
        projectId: input.projectId,
        type: "revision_approved",
        title: "Schedule revision approved",
        message: `Revision v${(version as any).versionNumber} has been approved. The new baseline is now active.`,
        metadata: { versionId: input.versionId, approvalNote: input.approvalNote },
        excludeUserId: ctx.user.id,
      });

      return { ok: true };
    }),

  rejectRevision: protectedProcedure
    .input(
      z.object({
        versionId: z.string(),
        projectId: z.string(),
        rejectionNote: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const role = await assertProjectMember(ctx.user, input.projectId);
      if (role !== "project_manager") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only project managers can reject revisions.",
        });
      }

      const version = await db.ganttVersion.findUnique({
        where: { id: input.versionId },
        select: { id: true, revisionStatus: true, projectId: true },
      });
      assertVersionBelongsToProject(version, input.projectId);
      if (version.revisionStatus !== "SUBMITTED") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only SUBMITTED revisions can be rejected.",
        });
      }

      await db.ganttVersion.update({
        where: { id: input.versionId },
        data: { revisionStatus: "DRAFT", approvalNote: input.rejectionNote },
      });

      await audit({
        userId: ctx.user.id,
        projectId: input.projectId,
        action: "gantt.rejectRevision",
        entityType: "gantt_version",
        entityId: input.versionId,
        metadata: { rejectionNote: input.rejectionNote },
      });

      await notifyProjectMembers({
        projectId: input.projectId,
        type: "revision_rejected",
        title: "Schedule revision rejected",
        message: `Revision v${(version as any).versionNumber} was rejected. It has been reset to DRAFT for editing. Reason: ${input.rejectionNote ?? "Not specified"}`,
        metadata: {
          versionId: input.versionId,
          rejectionNote: input.rejectionNote,
        },
      });

      return { ok: true };
    }),

  deleteVersion: protectedProcedure
    .input(z.object({ projectId: z.string(), versionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertCanWrite(ctx.user, input.projectId);

      const version = await db.ganttVersion.findUnique({
        where: { id: input.versionId },
        select: {
          id: true,
          status: true,
          projectId: true,
          isActive: true,
          scheduleType: true,
        },
      });
      assertVersionBelongsToProject(version, input.projectId);
      if (version.isActive) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot delete the active version. Archive it first.",
        });
      }
      if (version.status === "APPROVED") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot delete an APPROVED version. Archive it first.",
        });
      }

      await db.ganttVersion.delete({ where: { id: input.versionId } });

      await audit({
        userId: ctx.user.id,
        projectId: input.projectId,
        action: "gantt.deleteVersion",
        entityType: "gantt_version",
        entityId: input.versionId,
      });

      return { ok: true };
    }),

  archiveVersion: protectedProcedure
    .input(z.object({ projectId: z.string(), versionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertCanWrite(ctx.user, input.projectId);

      const version = await db.ganttVersion.findUnique({
        where: { id: input.versionId },
        select: { id: true, projectId: true, isActive: true },
      });
      assertVersionBelongsToProject(version, input.projectId);

      await db.ganttVersion.update({
        where: { id: input.versionId },
        data: { status: "ARCHIVED", isActive: false, revisionStatus: "ARCHIVED" },
      });

      await audit({
        userId: ctx.user.id,
        projectId: input.projectId,
        action: "gantt.archiveVersion",
        entityType: "gantt_version",
        entityId: input.versionId,
      });

      return { ok: true };
    }),

  getRevisionDocument: protectedProcedure
    .input(z.object({ projectId: z.string(), versionId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertProjectMember(ctx.user, input.projectId);

      const version = await db.ganttVersion.findUnique({
        where: { id: input.versionId },
        include: {
          project: {
            select: {
              id: true,
              name: true,
              code: true,
              client: true,
              location: true,
              contractValue: true,
              startDate: true,
              endDate: true,
            },
          },
          revisionOf: {
            select: {
              id: true,
              versionNumber: true,
              name: true,
              approvedAt: true,
              approvedById: true,
            },
          },
          approvedBy: { select: { id: true, name: true, email: true } },
        },
      });

      assertVersionBelongsToProject(version, input.projectId);

      const currentTasks = await db.ganttTask.findMany({
        where: { versionId: input.versionId },
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          name: true,
          code: true,
          startDate: true,
          endDate: true,
          duration: true,
          progress: true,
        },
         take: 1000, // bounded (pagination sweep) — see src/lib/pagination.ts
       });

      let previousTasks: Array<{
        id: string;
        name: string;
        code: string | null;
        startDate: Date;
        endDate: Date;
        duration: number;
      }> = [];
      if (version.revisionOfId) {
        previousTasks = await db.ganttTask.findMany({
          where: { versionId: version.revisionOfId },
          orderBy: { sortOrder: "asc" },
          select: {
            id: true,
            name: true,
            code: true,
            startDate: true,
            endDate: true,
            duration: true,
          },
           take: 1000, // bounded (pagination sweep) — see src/lib/pagination.ts
         });
      }

      const prevStartDates = previousTasks
        .map((t) => new Date(t.startDate).getTime())
        .filter(Boolean);
      const prevEndDates = previousTasks
        .map((t) => new Date(t.endDate).getTime())
        .filter(Boolean);
      const currStartDates = currentTasks
        .map((t) => new Date(t.startDate).getTime())
        .filter(Boolean);
      const currEndDates = currentTasks
        .map((t) => new Date(t.endDate).getTime())
        .filter(Boolean);

      const prevProjectStart = prevStartDates.length
        ? new Date(Math.min(...prevStartDates))
        : null;
      const prevProjectEnd = prevEndDates.length
        ? new Date(Math.max(...prevEndDates))
        : null;
      const currProjectStart = currStartDates.length
        ? new Date(Math.min(...currStartDates))
        : null;
      const currProjectEnd = currEndDates.length
        ? new Date(Math.max(...currEndDates))
        : null;

      const prevDuration =
        prevProjectStart && prevProjectEnd
          ? Math.round(
              (prevProjectEnd.getTime() - prevProjectStart.getTime()) /
                (1000 * 60 * 60 * 24)
            )
          : 0;
      const currDuration =
        currProjectStart && currProjectEnd
          ? Math.round(
              (currProjectEnd.getTime() - currProjectStart.getTime()) /
                (1000 * 60 * 60 * 24)
            )
          : 0;
      const durationChange = currDuration - prevDuration;

      const changedTasks = currentTasks.filter((ct) => {
        const pt = previousTasks.find((p) => p.code === ct.code);
        if (!pt) return true;
        return (
          new Date(ct.startDate).getTime() !== new Date(pt.startDate).getTime() ||
          new Date(ct.endDate).getTime() !== new Date(pt.endDate).getTime() ||
          ct.duration !== pt.duration
        );
      });

      return {
        version: {
          id: version.id,
          versionNumber: version.versionNumber,
          name: version.name,
          scheduleType: version.scheduleType,
          status: version.status,
          revisionReason: version.revisionReason,
          revisionStatus: version.revisionStatus,
          submittedAt: version.submittedAt,
          approvedAt: version.approvedAt,
          approvalNote: version.approvalNote,
          createdAt: version.createdAt,
        },
        project: version.project,
        previousVersion: version.revisionOf
          ? {
              versionNumber: version.revisionOf.versionNumber,
              name: version.revisionOf.name,
              approvedAt: version.revisionOf.approvedAt,
            }
          : null,
        approvedBy: version.approvedBy
          ? { name: version.approvedBy.name, email: version.approvedBy.email }
          : null,
        impact: {
          prevProjectStart,
          prevProjectEnd,
          currProjectStart,
          currProjectEnd,
          prevDuration,
          currDuration,
          durationChange,
          totalTasks: currentTasks.length,
          changedTasks: changedTasks.length,
          newTasks: currentTasks.filter(
            (ct) => !previousTasks.find((p) => p.code === ct.code)
          ).length,
        },
        submittedBy: ctx.user,
      };
    }),
});
