"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc-client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeftRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

/**
 * Transfer / Re-hire (Phase D / ADR-0005): ends the worker's current
 * engagement and opens a chained new one (sourceAssignmentId). History is
 * preserved — nothing is destroyed. A concurrent engagement on another
 * project must be confirmed with an audited overrideReason.
 *
 * Mounted conditionally per worker (prefill comes from the roster row).
 */
export function TransferWorkerDialog({
  projectId,
  worker,
  onClose,
  onSuccess,
}: {
  projectId: string;
  worker: any;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [fromDate, setFromDate] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [designation, setDesignation] = useState(worker.designation || "");
  const [dailyWage, setDailyWage] = useState<number>(worker.dailyWage || 0);
  const [monthlySalary, setMonthlySalary] = useState<number>(worker.monthlySalary || 0);
  const [gangName, setGangName] = useState(worker.gangName || "");
  // "same" = re-hire on this project; otherwise the target project id.
  const [targetProjectId, setTargetProjectId] = useState("same");
  const [overrideReason, setOverrideReason] = useState("");

  // Org project list for the cross-project transfer target (existing query,
  // cached). The server re-checks write access + same-org on the target.
  const { data: projectList } = trpc.project.list.useQuery();
  const targetProjects = (projectList?.projects || []).filter((p) => p.id !== projectId);

  const transferMut = trpc.hr.transfer.useMutation({
    onSuccess: () => {
      toast.success("Engagement ended and a new chained assignment opened");
      onSuccess();
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fromDate) {
      toast.error("Please choose the effective date");
      return;
    }
    // projectId = the caller's operating context; the server re-checks the
    // record's own project (and write access on a cross-project target).
    const transferInput = {
      projectId,
      itemId: worker.id,
      newProjectId: targetProjectId === "same" ? null : targetProjectId,
      fromDate,
      designation: designation || null,
      dailyWage: Number(dailyWage) || 0,
      monthlySalary: Number(monthlySalary) || 0,
      gangName: gangName || null,
      overrideReason: overrideReason.trim() || null,
    };
    transferMut.mutate(transferInput);
  };

  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <ArrowLeftRight className="h-5 w-5 text-primary" />
            Transfer / Re-hire — {worker.name}
          </DialogTitle>
          <DialogDescription className="text-xs">
            Ends the current engagement and opens a chained new one. History is preserved; the old
            engagement closes the day before the new start date.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Effective From *</Label>
              <Input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="h-8 text-xs font-mono"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Designation</Label>
              <Input
                value={designation}
                onChange={(e) => setDesignation(e.target.value)}
                placeholder="e.g. Head Mason"
                className="h-8 text-xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Daily Wage (NPR)</Label>
              <Input
                type="number"
                min="0"
                step="10"
                value={dailyWage}
                onChange={(e) => setDailyWage(parseFloat(e.target.value) || 0)}
                className="h-8 text-xs font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Monthly Salary (NPR)</Label>
              <Input
                type="number"
                min="0"
                step="100"
                value={monthlySalary}
                onChange={(e) => setMonthlySalary(parseFloat(e.target.value) || 0)}
                className="h-8 text-xs font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Gang / Toli</Label>
              <Input
                value={gangName}
                onChange={(e) => setGangName(e.target.value)}
                placeholder="e.g. Mason Gang A"
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Target Project</Label>
              <Select value={targetProjectId} onValueChange={setTargetProjectId}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="same">This project (re-hire)</SelectItem>
                  {targetProjects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Override Reason (optional)</Label>
            <Textarea
              value={overrideReason}
              onChange={(e) => setOverrideReason(e.target.value)}
              placeholder="e.g. Worker confirmed on both sites for the handover week"
              className="min-h-[60px] text-xs"
            />
            <p className="text-[10px] text-muted-foreground">
              Only needed to confirm a concurrent engagement on another project. Overrides are audited.
            </p>
          </div>

          <DialogFooter className="border-t pt-3">
            <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={transferMut.isPending}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={transferMut.isPending} className="font-semibold">
              {transferMut.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
              Confirm Transfer / Re-hire
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
