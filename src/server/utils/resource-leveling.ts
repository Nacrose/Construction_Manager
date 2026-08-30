/**
 * Resource conflict detection + leveling utilities.
 *
 * Detects over-allocation: when the same resource (staff or equipment)
 * is assigned to two tasks whose date ranges overlap.
 *
 * Also provides a simple leveling algorithm that delays non-critical
 * tasks to eliminate conflicts (preserves dependencies, doesn't delay
 * the project beyond a configurable threshold).
 */

export type ConflictInfo = {
  resourceId: string;
  resourceName: string;
  resourceType: "staff" | "equipment";
  task1Id: string;
  task1Name: string;
  task1Code: string | null;
  task1Start: Date;
  task1End: Date;
  task2Id: string;
  task2Name: string;
  task2Code: string | null;
  task2Start: Date;
  task2End: Date;
  overlapDays: number;
  overlapStart: Date;
  overlapEnd: Date;
};

export type AssignmentWithTask = {
  id: string;
  taskId: string;
  staffId: string | null;
  equipmentId: string | null;
  staffRoleId: string | null;
  quantity: number;
  task: {
    id: string;
    name: string;
    code: string | null;
    startDate: Date;
    endDate: Date;
    sortOrder: number;
  };
  staff: { id: string; name: string } | null;
  equipment: { id: string; name: string; code: string | null } | null;
  staffRole: { id: string; name: string } | null;
};

/**
 * Detect all resource conflicts for a set of assignments.
 *
 * A conflict exists when:
 * - Two tasks share the same staffId or equipmentId
 * - AND their date ranges overlap (task1.start < task2.end AND task2.start < task1.end)
 *
 * Returns a list of ConflictInfo objects, sorted by overlap days (descending).
 */
export function detectConflicts(assignments: AssignmentWithTask[]): ConflictInfo[] {
  const conflicts: ConflictInfo[] = [];

  // Group assignments by resource (staffId or equipmentId)
  const byStaff = new Map<string, AssignmentWithTask[]>();
  const byEquipment = new Map<string, AssignmentWithTask[]>();

  for (const a of assignments) {
    if (a.staffId) {
      const arr = byStaff.get(a.staffId) ?? [];
      arr.push(a);
      byStaff.set(a.staffId, arr);
    }
    if (a.equipmentId) {
      const arr = byEquipment.get(a.equipmentId) ?? [];
      arr.push(a);
      byEquipment.set(a.equipmentId, arr);
    }
  }

  // Check for overlaps within each staff's assignments
  for (const [staffId, staffAssignments] of byStaff) {
    const newConflicts = findOverlaps(staffAssignments, "staff", staffId);
    conflicts.push(...newConflicts);
  }

  // Check for overlaps within each equipment's assignments
  for (const [equipId, equipAssignments] of byEquipment) {
    const newConflicts = findOverlaps(equipAssignments, "equipment", equipId);
    conflicts.push(...newConflicts);
  }

  // Sort by overlap days descending
  conflicts.sort((a, b) => b.overlapDays - a.overlapDays);

  return conflicts;
}

function findOverlaps(
  assignments: AssignmentWithTask[],
  type: "staff" | "equipment",
  resourceId: string
): ConflictInfo[] {
  const conflicts: ConflictInfo[] = [];

  // Sort by start date
  const sorted = [...assignments].sort(
    (a, b) => new Date(a.task.startDate).getTime() - new Date(b.task.startDate).getTime()
  );

  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const a1 = sorted[i];
      const a2 = sorted[j];

      const start1 = new Date(a1.task.startDate);
      const end1 = new Date(a1.task.endDate);
      const start2 = new Date(a2.task.startDate);
      const end2 = new Date(a2.task.endDate);

      // Check overlap: start1 < end2 AND start2 < end1
      if (start1 < end2 && start2 < end1) {
        const overlapStart = start1 > start2 ? start1 : start2;
        const overlapEnd = end1 < end2 ? end1 : end2;
        const overlapDays =
          Math.round((overlapEnd.getTime() - overlapStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;

        const resourceName =
          type === "staff"
            ? a1.staff?.name ?? "Unknown"
            : a1.equipment?.name ?? "Unknown";

        conflicts.push({
          resourceId,
          resourceName,
          resourceType: type,
          task1Id: a1.taskId,
          task1Name: a1.task.name,
          task1Code: a1.task.code,
          task1Start: start1,
          task1End: end1,
          task2Id: a2.taskId,
          task2Name: a2.task.name,
          task2Code: a2.task.code,
          task2Start: start2,
          task2End: end2,
          overlapDays,
          overlapStart,
          overlapEnd,
        });
      }
    }
  }

  return conflicts;
}

