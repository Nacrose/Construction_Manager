"use client";

import { useState, useMemo } from "react";
import { format, differenceInDays } from "date-fns";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc-client";
import { X, Link2, Trash2, Loader2, FileQuestion, Users, Wrench, Info, Plus, Sparkles, Copy } from "lucide-react";
import {
  Dialog,
  DialogTrigger,
} from "@/components/ui/dialog";
import { CreateRfiDialog } from "@/components/workflow/create-rfi-dialog";
import type { Task } from "../../gantt/types";
import { getDeps } from "../../gantt/utils";
import { InlineEdit } from "../../gantt/components/InlineEdit";
import { InlineDate } from "../../gantt/components/InlineDate";
import { SearchSelect, type SearchItem } from "./SearchSelect";

type TaskInspectorProps = {
  task: Task;
  allTasks: Task[];
  canWrite: boolean;
  projectId: string;
  onClose: () => void;
  utils: any;
  pushAction: (action: { label: string; undo: () => Promise<void>; redo: () => Promise<void> }) => void;
  onReplicate?: (task: Task) => void;
};

export function TaskInspector({ task, allTasks, canWrite, projectId, onClose, utils, pushAction: _pushAction, onReplicate }: TaskInspectorProps) {
  const updateMutation = trpc.gantt.update.useMutation({
    onSuccess: () => utils.gantt.list.invalidate({ projectId }),
    onError: (e) => toast.error(e.message),
  });
  const addDepMutation = trpc.gantt.addDependency.useMutation({
    onSuccess: (res) => {
      utils.gantt.list.invalidate({ projectId });
      if (res.updatedCount > 0) {
        toast.success(`Dependency added — ${res.updatedCount} downstream task${res.updatedCount > 1 ? "s" : ""} rescheduled`);
      } else {
        toast.success("Dependency added");
      }
    },
    onError: (e) => toast.error(e.message),
  });
  const removeDepMutation = trpc.gantt.removeDependency.useMutation({
    onSuccess: (res) => {
      utils.gantt.list.invalidate({ projectId });
      if (res.updatedCount > 0) {
        toast.success(`Dependency removed — ${res.updatedCount} downstream task${res.updatedCount > 1 ? "s" : ""} rescheduled`);
      } else {
        toast.success("Dependency removed");
      }
    },
    onError: (e) => toast.error(e.message),
  });
  const setDepsMutation = trpc.gantt.setDependencies.useMutation({
    onSuccess: (res) => {
      utils.gantt.list.invalidate({ projectId });
      if (res.updatedCount > 0) {
        toast.success(`Dependencies applied — ${res.updatedCount} downstream task${res.updatedCount > 1 ? "s" : ""} rescheduled`);
      } else {
        toast.success("Dependencies applied");
      }
    },
    onError: (e) => toast.error(e.message),
  });
  const addLinkMutation = trpc.gantt.linkBoq.useMutation({
    onSuccess: () => { utils.gantt.list.invalidate({ projectId }); toast.success("BOQ item attached"); },
    onError: (e) => toast.error(e.message),
  });
  const removeLinkMutation = trpc.gantt.unlinkBoq.useMutation({
    onSuccess: () => { utils.gantt.list.invalidate({ projectId }); toast.success("BOQ item removed"); },
    onError: (e) => toast.error(e.message),
  });
  const deleteMutation = trpc.gantt.delete.useMutation({
    onSuccess: () => { utils.gantt.list.invalidate({ projectId }); toast.success("Task deleted"); onClose(); },
    onError: (e) => toast.error(e.message),
  });
  const reorderMutation = trpc.gantt.reorder.useMutation({
    onSuccess: () => { utils.gantt.list.invalidate({ projectId }); toast.success("Hierarchy updated"); },
    onError: (e) => toast.error(e.message),
  });
  const createSubtaskMutation = trpc.gantt.create.useMutation({
    onSuccess: () => { utils.gantt.list.invalidate({ projectId }); toast.success("Subtask created"); },
    onError: (e) => toast.error(e.message),
  });

  // Resource assignment queries + mutations
  const { data: taskAssignments } = trpc.resourceAssignment.list.useQuery({ taskId: task.id });
  const { data: rolesData } = trpc.staffRole.list.useQuery({ projectId });
  const { data: staffData } = trpc.hr.list.useQuery({ projectId, tab: "staff" });

  const assignRoleMutation = trpc.resourceAssignment.assignRole.useMutation({
    onSuccess: () => {
      utils.resourceAssignment.list.invalidate({ taskId: task.id });
      toast.success("Role assigned to task");
    },
    onError: (e) => toast.error(e.message),
  });

  const assignStaffMutation = trpc.resourceAssignment.assignStaff.useMutation({
    onSuccess: () => {
      utils.resourceAssignment.list.invalidate({ taskId: task.id });
      toast.success("Staff assigned to task");
    },
    onError: (e) => toast.error(e.message),
  });

  const removeAssignmentMutation = trpc.resourceAssignment.remove.useMutation({
    onSuccess: () => {
      utils.resourceAssignment.list.invalidate({ taskId: task.id });
      toast.success("Resource removed");
    },
    onError: (e) => toast.error(e.message),
  });

  const { data: boqData } = trpc.boq.list.useQuery({ projectId });

  const deps = useMemo(() => getDeps(task), [task]);
  const _hasChildren = allTasks.some(t => t.parentId === task.id);
  const pct = task.progress;
  const start = new Date(task.startDate);
  const end = new Date(task.endDate);
  const duration = differenceInDays(end, start) + 1;

  const [depPredecessorId, setDepPredecessorId] = useState("");
  const [depType, setDepType] = useState<"FS" | "SS" | "FF" | "SF">("FS");
  const [depOffset, setDepOffset] = useState("0");
  const [boqItemId, setBoqItemId] = useState("");
  const [boqQty, setBoqQty] = useState("1");
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);
  const [templateNameInput, setTemplateNameInput] = useState(task.name);

  const saveTemplateMutation = trpc.gantt.saveAsTemplate.useMutation({
    onSuccess: () => {
      toast.success("Saved as Work Package Template!");
      setIsSavingTemplate(false);
      utils.gantt.listTemplates.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [rfiDialogOpen, setRfiDialogOpen] = useState(false);
  const [advQty, setAdvQty] = useState("");
  const [advRate, setAdvRate] = useState("");

  const handleStartChange = (v: string) => {
    const newStart = new Date(v);
    const newEnd = new Date(newStart.getTime() + (duration - 1) * 86400000);
    updateMutation.mutate({
      taskId: task.id, startDate: newStart.toISOString(),
      endDate: newEnd.toISOString(),
    });
  };

  const handleDurationChange = (v: string) => {
    const d = Math.max(1, parseInt(v) || 1);
    const newEnd = new Date(start.getTime() + (d - 1) * 86400000);
    updateMutation.mutate({
      taskId: task.id, duration: d,
      endDate: newEnd.toISOString(),
    });
  };

  const handleEndChange = (v: string) => {
    const newEnd = new Date(v);
    const d = Math.max(1, differenceInDays(newEnd, start) + 1);
    updateMutation.mutate({
      taskId: task.id, endDate: newEnd.toISOString(), duration: d,
    });
  };

  const addDep = () => {
    if (!depPredecessorId) return;
    addDepMutation.mutate({
      taskId: task.id,
      predecessorId: depPredecessorId,
      type: depType,
      offset: parseInt(depOffset) || 0,
    });
  };

  const removeDep = (predecessorId: string) => {
    removeDepMutation.mutate({ taskId: task.id, predecessorId });
  };

  const addBoq = () => {
    if (!boqItemId) return;
    addLinkMutation.mutate({ taskId: task.id, boqItemId, quantity: parseFloat(boqQty) || 0 });
  };

  const removeBoq = (linkId: string) => {
    removeLinkMutation.mutate({ taskId: task.id, linkId });
  };

  const boqItems: SearchItem[] = useMemo(() => {
    if (!boqData?.items) return [];
    return boqData.items
      .filter((b: any) => !task.boqLinks.some((l) => l.boqItemId === b.id))
      .map((b: any) => ({
        value: b.id,
        label: `${b.code} — ${b.description} (${b.unit}, NPR ${b.rate.toLocaleString("en-IN")})`,
        search: `${b.code} ${b.description} ${b.unit}`,
      }));
  }, [boqData, task.boqLinks]);

  const availableTasks: SearchItem[] = useMemo(() => {
    return allTasks
      .filter(t => t.id !== task.id && !deps.some(d => d.taskId === t.id))
      .map(t => ({
        value: t.id,
        label: `${t.code ?? "?"} — ${t.name}`,
        search: `${t.code ?? ""} ${t.name}`,
      }));
  }, [allTasks, task.id, deps]);

  const totalBoqValue = task.boqLinks.reduce((s, l) => s + l.boqItem.rate * l.quantity, 0);

  const isDescendant = (candidateId: string, currentId: string): boolean => {
    let curr = allTasks.find(t => t.id === candidateId);
    while (curr?.parentId) {
      if (curr.parentId === currentId) return true;
      curr = allTasks.find(t => t.id === curr?.parentId);
    }
    return false;
  };

  return (
    <div className="w-[240px] shrink-0 border-l border-border/80 bg-[var(--navy-deep)]/95 backdrop-blur-md flex flex-col font-mono z-20 shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/60 px-2.5 py-1.5 bg-[var(--navy-mid)]/80">
        <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1">
          <Info className="h-3 w-3" />
          Task Inspector
        </span>
        <button onClick={onClose} className="rounded p-0.5 text-muted-foreground hover:text-foreground hover:bg-muted/40 cursor-pointer">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto space-y-2.5 p-2 text-xs matrix-scrollbar">
        {/* Name + WBS */}
        <div className="space-y-0.5">
          {task.code && (
            <span className="text-[9px] font-mono text-emerald-400/90 bg-emerald-950/60 border border-emerald-800/50 rounded px-1 py-0.2">
              [{task.code}]
            </span>
          )}
          <div>
            {canWrite ? (
              <InlineEdit
                value={task.name}
                onSave={(v) => updateMutation.mutate({ taskId: task.id, name: v })}
                className="text-xs font-semibold leading-tight text-foreground"
              />
            ) : (
              <p className="text-xs font-semibold leading-tight text-foreground">{task.name}</p>
            )}
          </div>
        </div>

        {/* Hierarchy & Parent Task */}
        <div className="space-y-1 rounded border border-border/60 bg-muted/20 p-1.5">
          <div className="flex items-center justify-between text-[8.5px] font-semibold text-muted-foreground uppercase tracking-wider">
            <span>Hierarchy</span>
            {canWrite && (
              <div className="flex items-center gap-1">
                {task.parentId && (
                  <button
                    onClick={() => reorderMutation.mutate({ projectId, taskId: task.id, direction: "outdent" })}
                    disabled={reorderMutation.isPending}
                    title="Outdent (Move up 1 level)"
                    className="rounded px-1 py-0.2 bg-[var(--navy-mid)] border border-border hover:border-emerald-500 text-muted-foreground hover:text-emerald-400 text-[8px] font-mono cursor-pointer"
                  >
                    ← Outdent
                  </button>
                )}
                <button
                  onClick={() => reorderMutation.mutate({ projectId, taskId: task.id, direction: "indent" })}
                  disabled={reorderMutation.isPending}
                  title="Indent (Nest under previous task)"
                  className="rounded px-1 py-0.2 bg-[var(--navy-mid)] border border-border hover:border-emerald-500 text-muted-foreground hover:text-emerald-400 text-[8px] font-mono cursor-pointer"
                >
                  Indent →
                </button>
              </div>
            )}
          </div>

          {canWrite ? (
            <select
              value={task.parentId || ""}
              onChange={(e) => {
                const pId = e.target.value || null;
                updateMutation.mutate({ taskId: task.id, parentId: pId });
              }}
              className="w-full h-5 rounded border border-border/60 bg-background/90 px-1 text-[9px] font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500 truncate"
            >
              <option value="">(None - Root Task)</option>
              {allTasks
                .filter((t) => t.id !== task.id && !isDescendant(t.id, task.id))
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.code ? `[${t.code}] ` : ""}{t.name}
                  </option>
                ))}
            </select>
          ) : (
            <div className="text-[9px] font-mono text-muted-foreground truncate">
              {task.parentId
                ? (allTasks.find(t => t.id === task.parentId)?.name ?? "Parent task")
                : "(Root Task)"}
            </div>
          )}

          {canWrite && (
            <button
              onClick={() => {
                createSubtaskMutation.mutate({
                  projectId,
                  parentId: task.id,
                  name: `Subtask under ${task.name.slice(0, 18)}`,
                  startDate: task.startDate,
                  endDate: task.endDate,
                  duration: Math.max(1, Math.floor(duration / 2)),
                });
              }}
              className="w-full h-5 flex items-center justify-center gap-1 rounded bg-emerald-950/40 border border-emerald-800/40 hover:bg-emerald-900/50 text-emerald-300 text-[8.5px] font-mono font-medium transition-colors cursor-pointer mt-1"
            >
              <Plus className="h-2.5 w-2.5" /> + Add Subtask Here
            </button>
          )}
        </div>

        {/* Schedule (1 Row: Start | Duration | End) */}
        <div>
          <h4 className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Schedule</h4>
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-1 rounded border border-border/60 bg-muted/20 p-1">
            {/* Start */}
            <div className="flex flex-col min-w-0">
              <span className="text-[8px] text-muted-foreground uppercase font-mono px-0.5">Start</span>
              {canWrite ? (
                <InlineDate value={task.startDate} onSave={handleStartChange} className="h-5 px-0.5 text-[10px] font-mono font-medium truncate" />
              ) : (
                <span className="px-0.5 text-[10px] font-mono truncate">{format(start, "dd MMM")}</span>
              )}
            </div>

            {/* Duration (Days) */}
            <div className="flex flex-col items-center px-1 border-x border-border/40 shrink-0">
              <span className="text-[8px] text-muted-foreground uppercase font-mono">Days</span>
              {canWrite ? (
                <input
                  type="number"
                  value={duration}
                  className="h-5 w-10 rounded border bg-background/90 px-0.5 text-[10px] text-center font-mono font-bold text-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  onChange={(e) => {
                    const v = parseInt(e.target.value);
                    if (v && v > 0) handleDurationChange(String(v));
                  }}
                  onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                />
              ) : (
                <span className="text-[10px] font-mono font-bold text-emerald-400">{duration}d</span>
              )}
            </div>

            {/* End */}
            <div className="flex flex-col min-w-0 text-right">
              <span className="text-[8px] text-muted-foreground uppercase font-mono px-0.5">End</span>
              {canWrite ? (
                <InlineDate value={task.endDate} onSave={handleEndChange} className="h-5 px-0.5 text-[10px] font-mono font-medium truncate text-right" />
              ) : (
                <span className="px-0.5 text-[10px] font-mono truncate">{format(end, "dd MMM")}</span>
              )}
            </div>
          </div>

          {/* Inline Progress slider */}
          <div className="flex items-center gap-1.5 pt-1 px-0.5">
            <span className="text-[8px] text-muted-foreground uppercase tracking-wider font-mono shrink-0">Prog</span>
            <input
              type="range"
              min={0}
              max={100}
              value={pct}
              onChange={(e) => {
                if (!canWrite) return;
                updateMutation.mutate({ taskId: task.id, progress: parseInt(e.target.value) });
              }}
              className="flex-1 h-1 rounded-full appearance-none bg-muted cursor-pointer
                [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:w-2.5
                [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-emerald-500
                [&::-webkit-slider-thumb]:cursor-pointer"
            />
            <span className="text-[9px] font-mono font-bold text-emerald-400 shrink-0 w-7 text-right">{pct}%</span>
          </div>
        </div>

        {/* Work Calendar & Advance Rate Modeling */}
        <div className="space-y-1.5 rounded border border-border/80 bg-[var(--navy-mid)]/40 p-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[8.5px] font-bold text-info uppercase tracking-wider flex items-center gap-1 font-mono">
              ⚡ Shift Calendar & Model
            </span>
            {task.taskType === "24_7_shift" && (
              <span className="px-1 py-0.2 rounded bg-cyan-950/80 border border-info/40 text-[8px] text-info font-bold">24/7</span>
            )}
            {task.taskType === "buffer" && (
              <span className="px-1 py-0.2 rounded bg-amber-950/80 border border-amber-800/60 text-[8px] text-amber-300 font-bold">Buffer</span>
            )}
          </div>

          {/* Calendar Shift Selector */}
          <div className="flex items-center gap-1">
            <span className="text-[8px] text-muted-foreground/80 font-mono shrink-0">Calendar:</span>
            {canWrite ? (
              <select
                value={task.taskType || "fixed_duration"}
                onChange={(e) => {
                  const val = e.target.value;
                  updateMutation.mutate({
                    taskId: task.id,
                    taskType: val,
                    ignoreResourceCalendar: val === "24_7_shift",
                  });
                }}
                className="flex-1 h-5 text-[9px] font-mono bg-[var(--navy-deep)]/90 border border-border rounded px-1 text-foreground focus:border-cyan-500 focus:outline-none"
              >
                <option value="fixed_duration">Standard (6d/wk, 8h)</option>
                <option value="24_7_shift">24/7 Continuous (3 Shifts)</option>
                <option value="elapsed">7d Elapsed Time (Curing)</option>
                <option value="buffer">Risk Buffer (Float Reserve)</option>
              </select>
            ) : (
              <span className="text-[9px] font-mono text-muted-foreground">
                {task.taskType === "24_7_shift" ? "24/7 Continuous" : task.taskType === "buffer" ? "Risk Buffer" : "Standard"}
              </span>
            )}
          </div>

          {/* Linear Advance Rate Calculator */}
          {canWrite && (
            <div className="pt-1 border-t border-border/60 space-y-1">
              <span className="text-[8px] text-muted-foreground/80 uppercase font-mono block">Linear Advance Rate (m/day):</span>
              <div className="grid grid-cols-2 gap-1">
                <input
                  type="number"
                  placeholder="Total Qty (m)"
                  value={advQty}
                  onChange={(e) => setAdvQty(e.target.value)}
                  className="h-5 text-[9px] font-mono bg-[var(--navy-deep)] border border-border rounded px-1 text-foreground text-center"
                />
                <input
                  type="number"
                  placeholder="Rate (m/day)"
                  value={advRate}
                  onChange={(e) => setAdvRate(e.target.value)}
                  className="h-5 text-[9px] font-mono bg-[var(--navy-deep)] border border-border rounded px-1 text-foreground text-center"
                />
              </div>
              <button
                onClick={() => {
                  const q = parseFloat(advQty);
                  const r = parseFloat(advRate);
                  if (q > 0 && r > 0) {
                    const daysCalc = Math.ceil(q / r);
                    handleDurationChange(String(daysCalc));
                    toast.success(`Calculated duration: ${daysCalc} days (${q}m @ ${r}m/d)`);
                  }
                }}
                disabled={!advQty || !advRate}
                className="w-full h-4.5 flex items-center justify-center rounded bg-cyan-950/50 border border-info/40 hover:bg-cyan-900/60 text-info text-[8px] font-mono disabled:opacity-40 transition-colors cursor-pointer"
              >
                Apply Advance Rate ➔ Days
              </button>
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="border-t border-border/40" />

        {/* BOQ Links */}
        <div>
          <h4 className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
            BOQ Links {task.boqLinks.length > 0 && <span className="text-muted-foreground/60">({task.boqLinks.length})</span>}
          </h4>
          {task.boqLinks.length > 0 && (
            <div className="space-y-1 mb-1.5">
              {task.boqLinks.map((link) => (
                <div key={link.id} className="flex items-center gap-1 rounded bg-muted/30 px-1 py-0.5 text-[10px]">
                  <span className="font-mono text-[9px] text-muted-foreground/70 shrink-0">{link.boqItem.code}</span>
                  <span className="truncate flex-1 text-[9px]">{link.boqItem.description}</span>
                  <span className="text-[9px] font-medium shrink-0">{link.quantity} {link.boqItem.unit}</span>
                  {canWrite && (
                    <button onClick={() => removeBoq(link.id)}
                      className="rounded p-0.5 text-muted-foreground hover:text-destructive shrink-0">
                      <X className="h-2.5 w-2.5" />
                    </button>
                  )}
                </div>
              ))}
              {totalBoqValue > 0 && (
                <div className="text-right text-[9px] text-muted-foreground">
                  Total: <span className="font-semibold text-foreground">NPR {totalBoqValue.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</span>
                </div>
              )}
            </div>
          )}
          {canWrite && boqItems.length > 0 && (
            <div className="flex items-center gap-1">
              <div className="flex-1 min-w-0">
                <SearchSelect
                  items={boqItems}
                  placeholder="BOQ items..."
                  selected={boqItemId}
                  onSelect={setBoqItemId}
                  className="h-6 text-[10px]"
                />
              </div>
              <input
                type="number"
                value={boqQty}
                onChange={(e) => setBoqQty(e.target.value)}
                className="h-6 w-11 rounded border bg-background px-1 text-[10px] text-center"
                placeholder="Qty"
              />
              <button onClick={addBoq} disabled={!boqItemId || addLinkMutation.isPending}
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-emerald-600 text-white disabled:opacity-40 hover:bg-emerald-700">
                {addLinkMutation.isPending ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <span className="text-xs font-bold">+</span>}
              </button>
            </div>
          )}
          {task.boqLinks.length === 0 && !canWrite && (
            <p className="text-muted-foreground/60 text-[9px]">No BOQ items attached.</p>
          )}
        </div>

        {/* Divider */}
        <div className="border-t border-border/40" />

        {/* Dependencies */}
        <div>
          <h4 className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
            Dependencies {deps.length > 0 && <span className="text-muted-foreground/60">({deps.length})</span>}
          </h4>
          {deps.length > 0 && (
            <div className="space-y-1 mb-1.5">
              {deps.map((d) => {
                const pred = allTasks.find(t => t.id === d.taskId);
                if (!pred) return null;
                return (
                  <div key={d.taskId} className="flex items-center gap-1 rounded bg-muted/30 px-1 py-0.5 text-[10px]">
                    <Link2 className="h-2.5 w-2.5 text-purple-500 shrink-0" />
                    <span className="font-mono text-[9px] text-muted-foreground/70 shrink-0">{pred.code ?? "?"}</span>
                    <span className="truncate flex-1 text-[9px]">{pred.name}</span>
                    <span className="text-[9px] font-mono text-purple-400 shrink-0">{d.type}</span>
                    <span className="text-[9px] text-muted-foreground shrink-0">{d.offset >= 0 ? "+" : ""}{d.offset}d</span>
                    {canWrite && (
                      <button onClick={() => removeDep(d.taskId)}
                        className="rounded p-0.5 text-muted-foreground hover:text-destructive shrink-0">
                        <X className="h-2.5 w-2.5" />
                      </button>
                    )}
                  </div>
                );
              })}
              {canWrite && (
                <button onClick={() => {
                  setDepsMutation.mutate({
                    taskId: task.id,
                    dependencies: deps.map(d => ({ predecessorId: d.taskId, type: d.type, offset: d.offset })),
                  });
                }} disabled={setDepsMutation.isPending}
                  className="text-[9px] text-purple-400 hover:text-purple-300">
                  ↻ Recalculate dates
                </button>
              )}
            </div>
          )}
          {canWrite && availableTasks.length > 0 && (
            <div className="flex items-center gap-1">
              <div className="flex-1 min-w-0">
                <SearchSelect
                  items={availableTasks}
                  placeholder="Predecessors..."
                  selected={depPredecessorId}
                  onSelect={setDepPredecessorId}
                  className="h-6 text-[10px]"
                />
              </div>
              <select value={depType} onChange={(e) => setDepType(e.target.value as any)}
                className="h-6 w-9 rounded border bg-background px-0.5 text-[9px] font-bold">
                <option value="FS">FS</option>
                <option value="SS">SS</option>
                <option value="FF">FF</option>
                <option value="SF">SF</option>
              </select>
              <input type="number" value={depOffset} onChange={(e) => setDepOffset(e.target.value)}
                className="h-6 w-8 rounded border bg-background px-0.5 text-[10px] text-center" placeholder="±d" />
              <button onClick={addDep} disabled={!depPredecessorId || addDepMutation.isPending}
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-purple-600 text-white disabled:opacity-40 hover:bg-purple-700">
                {addDepMutation.isPending ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <span className="text-xs font-bold">+</span>}
              </button>
            </div>
          )}
          {deps.length === 0 && !canWrite && (
            <p className="text-muted-foreground/60 text-[9px]">No dependencies.</p>
          )}
        </div>

        {/* Divider */}
        <div className="border-t border-border/40" />

        {/* Actual Dates */}
        <div>
          <h4 className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Actual Dates</h4>
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-1 rounded border border-border/40 bg-muted/10 p-1 text-[10px]">
            <div className="flex flex-col min-w-0">
              <span className="text-[8px] text-muted-foreground uppercase font-mono px-0.5">Act Start</span>
              {canWrite ? (
                <InlineDate value={task.actualStartDate ?? ""} onSave={(v) => updateMutation.mutate({ taskId: task.id, actualStartDate: v || null })}
                  className="h-5 px-0.5 text-[10px] font-mono truncate" />
              ) : (
                <span className="px-0.5 text-[10px] font-mono truncate">{task.actualStartDate ? format(new Date(task.actualStartDate), "dd MMM") : "—"}</span>
              )}
            </div>
            <span className="text-muted-foreground/50 text-[10px]">→</span>
            <div className="flex flex-col min-w-0 text-right">
              <span className="text-[8px] text-muted-foreground uppercase font-mono px-0.5">Act End</span>
              {canWrite ? (
                <InlineDate value={task.actualEndDate ?? ""} onSave={(v) => updateMutation.mutate({ taskId: task.id, actualEndDate: v || null })}
                  className="h-5 px-0.5 text-[10px] font-mono truncate text-right" />
              ) : (
                <span className="px-0.5 text-[10px] font-mono truncate">{task.actualEndDate ? format(new Date(task.actualEndDate), "dd MMM") : "—"}</span>
              )}
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-border/40" />

        {/* Resource Assignments */}
        <div>
          <h4 className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
            Resources {taskAssignments?.assignments && taskAssignments.assignments.length > 0 && (
              <span className="text-muted-foreground/60">({taskAssignments.assignments.length})</span>
            )}
          </h4>

          {/* Existing assignments */}
          {taskAssignments?.assignments && taskAssignments.assignments.length > 0 ? (
            <div className="space-y-1 mb-1.5">
              {taskAssignments.assignments.map((a) => (
                <div key={a.id} className="flex items-center gap-1 rounded border border-border/40 px-1 py-0.5 text-[9px]">
                  {a.staffRole && (
                    <>
                      <Users className="h-2.5 w-2.5 text-muted-foreground shrink-0" />
                      <span className="font-medium truncate flex-1">{a.staffRole.name}</span>
                      <span className="text-muted-foreground shrink-0">×{a.quantity}</span>
                    </>
                  )}
                  {a.person && !a.staffRole && (
                    <>
                      <Users className="h-2.5 w-2.5 text-emerald-500 shrink-0" />
                      <span className="font-medium truncate flex-1">{a.person.displayName}</span>
                    </>
                  )}
                  {a.equipment && (
                    <>
                      <Wrench className="h-2.5 w-2.5 text-amber-500 shrink-0" />
                      <span className="font-medium truncate flex-1">{a.equipment.name}</span>
                    </>
                  )}
                  {canWrite && (
                    <button
                      onClick={() => removeAssignmentMutation.mutate({ assignmentId: a.id })}
                      className="text-muted-foreground hover:text-destructive shrink-0"
                      title="Remove"
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground/60 text-[9px] mb-1">No resources assigned.</p>
          )}

          {/* Add role assignment (planning) */}
          {canWrite && (
            <div className="space-y-1">
              <select
                value=""
                onChange={(e) => {
                  if (e.target.value) {
                    assignRoleMutation.mutate({ taskId: task.id, staffRoleId: e.target.value });
                  }
                }}
                disabled={assignRoleMutation.isPending}
                className="w-full h-5.5 rounded border border-border/40 bg-background px-1 text-[9px]"
              >
                <option value="">+ Assign role…</option>
                {rolesData?.roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name} ({role.category})
                  </option>
                ))}
              </select>

              {/* Add staff (execution) */}
              {staffData?.staff && staffData.staff.length > 0 && (
                <select
                  value=""
                  onChange={(e) => {
                    if (e.target.value) {
                      assignStaffMutation.mutate({ taskId: task.id, personId: e.target.value });
                    }
                  }}
                  disabled={assignStaffMutation.isPending}
                  className="w-full h-5.5 rounded border border-border/40 bg-background px-1 text-[9px]"
                >
                  <option value="">+ Assign person…</option>
                  {staffData.staff.map((s) => (
                    <option key={s.personId} value={s.personId}>
                      {s.name}{s.designation ? ` (${s.designation})` : ""}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}
        </div>

        {/* Work Package / Structure Replicator Actions */}
        {canWrite && (
          <div className="space-y-1.5 rounded border border-emerald-500/20 bg-emerald-950/20 p-2">
            <div className="text-[8.5px] font-semibold text-emerald-400 uppercase tracking-wider flex items-center gap-1">
              <Sparkles className="h-2.5 w-2.5" /> Replicate & Templates
            </div>

            <div className="flex flex-col gap-1">
              <button
                type="button"
                onClick={() => onReplicate?.(task)}
                className="flex items-center gap-1.5 w-full px-2 py-1 rounded bg-[var(--navy-mid)] border border-border hover:border-emerald-500 text-foreground hover:text-emerald-400 text-[9px] font-mono cursor-pointer transition-colors text-left"
              >
                <Copy className="h-2.5 w-2.5 text-emerald-400 shrink-0" />
                <span>⎘ Replicate Structure...</span>
              </button>

              {isSavingTemplate ? (
                <div className="mt-1 space-y-1 p-1 rounded bg-[var(--navy-mid)]/90 border border-border">
                  <input
                    type="text"
                    value={templateNameInput}
                    onChange={(e) => setTemplateNameInput(e.target.value)}
                    placeholder="Template Name..."
                    className="w-full rounded border border-border bg-[var(--navy-mid)] px-1.5 py-0.5 text-[9px] text-white focus:outline-none focus:border-emerald-500"
                  />
                  <div className="flex items-center justify-end gap-1">
                    <button
                      type="button"
                      onClick={() => setIsSavingTemplate(false)}
                      className="px-1.5 py-0.5 text-[8px] rounded border border-border text-muted-foreground/80 hover:text-foreground"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={saveTemplateMutation.isPending || !templateNameInput.trim()}
                      onClick={() =>
                        saveTemplateMutation.mutate({
                          projectId,
                          taskId: task.id,
                          name: templateNameInput.trim(),
                        })
                      }
                      className="px-1.5 py-0.5 text-[8px] rounded bg-emerald-600 hover:bg-emerald-500 text-white font-semibold disabled:opacity-50"
                    >
                      {saveTemplateMutation.isPending ? "Saving..." : "Save"}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setTemplateNameInput(task.name);
                    setIsSavingTemplate(true);
                  }}
                  className="flex items-center gap-1.5 w-full px-2 py-1 rounded bg-[var(--navy-mid)] border border-border hover:border-emerald-500 text-foreground hover:text-emerald-400 text-[9px] font-mono cursor-pointer transition-colors text-left"
                >
                  <Sparkles className="h-2.5 w-2.5 text-amber-400 shrink-0" />
                  <span>⭐ Save as Template</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Divider */}
        <div className="border-t border-border/40" />

        {/* Create RFI */}
        <Dialog open={rfiDialogOpen} onOpenChange={setRfiDialogOpen}>
          <DialogTrigger asChild>
            <button
              className="flex items-center gap-1 text-[9px] font-medium text-amber-400 hover:text-amber-300"
            >
              <FileQuestion className="h-3 w-3" /> Create RFI for task
            </button>
          </DialogTrigger>
          <CreateRfiDialog
            projectId={projectId}
            existingCount={0}
            defaultGanttTaskId={task.id}
            onCreated={() => setRfiDialogOpen(false)}
            onCancel={() => setRfiDialogOpen(false)}
          />
        </Dialog>
      </div>

      {/* Delete */}
      {canWrite && (
        <div className="border-t border-border/40 p-2">
          {deleteConfirm ? (
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] text-destructive">Delete?</span>
              <button onClick={() => deleteMutation.mutate({ taskId: task.id })}
                className="rounded px-1.5 py-0.5 text-[9px] font-medium bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Confirm
              </button>
              <button onClick={() => setDeleteConfirm(false)}
                className="rounded px-1.5 py-0.5 text-[9px] text-muted-foreground hover:bg-muted">
                Cancel
              </button>
            </div>
          ) : (
            <button onClick={() => setDeleteConfirm(true)}
              className="flex items-center gap-1 text-[9px] text-destructive hover:text-destructive/80">
              <Trash2 className="h-2.5 w-2.5" /> Delete task
            </button>
          )}
        </div>
      )}
    </div>
  );
}
