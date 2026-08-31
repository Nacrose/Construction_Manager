"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc-client";
import { DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import { Loader2, ShieldCheck, UploadCloud } from "lucide-react";
import { toast } from "sonner";
import { toastError } from "@/lib/toast-error";
import { format } from "date-fns";
import { adToBs, bsToAd } from "@/lib/nepali-calendar";

export function AddGuaranteeDialog({
  projectId,
  onDone,
}: {
  projectId: string;
  onDone: () => void;
}) {
  const utils = trpc.useUtils();

  const [type, setType] = useState<
    "performance_bond" | "advance_payment" | "car_insurance" | "retention_bond" | "bid_bond" | "other"
  >("performance_bond");
  const [guaranteeNumber, setGuaranteeNumber] = useState("");
  const [issuingBank, setIssuingBank] = useState("");
  const [branch, setBranch] = useState("");
  const [beneficiary, setBeneficiary] = useState("");
  const [amount, setAmount] = useState("");
  const [issuedDate, setIssuedDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [issuedMiti, setIssuedMiti] = useState(() => {
    try {
      return adToBs(new Date()).formatted;
    } catch {
      return "";
    }
  });

  const [expiryDate, setExpiryDate] = useState(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() + 1);
    return format(d, "yyyy-MM-dd");
  });
  const [expiryMiti, setExpiryMiti] = useState(() => {
    try {
      const d = new Date();
      d.setFullYear(d.getFullYear() + 1);
      return adToBs(d).formatted;
    } catch {
      return "";
    }
  });

  const [claimPeriodDays, setClaimPeriodDays] = useState("30");
  const [marginAmount, setMarginAmount] = useState("0");
  const [commissionRate, setCommissionRate] = useState("0");
  const [commissionPaid, setCommissionPaid] = useState("0");
  const [purpose, setPurpose] = useState("");
  const [documentUrl, setDocumentUrl] = useState("");
  const [notes, setNotes] = useState("");

  const createMutation = trpc.bankGuarantee.create.useMutation({
    onSuccess: () => {
      utils.bankGuarantee.list.invalidate({ projectId });
      utils.bankGuarantee.portfolioAlerts.invalidate();
      toast.success("Bank Guarantee / Insurance Policy registered successfully!");
      onDone();
    },
    onError: (e) => toastError("Bank guarantee could not be registered. Please try again.", e.message),
  });

  const handleIssuedDateChange = (adVal: string) => {
    setIssuedDate(adVal);
    try {
      setIssuedMiti(adToBs(new Date(adVal)).formatted);
    } catch {}
  };

  const handleExpiryDateChange = (adVal: string) => {
    setExpiryDate(adVal);
    try {
      setExpiryMiti(adToBs(new Date(adVal)).formatted);
    } catch {}
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!guaranteeNumber.trim() || !issuingBank.trim() || !beneficiary.trim() || !amount) {
      toast.error("Please fill in all required fields.");
      return;
    }

    createMutation.mutate({
      projectId,
      type,
      guaranteeNumber: guaranteeNumber.trim(),
      issuingBank: issuingBank.trim(),
      branch: branch.trim() || undefined,
      beneficiary: beneficiary.trim(),
      amount: parseFloat(amount) || 0,
      issuedDate,
      issuedMiti: issuedMiti || undefined,
      expiryDate,
      expiryMiti: expiryMiti || undefined,
      claimPeriodDays: parseInt(claimPeriodDays) || 30,
      marginAmount: parseFloat(marginAmount) || 0,
      commissionRate: parseFloat(commissionRate) || 0,
      commissionPaid: parseFloat(commissionPaid) || 0,
      purpose: purpose.trim() || undefined,
      documentUrl: documentUrl.trim() || undefined,
      notes: notes.trim() || undefined,
    });
  };

  return (
    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2 text-lg">
          <ShieldCheck className="h-5 w-5 text-primary" />
          Register Bank Guarantee / Insurance Policy (जमानत तथा बीमा)
        </DialogTitle>
      </DialogHeader>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Type & BG Number */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Guarantee / Policy Type *</Label>
            <Select value={type} onValueChange={(v: any) => setType(v)}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="performance_bond">Performance Security (कार्यसम्पादन जमानत)</SelectItem>
                <SelectItem value="advance_payment">Mobilization APG (पेश्की जमानत)</SelectItem>
                <SelectItem value="car_insurance">Contractor&apos;s All Risk (CAR Insurance)</SelectItem>
                <SelectItem value="retention_bond">Retention Guarantee (धरौटी जमानत)</SelectItem>
                <SelectItem value="bid_bond">Bid Bond / EMD (बोलपत्र जमानत)</SelectItem>
                <SelectItem value="other">Other Guarantee / Bond</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">BG / Policy Number *</Label>
            <Input
              required
              placeholder="e.g. BG/NABIL/2081/042"
              className="h-9 text-xs font-mono"
              value={guaranteeNumber}
              onChange={(e) => setGuaranteeNumber(e.target.value)}
            />
          </div>
        </div>

        {/* Issuing Bank & Beneficiary */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Issuing Bank / Insurer *</Label>
            <Input
              required
              placeholder="e.g. Nabil Bank / Shikhar Insurance"
              className="h-9 text-xs"
              value={issuingBank}
              onChange={(e) => setIssuingBank(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Branch (Optional)</Label>
            <Input
              placeholder="e.g. Hetauda / New Road"
              className="h-9 text-xs"
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Beneficiary (Client) *</Label>
            <Input
              required
              placeholder="e.g. Division Road Office, Hetauda"
              className="h-9 text-xs"
              value={beneficiary}
              onChange={(e) => setBeneficiary(e.target.value)}
            />
          </div>
        </div>

        {/* Amount & Margins */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-muted/40 p-3 rounded-lg border">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Guarantee Value (NPR) *</Label>
            <Input
              required
              type="number"
              min="0"
              step="any"
              placeholder="e.g. 2500000"
              className="h-9 text-xs font-mono font-bold"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Cash Margin Held (NPR)</Label>
            <Input
              type="number"
              min="0"
              step="any"
              placeholder="e.g. 250000 (10%)"
              className="h-9 text-xs font-mono"
              value={marginAmount}
              onChange={(e) => setMarginAmount(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Commission Paid (NPR)</Label>
            <Input
              type="number"
              min="0"
              step="any"
              placeholder="e.g. 15000"
              className="h-9 text-xs font-mono"
              value={commissionPaid}
              onChange={(e) => setCommissionPaid(e.target.value)}
            />
          </div>
        </div>

        {/* Dates (BS Miti + AD) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5 bg-card p-3 rounded-lg border">
            <Label className="text-xs font-semibold">Issued Date</Label>
            <div className="grid grid-cols-2 gap-2 mt-1">
              <div>
                <span className="text-[10px] text-muted-foreground">AD Date</span>
                <Input
                  type="date"
                  className="h-8 text-xs font-mono"
                  value={issuedDate}
                  onChange={(e) => handleIssuedDateChange(e.target.value)}
                />
              </div>
              <div>
                <span className="text-[10px] text-muted-foreground">BS Miti</span>
                <Input
                  placeholder="2081-02-15"
                  className="h-8 text-xs font-mono"
                  value={issuedMiti}
                  onChange={(e) => setIssuedMiti(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="space-y-1.5 bg-card p-3 rounded-lg border">
            <Label className="text-xs font-semibold text-amber-600 dark:text-amber-400">
              Expiry Date *
            </Label>
            <div className="grid grid-cols-2 gap-2 mt-1">
              <div>
                <span className="text-[10px] text-muted-foreground">AD Date</span>
                <Input
                  type="date"
                  required
                  className="h-8 text-xs font-mono"
                  value={expiryDate}
                  onChange={(e) => handleExpiryDateChange(e.target.value)}
                />
              </div>
              <div>
                <span className="text-[10px] text-muted-foreground">BS Miti</span>
                <Input
                  placeholder="2082-02-14"
                  className="h-8 text-xs font-mono"
                  value={expiryMiti}
                  onChange={(e) => setExpiryMiti(e.target.value)}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Claim Period & Purpose */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Claim Period (Days)</Label>
            <Input
              type="number"
              placeholder="30"
              className="h-9 text-xs font-mono"
              value={claimPeriodDays}
              onChange={(e) => setClaimPeriodDays(e.target.value)}
            />
          </div>

          <div className="sm:col-span-2 space-y-1.5">
            <Label className="text-xs">Purpose / Contract Reference</Label>
            <Input
              placeholder="e.g. 5% Performance Security for Contract Package DOR-01"
              className="h-9 text-xs"
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
            />
          </div>
        </div>

        {/* Attachment URL / Scanned Copy */}
        <div className="space-y-1.5">
          <Label className="text-xs">Scanned PDF / Attachment URL</Label>
          <Input
            placeholder="https://... or attachment URL"
            className="h-9 text-xs font-mono"
            value={documentUrl}
            onChange={(e) => setDocumentUrl(e.target.value)}
          />
        </div>

        {/* Notes */}
        <div className="space-y-1.5">
          <Label className="text-xs">Remarks / Notes</Label>
          <Textarea
            rows={2}
            placeholder="Any special terms, collateral pledged, or extension conditions..."
            className="text-xs"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" disabled={createMutation.isPending}>
            {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Register Guarantee
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
