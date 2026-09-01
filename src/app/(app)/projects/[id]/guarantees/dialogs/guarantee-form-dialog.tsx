"use client";

import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc-client";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, ShieldCheck, Landmark, Building2, Calendar, FileText } from "lucide-react";
import { toast } from "sonner";
import { toastError } from "@/lib/toast-error";
import { format } from "date-fns";
import { adToBs } from "@/lib/nepali-calendar";
import { AttachmentDropzone } from "@/components/ui/attachment-dropzone";
import { formatNpr } from "@/lib/construction-finance";

export interface GuaranteeFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId?: string;
  initialData?: any | null;
  onDone: () => void;
}

export function GuaranteeFormDialog({
  open,
  onOpenChange,
  projectId,
  initialData,
  onDone,
}: GuaranteeFormDialogProps) {
  const utils = trpc.useUtils();
  const isEditing = Boolean(initialData);

  const [type, setType] = useState<
    "performance_bond" | "advance_payment" | "car_insurance" | "retention_bond" | "bid_bond" | "other"
  >("performance_bond");
  const [guaranteeNumber, setGuaranteeNumber] = useState("");
  const [issuingBank, setIssuingBank] = useState("");
  const [branch, setBranch] = useState("");
  const [beneficiary, setBeneficiary] = useState("");
  const [amount, setAmount] = useState("");
  const [issuedDate, setIssuedDate] = useState(() => format(new Date(), "yyyy-MM-dd"));
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
  const [selectedProjectId, setSelectedProjectId] = useState<string>(projectId || "none");
  const [documentUrl, setDocumentUrl] = useState("");
  const [documentName, setDocumentName] = useState("");
  const [notes, setNotes] = useState("");

  // Day Book / Financial Posting State
  const [postToDayBook, setPostToDayBook] = useState(false);
  const [bankAccountId, setBankAccountId] = useState<string>("");
  const [voucherDate, setVoucherDate] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [voucherMiti, setVoucherMiti] = useState("");

  const { data: projectList } = trpc.project.list.useQuery();
  const projects = projectList?.projects || [];

  const { data: bankAccountsData } = trpc.finance.orgBankAccounts.useQuery();
  const bankAccounts = bankAccountsData?.accounts || [];

  // Pre-fill on Edit
  useEffect(() => {
    if (initialData) {
      setType(initialData.type || "performance_bond");
      setGuaranteeNumber(initialData.guaranteeNumber || "");
      setIssuingBank(initialData.issuingBank || "");
      setBranch(initialData.branch || "");
      setBeneficiary(initialData.beneficiary || "");
      setAmount(initialData.amount ? String(initialData.amount) : "");
      setMarginAmount(initialData.marginAmount ? String(initialData.marginAmount) : "0");
      setCommissionRate(initialData.commissionRate ? String(initialData.commissionRate) : "0");
      setCommissionPaid(initialData.commissionPaid ? String(initialData.commissionPaid) : "0");
      setPurpose(initialData.purpose || "");
      setSelectedProjectId(initialData.projectId || projectId || "none");
      setDocumentUrl(initialData.documentUrl || "");
      setDocumentName(initialData.documentName || "");
      setNotes(initialData.notes || "");
      setClaimPeriodDays(String(initialData.claimPeriodDays ?? 30));

      if (initialData.issuedDate) {
        const dStr = format(new Date(initialData.issuedDate), "yyyy-MM-dd");
        setIssuedDate(dStr);
        setVoucherDate(dStr);
        try {
          const bs = adToBs(new Date(dStr)).formatted;
          setIssuedMiti(bs);
          setVoucherMiti(bs);
        } catch {}
      }

      if (initialData.expiryDate) {
        const eStr = format(new Date(initialData.expiryDate), "yyyy-MM-dd");
        setExpiryDate(eStr);
        try {
          setExpiryMiti(adToBs(new Date(eStr)).formatted);
        } catch {}
      }
    }
  }, [initialData, projectId]);

  // Set default bank account if available
  useEffect(() => {
    if (bankAccounts.length > 0 && !bankAccountId) {
      const def = bankAccounts.find((a) => a.isDefault) || bankAccounts[0];
      if (def) setBankAccountId(def.id);
    }
  }, [bankAccounts, bankAccountId]);

  const createMutation = trpc.bankGuarantee.create.useMutation({
    onSuccess: () => {
      utils.bankGuarantee.list.invalidate();
      utils.bankGuarantee.portfolioAlerts.invalidate();
      utils.finance.orgMasterDayBook.invalidate();
      utils.finance.orgBankAccounts.invalidate();
      toast.success(
        postToDayBook && Number(commissionPaid) > 0
          ? "Bank Guarantee saved & commission posted to Day Book!"
          : "Bank Guarantee registered successfully!"
      );
      onDone();
    },
    onError: (e) => toastError("Bank guarantee could not be registered. Please try again.", e.message),
  });

  const updateMutation = trpc.bankGuarantee.update.useMutation({
    onSuccess: () => {
      utils.bankGuarantee.list.invalidate();
      utils.bankGuarantee.portfolioAlerts.invalidate();
      utils.finance.orgMasterDayBook.invalidate();
      utils.finance.orgBankAccounts.invalidate();
      toast.success("Bank guarantee record & Day Book updated successfully!");
      onDone();
    },
    onError: (e) => toastError("Bank guarantee could not be updated. Please try again.", e.message),
  });

  const handleIssuedDateChange = (adVal: string) => {
    setIssuedDate(adVal);
    if (!isEditing || !postToDayBook) {
      setVoucherDate(adVal);
    }
    try {
      const bs = adToBs(new Date(adVal)).formatted;
      setIssuedMiti(bs);
      if (!isEditing || !postToDayBook) {
        setVoucherMiti(bs);
      }
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
      toast.error("Please fill all required fields (*)");
      return;
    }

    const payload = {
      projectId: selectedProjectId !== "none" ? selectedProjectId : undefined,
      type,
      guaranteeNumber: guaranteeNumber.trim(),
      issuingBank: issuingBank.trim(),
      branch: branch.trim() || undefined,
      beneficiary: beneficiary.trim(),
      amount: parseFloat(amount),
      issuedDate: new Date(issuedDate).toISOString(),
      issuedMiti: issuedMiti || undefined,
      expiryDate: new Date(expiryDate).toISOString(),
      expiryMiti: expiryMiti || undefined,
      claimPeriodDays: parseInt(claimPeriodDays) || 30,
      marginAmount: parseFloat(marginAmount) || 0,
      commissionRate: parseFloat(commissionRate) || 0,
      commissionPaid: parseFloat(commissionPaid) || 0,
      purpose: purpose.trim() || undefined,
      documentUrl: documentUrl || undefined,
      documentName: documentName || undefined,
      notes: notes.trim() || undefined,
      postToDayBook: postToDayBook && Number(commissionPaid) > 0,
      bankAccountId: postToDayBook && bankAccountId ? bankAccountId : undefined,
      voucherDate: postToDayBook && voucherDate ? new Date(voucherDate).toISOString() : undefined,
      voucherMiti: postToDayBook && voucherMiti ? voucherMiti : undefined,
    };

    if (isEditing && initialData?.id) {
      updateMutation.mutate({
        id: initialData.id,
        ...payload,
      });
    } else {
      createMutation.mutate(payload);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;
  const numCommission = parseFloat(commissionPaid) || 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl lg:max-w-5xl bg-[#0c1015] border border-white/10 text-white p-5 max-h-[90vh] overflow-y-auto backdrop-blur-md shadow-2xl">
        <DialogHeader className="pb-2 border-b border-white/10">
          <DialogTitle className="text-base font-bold flex items-center gap-2 text-white">
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
            {isEditing ? "Edit Bank Guarantee / Insurance Policy" : "Register Bank Guarantee / Bid Bond (बैंक ग्यारेन्टी)"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Left Column: Core Guarantee Details */}
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Instrument Type *</Label>
                  <Select value={type} onValueChange={(v: any) => setType(v)}>
                    <SelectTrigger className="h-9 text-xs bg-[#161d26] border-white/10 text-white">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent className="bg-[#161d26] border-white/10 text-white text-xs">
                      <SelectItem value="performance_bond">Performance Bond (कार्यसम्पादन)</SelectItem>
                      <SelectItem value="advance_payment">Advance Payment Guarantee (APG)</SelectItem>
                      <SelectItem value="bid_bond">Bid Bond / Security (बोलपत्र जमानत)</SelectItem>
                      <SelectItem value="retention_bond">Retention Money Guarantee</SelectItem>
                      <SelectItem value="car_insurance">CAR / Insurance Policy (बीमा)</SelectItem>
                      <SelectItem value="other">Other Guarantee / Bond</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Guarantee / Policy No. *</Label>
                  <Input
                    required
                    placeholder="e.g. BG-NBL-2081-9921"
                    value={guaranteeNumber}
                    onChange={(e) => setGuaranteeNumber(e.target.value)}
                    className="h-9 text-xs bg-[#161d26] border-white/10 text-white font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Issuing Bank / Insurer *</Label>
                  <Input
                    required
                    placeholder="e.g. Nabil Bank Ltd."
                    value={issuingBank}
                    onChange={(e) => setIssuingBank(e.target.value)}
                    className="h-9 text-xs bg-[#161d26] border-white/10 text-white"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Branch Name</Label>
                  <Input
                    placeholder="e.g. Putalisadak Branch"
                    value={branch}
                    onChange={(e) => setBranch(e.target.value)}
                    className="h-9 text-xs bg-[#161d26] border-white/10 text-white"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold">Beneficiary (Employer / Client) *</Label>
                <Input
                  required
                  placeholder="e.g. Department of Roads, Bridge Division"
                  value={beneficiary}
                  onChange={(e) => setBeneficiary(e.target.value)}
                  className="h-9 text-xs bg-[#161d26] border-white/10 text-white"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Face Amount (NPR) *</Label>
                  <Input
                    required
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="h-9 text-xs bg-[#161d26] border-white/10 text-white font-mono font-bold"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Cash Margin Held</Label>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={marginAmount}
                    onChange={(e) => setMarginAmount(e.target.value)}
                    className="h-9 text-xs bg-[#161d26] border-white/10 text-white font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Commission Paid</Label>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={commissionPaid}
                    onChange={(e) => {
                      setCommissionPaid(e.target.value);
                      if (parseFloat(e.target.value) > 0 && !postToDayBook) {
                        setPostToDayBook(true);
                      }
                    }}
                    className="h-9 text-xs bg-[#161d26] border-white/10 text-white font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold">Issue Date (AD) *</Label>
                    {issuedMiti && <span className="text-[10px] text-emerald-400 font-mono">{issuedMiti}</span>}
                  </div>
                  <Input
                    type="date"
                    required
                    value={issuedDate}
                    onChange={(e) => handleIssuedDateChange(e.target.value)}
                    className="h-9 text-xs bg-[#161d26] border-white/10 text-white font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold">Expiry Date (AD) *</Label>
                    {expiryMiti && <span className="text-[10px] text-amber-400 font-mono">{expiryMiti}</span>}
                  </div>
                  <Input
                    required
                    type="date"
                    value={expiryDate}
                    onChange={(e) => handleExpiryDateChange(e.target.value)}
                    className="h-9 text-xs bg-[#161d26] border-white/10 text-white font-mono text-amber-400"
                  />
                </div>
              </div>
            </div>

            {/* Right Column: Project Linking, PDF Attachment Dropzone, Day Book Posting Card */}
            <div className="space-y-3 flex flex-col justify-between">
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Link to Project (Optional)</Label>
                  <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
                    <SelectTrigger className="h-9 text-xs bg-[#161d26] border-white/10 text-white">
                      <SelectValue placeholder="Select Project" />
                    </SelectTrigger>
                    <SelectContent className="bg-[#161d26] border-white/10 text-white text-xs">
                      <SelectItem value="none">None (Pre-Award Tender Bid Bond)</SelectItem>
                      {projects.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.code} - {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Day Book / Cash Book Financial Integration Section */}
                {numCommission > 0 && (
                  <div className="p-3 rounded-xl border border-emerald-500/30 bg-emerald-950/20 space-y-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="postToDayBookCheck"
                        checked={postToDayBook}
                        onChange={(e) => setPostToDayBook(e.target.checked)}
                        className="h-4 w-4 rounded border-white/20 bg-[#161d26] text-emerald-500 focus:ring-emerald-500 cursor-pointer"
                      />
                      <label htmlFor="postToDayBookCheck" className="text-xs font-bold text-emerald-300 cursor-pointer">
                        Record Commission in Day Book / Cash Book (खर्च दाखिला गर्ने)
                      </label>
                    </div>

                    {postToDayBook && (
                      <div className="grid grid-cols-2 gap-2 pt-1 border-t border-emerald-500/20">
                        <div className="space-y-1">
                          <Label className="text-[11px] text-gray-300">Debit Bank Account *</Label>
                          <Select value={bankAccountId} onValueChange={setBankAccountId}>
                            <SelectTrigger className="h-8 text-xs bg-[#161d26] border-white/10 text-white">
                              <SelectValue placeholder="Select Bank Account" />
                            </SelectTrigger>
                            <SelectContent className="bg-[#161d26] border-white/10 text-white text-xs">
                              {bankAccounts.map((a) => (
                                <SelectItem key={a.id} value={a.id}>
                                  {a.bankName} - {a.accountNumber} ({formatNpr(a.currentBalance)})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <Label className="text-[11px] text-gray-300">Voucher Date</Label>
                            {voucherMiti && <span className="text-[9px] text-emerald-400 font-mono">{voucherMiti}</span>}
                          </div>
                          <Input
                            type="date"
                            value={voucherDate}
                            onChange={(e) => {
                              setVoucherDate(e.target.value);
                              try { setVoucherMiti(adToBs(new Date(e.target.value)).formatted); } catch {}
                            }}
                            className="h-8 text-xs bg-[#161d26] border-white/10 text-white font-mono"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Attachment Dropzone */}
                <AttachmentDropzone
                  value={documentUrl}
                  onChange={(url, file) => {
                    setDocumentUrl(url || "");
                    if (file) setDocumentName(file.name);
                  }}
                  label="Guarantee Scanned PDF / Document"
                  accept=".pdf,image/*,application/pdf"
                  maxSizeMb={10}
                />

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

          <DialogFooter className="flex justify-end gap-2 pt-3 border-t border-white/10">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              className="text-xs text-muted-foreground hover:text-white"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isPending}
              className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs px-5"
            >
              {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
              {isEditing ? "Update Guarantee & Ledger" : "Save Guarantee"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
