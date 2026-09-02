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
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertCircle } from "lucide-react";
export function TaskExecutionModal({ projectId, task }: { projectId: string; task: any }) {
  const [open, setOpen] = useState(false);
  const utils = trpc.useUtils();
  const mutation = trpc.workflow.dailyProgram.updateTaskExecution.useMutation({
    onSuccess: () => {
      utils.workflow.dailyReport.getReport.invalidate();
      toast.success("Task execution updated");
      setOpen(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const [status, setStatus] = useState<string>(task.executionStatus);
  const [actualQty, setActualQty] = useState<number | "">(task.actualQty || "");
  const [batchedQty, setBatchedQty] = useState<number | "">(task.batchedQty !== undefined && task.batchedQty !== null ? task.batchedQty : (task.actualQty || ""));
  const [payableQty, setPayableQty] = useState<number | "">(task.payableQty !== undefined && task.payableQty !== null ? task.payableQty : (task.actualQty || ""));
  const [delayReason, setDelayReason] = useState(task.delayReason || "");
  const [isEot, setIsEot] = useState(task.isEotCandidate);
  const [carryOver, setCarryOver] = useState<"tomorrow" | "postpone" | "none">("none");

  const needsDelay = status === "partially_completed" || status === "uncompleted";

  const numBatched = typeof batchedQty === "number" ? batchedQty : parseFloat(batchedQty as string) || 0;
  const numPayable = typeof payableQty === "number" ? payableQty : parseFloat(payableQty as string) || 0;
  const variance = numBatched - numPayable;
  const variancePct = numPayable > 0 ? (variance / numPayable) * 100 : 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">Execute</Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Execute Task: {task.taskName}</DialogTitle>
          <DialogDescription>Planned: {task.plannedQty} {task.unit}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label>Execution Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="planned">Planned</SelectItem>
                <SelectItem value="done">Done</SelectItem>
                <SelectItem value="partially_completed">Partially Completed</SelectItem>
                <SelectItem value="uncompleted">Uncompleted</SelectItem>
                <SelectItem value="postponed">Postponed</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3 p-3 rounded-lg border bg-muted/20">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Batched / Poured</Label>
              <Input
                type="number"
                step="any"
                className="h-8 text-xs font-medium"
                placeholder="0"
                value={batchedQty}
                onChange={(e) => {
                  const val = e.target.value ? parseFloat(e.target.value) : "";
                  setBatchedQty(val);
                  setActualQty(val);
                  if (payableQty === "" || payableQty === 0) setPayableQty(val);
                }}
              />
              <p className="text-[10px] text-muted-foreground">Dispatched/Placed ({task.unit || "unit"})</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">Payable (Measured)</Label>
              <Input
                type="number"
                step="any"
                className="h-8 text-xs font-medium"
                placeholder="0"
                value={payableQty}
                onChange={(e) => setPayableQty(e.target.value ? parseFloat(e.target.value) : "")}
              />
              <p className="text-[10px] text-muted-foreground">Billable IPC Scope ({task.unit || "unit"})</p>
            </div>

            {(numBatched > 0 || numPayable > 0) && (
              <div className="col-span-2 pt-2 border-t flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Yield Variance:</span>
                <span className={cn(
                  "font-mono font-semibold px-2 py-0.5 rounded text-[11px]",
                  variance > 0 ? "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300" :
                  variance < 0 ? "bg-info/15 text-info dark:bg-[var(--navy-deep)]/40 dark:text-info/80" :
                  "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                )}>
                  {variance > 0 ? `+${variance.toFixed(2)} ${task.unit || ""} (${variancePct.toFixed(1)}% Wastage)` :
                   variance < 0 ? `${variance.toFixed(2)} ${task.unit || ""} (Saving)` :
                   "100% Balanced (Zero Wastage)"}
                </span>
              </div>
            )}
          </div>

          {needsDelay && (
            <>
              <div className="space-y-2">
                <Label>Delay Reason (Required)</Label>
                <Select value={delayReason} onValueChange={setDelayReason}>
                  <SelectTrigger><SelectValue placeholder="Select reason" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="weather">Weather / Rain</SelectItem>
                    <SelectItem value="material_shortage">Material Shortage</SelectItem>
                    <SelectItem value="equipment_breakdown">Equipment Breakdown</SelectItem>
                    <SelectItem value="labor_absence">Labor / Subcontractor Absence</SelectItem>
                    <SelectItem value="client_decision">Client Decision / RFI Pending</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="eot" checked={isEot} onChange={(e) => setIsEot(e.target.checked)} className="rounded border-border" />
                <Label htmlFor="eot" className="font-normal cursor-pointer text-xs">Flag as EOT (Extension of Time) Candidate</Label>
              </div>

              <div className="space-y-2 pt-2 border-t">
                <Label>Incomplete Work Action</Label>
                <Select value={carryOver} onValueChange={(val: any) => setCarryOver(val)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Do nothing</SelectItem>
                    <SelectItem value="tomorrow">Carry over to Tomorrow's Program</SelectItem>
                    <SelectItem value="postpone">Send to Backlog</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button 
            onClick={() => {
              if (needsDelay && !delayReason) {
                toast.error("Delay reason is required for incomplete tasks");
                return;
              }
              mutation.mutate({
                taskId: task.id,
                projectId,
                executionStatus: status as any,
                actualQty: numBatched,
                batchedQty: numBatched,
                payableQty: numPayable,
                delayReason: needsDelay ? delayReason : null,
                isEotCandidate: needsDelay ? isEot : false,
                carryOverAction: needsDelay ? carryOver : "none"
              });
            }}
            disabled={mutation.isPending}
          >
            {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Execution
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

