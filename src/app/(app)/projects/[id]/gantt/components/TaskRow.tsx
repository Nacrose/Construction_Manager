"use client";

import { useState, useMemo } from "react";
import { format, differenceInDays, addDays } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc-client";
import {
  ChevronRight, Flag, Trash2, CornerDownRight, ChevronsLeft, Package, Link2, GripVertical,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { InlineEdit } from "./InlineEdit";
import { InlineDate } from "./InlineDate";
import { InlineAddRow } from "./InlineAddRow";
import { BoqAttachmentPanel } from "./BoqAttachmentPanel";
import { DependencyPanel } from "./DependencyPanel";
import { useUndoRedo } from "../undo-redo";
import type { Task, Dependency, ZoomLevel } from "../types";
import { getDeps } from "../utils";

export function TaskRow({
  task,
  allTasks,
  depth,
  rangeStart,
  days,
  canWrite,
  projectId,
  overlayMap,
  criticalTaskIds,
  today,
  leftPanelWidth = 420,
  timelineVisible = true,
  selectedCostLibraryId,
  rolledUpProgress,
  successorIds,
  zoom,
  dayWidth,
  forceExpandedIds,
}: {
  task: Task;
  allTasks: Task[];
  depth: number;
  rangeStart: Date;
  days: number;
  canWrite: boolean;
  projectId: string;
  overlayMap?: Map<string, { startDate: string; endDate: string }>;
  criticalTaskIds?: Set<string>;
  today?: Date;
  leftPanelWidth?: number;
  timelineVisible?: boolean;
  selectedCostLibraryId?: string;
  rolledUpProgress?: Map<string, number>;
  successorIds?: Set<string>;
  zoom?: ZoomLevel;
  dayWidth?: number;
  forceExpandedIds?: Set<string>;
}) {
  const utils = trpc.useUtils() as any;
  const [expanded, setExpanded] = useState(true);
  const isExpanded = forceExpandedIds?.has(task.id) ?? expanded;
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [boqPanelOpen, setBoqPanelOpen] = useState(false);
  const [depPanelOpen, setDepPanelOpen] = useState(false);
  const [dropIndicator, setDropIndicator] = useState<"before" | "after" | null>(null);

  const [_dragOverTaskId, _setDragOverTaskId] = useState<string | null>(null);

  const { pushAction } = useUndoRedo();

  const deps: Dependency[] = useMemo(() => getDeps(task), [task]);

  const children = allTasks.filter((t) => t.parentId === task.id);
  const hasChildren = children.length > 0;
  const displayProgress = rolledUpProgress?.get(task.id) ?? task.progress;

  const deleteMutation = trpc.gantt.delete.useMutation({
    onSuccess: () => {
      utils.gantt.list.invalidate({ projectId });
      toast.success("Task deleted");
    },
    onError: (e) => toast.error(e.message),
  });

  const updateMutation = trpc.gantt.update.useMutation({
    onSuccess: () => {
      utils.gantt.list.invalidate({ projectId });
    },
    onError: (e) => toast.error(e.message),
  });

  const reorderMutation = trpc.gantt.reorder.useMutation({
    onSuccess: () => {
      utils.gantt.list.invalidate({ projectId });
    },
    onError: (e) => toast.error(e.message),
  });

  const moveMutation = trpc.gantt.move.useMutation({
    onSuccess: () => {
      utils.gantt.list.invalidate({ projectId });
    },
    onError: (e) => toast.error(e.message),
  });

  const _displayCost = useMemo(() => {
    if (!task.boqLinks || task.boqLinks.length === 0) return task.plannedValue;

    let total = 0;
    for (const link of task.boqLinks) {
      let rate = link.boqItem?.rate || 0;

      // Use ingredients from selected cost library if available
      if (selectedCostLibraryId && link.boqItem?.rateAnalyses?.length) {
        const analysis = link.boqItem.rateAnalyses.find((a) => a.libraryId === selectedCostLibraryId);
        if (analysis && analysis.ingredients?.length) {
          const ingTotal = analysis.ingredients.reduce((s, i) => s + i.amount, 0);
          if (ingTotal > 0) {
            rate = ingTotal;
          }
        }
      } else if (link.boqItem?.ingredients?.length) {
        // Fallback: use first available ingredients
        const ingTotal = link.boqItem.ingredients.reduce((s, i) => s + i.amount, 0);
        if (ingTotal > 0) {
          rate = ingTotal;
        }
      }
      total += rate * link.quantity;
    }
    return total;
  }, [task, selectedCostLibraryId]);

  const start = new Date(task.startDate);
  const end = new Date(task.endDate);
  const offsetDays = Math.max(0, differenceInDays(start, rangeStart));
  const durationDays = Math.max(1, differenceInDays(end, start) + 1);
  const leftPct = (offsetDays / days) * 100;
  const widthPct = Math.min((durationDays / days) * 100, 100 - leftPct);

  const overlayTask = task.code ? overlayMap?.get(task.code) : undefined;
  const overlayBar = useMemo(() => {
    if (!overlayTask) return null;
    const oStart = new Date(overlayTask.startDate);
    const oEnd = new Date(overlayTask.endDate);
    const oOffset = Math.max(0, differenceInDays(oStart, rangeStart));
    const oDuration = Math.max(1, differenceInDays(oEnd, oStart) + 1);
    const oLeftPct = (oOffset / days) * 100;
    const oWidthPct = Math.min((oDuration / days) * 100, 100 - oLeftPct);
    return { leftPct: oLeftPct, widthPct: oWidthPct };
  }, [overlayTask, rangeStart, days]);

  const isCritical = criticalTaskIds?.has(task.id) ?? false;

  return (
    <>
      <div
        className={cn(
          "flex border-b hover:bg-muted/20 group transition-colors",
          dropIndicator === "before" && "border-t-2 border-t-emerald-500",
          dropIndicator === "after" && "border-b-2 border-b-emerald-500",
          canWrite && "hover:border-l-2 hover:border-l-emerald-500",
          "[content-visibility:auto] [contain-intrinsic-size:48px]",
        )}
        draggable={canWrite}
        onDragStart={(e) => {
          e.dataTransfer.setData("text/plain", task.id);
          e.dataTransfer.effectAllowed = "move";
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          const rect = e.currentTarget.getBoundingClientRect();
          const midY = rect.top + rect.height / 2;
          setDropIndicator(e.clientY < midY ? "before" : "after");
        }}
        onDragLeave={() => setDropIndicator(null)}
        onDrop={(e) => {
          e.preventDefault();
          setDropIndicator(null);
          const draggedId = e.dataTransfer.getData("text/plain");
          if (!draggedId || draggedId === task.id) return;
          const draggedTask = allTasks.find(t => t.id === draggedId);
          if (!draggedTask) return;
          const prevParentId = draggedTask.parentId;
          const rect = e.currentTarget.getBoundingClientRect();
          const midY = rect.top + rect.height / 2;
          const position = e.clientY < midY ? "before" : "after";
          moveMutation.mutate({ projectId, taskId: draggedId, targetTaskId: task.id, position }, {
            onSuccess: () => pushAction({
              label: "Move task",
              undo: async () => {
                await utils.gantt.update.mutateAsync({ taskId: draggedId, parentId: prevParentId });
                utils.gantt.list.invalidate({ projectId });
              },
              redo: async () => {
                await utils.gantt.move.mutateAsync({ projectId, taskId: draggedId, targetTaskId: task.id, position });
                utils.gantt.list.invalidate({ projectId });
              },
            }),
          });
        }}
      >
        <div className="shrink-0 overflow-hidden p-2.5" style={{ width: leftPanelWidth, paddingLeft: `${depth * 20 + 10}px` }}>
          <div className="flex items-center gap-1.5">
            {canWrite && (
              <span className="cursor-grab active:cursor-grabbing shrink-0 text-muted-foreground/30 hover:text-muted-foreground/60" title="Drag to reorder">
                <GripVertical className="h-4 w-4" />
              </span>
            )}
            {children.length > 0 ? (
              <button
                onClick={() => { if (!forceExpandedIds?.has(task.id)) setExpanded(!isExpanded); }}
                className="rounded p-0.5 hover:bg-muted shrink-0"
                title={forceExpandedIds?.has(task.id) ? "Search match — expanded" : isExpanded ? "Collapse" : "Expand"}
              >
                <ChevronRight className={cn("h-4 w-4 transition-transform", isExpanded && "rotate-90")} />
              </button>
            ) : (
              <span className="w-5 shrink-0" />
            )}

            {task.isMilestone && (
              <Flag className="h-4 w-4 text-amber-500 shrink-0" />
            )}

            <span
              className="flex h-7 shrink-0 min-w-[34px] items-center justify-center rounded-md bg-emerald-600 px-1.5 font-mono text-xs font-bold text-white shadow-sm dark:bg-emerald-700"
              title="Task number (WBS)"
            >
              {task.code ?? "—"}
            </span>

            <div className="min-w-0 flex-1">
              {canWrite ? (
                <InlineEdit
                  value={task.name}
                  onSave={(v) => {
                    const prev = task.name;
                    updateMutation.mutate({ taskId: task.id, name: v }, {
                      onSuccess: () => pushAction({ label: "Rename task", undo: async () => { await utils.gantt.update.mutateAsync({ taskId: task.id, name: prev }); utils.gantt.list.invalidate({ projectId }); }, redo: async () => { await utils.gantt.update.mutateAsync({ taskId: task.id, name: v }); utils.gantt.list.invalidate({ projectId }); } }),
                    });
                  }}
                  className="w-full"
                />
              ) : (
                <p className="truncate text-sm font-medium">{task.name}</p>
              )}
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                {canWrite ? (
                  <>
                    <InlineDate
                      value={task.startDate}
                      onSave={(v) => {
                        const prev = task.startDate;
                        const prevEnd = task.endDate;
                        const newStart = new Date(v).toISOString();
                        updateMutation.mutate({ taskId: task.id, startDate: newStart, duration: Math.max(1, differenceInDays(new Date(task.endDate), new Date(v)) + 1) }, {
                          onSuccess: () => pushAction({ label: "Change start date", undo: async () => { await utils.gantt.update.mutateAsync({ taskId: task.id, startDate: prev, endDate: prevEnd }); utils.gantt.list.invalidate({ projectId }); }, redo: async () => { await utils.gantt.update.mutateAsync({ taskId: task.id, startDate: newStart, duration: Math.max(1, differenceInDays(new Date(task.endDate), new Date(v)) + 1) }); utils.gantt.list.invalidate({ projectId }); } }),
                        });
                      }}
                    />
                    <span>→</span>
                    <InlineDate
                      value={task.endDate}
                      onSave={(v) => {
                        const prev = task.endDate;
                        const prevStart = task.startDate;
                        const newEnd = new Date(v).toISOString();
                        updateMutation.mutate({ taskId: task.id, endDate: newEnd, duration: Math.max(1, differenceInDays(new Date(v), new Date(task.startDate)) + 1) }, {
                          onSuccess: () => pushAction({ label: "Change end date", undo: async () => { await utils.gantt.update.mutateAsync({ taskId: task.id, endDate: prev, startDate: prevStart }); utils.gantt.list.invalidate({ projectId }); }, redo: async () => { await utils.gantt.update.mutateAsync({ taskId: task.id, endDate: newEnd, duration: Math.max(1, differenceInDays(new Date(v), new Date(task.startDate)) + 1) }); utils.gantt.list.invalidate({ projectId }); } }),
                        });
                      }}
                    />
                  </>
                ) : (
                  <span>{format(start, "dd MMM")} → {format(end, "dd MMM")}</span>
                )}
              </div>
              {/* Actual dates */}
              {(canWrite || task.actualStartDate || task.actualEndDate) && (
                <div className="flex items-center gap-1 text-[11px] text-muted-foreground/70">
                  <span className="font-medium">Actual:</span>
                  {canWrite ? (
                    <>
                      <InlineDate
                        value={task.actualStartDate ?? ""}
                        onSave={(v) => updateMutation.mutate({ taskId: task.id, actualStartDate: v || null })}
                        className="h-5 text-[11px]"
                      />
                      <span>→</span>
                      <InlineDate
                        value={task.actualEndDate ?? ""}
                        onSave={(v) => updateMutation.mutate({ taskId: task.id, actualEndDate: v || null })}
                        className="h-5 text-[11px]"
                      />
                    </>
                  ) : (
                    <span>
                      {task.actualStartDate ? format(new Date(task.actualStartDate), "dd MMM") : "—"} → {task.actualEndDate ? format(new Date(task.actualEndDate), "dd MMM") : "—"}
                    </span>
                  )}
                </div>
              )}
            </div>

            <div className="w-20 shrink-0 text-center" title={`Progress ${hasChildren ? "(rolled-up)" : ""}  ${displayProgress}%`}>
              {canWrite ? (
                <InlineEdit
                  value={String(task.progress)}
                  type="number"
                  onSave={(v) => {
                    const prev = task.progress;
                    const newVal = Math.max(0, Math.min(100, parseFloat(v) || 0));
                    updateMutation.mutate({ taskId: task.id, progress: newVal }, {
                      onSuccess: () => pushAction({ label: "Change progress", undo: async () => { await utils.gantt.update.mutateAsync({ taskId: task.id, progress: prev }); utils.gantt.list.invalidate({ projectId }); }, redo: async () => { await utils.gantt.update.mutateAsync({ taskId: task.id, progress: newVal }); utils.gantt.list.invalidate({ projectId }); } }),
                    });
                  }}
                  className="w-10 text-center"
                />
              ) : (
                <div className="flex items-center justify-center gap-1">
                  <div className="h-1.5 w-8 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${displayProgress}%` }} />
                  </div>
                  <span className="text-xs text-muted-foreground">{displayProgress}%</span>
                  {task.isProgressEdited && task.baseProgress != null && task.baseProgress !== displayProgress && (
                    <span className={cn(
                      "text-[10px] font-medium",
                      displayProgress > task.baseProgress ? "text-emerald-500" : "text-red-500"
                    )}>
                      {displayProgress > task.baseProgress ? "+" : ""}{displayProgress - task.baseProgress}%
                    </span>
                  )}
                  {hasChildren && !rolledUpProgress && (
                    <span className="text-[10px] text-muted-foreground/50">↳</span>
                  )}
                </div>
              )}
            </div>

            {canWrite && (
              <div className="grid w-14 shrink-0 grid-cols-2 gap-1 text-muted-foreground/50">
                <button
                  onClick={() => {
                    const prevParentId = task.parentId;
                    reorderMutation.mutate({ projectId, taskId: task.id, direction: "indent" }, {
                      onSuccess: () => pushAction({ label: "Indent task", undo: async () => { await utils.gantt.update.mutateAsync({ taskId: task.id, parentId: prevParentId }); utils.gantt.list.invalidate({ projectId }); }, redo: async () => { await utils.gantt.reorder.mutateAsync({ projectId, taskId: task.id, direction: "indent" }); utils.gantt.list.invalidate({ projectId }); } }),
                    });
                  }}
                  className="rounded p-1 hover:bg-emerald-100 hover:text-emerald-700 dark:hover:bg-emerald-950"
                  title="Indent (make child of above task)"
                >
                  <CornerDownRight className="h-4 w-4 mx-auto" />
                </button>
                <button
                  onClick={() => {
                    const prevParentId = task.parentId;
                    reorderMutation.mutate({ projectId, taskId: task.id, direction: "outdent" }, {
                      onSuccess: () => pushAction({ label: "Outdent task", undo: async () => { await utils.gantt.update.mutateAsync({ taskId: task.id, parentId: prevParentId }); utils.gantt.list.invalidate({ projectId }); }, redo: async () => { await utils.gantt.reorder.mutateAsync({ projectId, taskId: task.id, direction: "outdent" }); utils.gantt.list.invalidate({ projectId }); } }),
                    });
                  }}
                  className="rounded p-1 hover:bg-emerald-100 hover:text-emerald-700 dark:hover:bg-emerald-950"
                  title="Outdent (move up a level)"
                >
                  <ChevronsLeft className="h-4 w-4 mx-auto" />
                </button>
                <button
                  onClick={() => setBoqPanelOpen(!boqPanelOpen)}
                  className={cn(
                    "relative rounded p-1",
                    boqPanelOpen
                      ? "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                      : "hover:bg-blue-100 hover:text-blue-700 dark:hover:bg-blue-950",
                  )}
                  title="BOQ items"
                >
                  <Package className="h-4 w-4 mx-auto" />
                  {task.boqLinks.length > 0 && (
                    <span className="absolute -right-1 -top-1 flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-blue-600 px-0.5 text-[8px] font-bold text-white">
                      {task.boqLinks.length}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => setDepPanelOpen(!depPanelOpen)}
                  className={cn(
                    "relative rounded p-1",
                    depPanelOpen
                      ? "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300"
                      : "hover:bg-purple-100 hover:text-purple-700 dark:hover:bg-purple-950",
                  )}
                  title="Dependencies"
                >
                  <Link2 className="h-4 w-4 mx-auto" />
                  {deps.length > 0 && (
                    <span className="absolute -right-1 -top-1 flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-purple-600 px-0.5 text-[8px] font-bold text-white">
                      {deps.length}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => setDeleteOpen(true)}
                  className="rounded p-1 hover:bg-destructive/10 hover:text-destructive"
                  title="Delete"
                >
                  <Trash2 className="h-4 w-4 mx-auto" />
                </button>
              </div>
            )}
          </div>
        </div>

        {timelineVisible && (
        <div className="relative flex-1 min-w-0">
          <div className="absolute inset-0 flex pointer-events-none">
            {Array.from({ length: days }).map((_, i) => {
              const d = addDays(rangeStart, i);
              const isWeekend = d.getDay() === 6; // Nepal: Saturday is weekend
              return (
                <div key={i} className={cn("flex-1 border-l", isWeekend && "bg-blue-50/40 dark:bg-blue-950/15")} />
              );
            })}
            {today && (() => {
              const todayOffset = differenceInDays(today, rangeStart);
              if (todayOffset < 0 || todayOffset >= days) return null;
              return (
                <div
                  className="absolute inset-y-0 w-px bg-red-400/60 z-20 pointer-events-none"
                  style={{ left: `${(todayOffset / days) * 100}%` }}
                />
              );
            })()}
          </div>
          {overlayBar && (
            <div
              className="absolute top-1 bottom-1 rounded-md border-2 border-dashed border-orange-400/60 bg-orange-200/20 dark:bg-orange-900/10"
              style={{ left: `${overlayBar.leftPct}%`, width: `${overlayBar.widthPct}%` }}
              title="Baseline schedule"
            />
          )}
          <div className="group relative">
            {/* Tooltip */}
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 hidden group-hover:block pointer-events-none">
              <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md whitespace-nowrap">
                <div className="font-semibold">{task.code && `${task.code} — `}{task.name}</div>
                <div className="text-muted-foreground mt-1">
                  {format(start, "dd MMM")} → {format(end, "dd MMM")} · {durationDays}d · {displayProgress}%
                </div>
                {task.actualStartDate && (
                  <div className="text-muted-foreground">
                    Actual: {format(new Date(task.actualStartDate), "dd MMM")} → {task.actualEndDate ? format(new Date(task.actualEndDate), "dd MMM") : "—"}
                  </div>
                )}
                <div className="text-muted-foreground">
                  {deps.length > 0 && `${deps.length} predecessor${deps.length > 1 ? "s" : ""} · `}
                  Cost: {(task.boqLinks?.reduce((s, l) => s + (l.boqItem?.rate || 0) * l.quantity, 0) || task.plannedValue).toLocaleString()}
                </div>
                {hasChildren && <div className="text-muted-foreground">{children.length} subtask{children.length > 1 ? "s" : ""}</div>}
              </div>
            </div>
            {/* Dependency edge indicators */}
            {deps.length > 0 && (
            <div
              className="absolute top-0 bottom-0 z-10 w-2 flex items-center justify-center pointer-events-none"
              style={{ left: `${leftPct}%`, marginLeft: "-4px" }}
            >
              <span className="h-2 w-2 rounded-full bg-white/70 border border-purple-400" title={`${deps.length} predecessor${deps.length > 1 ? "s" : ""}`} />
            </div>
          )}
          {successorIds?.has(task.id) && (
            <div
              className="absolute top-0 bottom-0 z-10 w-2 flex items-center justify-center pointer-events-none"
              style={{ left: `${leftPct + widthPct}%`, marginLeft: "-4px" }}
            >
              <span className="h-0 w-0 border-l-[5px] border-l-purple-400 border-t-[4px] border-t-transparent border-b-[4px] border-b-transparent" title="Has successors" />
            </div>
          )}
          <div
            className={cn(
              "absolute top-1.5 bottom-1.5 rounded-md flex items-center px-2 transition-all",
              task.isMilestone
                ? "bg-amber-500"
                : isCritical
                ? "bg-gradient-to-r from-red-500 to-red-400"
                : displayProgress >= 100
                ? "bg-gradient-to-r from-emerald-600 to-emerald-500"
                : "bg-gradient-to-r from-emerald-500 to-emerald-400",
            )}
            style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
          >
            {displayProgress > 0 && !task.isMilestone && (
              <div
                className="absolute left-0 top-0 bottom-0 rounded-l-md bg-black/15 transition-all duration-500"
                style={{ width: `${displayProgress}%` }}
              />
            )}
            <span className="relative z-10 flex items-center gap-1 truncate text-[11px] font-medium text-white drop-shadow-sm">
              {task.isMilestone ? (
                <span>◆ {task.code}</span>
              ) : (
                <>
                  {task.code && <span className="opacity-90">{task.code}</span>}
                  <span className="opacity-75">·</span>
                  <span>{displayProgress}%</span>
                  {deps.length > 0 && <span className="opacity-75">· 🔗{deps.length}</span>}
                  {hasChildren && <span className="opacity-50">↳</span>}
                </>
              )}
            </span>
          </div>
        </div>
        </div>
      )}
      </div>

      {boqPanelOpen && (
        <BoqAttachmentPanel task={task} projectId={projectId} canWrite={canWrite} />
      )}

      {depPanelOpen && (
        <DependencyPanel task={task} allTasks={allTasks} canWrite={canWrite} deps={deps} projectId={projectId} />
      )}

      {isExpanded &&
        children.map((child) => (
          <TaskRow
            key={child.id}
            task={child}
            allTasks={allTasks}
            depth={depth + 1}
            rangeStart={rangeStart}
            days={days}
            canWrite={canWrite}
            projectId={projectId}
            overlayMap={overlayMap}
            criticalTaskIds={criticalTaskIds}
            today={today}
            leftPanelWidth={leftPanelWidth}
            timelineVisible={timelineVisible}
            selectedCostLibraryId={selectedCostLibraryId}
            rolledUpProgress={rolledUpProgress}
            successorIds={successorIds}
            zoom={zoom}
            dayWidth={dayWidth}
            forceExpandedIds={forceExpandedIds}
          />
        ))}

      {isExpanded && canWrite && (
        <InlineAddRow
          projectId={projectId}
          parentId={task.id}
          existingCount={children.length}
          depth={depth + 1}
        />
      )}

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this task?</AlertDialogTitle>
            <AlertDialogDescription>
              {task.name}{children.length > 0 && ` and ${children.length} subtask${children.length > 1 ? "s" : ""}.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                const deletedTask = task;
                const _deletedChildren = children.map(c => c.id);
                deleteMutation.mutate({ taskId: task.id }, {
                  onSuccess: () => {
                    pushAction({
                      label: "Delete task",
                      undo: async () => {
                        await utils.gantt.create.mutateAsync({
                          projectId, name: deletedTask.name, parentId: deletedTask.parentId,
                          startDate: deletedTask.startDate, endDate: deletedTask.endDate,
                          duration: deletedTask.duration, progress: deletedTask.progress,
                          plannedValue: deletedTask.plannedValue, laborCount: deletedTask.laborCount,
                          isMilestone: deletedTask.isMilestone, sortOrder: deletedTask.sortOrder,
                        });
                        utils.gantt.list.invalidate({ projectId });
                      },
                      redo: async () => {
                        await utils.gantt.delete.mutateAsync({ taskId: deletedTask.id });
                        utils.gantt.list.invalidate({ projectId });
                      },
                    });
                  },
                });
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
