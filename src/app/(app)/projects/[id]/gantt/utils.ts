import { differenceInDays, min, max } from "date-fns";
import type { Task, Dependency, ZoomLevel } from "./types";
import { adToBs, bsToAd, getDaysInBsMonth } from "@/lib/nepali-calendar";

export function getDeps(task: Task): Dependency[] {
  if (task.predecessors && task.predecessors.length > 0) {
    return task.predecessors.map((p) => ({
      taskId: p.predecessorId,
      type: p.type as "FS" | "SS" | "FF" | "SF",
      offset: p.offset,
    }));
  }
  if (task.dependencies) {
    try {
      return JSON.parse(task.dependencies);
    } catch {
      return [];
    }
  }
  return [];
}

export function getSuccessorIds(tasks: Task[]): Set<string> {
  const set = new Set<string>();
  for (const t of tasks) {
    for (const d of getDeps(t)) {
      set.add(d.taskId);
    }
  }
  return set;
}

function getTaskDuration(t: Task): number {
  if (t.isMilestone) return t.duration ?? 0;
  return t.duration || Math.max(1, differenceInDays(new Date(t.endDate), new Date(t.startDate)) + 1);
}

export function computeCriticalPath(tasks: Task[]): Set<string> {
  if (!tasks.length) return new Set();

  const es = new Map<string, number>();
  const ef = new Map<string, number>();
  const ls = new Map<string, number>();
  const lf = new Map<string, number>();

  const timestamps = tasks
    .map((t) => new Date(t.startDate).getTime())
    .filter((ts) => Number.isFinite(ts));
  const referenceDate = new Date(timestamps.length > 0 ? Math.min(...timestamps) : Date.now());

  for (const t of tasks) {
    const startDay = differenceInDays(new Date(t.startDate), referenceDate);
    const dur = getTaskDuration(t);
    es.set(t.id, startDay);
    ef.set(t.id, startDay + dur);
  }

  // Build dependency map (predecessorId → list of successors)
  const depsMap = new Map<string, Dependency[]>();
  const successorsMap = new Map<string, string[]>(); // predecessorId → list of successor taskIds
  for (const t of tasks) {
    let deps: Dependency[] = [];
    // Prefer the new normalized predecessors field
    if (t.predecessors && t.predecessors.length > 0) {
      deps = t.predecessors.map((p) => ({
        taskId: p.predecessorId,
        type: p.type as "FS" | "SS" | "FF" | "SF",
        offset: p.offset,
      }));
    } else if (t.dependencies) {
      // Fallback to legacy JSON string
      try {
        deps = JSON.parse(t.dependencies);
      } catch {
        deps = [];
      }
    }
    depsMap.set(t.id, deps);
    for (const dep of deps) {
      const list = successorsMap.get(dep.taskId) || [];
      list.push(t.id);
      successorsMap.set(dep.taskId, list);
    }
  }

  // Forward pass — respects dependency type (FS, SS, FF, SF)
  for (let pass = 0; pass < tasks.length; pass++) {
    let changed = false;
    for (const t of tasks) {
      const deps = depsMap.get(t.id) || [];
      const dur = getTaskDuration(t);
      for (const dep of deps) {
        const predEs = es.get(dep.taskId);
        const predEf = ef.get(dep.taskId);
        if (predEs === undefined || predEf === undefined) continue;
        const offset = dep.offset || 0;
        let newEs: number;
        switch (dep.type) {
          case "SS": newEs = predEs + offset; break;
          case "FF": newEs = predEf + offset - dur; break;
          case "SF": newEs = predEs + offset - dur; break;
          case "FS":
          default:   newEs = predEf + offset; break;
        }
        const currentEs = es.get(t.id) ?? 0;
        if (newEs > currentEs) {
          es.set(t.id, newEs);
          ef.set(t.id, newEs + dur);
          changed = true;
        }
      }
    }
    if (!changed) break;
  }

  const projectEnd = Math.max(...Array.from(ef.values()));

  for (const t of tasks) {
    lf.set(t.id, projectEnd);
    const dur = getTaskDuration(t);
    ls.set(t.id, projectEnd - dur);
  }

  // Backward pass — respects dependency type (FS, SS, FF, SF)
  for (let pass = 0; pass < tasks.length; pass++) {
    let changed = false;
    for (const t of tasks) {
      const successors = successorsMap.get(t.id) || [];
      const dur = getTaskDuration(t);
      for (const succId of successors) {
        const succDeps = depsMap.get(succId) || [];
        const dep = succDeps.find(d => d.taskId === t.id);
        if (!dep) continue;
        const succLs = ls.get(succId) ?? projectEnd;
        const succLf = lf.get(succId) ?? projectEnd;
        const offset = dep.offset || 0;
        let newLf: number;
        switch (dep.type) {
          case "SS": newLf = succLs - offset + dur; break;
          case "FF": newLf = succLf - offset; break;
          case "SF": newLf = succLf - offset + dur; break;
          case "FS":
          default:   newLf = succLs - offset; break;
        }
        const currentLf = lf.get(t.id) ?? projectEnd;
        if (newLf < currentLf) {
          lf.set(t.id, newLf);
          ls.set(t.id, newLf - dur);
          changed = true;
        }
      }
    }
    if (!changed) break;
  }

  const critical = new Set<string>();
  for (const t of tasks) {
    const taskEs = es.get(t.id) ?? 0;
    const taskLs = ls.get(t.id) ?? 0;
    if (Math.abs(taskLs - taskEs) < 0.5) {
      critical.add(t.id);
    }
  }

  return critical;
}

