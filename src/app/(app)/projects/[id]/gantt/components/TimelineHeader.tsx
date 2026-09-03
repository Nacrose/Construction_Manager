"use client";

import { useMemo } from "react";
import { format, differenceInDays } from "date-fns";
import type { Task, ZoomLevel } from "../../gantt/types";
import type { DayLabel } from "./Timeline";
import { adToBs } from "@/lib/nepali-calendar";
import { useUserPreferences } from "@/components/user-preferences-provider";

export function TimelineHeader({
  dayLabels,
  dayWidth,
  zoom,
  days,
  svgWidth,
  tasks = [],
  rangeStart,
}: {
  dayLabels: DayLabel[];
  dayWidth: number;
  zoom: ZoomLevel;
  days: number;
  svgWidth: number;
  tasks?: Task[];
  rangeStart?: Date;
}) {
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

  // Precompute Month Spans for the selected calendar mode
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

  return (
    <g className="font-mono select-none">
      {/* ─── TIER 1: MONTH & YEAR (0px to 22px) ───────────────────────── */}
      {monthGroups.map((group, gIdx) => {
        const xPos = group.startIndex * dayWidth + 10;
        const colWidth = dayWidth * group.span;

        return (
          <g key={`mo-hdr-${gIdx}`}>
            {/* Background cell for month */}
            <rect
              x={xPos}
              y={0}
              width={colWidth}
              height={22}
              fill="#e8dfd2"
            />
            {/* Month + Year text */}
            <text
              x={xPos + colWidth / 2}
              y={15}
              textAnchor="middle"
              fontSize={10}
              fontWeight={700}
              className="fill-stone-700 tracking-wider uppercase font-mono"
            >
              {colWidth > 45 ? group.label : group.label.slice(0, 3)}
            </text>
            {/* Vertical dividing boundary between months */}
            {gIdx > 0 && (
              <line
                x1={xPos}
                y1={0}
                x2={xPos}
                y2={68}
                stroke="rgba(116, 105, 94, 0.24)"
                strokeWidth={1}
              />
            )}
          </g>
        );
      })}

      {/* HORIZONTAL DIVIDER BETWEEN TIER 1 & TIER 2 (y=22) */}
      <line
        x1={10}
        y1={22}
        x2={svgWidth}
        y2={22}
        stroke="rgba(116, 105, 94, 0.2)"
        strokeWidth={1}
      />

      {/* ─── TIER 2: SUB-TICKS (DAYS OR 4 WEEKS PER MONTH) (22px to 44px) ─── */}
      {zoom === "day"
        ? dayLabels.map((d, i) => {
            const xPos = i * dayWidth + 10;
            let dayNumber = "";
            if (isNepali) {
              try {
                const bs = adToBs(d.date);
                dayNumber = `${bs.day}`;
              } catch {
                dayNumber = `${d.date.getDate()}`;
              }
            } else {
              dayNumber = `${d.date.getDate()}`;
            }

            const isSaturday = d.isWeekend;
            // Holiday styling takes precedence over Saturday styling —
            // a festival that lands on a Sun-Fri should still be visually
            // distinct from a working day.
            const isHolidayDay = !!d.isHoliday;
            const dayFill = isHolidayDay
              ? "fill-rose-600 font-bold"
              : isSaturday
                ? "fill-stone-700 font-bold"
                : "fill-stone-500";
            const dayWeight = isHolidayDay ? 700 : isSaturday ? 700 : 500;

            return (
              <g key={`dh-${i}`}>
                <text
                  x={xPos + dayWidth / 2}
                  y={36}
                  textAnchor="middle"
                  fontSize={9}
                  fontWeight={dayWeight}
                  className={dayFill}
                >
                  {dayNumber}
                </text>
                {/* Small dot below the day number for holidays — gives a
                    quick visual cue even when zoomed out / many days shown.
                    Hovering the dot or the day cell shows the holiday name. */}
                {isHolidayDay && (
                  <g>
                    <circle
                      cx={xPos + dayWidth / 2}
                      cy={42}
                      r={1.8}
                      className="fill-rose-500"
                    />
                    <rect
                      x={xPos}
                      y={22}
                      width={dayWidth}
                      height={22}
                      fill="transparent"
                      className="cursor-help"
                    >
                      <title>
                        {d.holidayName
                          ? `${d.date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })} — ${d.holidayName} (Nepal public holiday)`
                          : `${d.date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })} — Nepal public holiday`}
                      </title>
                    </rect>
                  </g>
                )}
                {i > 0 && (
                  <line
                    x1={xPos}
                    y1={22}
                    x2={xPos}
                    y2={44}
                    stroke="rgba(116, 105, 94, 0.16)"
                    strokeWidth={0.5}
                  />
                )}
              </g>
            );
          })
        : monthGroups.map((group, gIdx) => {
            const wCount = 4;
            const weekWidth = (dayWidth * group.span) / wCount;
            const groupStartX = group.startIndex * dayWidth + 10;

            return (
              <g key={`month-weeks-${gIdx}`}>
                {[0, 1, 2, 3].map((wIdx) => {
                  const weekStartX = groupStartX + wIdx * weekWidth;
                  return (
                    <g key={`mw-${gIdx}-${wIdx}`}>
                      <text
                        x={weekStartX + weekWidth / 2}
                        y={36}
                        textAnchor="middle"
                        fontSize={9}
                        fontWeight={600}
                        className="fill-stone-500"
                      >
                        {`W${wIdx + 1}`}
                      </text>
                      {wIdx > 0 && (
                        <line
                          x1={weekStartX}
                          y1={22}
                          x2={weekStartX}
                          y2={44}
                          stroke="rgba(116, 105, 94, 0.16)"
                          strokeWidth={0.5}
                        />
                      )}
                    </g>
                  );
                })}
              </g>
            );
          })}

      {/* HORIZONTAL DIVIDER BETWEEN TIER 2 & TIER 3 (y=44) */}
      <line
        x1={10}
        y1={44}
        x2={svgWidth}
        y2={44}
        stroke="rgba(52, 211, 153, 0.2)"
        strokeWidth={1}
      />

      {/* ─── TIER 3: RESOURCE DENSITY RIBBON (44px to 68px) ────────────────── */}
      {/* Background track for manpower ribbon */}
      <rect
        x={10}
        y={44}
        width={svgWidth - 10}
        height={24}
        fill="#f0e7da"
      />

      {zoom === "day"
        ? dayLabels.map((_, i) => {
            const xPos = i * dayWidth + 10;
            const count = dailyLabor[i] || 0;
            const isPeak = count > 35;
            const isOverAllocated = count > 50;

            return (
              <g key={`res-ribbon-${i}`}>
                {i > 0 && (
                  <line
                    x1={xPos}
                    y1={44}
                    x2={xPos}
                    y2={68}
                    stroke="rgba(116, 105, 94, 0.12)"
                    strokeWidth={0.5}
                  />
                )}
                {count > 0 && dayWidth >= 16 && (
                  <g>
                    <title>{`Date: ${format(dayLabels[i].date, "yyyy-MM-dd")}\nActive Manpower: ${count} Men`}</title>
                    {/* Micro chip pill */}
                    <rect
                      x={xPos + 2}
                      y={48}
                      width={Math.max(dayWidth - 4, 12)}
                      height={16}
                      rx={3}
                      fill={
                        isOverAllocated
                          ? "rgba(239, 68, 68, 0.25)"
                          : isPeak
                            ? "rgba(245, 158, 11, 0.22)"
                            : "rgba(16, 185, 129, 0.18)"
                      }
                      stroke={
                        isOverAllocated
                          ? "#ef4444"
                          : isPeak
                            ? "#f59e0b"
                            : "rgba(52, 211, 153, 0.6)"
                      }
                      strokeWidth={0.8}
                    />
                    <text
                      x={xPos + dayWidth / 2}
                      y={60}
                      textAnchor="middle"
                      fontSize={dayWidth < 24 ? 7.5 : 8.5}
                      fontWeight={700}
                      fill={
                        isOverAllocated
                          ? "#fca5a5"
                          : isPeak
                            ? "#fcd34d"
                            : "#347d61"
                      }
                      className="font-mono"
                    >
                      {count}
                    </text>
                  </g>
                )}
              </g>
            );
          })
        : monthGroups.map((group, gIdx) => {
            const wCount = 4;
            const weekWidth = (dayWidth * group.span) / wCount;
            const groupStartX = group.startIndex * dayWidth + 10;

            return (
              <g key={`res-weeks-${gIdx}`}>
                {[0, 1, 2, 3].map((wIdx) => {
                  const weekStartX = groupStartX + wIdx * weekWidth;
                  const startDayIdx = group.startIndex + Math.floor((wIdx * group.span) / 4);
                  const endDayIdx = Math.min(days - 1, group.startIndex + Math.floor(((wIdx + 1) * group.span) / 4) - 1);
                  
                  let weekPeakLabor = 0;
                  for (let dIdx = startDayIdx; dIdx <= endDayIdx; dIdx++) {
                    if (dailyLabor[dIdx] > weekPeakLabor) {
                      weekPeakLabor = dailyLabor[dIdx];
                    }
                  }

                  const isPeak = weekPeakLabor > 35;
                  const isOverAllocated = weekPeakLabor > 50;

                  return (
                    <g key={`rw-${gIdx}-${wIdx}`}>
                      {wIdx > 0 && (
                        <line
                          x1={weekStartX}
                          y1={44}
                          x2={weekStartX}
                          y2={68}
                          stroke="rgba(116, 105, 94, 0.12)"
                          strokeWidth={0.5}
                        />
                      )}
                      {weekPeakLabor > 0 && weekWidth >= 16 && (
                        <g>
                          <title>{`Week ${wIdx + 1} (${group.label})\nPeak Daily Manpower: ${weekPeakLabor} Men`}</title>
                          <rect
                            x={weekStartX + 3}
                            y={48}
                            width={Math.max(weekWidth - 6, 14)}
                            height={16}
                            rx={3}
                            fill={
                              isOverAllocated
                                ? "rgba(239, 68, 68, 0.25)"
                                : isPeak
                                  ? "rgba(245, 158, 11, 0.22)"
                                  : "rgba(16, 185, 129, 0.18)"
                            }
                            stroke={
                              isOverAllocated
                                ? "#ef4444"
                                : isPeak
                                  ? "#f59e0b"
                                  : "rgba(52, 211, 153, 0.6)"
                            }
                            strokeWidth={0.8}
                          />
                          <text
                            x={weekStartX + weekWidth / 2}
                            y={60}
                            textAnchor="middle"
                            fontSize={weekWidth < 28 ? 7.5 : 8.5}
                            fontWeight={700}
                            fill={
                              isOverAllocated
                                ? "#fca5a5"
                                : isPeak
                                  ? "#fcd34d"
                                  : "#347d61"
                            }
                            className="font-mono"
                          >
                            {weekPeakLabor}
                          </text>
                        </g>
                      )}
                    </g>
                  );
                })}
              </g>
            );
          })}
    </g>
  );
}
