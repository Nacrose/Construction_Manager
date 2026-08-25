/**
 * Gantt CPM Scheduling Engine & Cycle Detection
 * Provides graph cycle validation and automatic downstream forward-pass date cascading.
 *
 * Calendar Awareness
 * ------------------
 * When `useCalendar: true` is passed, all forward-pass date arithmetic routes
 * through the Nepal working-day calendar (`nepal-calendar.ts`):
 *   - Saturdays are non-working (Nepal weekend).
 *   - Public holidays (Dashain, Tihar, etc.) are non-working.
 *   - `addWorkingDays` is used to project task end dates from duration, and
 *     to honor dependency offsets.
 * Tasks with `ignoreResourceCalendar: true` keep the legacy 24h-calendar
 * arithmetic (matches MS Project's "ignore resource calendar" semantics).
 *
 * Backward compatibility: `useCalendar` defaults to `false` so existing callers
 * and unit tests that assert raw millisecond offsets (e.g. Sept 6 → Sept 9)
 * keep passing. The DB-aware `recalculateProjectSchedule` enables it by default
 * because that is the production behavior we want on the live schedule.
 */
import { db } from "@/lib/db";
import {
  isWorkingDay,
  addWorkingDays,
} from "./nepal-calendar";

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
  /**
   * If true, this task uses 24h calendar arithmetic and ignores Nepal
   * weekends/holidays (mirrors MS Project's "ignore resource calendar" flag).
   * Only meaningful when `useCalendar: true` is passed to `computeCpmSchedule`.
   */
  ignoreResourceCalendar?: boolean;
}

/**
 * Options for `computeCpmSchedule`.
 */
