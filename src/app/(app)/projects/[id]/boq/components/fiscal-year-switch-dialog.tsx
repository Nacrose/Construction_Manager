"use client";

import React, { useState } from "react";
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
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Calendar,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  History,
  CheckCircle2,
  Loader2,
  ArrowRight,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface FiscalYearSwitchDialogProps {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentFiscalYear?: string;
  district?: string;
  onSuccess?: () => void;
}

export function FiscalYearSwitchDialog({
  projectId,
  open,
  onOpenChange,
  currentFiscalYear = "2080/81",
  district = "Morang",
  onSuccess,
}: FiscalYearSwitchDialogProps) {
  const utils = trpc.useUtils();
  const [targetFY, setTargetFY] = useState("2081/82");
  const [selectedDistrict, setSelectedDistrict] = useState(district);
  const [showHistory, setShowHistory] = useState(false);
  const [notes, setNotes] = useState("");

  const catalogsQuery = trpc.catalogV2.listRateCatalogs.useQuery({});
  const availableFYs = Array.from(
    new Set(catalogsQuery.data?.catalogs?.map((c) => c.fiscalYear).filter(Boolean))
  ) as string[];

  const previewQuery = trpc.fiscalYear.previewFiscalYearSwitch.useQuery(
    {
      projectId,
      targetFiscalYear: targetFY,
      district: selectedDistrict,
    },
    {
      enabled: open && !!projectId && targetFY !== currentFiscalYear,
    }
  );

  const historyQuery = trpc.fiscalYear.listProjectRevisions.useQuery(
    { projectId },
    { enabled: showHistory && !!projectId }
  );

  const switchMutation = trpc.fiscalYear.executeFiscalYearSwitch.useMutation({
    onSuccess: (data) => {
      toast.success(
        `Active Fiscal Year switched to ${data.toFiscalYear}! Cost revision logged across ${data.totalEntries} materials.`
      );
      utils.project.get.invalidate({ id: projectId });
      utils.catalogV2.getRateCatalog.invalidate();
      utils.boq.list.invalidate({ projectId });
      onOpenChange(false);
      if (onSuccess) onSuccess();
    },
    onError: (err) => toast.error(err.message),
  });

  const preview = previewQuery.data;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-primary">
              <Calendar className="h-5 w-5" />
              <DialogTitle>Switch Active District Rates Fiscal Year</DialogTitle>
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs gap-1 text-muted-foreground"
              onClick={() => setShowHistory(!showHistory)}
            >
              <History className="h-3.5 w-3.5" />
              {showHistory ? "Back to Switcher" : "View Revision History"}
            </Button>
          </div>
          <DialogDescription className="text-xs">
            Switching market cost rates automatically tracks YoY price fluctuations, estimates remaining project financial impact, and creates an immutable cost audit trail without altering contractual BOQ revenue rates.
          </DialogDescription>
        </DialogHeader>

        {showHistory ? (
          /* History View */
          <div className="space-y-3 py-2 flex-1 overflow-y-auto">
            <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <History className="h-4 w-4 text-amber-500" />
              Market Rate Revision Audit Trail
            </div>

            {historyQuery.isLoading ? (
              <div className="p-8 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading audit history...
              </div>
            ) : historyQuery.data?.logs.length === 0 ? (
              <Card className="p-8 text-center border-dashed border-border/70">
                <ShieldCheck className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">No rate revisions logged yet for this project.</p>
              </Card>
            ) : (
              <div className="space-y-2">
                {historyQuery.data?.logs.map((log) => (
                  <Card key={log.id} className="p-3 border-border space-y-1.5 text-xs">
                    <div className="flex items-center justify-between">
                      <div className="font-semibold text-foreground flex items-center gap-2">
                        <span>{log.fromFiscalYear || "Initial"} → {log.toFiscalYear || "Current"}</span>
                        <Badge variant="outline" className="text-[10px] uppercase font-mono">
                          {log.revisionType.replace(/_/g, " ")}
                        </Badge>
                      </div>
                      <div className={cn(
                        "font-mono font-bold",
                        log.totalCostImpact > 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"
                      )}>
                        {log.totalCostImpact > 0 ? `+ NPR ${log.totalCostImpact.toLocaleString("en-IN")}` : `NPR ${log.totalCostImpact.toLocaleString("en-IN")}`}
                      </div>
                    </div>

                    <div className="text-[11px] text-muted-foreground flex items-center justify-between">
                      <span>Logged by {log.loggedBy.name} on {new Date(log.loggedAt).toLocaleDateString()}</span>
                      <span>{log.entries.length} items logged</span>
                    </div>

                    {log.notes && (
                      <div className="text-[11px] text-muted-foreground italic bg-muted/40 p-1.5 rounded">
                        "{log.notes}"
                      </div>
                    )}
                  </Card>
                ))}
              </div>
            )}
          </div>
        ) : (
          /* Switcher View */
          <div className="space-y-4 py-2 flex-1 overflow-y-auto">
            {/* Controls Bar */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 rounded-lg bg-muted/40 border border-border text-xs">
              <div>
                <label className="text-[11px] font-medium text-muted-foreground block mb-1">Current Active FY</label>
                <div className="font-bold text-foreground font-mono bg-background px-2.5 py-1.5 rounded border border-border/80">
                  {currentFiscalYear}
                </div>
              </div>

              <div>
                <label className="text-[11px] font-medium text-muted-foreground block mb-1">Target Fiscal Year</label>
                <Select value={targetFY} onValueChange={setTargetFY}>
                  <SelectTrigger className="h-8 text-xs font-mono font-bold">
                    <SelectValue placeholder="Select target FY..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableFYs.map((fy) => (
                      <SelectItem key={fy} value={fy} disabled={fy === currentFiscalYear}>
                        {fy} {fy === currentFiscalYear ? "(Current)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-[11px] font-medium text-muted-foreground block mb-1">District Baseline</label>
                <input
                  value={selectedDistrict}
                  onChange={(e) => setSelectedDistrict(e.target.value)}
                  className="h-8 w-full rounded border border-input bg-background px-2.5 text-xs font-medium"
                  placeholder="e.g. Morang"
                />
              </div>
            </div>

            {/* Impact Metric Cards */}
            {preview && (
              <div className="grid grid-cols-3 gap-2">
                <Card className="p-3 bg-muted/30 border-border text-center">
                  <div className={cn(
                    "text-base font-bold font-mono",
                    preview.totalCostImpact > 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"
                  )}>
                    {preview.totalCostImpact > 0 ? `+ NPR ${Math.round(preview.totalCostImpact).toLocaleString("en-IN")}` : `NPR ${Math.round(preview.totalCostImpact).toLocaleString("en-IN")}`}
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5 font-medium">
                    Projected Total Cost Delta
                  </div>
                </Card>

                <Card className="p-3 bg-red-500/10 border-red-500/30 text-center">
                  <div className="text-base font-bold text-red-600 dark:text-red-400 font-mono flex items-center justify-center gap-1">
                    <TrendingUp className="h-4 w-4" /> {preview.itemsIncreased} Items
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">Rate Increased (Cost up)</div>
                </Card>

                <Card className="p-3 bg-emerald-500/10 border-emerald-500/30 text-center">
                  <div className="text-base font-bold text-emerald-600 dark:text-emerald-400 font-mono flex items-center justify-center gap-1">
                    <TrendingDown className="h-4 w-4" /> {preview.itemsDecreased} Items
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">Rate Decreased (Savings)</div>
                </Card>
              </div>
            )}

            {/* Breakdown Table */}
            {previewQuery.isLoading ? (
              <div className="p-8 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Computing YoY material price deltas & remaining quantities...
              </div>
            ) : preview ? (
              <div className="border border-border rounded-lg overflow-hidden max-h-[40vh] overflow-y-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-muted/80 sticky top-0 text-[11px] font-semibold border-b border-border">
                    <tr>
                      <th className="p-2">Material</th>
                      <th className="p-2 text-right">Old Rate ({preview.currentFiscalYear})</th>
                      <th className="p-2 text-right">New Rate ({preview.targetFiscalYear})</th>
                      <th className="p-2 text-right">Delta (NPR)</th>
                      <th className="p-2 text-right">Remaining Qty</th>
                      <th className="p-2 text-right font-bold">Cost Impact</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60 font-mono text-[11px]">
                    {preview.rows.map((row) => (
                      <tr key={row.materialId} className="hover:bg-muted/30">
                        <td className="p-2 font-sans font-medium text-foreground">
                          {row.materialName} <span className="text-muted-foreground text-[10px]">({row.unit})</span>
                        </td>
                        <td className="p-2 text-right text-muted-foreground">
                          {row.oldRate ? `NPR ${row.oldRate.toLocaleString("en-IN")}` : "—"}
                        </td>
                        <td className="p-2 text-right font-semibold text-foreground">
                          {row.newRate ? `NPR ${row.newRate.toLocaleString("en-IN")}` : "—"}
                        </td>
                        <td className={cn(
                          "p-2 text-right font-semibold",
                          row.rateDelta > 0 ? "text-red-600 dark:text-red-400" : row.rateDelta < 0 ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"
                        )}>
                          {row.rateDelta > 0 ? `+${row.rateDelta}` : row.rateDelta}
                        </td>
                        <td className="p-2 text-right text-muted-foreground">
                          {Math.round(row.estimatedRemainingQty).toLocaleString("en-IN")}
                        </td>
                        <td className={cn(
                          "p-2 text-right font-bold",
                          row.costImpact > 0 ? "text-red-600 dark:text-red-400" : row.costImpact < 0 ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"
                        )}>
                          {row.costImpact > 0 ? `+${Math.round(row.costImpact).toLocaleString("en-IN")}` : Math.round(row.costImpact).toLocaleString("en-IN")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
        )}

        <DialogFooter className="gap-2 pt-2 border-t border-border">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          {!showHistory && (
            <Button
              size="sm"
              variant="default"
              disabled={switchMutation.isPending || !preview || targetFY === currentFiscalYear}
              onClick={() => {
                switchMutation.mutate({
                  projectId,
                  targetFiscalYear: targetFY,
                  district: selectedDistrict,
                  notes: notes.trim() || undefined,
                });
              }}
              className="gap-1.5 bg-amber-600 hover:bg-amber-700 text-white shadow-sm"
            >
              {switchMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5" />
              )}
              Confirm & Apply FY {targetFY}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