/**
 * Compute total float (slack) per task.
 * Total float = LS - ES (days).
 * Critical tasks have float ≈ 0.
 * Reuses the same CPM forward/backward pass as computeCriticalPath.
 */
export function computeFloatMap(tasks: Task[]): Map<string, number> {
  const floatMap = new Map<string, number>();
  if (!tasks.length) return floatMap;

  const es = new Map<string, number>();
  const ef = new Map<string, number>();
  const ls = new Map<string, number>();
  const lf = new Map<string, number>();

  const timestamps = tasks
    .map((t) => new Date(t.startDate).getTime())
    .filter((ts) => Number.isFinite(ts));
  const referenceDate = new Date(timestamps.length > 0 ? Math.min(...timestamps) : Date.now());

  for (const t of tasks) {
    const startDay = differenceInDays(new Date(t.startDate), referenceDate);
    const dur = getTaskDuration(t);
    es.set(t.id, startDay);
    ef.set(t.id, startDay + dur);
  }

  const depsMap = new Map<string, Dependency[]>();
  const successorsMap = new Map<string, string[]>();
  for (const t of tasks) {
    let deps: Dependency[] = [];
    if (t.predecessors && t.predecessors.length > 0) {
      deps = t.predecessors.map((p) => ({ taskId: p.predecessorId, type: p.type as "FS" | "SS" | "FF" | "SF", offset: p.offset }));
    } else if (t.dependencies) {
      try { deps = JSON.parse(t.dependencies); } catch { deps = []; }
    }
    depsMap.set(t.id, deps);
    for (const dep of deps) {
      const list = successorsMap.get(dep.taskId) || [];
      list.push(t.id);
      successorsMap.set(dep.taskId, list);
    }
  }

  // Forward pass
  for (let pass = 0; pass < tasks.length; pass++) {
    let changed = false;
    for (const t of tasks) {
      const deps = depsMap.get(t.id) || [];
      const dur = getTaskDuration(t);
      for (const dep of deps) {
        const predEs = es.get(dep.taskId);
        const predEf = ef.get(dep.taskId);
        if (predEs === undefined || predEf === undefined) continue;
        const offset = dep.offset || 0;
        let newEs: number;
        switch (dep.type) {
          case "SS": newEs = predEs + offset; break;
          case "FF": newEs = predEf + offset - dur; break;
          case "SF": newEs = predEs + offset - dur; break;
          default:   newEs = predEf + offset; break;
        }
        if (newEs > (es.get(t.id) ?? 0)) { es.set(t.id, newEs); ef.set(t.id, newEs + dur); changed = true; }
      }
    }
    if (!changed) break;
  }

  const projectEnd = Math.max(...Array.from(ef.values()));
  for (const t of tasks) {
    lf.set(t.id, projectEnd);
    const dur = getTaskDuration(t);
    ls.set(t.id, projectEnd - dur);
  }

  // Backward pass
  for (let pass = 0; pass < tasks.length; pass++) {
    let changed = false;
    for (const t of tasks) {
      const successors = successorsMap.get(t.id) || [];
      const dur = getTaskDuration(t);
      for (const succId of successors) {
        const succDeps = depsMap.get(succId) || [];
        const dep = succDeps.find(d => d.taskId === t.id);
        if (!dep) continue;
        const succLs = ls.get(succId) ?? projectEnd;
        const succLf = lf.get(succId) ?? projectEnd;
        const offset = dep.offset || 0;
        let newLf: number;
        switch (dep.type) {
          case "SS": newLf = succLs - offset + dur; break;
          case "FF": newLf = succLf - offset; break;
          case "SF": newLf = succLf - offset + dur; break;
          default:   newLf = succLs - offset; break;
        }
        if (newLf < (lf.get(t.id) ?? projectEnd)) { lf.set(t.id, newLf); ls.set(t.id, newLf - dur); changed = true; }
      }
    }
    if (!changed) break;
  }

  for (const t of tasks) {
    const totalFloat = (ls.get(t.id) ?? 0) - (es.get(t.id) ?? 0);
    floatMap.set(t.id, Math.max(0, totalFloat));
  }

  return floatMap;
}

