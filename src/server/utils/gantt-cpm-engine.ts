/**
 * Gantt CPM Scheduling Engine & Cycle Detection
 * Provides graph cycle validation and automatic downstream forward-pass date cascading.
 */
import { db } from "@/lib/db";

export interface TaskDependencyEdge {
  predecessorId: string;
  successorId: string;
  type?: "FS" | "SS" | "FF" | "SF";
  offset?: number;
}

export interface TaskScheduleData {
  id: string;
  name: string;
  startDate: Date;
  endDate: Date;
  duration: number;
  isMilestone?: boolean;
}

/**
 * Pure Cycle Detection Algorithm
 * Checks if adding `newEdges` into `existingEdges` (optionally replacing edges for `excludeSuccessorId`) creates a cycle.
 */
export function detectCycle(
  existingEdges: TaskDependencyEdge[],
  newEdges: TaskDependencyEdge[],
  excludeSuccessorId?: string
): { hasCycle: boolean; cyclePath?: string[] } {
  // 1. Direct self-dependency check
  for (const edge of newEdges) {
    if (edge.predecessorId === edge.successorId) {
      return { hasCycle: true, cyclePath: [edge.predecessorId, edge.successorId] };
    }
  }

  // 2. Build adjacency graph
  const adj = new Map<string, string[]>();

  const addEdge = (u: string, v: string) => {
    const list = adj.get(u) ?? [];
    if (!list.includes(v)) {
      list.push(v);
      adj.set(u, list);
    }
  };

  // Add existing edges (excluding replaced successor if any)
  for (const edge of existingEdges) {
    if (excludeSuccessorId && edge.successorId === excludeSuccessorId) {
      continue;
    }
    addEdge(edge.predecessorId, edge.successorId);
  }

  // Add new edges
  for (const edge of newEdges) {
    addEdge(edge.predecessorId, edge.successorId);
  }

  // 3. DFS cycle detection with path reconstruction
  const visited = new Set<string>();
  const recStack = new Set<string>();
  const path: string[] = [];

  function dfs(node: string): boolean {
    visited.add(node);
    recStack.add(node);
    path.push(node);

    const neighbors = adj.get(node) || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        if (dfs(neighbor)) return true;
      } else if (recStack.has(neighbor)) {
        path.push(neighbor);
        return true;
      }
    }

    recStack.delete(node);
    path.pop();
    return false;
  }

  const allNodes = new Set<string>();
  for (const [u, list] of adj.entries()) {
    allNodes.add(u);
    list.forEach((v) => allNodes.add(v));
  }

  for (const node of allNodes) {
    if (!visited.has(node)) {
      if (dfs(node)) {
        const cycleStartIndex = path.indexOf(path[path.length - 1]);
        const cycleLoop = cycleStartIndex >= 0 ? path.slice(cycleStartIndex) : path;
        return { hasCycle: true, cyclePath: cycleLoop };
      }
    }
  }

  return { hasCycle: false };
}

/**
 * Pure Forward Pass CPM Calculation
 * Recalculates start and end dates for all tasks in topological order.
 */
