"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { format, differenceInDays } from "date-fns";
import { ChevronRight, Flag } from "lucide-react";
import { toast } from "sonner";
import type { Task } from "../../gantt/types";
import { InlineAddRow } from "../../gantt/components/InlineAddRow";
import { trpc } from "@/lib/trpc-client";

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
  hiddenCols?: Set<string>;
};

export function TaskList({
  flattened, canWrite, projectId, selectedTaskId, onSelectTask,
  hoveredTaskId, onHoverTask, onContextMenu,
  rolledUpProgress, selectedCostLibraryId: _selectedCostLibraryId, pushAction: _pushAction, utils,
  addTaskTrigger = 0, leftPanelWidth = 640, onWidthNeeded: _onWidthNeeded, hasManuallyResized: _hasManuallyResized = false,
  visibleRows, rowHeights, rowOffsets: _rowOffsets, expandedMap, setExpandedMap,
  emptyRowsCount = 0, hiddenCols,
}: TaskListProps) {
  const [dropIndicator, setDropIndicator] = useState<string | null>(null);
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const canFitCol = (key: string) => {
    if (hiddenCols?.has(key)) return false;
    if (leftPanelWidth < 320 && key === "start") return false;
    if (leftPanelWidth < 410 && key === "finish") return false;
    if (leftPanelWidth < 465 && key === "days") return false;
    if (leftPanelWidth < 530 && key === "progress") return false;
    if (leftPanelWidth < 625 && key === "responsible") return false;
    return true;
  };
  const vis = (key: string) => canFitCol(key);

  const moveMutation = trpc.gantt.move.useMutation({
    onSuccess: () => {
      utils.gantt.list.invalidate({ projectId });
      toast.success("Task reordered & WBS recalculated");
    },
    onError: (e) => toast.error(e.message),
  });

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
              "flex items-center border-b border-border/70 text-xs transition-all cursor-pointer group relative overflow-hidden",
              isDragging && "opacity-40 bg-secondary",
              isDropBefore && "border-t-2 border-t-emerald-400 shadow-[0_-2px_8px_rgba(52,211,153,0.5)]",
              isDropAfter && "border-b-2 border-b-emerald-400 shadow-[0_2px_8px_rgba(52,211,153,0.5)]",
              isSelected
                ? "bg-primary/20 border-l-2 border-l-primary text-foreground"
                : isHovered
                  ? "bg-accent text-foreground"
                  : idx % 2 === 0
                    ? "bg-card hover:bg-accent/60 text-muted-foreground"
                    : "bg-[#f7f1e8]/65 hover:bg-accent/60 text-muted-foreground",
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
            <div className="w-[52px] shrink-0 flex items-center justify-center border-r border-border/70 h-full px-1" title={`WBS: ${task.code || idx + 1}`}>
              <span className="text-[10px] font-mono text-primary font-bold truncate">
                {task.code || idx + 1}
              </span>
            </div>

            <div
              className="min-w-[100px] flex-1 h-full flex items-center gap-1 border-r border-border/60 pr-2 overflow-hidden"
              style={{ paddingLeft: Math.max(6, indent + 6) }}
            >
              {children ? <button onClick={(event) => { event.stopPropagation(); toggleExpand(task.id); }} className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"><ChevronRight className={cn("h-3 w-3 transition-transform", isExpanded && "rotate-90")} /></button> : <span className="ml-3.5 h-1 w-1 rounded-full border border-muted-foreground/50" />}
              {task.isMilestone && <Flag className="h-3 w-3 shrink-0 text-amber-600" />}
              <span className={cn("min-w-0 flex-1 truncate text-[10.5px] text-foreground", children && "font-semibold")} title={task.name}>{task.name}</span>
            </div>
            {vis("start") && <div className="w-[88px] shrink-0 px-2 text-[9px] text-foreground">{format(start, "dd MMM yy")}</div>}
            {vis("finish") && <div className="w-[88px] shrink-0 border-l border-border/60 px-2 text-[9px] text-foreground">{format(end, "dd MMM yy")}</div>}
            {vis("days") && <div className="w-[58px] shrink-0 border-l border-border/60 text-center text-[9px] text-foreground">{dur}d</div>}
            {vis("progress") && <div className={cn("w-[64px] shrink-0 border-l border-border/60 text-center text-[9px] font-semibold", pct === 100 ? "text-emerald-700" : "text-foreground")}>{Math.round(pct)}%</div>}
            {vis("responsible") && <div className="w-[96px] shrink-0 truncate border-l border-border/60 px-2 text-[9px] text-muted-foreground">{task.laborCount > 0 ? `${task.laborCount} people` : "—"}</div>}
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
              "flex items-center h-9 border-b border-border/60 pointer-events-none select-none",
              rowIdx % 2 === 0 ? "bg-card" : "bg-[#f7f1e8]/65"
            )}
          >
            <div className="w-[52px] shrink-0 border-r border-border/60 h-full" />
            <div className="min-w-[100px] flex-1 border-r border-border/60 h-full" />
            {vis("start") && <div className="w-[88px] border-r border-border/60 h-full" />}
            {vis("finish") && <div className="w-[88px] border-r border-border/60 h-full" />}
            {vis("days") && <div className="w-[58px] border-r border-border/60 h-full" />}
            {vis("progress") && <div className="w-[64px] border-r border-border/60 h-full" />}
            {vis("responsible") && <div className="w-[96px] h-full" />}
          </div>
        );
      })}
    </div>
  );
}
