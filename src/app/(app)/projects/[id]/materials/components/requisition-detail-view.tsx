"use client";

import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc-client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Building2,
  Check,
  AlertTriangle,
  Loader2,
  ArrowLeft,
  XCircle,
  FileSpreadsheet,
  PackageCheck,
  Clock,
  ExternalLink,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { GeneratePODialog, PendingItemForPO } from "../dialogs/generate-po-dialog";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { formatNpr } from "@/lib/currency";
import { ConstructionTable, ConstructionTableColumn } from "@/components/ui/construction-table";

export function RequisitionDetailView({
  projectId,
  requisitionId,
  canWrite,
  isAdmin,
  onClose,
}: {
  projectId: string;
  requisitionId: string;
  canWrite: boolean;
  isAdmin: boolean;
  onClose: () => void;
}) {
  const utils = trpc.useUtils();
  const [generateDialogOpen, setGenerateDialogOpen] = useState(false);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  const { data, isLoading } = trpc.requisition.getDetails.useQuery({ projectId, requisitionId });

  const req = data?.requisition;

  const approveMut = trpc.requisition.approvePr.useMutation({
    onSuccess: (res) => {
      toast.success(`Requisition approved successfully`);
      utils.requisition.getDetails.invalidate({ projectId, requisitionId });
      utils.requisition.list.invalidate({ projectId });
    },
    onError: (e) => toast.error(e.message),
  });

  const rejectMut = trpc.requisition.rejectPr.useMutation({
    onSuccess: () => {
      toast.success("Requisition rejected");
      setRejectDialogOpen(false);
      setRejectReason("");
      utils.requisition.getDetails.invalidate({ projectId, requisitionId });
      utils.requisition.list.invalidate({ projectId });
    },
    onError: (e) => toast.error(e.message),
  });

  // Budget variance data
  const { data: budgetVariance } = trpc.requisition.getBudgetVariance.useQuery(
    { projectId, requisitionId },
    { enabled: !!req && (req.status === "pending_approval" || req.status === "approved" || req.status === "partially_ordered") }
  );

  // Prepare pending items for GeneratePODialog
  const pendingItemsForPO: PendingItemForPO[] = useMemo(() => {
    if (!req) return [];
    return req.items
      .filter((item) => item.remainingQty > 0)
      .map((item) => {
        const selectedQuote = item.quotes.find((q) => q.partnerId === item.selectedPartnerId);
        const rate = selectedQuote ? selectedQuote.exFactoryRate + selectedQuote.transportRate : 0;
        const selectedPartner = selectedQuote ? selectedQuote.partner : null;

        return {
          id: item.id,
          requisitionId: req.id,
          requisitionNumber: req.number,
          materialId: item.materialId,
          materialName: item.material.name,
          unit: item.unit,
          requiredQty: item.quantity,
          orderedQty: item.orderedQty,
          remainingQty: item.remainingQty,
          partnerId: item.selectedPartnerId || "",
          partnerName: selectedPartner?.name || "Selected Vendor",
          rate,
        };
      });
  }, [req]);


  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12 text-xs text-muted-foreground font-mono">
        <Loader2 className="h-5 w-5 animate-spin text-primary mr-2" />
        Loading requisition details...
      </div>
    );
  }

  if (!req) {
    return (
      <div className="p-8 text-center text-xs text-muted-foreground">
        Requisition not found.
      </div>
    );
  }

  const hasRemainingItems = req.items.some((i) => i.remainingQty > 0);

  const varianceColumns: ConstructionTableColumn<any>[] = [
    {
      key: "materialName",
      header: "Material",
      render: (_, vr) => <span className="font-medium font-sans text-xs text-foreground">{vr.materialName}</span>,
    },
    {
      key: "plannedQty",
      header: "BOQ Planned",
      align: "right",
      render: (_, vr) => (
        <span className="font-mono text-xs text-muted-foreground">
          {vr.plannedQty > 0 ? `${vr.plannedQty} ${vr.unit}` : "—"}
        </span>
      ),
    },
    {
      key: "alreadyProcured",
      header: "Already Ordered",
      align: "right",
      render: (_, vr) => (
        <span className="font-mono text-xs">{vr.alreadyProcured} {vr.unit}</span>
      ),
    },
    {
      key: "requestedQty",
      header: "This Request",
      align: "right",
      render: (_, vr) => (
        <span className="font-mono text-xs font-semibold text-foreground">{vr.requestedQty} {vr.unit}</span>
      ),
    },
    {
      key: "totalAfterThis",
      header: "Total After",
      align: "right",
      render: (_, vr) => <span className="font-mono text-xs">{vr.totalAfterThis} {vr.unit}</span>,
    },
    {
      key: "remainingAllowance",
      header: "Remaining Allowance",
      align: "right",
      render: (_, vr) => <span className="font-mono text-xs">{vr.remainingAllowance} {vr.unit}</span>,
    },
    {
      key: "status",
      header: "Status",
      align: "center",
      render: (_, vr) =>
        vr.isOverBudget ? (
          <span className="inline-flex items-center gap-0.5 rounded bg-red-100 px-1.5 py-0.5 text-[9px] font-semibold text-red-700 dark:bg-red-950 dark:text-red-400 font-mono">
            <TrendingUp className="h-2.5 w-2.5" /> +{vr.variancePercent}% Over
          </span>
        ) : vr.plannedQty > 0 ? (
          <span className="inline-flex items-center gap-0.5 rounded bg-success/15 px-1.5 py-0.5 text-[9px] font-semibold text-success dark:bg-success dark:text-success/80 font-mono">
            <TrendingDown className="h-2.5 w-2.5" /> Within Budget
          </span>
        ) : (
          <span className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground dark:bg-[var(--navy-mid)] dark:text-muted-foreground/80 font-mono">
            No BOQ Match
          </span>
        ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onClose} className="h-8 px-2 font-mono text-xs gap-1">
            <ArrowLeft className="h-4 w-4" /> Back to Register
          </Button>
          <div className="h-4 w-px bg-border" />
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-foreground font-mono">{req.number}</h2>
              <Badge
                variant="outline"
                className={cn("text-[10px] font-mono capitalize", {
                  "bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-950/50 dark:text-amber-300": req.status === "pending_approval",
                  "bg-success/10 text-success border-success/40 dark:bg-success dark:text-success/80": req.status === "approved" || req.status === "ordered",
                  "bg-info/10 text-info border-info/40 dark:bg-[var(--navy-deep)]/50 dark:text-info/80": req.status === "partially_ordered",
                  "bg-red-50 text-red-700 border-red-300 dark:bg-red-950/50 dark:text-red-300": req.status === "rejected",
                })}
              >
                {req.status.replace("_", " ")}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground font-mono mt-0.5">
              Requested by {req.createdBy?.name || "Site Team"} on {format(new Date(req.createdAt), "dd MMM yyyy")}
            </p>

          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          {req.status === "pending_approval" && (isAdmin || canWrite) && (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setRejectDialogOpen(true)}
                className="h-8 text-xs text-red-600 border-red-300 hover:bg-red-50 dark:hover:bg-red-950/20 font-mono"
              >
                <XCircle className="h-3.5 w-3.5 mr-1" /> Reject
              </Button>
              <Button
                size="sm"
                onClick={() => approveMut.mutate({ projectId, requisitionId })}
                disabled={approveMut.isPending}
                className="h-8 text-xs bg-success hover:bg-success text-white font-mono gap-1"
              >
                {approveMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                Approve Requisition
              </Button>
            </>
          )}

          {(req.status === "approved" || req.status === "partially_ordered") && canWrite && hasRemainingItems && (
            <Button
              size="sm"
              onClick={() => setGenerateDialogOpen(true)}
              className="h-8 text-xs bg-primary text-primary-foreground font-mono gap-1.5 shadow-sm"
            >
              <PackageCheck className="h-3.5 w-3.5" />
              Generate Purchase Order (PO)
            </Button>
          )}
        </div>
      </div>

      {/* Materials & Quotes List */}
      <div className="space-y-6">
        {req.items.map((item, itemIdx) => {
          const selectedQuote = item.quotes.find((q) => q.partnerId === item.selectedPartnerId);
          const effectiveRate = selectedQuote ? selectedQuote.exFactoryRate + selectedQuote.transportRate : 0;
          const totalEstimated = effectiveRate * item.quantity;
          const fulfilledPct = item.quantity > 0 ? Math.round(((item.quantity - item.remainingQty) / item.quantity) * 100) : 0;

          return (
            <div key={item.id} className="rounded-xl border bg-card p-4 space-y-4 shadow-xs">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="h-6 w-6 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs font-mono shrink-0 mt-0.5">
                    {itemIdx + 1}
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-foreground">{item.material.name}</h3>
                    <p className="text-xs text-muted-foreground font-mono">
                      Category: {item.material.category || "General"} &middot; Required: {item.quantity.toLocaleString()} {item.unit}
                    </p>
                  </div>
                </div>

                <div className="text-right font-mono text-xs">
                  <div className="text-muted-foreground text-[10px] uppercase">Estimated Item Total</div>
                  <div className="font-bold text-foreground text-sm">{formatNpr(totalEstimated)}</div>
                </div>
              </div>

              {/* Progress if approved/partially ordered */}
              {(req.status === "approved" || req.status === "partially_ordered" || req.status === "ordered") && (
                <div className="space-y-1.5 bg-muted/20 p-2.5 rounded-lg border text-xs font-mono">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-muted-foreground">PO Fulfillment Progress</span>
                    <span className="font-semibold">{fulfilledPct}% ({item.quantity - item.remainingQty} / {item.quantity} {item.unit})</span>
                  </div>
                  <Progress value={fulfilledPct} className="h-1.5" />
                </div>
              )}

              {/* Quotes comparison list */}
              <div className="space-y-2">
                <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground font-semibold">
                  3-Vendor Comparison Quotes ({item.quotes.length})
                </p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                  {item.quotes.map((q) => {
                    const isSelected = q.partnerId === item.selectedPartnerId;
                    const totalRate = q.exFactoryRate + q.transportRate;

                    return (
                      <div
                        key={q.id}
                        className={cn(
                          "p-3 rounded-xl border space-y-2 transition",
                          isSelected
                            ? "bg-success/10 border-success/40 shadow-xs"
                            : "bg-muted/15 border-border/80"
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="font-semibold text-xs text-foreground truncate max-w-[140px]">{q.partner.name}</span>
                          </div>
                          {isSelected && (
                            <Badge variant="secondary" className="bg-success/15 text-success dark:bg-success dark:text-success/80 text-[9px] py-0 px-1 font-mono">
                              Selected
                            </Badge>
                          )}
                        </div>

                        <div className="text-xs font-mono space-y-0.5">
                          <div className="flex justify-between text-muted-foreground text-[11px]">
                            <span>Ex-Factory:</span>
                            <span>{formatNpr(q.exFactoryRate)}</span>
                          </div>
                          <div className="flex justify-between text-muted-foreground text-[11px]">
                            <span>Transport:</span>
                            <span>{formatNpr(q.transportRate)}</span>
                          </div>
                          <div className="flex justify-between font-bold text-foreground border-t pt-1">
                            <span>Landed Rate:</span>
                            <span>{formatNpr(totalRate)}</span>
                          </div>
                        </div>

                        {q.notes && <p className="text-[10px] text-muted-foreground italic truncate font-mono">"{q.notes}"</p>}
                      </div>
                    );
                  })}
                </div>

                {/* Justification Box */}
                {item.justification && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50/20 dark:border-amber-950 dark:bg-amber-950/10 p-3 space-y-1">
                    <p className="text-[10px] font-bold text-amber-800 dark:text-amber-200 flex items-center gap-1 font-mono">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                      Justification for Higher Price Selection:
                    </p>
                    <p className="text-xs text-foreground leading-relaxed font-sans">{item.justification}</p>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {req.remarks && (
        <div className="border rounded-xl p-4 bg-muted/5 text-xs">
          <span className="text-muted-foreground block mb-0.5 font-mono">Remarks:</span>
          <span className="text-foreground font-medium italic">"{req.remarks}"</span>
        </div>
      )}

      {/* Budget Variance Display with ConstructionTable */}
      {budgetVariance && budgetVariance.results.length > 0 && (
        <div className="border rounded-xl p-4 bg-card space-y-3">
          <h3 className="text-xs font-semibold flex items-center gap-1.5 font-mono text-foreground">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            Budget Variance Analysis
          </h3>
          <ConstructionTable
            data={budgetVariance.results}
            columns={varianceColumns}
            isLoading={false}
          />
        </div>
      )}

      {/* Rejection Reason Notice if Rejected */}
      {req.status === "rejected" && req.rejectionReason && (
        <div className="border border-red-200 bg-red-50/40 dark:border-red-900/50 dark:bg-red-950/20 rounded-xl p-4 text-xs space-y-1 font-mono">
          <div className="flex items-center gap-1.5 font-bold text-red-700 dark:text-red-300">
            <XCircle className="h-4 w-4" />
            Rejection Reason / Feedback:
          </div>
          <p className="text-red-900 dark:text-red-200 font-sans">{req.rejectionReason}</p>
        </div>
      )}

      {/* Generate PO Dialog */}
      {generateDialogOpen && (
        <GeneratePODialog
          projectId={projectId}
          open={generateDialogOpen}
          onOpenChange={setGenerateDialogOpen}
          items={pendingItemsForPO}
          onSuccess={() => {
            utils.requisition.getDetails.invalidate({ projectId, requisitionId });
            utils.requisition.list.invalidate({ projectId });
            setGenerateDialogOpen(false);
          }}
        />
      )}

      {/* Reject Reason Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent className="sm:max-w-md backdrop-blur-md bg-black/85 border-white/10 text-white">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold text-red-400 flex items-center gap-1.5">
              <XCircle className="h-4 w-4" /> Reject Requisition {req.number}
            </DialogTitle>
            <DialogDescription className="text-white/60">
              Provide actionable feedback for the site engineer explaining why this requisition is rejected.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
            <div className="space-y-1">
              <Label className="text-xs text-white">Rejection Reason *</Label>
              <Textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="e.g. Rate exceeds sanctioned rate analysis or budget allowance..."
                rows={3}
                className="text-xs bg-white/5 border-white/20 text-white"
                required
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRejectDialogOpen(false)}
              disabled={rejectMut.isPending}
              className="font-mono text-xs"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => {
                if (!rejectReason.trim()) {
                  toast.error("Please enter a rejection reason");
                  return;
                }
                rejectMut.mutate({
                  projectId,
                  requisitionId,
                  rejectionReason: rejectReason.trim(),
                });
              }}
              disabled={rejectMut.isPending || !rejectReason.trim()}
              className="font-mono text-xs"
            >
              {rejectMut.isPending && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
              Confirm Rejection
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
