"use client";

import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc-client";
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
            amount: item.amount || 0,
          };
        })
      );
    }
  }, [bill]);

  const verifyMut = trpc.subcontractorBill.verifyBill.useMutation({
    onSuccess: (_data, vars) => {
      toast.success(
        vars.action === "certify"
          ? "Bill verified & certified successfully"
          : vars.action === "dispute"
          ? "Bill marked as disputed"
          : "Verification saved"
      );
      onSuccess();
      onOpenChange(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const updateItemVerifiedQty = (index: number, val: number) => {
    const next = [...items];
    const item = next[index];
    const verifiedQty = Math.max(0, val);
    const disallowedQty = Math.max(0, item.thisQty - verifiedQty);

    next[index] = {
      ...item,
      verifiedQty,
      disallowedQty,
      disallowedReason: disallowedQty > 0 && !item.disallowedReason ? DISALLOWED_REASONS[0] : item.disallowedReason,
    };
    setItems(next);
  };

  const updateItemReason = (index: number, reason: string) => {
    const next = [...items];
    next[index].disallowedReason = reason;
    setItems(next);
  };

  // Recalculations
  const originalGross = bill?.grossAmount || 0;
  const verifiedGross = items.reduce((sum, item) => sum + item.verifiedQty * item.rate, 0);
  const totalDisallowed = originalGross - verifiedGross;

  const retentionPercent = bill?.retentionPercent || 0;
  const vatPercent = bill?.vatPercent || 13;
  const tdsPercent = bill?.tdsPercent || 1.5;
  const materialDeduction = bill?.materialDeduction || 0;
  const advanceRecovery = bill?.advanceRecovery || 0;

  const retentionAmt = (verifiedGross * retentionPercent) / 100;
  const vatAmt = (verifiedGross * vatPercent) / 100;
  const tdsAmt = (verifiedGross * tdsPercent) / 100;
  const netCertified = Math.max(
    0,
    verifiedGross - retentionAmt + vatAmt - tdsAmt - materialDeduction - advanceRecovery
  );

  const handleAction = (action: "verify" | "certify" | "dispute") => {
    verifyMut.mutate({
      projectId,
      billId: bill.id,
      action,
      notes: notes || undefined,
      items: items.map((i) => ({
        id: i.id,
        verifiedQty: i.verifiedQty,
        disallowedReason: i.disallowedQty > 0 ? i.disallowedReason : undefined,
        remarks: i.remarks || undefined,
      })),
    });
  };

  if (!bill) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-emerald-600" />
            Engineer Bill Verification & Certification: {bill.number}
          </DialogTitle>
          <DialogDescription>
            Verify measured quantities line-by-line against site joint measurements and Client IPC records.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Subcontractor & Period Info */}
          <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-lg bg-muted/30 border text-xs">
            <div>
              <span className="text-muted-foreground">Subcontractor: </span>
              <strong className="text-foreground">{bill.subcontractor?.name}</strong>
            </div>
            <div>
              <span className="text-muted-foreground">Period: </span>
              <span className="font-mono">{bill.period || "—"}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Claimed Gross: </span>
              <span className="font-mono font-bold">NPR {originalGross.toLocaleString()}</span>
            </div>
          </div>

          {/* Line Items Verification Grid */}
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-xs font-mono tabular-nums">
              <thead className="bg-muted/60 border-b text-[10px] text-muted-foreground uppercase">
                <tr>
                  <th className="p-2 text-left w-16">BOQ</th>
                  <th className="p-2 text-left">Description</th>
                  <th className="p-2 text-right w-16">Claimed</th>
                  <th className="p-2 text-right w-24 bg-emerald-50/50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-300 font-bold">
                    Verified Qty
                  </th>
                  <th className="p-2 text-right w-20 text-red-600">Disallowed</th>
                  <th className="p-2 text-right w-20">Rate</th>
                  <th className="p-2 text-right w-24">Verified Amt</th>
                  <th className="p-2 text-left w-48">Disallowed Reason / Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {items.map((item, idx) => {
                  const isDisallowed = item.disallowedQty > 0;
                  return (
                    <tr key={item.id} className={cn("hover:bg-muted/15", isDisallowed && "bg-amber-50/20 dark:bg-amber-950/10")}>
                      <td className="p-2 font-bold text-primary">{item.boqCode || "—"}</td>
                      <td className="p-2 font-sans text-foreground truncate max-w-[180px]" title={item.description}>
                        {item.description}
                      </td>
                      <td className="p-2 text-right text-muted-foreground">
                        {item.thisQty} {item.unit}
                      </td>
                      <td className="p-1.5 text-right bg-emerald-50/40 dark:bg-emerald-950/15">
                        <Input
                          type="number"
                          step="any"
                          value={item.verifiedQty}
                          onChange={(e) => updateItemVerifiedQty(idx, parseFloat(e.target.value) || 0)}
                          className="h-7 text-xs text-right font-bold font-mono text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800"
                        />
                      </td>
                      <td className={cn("p-2 text-right font-bold", isDisallowed ? "text-red-600 dark:text-red-400" : "text-muted-foreground")}>
                        {item.disallowedQty > 0 ? `-${item.disallowedQty.toFixed(2)}` : "0"}
                      </td>
                      <td className="p-2 text-right text-muted-foreground font-mono">
                        {item.rate.toLocaleString()}
                      </td>
                      <td className="p-2 text-right font-bold font-mono text-foreground">
                        {(item.verifiedQty * item.rate).toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                      </td>
                      <td className="p-1.5">
                        {isDisallowed ? (
                          <Select
                            value={item.disallowedReason}
                            onValueChange={(val) => updateItemReason(idx, val)}
                          >
                            <SelectTrigger className="h-7 text-[10px] text-red-600 dark:text-red-400 border-red-200 dark:border-red-900">
                              <SelectValue placeholder="Select Reason" />
                            </SelectTrigger>
                            <SelectContent>
                              {DISALLOWED_REASONS.map((r) => (
                                <SelectItem key={r} value={r} className="text-xs">
                                  {r}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <span className="text-[10px] text-muted-foreground/60 italic pl-1">No deductions</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Verification Financial Summary Abstract */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-muted/20 p-3 rounded-lg border text-xs">
            <div className="space-y-1">
              <span className="text-muted-foreground">Original Claimed Gross:</span>
              <p className="font-mono font-bold">NPR {originalGross.toLocaleString()}</p>
            </div>
            <div className="space-y-1">
              <span className="text-muted-foreground">Engineer Verified Gross:</span>
              <p className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                NPR {verifiedGross.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
              </p>
            </div>
            <div className="space-y-1">
              <span className="text-muted-foreground">Total Disallowed Variance:</span>
              <p className={cn("font-mono font-bold", totalDisallowed > 0 ? "text-red-600" : "text-muted-foreground")}>
                {totalDisallowed > 0 ? `-NPR ${totalDisallowed.toLocaleString("en-IN", { maximumFractionDigits: 0 })}` : "NPR 0"}
              </p>
            </div>
            <div className="space-y-1">
              <span className="text-muted-foreground font-semibold">Net Certified Payable:</span>
              <p className="font-mono text-base font-bold text-violet-700 dark:text-violet-300">
                NPR {netCertified.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
              </p>
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label className="text-xs">Engineer Certification Notes / Remarks</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Enter site verification notes, measurement sheet references, or joint inspection remarks..."
              rows={2}
              className="text-xs"
            />
          </div>
        </div>

        <DialogFooter className="flex flex-col sm:flex-row justify-between gap-2 border-t pt-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={verifyMut.isPending}
          >
            Cancel
          </Button>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="text-red-600 border-red-200 hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-950"
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
            >
              Save Verification Draft
            </Button>

            <Button
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
              onClick={() => handleAction("certify")}
              disabled={verifyMut.isPending}
            >
              {verifyMut.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
              ) : (
                <Award className="h-3.5 w-3.5 mr-1.5" />
              )}
              Certify Bill (NPR {netCertified.toLocaleString("en-IN", { maximumFractionDigits: 0 })})
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
