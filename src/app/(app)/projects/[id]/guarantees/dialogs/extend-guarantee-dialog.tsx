"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc-client";
import { DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, CalendarClock, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { toastError } from "@/lib/toast-error";
import { format } from "date-fns";
import { adToBs } from "@/lib/nepali-calendar";

export function ExtendGuaranteeDialog({
  guarantee,
  onDone,
}: {
  guarantee: {
    id: string;
    projectId: string;
    guaranteeNumber: string;
    issuingBank: string;
    amount: number;
    expiryDate: string | Date;
    expiryMiti?: string | null;
  };
  onDone: () => void;
}) {
  const utils = trpc.useUtils();

  const currentExpiry = new Date(guarantee.expiryDate);

  const [newExpiryDate, setNewExpiryDate] = useState(() => {
    const d = new Date(currentExpiry);
    d.setMonth(d.getMonth() + 6);
    return format(d, "yyyy-MM-dd");
  });

  const [newExpiryMiti, setNewExpiryMiti] = useState(() => {
    try {
      const d = new Date(currentExpiry);
      d.setMonth(d.getMonth() + 6);
      return adToBs(d).formatted;
    } catch {
      return "";
    }
  });

  const [amendmentLetterRef, setAmendmentLetterRef] = useState("");
  const [additionalCommission, setAdditionalCommission] = useState("0");
  const [remarks, setRemarks] = useState("");

  const extendMutation = trpc.bankGuarantee.extend.useMutation({
    onSuccess: () => {
      utils.bankGuarantee.list.invalidate({ projectId: guarantee.projectId });
      utils.bankGuarantee.portfolioAlerts.invalidate();
      toast.success("Bank Guarantee extension recorded successfully!");
      onDone();
    },
    onError: (e) => toastError("Guarantee extension could not be recorded. Please try again.", e.message),
  });

  const handleDateChange = (adVal: string) => {
    setNewExpiryDate(adVal);
    try {
      setNewExpiryMiti(adToBs(new Date(adVal)).formatted);
    } catch {}
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newExpiryDate) {
      toast.error("Please enter a new expiry date.");
      return;
    }

    extendMutation.mutate({
      id: guarantee.id,
      newExpiryDate,
      newExpiryMiti: newExpiryMiti || undefined,
      amendmentLetterRef: amendmentLetterRef.trim() || undefined,
      additionalCommission: parseFloat(additionalCommission) || 0,
      remarks: remarks.trim() || undefined,
    });
  };

  return (
    <DialogContent className="max-w-md">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2 text-base">
          <CalendarClock className="h-5 w-5 text-amber-500" />
          Extend Guarantee / Amendment (म्याद थप)
        </DialogTitle>
      </DialogHeader>

      <div className="bg-muted/40 p-3 rounded-lg border text-xs space-y-1">
        <div className="flex justify-between">
          <span className="text-muted-foreground">BG Number:</span>
          <span className="font-mono font-bold text-foreground">{guarantee.guaranteeNumber}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Bank:</span>
          <span className="font-medium text-foreground">{guarantee.issuingBank}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Current Expiry:</span>
          <span className="font-mono text-amber-600 dark:text-amber-400 font-bold">
            {guarantee.expiryMiti || format(currentExpiry, "yyyy-MM-dd")}
          </span>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3 mt-2">
        <div className="space-y-1.5 bg-card p-3 rounded-lg border">
          <Label className="text-xs font-semibold text-primary">New Extended Expiry Date *</Label>
          <div className="grid grid-cols-2 gap-2 mt-1">
            <div>
              <span className="text-[10px] text-muted-foreground">AD Date</span>
              <Input
                type="date"
                required
                className="h-8 text-xs font-mono"
                value={newExpiryDate}
                onChange={(e) => handleDateChange(e.target.value)}
              />
            </div>
            <div>
              <span className="text-[10px] text-muted-foreground">BS Miti</span>
              <Input
                placeholder="2082-08-15"
                className="h-8 text-xs font-mono"
                value={newExpiryMiti}
                onChange={(e) => setNewExpiryMiti(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Amendment / Letter Reference</Label>
          <Input
            placeholder="e.g. Bank Letter Ref # 452/081-82"
            className="h-8 text-xs font-mono"
            value={amendmentLetterRef}
            onChange={(e) => setAmendmentLetterRef(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Additional Bank Commission (NPR)</Label>
          <Input
            type="number"
            min="0"
            step="any"
            placeholder="0"
            className="h-8 text-xs font-mono"
            value={additionalCommission}
            onChange={(e) => setAdditionalCommission(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Reason / Remarks</Label>
          <Textarea
            rows={2}
            placeholder="e.g. Contract time extension approved by Project Chief..."
            className="text-xs"
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
          />
        </div>

        <DialogFooter className="gap-2 pt-2">
          <Button type="button" variant="outline" size="sm" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={extendMutation.isPending}>
            {extendMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Extension
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
