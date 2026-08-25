"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { cn } from "@/lib/utils";
import { format, differenceInDays } from "date-fns";
import { ChevronRight, GripVertical, Flag } from "lucide-react";
import { toast } from "sonner";
import type { Task } from "../../gantt/types";
import { InlineEdit } from "../../gantt/components/InlineEdit";
import { InlineAddRow } from "../../gantt/components/InlineAddRow";
import { trpc } from "@/lib/trpc-client";
import { adToBs } from "@/lib/nepali-calendar";
import { useUserPreferences } from "@/components/user-preferences-provider";

type FlattenedRow = { task: Task; depth: number };

type TaskListProps = {
  flattened: FlattenedRow[];
  canWrite: boolean;
  projectId: string;
  selectedTaskId: string | null;
  onSelectTask: (id: string | null) => void;
  hoveredTaskId: string | null;
  onHoverTask: (id: string | null) => void;
  onContextMenu?: (e: React.MouseEvent, task: Task) => void;
  rolledUpProgress: Map<string, number>;
  selectedCostLibraryId: string | undefined;
  pushAction: (action: { label: string; undo: () => Promise<void>; redo: () => Promise<void> }) => void;
  utils: any;
  addTaskTrigger?: number;
  leftPanelWidth?: number;
  onWidthNeeded?: (w: number) => void;
  hasManuallyResized?: boolean;
  visibleRows: FlattenedRow[];
  rowHeights: number[];
  rowOffsets: { offsets: number[]; totalHeight: number };
  expandedMap: Set<string>;
  setExpandedMap: React.Dispatch<React.SetStateAction<Set<string>>>;
  emptyRowsCount?: number;
};

