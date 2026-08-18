"use client";

import { use, useEffect, useState, useMemo } from "react";
import { trpc } from "@/lib/trpc-client";
import { Skeleton } from "@/components/ui/skeleton";
import { addDays, format, differenceInDays } from "date-fns";
import { computeDateRange, computeRolledUpProgress, getDayWidth, getTaskRowHeight, computeCriticalPath, getDeps, computeFloatMap, getBarStatus } from "../../utils";
import type { Task, ZoomLevel } from "../../types";
import { TaskList } from "../../components/TaskList";
import { Timeline, type DayLabel } from "../../components/Timeline";
import { TimelineHeader } from "../../components/TimelineHeader";
import { DependencyArrow } from "../../components/DependencyArrow";
import { TaskBar } from "../../components/TaskBar";
import type { GanttPrintSettings } from "../page";

const DEFAULT_SETTINGS: GanttPrintSettings = {
  paperSize: "A3",
  orientation: "landscape",
  margin: 15,
  timelineFitMode: "fit-width",
  customDayWidth: 15,
  showLogo: true,
  documentTitle: "Project Construction Schedule",
  documentSubtitle: "Main Execution Plan",
  showProjectName: true,
  showClientName: true,
  showDateRange: true,
  showProgress: true,
  zoomLevel: "week",
  showBaseline: true,
  highlightCriticalPath: true,
  showWBSColumn: true,
  showDatesColumn: true,
  showDurationColumn: true,
  showProgressColumn: true,
  columnWidths: {
    wbs: 45,
    task: 180,
    dates: 120,
    duration: 65,
    progress: 65,
  },
  footerNote: "Confidential - For Internal Use Only",
  showPrintDate: true,
  showDependencies: true,
};