export function computeCpmSchedule(
  tasks: TaskScheduleData[],
  dependencies: TaskDependencyEdge[]
): {
  newDates: Map<string, { start: Date; end: Date }>;
  changedTasks: Array<{ id: string; startDate: Date; endDate: Date }>;
  cycleDetected: boolean;
  cyclicTaskIds: string[];
} {
  const taskMap = new Map(tasks.map((t) => [t.id, t]));
  const inDegree = new Map<string, number>();
  const successors = new Map<string, string[]>();
  const predMap = new Map<string, TaskDependencyEdge[]>();

  for (const task of tasks) {
    inDegree.set(task.id, 0);
    successors.set(task.id, []);
    predMap.set(task.id, []);
  }

  for (const dep of dependencies) {
    if (!taskMap.has(dep.predecessorId) || !taskMap.has(dep.successorId)) continue;
    successors.get(dep.predecessorId)!.push(dep.successorId);
    predMap.get(dep.successorId)!.push(dep);
    inDegree.set(dep.successorId, (inDegree.get(dep.successorId) || 0) + 1);
  }

  // Topological sort
  const queue: string[] = [];
  for (const [id, deg] of inDegree.entries()) {
    if (deg === 0) queue.push(id);
  }

  const sorted: TaskScheduleData[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    const task = taskMap.get(id);
    if (task) {
      sorted.push(task);
      for (const succId of successors.get(id) || []) {
        const deg = inDegree.get(succId)! - 1;
        inDegree.set(succId, deg);
        if (deg === 0) queue.push(succId);
      }
    }
  }

  const cycleDetected = sorted.length < tasks.length;
  const cyclicTaskIds: string[] = [];
  if (cycleDetected) {
    for (const [id, deg] of inDegree.entries()) {
      if (deg > 0) cyclicTaskIds.push(id);
    }
  }

  const newDates = new Map<string, { start: Date; end: Date }>();

  for (const task of sorted) {
    const deps = predMap.get(task.id) || [];
    if (deps.length === 0) {
      newDates.set(task.id, {
        start: new Date(task.startDate),
        end: new Date(task.endDate),
      });
      continue;
    }

    let newStart: Date | null = null;
    for (const dep of deps) {
      const pred = taskMap.get(dep.predecessorId);
      if (!pred) continue;
      const predDates = newDates.get(dep.predecessorId) || {
        start: new Date(pred.startDate),
        end: new Date(pred.endDate),
      };

      // Offset sign convention: positive = lag (successor starts AFTER
      // predecessor by N days), negative = lead (successor starts BEFORE
      // predecessor ends by N days). This is the standard MS Project /
      // Primavera convention.
      //
      // The previous code treated offset as a raw number of days to ADD
      // to the predecessor's end date. A negative offset (lead) was
      // correctly subtracted, but the semantic was unclear. This is now
      // documented explicitly.
      const offsetMs = (dep.offset || 0) * 24 * 60 * 60 * 1000;
      const taskDurMs = task.duration * 24 * 60 * 60 * 1000;
      let candidate: Date;

      if (dep.type === "FS" || !dep.type) {
        // Finish-to-Start: successor starts after predecessor finishes.
        // Positive offset = lag (delay), negative = lead (overlap).
        candidate = new Date(predDates.end.getTime() + offsetMs);
      } else if (dep.type === "SS") {
        // Start-to-Start: successor starts after predecessor starts.
        candidate = new Date(predDates.start.getTime() + offsetMs);
      } else if (dep.type === "FF") {
        // Finish-to-Finish: successor finishes after predecessor finishes.
        // Successor start = predecessor end + offset - successor duration.
        candidate = new Date(predDates.end.getTime() + offsetMs - taskDurMs);
      } else if (dep.type === "SF") {
        // Start-to-Finish: successor finishes after predecessor starts.
        // Successor start = predecessor start + offset - successor duration.
        candidate = new Date(predDates.start.getTime() + offsetMs - taskDurMs);
      } else {
        candidate = new Date(predDates.end.getTime() + offsetMs);
      }

      // Take the LATEST candidate (most constrained start date).
      // This is the standard CPM forward-pass: a task starts when ALL
      // its predecessors have been satisfied — i.e., the maximum of
      // all candidate start dates.
      if (!newStart || candidate.getTime() > newStart.getTime()) {
        newStart = candidate;
      }
    }

    if (newStart) {
      const dur = Math.max(task.duration, task.isMilestone ? 0 : 1);
      const end = new Date(newStart.getTime() + dur * 24 * 60 * 60 * 1000);
      newDates.set(task.id, { start: newStart, end });
    } else {
      newDates.set(task.id, {
        start: new Date(task.startDate),
        end: new Date(task.endDate),
      });
    }
  }

  // Find which tasks actually changed dates
  const changedTasks: Array<{ id: string; startDate: Date; endDate: Date }> = [];
  for (const task of sorted) {
    const computed = newDates.get(task.id);
    if (!computed) continue;

    const origStart = new Date(task.startDate).getTime();
    const origEnd = new Date(task.endDate).getTime();
    if (
      Math.abs(computed.start.getTime() - origStart) > 1000 ||
      Math.abs(computed.end.getTime() - origEnd) > 1000
    ) {
      changedTasks.push({
        id: task.id,
        startDate: computed.start,
        endDate: computed.end,
      });
    }
  }

  return { newDates, changedTasks, cycleDetected, cyclicTaskIds };
}

/**
 * Database-Aware Recalculation & Cascade Runner
 * Fetches all tasks and dependencies for the project / version, recalculates schedule, and persists updates.
 */
export async function recalculateProjectSchedule(
  projectId: string,
  versionId?: string | null
): Promise<{
  updatedCount: number;
  cycleDetected: boolean;
  cyclicTaskNames: string[];
}> {
  const [tasks, dependencies] = await Promise.all([
    db.ganttTask.findMany({
      where: {
        projectId,
        ...(versionId !== undefined ? { versionId } : {}),
      },
      select: {
        id: true,
        name: true,
        startDate: true,
        endDate: true,
        duration: true,
        isMilestone: true,
      },
      orderBy: { sortOrder: "asc" },
    }),
    db.taskDependency.findMany({
      where: {
        successor: {
          projectId,
          ...(versionId !== undefined ? { versionId } : {}),
        },
      },
      select: {
        predecessorId: true,
        successorId: true,
        type: true,
        offset: true,
      },
    }),
  ]);

  if (tasks.length === 0) {
    return { updatedCount: 0, cycleDetected: false, cyclicTaskNames: [] };
  }

  const { changedTasks, cycleDetected, cyclicTaskIds } = computeCpmSchedule(
    tasks,
    dependencies.map((d) => ({
      predecessorId: d.predecessorId,
      successorId: d.successorId,
      type: d.type as any,
      offset: d.offset,
    }))
  );

  if (changedTasks.length > 0) {
    // Wrap the batch update in a transaction so partial failures don't
    // leave the schedule in an inconsistent state. Previously each
    // update was independent — if the 3rd of 10 updates failed, the
    // first 2 would be committed but the remaining 8 would be skipped,
    // leaving tasks with dates that don't match their dependencies.
    await db.$transaction(
      changedTasks.map((t) =>
        db.ganttTask.update({
          where: { id: t.id },
          data: {
            startDate: t.startDate,
            endDate: t.endDate,
          },
        })
      )
    );
  }

  const taskMap = new Map(tasks.map((t) => [t.id, t.name]));
  const cyclicTaskNames = cyclicTaskIds.map((id) => taskMap.get(id) || id);

  return {
    updatedCount: changedTasks.length,
    cycleDetected,
    cyclicTaskNames,
  };
}
