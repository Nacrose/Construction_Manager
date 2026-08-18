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

  const updateStatusMut = trpc.requisition.updateStatus.useMutation({
    onSuccess: (res) => {
      toast.success(`Requisition status updated to ${res.requisition.status}`);
      setRejectDialogOpen(false);
      setRejectReason("");
      utils.requisition.getDetails.invalidate({ projectId, requisitionId });
      utils.requisition.list.invalidate({ projectId });
    },
    onError: (e) => toast.error(e.message),
  });

  const req = data?.requisition;

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
          partnerId: item.selectedPartnerId,
          partnerName: selectedPartner ? selectedPartner.name : "Unknown Vendor",
          rate,
        };
      });
  }, [req]);

  // Overall PR completion stats
  const prStats = useMemo(() => {
    if (!req) return { totalItems: 0, fullyOrdered: 0, partiallyOrdered: 0, unordered: 0, percent: 0 };
    const totalItems = req.items.length;
    const fullyOrdered = req.items.filter((i) => i.itemStatus === "fully_ordered").length;
    const partiallyOrdered = req.items.filter((i) => i.itemStatus === "partially_ordered").length;
    const unordered = req.items.filter((i) => i.itemStatus === "unordered").length;
    const percent = Math.round((fullyOrdered / (totalItems || 1)) * 100);

    return { totalItems, fullyOrdered, partiallyOrdered, unordered, percent };
  }, [req]);

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!req) return <p className="text-center text-sm py-8">Requisition not found.</p>;

  return (
    <div className="space-y-6">
      {/* Header section with status */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-4">
        <div className="space-y-1">
          <button
            onClick={onClose}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-1.5 transition-colors"
          >
            <ArrowLeft className="h-3 w-3" /> Back to Requisitions
          </button>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-amber-500 shrink-0" />
            Comparison Statement {req.number}
          </h2>
          <p className="text-xs text-muted-foreground">
            Created by {req.createdBy.name} on {format(new Date(req.createdAt), "dd MMM yyyy")}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className={cn(
              "capitalize px-3 py-1 text-xs font-semibold rounded-full border-0 shadow-sm",
              req.status === "approved"
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                : req.status === "partially_ordered"
                ? "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                : req.status === "ordered"
                ? "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300"
                : req.status === "rejected"
                ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
                : "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
            )}
          >
            {req.status.replace("_", " ")}
          </Badge>
        </div>
      </div>

      {/* PO Ordering Progress Bar if approved or partially_ordered */}
      {(req.status === "approved" || req.status === "partially_ordered" || req.status === "ordered") && (
        <div className="bg-card border rounded-xl p-4 space-y-2.5 shadow-sm">
          <div className="flex justify-between items-center text-xs">
            <span className="font-semibold text-foreground flex items-center gap-1.5">
              <PackageCheck className="h-4 w-4 text-blue-600" />
              PO Creation Progress
            </span>
            <span className="text-muted-foreground">
              <strong className="text-foreground">{prStats.fullyOrdered}</strong> / {prStats.totalItems} Items Fully Ordered ({prStats.percent}%)
            </span>
          </div>
          <Progress value={prStats.percent} className="h-2 bg-muted" />
          <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-emerald-500 inline-block" />
                Fully Ordered: {prStats.fullyOrdered}
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-amber-500 inline-block" />
                Partially Ordered: {prStats.partiallyOrdered}
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-slate-300 dark:bg-slate-700 inline-block" />
                Unordered: {prStats.unordered}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Main comparative item details */}
      <div className="space-y-6">
        {req.items.map((item) => {
          const quoteTotals = item.quotes.map((q) => q.exFactoryRate + q.transportRate);
          const minTotal = Math.min(...quoteTotals);

          return (
            <div key={item.id} className="space-y-4">
              <div className="bg-muted/10 p-4 rounded-xl border border-border/40 space-y-4">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">
                      📦 Item: {item.material.name}
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Required Qty: <span className="font-bold text-foreground">{item.quantity} {item.unit}</span>
                    </p>
                  </div>

                  {/* Item Order Status Badge */}
                  <div className="flex items-center gap-2">
                    {item.itemStatus === "fully_ordered" ? (
                      <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-300 text-[10px]">
                        🟢 Fully Ordered ({item.orderedQty} / {item.quantity} {item.unit})
                      </Badge>
                    ) : item.itemStatus === "partially_ordered" ? (
                      <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border-amber-300 text-[10px]">
                        🟡 Partially Ordered ({item.orderedQty} / {item.quantity} {item.unit})
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-muted-foreground text-[10px]">
                        🔴 Unordered (0 / {item.quantity} {item.unit})
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Linked PO Numbers if any */}
                {item.linkedPOs && item.linkedPOs.length > 0 && (
                  <div className="flex items-center gap-2 bg-blue-50/50 dark:bg-blue-950/20 p-2 rounded-lg border border-blue-200/50 text-xs">
                    <span className="text-[11px] font-semibold text-blue-900 dark:text-blue-200">
                      Generated PO(s):
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {item.linkedPOs.map((po) => (
                        <Badge
                          key={po.poId}
                          variant="outline"
                          className="bg-white dark:bg-card text-blue-700 dark:text-blue-300 border-blue-300 text-[10px] gap-1"
                        >
                          <ExternalLink className="h-2.5 w-2.5" />
                          {po.poNumber} ({po.quantity} {item.unit})
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* 3 Vendor Columns Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 items-start">
                  {item.quotes.map((quote) => {
                    const totalRate = quote.exFactoryRate + quote.transportRate;
                    const totalCost = totalRate * item.quantity;
                    const isCheapest = totalRate === minTotal;
                    const isSelected = quote.partnerId === item.selectedPartnerId;

                    return (
                      <div
                        key={quote.id}
                        className={cn(
                          "rounded-xl border p-3.5 space-y-2.5 bg-card relative overflow-hidden transition-all shadow-sm",
                          isSelected
                            ? "border-blue-500 ring-1 ring-blue-500/20"
                            : isCheapest
                            ? "border-emerald-500/40"
                            : "border-border/60"
                        )}
                      >
                        {isSelected && (
                          <div className="absolute top-0 right-0 bg-blue-600 text-white text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-bl">
                            Selected
                          </div>
                        )}

                        <div>
                          <p className="font-bold text-xs text-foreground flex items-center gap-1.5">
                            <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            {quote.partner.name}
                          </p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            Ex-Factory: NPR {quote.exFactoryRate.toLocaleString()} / {item.unit} <br />
                            Transport: NPR {quote.transportRate.toLocaleString()} / {item.unit}
                          </p>
                        </div>

                        <div className="border-t border-b py-2 space-y-1 text-xs">
                          <div className="flex justify-between">
                            <span className="text-[10px] text-muted-foreground">Unit Rate:</span>
                            <span className="font-semibold text-foreground">NPR {totalRate.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-[10px] text-muted-foreground">Total cost:</span>
                            <span className="font-bold text-foreground">NPR {totalCost.toLocaleString()}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5">
                          {isCheapest && (
                            <span className="inline-flex items-center gap-0.5 rounded bg-emerald-100 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
                              <Check className="h-2.5 w-2.5" /> Best Price
                            </span>
                          )}
                          {isSelected && (
                            <span className="inline-flex items-center gap-0.5 rounded bg-blue-100 px-1.5 py-0.5 text-[9px] font-semibold text-blue-700 dark:bg-blue-950 dark:text-blue-400">
                              Selected Vendor
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Justification Box */}
                {item.justification && (
                  <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/20 dark:border-amber-950 dark:bg-amber-950/10 p-3 space-y-1">
                    <p className="text-[10px] font-bold text-amber-800 dark:text-amber-200 flex items-center gap-1">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                      Justification for Higher Price Selection:
                    </p>
                    <p className="text-xs text-foreground leading-relaxed">{item.justification}</p>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {req.remarks && (
        <div className="border rounded-xl p-4 bg-muted/5 text-xs">
          <span className="text-muted-foreground block mb-0.5">Remarks:</span>
          <span className="text-foreground font-medium italic">"{req.remarks}"</span>
        </div>
      )}

      {/* Rejection Reason Notice if Rejected */}
      {req.status === "rejected" && req.rejectionReason && (
        <div className="border border-red-200 bg-red-50/40 dark:border-red-900/50 dark:bg-red-950/20 rounded-xl p-4 text-xs space-y-1">
          <div className="flex items-center gap-1.5 font-bold text-red-700 dark:text-red-300">
            <XCircle className="h-4 w-4" />
            Rejection Reason / Feedback:
          </div>
          <p className="text-foreground pl-5.5 leading-relaxed">{req.rejectionReason}</p>
        </div>
      )}

      {/* Action Buttons for approving/generating PO */}
      <div className="flex justify-end gap-3 border-t pt-4">
        {req.status === "pending_approval" && isAdmin && (
          <>
            <Button
              variant="outline"
              className="text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950/20"
              disabled={updateStatusMut.isPending}
              onClick={() => setRejectDialogOpen(true)}
              size="sm"
            >
              {updateStatusMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <XCircle className="h-4 w-4 mr-1.5" />}
              Reject Requisition
            </Button>
            <Button
              variant="default"
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              disabled={updateStatusMut.isPending}
              onClick={() => updateStatusMut.mutate({ projectId, requisitionId: req.id, status: "approved" })}
              size="sm"
            >
              {updateStatusMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Check className="h-4 w-4 mr-1.5" />}
              Approve Requisition
            </Button>
          </>
        )}

        {(req.status === "approved" || req.status === "partially_ordered") && canWrite && (
          <Button
            variant="default"
            className="bg-blue-600 hover:bg-blue-700 text-white"
            onClick={() => setGenerateDialogOpen(true)}
            size="sm"
            disabled={pendingItemsForPO.length === 0}
          >
            <FileSpreadsheet className="h-4 w-4 mr-1.5" />
            {req.status === "partially_ordered" ? "Order Remaining Items" : "Generate Purchase Orders"}
          </Button>
        )}

        {req.status === "ordered" && (
          <div className="text-xs text-emerald-700 dark:text-emerald-300 font-semibold bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 rounded-lg px-4 py-2 flex items-center gap-1.5">
            <Check className="h-4 w-4 text-emerald-600" /> All items in this Requisition have been fully ordered into Purchase Orders.
          </div>
        )}
      </div>

      {/* Reject Reason Confirmation Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <XCircle className="h-5 w-5" />
              <span>Reject Comparison Statement ({req.number})</span>
            </DialogTitle>
            <DialogDescription>
              Please state the reason for rejecting this requisition. This reason will be recorded and visible to the requisitioner.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-2">
            <Label className="text-xs font-semibold">Rejection Reason / Required Corrections *</Label>
            <Textarea
              placeholder="e.g., Quotations exceed budgetary allowance, or please obtain quote from alternate cement distributor..."
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
              className="text-xs leading-relaxed"
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRejectDialogOpen(false)}
              disabled={updateStatusMut.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={updateStatusMut.isPending || !rejectReason.trim()}
              onClick={() =>
                updateStatusMut.mutate({
                  projectId,
                  requisitionId: req.id,
                  status: "rejected",
                  rejectionReason: rejectReason.trim(),
                })
              }
            >
              {updateStatusMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <XCircle className="h-4 w-4 mr-1.5" />}
              Confirm Rejection
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Generate PO Dialog */}
      <GeneratePODialog
        projectId={projectId}
        open={generateDialogOpen}
        onOpenChange={setGenerateDialogOpen}
        items={pendingItemsForPO}
        title={`Generate Purchase Orders (${req.number})`}
        description="Choose automatic vendor-based PO creation or manually select items and quantities to order."
        onSuccess={() => {
          utils.requisition.getDetails.invalidate({ projectId, requisitionId });
          utils.requisition.list.invalidate({ projectId });
        }}
      />
    </div>
  );
}
