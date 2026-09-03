import { useMemo, useRef, useState, useEffect, useCallback } from "react";
import type { Task, ZoomLevel } from "../../gantt/types";
import type { DayLabel } from "./Timeline";
import { TaskList } from "./TaskList";
import { Timeline } from "./Timeline";
import { TimelineHeader } from "./TimelineHeader";
import { TaskInspector } from "./TaskInspector";
import { TaskContextMenu, type ContextMenuPosition } from "./TaskContextMenu";
import { trpc } from "@/lib/trpc-client";
import { toast } from "sonner";
import { ChevronsDownUp, ChevronsUpDown } from "lucide-react";
import { differenceInDays, format, addDays } from "date-fns";

type GanttProps = {
  tasks: Task[];
  rootTasks: Task[];
  rangeStart: Date;
  days: number;
  dayWidth: number;
  zoom: ZoomLevel;
  canWrite: boolean;
  projectId: string;
  overlayMap: Map<string, { startDate: string; endDate: string }>;
  criticalTaskIds: Set<string>;
  criticalDragMap?: Map<string, number>;
  rolledUpProgress: Map<string, number>;
  successorIds: Set<string>;
  leftPanelWidth: number;
  taskListVisible: boolean;
  inspectorVisible: boolean;
  onToggleInspector: () => void;
  dividerRef: React.RefObject<HTMLDivElement | null>;
  startDrag: (e: React.MouseEvent) => void;
  dayLabels: DayLabel[];
  selectedCostLibraryId: string | undefined;
  pushAction: (action: { label: string; undo: () => Promise<void>; redo: () => Promise<void> }) => void;
  utils: any;
  addTaskTrigger?: number;
  jumpToTodayTrigger?: number;
  onWidthNeeded?: (w: number) => void;
  hasManuallyResized?: boolean;
  floatMap?: Map<string, number>;
  zoomScale?: number;
  onZoomScaleChange?: (scale: number) => void;
  onReplicate?: (task: Task) => void;
};

