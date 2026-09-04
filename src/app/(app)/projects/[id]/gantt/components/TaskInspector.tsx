"use client";

import { useState, useMemo } from "react";
import { format, differenceInDays } from "date-fns";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc-client";
import {
  X, Link2, Trash2, FileQuestion, Users, Wrench, Sparkles, Copy,
  Briefcase, CheckSquare, Diamond, Palette, ChevronDown, ChevronRight, Clock,
  ArrowRight, Shield, TrendingUp
} from "lucide-react";
import { Dialog, DialogTrigger } from "@/components/ui/dialog";
import { CreateRfiDialog } from "@/components/workflow/create-rfi-dialog";
import type { Task, InspectorTab } from "../types";
import { getDeps } from "../utils";
import { InlineEdit } from "./InlineEdit";
import { InlineDate } from "./InlineDate";
import { SearchSelect, type SearchItem } from "./SearchSelect";
import { formatNpr } from "@/lib/currency";
import { cn } from "@/lib/utils";

type TaskInspectorProps = {
  task: Task;
  allTasks: Task[];
  canWrite: boolean;
  projectId: string;
  onClose: () => void;
  utils: any;
  pushAction?: (action: { label: string; undo: () => Promise<void>; redo: () => Promise<void> }) => void;
  onReplicate?: (task: Task) => void;
  overlayMap?: Map<string, { startDate: string; endDate: string }>;
};

