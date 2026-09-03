"use client";

import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc-client";
import { isQueuedMutationResult } from "@/lib/offline-fetch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Award,
  ShieldCheck,
  AlertTriangle,
  Loader2,
  CheckCircle2,
  XCircle,
  FileSpreadsheet,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { formatNpr } from "@/lib/currency";

type VerifiedItem = {
  id: string;
  boqCode?: string | null;
  description: string;
  unit?: string | null;
  contractQty: number;
  previousQty: number;
  thisQty: number;
  verifiedQty: number;
  disallowedQty: number;
  disallowedReason: string;
  remarks: string;
  rate: number;
  amount: number;
};

const DISALLOWED_REASONS = [
  "Joint measurement discrepancy",
  "Defective execution / Snags pending",
  "Missing material test report / Cube test",
  "Work outside approved level / Alignment",
  "Unapproved variation / Extra item",
  "Duplicate claim in previous bill",
  "Client / Consultant disallowed in IPC",
  "Other / Engineering deduction",
];

export function VerifyBillDialog({
  projectId,
  bill,
  open,
  onOpenChange,
  onSuccess,
}: {
  projectId: string;
  bill: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const [items, setItems] = useState<VerifiedItem[]>([]);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (bill?.items) {
      setNotes(bill.notes || "");
      setItems(
        bill.items.map((item: any) => {
          const verifiedQty =
            item.verifiedQty !== null && item.verifiedQty !== undefined
              ? item.verifiedQty
              : item.thisQty;
          const disallowedQty = Math.max(0, item.thisQty - verifiedQty);

          return {
            id: item.id,
            boqCode: item.boqCode,
            description: item.description,
            unit: item.unit,
            contractQty: item.contractQty || 0,
            previousQty: item.previousQty || 0,
            thisQty: item.thisQty || 0,
            verifiedQty,
            disallowedQty,
            disallowedReason: item.disallowedReason || "",
            remarks: item.remarks || "",
            rate: item.rate || 0,
            amount: verifiedQty * (item.rate || 0),
          };
        })
      );
    }
  }, [bill]);

  const verifyMut = trpc.subcontractorBill.verifyBill.useMutation({
    onSuccess: (data) => {
      // H-18 (c): offline-queue path — the synthetic "_queued" reply has no
      // bill object; reading data.bill.status crashed the dialog.
      if (isQueuedMutationResult(data)) {
        toast.success("Verification saved offline — it will sync when you're back online");
        onOpenChange(false);
        onSuccess();
        return;
      }
      toast.success(
        data.bill.status === "certified"
          ? "Bill verified & certified successfully!"
          : data.bill.status === "disputed"
          ? "Bill marked as disputed"
          : "Verification saved as draft"
      );
      onOpenChange(false);
      onSuccess();
    },
    onError: (e) => toast.error(e.message),
  });



  const updateItemVerifiedQty = (idx: number, qty: number) => {
    setItems((prev) => {
      const copy = [...prev];
      const it = copy[idx];
      const validQty = isNaN(qty) || qty < 0 ? 0 : qty;
      const disallowed = Math.max(0, it.thisQty - validQty);

      copy[idx] = {
        ...it,
        verifiedQty: validQty,
        disallowedQty: disallowed,
        disallowedReason: disallowed > 0 ? it.disallowedReason || DISALLOWED_REASONS[0] : "",
        amount: validQty * it.rate,
      };
      return copy;
    });
  };

  const updateItemReason = (idx: number, reason: string) => {
    setItems((prev) => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], disallowedReason: reason };
      return copy;
    });
  };

  if (!bill) return null;

  const originalGross = bill.grossAmount || 0;
  const verifiedGross = items.reduce((sum, it) => sum + it.verifiedQty * it.rate, 0);
  const totalDisallowed = originalGross - verifiedGross;

  // Deductions from bill
  const retention = (verifiedGross * (bill.retentionPercent || 0)) / 100;
  const tds = (verifiedGross * (bill.tdsPercent || 0)) / 100;
  const advance = bill.advanceDeduction || 0;
  const material = bill.materialDeduction || 0;
  const other = bill.otherDeductions || 0;
  const netCertified = Math.max(0, verifiedGross - retention - tds - advance - material - other);

  const handleAction = (action: "verify" | "certify" | "dispute") => {
    verifyMut.mutate({
      projectId,
      billId: bill.id,
      action,
      notes,
      items: items.map((it) => ({
        id: it.id,
        verifiedQty: it.verifiedQty,
        disallowedReason: it.disallowedReason || undefined,
        remarks: it.remarks || undefined,
      })),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[85vh] overflow-y-auto backdrop-blur-md bg-black/85 border-white/10 text-white">
        <DialogHeader>
          <div className="flex items-center justify-between pr-6">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-success/90" />
              <DialogTitle className="text-base font-bold">
                Engineer Verification &amp; Certification: {bill.billNumber}
              </DialogTitle>
            </div>
            <Badge variant="outline" className="font-mono text-[10px] uppercase border-white/20 text-white">
              {bill.status.replace("_", " ")}
            </Badge>
          </div>
          <DialogDescription className="text-white/60 text-xs font-mono">
            Verify claimed quantities against site measurements (JMP / MB), record disallowed deductions with statutory reasons, and certify net payable.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Metadata Bar */}
          <div className="grid grid-cols-3 gap-2 bg-white/5 p-3 rounded-lg border border-white/10 text-xs font-mono">
            <div>
              <span className="text-white/60">Subcontractor: </span>
              <strong className="text-white font-sans">{bill.subcontractor?.name}</strong>
            </div>
            <div>
              <span className="text-white/60">Period: </span>
              <span className="font-mono text-white">{bill.period || "—"}</span>
            </div>
            <div>
              <span className="text-white/60">Claimed Gross: </span>
              <span className="font-mono font-bold text-white">{formatNpr(originalGross)}</span>
            </div>
          </div>

          {/* Line Items Verification Grid */}
          <div className="rounded-lg border border-white/10 overflow-hidden bg-white/5">
            <table className="w-full text-xs font-mono tabular-nums">
              <thead className="bg-white/10 border-b border-white/10 text-[10px] text-white/70 uppercase">
                <tr>
                  <th className="p-2 text-left w-16">BOQ</th>
                  <th className="p-2 text-left">Description</th>
                  <th className="p-2 text-right w-16">Claimed</th>
                  <th className="p-2 text-right w-24 bg-success/20 text-success/80 font-bold">
                    Verified Qty
                  </th>
                  <th className="p-2 text-right w-20 text-red-400">Disallowed</th>
                  <th className="p-2 text-right w-20">Rate</th>
                  <th className="p-2 text-right w-24">Verified Amt</th>
                  <th className="p-2 text-left w-48">Disallowed Reason / Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {items.map((item, idx) => {
                  const isDisallowed = item.disallowedQty > 0;
                  return (
                    <tr key={item.id} className={cn("hover:bg-white/5", isDisallowed && "bg-amber-500/10")}>
                      <td className="p-2 font-bold text-primary">{item.boqCode || "—"}</td>
                      <td className="p-2 font-sans text-white truncate max-w-[180px]" title={item.description}>
                        {item.description}
                      </td>
                      <td className="p-2 text-right text-white/60">
                        {item.thisQty} {item.unit}
                      </td>
                      <td className="p-1.5 text-right bg-success/15">
                        <Input
                          type="number"
                          step="any"
                          value={item.verifiedQty}
                          onChange={(e) => updateItemVerifiedQty(idx, parseFloat(e.target.value) || 0)}
                          className="h-7 text-xs text-right font-bold font-mono text-success/80 bg-white/5 border-success/40"
                        />
                      </td>
                      <td className={cn("p-2 text-right font-bold", isDisallowed ? "text-red-400" : "text-white/40")}>
                        {item.disallowedQty > 0 ? `-${item.disallowedQty.toFixed(2)}` : "0"}
                      </td>
                      <td className="p-2 text-right text-white/60 font-mono">
                        {formatNpr(item.rate)}
                      </td>
                      <td className="p-2 text-right font-bold font-mono text-white">
                        {formatNpr(item.verifiedQty * item.rate)}
                      </td>
                      <td className="p-1.5">
                        {isDisallowed ? (
                          <Select
                            value={item.disallowedReason}
                            onValueChange={(val) => updateItemReason(idx, val)}
                          >
                            <SelectTrigger className="h-7 text-[10px] text-red-300 border-red-500/40 bg-white/5">
                              <SelectValue placeholder="Select Reason" />
                            </SelectTrigger>
                            <SelectContent className="backdrop-blur-md bg-black/90 border-white/10 text-white">
                              {DISALLOWED_REASONS.map((r) => (
                                <SelectItem key={r} value={r} className="text-xs">
                                  {r}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <span className="text-[10px] text-white/40 italic pl-1">No deductions</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Verification Financial Summary Abstract */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-white/5 p-3 rounded-lg border border-white/10 text-xs font-mono">
            <div className="space-y-1">
              <span className="text-white/60">Original Claimed:</span>
              <p className="font-mono font-bold text-white">{formatNpr(originalGross)}</p>
            </div>
            <div className="space-y-1">
              <span className="text-white/60">Verified Gross:</span>
              <p className="font-mono font-bold text-success/80">
                {formatNpr(verifiedGross)}
              </p>
            </div>
            <div className="space-y-1">
              <span className="text-white/60">Disallowed Variance:</span>
              <p className={cn("font-mono font-bold", totalDisallowed > 0 ? "text-red-400" : "text-white/40")}>
                {totalDisallowed > 0 ? `-${formatNpr(totalDisallowed)}` : "NPR 0"}
              </p>
            </div>
            <div className="space-y-1">
              <span className="text-white/60 font-semibold">Net Certified:</span>
              <p className="font-mono text-sm font-bold text-primary">
                {formatNpr(netCertified)}
              </p>
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label className="text-xs text-white">Engineer Certification Notes / Remarks</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Enter site verification notes, measurement sheet references, or joint inspection remarks..."
              rows={2}
              className="text-xs bg-white/5 border-white/20 text-white font-mono"
            />
          </div>
        </div>

        <DialogFooter className="flex flex-col sm:flex-row justify-between gap-2 border-t border-white/10 pt-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={verifyMut.isPending}
            className="font-mono text-xs"
          >
            Cancel
          </Button>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="text-red-400 border-red-500/30 hover:bg-red-950/20 font-mono text-xs"
              onClick={() => handleAction("dispute")}
              disabled={verifyMut.isPending}
            >
              <AlertTriangle className="h-3.5 w-3.5 mr-1" /> Mark Disputed
            </Button>

            <Button
              variant="secondary"
              size="sm"
              onClick={() => handleAction("verify")}
              disabled={verifyMut.isPending}
              className="font-mono text-xs"
            >
              Save Verification Draft
            </Button>

            <Button
              size="sm"
              className="bg-success hover:bg-success text-white font-mono text-xs font-semibold"
              onClick={() => handleAction("certify")}
              disabled={verifyMut.isPending}
            >
              {verifyMut.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
              ) : (
                <Award className="h-3.5 w-3.5 mr-1.5" />
              )}
              Certify Bill ({formatNpr(netCertified)})
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