export default function GanttPdfPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [settings, setSettings] = useState<GanttPrintSettings | null>(null);

  // 1. Fetch versions list to find active one
  const { data: versionsData, isLoading: versionsLoading } = trpc.gantt.listVersions.useQuery({ projectId: id });
  const activeVersion = versionsData?.versions.find(v => v.status === "APPROVED") || versionsData?.versions[0];

  // 2. Load schedule data
  const { data: scheduleData, isLoading: scheduleLoading } = trpc.gantt.list.useQuery(
    { projectId: id, versionId: activeVersion?.id },
    { enabled: !!activeVersion?.id }
  );

  // 3. Fetch project details info
  const { data: projectInfo, isLoading: projectLoading } = trpc.project.get.useQuery({ id }, { staleTime: 300_000 });

  // Read layout from localStorage (written by PDF Designer)
  useEffect(() => {
    try {
      const key = `gantt-print-settings-${id}`;
      const saved = localStorage.getItem(key);
      if (saved) {
        setSettings(JSON.parse(saved));
      } else {
        setSettings(DEFAULT_SETTINGS);
      }
    } catch {
      setSettings(DEFAULT_SETTINGS);
    }
  }, [id]);

  // Gantt chart calculations
  const allTasks = useMemo(() => (scheduleData?.tasks as unknown as Task[]) || [], [scheduleData]);
  const rootTasks = useMemo(() => allTasks.filter(t => !t.parentId), [allTasks]);
  const taskMap = useMemo(() => new Map(allTasks.map(t => [t.id, t])), [allTasks]);
  const { rangeStart, days } = useMemo(() => computeDateRange(allTasks), [allTasks]);
  const rolledUpProgress = useMemo(() => computeRolledUpProgress(allTasks), [allTasks]);
  const criticalTaskIds = useMemo(() => computeCriticalPath(allTasks), [allTasks]);
  const floatMap = useMemo(() => computeFloatMap(allTasks), [allTasks]);

  const flattened = useMemo(() => {
    const result: { task: Task; depth: number }[] = [];
    function walk(list: Task[], depth: number) {
      for (const t of list) {
        result.push({ task: t, depth });
        const children = allTasks.filter(ch => ch.parentId === t.id);
        if (children.length > 0) walk(children, depth + 1);
      }
    }
    walk(rootTasks, 0);
    return result;
  }, [rootTasks, allTasks]);

  const expandedMap = useMemo(() => {
    return new Set(flattened.map(r => r.task.id));
  }, [flattened]);

  const visibleRows = flattened;

  // Page width/height logic
  const pageDimensions = useMemo(() => {
    if (!settings) return { wMm: 420, hMm: 297 };
    const isA3 = settings.paperSize === "A3";
    const isLandscape = settings.orientation === "landscape";
    let wMm = isA3 ? 420 : 297;
    let hMm = isA3 ? 297 : 210;
    if (!isLandscape) {
      const tmp = wMm;
      wMm = hMm;
      hMm = tmp;
    }
    return { wMm, hMm };
  }, [settings]);

  // Total Task List Left Panel width
  const totalLeftColumnsWidth = useMemo(() => {
    if (!settings) return 320;
    let w = 20; // margins
    if (settings.showWBSColumn) w += settings.columnWidths.wbs;
    w += settings.columnWidths.task;
    if (settings.showDatesColumn) w += settings.columnWidths.dates;
    if (settings.showDurationColumn) w += settings.columnWidths.duration;
    if (settings.showProgressColumn) w += settings.columnWidths.progress;
    return w;
  }, [settings]);

  const MM_TO_PX = 3.7795;
  const pageWpx = pageDimensions.wMm * MM_TO_PX;
  const pageHpx = pageDimensions.hMm * MM_TO_PX;
  const marginsPx = settings ? settings.margin * 2 * MM_TO_PX : 30;
  const availableWidthPx = pageWpx - marginsPx;

  const calculatedDayWidth = useMemo(() => {
    if (!days || !settings) return 5;
    if (settings.timelineFitMode === "fit-width") {
      const remainingTimelineWidth = availableWidthPx - totalLeftColumnsWidth - 25; // 25px timeline buffer
      return Math.max(0.5, remainingTimelineWidth / days);
    } else {
      return settings.customDayWidth;
    }
  }, [days, settings, availableWidthPx, totalLeftColumnsWidth]);

  const svgWidth = useMemo(() => {
    if (!days) return 200;
    return days * calculatedDayWidth + 20;
  }, [days, calculatedDayWidth]);

  const dayLabels = useMemo(() => {
    if (!rangeStart || !days) return [];
    const zoom: ZoomLevel = calculatedDayWidth < 2 ? "month" : calculatedDayWidth < 8 ? "week" : "day";
    return Array.from({ length: days }, (_, i) => {
      const d = addDays(rangeStart, i);
      const dow = d.getDay();
      const isFirstOfMonth = d.getDate() === 1;
      const isMonday = dow === 1;
      let label = "";
      if (zoom === "day") label = format(d, "dd MMM");
      else if (zoom === "week") label = isMonday ? format(d, "MMM d") : "";
      else label = isFirstOfMonth ? format(d, "MMM") : "";
      return { date: d, label, isWeekend: dow === 6 || dow === 0, isFirstOfMonth, isMonday, isFirstOfYear: d.getMonth() === 0 && d.getDate() === 1 };
    });
  }, [rangeStart, days, calculatedDayWidth]);

  const rowHeights = useMemo(() => {
    if (!settings) return visibleRows.map(() => 38);
    return visibleRows.map(({ task, depth }) => getTaskRowHeight(task.name, depth, settings.columnWidths.task));
  }, [visibleRows, settings]);

  const rowOffsets = useMemo(() => {
    const offsets: number[] = [];
    let current = 0;
    for (const h of rowHeights) {
      offsets.push(current);
      current += h;
    }
    return { offsets, totalHeight: current + 40 };
  }, [rowHeights]);

  const totalHeight = rowOffsets.totalHeight;

  // Determine split pages horizontally in multi-page mode
  const numHorizontalPages = useMemo(() => {
    if (!settings || settings.timelineFitMode === "fit-width") return 1;
    const firstPageWidth = availableWidthPx - totalLeftColumnsWidth;
    if (svgWidth <= firstPageWidth) return 1;
    return 1 + Math.ceil((svgWidth - firstPageWidth) / availableWidthPx);
  }, [settings, svgWidth, availableWidthPx, totalLeftColumnsWidth]);

  const getTimelineTranslationX = (pIdx: number) => {
    if (pIdx === 0) return 0;
    const firstPageWidth = availableWidthPx - totalLeftColumnsWidth;
    return firstPageWidth + (pIdx - 1) * availableWidthPx;
  };


  const deps = useMemo(() => {
    const result: { from: Task; to: Task; x1: number; x2: number; index: number; type: string; offset: number }[] = [];
    let idx = 0;
    for (const { task } of flattened) {
      for (const dep of getDeps(task)) {
        const fromTask = taskMap.get(dep.taskId);
        if (!fromTask) continue;
        const fromStart = differenceInDays(new Date(fromTask.startDate), rangeStart || new Date());
        const fromEnd = differenceInDays(new Date(fromTask.endDate), rangeStart || new Date()) + 1;
        const toStart = differenceInDays(new Date(task.startDate), rangeStart || new Date());
        const toEnd = differenceInDays(new Date(task.endDate), rangeStart || new Date()) + 1;
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
  }, [flattened, taskMap, rangeStart]);

  // Inject project and version wrapper for token resolving structure
  const entityData = useMemo(() => {
    if (!scheduleData) return null;
    return {
      ...scheduleData,
      version: activeVersion,
      project: projectInfo || {},
    };
  }, [scheduleData, activeVersion, projectInfo]);

  // Auto-trigger browser print dialog when loaded
  useEffect(() => {
    if (!versionsLoading && !scheduleLoading && !projectLoading && settings && entityData) {
      const t = setTimeout(() => {
        window.print();
      }, 1000);
      return () => clearTimeout(t);
    }
  }, [versionsLoading, scheduleLoading, projectLoading, settings, entityData]);

  if (versionsLoading || scheduleLoading || projectLoading || !settings || !entityData) {
    return (
      <div className="p-8 space-y-4">
        <Skeleton className="h-16 animate-pulse" />
        <Skeleton className="h-96 animate-pulse" />
      </div>
    );
  }

  return (
    <div className="bg-white min-h-screen">
      {/* Dynamic CSS Print rule injection to enforce exact paper size, margin and page breaks */}
      <style dangerouslySetInnerHTML={{ __html: `
        @page {
          size: ${settings.paperSize.toLowerCase()} ${settings.orientation};
          margin: 0;
        }
        @media print {
          body {
            background: white !important;
            color: black !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          .print-page {
            page-break-after: always !important;
            break-inside: avoid !important;
            box-shadow: none !important;
            border: none !important;
            margin: 0 !important;
            width: ${pageWpx}px !important;
            height: ${pageHpx}px !important;
            box-sizing: border-box !important;
          }
          .no-print {
            display: none !important;
          }
        }
      `}} />

      {/* Sheets Mapping */}
      <div className="flex flex-col items-center gap-6 p-6 bg-slate-100/50 no-print-bg print:p-0 print:bg-white print:gap-0">
        {Array.from({ length: numHorizontalPages }).map((_, pIdx) => {
          const isFirstPage = pIdx === 0;
          return (
            <div
              key={pIdx}
              className="print-page bg-white border border-slate-300 shadow-xl relative shrink-0 flex flex-col overflow-hidden text-slate-900"
              style={{
                width: `${pageWpx}px`,
                height: `${pageHpx}px`,
                padding: `${settings.margin * MM_TO_PX}px`,
                boxSizing: "border-box",
              }}
            >
              {/* Header — fixed height so all pages align identically when taped side-by-side */}
              <div className="shrink-0 border-b-2 border-slate-300 mb-4" style={{ height: "88px", display: "flex", flexDirection: "column", justifyContent: "flex-end", paddingBottom: "12px" }}>
                {isFirstPage ? (
                  <div className="flex justify-between items-end">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        {settings.showLogo && (
                          <div className="h-7 w-7 rounded bg-slate-900 flex items-center justify-center font-bold text-white text-[10px]">
                            CM
                          </div>
                        )}
                        <h2 className="text-xl font-bold tracking-tight text-slate-900">{settings.documentTitle}</h2>
                      </div>
                      <p className="text-xs font-medium text-slate-500 italic">{settings.documentSubtitle}</p>
                    </div>

                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px] text-slate-600 bg-slate-50 p-2 rounded border border-slate-200">
                      {settings.showProjectName && (
                        <>
                          <span className="font-semibold">Project:</span>
                          <span className="truncate max-w-[120px]">{projectInfo?.project?.name || "N/A"}</span>
                        </>
                      )}
                      {settings.showClientName && (
                        <>
                          <span className="font-semibold">Client:</span>
                          <span className="truncate max-w-[120px]">{projectInfo?.project?.client || "N/A"}</span>
                        </>
                      )}
                      {settings.showDateRange && (
                        <>
                          <span className="font-semibold">Schedule Period:</span>
                          <span>{rangeStart && days ? `${format(rangeStart, "dd MMM yy")} - ${format(addDays(rangeStart, days), "dd MMM yy")}` : "N/A"}</span>
                        </>
                      )}
                      {settings.showProgress && (
                        <>
                          <span className="font-semibold">Status:</span>
                          <span className="font-semibold text-emerald-600">{rolledUpProgress.get("root") ?? 0}% Complete</span>
                        </>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-end justify-between">
                    <span className="text-xs font-semibold text-slate-500 italic">{settings.documentTitle} — Schedule Continued...</span>
                    <span className="text-xs text-slate-400">Page {pIdx + 1} of {numHorizontalPages}</span>
                  </div>
                )}
              </div>

              {/* Gantt chart main body layout */}
              <div className="flex-1 flex overflow-hidden border border-slate-200 rounded bg-white">
                {/* WBS and Tasks column pane repeated on all split pages for context */}
                {isFirstPage && (
                  <div
                    className="shrink-0 border-r border-slate-200 flex flex-col bg-slate-55"
                    style={{ width: `${totalLeftColumnsWidth}px` }}
                  >
                  <div className="h-12 shrink-0 flex items-center border-b border-slate-200 px-1 text-[9px] font-bold text-slate-500 uppercase tracking-wider bg-slate-100">
                    {settings.showWBSColumn && <span className="text-center shrink-0" style={{ width: settings.columnWidths.wbs }}>WBS</span>}
                    <span className="flex-1 pl-1 shrink-0" style={{ width: settings.columnWidths.task }}>Task</span>
                    {settings.showDatesColumn && <span className="text-center shrink-0" style={{ width: settings.columnWidths.dates }}>Dates</span>}
                    {settings.showDurationColumn && <span className="text-center shrink-0" style={{ width: settings.columnWidths.duration }}>Dur</span>}
                    {settings.showProgressColumn && <span className="text-center shrink-0" style={{ width: settings.columnWidths.progress }}>%</span>}
                  </div>

                  <div className="flex-1 overflow-hidden text-[10px] text-slate-800 divide-y divide-slate-100 bg-white">
                    {flattened.map(({ task, depth }, idx) => (
                      <div key={task.id} className="flex items-center px-1" style={{ height: `${rowHeights[idx]}px`, paddingLeft: `${depth * 8 + 4}px` }}>
                        {settings.showWBSColumn && (
                          <span className="text-slate-400 font-mono text-[9px] shrink-0" style={{ width: settings.columnWidths.wbs }}>
                            {idx + 1}
                          </span>
                        )}
                        <span className="flex-1 font-medium shrink-0 whitespace-normal break-words pr-2 leading-tight" style={{ width: settings.columnWidths.task }}>
                          {task.name}
                        </span>
                        {settings.showDatesColumn && (
                          <span className="text-slate-500 text-[9px] shrink-0" style={{ width: settings.columnWidths.dates }}>
                            {format(new Date(task.startDate), "MMM dd")}
                          </span>
                        )}
                        {settings.showDurationColumn && (
                          <span className="text-slate-500 text-center shrink-0" style={{ width: settings.columnWidths.duration }}>
                            {task.duration || 1}d
                          </span>
                        )}
                        {settings.showProgressColumn && (
                          <span className="text-emerald-600 font-semibold text-center shrink-0" style={{ width: settings.columnWidths.progress }}>
                            {task.progress}%
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

                {/* Timeline display: Shifts horizontally to show the current segment on split sheets */}
                <div className="flex-1 overflow-hidden flex flex-col bg-white">
                  {/* Timeline header segment */}
                  <div className="h-12 shrink-0 border-b border-slate-200 bg-slate-50 relative overflow-hidden">
                    <div style={{ width: `${svgWidth}px`, transform: `translateX(-${getTimelineTranslationX(pIdx)}px)` }}>
                      <svg height={48} width={svgWidth} className="block">
                        <TimelineHeader dayLabels={dayLabels} dayWidth={calculatedDayWidth} zoom="week" days={days || 30} svgWidth={svgWidth} />
                      </svg>
                    </div>
                  </div>

                  {/* SVG Timeline content shifted horizontally */}
                  <div className="flex-1 relative overflow-hidden">
                    <div style={{ width: `${svgWidth}px`, height: `${totalHeight}px`, transform: `translateX(-${getTimelineTranslationX(pIdx)}px)` }}>
                      <svg height={totalHeight} width={svgWidth} className="block">
                        {/* Zebra stripes */}
                        {visibleRows.map((_, i) => i % 2 === 1 && (
                          <rect key={i} x={0} y={rowOffsets.offsets[i]} width={svgWidth} height={rowHeights[i]} fill="hsla(0, 0%, 0%, 0.02)" />
                        ))}
                        {/* Task bars */}
                        {visibleRows.map(({ task }, i) => {
                          const barStart = differenceInDays(new Date(task.startDate), rangeStart || new Date());
                          const dur = task.duration || 1;
                          const barX = barStart * calculatedDayWidth + 10;
                          const barW = Math.max(dur * calculatedDayWidth, task.isMilestone ? 14 : 6);
                          const isCritical = settings.highlightCriticalPath && (criticalTaskIds.has(task.id) || task.isMilestone);
                          const barY = rowOffsets.offsets[i] + Math.floor((rowHeights[i] - 8) / 2);
                          const hasCh = allTasks.some(t => t.parentId === task.id);
                          const pct = hasCh ? (rolledUpProgress.get(task.id) ?? task.progress) : task.progress;
                          const barStatus = getBarStatus(task, pct);

                          return (
                            <g key={task.id}>
                              <TaskBar
                                x={barX}
                                y={barY}
                                w={barW}
                                h={8}
                                pct={pct}
                                isMilestone={task.isMilestone}
                                isCritical={isCritical}
                                isSummary={hasCh}
                                isGhost={false}
                                status={barStatus}
                              />
                              {/* Baseline ghost bar */}
                              {settings.showBaseline && (
                                <rect x={barX} y={barY + 10} width={barW} height={2} rx={1} fill="#cbd5e1" strokeDasharray="2,2" />
                              )}
                              {/* Float / slack tail (OmniPlan style) */}
                              {!hasCh && !isCritical && !task.isMilestone && (() => {
                                const floatDays = floatMap?.get(task.id) ?? 0;
                                if (floatDays < 0.5) return null;
                                const tailW = Math.min(floatDays, 30) * calculatedDayWidth;
                                const tailY = rowOffsets.offsets[i] + rowHeights[i] / 2 - 1.5;
                                return (
                                  <rect
                                    x={barX + barW}
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
                              {/* Milestone external label */}
                              {task.isMilestone && (
                                <text
                                  x={barX + barW / 2 + 11}
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
                              {/* External label for short bars */}
                              {!hasCh && !task.isMilestone && barW < 60 && (
                                <text
                                  x={barX + barW + 5}
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

                        {/* Dependency arrows */}
                        {settings.showDependencies && deps.map((dep) => {
                          const fromIdx = visibleRows.findIndex(r => r.task.id === dep.from.id);
                          const toIdx = visibleRows.findIndex(r => r.task.id === dep.to.id);
                          if (fromIdx === -1 || toIdx === -1) return null;
                          return (
                            <DependencyArrow
                              key={`dep-${dep.from.id}-${dep.to.id}-${dep.index}`}
                              x1={dep.x1 * calculatedDayWidth + 10}
                              y1={rowOffsets.offsets[fromIdx] + rowHeights[fromIdx] / 2}
                              x2={dep.x2 * calculatedDayWidth + 10}
                              y2={rowOffsets.offsets[toIdx] + rowHeights[toIdx] / 2}
                              type={dep.type}
                              offset={dep.offset}
                            />
                          );
                        })}
                      </svg>
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="border-t border-slate-200 pt-2 mt-3 flex justify-between items-center text-[9px] text-slate-400">
                <span>{settings.footerNote}</span>
                <span>Page {pIdx + 1} of {numHorizontalPages}</span>
                {settings.showPrintDate && (
                  <span>Printed: {format(new Date(), "dd MMM yyyy HH:mm")}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