export function TaskList({
  flattened, canWrite, projectId, selectedTaskId, onSelectTask,
  hoveredTaskId, onHoverTask, onContextMenu,
  rolledUpProgress, selectedCostLibraryId: _selectedCostLibraryId, pushAction: _pushAction, utils,
  addTaskTrigger = 0, leftPanelWidth = 320, onWidthNeeded, hasManuallyResized = false,
  visibleRows, rowHeights, rowOffsets, expandedMap, setExpandedMap,
  emptyRowsCount = 0,
}: TaskListProps) {
  const [dropIndicator, setDropIndicator] = useState<string | null>(null);
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);

  const moveMutation = trpc.gantt.move.useMutation({
    onSuccess: () => {
      utils.gantt.list.invalidate({ projectId });
      toast.success("Task reordered & WBS recalculated");
    },
    onError: (e) => toast.error(e.message),
  });

  const estimatedMaxNeededWidth = useMemo(() => {
    let maxW = 320;
    for (const { task, depth } of visibleRows) {
      const indent = depth * 14;
      const pct = rolledUpProgress.get(task.id) ?? task.progress;
      const needed = indent + 20 + 8 + 28 + (task.name.length * 6.8) + 55;
      if (needed > maxW) {
        maxW = needed;
      }
    }
    const limit = typeof window !== "undefined" ? window.innerWidth * 0.65 : 700;
    return Math.min(Math.round(maxW), limit);
  }, [visibleRows, rolledUpProgress]);

  const toggleExpand = (id: string) => {
    setExpandedMap(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const hasChildren = (task: Task) => flattened.some(r => r.task.parentId === task.id);

  const progress = (task: Task) => {
    if (hasChildren(task)) return rolledUpProgress.get(task.id) ?? task.progress;
    return task.progress;
  };

  const updateMutation = trpc.gantt.update.useMutation({
    onSuccess: () => utils.gantt.list.invalidate({ projectId }),
    onError: (e) => toast.error(e.message),
  });

  const reorderMutation = trpc.gantt.reorder.useMutation({
    onSuccess: () => { utils.gantt.list.invalidate({ projectId }); toast.success("Hierarchy updated"); },
    onError: (e) => toast.error(e.message),
  });

  const { getPref } = useUserPreferences();
  const calendarType = getPref<string>("calendarType", "BS");

  const formatTaskDateRange = (start: Date, end: Date, dur: number) => {
    try {
      if (calendarType === "BS") {
        const bsStart = adToBs(start);
        const bsEnd = adToBs(end);
        return `${bsStart.monthName} ${bsStart.day} → ${bsEnd.monthName} ${bsEnd.day} · ${dur}d`;
      } else if (calendarType === "DUAL") {
        const bsStart = adToBs(start);
        const bsEnd = adToBs(end);
        return `${bsStart.day} ${bsStart.monthName.slice(0, 3)} (${format(start, "d MMM")}) → ${bsEnd.day} ${bsEnd.monthName.slice(0, 3)} · ${dur}d`;
      }
      return `${format(start, "d MMM")} → ${format(end, "d MMM")} · ${dur}d`;
    } catch {
      return `${format(start, "d MMM")} → ${format(end, "d MMM")} · ${dur}d`;
    }
  };

  return (
    <div className="select-none font-mono">
      {visibleRows.map(({ task, depth }, idx) => {
        const isSelected = selectedTaskId === task.id;
        const isHovered = hoveredTaskId === task.id;
        const isDragging = draggedTaskId === task.id;
        const pct = progress(task);
        const children = hasChildren(task);
        const isExpanded = expandedMap.has(task.id);
        const indent = depth * 14;
        const start = new Date(task.startDate);
        const end = new Date(task.endDate);
        const dur = differenceInDays(end, start) + 1;

        const isDropBefore = dropIndicator === `before-${task.id}`;
        const isDropAfter = dropIndicator === `after-${task.id}`;

        return (
          <div key={task.id}
            draggable={canWrite}
            onDragStart={(e) => {
              e.dataTransfer.setData("text/plain", task.id);
              setDraggedTaskId(task.id);
            }}
            onDragEnd={() => {
              setDraggedTaskId(null);
              setDropIndicator(null);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              if (!draggedTaskId || draggedTaskId === task.id) return;
              const rect = e.currentTarget.getBoundingClientRect();
              const mid = rect.top + rect.height / 2;
              setDropIndicator(e.clientY < mid ? `before-${task.id}` : `after-${task.id}`);
            }}
            onDragLeave={() => {
              if (dropIndicator?.includes(task.id)) {
                setDropIndicator(null);
              }
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (!draggedTaskId || draggedTaskId === task.id) return;
              const pos = dropIndicator?.startsWith("before-") ? "before" : "after";
              moveMutation.mutate({
                projectId,
                taskId: draggedTaskId,
                targetTaskId: task.id,
                position: pos,
              });
              setDraggedTaskId(null);
              setDropIndicator(null);
            }}
            className={cn(
              "flex items-center border-b border-slate-800/70 text-xs transition-all cursor-pointer group relative overflow-hidden",
              isDragging && "opacity-40 bg-slate-900",
              isDropBefore && "border-t-2 border-t-emerald-400 shadow-[0_-2px_8px_rgba(52,211,153,0.5)]",
              isDropAfter && "border-b-2 border-b-emerald-400 shadow-[0_2px_8px_rgba(52,211,153,0.5)]",
              isSelected
                ? "bg-primary/20 border-l-2 border-l-primary text-slate-100"
                : isHovered
                  ? "bg-slate-800/60 text-slate-100"
                  : idx % 2 === 0
                    ? "bg-slate-950/80 hover:bg-slate-850/50 text-slate-300"
                    : "bg-slate-900/40 hover:bg-slate-850/50 text-slate-300",
            )}
            style={{ height: rowHeights[idx] }}
            onClick={() => onSelectTask(task.id)}
            onContextMenu={(e) => {
              e.preventDefault();
              onContextMenu?.(e, task);
            }}
            onMouseEnter={() => onHoverTask(task.id)}
            onMouseLeave={() => onHoverTask(null)}
          >
            {/* WBS code column with vertical divider and drag grip */}
            <div className="w-8 shrink-0 flex items-center justify-center border-r border-slate-800/70 h-full px-0.5" title={`WBS: ${task.code || idx + 1}`}>
              <span className="text-[10px] font-mono text-emerald-400 font-bold truncate">
                {task.code || idx + 1}
              </span>
            </div>

            {/* Task Name column with tree indent & expander */}
            <div
              className="flex-1 min-w-0 flex flex-col justify-center gap-1 py-1.5 pr-2 overflow-hidden"
              style={{ paddingLeft: Math.max(4, indent + 4) }}
            >
              {/* Top row: Name & % progress */}
              <div className="flex items-start gap-0.5 min-w-0">
                {children ? (
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleExpand(task.id); }}
                    className="rounded p-0.5 mt-0.5 -ml-0.5 hover:bg-slate-800 text-slate-400 hover:text-slate-200 cursor-pointer shrink-0"
                  >
                    <ChevronRight className={cn("h-3 w-3 transition-transform", isExpanded && "rotate-90")} />
                  </button>
                ) : null}
                {task.isMilestone && (
                  <Flag className="h-3 w-3 shrink-0 text-amber-500 mt-0.5" />
                )}
                <div className="flex-1 min-w-0">
                  <span
                    className="text-[11px] font-medium leading-[14px] text-left whitespace-normal break-words text-slate-200 block"
                    title={task.name}
                  >
                    {task.name}
                  </span>
                </div>
                <span className="text-[9.5px] text-slate-400 font-mono shrink-0 mt-0.5">({pct}%)</span>
              </div>

              {/* Subtitle row: Dates & Compact Indent Arrows */}
              <div className="flex items-center justify-between min-w-0 gap-1 pl-0.5">
                <div className="text-[8.5px] text-slate-400 font-mono truncate leading-tight flex-1 min-w-0">
                  {formatTaskDateRange(start, end, dur)}
                </div>
                {canWrite && (
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5 shrink-0 bg-slate-900/90 rounded border border-slate-700/70 px-0.5 shadow-sm">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        reorderMutation.mutate({ projectId, taskId: task.id, direction: "indent" });
                      }}
                      title="Indent (Nest under task above)"
                      className="px-1 py-0.2 text-[9px] font-mono text-slate-300 hover:text-emerald-400 hover:bg-slate-800 rounded cursor-pointer leading-none"
                    >
                      →
                    </button>
                    {task.parentId && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          reorderMutation.mutate({ projectId, taskId: task.id, direction: "outdent" });
                        }}
                        title="Outdent (Move 1 level up)"
                        className="px-1 py-0.2 text-[9px] font-mono text-slate-300 hover:text-emerald-400 hover:bg-slate-800 rounded cursor-pointer leading-none"
                      >
                        ←
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
      {canWrite && (
        <InlineAddRow projectId={projectId} parentId={null} existingCount={flattened.length} depth={0} trigger={addTaskTrigger} />
      )}
      {/* Continuing empty ghost rows to fill 100% of the viewport seamlessly */}
      {Array.from({ length: emptyRowsCount || 0 }).map((_, k) => {
        const rowIdx = visibleRows.length + (canWrite ? 1 : 0) + k;
        return (
          <div
            key={`ghost-row-${k}`}
            className={cn(
              "flex items-center h-[38px] border-b border-slate-800/60 pointer-events-none select-none",
              rowIdx % 2 === 0 ? "bg-slate-950/80" : "bg-slate-900/40"
            )}
          >
            <div className="w-12 shrink-0 border-r border-slate-800/60 h-full" />
            <div className="flex-1" />
          </div>
        );
      })}
    </div>
  );
}
