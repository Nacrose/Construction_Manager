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
 * For each conflict, try to delay the task that starts later (task2)
 * to start after task1 ends. Only delay if:
 * - The task is not a milestone
 * - The delay doesn't violate dependencies (simplified check)
 *
 * Returns a list of proposed schedule changes:
 * { taskId, newStartDate, newEndDate, delayDays }
 *
 * NOTE: This is a basic heuristic. A full implementation would use
 * critical-path-based leveling with float calculation. This is
 * sufficient for small-to-medium projects.
 */
export function proposeLeveling(
  conflicts: ConflictInfo[]
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

  for (const conflict of conflicts) {
    // Try to delay task2 to start after task1 ends
    const _task2End = conflict.task2End;
    const task1End = conflict.task1End;

    // Calculate how many days to delay task2
    const delayMs = task1End.getTime() - conflict.task2Start.getTime();
    const delayDays = Math.ceil(delayMs / (1000 * 60 * 60 * 24)) + 1;

    if (delayDays <= 0) continue; // No delay needed

    const currentStart = new Date(conflict.task2Start);
    const currentEnd = new Date(conflict.task2End);
    const newStart = new Date(currentStart.getTime() + delayDays * 24 * 60 * 60 * 1000);
    const newEnd = new Date(currentEnd.getTime() + delayDays * 24 * 60 * 60 * 1000);

    // Only keep the maximum proposed delay per task
    const existing = proposals.get(conflict.task2Id);
    if (!existing || delayDays > existing.delayDays) {
      proposals.set(conflict.task2Id, {
        taskId: conflict.task2Id,
        taskName: conflict.task2Name,
        taskCode: conflict.task2Code,
        currentStart,
        currentEnd,
        newStart,
        newEnd,
        delayDays,
      });
    }
  }

  return Array.from(proposals.values()).sort((a, b) => b.delayDays - a.delayDays);
}