export function TaskInspector({
  task,
  allTasks,
  canWrite,
  projectId,
  onClose,
  utils,
  pushAction: _pushAction,
  onReplicate,
  overlayMap,
}: TaskInspectorProps) {
  const [activeTab, setActiveTab] = useState<InspectorTab>("task");

  // Accordion open/close states
  const [scheduleOpen, setScheduleOpen] = useState(true);
  const [baselineOpen, setBaselineOpen] = useState(true);
  const [dependenciesOpen, setDependenciesOpen] = useState(true);
  const [resourcesOpen, setResourcesOpen] = useState(true);
  const [commercialOpen, setCommercialOpen] = useState(true);

  // OmniPlan schedule parameters
  const [scheduleMode, setScheduleMode] = useState<"automatic" | "manual">("automatic");
  const [timeConstraint, setTimeConstraint] = useState<string>("none");
  const [schedulingDirection, setSchedulingDirection] = useState<"asap" | "alap">("asap");
  const [allowSplitting, setAllowSplitting] = useState(true);
  const [levelingPriority, setLevelingPriority] = useState<"low" | "normal" | "high" | "urgent">("normal");
  const [levelingDelay, setLevelingDelay] = useState(0);

  // Task TRPC mutations
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

  // Resource queries & mutations
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
  const successors = useMemo(() => {
    return allTasks.filter((t) => {
      const d = getDeps(t);
      return d.some((dep) => dep.taskId === task.id);
    });
  }, [allTasks, task.id]);

  const pct = task.progress ?? 0;
  const start = useMemo(() => new Date(task.startDate), [task.startDate]);
  const end = useMemo(() => new Date(task.endDate), [task.endDate]);
  const duration = differenceInDays(end, start) + 1;

  // Baseline dates & variances
  const baselineInfo = useMemo(() => {
    if (overlayMap && overlayMap.has(task.id)) {
      const base = overlayMap.get(task.id)!;
      const bStart = new Date(base.startDate);
      const bEnd = new Date(base.endDate);
      const startVar = differenceInDays(start, bStart);
      const endVar = differenceInDays(end, bEnd);
      return {
        startDate: format(bStart, "dd MMM yyyy"),
        endDate: format(bEnd, "dd MMM yyyy"),
        startVariance: startVar,
        endVariance: endVar,
      };
    }
    return {
      startDate: format(start, "dd MMM yyyy"),
      endDate: format(end, "dd MMM yyyy"),
      startVariance: 0,
      endVariance: 0,
    };
  }, [overlayMap, task.id, start, end]);

  // Cost calculations
  const totalBoqValue = useMemo(() => {
    return task.boqLinks.reduce((s, l) => s + l.boqItem.rate * l.quantity, 0);
  }, [task.boqLinks]);

  const resourceCost = useMemo(() => {
    const hours = task.workHours ?? duration * 8;
    return hours * 350; // Standard nominal crew rate in NPR
  }, [task.workHours, duration]);

  const totalCost = totalBoqValue + resourceCost;

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
      taskId: task.id,
      startDate: newStart.toISOString(),
      endDate: newEnd.toISOString(),
    });
  };

  const handleDurationChange = (v: string) => {
    const d = Math.max(1, parseInt(v) || 1);
    const newEnd = new Date(start.getTime() + (d - 1) * 86400000);
    updateMutation.mutate({
      taskId: task.id,
      duration: d,
      endDate: newEnd.toISOString(),
    });
  };

  const handleEndChange = (v: string) => {
    const newEnd = new Date(v);
    const d = Math.max(1, differenceInDays(newEnd, start) + 1);
    updateMutation.mutate({
      taskId: task.id,
      endDate: newEnd.toISOString(),
      duration: d,
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
        label: `${b.code} — ${b.description} (${b.unit}, ${formatNpr(b.rate)})`,
        search: `${b.code} ${b.description} ${b.unit}`,
      }));
  }, [boqData, task.boqLinks]);

  const availableTasks: SearchItem[] = useMemo(() => {
    return allTasks
      .filter((t) => t.id !== task.id && !deps.some((d) => d.taskId === t.id))
      .map((t) => ({
        value: t.id,
        label: `${t.code ?? "?"} — ${t.name}`,
        search: `${t.code ?? ""} ${t.name}`,
      }));
  }, [allTasks, task.id, deps]);

  return (
    <div className="gantt-inspector w-[330px] shrink-0 border-l border-border bg-card flex flex-col font-sans z-20 shadow-[-6px_0_18px_rgba(79,62,45,0.08)] select-none">
      {/* OmniPlan 4 Five-Tab Header Icon Bar */}
      <div className="flex items-center justify-between border-b border-border bg-muted/40 px-1 py-1">
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            title="Project Inspector"
            onClick={() => setActiveTab("project")}
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded transition-colors",
              activeTab === "project" ? "bg-card text-primary shadow-xs font-bold border border-border" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            )}
          >
            <Briefcase className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            title="Task Inspector"
            onClick={() => setActiveTab("task")}
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded transition-colors",
              activeTab === "task" ? "bg-card text-primary shadow-xs font-bold border border-border" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            )}
          >
            <CheckSquare className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            title="Resource Inspector"
            onClick={() => setActiveTab("resource")}
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded transition-colors",
              activeTab === "resource" ? "bg-card text-primary shadow-xs font-bold border border-border" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            )}
          >
            <Users className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            title="Milestone Inspector"
            onClick={() => setActiveTab("milestone")}
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded transition-colors",
              activeTab === "milestone" ? "bg-card text-primary shadow-xs font-bold border border-border" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            )}
          >
            <Diamond className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            title="Styles Inspector"
            onClick={() => setActiveTab("styles")}
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded transition-colors",
              activeTab === "styles" ? "bg-card text-primary shadow-xs font-bold border border-border" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            )}
          >
            <Palette className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="flex items-center gap-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground font-mono">
            {activeTab}
          </span>
          <button
            onClick={onClose}
            className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Main Inspector Scrollable Body */}
      <div className="flex-1 overflow-y-auto p-2 text-xs matrix-scrollbar space-y-2.5">
        {activeTab === "task" && (
          <>
            {/* Task Name & Code */}
            <div className="rounded border border-border/80 bg-background/60 p-2 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-mono text-emerald-600 bg-emerald-500/10 border border-emerald-500/20 rounded px-1.5 py-0.5">
                  [{task.code || "TASK"}]
                </span>
                {task.isMilestone && (
                  <span className="flex items-center gap-1 text-[9px] font-bold text-amber-600 bg-amber-500/10 border border-amber-500/20 rounded px-1.5 py-0.5">
                    <Diamond className="h-2.5 w-2.5 fill-amber-500" /> Milestone
                  </span>
                )}
              </div>
              <div>
                {canWrite ? (
                  <InlineEdit
                    value={task.name}
                    onSave={(v) => updateMutation.mutate({ taskId: task.id, name: v })}
                    className="text-xs font-bold text-foreground leading-snug"
                  />
                ) : (
                  <p className="text-xs font-bold text-foreground leading-snug">{task.name}</p>
                )}
              </div>
            </div>

            {/* OmniPlan Cost Header Pill */}
            <div className="rounded border border-border/70 bg-secondary/30 p-2 space-y-1">
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-muted-foreground">Resource Costs:</span>
                <span className="font-mono font-semibold text-foreground">{formatNpr(resourceCost)}</span>
              </div>
              <div className="flex items-center justify-between text-[11px] pt-1 border-t border-border/40 font-bold">
                <span className="text-foreground">Total Cost:</span>
                <span className="font-mono text-primary">{formatNpr(totalCost)}</span>
              </div>
            </div>

            {/* Accordion 1: Schedule */}
            <div className="rounded border border-border bg-card overflow-hidden">
              <button
                type="button"
                onClick={() => setScheduleOpen(!scheduleOpen)}
                className="flex w-full items-center justify-between px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider bg-muted/30 text-foreground hover:bg-muted/50"
              >
                <span className="flex items-center gap-1">
                  {scheduleOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                  Schedule
                </span>
                <Clock className="h-3 w-3 text-muted-foreground" />
              </button>

              {scheduleOpen && (
                <div className="p-2 space-y-2 border-t border-border">
                  {/* Automatic / Manual Segmented Control */}
                  <div className="grid grid-cols-2 gap-1 rounded bg-muted/40 p-0.5 border border-border/60">
                    <button
                      type="button"
                      onClick={() => setScheduleMode("automatic")}
                      className={cn(
                        "py-1 text-center text-[10px] font-semibold rounded transition-colors",
                        scheduleMode === "automatic" ? "bg-card text-primary font-bold shadow-2xs" : "text-muted-foreground"
                      )}
                    >
                      Automatic
                    </button>
                    <button
                      type="button"
                      onClick={() => setScheduleMode("manual")}
                      className={cn(
                        "py-1 text-center text-[10px] font-semibold rounded transition-colors",
                        scheduleMode === "manual" ? "bg-card text-primary font-bold shadow-2xs" : "text-muted-foreground"
                      )}
                    >
                      Manual
                    </button>
                  </div>

                  {/* Start / End / Duration / Effort */}
                  <div className="grid grid-cols-2 gap-2 text-[10px]">
                    <div className="space-y-0.5">
                      <span className="text-[9px] font-mono text-muted-foreground uppercase">Start</span>
                      {canWrite ? (
                        <InlineDate value={task.startDate} onSave={handleStartChange} className="h-6 w-full rounded border border-border bg-background px-1 text-[10px] font-mono font-medium truncate" />
                      ) : (
                        <div className="h-6 flex items-center px-1 rounded border border-border/40 bg-muted/20 font-mono text-[10px]">{format(start, "dd MMM yyyy")}</div>
                      )}
                    </div>
                    <div className="space-y-0.5">
                      <span className="text-[9px] font-mono text-muted-foreground uppercase">End</span>
                      {canWrite ? (
                        <InlineDate value={task.endDate} onSave={handleEndChange} className="h-6 w-full rounded border border-border bg-background px-1 text-[10px] font-mono font-medium truncate" />
                      ) : (
                        <div className="h-6 flex items-center px-1 rounded border border-border/40 bg-muted/20 font-mono text-[10px]">{format(end, "dd MMM yyyy")}</div>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[10px]">
                    <div className="space-y-0.5">
                      <span className="text-[9px] font-mono text-muted-foreground uppercase">Duration</span>
                      {canWrite ? (
                        <div className="flex items-center">
                          <input
                            type="number"
                            min={1}
                            value={duration}
                            onChange={(e) => handleDurationChange(e.target.value)}
                            className="h-6 w-full rounded border border-border bg-background px-1 text-[10px] font-mono font-bold text-foreground text-center"
                          />
                        </div>
                      ) : (
                        <div className="h-6 flex items-center justify-center rounded border border-border/40 bg-muted/20 font-mono font-bold">{duration}d</div>
                      )}
                    </div>
                    <div className="space-y-0.5">
                      <span className="text-[9px] font-mono text-muted-foreground uppercase">Effort</span>
                      {canWrite ? (
                        <input
                          type="number"
                          min={0}
                          defaultValue={task.workHours ?? duration * 8}
                          onBlur={(e) => updateMutation.mutate({ taskId: task.id, workHours: parseFloat(e.target.value) || 0 })}
                          className="h-6 w-full rounded border border-border bg-background px-1 text-[10px] font-mono font-bold text-foreground text-center"
                        />
                      ) : (
                        <div className="h-6 flex items-center justify-center rounded border border-border/40 bg-muted/20 font-mono font-bold">{task.workHours ?? duration * 8}h</div>
                      )}
                    </div>
                  </div>

                  {/* Progress Slider */}
                  <div className="space-y-1 pt-1">
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="text-muted-foreground">Completed:</span>
                      <span className="font-mono font-bold text-emerald-600">{pct}%</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={pct}
                      disabled={!canWrite}
                      onChange={(e) => updateMutation.mutate({ taskId: task.id, progress: parseInt(e.target.value) })}
                      className="w-full h-1.5 rounded-full appearance-none bg-muted accent-emerald-600 cursor-pointer"
                    />
                  </div>

                  {/* Add a Time Constraint Dropdown */}
                  <div className="space-y-1 pt-1">
                    <span className="text-[9px] font-mono text-muted-foreground uppercase">Constraint</span>
                    <select
                      value={timeConstraint}
                      onChange={(e) => setTimeConstraint(e.target.value)}
                      className="w-full h-6 rounded border border-border bg-background px-1 text-[10px] font-mono"
                    >
                      <option value="none">None</option>
                      <option value="snet">Start no earlier than</option>
                      <option value="snlt">Start no later than</option>
                      <option value="fnet">Finish no earlier than</option>
                      <option value="fnlt">Finish no later than</option>
                      <option value="mso">Must start on</option>
                      <option value="mfo">Must finish on</option>
                    </select>
                  </div>

                  {/* Direction ASAP / ALAP & Allow Splitting */}
                  <div className="flex items-center justify-between pt-1">
                    <div className="flex items-center rounded border border-border bg-muted/30 p-0.5 text-[9px] font-semibold">
                      <button
                        type="button"
                        onClick={() => setSchedulingDirection("asap")}
                        className={cn("px-2 py-0.5 rounded", schedulingDirection === "asap" ? "bg-card text-primary shadow-2xs font-bold" : "text-muted-foreground")}
                      >
                        « ASAP
                      </button>
                      <button
                        type="button"
                        onClick={() => setSchedulingDirection("alap")}
                        className={cn("px-2 py-0.5 rounded", schedulingDirection === "alap" ? "bg-card text-primary shadow-2xs font-bold" : "text-muted-foreground")}
                      >
                        ALAP »
                      </button>
                    </div>

                    <label className="flex items-center gap-1 text-[10px] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={allowSplitting}
                        onChange={(e) => setAllowSplitting(e.target.checked)}
                        className="rounded border-border text-primary focus:ring-0"
                      />
                      <span>Allow Splitting</span>
                    </label>
                  </div>

                  {/* Leveling Priority & Delay */}
                  <div className="grid grid-cols-2 gap-2 pt-1 border-t border-border/50 text-[10px]">
                    <div className="space-y-0.5">
                      <span className="text-[9px] text-muted-foreground">Priority</span>
                      <select
                        value={levelingPriority}
                        onChange={(e) => setLevelingPriority(e.target.value as any)}
                        className="w-full h-5.5 rounded border border-border bg-background px-1 text-[9px]"
                      >
                        <option value="low">Low</option>
                        <option value="normal">Normal</option>
                        <option value="high">High</option>
                        <option value="urgent">Urgent</option>
                      </select>
                    </div>
                    <div className="space-y-0.5">
                      <span className="text-[9px] text-muted-foreground">Leveling Delay</span>
                      <input
                        type="number"
                        min={0}
                        value={levelingDelay}
                        onChange={(e) => setLevelingDelay(parseInt(e.target.value) || 0)}
                        className="w-full h-5.5 rounded border border-border bg-background px-1 text-[9px] text-center font-mono"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Accordion 2: Baseline */}
            <div className="rounded border border-border bg-card overflow-hidden">
              <button
                type="button"
                onClick={() => setBaselineOpen(!baselineOpen)}
                className="flex w-full items-center justify-between px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider bg-muted/30 text-foreground hover:bg-muted/50"
              >
                <span className="flex items-center gap-1">
                  {baselineOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                  Baseline
                </span>
                <span className="text-[9px] font-mono text-muted-foreground font-normal">v1 Approved</span>
              </button>

              {baselineOpen && (
                <div className="p-2 space-y-1.5 border-t border-border text-[10px]">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Baseline Start:</span>
                    <span className="font-mono text-foreground">{baselineInfo.startDate}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Baseline End:</span>
                    <span className="font-mono text-foreground">{baselineInfo.endDate}</span>
                  </div>
                  <div className="flex items-center justify-between pt-1 border-t border-border/40">
                    <span className="text-muted-foreground">Start Variance:</span>
                    <span className={cn("font-mono font-bold", baselineInfo.startVariance > 0 ? "text-destructive" : baselineInfo.startVariance < 0 ? "text-emerald-600" : "text-foreground")}>
                      {baselineInfo.startVariance > 0 ? `+${baselineInfo.startVariance}d` : `${baselineInfo.startVariance}d`}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">End Variance:</span>
                    <span className={cn("font-mono font-bold", baselineInfo.endVariance > 0 ? "text-destructive" : baselineInfo.endVariance < 0 ? "text-emerald-600" : "text-foreground")}>
                      {baselineInfo.endVariance > 0 ? `+${baselineInfo.endVariance}d` : `${baselineInfo.endVariance}d`}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Accordion 3: Dependencies */}
            <div className="rounded border border-border bg-card overflow-hidden">
              <button
                type="button"
                onClick={() => setDependenciesOpen(!dependenciesOpen)}
                className="flex w-full items-center justify-between px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider bg-muted/30 text-foreground hover:bg-muted/50"
              >
                <span className="flex items-center gap-1">
                  {dependenciesOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                  Dependencies ({deps.length + successors.length})
                </span>
                <Link2 className="h-3 w-3 text-muted-foreground" />
              </button>

              {dependenciesOpen && (
                <div className="p-2 space-y-2 border-t border-border text-[10px]">
                  {/* Prerequisites */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                      <span>Prerequisites ({deps.length})</span>
                    </div>
                    {deps.map((d) => {
                      const pred = allTasks.find((t) => t.id === d.taskId);
                      if (!pred) return null;
                      return (
                        <div key={d.taskId} className="flex items-center gap-1 rounded bg-muted/30 px-1.5 py-1 text-[10px]">
                          <Link2 className="h-2.5 w-2.5 text-primary shrink-0" />
                          <span className="font-mono text-[9px] font-bold text-muted-foreground shrink-0">{pred.code || "?"}</span>
                          <span className="truncate flex-1 text-[9px] font-medium">{pred.name}</span>
                          <span className="font-mono text-[9px] font-bold text-primary shrink-0">{d.type}</span>
                          <span className="font-mono text-[9px] text-muted-foreground shrink-0">{d.offset >= 0 ? `+${d.offset}d` : `${d.offset}d`}</span>
                          {canWrite && (
                            <button
                              type="button"
                              onClick={() => removeDep(d.taskId)}
                              className="text-muted-foreground hover:text-destructive shrink-0 ml-1"
                            >
                              <X className="h-2.5 w-2.5" />
                            </button>
                          )}
                        </div>
                      );
                    })}

                    {/* Add Predecessor */}
                    {canWrite && availableTasks.length > 0 && (
                      <div className="flex items-center gap-1 pt-1">
                        <div className="flex-1 min-w-0">
                          <SearchSelect
                            items={availableTasks}
                            placeholder="Add predecessor..."
                            selected={depPredecessorId}
                            onSelect={setDepPredecessorId}
                            className="h-6 text-[10px]"
                          />
                        </div>
                        <select
                          value={depType}
                          onChange={(e) => setDepType(e.target.value as any)}
                          className="h-6 w-10 rounded border border-border bg-background px-0.5 text-[9px] font-bold"
                        >
                          <option value="FS">FS</option>
                          <option value="SS">SS</option>
                          <option value="FF">FF</option>
                          <option value="SF">SF</option>
                        </select>
                        <input
                          type="number"
                          value={depOffset}
                          onChange={(e) => setDepOffset(e.target.value)}
                          className="h-6 w-8 rounded border border-border bg-background px-0.5 text-[10px] text-center"
                          placeholder="±d"
                        />
                        <button
                          type="button"
                          onClick={addDep}
                          disabled={!depPredecessorId || addDepMutation.isPending}
                          className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-primary text-primary-foreground font-bold hover:bg-primary/90 disabled:opacity-40"
                        >
                          +
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Dependents (Successors) */}
                  <div className="space-y-1 pt-2 border-t border-border/40">
                    <div className="flex items-center justify-between text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                      <span>Dependents / Successors ({successors.length})</span>
                    </div>
                    {successors.map((succ) => (
                      <div key={succ.id} className="flex items-center gap-1 rounded bg-muted/20 px-1.5 py-1 text-[10px]">
                        <ArrowRight className="h-2.5 w-2.5 text-muted-foreground shrink-0" />
                        <span className="font-mono text-[9px] font-bold text-muted-foreground shrink-0">{succ.code || "?"}</span>
                        <span className="truncate flex-1 text-[9px]">{succ.name}</span>
                        <span className="font-mono text-[9px] text-muted-foreground shrink-0">{succ.duration}d</span>
                      </div>
                    ))}
                    {successors.length === 0 && (
                      <p className="text-[9px] text-muted-foreground/60 italic">No downstream activities depend on this task.</p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Accordion 4: Assigned Resources */}
            <div className="rounded border border-border bg-card overflow-hidden">
              <button
                type="button"
                onClick={() => setResourcesOpen(!resourcesOpen)}
                className="flex w-full items-center justify-between px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider bg-muted/30 text-foreground hover:bg-muted/50"
              >
                <span className="flex items-center gap-1">
                  {resourcesOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                  Assigned Resources ({taskAssignments?.assignments?.length || 0})
                </span>
                <Users className="h-3 w-3 text-muted-foreground" />
              </button>

              {resourcesOpen && (
                <div className="p-2 space-y-2 border-t border-border text-[10px]">
                  {taskAssignments?.assignments && taskAssignments.assignments.length > 0 ? (
                    <div className="space-y-1">
                      {taskAssignments.assignments.map((a) => (
                        <div key={a.id} className="flex items-center gap-1 rounded border border-border/60 bg-muted/20 px-1.5 py-1 text-[10px]">
                          {a.staffRole && (
                            <>
                              <Users className="h-2.5 w-2.5 text-muted-foreground shrink-0" />
                              <span className="font-semibold truncate flex-1">{a.staffRole.name}</span>
                              <span className="text-[9px] font-mono text-muted-foreground shrink-0">100% (×{a.quantity})</span>
                            </>
                          )}
                          {a.person && !a.staffRole && (
                            <>
                              <Users className="h-2.5 w-2.5 text-emerald-600 shrink-0" />
                              <span className="font-semibold truncate flex-1">{a.person.displayName}</span>
                              <span className="text-[9px] font-mono text-muted-foreground shrink-0">100%</span>
                            </>
                          )}
                          {a.equipment && (
                            <>
                              <Wrench className="h-2.5 w-2.5 text-amber-600 shrink-0" />
                              <span className="font-semibold truncate flex-1">{a.equipment.name}</span>
                              <span className="text-[9px] font-mono text-muted-foreground shrink-0">100%</span>
                            </>
                          )}
                          {canWrite && (
                            <button
                              type="button"
                              onClick={() => removeAssignmentMutation.mutate({ assignmentId: a.id })}
                              className="text-muted-foreground hover:text-destructive shrink-0 ml-1"
                            >
                              <X className="h-2.5 w-2.5" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[9px] text-muted-foreground/60 italic">No resources currently assigned.</p>
                  )}

                  {/* Add Role / Add Staff */}
                  {canWrite && (
                    <div className="space-y-1 pt-1 border-t border-border/40">
                      <select
                        value=""
                        onChange={(e) => {
                          if (e.target.value) {
                            assignRoleMutation.mutate({ taskId: task.id, staffRoleId: e.target.value });
                          }
                        }}
                        disabled={assignRoleMutation.isPending}
                        className="w-full h-6 rounded border border-border bg-background px-1 text-[10px]"
                      >
                        <option value="">+ Assign Crew / Role…</option>
                        {rolesData?.roles?.map((role) => (
                          <option key={role.id} value={role.id}>
                            {role.name} ({role.category})
                          </option>
                        ))}
                      </select>

                      {staffData?.staff && staffData.staff.length > 0 && (
                        <select
                          value=""
                          onChange={(e) => {
                            if (e.target.value) {
                              assignStaffMutation.mutate({ taskId: task.id, personId: e.target.value });
                            }
                          }}
                          disabled={assignStaffMutation.isPending}
                          className="w-full h-6 rounded border border-border bg-background px-1 text-[10px]"
                        >
                          <option value="">+ Assign Named Person…</option>
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
              )}
            </div>

            {/* Accordion 5: Commercial & BOQ Items */}
            <div className="rounded border border-border bg-card overflow-hidden">
              <button
                type="button"
                onClick={() => setCommercialOpen(!commercialOpen)}
                className="flex w-full items-center justify-between px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider bg-muted/30 text-foreground hover:bg-muted/50"
              >
                <span className="flex items-center gap-1">
                  {commercialOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                  BOQ Items & Advance ({task.boqLinks.length})
                </span>
                <Shield className="h-3 w-3 text-muted-foreground" />
              </button>

              {commercialOpen && (
                <div className="p-2 space-y-2 border-t border-border text-[10px]">
                  {task.boqLinks.length > 0 && (
                    <div className="space-y-1">
                      {task.boqLinks.map((link) => (
                        <div key={link.id} className="flex items-center gap-1 rounded bg-muted/30 px-1.5 py-1 text-[10px]">
                          <span className="font-mono text-[9px] font-bold text-muted-foreground shrink-0">{link.boqItem.code}</span>
                          <span className="truncate flex-1 text-[9px]">{link.boqItem.description}</span>
                          <span className="text-[9px] font-mono shrink-0">{link.quantity} {link.boqItem.unit}</span>
                          {canWrite && (
                            <button
                              type="button"
                              onClick={() => removeBoq(link.id)}
                              className="text-muted-foreground hover:text-destructive shrink-0"
                            >
                              <X className="h-2.5 w-2.5" />
                            </button>
                          )}
                        </div>
                      ))}
                      <div className="flex items-center justify-between pt-1 border-t border-border/40 text-[10px]">
                        <span className="text-muted-foreground">Contract BOQ Total:</span>
                        <span className="font-mono font-bold text-primary">{formatNpr(totalBoqValue)}</span>
                      </div>
                    </div>
                  )}

                  {/* Add BOQ */}
                  {canWrite && boqItems.length > 0 && (
                    <div className="flex items-center gap-1 pt-1">
                      <div className="flex-1 min-w-0">
                        <SearchSelect
                          items={boqItems}
                          placeholder="Attach BOQ item..."
                          selected={boqItemId}
                          onSelect={setBoqItemId}
                          className="h-6 text-[10px]"
                        />
                      </div>
                      <input
                        type="number"
                        value={boqQty}
                        onChange={(e) => setBoqQty(e.target.value)}
                        className="h-6 w-12 rounded border border-border bg-background px-1 text-[10px] text-center"
                        placeholder="Qty"
                      />
                      <button
                        type="button"
                        onClick={addBoq}
                        disabled={!boqItemId || addLinkMutation.isPending}
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-emerald-600 text-white font-bold hover:bg-emerald-700 disabled:opacity-40"
                      >
                        +
                      </button>
                    </div>
                  )}

                  {/* Advance Rate Linear Model */}
                  {canWrite && (
                    <div className="pt-2 border-t border-border/40 space-y-1">
                      <span className="text-[9px] font-mono text-muted-foreground uppercase block">Linear Advance Rate (m/day):</span>
                      <div className="grid grid-cols-2 gap-1">
                        <input
                          type="number"
                          placeholder="Total Qty (m)"
                          value={advQty}
                          onChange={(e) => setAdvQty(e.target.value)}
                          className="h-6 text-[10px] font-mono bg-background border border-border rounded px-1 text-center"
                        />
                        <input
                          type="number"
                          placeholder="Rate (m/day)"
                          value={advRate}
                          onChange={(e) => setAdvRate(e.target.value)}
                          className="h-6 text-[10px] font-mono bg-background border border-border rounded px-1 text-center"
                        />
                      </div>
                      <button
                        type="button"
                        disabled={!advQty || !advRate}
                        onClick={() => {
                          const q = parseFloat(advQty);
                          const r = parseFloat(advRate);
                          if (q > 0 && r > 0) {
                            const daysCalc = Math.ceil(q / r);
                            handleDurationChange(String(daysCalc));
                            toast.success(`Calculated duration: ${daysCalc} days (${q}m @ ${r}m/d)`);
                          }
                        }}
                        className="w-full h-5 rounded bg-primary/10 border border-primary/30 text-primary text-[9px] font-semibold hover:bg-primary/20 disabled:opacity-40"
                      >
                        Apply Linear Rate ➔ Days
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Template & Replicate Actions */}
            {canWrite && (
              <div className="rounded border border-border bg-card p-2 space-y-1.5">
                <div className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                  <Sparkles className="h-3 w-3 text-amber-500" /> Templates & Hierarchy
                </div>
                <div className="flex flex-col gap-1">
                  <button
                    type="button"
                    onClick={() => onReplicate?.(task)}
                    className="flex items-center gap-1.5 w-full px-2 py-1 rounded bg-muted/40 border border-border hover:bg-muted/70 text-[9px] font-medium text-foreground transition-colors"
                  >
                    <Copy className="h-3 w-3 text-primary" />
                    <span>Replicate Structure…</span>
                  </button>

                  {isSavingTemplate ? (
                    <div className="space-y-1 p-1 rounded bg-muted/30 border border-border">
                      <input
                        type="text"
                        value={templateNameInput}
                        onChange={(e) => setTemplateNameInput(e.target.value)}
                        placeholder="Template Name..."
                        className="w-full rounded border border-border bg-background px-1.5 py-0.5 text-[9px]"
                      />
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => setIsSavingTemplate(false)}
                          className="px-1.5 py-0.5 text-[8px] rounded border border-border"
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
                          className="px-1.5 py-0.5 text-[8px] rounded bg-emerald-600 text-white font-bold disabled:opacity-50"
                        >
                          Save
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
                      className="flex items-center gap-1.5 w-full px-2 py-1 rounded bg-muted/40 border border-border hover:bg-muted/70 text-[9px] font-medium text-foreground transition-colors"
                    >
                      <Sparkles className="h-3 w-3 text-amber-500" />
                      <span>Save as Work Package Template</span>
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Create RFI & Delete */}
            <div className="flex items-center justify-between pt-1">
              <Dialog open={rfiDialogOpen} onOpenChange={setRfiDialogOpen}>
                <DialogTrigger asChild>
                  <button className="flex items-center gap-1 text-[9px] font-semibold text-amber-600 hover:underline">
                    <FileQuestion className="h-3 w-3" /> Create RFI
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

              {canWrite && (
                <div>
                  {deleteConfirm ? (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => deleteMutation.mutate({ taskId: task.id })}
                        className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        Confirm
                      </button>
                      <button
                        onClick={() => setDeleteConfirm(false)}
                        className="px-1.5 py-0.5 text-[9px] rounded border border-border"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setDeleteConfirm(true)}
                      className="flex items-center gap-1 text-[9px] text-destructive hover:underline"
                    >
                      <Trash2 className="h-3 w-3" /> Delete
                    </button>
                  )}
                </div>
              )}
            </div>
          </>
        )}

        {/* Project Inspector Tab */}
        {activeTab === "project" && (
          <div className="space-y-3">
            <div className="rounded border border-border bg-card p-3 space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-foreground uppercase tracking-wider">
                <Briefcase className="h-3.5 w-3.5 text-primary" /> Master Schedule
              </div>
              <div className="space-y-1 text-[10px]">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Total Activities:</span>
                  <span className="font-mono font-bold text-foreground">{allTasks.length}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Project Start:</span>
                  <span className="font-mono text-foreground">
                    {allTasks.length ? format(new Date(Math.min(...allTasks.map((t) => new Date(t.startDate).getTime()))), "dd MMM yyyy") : "—"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Target Finish:</span>
                  <span className="font-mono text-foreground">
                    {allTasks.length ? format(new Date(Math.max(...allTasks.map((t) => new Date(t.endDate).getTime()))), "dd MMM yyyy") : "—"}
                  </span>
                </div>
                <div className="flex items-center justify-between pt-1 border-t border-border/40">
                  <span className="text-muted-foreground">Planned Contract Value:</span>
                  <span className="font-mono font-bold text-primary">
                    {formatNpr(allTasks.reduce((s, t) => s + (t.plannedValue || 0), 0))}
                  </span>
                </div>
              </div>
            </div>

            <div className="rounded border border-border bg-card p-3 space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-foreground uppercase tracking-wider">
                <TrendingUp className="h-3.5 w-3.5 text-emerald-600" /> Overall Progress
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[11px] font-bold">
                  <span>Schedule Completion:</span>
                  <span className="font-mono text-emerald-600">
                    {allTasks.length ? Math.round(allTasks.reduce((s, t) => s + (t.progress || 0), 0) / allTasks.length) : 0}%
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-emerald-600 rounded-full"
                    style={{
                      width: `${allTasks.length ? Math.round(allTasks.reduce((s, t) => s + (t.progress || 0), 0) / allTasks.length) : 0}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Resource Inspector Tab */}
        {activeTab === "resource" && (
          <div className="space-y-3">
            <div className="rounded border border-border bg-card p-3 space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-foreground uppercase tracking-wider">
                <Users className="h-3.5 w-3.5 text-primary" /> Resource Directory
              </div>
              <p className="text-[10px] text-muted-foreground">
                Manage resource allocation, daily capacity, and hourly rate calculations for site crews.
              </p>
              <div className="space-y-1.5 pt-1 text-[10px]">
                <div className="flex items-center justify-between p-1.5 rounded bg-muted/20 border border-border/60">
                  <span className="font-medium">Civil Engineering Crew</span>
                  <span className="font-mono font-bold text-foreground">8 hrs/day</span>
                </div>
                <div className="flex items-center justify-between p-1.5 rounded bg-muted/20 border border-border/60">
                  <span className="font-medium">Heavy Plant & Equipment</span>
                  <span className="font-mono font-bold text-foreground">10 hrs/day</span>
                </div>
                <div className="flex items-center justify-between p-1.5 rounded bg-muted/20 border border-border/60">
                  <span className="font-medium">Supervision & QA/QC</span>
                  <span className="font-mono font-bold text-foreground">Standard</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Milestone Inspector Tab */}
        {activeTab === "milestone" && (
          <div className="space-y-3">
            <div className="rounded border border-border bg-card p-3 space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-foreground uppercase tracking-wider">
                <Diamond className="h-3.5 w-3.5 text-amber-500" /> Milestone Configuration
              </div>
              <div className="space-y-2 text-[10px]">
                <label className="flex items-center gap-2 p-2 rounded border border-border bg-muted/20 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={task.isMilestone}
                    disabled={!canWrite}
                    onChange={(e) => updateMutation.mutate({ taskId: task.id, isMilestone: e.target.checked })}
                    className="rounded border-border text-amber-500 focus:ring-0"
                  />
                  <div>
                    <div className="font-bold text-foreground">Contractual Milestone</div>
                    <div className="text-[9px] text-muted-foreground">Zero duration deliverable checkpoint with diamond marker</div>
                  </div>
                </label>

                <div className="space-y-1 pt-1">
                  <span className="text-[9px] text-muted-foreground uppercase font-mono">Milestone Type</span>
                  <select className="w-full h-6 rounded border border-border bg-background px-1 text-[10px]">
                    <option>Contractual Key Date</option>
                    <option>Interim Payment Installment</option>
                    <option>Substantial Completion (TOC)</option>
                    <option>Final Handover & DLC</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Styles Inspector Tab */}
        {activeTab === "styles" && (
          <div className="space-y-3">
            <div className="rounded border border-border bg-card p-3 space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-foreground uppercase tracking-wider">
                <Palette className="h-3.5 w-3.5 text-primary" /> Task Appearance
              </div>
              <div className="space-y-2 text-[10px]">
                <div className="space-y-1">
                  <span className="text-[9px] text-muted-foreground">Activity Bar Color</span>
                  <div className="flex items-center gap-2">
                    <div className="h-5 w-5 rounded bg-primary border border-border" />
                    <span className="font-mono text-muted-foreground">Theme Default (#3b82f6)</span>
                  </div>
                </div>

                <div className="space-y-1 pt-1 border-t border-border/40">
                  <span className="text-[9px] text-muted-foreground">Critical Status Accent</span>
                  <div className="flex items-center gap-2">
                    <div className="h-5 w-5 rounded bg-destructive border border-border" />
                    <span className="font-mono text-muted-foreground">Critical Crimson (#dc2626)</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