/**
 * Compute Critical Path Drag for each critical task.
 *
 * Drag = the amount of time a critical-path task is adding to the project
 * duration. If the task were eliminated (0 duration), the project would
 * finish `drag` days earlier.
 *
 * Simplified algorithm:
 * - For each critical task, find the maximum float among non-critical
 *   tasks that run in parallel (overlapping date range)
 * - Drag = min(task_duration, max_parallel_float)
 * - If no parallel non-critical task exists, drag = task_duration
 *
 * @returns Map<taskId, dragDays>
 */
export function computeCriticalPathDrag(tasks: Task[], critical: Set<string>): Map<string, number> {
  const dragMap = new Map<string, number>();

  for (const task of tasks) {
    if (!critical.has(task.id)) continue;

    const taskStart = new Date(task.startDate).getTime();
    const taskEnd = new Date(task.endDate).getTime();
    const taskDur = task.duration || Math.max(1, differenceInDays(new Date(task.endDate), new Date(task.startDate)) + 1);

    // Find non-critical tasks that overlap with this task
    let maxParallelFloat = 0;
    for (const other of tasks) {
      if (other.id === task.id || critical.has(other.id)) continue;

      const otherStart = new Date(other.startDate).getTime();
      const otherEnd = new Date(other.endDate).getTime();

      // Check overlap
      if (otherStart < taskEnd && otherEnd > taskStart) {
        // Calculate float for this non-critical task
        // (simplified: float = difference between earliest possible start and latest possible start)
        // We use a simpler approximation: float = taskDur - otherDur (if overlapping)
        const otherDur = other.duration || Math.max(1, differenceInDays(new Date(other.endDate), new Date(other.startDate)) + 1);
        const overlapDays = Math.round(Math.min(taskEnd, otherEnd) - Math.max(taskStart, otherStart)) / (1000 * 60 * 60 * 24);
        const approximateFloat = Math.max(0, otherDur - overlapDays);
        maxParallelFloat = Math.max(maxParallelFloat, approximateFloat);
      }
    }

    // Drag = min(task_duration, max_parallel_float)
    // If no parallel non-critical task, drag = full duration
    const drag = maxParallelFloat > 0 ? Math.min(taskDur, maxParallelFloat) : taskDur;
    dragMap.set(task.id, Math.round(drag));
  }

  return dragMap;
}

export function computeDateRange(tasks: Task[], calendarType: string = "BS") {
  const isNepali = calendarType === "BS";

  if (tasks.length === 0) {
    const today = new Date();
    if (isNepali) {
      try {
        const bs = adToBs(today);
        const rangeStart = bsToAd(bs.year, bs.month, 1);
        const nextMonth = bs.month === 12 ? 1 : bs.month + 1;
        const nextYear = bs.month === 12 ? bs.year + 1 : bs.year;
        const daysInNext = getDaysInBsMonth(nextYear, nextMonth);
        const rangeEnd = bsToAd(nextYear, nextMonth, daysInNext);
        const days = differenceInDays(rangeEnd, rangeStart) + 1;
        return { rangeStart, rangeEnd, days: Math.max(days, 30) };
      } catch {
        const rangeStart = new Date(today.getFullYear(), today.getMonth(), 1);
        const rangeEnd = new Date(today.getFullYear(), today.getMonth() + 2, 0);
        const days = differenceInDays(rangeEnd, rangeStart) + 1;
        return { rangeStart, rangeEnd, days: Math.max(days, 30) };
      }
    } else {
      const rangeStart = new Date(today.getFullYear(), today.getMonth(), 1);
      const rangeEnd = new Date(today.getFullYear(), today.getMonth() + 2, 0);
      const days = differenceInDays(rangeEnd, rangeStart) + 1;
      return { rangeStart, rangeEnd, days: Math.max(days, 30) };
    }
  }

  const starts = tasks.map((t) => new Date(t.startDate));
  const ends = tasks.map((t) => new Date(t.endDate));
  const minDate = min(starts);
  const maxDate = max(ends);

  if (isNepali) {
    try {
      const startBs = adToBs(minDate);
      const rangeStart = bsToAd(startBs.year, startBs.month, 1);

      const endBs = adToBs(maxDate);
      const maxDaysInEndMonth = getDaysInBsMonth(endBs.year, endBs.month);
      const rangeEnd = bsToAd(endBs.year, endBs.month, maxDaysInEndMonth);

      const days = differenceInDays(rangeEnd, rangeStart) + 1;
      return { rangeStart, rangeEnd, days: Math.max(days, 28) };
    } catch {
      const rangeStart = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
      const rangeEnd = new Date(maxDate.getFullYear(), maxDate.getMonth() + 1, 0);
      const days = differenceInDays(rangeEnd, rangeStart) + 1;
      return { rangeStart, rangeEnd, days: Math.max(days, 28) };
    }
  } else {
    const rangeStart = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
    const rangeEnd = new Date(maxDate.getFullYear(), maxDate.getMonth() + 1, 0);
    const days = differenceInDays(rangeEnd, rangeStart) + 1;
    return { rangeStart, rangeEnd, days: Math.max(days, 28) };
  }
}