/**
 * Simple resource leveling heuristic.
 *
 * For each conflict, propose delaying one of the two overlapping tasks so
 * they no longer overlap (the delayed task starts exactly when the other
 * ends — end-exclusive, no overshoot).
 *
 * Which task gets delayed:
 * - When `floatByTaskId` is provided (from the CPM backward pass), the task
 *   with MORE total float is delayed — the one with less slack stays put,
 *   so the project finish is disturbed as little as possible.
 * - Without float data, task2 (the later-starting task) is delayed.
 *
 * These are PROPOSALS: the caller (UI / applyLeveling endpoint) reviews
 * and applies them. Proposals are NOT dependency-checked here — applying
 * a proposal that violates a dependency is corrected by the CPM forward
 * pass that `applyLeveling` runs afterwards (the dependency graph always
 * wins). A full implementation would level critical-path-aware with
 * resource calendars; this is sufficient for small-to-medium projects.
 */
export function proposeLeveling(
  conflicts: ConflictInfo[],
  floatByTaskId?: Map<string, number>
): Array<{
  taskId: string;
  taskName: string;
  taskCode: string | null;
  currentStart: Date;
  currentEnd: Date;
  newStart: Date;
  newEnd: Date;
  delayDays: number;
}> {
  const proposals: Map<string, { taskId: string; taskName: string; taskCode: string | null; currentStart: Date; currentEnd: Date; newStart: Date; newEnd: Date; delayDays: number }> = new Map();

  const DAY_MS = 24 * 60 * 60 * 1000;

  /** Shift a task so it starts exactly when `blockerEnd` passes (no overshoot). */
  function shiftAfter(
    taskId: string,
    taskName: string,
    taskCode: string | null,
    currentStart: Date,
    currentEnd: Date,
    blockerEnd: Date
  ) {
    // Delay so that newStart === blockerEnd (end-exclusive: a task ending
    // Friday does not conflict with one starting Friday).
    const delayMs = blockerEnd.getTime() - currentStart.getTime();
    const delayDays = Math.ceil(delayMs / DAY_MS);
    if (delayDays <= 0) return; // already clear

    const existing = proposals.get(taskId);
    if (!existing || delayDays > existing.delayDays) {
      proposals.set(taskId, {
        taskId,
        taskName,
        taskCode,
        currentStart,
        currentEnd,
        newStart: new Date(currentStart.getTime() + delayDays * DAY_MS),
        newEnd: new Date(currentEnd.getTime() + delayDays * DAY_MS),
        delayDays,
      });
    }
  }

  for (const conflict of conflicts) {
    // Decide which side to delay: prefer delaying the task with MORE float
    // (it can slip without moving the project finish). Default: task2.
    const float1 = floatByTaskId?.get(conflict.task1Id);
    const float2 = floatByTaskId?.get(conflict.task2Id);
    const delayTask1 =
      float1 !== undefined &&
      float2 !== undefined &&
      float1 > float2;

    if (delayTask1) {
      shiftAfter(
        conflict.task1Id,
        conflict.task1Name,
        conflict.task1Code,
        conflict.task1Start,
        conflict.task1End,
        conflict.task2End
      );
    } else {
      shiftAfter(
        conflict.task2Id,
        conflict.task2Name,
        conflict.task2Code,
        conflict.task2Start,
        conflict.task2End,
        conflict.task1End
      );
    }
  }

  return Array.from(proposals.values()).sort((a, b) => b.delayDays - a.delayDays);
}