export function Gantt({
  tasks, rootTasks, rangeStart, days, dayWidth, zoom, canWrite, projectId,
  overlayMap, criticalTaskIds, criticalDragMap, rolledUpProgress, successorIds: _successorIds,
  leftPanelWidth, taskListVisible, inspectorVisible, onToggleInspector,
  dividerRef, startDrag, dayLabels,
  selectedCostLibraryId, pushAction, utils,
  addTaskTrigger = 0, jumpToTodayTrigger = 0, onWidthNeeded, hasManuallyResized = false, floatMap,
  zoomScale, onZoomScaleChange, onReplicate,
}: GanttProps) {
  const svgWidth = days * dayWidth + 20;
  const headerHeight = 44;

  const taskMap = useMemo(() => new Map(tasks.map(t => [t.id, t])), [tasks]);

  const flattened = useMemo(() => {
    const result: { task: Task; depth: number }[] = [];
    function walk(list: Task[], depth: number) {
      for (const t of list) {
        result.push({ task: t, depth });
        const children = tasks.filter(ch => ch.parentId === t.id);
        if (children.length > 0) walk(children, depth + 1);
      }
    }
    walk(rootTasks, 0);
    return result;
  }, [rootTasks, tasks]);

  // Lifted expanded state to synchronize TaskList and Timeline
  const [expandedMap, setExpandedMap] = useState<Set<string>>(() => {
    return new Set(flattened.filter(r => r.depth === 0).map(r => r.task.id));
  });

  const visibleRows = useMemo(() => {
    return flattened.filter(r => {
      if (r.depth === 0) return true;
      let parentId = r.task.parentId;
      while (parentId) {
        const parent = flattened.find(f => f.task.id === parentId);
        if (!parent || !expandedMap.has(parentId)) return false;
        parentId = parent.task.parentId;
      }
      return true;
    });
  }, [flattened, expandedMap]);

  const rowHeights = useMemo(() => visibleRows.map(() => 36), [visibleRows]);

  const rowOffsets = useMemo(() => {
    const offsets: number[] = [];
    let current = 0;
    for (const h of rowHeights) {
      offsets.push(current);
      current += h;
    }
    return { offsets, totalHeight: current + 36 };
  }, [rowHeights]);

  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const selectedTask = useMemo(
    () => selectedTaskId ? tasks.find(t => t.id === selectedTaskId) ?? null : null,
    [selectedTaskId, tasks],
  );

  const [hoveredTaskId, setHoveredTaskId] = useState<string | null>(null);

  // Measure container height to fill entire canvas seamlessly
  const mainAreaRef = useRef<HTMLDivElement>(null);
  const [containerHeight, setContainerHeight] = useState(600);

  useEffect(() => {
    if (!mainAreaRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.height > 0) {
          setContainerHeight(entry.contentRect.height);
        }
      }
    });
    observer.observe(mainAreaRef.current);
    return () => observer.disconnect();
  }, []);

  const effectiveTotalHeight = Math.max(rowOffsets.totalHeight, containerHeight - headerHeight);
  const emptyRowsCount = useMemo(() => {
    const remaining = effectiveTotalHeight - rowOffsets.totalHeight;
    if (remaining <= 0) return 0;
    return Math.ceil(remaining / 36);
  }, [effectiveTotalHeight, rowOffsets.totalHeight]);

  const [contextMenuPos, setContextMenuPos] = useState<ContextMenuPosition | null>(null);

  // Mutations for context menu and keyboard shortcuts
  const reorderMutation = trpc.gantt.reorder.useMutation({
    onSuccess: () => {
      utils.gantt.list.invalidate({ projectId });
      toast.success("Hierarchy updated");
    },
    onError: (e) => toast.error(e.message),
  });

  const updateMutation = trpc.gantt.update.useMutation({
    onSuccess: () => utils.gantt.list.invalidate({ projectId }),
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = trpc.gantt.delete.useMutation({
    onSuccess: () => {
      utils.gantt.list.invalidate({ projectId });
      toast.success("Task deleted");
      setSelectedTaskId(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const createMutation = trpc.gantt.create.useMutation({
    onSuccess: (res) => {
      utils.gantt.list.invalidate({ projectId });
      toast.success("Task added");
      if (res?.task?.id) setSelectedTaskId(res.task.id);
    },
    onError: (e) => toast.error(e.message),
  });

  // Action handlers
  const handleIndent = useCallback((task: Task) => {
    reorderMutation.mutate({ projectId, taskId: task.id, direction: "indent" });
  }, [projectId, reorderMutation]);

  const handleOutdent = useCallback((task: Task) => {
    reorderMutation.mutate({ projectId, taskId: task.id, direction: "outdent" });
  }, [projectId, reorderMutation]);

  const handleSetTaskType = useCallback((task: Task, taskType: string | null) => {
    updateMutation.mutate({ taskId: task.id, taskType: taskType || undefined });
    toast.success(`Task type set to ${taskType || "Standard"}`);
  }, [updateMutation]);

  const handleToggleMilestone = useCallback((task: Task) => {
    const isM = !task.isMilestone;
    updateMutation.mutate({ taskId: task.id, isMilestone: isM, duration: isM ? 0 : 1 });
    toast.success(isM ? "Converted to Milestone" : "Converted to Task");
  }, [updateMutation]);

  const handleDelete = useCallback((task: Task) => {
    deleteMutation.mutate({ taskId: task.id });
  }, [deleteMutation]);

  const handleAddTaskBelow = useCallback((task: Task) => {
    const nextStart = new Date(task.endDate);
    const nextEnd = addDays(nextStart, 4);
    createMutation.mutate({
      projectId,
      name: "New Task",
      startDate: format(nextStart, "yyyy-MM-dd"),
      endDate: format(nextEnd, "yyyy-MM-dd"),
      duration: 5,
      parentId: task.parentId || undefined,
    });
  }, [projectId, createMutation]);

  // Context menu trigger
  const handleContextMenu = useCallback((e: React.MouseEvent, task: Task) => {
    setSelectedTaskId(task.id);
    setContextMenuPos({
      x: e.clientX,
      y: e.clientY,
      task,
    });
  }, []);

  // Expand / Collapse Level handlers
  const handleExpandAll = useCallback(() => {
    setExpandedMap(new Set(flattened.map((r) => r.task.id)));
    toast.info("Expanded all tasks");
  }, [flattened]);

  const handleCollapseAll = useCallback(() => {
    setExpandedMap(new Set());
    toast.info("Collapsed all tasks");
  }, []);

  const handleExpandLevel = useCallback((level: number) => {
    setExpandedMap(new Set(flattened.filter((r) => r.depth < level).map((r) => r.task.id)));
    toast.info(`View set to WBS Level ${level}`);
  }, [flattened]);

  // Keyboard navigation & power shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || (e.target as HTMLElement)?.isContentEditable) {
        return;
      }

      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (!selectedTaskId) {
          if (visibleRows.length > 0) setSelectedTaskId(visibleRows[0].task.id);
        } else {
          const curIdx = visibleRows.findIndex((r) => r.task.id === selectedTaskId);
          if (curIdx >= 0 && curIdx < visibleRows.length - 1) {
            setSelectedTaskId(visibleRows[curIdx + 1].task.id);
          }
        }
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (!selectedTaskId) {
          if (visibleRows.length > 0) setSelectedTaskId(visibleRows[visibleRows.length - 1].task.id);
        } else {
          const curIdx = visibleRows.findIndex((r) => r.task.id === selectedTaskId);
          if (curIdx > 0) {
            setSelectedTaskId(visibleRows[curIdx - 1].task.id);
          }
        }
      } else if (e.key === "Tab") {
        e.preventDefault();
        if (selectedTask && canWrite) {
          if (e.shiftKey) {
            handleOutdent(selectedTask);
          } else {
            handleIndent(selectedTask);
          }
        }
      } else if (e.key === " " && selectedTaskId) {
        e.preventDefault();
        onToggleInspector();
      } else if (e.key === "Enter" && selectedTask && canWrite) {
        e.preventDefault();
        handleAddTaskBelow(selectedTask);
      } else if ((e.key === "Delete" || e.key === "Backspace") && selectedTask && canWrite) {
        e.preventDefault();
        if (confirm(`Delete task "${selectedTask.name}"?`)) {
          handleDelete(selectedTask);
        }
      } else if (e.key === "Escape") {
        setSelectedTaskId(null);
        setContextMenuPos(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    selectedTaskId,
    selectedTask,
    visibleRows,
    canWrite,
    onToggleInspector,
    handleIndent,
    handleOutdent,
    handleAddTaskBelow,
    handleDelete,
  ]);

  // Synchronized vertical scroll between the fixed left panel and the scrollable right panel.
  const leftBodyRef = useRef<HTMLDivElement>(null);
  const rightPanelRef = useRef<HTMLDivElement>(null);
  const syncingRef = useRef(false);

  function onRightScroll() {
    if (syncingRef.current) return;
    if (!leftBodyRef.current || !rightPanelRef.current) return;
    syncingRef.current = true;
    leftBodyRef.current.scrollTop = rightPanelRef.current.scrollTop;
    syncingRef.current = false;
  }

  function onLeftScroll() {
    if (syncingRef.current) return;
    if (!leftBodyRef.current || !rightPanelRef.current) return;
    syncingRef.current = true;
    rightPanelRef.current.scrollTop = leftBodyRef.current.scrollTop;
    syncingRef.current = false;
  }

  // Smooth scroll to today when triggered
  useEffect(() => {
    if (!jumpToTodayTrigger || !rightPanelRef.current) return;
    const now = new Date();
    const diff = differenceInDays(now, rangeStart);
    if (diff >= 0 && diff < days) {
      const targetScrollLeft = Math.max(0, diff * dayWidth - rightPanelRef.current.clientWidth / 2);
      rightPanelRef.current.scrollTo({ left: targetScrollLeft, behavior: "smooth" });
    }
  }, [jumpToTodayTrigger, rangeStart, days, dayWidth]);

  function handleWheel(e: React.WheelEvent) {
    if ((e.ctrlKey || e.metaKey) && onZoomScaleChange && zoomScale !== undefined) {
      e.preventDefault();
      const delta = e.deltaY < 0 ? (zoomScale >= 3.0 ? 0.5 : 0.2) : (zoomScale > 3.0 ? -0.5 : -0.2);
      const next = Math.min(10.0, Math.max(0.2, Number((zoomScale + delta).toFixed(2))));
      onZoomScaleChange(next);
    }
  }

  return (
    <div ref={mainAreaRef} className="flex h-full relative">
      {/* ─── Main Gantt area ─────────────────────────────────────── */}
      <div className="flex flex-1 min-w-0 overflow-hidden">

        {/* LEFT PANEL — fixed width, dark slate table pane */}
        {taskListVisible && (
          <div
            className="flex flex-col shrink-0 border-r border-border bg-card z-10"
            style={{ width: leftPanelWidth }}
          >
            {/* Spreadsheet-style activity grid header */}
            <div className="sticky top-0 z-20 shrink-0 flex h-[44px] items-center text-[10px] font-mono font-bold uppercase tracking-wider text-muted-foreground bg-secondary/65 border-b border-border">
              <div className="flex h-full flex-1 items-center">
                <div className="w-[52px] shrink-0 flex items-center justify-center border-r border-border/80 h-full text-primary/80 text-[9px]">
                  WBS
                </div>
                <div className="min-w-[190px] flex-1 flex items-center justify-between px-2 h-full border-r border-border/70">
                  <span>Activity</span>
                  {/* Expand / Collapse and Level controls */}
                  <div className="flex items-center gap-1 normal-case font-sans">
                    <button
                      type="button"
                      onClick={handleExpandAll}
                      title="Expand All (⌘+E)"
                      className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <ChevronsUpDown className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={handleCollapseAll}
                      title="Collapse All"
                      className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <ChevronsDownUp className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleExpandLevel(1)}
                      title="Show WBS Level 1 (Major Deliverables)"
                      className="px-1 py-0.5 text-[9px] font-mono rounded bg-card hover:bg-accent text-muted-foreground transition-colors"
                    >
                      L1
                    </button>
                    <button
                      type="button"
                      onClick={() => handleExpandLevel(2)}
                      title="Show WBS Level 2 (Work Packages)"
                      className="px-1 py-0.5 text-[9px] font-mono rounded bg-card hover:bg-accent text-muted-foreground transition-colors"
                    >
                      L2
                    </button>
                  </div>
                </div>
                <div className="w-[88px] shrink-0 px-2">Start</div>
                <div className="w-[88px] shrink-0 px-2 border-l border-border/70">Finish</div>
                <div className="w-[58px] shrink-0 text-center border-l border-border/70">Days</div>
                <div className="w-[64px] shrink-0 text-center border-l border-border/70">Progress</div>
                <div className="w-[96px] shrink-0 px-2 border-l border-border/70">Responsible</div>
              </div>
            </div>
            {/* Left body — scrolls only vertically */}
            <div
              ref={leftBodyRef}
              className="flex-1 overflow-y-auto overflow-x-hidden relative bg-card"
              onScroll={onLeftScroll}
              style={{ scrollbarWidth: "none" }}
            >
              <TaskList
                flattened={flattened}
                visibleRows={visibleRows}
                rowHeights={rowHeights}
                rowOffsets={rowOffsets}
                expandedMap={expandedMap}
                setExpandedMap={setExpandedMap}
                canWrite={canWrite}
                projectId={projectId}
                selectedTaskId={selectedTaskId}
                onSelectTask={setSelectedTaskId}
                hoveredTaskId={hoveredTaskId}
                onHoverTask={setHoveredTaskId}
                onContextMenu={handleContextMenu}
                rolledUpProgress={rolledUpProgress}
                selectedCostLibraryId={selectedCostLibraryId}
                pushAction={pushAction}
                utils={utils}
                addTaskTrigger={addTaskTrigger}
                leftPanelWidth={leftPanelWidth}
                onWidthNeeded={onWidthNeeded}
                hasManuallyResized={hasManuallyResized}
                emptyRowsCount={emptyRowsCount}
              />
              {/* Drag-to-resize divider with visible grip */}
              <div
                ref={dividerRef}
                onMouseDown={startDrag}
                className="absolute right-0 top-0 bottom-0 w-[6px] cursor-col-resize z-20 flex items-center justify-center group"
              >
                {/* Visual track */}
                <div className="absolute inset-y-0 left-[2px] w-[1px] bg-[var(--navy-mid)] group-hover:bg-primary group-active:bg-primary transition-colors" />
                {/* Centered grip dots */}
                <div className="relative flex flex-col gap-[3px] items-center z-10">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="w-[3px] h-[3px] rounded-full bg-[var(--navy-mid)] group-hover:bg-primary transition-colors" />
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* RIGHT PANEL — lighter distinct background for the timeline canvas */}
        <div
          ref={rightPanelRef}
          className="flex-1 min-w-0 overflow-auto bg-[#f7f1e8] matrix-scrollbar overscroll-none"
          onScroll={onRightScroll}
          onWheel={handleWheel}
        >
          {/* Timeline header — sticky to top */}
          <div className="sticky top-0 z-20 bg-secondary/85 border-b border-border backdrop-blur-xs" style={{ width: svgWidth }}>
            <svg height={headerHeight} width={svgWidth} className="block">
              <TimelineHeader
                dayLabels={dayLabels}
                dayWidth={dayWidth}
                zoom={zoom}
                days={days}
                svgWidth={svgWidth}
                tasks={tasks}
                rangeStart={rangeStart}
              />
            </svg>
          </div>

          {/* Timeline body */}
          <div style={{ width: svgWidth, minHeight: effectiveTotalHeight }}>
            <Timeline
              visibleRows={visibleRows}
              rowHeights={rowHeights}
              rowOffsets={rowOffsets}
              totalHeight={effectiveTotalHeight}
              rangeStart={rangeStart}
              days={days}
              dayWidth={dayWidth}
              dayLabels={dayLabels}
              zoom={zoom}
              tasks={tasks}
              overlayMap={overlayMap}
              criticalTaskIds={criticalTaskIds}
              criticalDragMap={criticalDragMap}
              rolledUpProgress={rolledUpProgress}
              selectedTaskId={selectedTaskId}
              onSelectTask={setSelectedTaskId}
              hoveredTaskId={hoveredTaskId}
              onHoverTask={setHoveredTaskId}
              onContextMenu={handleContextMenu}
              taskMap={taskMap}
              svgWidth={svgWidth}
              floatMap={floatMap}
              emptyRowsCount={emptyRowsCount}
              showSCurve={false}
              showHeatmap={false}
            />
          </div>
        </div>
      </div>

      {/* Right Click Context Menu */}
      <TaskContextMenu
        position={contextMenuPos}
        onClose={() => setContextMenuPos(null)}
        onOpenInspector={(task) => {
          setSelectedTaskId(task.id);
          if (!inspectorVisible) onToggleInspector();
        }}
        onAddTaskBelow={handleAddTaskBelow}
        onAddSubtask={(task) => {
          const subStart = new Date(task.startDate);
          const subDur = Math.max(1, Math.floor(task.duration / 2));
          const subEnd = addDays(subStart, subDur - 1);
          createMutation.mutate({
            projectId,
            name: `Subtask of ${task.name}`,
            startDate: format(subStart, "yyyy-MM-dd"),
            endDate: format(subEnd, "yyyy-MM-dd"),
            duration: subDur,
            parentId: task.id,
          });
        }}
        onIndent={handleIndent}
        onOutdent={handleOutdent}
        onReplicate={(task) => {
          onReplicate?.(task);
        }}
        onSaveTemplate={(task) => {
          setSelectedTaskId(task.id);
          if (!inspectorVisible) onToggleInspector();
          toast.info("Use Save Template in Task Inspector");
        }}
        onSetTaskType={handleSetTaskType}
        onToggleMilestone={handleToggleMilestone}
        onDelete={handleDelete}
        canIndent={canWrite}
        canOutdent={canWrite && !!contextMenuPos?.task.parentId}
        canWrite={canWrite}
      />

      {/* Task Inspector Drawer */}
      {inspectorVisible && selectedTask && (
        <TaskInspector
          task={selectedTask}
          allTasks={tasks}
          canWrite={canWrite}
          projectId={projectId}
          onClose={onToggleInspector}
          utils={utils}
          pushAction={pushAction}
          onReplicate={onReplicate}
        />
      )}
    </div>
  );
}
