"use client";

import { useMemo, useCallback } from "react";
import { format, differenceInDays } from "date-fns";
import { cn } from "@/lib/utils";
import type { Task } from "../../gantt/types";
import { getDeps, getBarStatus } from "../../gantt/utils";
import type { ZoomLevel } from "../../gantt/types";
import { TaskBar, type BarStatus } from "./TaskBar";
import { DependencyArrow } from "./DependencyArrow";
import { adToBs } from "@/lib/nepali-calendar";
import { useUserPreferences } from "@/components/user-preferences-provider";

export type DayLabel = {
  date: Date;
  label: string;
  isWeekend: boolean;
  isFirstOfMonth: boolean;
  isMonday: boolean;
  isFirstOfYear: boolean;
  /**
   * True if this date is a Nepal public holiday (Dashain, Tihar, etc.).
   * Holidays are mutually exclusive with working days — a holiday always
   * renders as a non-working day, even if it lands on a Sunday-Friday.
   */
  isHoliday?: boolean;
  /**
   * Holiday display name (e.g. "Dashain Day 9 (Vijaya Dashami)").
   * Present iff isHoliday is true.
   */
  holidayName?: string;
};

type FlattenedRow = { task: Task; depth: number };

type TimelineProps = {
  visibleRows: FlattenedRow[];
  rowHeights: number[];
  rowOffsets: { offsets: number[]; totalHeight: number };
  totalHeight: number;
  rangeStart: Date;
  days: number;
  dayWidth: number;
  dayLabels: DayLabel[];
  zoom: ZoomLevel;
  tasks: Task[];
  overlayMap: Map<string, { startDate: string; endDate: string }>;
  criticalTaskIds: Set<string>;
  criticalDragMap?: Map<string, number>;
  rolledUpProgress: Map<string, number>;
  selectedTaskId: string | null;
  onSelectTask: (id: string | null) => void;
  hoveredTaskId: string | null;
  onHoverTask: (id: string | null) => void;
  onContextMenu?: (e: React.MouseEvent, task: Task) => void;
  taskMap: Map<string, Task>;
  svgWidth: number;
  /** Total float (slack) per task in days, from computeFloatMap() */
  floatMap?: Map<string, number>;
  emptyRowsCount?: number;
  showSCurve?: boolean;
  showHeatmap?: boolean;
};

