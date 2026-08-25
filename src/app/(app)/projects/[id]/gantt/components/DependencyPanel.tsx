"use client";

import { useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc-client";
import { Plus, Loader2, Link2, X, Info } from "lucide-react";
import type { Task, Dependency } from "../types";

export function DependencyPanel({
  task,
  allTasks,
  canWrite,
  deps,
  projectId,
}: {
  task: Task;
  allTasks: Task[];
  canWrite: boolean;
  deps: Dependency[];
  projectId: string;
}) {
  const utils = trpc.useUtils();
  const [selectedTaskId, setSelectedTaskId] = useState("");
  const [depType, setDepType] = useState<"FS" | "SS" | "FF" | "SF">("FS");
  const [offset, setOffset] = useState("0");

  const available = allTasks.filter(
    (t) => t.id !== task.id && !deps.some((d) => d.taskId === t.id),
  );

  const addDepMutation = trpc.gantt.addDependency.useMutation({
    onSuccess: (res) => {
      utils.gantt.list.invalidate({ projectId });
      setSelectedTaskId("");
      setOffset("0");
      if (res.updatedCount > 0) {
        toast.success(
          `Dependency added — ${res.updatedCount} downstream task${res.updatedCount > 1 ? "s" : ""} rescheduled`
        );
      } else {
        toast.success("Dependency added");
      }
    },
    onError: (e) => toast.error(e.message),
  });

  const removeDepMutation = trpc.gantt.removeDependency.useMutation({
    onMutate: () => toast.loading("Removing dependency..."),
    onSuccess: (res) => {
      utils.gantt.list.invalidate({ projectId });
      if (res.updatedCount > 0) {
        toast.success(
          `Dependency removed — ${res.updatedCount} downstream task${res.updatedCount > 1 ? "s" : ""} rescheduled`
        );
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
        toast.success(
          `Dependencies applied — ${res.updatedCount} downstream task${res.updatedCount > 1 ? "s" : ""} rescheduled`
        );
      } else {
        toast.success("Dependencies applied");
      }
    },
    onError: (e) => toast.error(e.message),
  });

  const addDep = () => {
    if (!selectedTaskId) return;
    addDepMutation.mutate({
      taskId: task.id,
      predecessorId: selectedTaskId,
      type: depType,
      offset: parseInt(offset) || 0,
    });
  };

  const removeDep = (predecessorId: string) => {
    removeDepMutation.mutate({ taskId: task.id, predecessorId });
  };

  const applyDeps = () => {
    setDepsMutation.mutate({
      taskId: task.id,
      dependencies: deps.map((d) => ({
        predecessorId: d.taskId,
        type: d.type,
        offset: d.offset,
      })),
    });
  };

  return (
    <div className="flex border-b bg-purple-50/30 dark:bg-purple-950/10">
      <div className="flex-1 px-3 py-2 space-y-1.5">
        {deps.length > 0 && (
          <div className="space-y-1">
            {deps.map((d) => {
              const pred = allTasks.find((t) => t.id === d.taskId);
              if (!pred) return null;
              return (
                <div key={d.taskId} className="flex items-center gap-2 rounded bg-background px-2 py-1 text-xs">
                  <Link2 className="h-3 w-3 text-purple-600 dark:text-purple-400 shrink-0" />
                  <span className="rounded bg-muted px-1 py-0.5 font-mono text-[10px] font-semibold shrink-0">
                    {pred.code ?? "?"}
                  </span>
                  <span className="truncate flex-1 font-medium">{pred.name}</span>
                  <span className="rounded bg-purple-100 px-1.5 py-0.5 text-[10px] font-bold text-purple-700 dark:bg-purple-950 dark:text-purple-300 shrink-0">
                    {d.type}
                  </span>
                  <span className="text-muted-foreground shrink-0">
                    {d.offset >= 0 ? "+" : ""}{d.offset}d
                  </span>
{canWrite && (
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          removeDep(d.taskId);
                        }}
                        className="rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive shrink-0 border border-destructive/20"
                        title="Remove dependency"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                </div>
              );
            })}
            {canWrite && (
              <button
                onClick={applyDeps}
                disabled={setDepsMutation.isPending}
                className="flex items-center gap-1 rounded px-2 py-1 text-[10px] font-medium text-purple-700 hover:bg-purple-100 dark:text-purple-400 dark:hover:bg-purple-950"
                title="Recalculate task dates based on dependencies"
              >
                <Loader2 className={cn("h-3 w-3", !setDepsMutation.isPending && "hidden")} />
                ↻ Recalculate dates from dependencies
              </button>
            )}
          </div>
        )}

        {canWrite && available.length > 0 && (
          <div className="flex items-center gap-1.5">
            <select
              value={selectedTaskId}
              onChange={(e) => setSelectedTaskId(e.target.value)}
              className="h-7 flex-1 rounded border bg-background px-1.5 text-xs"
            >
              <option value="">+ Add predecessor…</option>
              {available.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.code} · {t.name}
                </option>
              ))}
            </select>
            <div className="flex items-center gap-1">
              <select
                value={depType}
                onChange={(e) => setDepType(e.target.value as "FS" | "SS" | "FF" | "SF")}
                className="h-7 w-14 rounded border bg-background px-1 text-xs font-bold"
              >
                <option value="FS">FS</option>
                <option value="SS">SS</option>
                <option value="FF">FF</option>
                <option value="SF">SF</option>
              </select>
              <div className="group relative">
                <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 w-56 -translate-x-1/2 rounded-lg border bg-popover p-2.5 text-xs shadow-lg opacity-0 transition-opacity group-hover:opacity-100">
                  <div className="space-y-1.5">
                    <p className="font-semibold text-foreground">Dependency types</p>
                    <div className="space-y-1 text-muted-foreground">
                      <p><span className="font-mono font-bold text-purple-600 dark:text-purple-400">FS</span> Finish → Start — task B starts after task A finishes</p>
                      <p><span className="font-mono font-bold text-purple-600 dark:text-purple-400">SS</span> Start → Start — task B starts after task A starts</p>
                      <p><span className="font-mono font-bold text-purple-600 dark:text-purple-400">FF</span> Finish → Finish — task B finishes after task A finishes</p>
                      <p><span className="font-mono font-bold text-purple-600 dark:text-purple-400">SF</span> Start → Finish — task B finishes after task A starts</p>
                    </div>
                    <p className="pt-1 text-[10px] text-muted-foreground/60">Offset: positive = lag, negative = lead</p>
                  </div>
                </div>
              </div>
            </div>
            <input
              type="number"
              value={offset}
              onChange={(e) => setOffset(e.target.value)}
              placeholder="±d"
              className="h-7 w-12 rounded border bg-background px-1.5 text-xs text-center"
              title="Offset in days (positive = lag, negative = lead)"
              disabled={!selectedTaskId}
              onKeyDown={(e) => {
                if (e.key === "Enter" && selectedTaskId) {
                  e.preventDefault();
                  addDep();
                }
              }}
            />
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                addDep();
              }}
              disabled={!selectedTaskId || addDepMutation.isPending}
              className="flex h-7 w-7 items-center justify-center rounded bg-purple-600 text-white disabled:opacity-40 hover:bg-purple-700"
              title="Add dependency"
            >
              {addDepMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            </button>
          </div>
        )}

        {deps.length === 0 && !canWrite && (
          <p className="text-xs text-muted-foreground py-1">No dependencies.</p>
        )}
        {deps.length === 0 && canWrite && available.length === 0 && (
          <p className="text-xs text-muted-foreground py-1">No tasks available to depend on.</p>
        )}
      </div>
    </div>
  );
}