export interface CpmScheduleOptions {
  /**
   * When true, schedule arithmetic routes through `nepal-calendar.ts`
   * (Saturdays + public holidays are non-working). Default: false
   * (legacy 24h-calendar arithmetic).
   */
  useCalendar?: boolean;
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
 *
 * Calendar-awareness: pass `{ useCalendar: true }` to make the cascade
 * honor Nepal Saturdays and public holidays via `nepal-calendar.ts`.
 * Tasks with `ignoreResourceCalendar: true` always use 24h arithmetic.
 */
export function computeCpmSchedule(
  tasks: TaskScheduleData[],
  dependencies: TaskDependencyEdge[],
  options: CpmScheduleOptions = {}
): {
  newDates: Map<string, { start: Date; end: Date }>;
  changedTasks: Array<{ id: string; startDate: Date; endDate: Date }>;
  cycleDetected: boolean;
  cyclicTaskIds: string[];
} {
  const useCalendar = options.useCalendar === true;

  // Calendar-aware helpers. When useCalendar is off, these reduce to
  // the legacy raw-millisecond arithmetic, preserving backward compat
  // for existing unit tests.
  const DAY_MS = 24 * 60 * 60 * 1000;

  /**
   * Add N calendar days to a date. If calendar mode is on and the task
   * does NOT ignore the resource calendar, N is interpreted as N *working*
   * days (skipping Saturdays and public holidays).
   */
  function addDaysFn(date: Date, days: number, ignoreCalendar: boolean): Date {
    if (!useCalendar || ignoreCalendar) {
      return new Date(date.getTime() + days * DAY_MS);
    }
    // Positive offsets use addWorkingDays (forward, skipping non-working).
    // Negative offsets mirror that: subtract working days going backward.
    if (days >= 0) {
      return addWorkingDays(date, days);
    }
    const result = new Date(date);
    let remaining = -days;
    while (remaining > 0) {
      result.setDate(result.getDate() - 1);
      if (isWorkingDay(result)) remaining--;
    }
    return result;
  }

  /**
   * Project a task's end date given its start and duration in days.
   * In calendar mode, duration is interpreted as working days.
   * Milestones have zero duration.
   */
  function projectEndDate(start: Date, duration: number, isMilestone: boolean, ignoreCalendar: boolean): Date {
    const dur = Math.max(duration, isMilestone ? 0 : 1);
    if (!useCalendar || ignoreCalendar || (isMilestone && dur === 0)) {
      return new Date(start.getTime() + dur * DAY_MS);
    }
    return addWorkingDays(start, dur);
  }

  /**
   * If a date lands on a non-working day in calendar mode, push it
   * forward to the next working day. Used to "snap" candidate start
   * dates that land on a Saturday/holiday.
   */
  function snapToWorkingDay(date: Date, ignoreCalendar: boolean): Date {
    if (!useCalendar || ignoreCalendar) return date;
    const d = new Date(date);
    while (!isWorkingDay(d)) {
      d.setDate(d.getDate() + 1);
    }
    return d;
  }
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
      // No dependencies: keep the task's existing start AND end as the user
      // set them. We deliberately do NOT snap or reproject here — the legacy
      // 24h-calendar behavior is preserved for tasks the user has manually
      // authored. Calendar-aware cascading only kicks in for tasks that
      // have at least one dependency (i.e., tasks whose dates are derived
      // from a predecessor via the forward pass).
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
      // In calendar mode, the offset is interpreted as working days.
      const successorIgnoresCalendar = !!task.ignoreResourceCalendar;
      const offset = dep.offset || 0;
      const taskDur = task.duration;
      let candidate: Date;

      if (dep.type === "FS" || !dep.type) {
        // Finish-to-Start: successor starts after predecessor finishes.
        // Positive offset = lag (delay), negative = lead (overlap).
        candidate = addDaysFn(predDates.end, offset, successorIgnoresCalendar);
      } else if (dep.type === "SS") {
        // Start-to-Start: successor starts after predecessor starts.
        candidate = addDaysFn(predDates.start, offset, successorIgnoresCalendar);
      } else if (dep.type === "FF") {
        // Finish-to-Finish: successor finishes after predecessor finishes.
        // Successor start = predecessor end + offset - successor duration.
        const successorEnd = addDaysFn(predDates.end, offset, successorIgnoresCalendar);
        candidate = addDaysFn(successorEnd, -taskDur, successorIgnoresCalendar);
      } else if (dep.type === "SF") {
        // Start-to-Finish: successor finishes after predecessor starts.
        // Successor start = predecessor start + offset - successor duration.
        const successorEnd = addDaysFn(predDates.start, offset, successorIgnoresCalendar);
        candidate = addDaysFn(successorEnd, -taskDur, successorIgnoresCalendar);
      } else {
        candidate = addDaysFn(predDates.end, offset, successorIgnoresCalendar);
      }

      // Snap candidate forward to next working day if it landed on a
      // non-working day in calendar mode (matches MS Project behavior:
      // a task scheduled to start on a holiday moves to next work day).
      candidate = snapToWorkingDay(candidate, successorIgnoresCalendar);

      // Take the LATEST candidate (most constrained start date).
      // This is the standard CPM forward-pass: a task starts when ALL
      // its predecessors have been satisfied — i.e., the maximum of
      // all candidate start dates.
      if (!newStart || candidate.getTime() > newStart.getTime()) {
        newStart = candidate;
      }
    }

    if (newStart) {
      const ignoreCalendar = !!task.ignoreResourceCalendar;
      const end = projectEndDate(
        newStart,
        task.duration,
        !!task.isMilestone,
        ignoreCalendar
      );
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
 *
 * `useCalendar` defaults to `true` — production schedule cascades honor
 * Nepal Saturdays and public holidays. Pass `false` to fall back to raw
 * 24h-calendar arithmetic (used by legacy callers and some tests).
 */
export async function recalculateProjectSchedule(
  projectId: string,
  versionId?: string | null,
  options: CpmScheduleOptions = { useCalendar: true }
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
        ignoreResourceCalendar: true,
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
    })),
    options
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