/**
 * Returns a structural key for memoization — only fields that affect critical path.
 * Changes to progress, plannedValue, laborCount etc. won't trigger recomputation.
 */
export function structuralKey(task: Task): string {
  return `${task.id}|${task.startDate}|${task.endDate}|${task.duration}|${task.dependencies}|${task.parentId}`;
}

export function computeRolledUpProgress(tasks: Task[]): Map<string, number> {
  const childMap = new Map<string, Task[]>();
  const taskMap = new Map(tasks.map(t => [t.id, t]));
  for (const t of tasks) {
    if (t.parentId) {
      if (!childMap.has(t.parentId)) childMap.set(t.parentId, []);
      childMap.get(t.parentId)!.push(t);
    }
  }
  const memo = new Map<string, number>();
  function rollup(id: string): number {
    const cached = memo.get(id);
    if (cached !== undefined) return cached;
    const children = childMap.get(id);
    if (!children || children.length === 0) {
      const val = taskMap.get(id)?.progress ?? 0;
      memo.set(id, val);
      return val;
    }
    let totalWeight = 0;
    let totalProgress = 0;
    for (const child of children) {
      const w = Math.max(child.duration, 1);
      totalWeight += w;
      totalProgress += rollup(child.id) * w;
    }
    const val = totalWeight > 0 ? Math.round(totalProgress / totalWeight) : 0;
    memo.set(id, val);
    return val;
  }
  const result = new Map<string, number>();
  for (const t of tasks) {
    result.set(t.id, rollup(t.id));
  }

  // Calculate overall project ("root") rolled-up progress across top-level tasks
  const topLevelTasks = tasks.filter(t => !t.parentId);
  let totalRootWeight = 0;
  let totalRootProgress = 0;
  for (const t of topLevelTasks) {
    const w = Math.max(t.duration, 1);
    totalRootWeight += w;
    totalRootProgress += (result.get(t.id) ?? 0) * w;
  }
  const rootVal = totalRootWeight > 0 ? Math.round(totalRootProgress / totalRootWeight) : 0;
  result.set("root", rootVal);

  return result;
}

export function getDayWidth(zoom: ZoomLevel): number {
  // Comfortable per-granularity-unit defaults (Day reads fine at 20px; Week and
  // Month need more room so bars, labels and dependency arrows stay legible).
  // The +/− zoom scale then fine-tunes from ~100%.
  switch (zoom) {
    case "day": return 20;
    case "week": return 36 / 7; // one week ≈ 36px
    case "month": return 44 / 30; // one month ≈ 44px
    case "year": return 70 / 365; // one year ≈ 70px
  }
}

export function getTaskRowHeight(name?: string, depth = 0, leftPanelWidth = 320): number {
  if (!name) return 40;
  const indent = depth * 10;
  // WBS column (32px) + flag/expander (12px) + pct badge (32px) + padding (10px) + indent
  const nonTextWidth = 32 + 12 + 32 + 10 + indent;
  const textWidthAvailable = Math.max(60, leftPanelWidth - nonTextWidth);
  const charsPerLine = Math.max(8, Math.floor(textWidthAvailable / 6.5));
  const lines = Math.max(1, Math.ceil(name.length / charsPerLine));
  return 42 + (lines - 1) * 16;
}

export type BarStatus = "not_started" | "on_track" | "ahead" | "lagging" | "complete";

export function getBarStatus(task: Task, pct: number): BarStatus {
  if (pct >= 100) return "complete";
  if (pct === 0) {
    const started = new Date(task.startDate) <= new Date();
    if (!started) return "not_started";
    return "lagging";
  }
  const start = new Date(task.startDate);
  const end = new Date(task.endDate);
  const total = differenceInDays(end, start) + 1;
  if (total <= 0) return "on_track";
  const elapsed = differenceInDays(new Date(), start);
  const expected = Math.round((Math.max(0, Math.min(elapsed, total)) / total) * 100);
  if (pct > expected + 10) return "ahead";
  if (pct < expected - 10) return "lagging";
  return "on_track";
}


