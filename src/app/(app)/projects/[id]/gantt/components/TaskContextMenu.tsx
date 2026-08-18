"use client";

import React, { useEffect, useRef } from "react";
import {
  Edit3,
  Plus,
  CornerDownRight,
  ArrowRight,
  ArrowLeft,
  Copy,
  Star,
  Trash2,
  Clock,
  Droplets,
  ShieldAlert,
  Diamond,
  CheckCircle2,
  Calendar,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Task } from "../types";

export type ContextMenuPosition = {
  x: number;
  y: number;
  task: Task;
};

interface TaskContextMenuProps {
  position: ContextMenuPosition | null;
  onClose: () => void;
  onOpenInspector: (task: Task) => void;
  onAddTaskBelow: (task: Task) => void;
  onAddSubtask: (task: Task) => void;
  onIndent: (task: Task) => void;
  onOutdent: (task: Task) => void;
  onReplicate: (task: Task) => void;
  onSaveTemplate: (task: Task) => void;
  onSetTaskType: (task: Task, taskType: string | null) => void;
  onToggleMilestone: (task: Task) => void;
  onDelete: (task: Task) => void;
  canIndent?: boolean;
  canOutdent?: boolean;
  canWrite?: boolean;
}

export function TaskContextMenu({
  position,
  onClose,
  onOpenInspector,
  onAddTaskBelow,
  onAddSubtask,
  onIndent,
  onOutdent,
  onReplicate,
  onSaveTemplate,
  onSetTaskType,
  onToggleMilestone,
  onDelete,
  canIndent = true,
  canOutdent = true,
  canWrite = true,
}: TaskContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!position) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("scroll", onClose, true);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("scroll", onClose, true);
    };
  }, [position, onClose]);

  if (!position) return null;

  const { x, y, task } = position;

  // Viewport bounds detection
  const menuWidth = 240;
  const menuHeight = 380;
  const screenW = typeof window !== "undefined" ? window.innerWidth : 1200;
  const screenH = typeof window !== "undefined" ? window.innerHeight : 800;

  const left = x + menuWidth > screenW ? Math.max(10, x - menuWidth) : x;
  const top = y + menuHeight > screenH ? Math.max(10, y - menuHeight) : y;

  return (
    <div
      ref={menuRef}
      style={{ left: `${left}px`, top: `${top}px` }}
      className="fixed z-50 w-60 rounded-xl border border-slate-700/80 bg-slate-900/95 p-1.5 shadow-2xl backdrop-blur-xl animate-in fade-in zoom-in-95 duration-100 font-sans text-xs text-slate-200 select-none ring-1 ring-white/10"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header with task name */}
      <div className="px-2.5 py-1.5 border-b border-slate-800/80 mb-1 flex items-center justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            {task.code && (
              <span className="text-[10px] font-mono font-bold text-emerald-400">
                WBS {task.code}
              </span>
            )}
            <span className="text-[11px] font-medium text-slate-100 truncate block">
              {task.name}
            </span>
          </div>
        </div>
      </div>

      {/* Primary Actions */}
      <div className="space-y-0.5">
        <button
          type="button"
          onClick={() => {
            onOpenInspector(task);
            onClose();
          }}
          className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left hover:bg-slate-800 text-slate-200 hover:text-white transition-colors"
        >
          <Edit3 className="h-3.5 w-3.5 text-blue-400" />
          <span className="flex-1">Task Inspector</span>
          <kbd className="text-[9px] font-mono text-slate-500 bg-slate-800 px-1 py-0.5 rounded">Space</kbd>
        </button>

        {canWrite && (
          <>
            <button
              type="button"
              onClick={() => {
                onAddTaskBelow(task);
                onClose();
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left hover:bg-slate-800 text-slate-200 hover:text-white transition-colors"
            >
              <Plus className="h-3.5 w-3.5 text-emerald-400" />
              <span className="flex-1">Insert Task Below</span>
              <kbd className="text-[9px] font-mono text-slate-500 bg-slate-800 px-1 py-0.5 rounded">Enter</kbd>
            </button>

            <button
              type="button"
              onClick={() => {
                onAddSubtask(task);
                onClose();
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left hover:bg-slate-800 text-slate-200 hover:text-white transition-colors"
            >
              <CornerDownRight className="h-3.5 w-3.5 text-indigo-400" />
              <span className="flex-1">Add Child Subtask</span>
            </button>
          </>
        )}
      </div>

      {/* Templates & Replication */}
      <div className="my-1 border-t border-slate-800/80 pt-1 space-y-0.5">
        <button
          type="button"
          onClick={() => {
            onReplicate(task);
            onClose();
          }}
          className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left hover:bg-slate-800 text-slate-200 hover:text-white transition-colors"
        >
          <Copy className="h-3.5 w-3.5 text-purple-400" />
          <span>Replicate Structure...</span>
        </button>

        <button
          type="button"
          onClick={() => {
            onSaveTemplate(task);
            onClose();
          }}
          className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left hover:bg-slate-800 text-slate-200 hover:text-white transition-colors"
        >
          <Star className="h-3.5 w-3.5 text-amber-400" />
          <span>Save as Template...</span>
        </button>
      </div>

      {/* Indentation & Hierarchy */}
      {canWrite && (
        <div className="my-1 border-t border-slate-800/80 pt-1 space-y-0.5">
          <button
            type="button"
            disabled={!canIndent}
            onClick={() => {
              onIndent(task);
              onClose();
            }}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left transition-colors",
              canIndent
                ? "hover:bg-slate-800 text-slate-200 hover:text-white"
                : "opacity-40 cursor-not-allowed text-slate-500"
            )}
          >
            <ArrowRight className="h-3.5 w-3.5 text-cyan-400" />
            <span className="flex-1">Indent (Subtask)</span>
            <kbd className="text-[9px] font-mono text-slate-500 bg-slate-800 px-1 py-0.5 rounded">Tab</kbd>
          </button>

          <button
            type="button"
            disabled={!canOutdent}
            onClick={() => {
              onOutdent(task);
              onClose();
            }}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left transition-colors",
              canOutdent
                ? "hover:bg-slate-800 text-slate-200 hover:text-white"
                : "opacity-40 cursor-not-allowed text-slate-500"
            )}
          >
            <ArrowLeft className="h-3.5 w-3.5 text-teal-400" />
            <span className="flex-1">Outdent (Promote)</span>
            <kbd className="text-[9px] font-mono text-slate-500 bg-slate-800 px-1 py-0.5 rounded">⇧ Tab</kbd>
          </button>
        </div>
      )}

      {/* Task Type Quick Toggle */}
      {canWrite && (
        <div className="my-1 border-t border-slate-800/80 pt-1">
          <div className="px-2.5 py-0.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
            Task Type
          </div>
          <div className="grid grid-cols-2 gap-1 px-1 py-1">
            <button
              type="button"
              onClick={() => {
                onSetTaskType(task, null);
                onClose();
              }}
              className={cn(
                "flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-medium border text-left",
                !task.taskType
                  ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-300"
                  : "bg-slate-800/60 border-slate-700/50 hover:bg-slate-800 text-slate-300"
              )}
            >
              <CheckCircle2 className="h-3 w-3" />
              <span>Standard</span>
            </button>

            <button
              type="button"
              onClick={() => {
                onSetTaskType(task, task.taskType === "continuous_24_7" ? null : "continuous_24_7");
                onClose();
              }}
              className={cn(
                "flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-medium border text-left",
                task.taskType === "continuous_24_7"
                  ? "bg-amber-500/20 border-amber-500/50 text-amber-300"
                  : "bg-slate-800/60 border-slate-700/50 hover:bg-slate-800 text-slate-300"
              )}
            >
              <Clock className="h-3 w-3" />
              <span>24/7 Shift</span>
            </button>

            <button
              type="button"
              onClick={() => {
                onSetTaskType(task, task.taskType === "elapsed_curing" ? null : "elapsed_curing");
                onClose();
              }}
              className={cn(
                "flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-medium border text-left",
                task.taskType === "elapsed_curing"
                  ? "bg-cyan-500/20 border-cyan-500/50 text-cyan-300"
                  : "bg-slate-800/60 border-slate-700/50 hover:bg-slate-800 text-slate-300"
              )}
            >
              <Droplets className="h-3 w-3" />
              <span>Curing</span>
            </button>

            <button
              type="button"
              onClick={() => {
                onSetTaskType(task, task.taskType === "buffer" ? null : "buffer");
                onClose();
              }}
              className={cn(
                "flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-medium border text-left",
                task.taskType === "buffer"
                  ? "bg-orange-500/20 border-orange-500/50 text-orange-300"
                  : "bg-slate-800/60 border-slate-700/50 hover:bg-slate-800 text-slate-300"
              )}
            >
              <ShieldAlert className="h-3 w-3" />
              <span>Buffer</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              onToggleMilestone(task);
              onClose();
            }}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left transition-colors mt-0.5",
              task.isMilestone
                ? "bg-amber-500/20 text-amber-300 hover:bg-amber-500/30"
                : "hover:bg-slate-800 text-slate-200 hover:text-white"
            )}
          >
            <Diamond className="h-3.5 w-3.5 text-amber-400" />
            <span className="flex-1">{task.isMilestone ? "Convert to Task (0d)" : "Set as Milestone"}</span>
          </button>
        </div>
      )}

      {/* Delete Action */}
      {canWrite && (
        <div className="my-1 border-t border-slate-800/80 pt-1">
          <button
            type="button"
            onClick={() => {
              onDelete(task);
              onClose();
            }}
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left hover:bg-red-500/20 text-red-400 hover:text-red-300 transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span className="flex-1">Delete Task</span>
            <kbd className="text-[9px] font-mono text-red-400/70 bg-red-950/40 px-1 py-0.5 rounded">Del</kbd>
          </button>
        </div>
      )}
    </div>
  );
}
