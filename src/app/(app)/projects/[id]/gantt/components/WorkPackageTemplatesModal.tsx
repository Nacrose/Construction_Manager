"use client";

import React, { useState, useMemo } from "react";
import {
  X,
  Search,
  Plus,
  Layers,
  Calendar as CalendarIcon,
  CheckCircle2,
  Clock,
  Trash2,
  ArrowRight,
  ShieldAlert,
  Zap,
  FolderGit2,
  Sparkles,
} from "lucide-react";
import { trpc } from "@/lib/trpc-client";
import { toast } from "sonner";
import { format } from "date-fns";
import { adToBs } from "@/lib/nepali-calendar";
import type { Task } from "../types";
import type { WorkPackageTemplateDef } from "@/server/utils/work-package-templates";

interface WorkPackageTemplatesModalProps {
  projectId: string;
  versionId?: string;
  isOpen: boolean;
  onClose: () => void;
  tasks: Task[];
  onInserted?: (newTaskId: string) => void;
  replicateSourceTask?: Task | null;
  onClearReplicateSource?: () => void;
}

const CATEGORIES = [
  { id: "all", label: "All Templates", icon: Layers },
  { id: "custom", label: "⭐ My Saved", icon: Sparkles },
  { id: "structures", label: "🏗️ Cross Drainage", icon: Layers },
  { id: "bridges", label: "🌉 Bridges & Piling", icon: FolderGit2 },
  { id: "highways", label: "🛣️ Road & Pavement", icon: Zap },
  { id: "buildings", label: "🏢 Building Cycles", icon: Layers },
];

