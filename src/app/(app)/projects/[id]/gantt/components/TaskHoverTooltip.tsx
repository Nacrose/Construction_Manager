"use client";

import React, { useMemo } from "react";
import { format, differenceInDays } from "date-fns";
import {
  Calendar,
  Clock,
  Zap,
  Users,
  CheckCircle2,
  Droplets,
  ShieldAlert,
  Diamond,
  Link2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { adToBs } from "@/lib/nepali-calendar";
import type { Task } from "../types";

export type HoverTooltipPosition = {
  x: number;
  y: number;
  task: Task;
};

interface TaskHoverTooltipProps {
  hoverData: HoverTooltipPosition | null;
  taskMap: Map<string, Task>;
  isCritical?: boolean;
  totalFloat?: number;
}

export function TaskHoverTooltip({
  hoverData,
  taskMap,
  isCritical = false,
  totalFloat,
}: TaskHoverTooltipProps) {
  if (!hoverData) return null;

  const { x, y, task } = hoverData;

  const start = new Date(task.startDate);
  const end = new Date(task.endDate);
  const dur = Math.max(1, differenceInDays(end, start) + 1);

  // Dual Calendar calculations
  let bsStartDisplay = "";
  let bsEndDisplay = "";
  try {
    const bsStart = adToBs(start);
    const bsEnd = adToBs(end);
    bsStartDisplay = `${bsStart.year} ${bsStart.monthName} ${bsStart.day}`;
    bsEndDisplay = `${bsEnd.year} ${bsEnd.monthName} ${bsEnd.day}`;
  } catch {
    bsStartDisplay = format(start, "yyyy-MM-dd");
    bsEndDisplay = format(end, "yyyy-MM-dd");
  }

  // Predecessor names
  const predecessors = useMemo(() => {
    if (task.predecessors && task.predecessors.length > 0) {
      return task.predecessors
        .map((p) => {
          const pred = taskMap.get(p.predecessorId);
          return pred ? { name: pred.name, code: pred.code, type: p.type || "FS" } : null;
        })
        .filter(Boolean);
    }
    if (task.dependencies) {
      try {
        const parsed = typeof task.dependencies === "string" ? JSON.parse(task.dependencies) : task.dependencies;
        if (Array.isArray(parsed)) {
          return parsed
            .map((d: any) => {
              const p = taskMap.get(typeof d === "string" ? d : d.taskId);
              return p ? { name: p.name, code: p.code, type: d.type || "FS" } : null;
            })
            .filter(Boolean);
        }
      } catch {
        return [];
      }
    }
    return [];
  }, [task, taskMap]);

  // Viewport bounds
  const tooltipWidth = 280;
  const screenW = typeof window !== "undefined" ? window.innerWidth : 1200;
  const screenH = typeof window !== "undefined" ? window.innerHeight : 800;

  const left = x + tooltipWidth + 20 > screenW ? Math.max(10, x - tooltipWidth - 10) : x + 15;
  const top = Math.max(10, Math.min(y - 30, screenH - 220));

  return (
    <div
      style={{ left: `${left}px`, top: `${top}px` }}
      className="fixed z-40 w-72 pointer-events-none rounded-xl border border-slate-700/80 bg-slate-900/95 p-3 shadow-2xl backdrop-blur-xl animate-in fade-in zoom-in-95 duration-100 font-sans text-xs text-slate-200 select-none ring-1 ring-white/10"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 border-b border-slate-800 pb-2 mb-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 mb-0.5">
            {task.code && (
              <span className="text-[10px] font-mono font-bold text-emerald-400 bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-800/60">
                WBS {task.code}
              </span>
            )}
            {isCritical && (
              <span className="flex items-center gap-1 text-[10px] font-bold text-red-400 bg-red-950/60 px-1.5 py-0.5 rounded border border-red-800/60">
                <Zap className="h-2.5 w-2.5 fill-current" /> Critical
              </span>
            )}
          </div>
          <h4 className="text-xs font-semibold text-white leading-snug truncate">
            {task.name}
          </h4>
        </div>

        {/* Task Type Badge */}
        {task.taskType === "continuous_24_7" && (
          <span className="shrink-0 flex items-center gap-1 text-[9px] font-semibold text-amber-300 bg-amber-950/60 px-1.5 py-0.5 rounded border border-amber-800/60">
            <Clock className="h-2.5 w-2.5" /> 24/7
          </span>
        )}
        {task.taskType === "elapsed_curing" && (
          <span className="shrink-0 flex items-center gap-1 text-[9px] font-semibold text-cyan-300 bg-cyan-950/60 px-1.5 py-0.5 rounded border border-cyan-800/60">
            <Droplets className="h-2.5 w-2.5" /> Curing
          </span>
        )}
        {task.taskType === "buffer" && (
          <span className="shrink-0 flex items-center gap-1 text-[9px] font-semibold text-orange-300 bg-orange-950/60 px-1.5 py-0.5 rounded border border-orange-800/60">
            <ShieldAlert className="h-2.5 w-2.5" /> Buffer
          </span>
        )}
        {task.isMilestone && (
          <span className="shrink-0 flex items-center gap-1 text-[9px] font-semibold text-amber-300 bg-amber-950/60 px-1.5 py-0.5 rounded border border-amber-800/60">
            <Diamond className="h-2.5 w-2.5 fill-current" /> Milestone
          </span>
        )}
      </div>

      {/* Date Ranges (Dual BS + AD) */}
      <div className="space-y-1.5 mb-2.5">
        <div className="rounded-lg bg-slate-800/60 p-2 border border-slate-700/50 space-y-1">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-slate-400 flex items-center gap-1">
              <Calendar className="h-3 w-3 text-emerald-400" /> Bikram Sambat:
            </span>
            <span className="font-mono text-emerald-300 font-medium">
              {bsStartDisplay} → {bsEndDisplay}
            </span>
          </div>
          <div className="flex items-center justify-between text-[10px] text-slate-400">
            <span>Gregorian (AD):</span>
            <span className="font-mono text-slate-300">
              {format(start, "d MMM yyyy")} → {format(end, "d MMM yyyy")}
            </span>
          </div>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-3 gap-1.5 mb-2.5 text-center">
        <div className="rounded-lg bg-slate-800/40 p-1.5 border border-slate-800">
          <div className="text-[10px] text-slate-400">Duration</div>
          <div className="font-mono font-semibold text-slate-100">{dur} Days</div>
        </div>

        <div className="rounded-lg bg-slate-800/40 p-1.5 border border-slate-800">
          <div className="text-[10px] text-slate-400">Progress</div>
          <div className="font-mono font-semibold text-emerald-400">{task.progress ?? 0}%</div>
        </div>

        <div className="rounded-lg bg-slate-800/40 p-1.5 border border-slate-800">
          <div className="text-[10px] text-slate-400">Total Float</div>
          <div className={cn("font-mono font-semibold", isCritical ? "text-red-400" : "text-slate-200")}>
            {totalFloat !== undefined ? `${totalFloat}d` : "0d"}
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="mb-2">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
          <div
            className={cn(
              "h-full rounded-full transition-all",
              (task.progress ?? 0) === 100
                ? "bg-emerald-500"
                : isCritical
                  ? "bg-red-500"
                  : "bg-emerald-400"
            )}
            style={{ width: `${task.progress ?? 0}%` }}
          />
        </div>
      </div>

      {/* Resources & Predecessors */}
      <div className="space-y-1 text-[11px] text-slate-400">
        {task.laborCount ? (
          <div className="flex items-center gap-1.5 text-slate-300">
            <Users className="h-3 w-3 text-cyan-400" />
            <span>Assigned Crew: <strong className="text-white font-mono">{task.laborCount} Men</strong></span>
          </div>
        ) : null}

        {predecessors.length > 0 && (
          <div className="flex items-center gap-1.5 text-slate-300 truncate">
            <Link2 className="h-3 w-3 text-indigo-400 shrink-0" />
            <span className="truncate">
              Predecessors ({predecessors.length}):{" "}
              <span className="text-slate-400 font-mono">
                {predecessors.map((p: any) => p.code || p.name).join(", ")}
              </span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
