"use client";

import { useState, useEffect, Fragment } from "react";
import { trpc } from "@/lib/trpc-client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, X, Plus } from "lucide-react";
import { TaskExecutionModal } from "./task-execution-modal";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
export function PlanVsActualRow({ task, projectId, isEditable }: { task: any; projectId: string; isEditable: boolean }) {
  const utils = trpc.useUtils();
  const mutation = trpc.workflow.dailyProgram.updateTaskExecution.useMutation({
    onSuccess: () => { utils.workflow.dailyReport.getReport.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const pct = task.plannedQty > 0 ? Math.round(((task.actualQty || 0) / task.plannedQty) * 100) : task.actualQty > 0 ? null : 0;
  const rfiNumber = task.rfi?.number ?? "—";
  const ganttLabel = task.ganttTask ? `${task.ganttTask.code} ${task.ganttTask.name}` : "—";

  return (
    <tr className="border-b hover:bg-muted/5 transition-colors">
      <td className="p-3 text-xs font-mono text-muted-foreground">{rfiNumber}</td>
      <td className="p-3">
        <p className="font-medium text-xs">{task.taskName}</p>
        <p className="text-[10px] text-muted-foreground">{ganttLabel}</p>
      </td>
      <td className="p-3 text-xs text-muted-foreground">{task.boqCode || "—"}</td>
      <td className="p-3 text-xs text-muted-foreground max-w-[120px] truncate">{task.boqDesc || "—"}</td>
      <td className="p-3 text-xs text-muted-foreground">{task.location || "—"}</td>
      <td className="p-3 text-right text-xs text-muted-foreground">{task.plannedQty}</td>
      <td className="p-3 text-xs text-muted-foreground">{task.unit || "—"}</td>
      <td className="p-3 text-right">
        {isEditable ? (
          <input type="number" step="0.01" className="w-16 rounded border px-1 py-0.5 text-right text-xs" value={task.actualQty ?? ""} onChange={(e) => { const v = parseFloat(e.target.value) || 0; mutation.mutate({ taskId: task.id, projectId, executionStatus: task.executionStatus, actualQty: v }); }} />
        ) : (
          <span className="text-xs font-semibold">{task.actualQty ?? "—"}</span>
        )}
      </td>
      <td className="p-3 text-right text-xs text-muted-foreground">{pct === null ? "—" : `${pct}%`}</td>
      <td className="p-3 text-center">
        {isEditable ? (
          <select value={task.executionStatus} onChange={(e) => mutation.mutate({ taskId: task.id, projectId, executionStatus: e.target.value as any, actualQty: task.actualQty || 0 })} className="w-full rounded border px-1 py-0.5 text-xs">
            {["planned", "done", "partially_completed", "uncompleted", "postponed"].map(s => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
          </select>
        ) : (
          <Badge variant="secondary" className={cn("font-normal capitalize text-xs", {
            "bg-success/15 text-success": task.executionStatus === "done",
            "bg-amber-100 text-amber-700": task.executionStatus === "partially_completed",
            "bg-red-100 text-red-700": task.executionStatus === "uncompleted",
            "bg-muted text-foreground/80": ["planned", "postponed"].includes(task.executionStatus),
          })}>{task.executionStatus.replace("_", " ")}</Badge>
        )}
      </td>
      <td className="p-3 text-right no-print">
        {isEditable ? <TaskExecutionModal projectId={projectId} task={task} /> : <span className="text-[10px] text-muted-foreground">—</span>}
      </td>
    </tr>
  );
}

/** Manpower view: per-subcontractor breakdown */