export function WorkPackageTemplatesModal({
  projectId,
  versionId,
  isOpen,
  onClose,
  tasks,
  onInserted,
  replicateSourceTask,
  onClearReplicateSource,
}: WorkPackageTemplatesModalProps) {
  const utils = trpc.useUtils();
  const [selectedCat, setSelectedCat] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("builtin-dor-box-culvert-2cell");

  // Insertion form state
  const [instanceName, setInstanceName] = useState("");
  const [startDateStr, setStartDateStr] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [selectedParentId, setSelectedParentId] = useState<string>("");
  const [isNepaliMode, setIsNepaliMode] = useState(true);

  // Direct branch replication mode
  const isReplicationMode = !!replicateSourceTask;
  const [repName, setRepName] = useState("");
  const [repStartDate, setRepStartDate] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [repParentId, setRepParentId] = useState<string>("");

  React.useEffect(() => {
    if (replicateSourceTask) {
      setRepName(`${replicateSourceTask.name} (Copy)`);
      setRepStartDate(format(new Date(replicateSourceTask.startDate), "yyyy-MM-dd"));
      setRepParentId(replicateSourceTask.parentId || "");
    }
  }, [replicateSourceTask]);

  // Fetch templates
  const { data: templatesData, isLoading } = trpc.gantt.listTemplates.useQuery(
    { projectId },
    { enabled: isOpen && !isReplicationMode }
  );

  const templates: WorkPackageTemplateDef[] = templatesData?.templates || [];

  const filteredTemplates = useMemo(() => {
    return templates.filter((t) => {
      const matchCat = selectedCat === "all" || t.category === selectedCat;
      const matchQuery =
        !searchQuery ||
        t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.tags.some((tag) => tag.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchCat && matchQuery;
    });
  }, [templates, selectedCat, searchQuery]);

  const activeTemplate = useMemo(() => {
    return templates.find((t) => t.id === selectedTemplateId) || filteredTemplates[0] || null;
  }, [templates, selectedTemplateId, filteredTemplates]);

  React.useEffect(() => {
    if (activeTemplate && !instanceName) {
      setInstanceName(activeTemplate.name);
    }
  }, [activeTemplate]);

  // Mutations
  const insertMutation = trpc.gantt.insertFromTemplate.useMutation({
    onSuccess: (data) => {
      toast.success(`Inserted work package "${data.name}" into schedule!`);
      utils.gantt.list.invalidate();
      onInserted?.(data.parentTaskId);
      onClose();
    },
    onError: (err) => {
      toast.error(err.message || "Failed to insert template");
    },
  });

  const replicateMutation = trpc.gantt.replicateBranch.useMutation({
    onSuccess: (data) => {
      toast.success(`Replicated "${data.name}" with ${data.totalCloned} tasks!`);
      utils.gantt.list.invalidate();
      onInserted?.(data.rootTaskId);
      onClearReplicateSource?.();
      onClose();
    },
    onError: (err) => {
      toast.error(err.message || "Failed to replicate branch");
    },
  });

  const deleteTemplateMutation = trpc.gantt.deleteTemplate.useMutation({
    onSuccess: () => {
      toast.success("Template deleted");
      utils.gantt.listTemplates.invalidate();
    },
    onError: (err) => {
      toast.error(err.message || "Failed to delete template");
    },
  });

  if (!isOpen) return null;

  // Handle direct branch replication UI
  if (isReplicationMode && replicateSourceTask) {
    const handleReplicateSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      replicateMutation.mutate({
        projectId,
        versionId,
        taskId: replicateSourceTask.id,
        newStartDate: repStartDate,
        newName: repName.trim() || undefined,
        targetParentId: repParentId || null,
      });
    };

    const bsRep = adToBs(new Date(repStartDate));

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in duration-150">
        <div className="relative w-full max-w-xl rounded-xl border border-border bg-[var(--navy-mid)] p-6 shadow-2xl text-foreground">
          <div className="flex items-center justify-between pb-4 border-b border-border">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
                ⎘
              </div>
              <div>
                <h2 className="text-base font-semibold text-white">Replicate Task Branch</h2>
                <p className="text-xs text-muted-foreground/80">
                  Clones <span className="text-emerald-400 font-medium">{replicateSourceTask.name}</span> and all subtasks with shifted dates and intact dependencies.
                </p>
              </div>
            </div>
            <button
              onClick={() => {
                onClearReplicateSource?.();
                onClose();
              }}
              className="p-1 text-muted-foreground/80 hover:text-white rounded-lg hover:bg-[var(--navy-mid)]"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <form onSubmit={handleReplicateSubmit} className="mt-5 space-y-4">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                New Structure Name / Chainage
              </label>
              <input
                type="text"
                value={repName}
                onChange={(e) => setRepName(e.target.value)}
                placeholder="e.g. Box Culvert at Ch 18+200"
                required
                className="w-full rounded-lg border border-border bg-[var(--navy-mid)]/80 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">
                  New Start Date (Gregorian AD)
                </label>
                <input
                  type="date"
                  value={repStartDate}
                  onChange={(e) => setRepStartDate(e.target.value)}
                  required
                  className="w-full rounded-lg border border-border bg-[var(--navy-mid)]/80 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
                />
                <div className="mt-1 text-[11px] text-emerald-400 font-mono">
                  BS: {bsRep.display}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">
                  Destination Parent Task
                </label>
                <select
                  value={repParentId}
                  onChange={(e) => setRepParentId(e.target.value)}
                  className="w-full rounded-lg border border-border bg-[var(--navy-mid)]/80 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
                >
                  <option value="">(Root Level / Top Section)</option>
                  {tasks
                    .filter((t) => t.id !== replicateSourceTask.id)
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.code ? `[${t.code}] ` : ""}{t.name}
                      </option>
                    ))}
                </select>
              </div>
            </div>

            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3 text-xs text-emerald-300 flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                All relative predecessor and successor links (FS, SS, FF with lags) between subtasks will be preserved and shifted automatically.
              </span>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
              <button
                type="button"
                onClick={() => {
                  onClearReplicateSource?.();
                  onClose();
                }}
                className="px-4 py-2 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:bg-[var(--navy-mid)]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={replicateMutation.isPending}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-lg shadow-emerald-900/40 disabled:opacity-50"
              >
                {replicateMutation.isPending ? "Replicating..." : "🚀 Replicate into Schedule"}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // Standard Template Manager UI
  const handleInsertTemplate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTemplate) return;

    insertMutation.mutate({
      projectId,
      versionId,
      templateId: activeTemplate.id,
      startDate: startDateStr,
      customName: instanceName.trim() || activeTemplate.name,
      targetParentId: selectedParentId || null,
    });
  };

  const bsDate = adToBs(new Date(startDateStr));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="relative flex flex-col h-[90vh] w-full max-w-5xl rounded-xl border border-border bg-[var(--navy-mid)] shadow-2xl text-foreground overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-[var(--navy-deep)]/60">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
              📑
            </div>
            <div>
              <h2 className="text-base font-semibold text-white flex items-center gap-2">
                Work Package & Structure Template Library
                <span className="rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
                  Standard Civil Norms
                </span>
              </h2>
              <p className="text-xs text-muted-foreground/80">
                Instantly insert repetitive structures (Box Culverts, Pavements, Piles, Floor Cycles) with verified dependencies.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-muted-foreground/80 hover:text-white rounded-lg hover:bg-[var(--navy-mid)] transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Body: 2 Columns */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Sidebar: Categories & Templates List */}
          <div className="w-80 border-r border-border flex flex-col bg-[var(--navy-mid)]/60">
            {/* Search */}
            <div className="p-3 border-b border-border">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground/80" />
                <input
                  type="text"
                  placeholder="Search templates..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-lg border border-border bg-[var(--navy-mid)]/90 pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Category Filter Pills */}
            <div className="p-2 border-b border-border flex flex-wrap gap-1">
              {CATEGORIES.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setSelectedCat(c.id)}
                  className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                    selectedCat === c.id
                      ? "bg-emerald-600 text-white shadow-sm"
                      : "bg-[var(--navy-mid)]/60 text-muted-foreground/80 hover:bg-[var(--navy-mid)] hover:text-foreground"
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>

            {/* Template List */}
            <div className="flex-1 overflow-y-auto p-2 space-y-1.5 divide-y divide-slate-800/40">
              {isLoading ? (
                <div className="p-4 text-center text-xs text-muted-foreground">Loading templates...</div>
              ) : filteredTemplates.length === 0 ? (
                <div className="p-6 text-center text-xs text-muted-foreground">No templates found matching your search.</div>
              ) : (
                filteredTemplates.map((t) => {
                  const isSelected = activeTemplate?.id === t.id;
                  const isCustom = t.category === "custom";

                  return (
                    <div
                      key={t.id}
                      onClick={() => {
                        setSelectedTemplateId(t.id);
                        setInstanceName(t.name);
                      }}
                      className={`p-2.5 rounded-lg cursor-pointer transition-all border ${
                        isSelected
                          ? "bg-emerald-500/10 border-emerald-500/40 shadow-sm"
                          : "bg-[var(--navy-mid)]/30 border-transparent hover:bg-[var(--navy-mid)]/70 hover:border-border"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-1">
                        <div className="font-medium text-xs text-foreground leading-tight">
                          {t.name}
                        </div>
                        {isCustom && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (confirm("Delete this custom template?")) {
                                deleteTemplateMutation.mutate({ templateId: t.id });
                              }
                            }}
                            className="text-muted-foreground hover:text-red-400 p-0.5"
                            title="Delete Template"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}
                      </div>

                      <div className="mt-1.5 flex items-center gap-2 text-[10px] text-muted-foreground/80 font-mono">
                        <span className="flex items-center gap-0.5 text-emerald-400">
                          <Clock className="h-2.5 w-2.5" /> {t.totalDurationDays}d
                        </span>
                        <span>•</span>
                        <span>{t.subtaskCount} steps</span>
                        {isCustom && (
                          <span className="ml-auto rounded bg-amber-500/20 text-amber-300 px-1 text-[9px] font-sans">
                            Saved
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Right Main Panel: Template Details & Insertion Form */}
          <div className="flex-1 flex flex-col overflow-y-auto bg-[var(--navy-deep)]/40 p-6">
            {activeTemplate ? (
              <div className="flex flex-col h-full space-y-6">
                {/* Header */}
                <div className="border-b border-border pb-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-lg font-bold text-white flex items-center gap-2">
                        {activeTemplate.name}
                      </h3>
                      <p className="mt-1 text-xs text-muted-foreground/80 leading-relaxed max-w-2xl">
                        {activeTemplate.description}
                      </p>
                    </div>
                    <div className="flex flex-col items-end">
                      <div className="rounded-lg bg-emerald-500/20 border border-emerald-500/30 px-3 py-1 text-xs font-semibold text-emerald-400 font-mono">
                        ⏱ Total: {activeTemplate.totalDurationDays} Days
                      </div>
                      <div className="mt-1 text-[11px] text-muted-foreground font-mono">
                        {activeTemplate.subtaskCount} Subtasks
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {activeTemplate.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-md bg-[var(--navy-mid)] px-2 py-0.5 text-[10px] font-medium text-muted-foreground border border-border"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Workflow Sequence Steps */}
                <div className="flex-1 space-y-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/80">
                    Workflow Sequence & Dependency Chain
                  </h4>

                  <div className="rounded-lg border border-border bg-[var(--navy-mid)]/90 divide-y divide-slate-800/60 overflow-hidden">
                    {activeTemplate.subtasks.map((st, idx) => {
                      const hasDeps = st.predecessorTempIds && st.predecessorTempIds.length > 0;
                      const isElapsed = st.taskType === "elapsed_curing";
                      const isContinuous = st.taskType === "continuous_24_7";

                      return (
                        <div
                          key={st.tempId}
                          className="px-3.5 py-2.5 flex items-center justify-between text-xs hover:bg-[var(--navy-mid)]/40 transition-colors"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--navy-mid)] text-[10px] font-mono text-muted-foreground/80 border border-border">
                              {idx + 1}
                            </span>
                            <div className="truncate">
                              <span className="font-medium text-foreground">{st.name}</span>
                              {isElapsed && (
                                <span className="ml-2 rounded bg-cyan-500/20 text-info border border-info/40 px-1.5 py-0.2 text-[9.5px]">
                                  ⚡ Curing (Elapsed)
                                </span>
                              )}
                              {isContinuous && (
                                <span className="ml-2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 px-1.5 py-0.2 text-[9.5px]">
                                  24/7 Shift
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-3 shrink-0 font-mono text-[11px]">
                            {hasDeps && (
                              <span className="text-[10px] text-muted-foreground/80 bg-[var(--navy-mid)]/80 px-2 py-0.5 rounded border border-border/60">
                                {st.predecessorTempIds?.map((p) => `${p.type} ➔ #${p.tempId}${p.offset ? `+${p.offset}d` : ""}`).join(", ")}
                              </span>
                            )}
                            <span className="font-semibold text-emerald-400 w-12 text-right">
                              {st.duration}d
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Insertion Form Box */}
                <form
                  onSubmit={handleInsertTemplate}
                  className="rounded-xl border border-border bg-[var(--navy-mid)] p-4 space-y-4 shadow-lg"
                >
                  <div className="text-xs font-semibold text-white flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
                    Insert into Current Schedule
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="md:col-span-1">
                      <label className="block text-[11px] font-medium text-muted-foreground mb-1">
                        Instance Name
                      </label>
                      <input
                        type="text"
                        value={instanceName}
                        onChange={(e) => setInstanceName(e.target.value)}
                        placeholder="e.g. Box Culvert at Ch 18+200"
                        required
                        className="w-full rounded-lg border border-border bg-[var(--navy-mid)] px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-medium text-muted-foreground mb-1">
                        Start Date (AD)
                      </label>
                      <input
                        type="date"
                        value={startDateStr}
                        onChange={(e) => setStartDateStr(e.target.value)}
                        required
                        className="w-full rounded-lg border border-border bg-[var(--navy-mid)] px-3 py-1.5 text-xs text-white focus:border-emerald-500 focus:outline-none font-mono"
                      />
                      <div className="mt-0.5 text-[10px] text-emerald-400 font-mono">
                        BS: {bsDate.display}
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-medium text-muted-foreground mb-1">
                        Nest Under Parent Task
                      </label>
                      <select
                        value={selectedParentId}
                        onChange={(e) => setSelectedParentId(e.target.value)}
                        className="w-full rounded-lg border border-border bg-[var(--navy-mid)] px-3 py-1.5 text-xs text-white focus:border-emerald-500 focus:outline-none truncate"
                      >
                        <option value="">(Root Level / Top Section)</option>
                        {tasks.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.code ? `[${t.code}] ` : ""}{t.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-border">
                    <span className="text-[11px] text-muted-foreground/80">
                      Creates 1 parent structure + {activeTemplate.subtaskCount} subtasks linked in sequence.
                    </span>
                    <button
                      type="submit"
                      disabled={insertMutation.isPending}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-lg shadow-emerald-900/40 transition-all disabled:opacity-50"
                    >
                      {insertMutation.isPending ? "Inserting..." : "🚀 Insert into Schedule"}
                    </button>
                  </div>
                </form>
              </div>
            ) : (
              <div className="flex h-full items-center justify-center text-muted-foreground text-xs">
                Select a template from the library to view details
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
