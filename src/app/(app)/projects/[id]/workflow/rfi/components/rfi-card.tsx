"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  MapPin, User, Clock, Eye, Send, RotateCcw, Check, X as XIcon, XCircle, Trash2,
} from "lucide-react";
import { RfiStatusBadge, RfiPriorityBadge } from "@/components/workflow/badges";
import { differenceInHours } from "date-fns";
import { ConfirmActionButton } from "./confirm-action-button";
import type { RfiListItem } from "@/components/workflow/rfi-types";
import { cn } from "@/lib/utils";

function UserAvatar({ name, className }: { name: string; className?: string }) {
  const initials = name
    ? name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()
    : "U";
  return (
    <div className={cn("flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full text-[8.5px] font-bold text-white bg-slate-600 dark:bg-slate-700 select-none", className)}>
      {initials}
    </div>
  );
}

export function RfiCard({
  rfi, onView, onAction, myRole, canWrite, isSelected, onToggleSelect, currentUserId,
}: {
  rfi: RfiListItem;
  onView: (id: string) => void;
  onAction: (id: string, action: "approve" | "reject" | "close" | "delete" | "submit" | "resubmit") => void;
  myRole: string | undefined;
  canWrite: boolean;
  isSelected: boolean;
  onToggleSelect: () => void;
  currentUserId?: string;
}) {
  const isPM = myRole === "project_manager" || myRole === "coordinator";
  const isCreator = !!currentUserId && rfi.createdBy?.id === currentUserId;

  const fmtTime = (d: string | Date | null) => {
    if (!d) return "";
    return new Date(d).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  const inspectionStr = rfi.inspectionStartTime || rfi.inspectionEndTime
    ? `${fmtTime(rfi.inspectionStartTime)} ${rfi.inspectionEndTime ? `– ${fmtTime(rfi.inspectionEndTime)}` : ""}`
    : "";

  const slaBadge = rfi.status === "submitted" && rfi.submittedAt ? (() => {
    const hrs = differenceInHours(new Date(), new Date(rfi.submittedAt));
    if (hrs < 48) return <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100 dark:bg-emerald-950 dark:text-emerald-400 leading-none">{hrs < 24 ? `${hrs}h` : `${Math.floor(hrs / 24)}d ${hrs % 24}h`}</span>;
    if (hrs < 120) return <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-100 dark:bg-amber-950 dark:text-amber-400 leading-none">{Math.floor(hrs / 24)}d {hrs % 24}h</span>;
    return <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-100 dark:bg-red-950 dark:text-red-400 leading-none">{Math.floor(hrs / 24)}d</span>;
  })() : null;

  const canApprove = isPM && rfi.status === "submitted";
  const canReject = isPM && rfi.status === "submitted";
  const canClose = isPM && ["submitted", "approved", "rejected"].includes(rfi.status);
  const canDelete = (rfi.status === "draft" && canWrite) || (isPM && ["submitted", "approved", "rejected", "closed"].includes(rfi.status));
  const canSubmit = rfi.status === "draft" && canWrite;
  const canResubmit = rfi.status === "rejected" && canWrite;

  const statusBorderColor = cn(
    rfi.status === "draft" && "border-l-slate-400 dark:border-l-slate-700",
    rfi.status === "submitted" && "border-l-blue-500 dark:border-l-blue-600",
    rfi.status === "approved" && "border-l-emerald-500 dark:border-l-emerald-600",
    rfi.status === "rejected" && "border-l-red-500 dark:border-l-red-600",
    rfi.status === "closed" && "border-l-zinc-400 dark:border-l-zinc-700"
  );

  return (
    <Card className={cn(
      "group relative overflow-hidden transition-all duration-200 border-l-[3.5px] hover:-translate-y-0.5 hover:shadow-md hover:border-r-border/60",
      statusBorderColor,
      isSelected ? "ring-1.5 ring-primary" : ""
    )}>
      <CardContent className="p-3 space-y-2">
        <div className="flex items-start justify-between gap-1.5">
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            <input
              type="checkbox" checked={isSelected} onChange={onToggleSelect}
              className={cn(
                "h-3.5 w-3.5 rounded border-muted accent-primary cursor-pointer shrink-0 transition-opacity",
                isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
              )}
              onClick={(e) => e.stopPropagation()} title="Select for batch action"
            />
            <button onClick={() => onView(rfi.id)} className="font-mono text-xs font-bold text-muted-foreground hover:text-primary text-left truncate flex-1 leading-none">
              {rfi.number}
              {isCreator && <span className="ml-1 text-[8.5px] text-primary/70 font-normal">(you)</span>}
            </button>
          </div>
          <div className="flex gap-1 shrink-0">
            {rfi.discipline && <Badge variant="secondary" className="text-[8.5px] font-medium capitalize px-1.5 py-0 h-4 leading-none">{rfi.discipline}</Badge>}
            <RfiPriorityBadge priority={rfi.priority} />
          </div>
        </div>

        <button onClick={() => onView(rfi.id)} className="hover:underline text-left w-full p-0 block">
          <h4 className="text-xs font-semibold leading-snug line-clamp-2 text-foreground/95">{rfi.subject}</h4>
        </button>

        <div className="space-y-1 pt-0.5">
          {(rfi.location || rfi.createdBy) && (
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
              {rfi.location && (
                <span className="flex items-center gap-1 min-w-0">
                  <MapPin className="h-2.5 w-2.5 shrink-0 text-muted-foreground/75" />
                  <span className="truncate max-w-[120px]">{rfi.location}</span>
                </span>
              )}
              {rfi.createdBy && (
                <span className="flex items-center gap-1 min-w-0">
                  <UserAvatar name={rfi.createdBy.name} className="h-3.5 w-3.5 text-[7px]" />
                  <span className="truncate">By: {rfi.createdBy.name.split(" ")[0]}</span>
                </span>
              )}
            </div>
          )}

          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
            {rfi.assignedTo && (
              <span className="flex items-center gap-1 min-w-0">
                <UserAvatar name={rfi.assignedTo.user.name} className="h-3.5 w-3.5 text-[7px] bg-primary" />
                <span className="truncate">Assigned: {rfi.assignedTo.user.name.split(" ")[0]}</span>
              </span>
            )}
            {inspectionStr && (
              <span className="flex items-center gap-1 min-w-0">
                <Clock className="h-2.5 w-2.5 shrink-0 text-muted-foreground/75" />
                <span className="truncate">Inspection: {inspectionStr}</span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
            {rfi.submittedAt ? (
              <>
                <span className="flex items-center gap-1"><Clock className="h-2.5 w-2.5 shrink-0" /><span>Sent: {fmtTime(rfi.submittedAt)}</span></span>
                {slaBadge}
              </>
            ) : (
              <span className="flex items-center gap-1"><Clock className="h-2.5 w-2.5 shrink-0" /><span>Created: {fmtTime(rfi.createdAt)}</span></span>
            )}
          </div>
        </div>

        {(rfi.costImpact || rfi.scheduleImpact) && (
          <div className="flex gap-1 pt-0.5">
            {rfi.costImpact && <span className="text-[8.5px] font-semibold text-amber-600 bg-amber-50 dark:bg-amber-950/40 px-1.5 py-0.5 rounded border border-amber-200/50 leading-none">Cost Impact</span>}
            {rfi.scheduleImpact && <span className="text-[8.5px] font-semibold text-rose-600 bg-rose-50 dark:bg-rose-950/40 px-1.5 py-0.5 rounded border border-rose-200/50 leading-none">Delay Impact</span>}
          </div>
        )}

        {rfi.dailyProgramTasks && rfi.dailyProgramTasks.length > 0 && (() => {
          const tasks = rfi.dailyProgramTasks;
          const originalTasks = tasks.filter(t => !t.carriedOverFromId);
          const totalPlanned = originalTasks.reduce((s, t) => s + t.plannedQty, 0);
          const totalCompleted = tasks.reduce((s, t) => s + (t.actualQty || 0), 0);
          const pct = totalPlanned > 0 ? Math.min(100, Math.round((totalCompleted / totalPlanned) * 100)) : 0;
          const unit = rfi.items?.[0]?.unit || "";
          return (
            <div className="space-y-1 pt-1">
              <div className="flex items-center justify-between text-[9px] text-muted-foreground leading-none">
                <span>Progress</span>
                <span>{totalCompleted}{unit && ` ${unit}`} / {totalPlanned}{unit && ` ${unit}`} ({pct}%)</span>
              </div>
              <div className="relative w-full h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-teal-500 to-emerald-500 transition-all duration-300"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })()}

        <div className="flex items-center justify-between pt-2 border-t border-border/60">
          <RfiStatusBadge status={rfi.status} />
          <div className="flex gap-1">
            <Button variant="ghost" size="icon" className="h-6.5 w-6.5 rounded-md hover:bg-muted" onClick={() => onView(rfi.id)} title="View"><Eye className="h-3.5 w-3.5 text-muted-foreground" /></Button>
            {canSubmit && <ConfirmActionButton icon={<Send className="h-3 w-3" />} title="Submit RFI" description={`Submit ${rfi.number} for review?`} onConfirm={() => onAction(rfi.id, "submit")} className="text-blue-600 border-blue-200 hover:bg-blue-50 dark:hover:bg-blue-950/30 dark:border-blue-900" />}
            {canResubmit && <ConfirmActionButton icon={<RotateCcw className="h-3 w-3" />} title="Resubmit RFI" description={`Resubmit ${rfi.number}?`} onConfirm={() => onAction(rfi.id, "resubmit")} className="text-purple-600 border-purple-200 hover:bg-purple-50 dark:hover:bg-purple-950/30 dark:border-purple-900" />}
            {canApprove && <ConfirmActionButton icon={<Check className="h-3 w-3" />} title="Approve RFI" description={`Approve ${rfi.number}?`} onConfirm={() => onAction(rfi.id, "approve")} className="text-emerald-600 border-emerald-200 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 dark:border-emerald-900" />}
            {canReject && <ConfirmActionButton icon={<XIcon className="h-3 w-3" />} title="Reject RFI" description={`Reject ${rfi.number}?`} onConfirm={() => onAction(rfi.id, "reject")} className="text-red-600 border-red-200 hover:bg-red-50 dark:hover:bg-red-950/30 dark:border-red-900" />}
            {canClose && <ConfirmActionButton icon={<XCircle className="h-3 w-3" />} title="Close RFI" description={`Close ${rfi.number}?`} onConfirm={() => onAction(rfi.id, "close")} className="text-orange-600 border-orange-200 hover:bg-orange-50 dark:hover:bg-orange-950/30 dark:border-orange-900" />}
            {canDelete && <ConfirmActionButton icon={<Trash2 className="h-3 w-3" />} title="Delete RFI" description={`Delete ${rfi.number}? This cannot be undone.`} onConfirm={() => onAction(rfi.id, "delete")} className="text-destructive border-destructive/20 hover:bg-destructive/10 dark:hover:bg-destructive/20" />}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

