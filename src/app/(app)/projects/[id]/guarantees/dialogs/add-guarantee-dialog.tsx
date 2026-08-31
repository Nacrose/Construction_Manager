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
import { AttachmentDropzone } from "@/components/ui/attachment-dropzone";

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
  const [documentName, setDocumentName] = useState("");
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
      documentName: documentName.trim() || undefined,
      notes: notes.trim() || undefined,
    });
  };

  return (
    <DialogContent className="max-w-4xl lg:max-w-5xl bg-[#0c1015] border-white/10 text-white backdrop-blur-md p-6">
      <DialogHeader className="pb-2 border-b border-white/10">
        <DialogTitle className="flex items-center gap-2 text-base font-bold text-white">
          <ShieldCheck className="h-5 w-5 text-emerald-400" />
          Register Bank Guarantee / Insurance Policy (जमानत तथा बीमा)
        </DialogTitle>
      </DialogHeader>

      <form onSubmit={handleSubmit} className="space-y-4 pt-2">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Left Column: Core Guarantee Information */}
          <div className="space-y-3">
            {/* Type & BG Number */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Guarantee / Policy Type *</Label>
                <Select value={type} onValueChange={(v: any) => setType(v)}>
                  <SelectTrigger className="h-9 text-xs bg-[#161d26] border-white/10 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#161d26] border-white/10 text-white text-xs">
                    <SelectItem value="performance_bond">Performance Security (कार्यसम्पादन)</SelectItem>
                    <SelectItem value="advance_payment">Mobilization APG (पेश्की जमानत)</SelectItem>
                    <SelectItem value="car_insurance">Contractor&apos;s All Risk (CAR)</SelectItem>
                    <SelectItem value="retention_bond">Retention Guarantee (धरौटी जमानत)</SelectItem>
                    <SelectItem value="bid_bond">Bid Bond / EMD (बोलपत्र जमानत)</SelectItem>
                    <SelectItem value="other">Other Guarantee / Bond</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold">BG / Policy Number *</Label>
                <Input
                  required
                  placeholder="e.g. BG/NABIL/2081/042"
                  className="h-9 text-xs font-mono bg-[#161d26] border-white/10 text-white"
                  value={guaranteeNumber}
                  onChange={(e) => setGuaranteeNumber(e.target.value)}
                />
              </div>
            </div>

            {/* Issuing Bank & Branch */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Issuing Bank / Insurer *</Label>
                <Input
                  required
                  placeholder="e.g. Nabil Bank / Shikhar Insurance"
                  className="h-9 text-xs bg-[#161d26] border-white/10 text-white"
                  value={issuingBank}
                  onChange={(e) => setIssuingBank(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Branch (Optional)</Label>
                <Input
                  placeholder="e.g. Hetauda / New Road"
                  className="h-9 text-xs bg-[#161d26] border-white/10 text-white"
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                />
              </div>
            </div>

            {/* Beneficiary */}
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Beneficiary (Client / Employer) *</Label>
              <Input
                required
                placeholder="e.g. Division Road Office, Hetauda"
                className="h-9 text-xs bg-[#161d26] border-white/10 text-white"
                value={beneficiary}
                onChange={(e) => setBeneficiary(e.target.value)}
              />
            </div>

            {/* Amount & Margins */}
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Guarantee Value (NPR) *</Label>
                <Input
                  required
                  type="number"
                  min="0"
                  step="any"
                  placeholder="0.00"
                  className="h-9 text-xs font-mono font-bold bg-[#161d26] border-white/10 text-white"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold">Margin Amount</Label>
                <Input
                  type="number"
                  min="0"
                  step="any"
                  placeholder="0.00"
                  className="h-9 text-xs font-mono bg-[#161d26] border-white/10 text-white"
                  value={marginAmount}
                  onChange={(e) => setMarginAmount(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold">Commission Paid</Label>
                <Input
                  type="number"
                  min="0"
                  step="any"
                  placeholder="0.00"
                  className="h-9 text-xs font-mono bg-[#161d26] border-white/10 text-white"
                  value={commissionPaid}
                  onChange={(e) => setCommissionPaid(e.target.value)}
                />
              </div>
            </div>

            {/* Dates (BS Miti + AD) */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold">Issued Date (AD)</Label>
                  {issuedMiti && <span className="text-[10px] text-emerald-400 font-mono">{issuedMiti}</span>}
                </div>
                <Input
                  type="date"
                  className="h-9 text-xs font-mono bg-[#161d26] border-white/10 text-white"
                  value={issuedDate}
                  onChange={(e) => handleIssuedDateChange(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold">Expiry Date (AD) *</Label>
                  {expiryMiti && <span className="text-[10px] text-amber-400 font-mono">{expiryMiti}</span>}
                </div>
                <Input
                  type="date"
                  required
                  className="h-9 text-xs font-mono bg-[#161d26] border-white/10 text-white text-amber-400"
                  value={expiryDate}
                  onChange={(e) => handleExpiryDateChange(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Right Column: Purpose, Claim Period, Attachment Dropzone, Remarks */}
          <div className="space-y-3 flex flex-col justify-between">
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Claim Period (Days)</Label>
                  <Input
                    type="number"
                    placeholder="30"
                    className="h-9 text-xs font-mono bg-[#161d26] border-white/10 text-white"
                    value={claimPeriodDays}
                    onChange={(e) => setClaimPeriodDays(e.target.value)}
                  />
                </div>

                <div className="col-span-2 space-y-1">
                  <Label className="text-xs font-semibold">Purpose / Contract Ref</Label>
                  <Input
                    placeholder="e.g. 5% Performance Security"
                    className="h-9 text-xs bg-[#161d26] border-white/10 text-white"
                    value={purpose}
                    onChange={(e) => setPurpose(e.target.value)}
                  />
                </div>
              </div>

              {/* Attachment Upload / Dropzone */}
              <AttachmentDropzone
                value={documentUrl}
                onChange={(url, file) => {
                  setDocumentUrl(url || "");
                  if (file) setDocumentName(file.name);
                }}
                label="Guarantee Scanned PDF / Document (फाइल / कागजात छान्नुहोस्)"
                accept=".pdf,image/*,application/pdf"
                maxSizeMb={10}
              />

              {/* Notes */}
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Remarks / Notes</Label>
                <Textarea
                  rows={2}
                  placeholder="Any special terms, collateral pledged, or extension conditions..."
                  className="text-xs bg-[#161d26] border-white/10 text-white resize-none"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 pt-3 border-t border-white/10">
          <Button type="button" variant="ghost" onClick={onDone} className="text-xs text-muted-foreground hover:text-white">
            Cancel
          </Button>
          <Button type="submit" disabled={createMutation.isPending} className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs px-5">
            {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Register Guarantee
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