export function Timeline(props: TimelineProps) {
  const {
    visibleRows, rowHeights, rowOffsets, totalHeight, rangeStart, days, dayWidth, dayLabels, zoom,
    tasks, overlayMap, criticalTaskIds, criticalDragMap, rolledUpProgress,
    selectedTaskId, onSelectTask, hoveredTaskId, onHoverTask, onContextMenu,
    taskMap, svgWidth, floatMap,
    emptyRowsCount = 0,
    showSCurve = true,
    showHeatmap = true,
  } = props;

  const { getPref } = useUserPreferences();
  const calendarType = getPref<string>("calendarType", "BS");
  const isNepali = calendarType === "BS";

  // Precompute daily manpower allocated across active leaf tasks
  const dailyLabor = useMemo(() => {
    if (!rangeStart || !tasks || tasks.length === 0 || days <= 0) return [];
    const labor = new Array(days).fill(0);
    const leafTasks = tasks.filter(t => !tasks.some(ch => ch.parentId === t.id));

    leafTasks.forEach(t => {
      const start = new Date(t.startDate);
      const end = new Date(t.endDate);
      const sIdx = Math.max(0, differenceInDays(start, rangeStart));
      const eIdx = Math.min(days - 1, differenceInDays(end, rangeStart));
      const count = t.laborCount || 0;
      if (count > 0 && eIdx >= sIdx) {
        for (let i = sIdx; i <= eIdx; i++) {
          labor[i] += count;
        }
      }
    });
    return labor;
  }, [tasks, rangeStart, days]);

  // Compute EVM S-Curve bezier paths (Planned Value vs Actual Progress)
  const { plannedPath, earnedPath } = useMemo(() => {
    if (!rangeStart || !tasks || tasks.length === 0 || days <= 1) {
      return { plannedPath: "", earnedPath: "" };
    }

    const leafTasks = tasks.filter(t => !tasks.some(ch => ch.parentId === t.id));
    const totalPV = leafTasks.reduce((s, t) => s + (t.plannedValue || (differenceInDays(new Date(t.endDate), new Date(t.startDate)) + 1)), 0) || 1;

    const plannedDaily = new Array(days).fill(0);
    const earnedDaily = new Array(days).fill(0);

    const now = new Date();
    const todayIdx = Math.max(0, Math.min(days - 1, differenceInDays(now, rangeStart)));

    leafTasks.forEach(t => {
      const start = new Date(t.startDate);
      const end = new Date(t.endDate);
      const taskDur = Math.max(1, differenceInDays(end, start) + 1);
      const weight = (t.plannedValue || taskDur);
      const sIdx = Math.max(0, differenceInDays(start, rangeStart));
      const eIdx = Math.min(days - 1, differenceInDays(end, rangeStart));

      if (eIdx >= sIdx) {
        const pvPerDay = weight / taskDur;
        for (let i = sIdx; i <= eIdx; i++) {
          plannedDaily[i] += pvPerDay;
        }
      }

      const progress = (t.progress || 0) / 100;
      const earnedWeight = weight * progress;
      if (earnedWeight > 0 && sIdx <= todayIdx) {
        const activeDaysSoFar = Math.min(todayIdx, eIdx) - sIdx + 1;
        if (activeDaysSoFar > 0) {
          const evPerDay = earnedWeight / activeDaysSoFar;
          for (let i = sIdx; i <= Math.min(todayIdx, eIdx); i++) {
            earnedDaily[i] += evPerDay;
          }
        }
      }
    });

    let cumPV = 0;
    let cumEV = 0;
    const pPoints: [number, number][] = [];
    const ePoints: [number, number][] = [];

    const minY = totalHeight - 20;
    const maxY = 35;
    const ySpan = minY - maxY;

    for (let i = 0; i < days; i++) {
      cumPV += plannedDaily[i];
      const pRatio = Math.min(1, cumPV / totalPV);
      const px = i * dayWidth + 10 + dayWidth / 2;
      const py = minY - pRatio * ySpan;
      pPoints.push([px, py]);

      if (i <= todayIdx) {
        cumEV += earnedDaily[i];
        const eRatio = Math.min(1, cumEV / totalPV);
        const ey = minY - eRatio * ySpan;
        ePoints.push([px, ey]);
      }
    }

    const toPath = (pts: [number, number][]) => {
      if (pts.length === 0) return "";
      return pts.reduce((acc, p, idx) => (idx === 0 ? `M ${p[0]} ${p[1]}` : `${acc} L ${p[0]} ${p[1]}`), "");
    };

    return {
      plannedPath: toPath(pPoints),
      earnedPath: toPath(ePoints),
    };
  }, [tasks, rangeStart, days, dayWidth, totalHeight]);

  // Precompute Month Spans
  const monthGroups = useMemo(() => {
    const groups: {
      startIndex: number;
      span: number;
      label: string;
    }[] = [];

    if (dayLabels.length === 0) return groups;

    let currentStart = 0;
    let currentKey = "";
    let currentLabel = "";

    dayLabels.forEach((d, idx) => {
      let key = "";
      let label = "";

      if (isNepali) {
        try {
          const bs = adToBs(d.date);
          key = `${bs.year}-${bs.month}`;
          label = `${bs.monthName} ${bs.year}`;
        } catch {
          key = `${d.date.getFullYear()}-${d.date.getMonth()}`;
          label = format(d.date, "MMMM yyyy");
        }
      } else {
        key = `${d.date.getFullYear()}-${d.date.getMonth()}`;
        label = format(d.date, "MMMM yyyy");
      }

      if (idx === 0) {
        currentStart = 0;
        currentKey = key;
        currentLabel = label;
      } else if (key !== currentKey) {
        groups.push({
          startIndex: currentStart,
          span: idx - currentStart,
          label: currentLabel,
        });
        currentStart = idx;
        currentKey = key;
        currentLabel = label;
      }
    });

    if (dayLabels.length > currentStart) {
      groups.push({
        startIndex: currentStart,
        span: dayLabels.length - currentStart,
        label: currentLabel,
      });
    }

    return groups;
  }, [dayLabels, isNepali]);

  const todayOffset = useMemo(() => {
    const now = new Date();
    const diff = differenceInDays(now, rangeStart);
    return diff >= 0 && diff < days ? diff * dayWidth : -1;
  }, [rangeStart, days, dayWidth]);

  const childRanges = useMemo(() => {
    const map = new Map<string, { start: Date; end: Date }>();
    function compute(taskId: string): { start: Date; end: Date } | null {
      const cached = map.get(taskId);
      if (cached) return cached;
      const task = taskMap.get(taskId);
      if (!task) return null;
      const children = tasks.filter(t => t.parentId === taskId);
      if (children.length === 0) {
        const r = { start: new Date(task.startDate), end: new Date(task.endDate) };
        map.set(taskId, r);
        return r;
      }
      let minStart = new Date(task.startDate);
      let maxEnd = new Date(task.endDate);
      for (const child of children) {
        const cr = compute(child.id);
        if (cr) {
          if (cr.start < minStart) minStart = cr.start;
          if (cr.end > maxEnd) maxEnd = cr.end;
        }
      }
      const r = { start: minStart, end: maxEnd };
      map.set(taskId, r);
      return r;
    }
    for (const { task } of visibleRows) {
      compute(task.id);
    }
    return map;
  }, [visibleRows, taskMap, tasks]);

  const deps = useMemo(() => {
    const result: { from: Task; to: Task; x1: number; x2: number; index: number; type: string; offset: number }[] = [];
    let idx = 0;
    for (const { task } of visibleRows) {
      for (const dep of getDeps(task)) {
        const fromTask = taskMap.get(dep.taskId);
        if (!fromTask) continue;
        const fromStart = differenceInDays(new Date(fromTask.startDate), rangeStart);
        const fromEnd = differenceInDays(new Date(fromTask.endDate), rangeStart) + 1;
        const toStart = differenceInDays(new Date(task.startDate), rangeStart);
        const toEnd = differenceInDays(new Date(task.endDate), rangeStart) + 1;
        let x1: number, x2: number;
        switch (dep.type) {
          case "SS": x1 = fromStart; x2 = toStart; break;
          case "FF": x1 = fromEnd; x2 = toEnd; break;
          case "SF": x1 = fromStart; x2 = toEnd; break;
          case "FS":
          default:   x1 = fromEnd; x2 = toStart; break;
        }
        x2 += dep.offset || 0;
        result.push({ from: fromTask, to: task, x1, x2, index: idx++, type: dep.type, offset: dep.offset || 0 });
      }
    }
    return result;
  }, [visibleRows, taskMap, rangeStart]);

  const posY = useCallback((taskId: string) => {
    const idx = visibleRows.findIndex(r => r.task.id === taskId);
    if (idx === -1) return 0;
    return rowOffsets.offsets[idx] + rowHeights[idx] / 2;
  }, [visibleRows, rowHeights, rowOffsets]);

  const posX = useCallback((dayOffset: number) => dayOffset * dayWidth + 10, [dayWidth]);

  const barHeight = 8;
  const barY = useCallback((taskId: string) => posY(taskId) - barHeight / 2, [posY]);

  return (
    <svg width={svgWidth} height={totalHeight} className="block min-h-full">
      <defs>
        <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="hsl(160 84% 48%)" />
          <stop offset="100%" stopColor="hsl(160 70% 32%)" />
        </linearGradient>
        <linearGradient id="criticalGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="hsl(0 90% 60%)" />
          <stop offset="100%" stopColor="hsl(0 80% 45%)" />
        </linearGradient>
        <linearGradient id="summaryGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="hsl(215 25% 45%)" />
          <stop offset="100%" stopColor="hsl(215 25% 30%)" />
        </linearGradient>
        <linearGradient id="ghostGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="hsl(0 0% 75%)" />
          <stop offset="100%" stopColor="hsl(0 0% 60%)" />
        </linearGradient>
        <clipPath id="barClip">
          <rect x="0" y="0" width="100%" height="100%" rx="3" ry="3" />
        </clipPath>
      </defs>

      {/* Weekend shading (only in Day zoom level to prevent bands in Week/Month view) */}
      {zoom === "day" &&
        dayLabels.map((d, i) => {
          if (!d.isWeekend) return null;
          const xPos = i * dayWidth + 10;
          return (
            <rect
              key={`weekend-bg-${i}`}
              x={xPos}
              y={0}
              width={dayWidth}
              height={totalHeight}
              fill="rgba(159, 91, 53, 0.045)"
              className="pointer-events-none"
            />
          );
        })}

      {/* Nepal public holiday bands (Dashain, Tihar, etc.).
          Rendered ABOVE weekend bands so they take visual precedence.
          Red-ish tint with hover tooltip showing the holiday name. */}
      {zoom === "day" &&
        dayLabels.map((d, i) => {
          if (!d.isHoliday) return null;
          const xPos = i * dayWidth + 10;
          return (
            <g key={`holiday-bg-${i}`}>
              <rect
                x={xPos}
                y={0}
                width={dayWidth}
                height={totalHeight}
                fill="rgba(239, 68, 68, 0.12)"
                className="pointer-events-none"
              />
              {/* Thin top-edge stripe to make multi-day festivals (e.g. Dashain)
                  visually obvious as a contiguous block. */}
              <rect
                x={xPos}
                y={0}
                width={dayWidth}
                height={2}
                fill="rgba(239, 68, 68, 0.55)"
                className="pointer-events-none"
              />
              {/* Hover-only tooltip rect — captures mouse events and shows
                  the holiday name via an SVG <title> element. */}
              <rect
                x={xPos}
                y={0}
                width={dayWidth}
                height={totalHeight}
                fill="transparent"
                className="pointer-events-auto cursor-help"
              >
                <title>
                  {d.holidayName
                    ? `${format(d.date, "dd MMM yyyy")} — ${d.holidayName} (Nepal public holiday)`
                    : `${format(d.date, "dd MMM yyyy")} — Nepal public holiday`}
                </title>
              </rect>
            </g>
          );
        })}

      {/* Site density / manpower congestion column heatmap */}
      {showHeatmap &&
        dailyLabor.map((labor, i) => {
          if (labor <= 0) return null;
          const xPos = i * dayWidth + 10;
          const intensity = Math.min(labor / 50, 1);
          return (
            <rect
              key={`heat-${i}`}
              x={xPos}
              y={0}
              width={dayWidth}
              height={totalHeight}
              fill={
                labor > 40
                  ? `rgba(245, 158, 11, ${0.03 + intensity * 0.07})`
                  : `rgba(52, 211, 153, ${0.02 + intensity * 0.05})`
              }
              className="pointer-events-none"
            />
          );
        })}

      {/* S-Curve Overlay Paths (Planned Progress vs Actual Earned Progress) */}
      {showSCurve && (
        <g className="pointer-events-none select-none opacity-80">
          {plannedPath && (
            <path
              d={plannedPath}
              fill="none"
              stroke="#06b6d4"
              strokeWidth={2}
              strokeDasharray="5 3"
              className="filter drop-shadow-[0_0_5px_rgba(6,182,212,0.6)]"
            />
          )}
          {earnedPath && (
            <path
              d={earnedPath}
              fill="none"
              stroke="#10b981"
              strokeWidth={2.4}
              className="filter drop-shadow-[0_0_7px_rgba(16,185,129,0.7)]"
            />
          )}
        </g>
      )}

      {/* Vertical column dividers — match header boundaries */}
      {zoom === "day"
        ? dayLabels.map((_, i) => {
            if (i === 0) return null;
            const xPos = i * dayWidth + 10;
            return (
              <line
                key={`vcol-${i}`}
                x1={xPos} y1={0} x2={xPos} y2={totalHeight}
                stroke="rgba(116, 105, 94, 0.12)"
                strokeWidth={0.5}
              />
            );
          })
        : monthGroups.map((group, gIdx) => {
            const wCount = 4;
            const weekWidth = (dayWidth * group.span) / wCount;
            const groupStartX = group.startIndex * dayWidth + 10;

            return (
              <g key={`vcols-month-${gIdx}`}>
                {/* Month boundary divider (stronger) */}
                {gIdx > 0 && (
                  <line
                    x1={groupStartX} y1={0} x2={groupStartX} y2={totalHeight}
                    stroke="rgba(116, 105, 94, 0.2)"
                    strokeWidth={1}
                  />
                )}
                {/* Internal 4-week dividers (subtle) */}
                {[1, 2, 3].map((wIdx) => {
                  const weekX = groupStartX + wIdx * weekWidth;
                  return (
                    <line
                      key={`vcol-w-${gIdx}-${wIdx}`}
                      x1={weekX} y1={0} x2={weekX} y2={totalHeight}
                      stroke="rgba(116, 105, 94, 0.1)"
                      strokeWidth={0.5}
                    />
                  );
                })}
              </g>
            );
          })}

      {/* Zebra striping - for all visible and ghost rows */}
      {Array.from({ length: visibleRows.length + (emptyRowsCount || 0) + 1 }).map((_, i) => {
        if (i % 2 !== 1) return null;
        const yPos = i < visibleRows.length
          ? rowOffsets.offsets[i]
          : rowOffsets.totalHeight + (i - visibleRows.length) * 38;
        const rowH = i < visibleRows.length ? rowHeights[i] : 38;
        if (yPos >= totalHeight) return null;
        return (
          <rect
            key={`zebra-${i}`}
            x={10}
            y={yPos}
            width={svgWidth - 10}
            height={rowH}
            fill="rgba(159, 91, 53, 0.03)"
          />
        );
      })}

      {/* Row highlight guide lanes under active hover */}
      {visibleRows.map(({ task }, i) => (
        <rect
          key={`hover-lane-${task.id}`}
          x={10}
          y={rowOffsets.offsets[i]}
          width={svgWidth - 10}
          height={rowHeights[i]}
          fill={hoveredTaskId === task.id ? "rgba(159, 91, 53, 0.08)" : "transparent"}
          className="transition-colors duration-150 pointer-events-none"
        />
      ))}

      {/* Horizontal grid lines for all visible and ghost rows */}
      {Array.from({ length: visibleRows.length + (emptyRowsCount || 0) + 1 }).map((_, i) => {
        const yPos = i < visibleRows.length
          ? rowOffsets.offsets[i] + rowHeights[i]
          : rowOffsets.totalHeight + (i - visibleRows.length + 1) * 38;
        if (yPos > totalHeight) return null;
        return (
          <line
            key={`grid-${i}`}
            x1={10}
            y1={yPos}
            x2={svgWidth}
            y2={yPos}
            stroke="rgba(116, 105, 94, 0.12)"
            strokeWidth={0.5}
          />
        );
      })}

      {/* Task bars */}
      {visibleRows.map(({ task }, i) => {
        const isCritical = criticalTaskIds.has(task.id);
        const hasCh = tasks.some(t => t.parentId === task.id);
        const childRange = childRanges.get(task.id);

        let barStart: Date;
        let barEnd: Date;

        if (hasCh && childRange) {
          const children = tasks.filter(t => t.parentId === task.id);
          const _visibleChildren = children.filter(c => {
            let p = c.parentId;
            while (p) {
              if (p === task.id) return true;
              p = tasks.find(t => t.id === p)?.parentId ?? null;
            }
            return false;
          });
          barStart = childRange.start;
          barEnd = childRange.end;
        } else {
          barStart = new Date(task.startDate);
          barEnd = new Date(task.endDate);
        }

        const startOff = differenceInDays(barStart, rangeStart);
        const endOff = differenceInDays(barEnd, rangeStart) + 1;
        const x = posX(startOff);
        const w = Math.max((endOff - startOff) * dayWidth, hasCh ? 8 : 4);
        const y = hasCh ? (rowOffsets.offsets[i] + rowHeights[i] / 2 - 4) : barY(task.id);
        const h = barHeight;
        const pct = hasCh ? (rolledUpProgress.get(task.id) ?? task.progress) : task.progress;
        const barStatus = getBarStatus(task, pct);
        const overlay = overlayMap.get(task.id);

        return (
          <g key={task.id}
            className={cn("cursor-pointer", selectedTaskId === task.id ? "opacity-90" : "")}
            onClick={() => onSelectTask(task.id)}
            onContextMenu={(e) => {
              e.preventDefault();
              onContextMenu?.(e, task);
            }}
            onMouseEnter={() => onHoverTask(task.id)}
            onMouseLeave={() => onHoverTask(null)}
          >
            {/* Hit target for row hover */}
            <rect x={10} y={rowOffsets.offsets[i]}
              width={svgWidth} height={rowHeights[i]}
              fill="transparent" />

            {/* Baseline ghost bar */}
            {overlay && (
              <TaskBar
                x={posX(differenceInDays(new Date(overlay.startDate), rangeStart))}
                y={hasCh ? (rowOffsets.offsets[i] + rowHeights[i] / 2 - 4) : barY(task.id)}
                w={Math.max((differenceInDays(new Date(overlay.endDate), new Date(overlay.startDate)) + 1) * dayWidth, 4)}
                h={h}
                pct={pct}
                isMilestone={task.isMilestone}
                isCritical={false}
                isSummary={false}
                isGhost={true}
              />
            )}

            {/* Actual bar */}
            <TaskBar
              x={x}
              y={y}
              w={w}
              h={h}
              pct={pct}
              isMilestone={task.isMilestone}
              isCritical={isCritical}
              isSummary={hasCh}
              isGhost={false}
              status={barStatus}
              drag={criticalDragMap?.get(task.id)}
              resourceLabel={!hasCh && task.laborCount ? `👥 ${task.laborCount} Men` : undefined}
              taskType={task.taskType}
            />

            {/* Float / slack tail (OmniPlan style) — non-critical, non-summary leaf tasks only */}
            {!hasCh && !isCritical && !task.isMilestone && (() => {
              const floatDays = floatMap?.get(task.id) ?? 0;
              if (floatDays < 0.5) return null;
              const tailW = Math.min(floatDays, 30) * dayWidth;
              const tailY = rowOffsets.offsets[i] + rowHeights[i] / 2 - 1.5;
              return (
                <rect
                  x={x + w}
                  y={tailY}
                  width={tailW}
                  height={3}
                  rx={1}
                  fill="hsl(0 0% 60%)"
                  opacity={0.28}
                  className="pointer-events-none"
                />
              );
            })()}

            {/* Milestone external label — always to the right of the diamond */}
            {task.isMilestone && (
              <text
                x={x + w / 2 + 11}
                y={rowOffsets.offsets[i] + rowHeights[i] / 2 + 3}
                fontSize={9}
                fontFamily="sans-serif"
                fill="currentColor"
                fillOpacity={0.6}
                className="text-foreground pointer-events-none"
              >
                {task.name.length > 20 ? task.name.slice(0, 19) + "…" : task.name}
              </text>
            )}

            {/* External label for short non-milestone bars (OmniPlan style) */}
            {!hasCh && !task.isMilestone && w < 60 && (
              <text
                x={x + w + 5}
                y={rowOffsets.offsets[i] + rowHeights[i] / 2 + 3}
                fontSize={9}
                fontFamily="sans-serif"
                fill="currentColor"
                fillOpacity={0.55}
                className="text-foreground pointer-events-none"
              >
                {task.name.length > 22 ? task.name.slice(0, 21) + "…" : task.name}
              </text>
            )}
          </g>
        );
      })}

      {/* Dependency arrows (drawn after bars so they appear on top) */}
      {deps.map((dep) => {
        const fromIdx = visibleRows.findIndex(r => r.task.id === dep.from.id);
        const toIdx = visibleRows.findIndex(r => r.task.id === dep.to.id);
        if (fromIdx === -1 || toIdx === -1) return null;
        return (
          <DependencyArrow
            key={`dep-${dep.from.id}-${dep.to.id}-${dep.index}`}
            x1={posX(dep.x1)}
            y1={rowOffsets.offsets[fromIdx] + rowHeights[fromIdx] / 2}
            x2={posX(dep.x2)}
            y2={rowOffsets.offsets[toIdx] + rowHeights[toIdx] / 2}
            type={dep.type}
            offset={dep.offset}
          />
        );
      })}

      {/* Today line & glowing beacon */}
      {todayOffset >= 0 && (
        <g>
          <line
            x1={todayOffset + 10}
            y1={0}
            x2={todayOffset + 10}
            y2={totalHeight}
            stroke="#10b981"
            strokeWidth={2}
            strokeDasharray="4 2"
          />
          <rect
            x={todayOffset + 10 - 24}
            y={2}
            width={48}
            height={15}
            rx={4}
            fill="#10b981"
            className="shadow-sm"
          />
          <text
            x={todayOffset + 10}
            y={12.5}
            textAnchor="middle"
            fontSize={8}
            fontWeight={800}
            fill="#ffffff"
            className="font-mono tracking-wider select-none pointer-events-none"
          >
            आज TODAY
          </text>
        </g>
      )}
    </svg>
  );
}
