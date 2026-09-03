"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc-client";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ClipboardCheck, Download, Loader2, AlertTriangle, TrendingDown, TrendingUp,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Props = {
  projectId: string;
  canWrite?: boolean;
};

import { getLocalDateString } from "@/lib/nepali-calendar";

export function ReconciliationReport({ projectId, canWrite = true }: Props) {
  const utils = trpc.useUtils();

  // Default to current month
  const [startDate, setStartDate] = useState(() => {
    const now = new Date();
    return getLocalDateString(new Date(now.getFullYear(), now.getMonth(), 1));
  });
  const [endDate, setEndDate] = useState(() => getLocalDateString());

  const { data, isLoading } = trpc.material.reconciliation.useQuery({
    projectId,
    startDate: new Date(startDate).toISOString(),
    endDate: new Date(endDate).toISOString(),
  });

  const [countDialog, setCountDialog] = useState<{ materialId: string; name: string; currentStock: number; unit: string } | null>(null);
  const [countedQty, setCountedQty] = useState("");
  const [countNotes, setCountNotes] = useState("");

  const physicalCountMut = trpc.material.physicalCount.useMutation({
    onSuccess: (result) => {
      utils.material.reconciliation.invalidate({ projectId });
      utils.material.list.invalidate({ projectId });
      toast.success(result.message);
      setCountDialog(null);
      setCountedQty("");
      setCountNotes("");
    },
    onError: (e) => toast.error(e.message),
  });

  const handleExport = () => {
    if (!data) return;
    const headers = ["Material", "Code", "Unit", "Opening", "Received", "Issued", "Transfers Out", "Adjustments", "Expected Closing", "Actual Closing", "Variance", "Variance %"];
    const rows = data.materials.map(m => [
      m.name, m.code || "", m.unit,
      m.opening.toFixed(2), m.received.toFixed(2), m.issued.toFixed(2),
      m.transfersOut.toFixed(2), m.adjustments.toFixed(2),
      m.expectedClosing.toFixed(2), m.actualClosing.toFixed(2),
      m.variance.toFixed(2), m.variancePct + "%",
    ]);
    const csv = [headers.join(","), ...rows.map(r => r.map(f => `"${f}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `reconciliation-${projectId}-${startDate}-to-${endDate}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4" /> Material Reconciliation
            </CardTitle>
            <CardDescription className="text-xs">
              Opening + Received − Issued = Expected vs Actual = Variance
            </CardDescription>
          </div>
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={handleExport} title="Export CSV">
            <Download className="h-3.5 w-3.5" />
          </Button>
        </div>
        <div className="flex items-center gap-2 mt-2">
          <div>
            <Label className="text-[10px] text-muted-foreground">From</Label>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="h-7 text-xs w-36"
            />
          </div>
          <div>
            <Label className="text-[10px] text-muted-foreground">To</Label>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="h-7 text-xs w-36"
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {isLoading ? (
          <Skeleton className="h-40" />
        ) : !data || data.materials.length === 0 ? (
          <div className="text-center py-6 text-xs text-muted-foreground">
            <ClipboardCheck className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p>No materials to reconcile.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Summary */}
            <div className="grid grid-cols-4 gap-2 text-xs">
              <div className="rounded border p-2 text-center">
                <div className="text-[9px] text-muted-foreground uppercase">Received</div>
                <div className="font-bold text-success">{data.summary.totalReceived.toFixed(1)}</div>
              </div>
              <div className="rounded border p-2 text-center">
                <div className="text-[9px] text-muted-foreground uppercase">Issued</div>
                <div className="font-bold text-info">{data.summary.totalIssued.toFixed(1)}</div>
              </div>
              <div className="rounded border p-2 text-center">
                <div className="text-[9px] text-muted-foreground uppercase">Variance</div>
                <div className={cn("font-bold", data.summary.totalVariance < 0 ? "text-red-600" : "text-success")}>
                  {data.summary.totalVariance > 0 ? "+" : ""}{data.summary.totalVariance.toFixed(1)}
                </div>
              </div>
              <div className="rounded border p-2 text-center">
                <div className="text-[9px] text-muted-foreground uppercase">W/ Variance</div>
                <div className="font-bold text-amber-600">{data.summary.materialsWithVariance}</div>
              </div>
            </div>

            {/* Table */}
            <div className="rounded-md border overflow-x-auto">
              <table className="w-full text-[10px]">
                <thead className="bg-muted/30">
                  <tr>
                    <th className="p-1.5 text-left font-medium text-muted-foreground">Material</th>
                    <th className="p-1.5 text-right font-medium text-muted-foreground">Open</th>
                    <th className="p-1.5 text-right font-medium text-muted-foreground text-success">+ Recv</th>
                    <th className="p-1.5 text-right font-medium text-muted-foreground text-info">− Issue</th>
                    <th className="p-1.5 text-right font-medium text-muted-foreground">Exp.</th>
                    <th className="p-1.5 text-right font-medium text-muted-foreground">Actual</th>
                    <th className="p-1.5 text-right font-medium text-muted-foreground">Var.</th>
                    {canWrite && <th className="p-1.5"></th>}
                  </tr>
                </thead>
                <tbody>
                  {data.materials.map(m => {
                    const hasVariance = Math.abs(m.variance) > 0.01;
                    return (
                      <tr key={m.id} className="border-t hover:bg-muted/20">
                        <td className="p-1.5">
                          <div className="font-medium">{m.name}</div>
                          {m.code && <div className="text-[8px] text-muted-foreground font-mono">{m.code}</div>}
                        </td>
                        <td className="p-1.5 text-right tabular-nums">{m.opening.toFixed(1)}</td>
                        <td className="p-1.5 text-right tabular-nums text-success">{m.received > 0 ? `+${m.received.toFixed(1)}` : "—"}</td>
                        <td className="p-1.5 text-right tabular-nums text-info">{m.issued > 0 ? `−${m.issued.toFixed(1)}` : "—"}</td>
                        <td className="p-1.5 text-right tabular-nums font-medium">{m.expectedClosing.toFixed(1)}</td>
                        <td className="p-1.5 text-right tabular-nums">{m.actualClosing.toFixed(1)}</td>
                        <td className={cn("p-1.5 text-right tabular-nums font-bold", !hasVariance ? "text-muted-foreground" : m.variance < 0 ? "text-red-600" : "text-success")}>
                          {hasVariance ? `${m.variance > 0 ? "+" : ""}${m.variance.toFixed(1)}` : "—"}
                        </td>
                        {canWrite && (
                          <td className="p-1.5">
                            <button
                              onClick={() => {
                                setCountDialog({ materialId: m.id, name: m.name, currentStock: m.actualClosing, unit: m.unit });
                                setCountedQty(m.actualClosing.toString());
                              }}
                              className="text-[9px] text-primary hover:underline"
                            >
                              Count
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {data.summary.materialsWithVariance > 0 && (
              <div className="flex items-center gap-1.5 text-[10px] text-amber-700 dark:text-amber-400">
                <AlertTriangle className="h-3 w-3" />
                {data.summary.materialsWithVariance} material(s) have variance — investigate wastage, theft, or data entry errors.
              </div>
            )}
          </div>
        )}
      </CardContent>

      {/* Physical Count Dialog */}
      <Dialog open={!!countDialog} onOpenChange={(o) => { if (!o) setCountDialog(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4" /> Physical Count
            </DialogTitle>
            <DialogDescription>
              Enter the actual counted quantity for <strong>{countDialog?.name}</strong>.
              The system will create an adjustment transaction for the difference.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="rounded border p-2">
                <div className="text-[9px] text-muted-foreground uppercase">System Stock</div>
                <div className="font-bold">{countDialog?.currentStock} {countDialog?.unit}</div>
              </div>
              <div className="rounded border p-2">
                <div className="text-[9px] text-muted-foreground uppercase">Difference</div>
                <div className="font-bold">
                  {countedQty && countDialog ? (() => {
                    const diff = parseFloat(countedQty) - countDialog.currentStock;
                    return diff > 0 ? `+${diff.toFixed(2)}` : diff.toFixed(2);
                  })() : "—"} {countDialog?.unit}
                </div>
              </div>
            </div>
            <div>
              <Label className="text-xs">Counted Quantity ({countDialog?.unit})</Label>
              <Input
                type="number"
                step="0.01"
                value={countedQty}
                onChange={(e) => setCountedQty(e.target.value)}
                className="h-9 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs">Notes (optional)</Label>
              <Input
                value={countNotes}
                onChange={(e) => setCountNotes(e.target.value)}
                placeholder="e.g. Monthly stock take"
                className="h-9 text-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCountDialog(null)}>Cancel</Button>
            <Button
              onClick={() => {
                if (!countDialog || !countedQty) return;
                physicalCountMut.mutate({
                  projectId,
                  materialId: countDialog.materialId,
                  countedQty: parseFloat(countedQty),
                  notes: countNotes || undefined,
                });
              }}
              disabled={physicalCountMut.isPending}
            >
              {physicalCountMut.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
              Save Count
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
