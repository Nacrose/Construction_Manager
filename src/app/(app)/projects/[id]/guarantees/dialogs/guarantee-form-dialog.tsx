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
      <DialogContent className="sm:max-w-[900px] w-full p-0 gap-0 bg-card border border-[var(--border)] text-foreground rounded-2xl shadow-2xl overflow-hidden font-sans">
        <div className="px-6 py-4 border-b border-[var(--input)] bg-[#f8fbfe] flex items-center justify-between">
          <DialogTitle className="text-base font-bold flex items-center gap-2 text-foreground">
            <ShieldCheck className="h-5 w-5 text-[var(--primary)]" />
            {isEditing ? "Edit Bank Guarantee / Insurance Policy" : "Register Bank Guarantee / Bid Bond (बैंक ग्यारेन्टी)"}
          </DialogTitle>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs bg-card">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Left Column: Core Guarantee Details */}
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-[11px] font-semibold text-foreground/80">Instrument Type *</Label>
                  <Select value={type} onValueChange={(v: any) => setType(v)}>
                    <SelectTrigger className="h-9 text-xs bg-card border-[var(--border)] text-foreground focus:border-[var(--primary)]">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-[var(--border)] text-foreground text-xs shadow-xl rounded-xl">
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
                  <Label className="text-[11px] font-semibold text-foreground/80">Guarantee / Policy No. *</Label>
                  <Input
                    required
                    placeholder="e.g. BG-NBL-2081-9921"
                    value={guaranteeNumber}
                    onChange={(e) => setGuaranteeNumber(e.target.value)}
                    className="h-9 text-xs bg-card border-[var(--border)] text-foreground font-mono focus:border-[var(--primary)]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-[11px] font-semibold text-foreground/80">Issuing Bank / Insurer *</Label>
                  <Input
                    required
                    placeholder="e.g. Nabil Bank Ltd."
                    value={issuingBank}
                    onChange={(e) => setIssuingBank(e.target.value)}
                    className="h-9 text-xs bg-card border-[var(--border)] text-foreground focus:border-[var(--primary)]"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-[11px] font-semibold text-foreground/80">Branch Name</Label>
                  <Input
                    placeholder="e.g. Putalisadak Branch"
                    value={branch}
                    onChange={(e) => setBranch(e.target.value)}
                    className="h-9 text-xs bg-card border-[var(--border)] text-foreground focus:border-[var(--primary)]"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-[11px] font-semibold text-foreground/80">Beneficiary (Employer / Client) *</Label>
                <Input
                  required
                  placeholder="e.g. Department of Roads, Bridge Division"
                  value={beneficiary}
                  onChange={(e) => setBeneficiary(e.target.value)}
                  className="h-9 text-xs bg-card border-[var(--border)] text-foreground focus:border-[var(--primary)]"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-[11px] font-semibold text-foreground/80">Face Amount (NPR) *</Label>
                  <Input
                    required
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="h-9 text-xs bg-card border-[var(--border)] text-foreground font-mono font-bold focus:border-[var(--primary)]"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-[11px] font-semibold text-foreground/80">Cash Margin Held</Label>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={marginAmount}
                    onChange={(e) => setMarginAmount(e.target.value)}
                    className="h-9 text-xs bg-card border-[var(--border)] text-foreground font-mono focus:border-[var(--primary)]"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-[11px] font-semibold text-foreground/80">Commission Paid</Label>
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
                    className="h-9 text-xs bg-card border-[var(--border)] text-foreground font-mono focus:border-[var(--primary)]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label className="text-[11px] font-semibold text-foreground/80">Issue Date (AD) *</Label>
                    {issuedMiti && <span className="text-[10px] text-[var(--primary)] font-mono font-bold">{issuedMiti}</span>}
                  </div>
                  <Input
                    type="date"
                    required
                    value={issuedDate}
                    onChange={(e) => handleIssuedDateChange(e.target.value)}
                    className="h-9 text-xs bg-card border-[var(--border)] text-foreground font-mono focus:border-[var(--primary)]"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label className="text-[11px] font-semibold text-foreground/80">Expiry Date (AD) *</Label>
                    {expiryMiti && <span className="text-[10px] text-amber-700 font-mono font-bold">{expiryMiti}</span>}
                  </div>
                  <Input
                    required
                    type="date"
                    value={expiryDate}
                    onChange={(e) => handleExpiryDateChange(e.target.value)}
                    className="h-9 text-xs bg-card border-[var(--border)] text-foreground font-mono focus:border-[var(--primary)]"
                  />
                </div>
              </div>
            </div>

            {/* Right Column: Project Linking, PDF Attachment Dropzone, Day Book Posting Card */}
            <div className="space-y-3 flex flex-col justify-between">
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label className="text-[11px] font-semibold text-foreground/80">Link to Project (Optional)</Label>
                  <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
                    <SelectTrigger className="h-9 text-xs bg-card border-[var(--border)] text-foreground focus:border-[var(--primary)]">
                      <SelectValue placeholder="Select Project" />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-[var(--border)] text-foreground text-xs shadow-xl rounded-xl">
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
                  <div className="p-3 rounded-xl border border-info/30 bg-info/10 space-y-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="postToDayBookCheck"
                        checked={postToDayBook}
                        onChange={(e) => setPostToDayBook(e.target.checked)}
                        className="h-4 w-4 rounded border-[var(--border)] bg-card accent-amber-500 cursor-pointer"
                      />
                      <label htmlFor="postToDayBookCheck" className="text-xs font-bold text-[var(--primary)] cursor-pointer">
                        Record Commission in Day Book / Cash Book (खर्च दाखिला गर्ने)
                      </label>
                    </div>

                    {postToDayBook && (
                      <div className="grid grid-cols-2 gap-2 pt-1 border-t border-info/30">
                        <div className="space-y-1">
                          <Label className="text-[11px] text-foreground/80">Debit Bank Account *</Label>
                          <Select value={bankAccountId} onValueChange={setBankAccountId}>
                            <SelectTrigger className="h-8 text-xs bg-card border-[var(--border)] text-foreground focus:border-[var(--primary)]">
                              <SelectValue placeholder="Select Bank Account" />
                            </SelectTrigger>
                            <SelectContent className="bg-card border-[var(--border)] text-foreground text-xs shadow-xl rounded-xl">
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
                            <Label className="text-[11px] text-foreground/80">Voucher Date</Label>
                            {voucherMiti && <span className="text-[9px] text-[var(--primary)] font-mono font-bold">{voucherMiti}</span>}
                          </div>
                          <Input
                            type="date"
                            value={voucherDate}
                            onChange={(e) => {
                              setVoucherDate(e.target.value);
                              try { setVoucherMiti(adToBs(new Date(e.target.value)).formatted); } catch {}
                            }}
                            className="h-8 text-xs bg-card border-[var(--border)] text-foreground font-mono focus:border-[var(--primary)]"
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
                  <Label className="text-[11px] font-semibold text-foreground/80">Remarks / Notes</Label>
                  <Textarea
                    rows={2}
                    placeholder="Any special terms, collateral pledged, or extension conditions..."
                    className="text-xs bg-card border-[var(--border)] text-foreground resize-none focus:border-[var(--primary)]"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2.5 pt-3 border-t border-[var(--input)]">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="h-8 text-xs border-[var(--border)] text-muted-foreground hover:bg-muted"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={isPending}
              className="amber-cta-btn h-8 text-xs font-bold text-white shadow-sm"
            >
              {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
              {isEditing ? "Update Guarantee (अद्यावधिक)" : "Save Guarantee (सुरक्षित)"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
