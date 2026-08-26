"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Handshake,
  Percent,
  ReceiptText,
  Building2,
  Plus,
  ArrowDownRight,
  ArrowUpRight,
  CreditCard,
  FileCheck2,
  Loader2,
  Trash2,
} from "lucide-react";
import { format } from "date-fns";
import { adToBs, bsToAd } from "@/lib/nepali-calendar";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

function fmt(n: number) {
  return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtShort(n: number) {
  if (Math.abs(n) >= 10000000) return `Rs. ${(n / 10000000).toFixed(2)} Cr`;
  if (Math.abs(n) >= 100000) return `Rs. ${(n / 100000).toFixed(2)} L`;
  return `Rs. ${fmt(n)}`;
}

export function ProjectJvTab({ projectId }: { projectId: string }) {
  const utils = trpc.useUtils();
  const [agreementOpen, setAgreementOpen] = useState(false);
  const [payoutOpen, setPayoutOpen] = useState(false);
  const [selectedIpcId, setSelectedIpcId] = useState<string | null>(null);

  // Agreement Form State
  const [partnerName, setPartnerName] = useState("");
  const [partnerPan, setPartnerPan] = useState("");
  const [commissionRate, setCommissionRate] = useState("1.5");
  const [contactPerson, setContactPerson] = useState("");
  const [phone, setPhone] = useState("");
  const [bankName, setBankName] = useState("");
  const [bankAccountNumber, setBankAccountNumber] = useState("");
  const [branch, setBranch] = useState("");
  const [notes, setNotes] = useState("");

  // Payout Form State
  const [payoutGross, setPayoutGross] = useState("");
  const [tdsPercent, setTdsPercent] = useState("1.5");
  const [paymentMode, setPaymentMode] = useState<"bank_transfer" | "cheque" | "connectips" | "cash">("bank_transfer");
  const [chequeNo, setChequeNo] = useState("");
  const [selectedBankId, setSelectedBankId] = useState<string>("none");
  const [payoutDate, setPayoutDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [payoutMiti, setPayoutMiti] = useState(() => {
    try { return adToBs(new Date()).formatted; } catch { return ""; }
  });
  const [payoutRemarks, setPayoutRemarks] = useState("");

  const { data, isLoading } = trpc.jvPartner.getAgreement.useQuery({ projectId });
  const { data: bankData } = trpc.finance.orgBankAccounts.useQuery();
  const bankAccounts = bankData?.accounts || [];

  const agreement = data?.agreement;
  const summary = data?.summary || {
    totalCertifiedTurnover: 0,
    commissionRate: 1.5,
    totalCommissionAccrued: 0,
    totalCommissionPaid: 0,
    totalTdsDeducted: 0,
    totalNetDisbursed: 0,
    balanceDue: 0,
    ipcCount: 0,
  };
  const ipcBreakdown = data?.ipcBreakdown || [];
  const payouts = data?.payouts || [];

  // Open agreement dialog with prefilled data
  const handleOpenAgreement = () => {
    if (agreement) {
      setPartnerName(agreement.partnerName);
      setPartnerPan(agreement.partnerPan || "");
      setCommissionRate(agreement.commissionRate.toString());
      setContactPerson(agreement.contactPerson || "");
      setPhone(agreement.phone || "");
      setBankName(agreement.bankName || "");
      setBankAccountNumber(agreement.bankAccountNumber || "");
      setBranch(agreement.branch || "");
      setNotes(agreement.notes || "");
    }
    setAgreementOpen(true);
  };

  const saveAgreementMut = trpc.jvPartner.saveAgreement.useMutation({
    onSuccess: () => {
      toast.success("JV Partner agreement saved successfully");
      utils.jvPartner.getAgreement.invalidate({ projectId });
      setAgreementOpen(false);
    },
    onError: (err) => toast.error(err.message),
  });

  const recordPayoutMut = trpc.jvPartner.recordPayout.useMutation({
    onSuccess: () => {
      toast.success("Commission payout recorded with 1.5% TDS");
      utils.jvPartner.getAgreement.invalidate({ projectId });
      utils.accounting.dayBook.invalidate();
      utils.finance.orgBankAccounts.invalidate();
      setPayoutOpen(false);
      setPayoutGross("");
      setChequeNo("");
      setPayoutRemarks("");
    },
    onError: (err) => toast.error(err.message),
  });

  const deletePayoutMut = trpc.jvPartner.deletePayout.useMutation({
    onSuccess: () => {
      toast.success("Payout record deleted and bank balance restored");
      utils.jvPartner.getAgreement.invalidate({ projectId });
      utils.accounting.dayBook.invalidate();
      utils.finance.orgBankAccounts.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const handleAgreementSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!partnerName) {
      toast.error("Partner name is required");
      return;
    }
    saveAgreementMut.mutate({
      projectId,
      partnerName,
      partnerPan: partnerPan || undefined,
      commissionRate: parseFloat(commissionRate) || 1.5,
      contactPerson: contactPerson || undefined,
      phone: phone || undefined,
      bankName: bankName || undefined,
      bankAccountNumber: bankAccountNumber || undefined,
      branch: branch || undefined,
      notes: notes || undefined,
    });
  };

  const handlePayoutSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!payoutGross || parseFloat(payoutGross) <= 0) {
      toast.error("Valid payout gross amount is required");
      return;
    }
    recordPayoutMut.mutate({
      projectId,
      ipcId: selectedIpcId,
      grossAmount: parseFloat(payoutGross),
      tdsPercent: parseFloat(tdsPercent) || 1.5,
      paymentMode,
      chequeNo: chequeNo || undefined,
      bankAccountId: selectedBankId !== "none" ? selectedBankId : undefined,
      payoutDate,
      payoutMiti,
      remarks: payoutRemarks || undefined,
    });
  };

  const openPayoutForIpc = (ipcId: string, accruedCommission: number) => {
    setSelectedIpcId(ipcId);
    setPayoutGross(accruedCommission.toString());
    setPayoutRemarks(`Commission payment for IPC Running Bill`);
    setPayoutOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Header Banner & Agreement Status */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#121820]/80 p-5 rounded-2xl border border-white/10 shadow-sm">
        <div className="flex items-center gap-3.5">
          <div className="h-11 w-11 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <Handshake className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-white">
                {agreement ? agreement.partnerName : "No JV Partner Configured"}
              </h3>
              {agreement ? (
                <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[10px]">
                  {agreement.commissionRate}% Commission Model
                </Badge>
              ) : (
                <Badge variant="outline" className="text-gray-400 text-[10px]">
                  Sole Contractor Mode
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {agreement
                ? `Lead Managing Partner executes 100% of site operations; partner receives fixed ${agreement.commissionRate}% fee on certified billing.`
                : "Configure your Joint Venture partner to track automated commission accruals on client IPC bills."}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            onClick={handleOpenAgreement}
            variant="outline"
            className="text-xs font-bold border-white/20 text-white hover:bg-white/10"
          >
            {agreement ? "Edit Agreement" : "+ Setup JV Partner"}
          </Button>

          {agreement && summary.balanceDue > 0 && (
            <Button
              onClick={() => {
                setSelectedIpcId(null);
                setPayoutGross(summary.balanceDue.toString());
                setPayoutOpen(true);
              }}
              className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs gap-1.5 shadow-[0_0_12px_rgba(0,255,102,0.2)]"
            >
              <Plus className="h-4 w-4" /> Disburse Commission
            </Button>
          )}
        </div>
      </div>

      {agreement && (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
            <div className="bg-[#121820]/80 p-4 rounded-2xl border border-white/10">
              <span className="text-[10px] uppercase font-mono text-muted-foreground tracking-wider">Certified Turnover (कुल बिलिङ)</span>
              <div className="text-xl font-bold font-mono text-white mt-1">
                {fmtShort(summary.totalCertifiedTurnover)}
              </div>
              <span className="text-[11px] text-muted-foreground">{summary.ipcCount} Certified IPCs</span>
            </div>

            <div className="bg-[#121820]/80 p-4 rounded-2xl border border-white/10">
              <span className="text-[10px] uppercase font-mono text-muted-foreground tracking-wider">Accrued Commission ({summary.commissionRate}%)</span>
              <div className="text-xl font-bold font-mono text-amber-400 mt-1">
                Rs. {fmt(summary.totalCommissionAccrued)}
              </div>
              <span className="text-[11px] text-muted-foreground">Total partner entitlement</span>
            </div>

            <div className="bg-[#121820]/80 p-4 rounded-2xl border border-white/10">
              <span className="text-[10px] uppercase font-mono text-muted-foreground tracking-wider">Total Disbursed (TDS 1.5%)</span>
              <div className="text-xl font-bold font-mono text-blue-400 mt-1">
                Rs. {fmt(summary.totalNetDisbursed)}
              </div>
              <span className="text-[11px] text-muted-foreground">TDS: Rs. {fmt(summary.totalTdsDeducted)}</span>
            </div>

            <div className="bg-[#121820]/80 p-4 rounded-2xl border border-white/10">
              <span className="text-[10px] uppercase font-mono text-muted-foreground tracking-wider">Balance Due (बाँकी कमिसन)</span>
              <div className={cn("text-xl font-bold font-mono mt-1", summary.balanceDue > 0 ? "text-emerald-400" : "text-gray-400")}>
                Rs. {fmt(summary.balanceDue)}
              </div>
              <span className="text-[11px] text-muted-foreground">Outstanding payable</span>
            </div>
          </div>

          {/* IPC Commission Accrual Breakdown */}
          <div className="space-y-3">
            <h4 className="text-sm font-bold text-white flex items-center gap-2">
              <ReceiptText className="h-4 w-4 text-emerald-400" /> Client IPC Certified Billing &amp; Commission Accruals
            </h4>

            {ipcBreakdown.length === 0 ? (
              <div className="p-8 text-center bg-[#121820]/30 rounded-2xl border border-dashed border-white/10 text-xs text-muted-foreground">
                No certified IPC Running Bills recorded yet. As client IPC bills are certified, partner commission accrues automatically.
              </div>
            ) : (
              <div className="rounded-2xl border border-white/10 bg-[#121820]/80 overflow-hidden">
                <table className="w-full text-xs text-left">
                  <thead className="bg-[#161d26] text-muted-foreground uppercase font-mono text-[10px] tracking-wider border-b border-white/10">
                    <tr>
                      <th className="p-3.5">IPC Running Bill</th>
                      <th className="p-3.5">Bill Period</th>
                      <th className="p-3.5 text-right">Certified Gross</th>
                      <th className="p-3.5 text-right">Accrued Commission ({summary.commissionRate}%)</th>
                      <th className="p-3.5 text-center">Status</th>
                      <th className="p-3.5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 font-mono">
                    {ipcBreakdown.map((row) => (
                      <tr key={row.ipcId} className="hover:bg-white/[0.02] transition-colors">
                        <td className="p-3.5 font-bold text-white font-sans">
                          Bill No. {row.number}
                        </td>
                        <td className="p-3.5 text-muted-foreground font-sans">
                          {row.period || "—"}
                        </td>
                        <td className="p-3.5 text-right text-white">
                          Rs. {fmt(row.grossAmount)}
                        </td>
                        <td className="p-3.5 text-right font-bold text-amber-400">
                          Rs. {fmt(row.accruedCommission)}
                        </td>
                        <td className="p-3.5 text-center font-sans">
                          {row.isPaid ? (
                            <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-[9px]">
                              Settled
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-amber-400 border-amber-500/30 text-[9px]">
                              Accrued
                            </Badge>
                          )}
                        </td>
                        <td className="p-3.5 text-right font-sans">
                          {!row.isPaid && (
                            <Button
                              onClick={() => openPayoutForIpc(row.ipcId, row.accruedCommission)}
                              size="sm"
                              className="h-7 px-2.5 text-[10px] font-bold bg-primary/20 text-primary hover:bg-primary/30 border border-primary/30"
                            >
                              Pay Commission
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Commission Payout Disbursements Ledger */}
          <div className="space-y-3 pt-2">
            <h4 className="text-sm font-bold text-white flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-blue-400" /> Commission Payouts &amp; TDS Deductions Ledger
            </h4>

            {payouts.length === 0 ? (
              <div className="p-6 text-center bg-[#121820]/30 rounded-2xl border border-dashed border-white/10 text-xs text-muted-foreground">
                No commission disbursement vouchers recorded yet.
              </div>
            ) : (
              <div className="rounded-2xl border border-white/10 bg-[#121820]/80 overflow-hidden">
                <table className="w-full text-xs text-left">
                  <thead className="bg-[#161d26] text-muted-foreground uppercase font-mono text-[10px] tracking-wider border-b border-white/10">
                    <tr>
                      <th className="p-3.5">Voucher No</th>
                      <th className="p-3.5">Date (Miti)</th>
                      <th className="p-3.5">Payment Mode / Ref</th>
                      <th className="p-3.5 text-right">Gross Commission</th>
                      <th className="p-3.5 text-right">TDS (1.5%)</th>
                      <th className="p-3.5 text-right">Net Paid</th>
                      <th className="p-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 font-mono">
                    {payouts.map((p) => (
                      <tr key={p.id} className="hover:bg-white/[0.02] transition-colors">
                        <td className="p-3.5 font-bold text-emerald-400">
                          {p.voucherNo}
                        </td>
                        <td className="p-3.5 text-white/90">
                          {p.payoutMiti || format(new Date(p.payoutDate), "yyyy-MM-dd")}
                        </td>
                        <td className="p-3.5 text-muted-foreground capitalize font-sans">
                          {p.paymentMode.replace("_", " ")} {p.chequeNo && `(Chq: ${p.chequeNo})`}
                        </td>
                        <td className="p-3.5 text-right text-white">
                          Rs. {fmt(p.grossAmount)}
                        </td>
                        <td className="p-3.5 text-right text-rose-400">
                          Rs. {fmt(p.tdsAmount)}
                        </td>
                        <td className="p-3.5 text-right font-bold text-blue-400">
                          Rs. {fmt(p.netAmount)}
                        </td>
                        <td className="p-3.5 text-right font-sans">
                          <Button
                            onClick={() => {
                              if (confirm("Delete this commission payout voucher?")) {
                                deletePayoutMut.mutate({ projectId, payoutId: p.id });
                              }
                            }}
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-muted-foreground hover:text-rose-400"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* 16:10 Setup JV Agreement Dialog */}
      <Dialog open={agreementOpen} onOpenChange={setAgreementOpen}>
        <DialogContent className="sm:max-w-[560px] bg-[#0c1015] border-white/10 text-white backdrop-blur-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold text-white">
              <Handshake className="h-5 w-5 text-emerald-400" /> Joint Venture Partner Agreement
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Define the non-operating JV partner and agreed commission percentage on certified billing.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleAgreementSubmit} className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">JV Partner Company Name *</Label>
                <Input
                  required
                  placeholder="e.g. Sharma Construction Pvt. Ltd."
                  value={partnerName}
                  onChange={(e) => setPartnerName(e.target.value)}
                  className="h-9 text-xs bg-[#161d26] border-white/10 text-white"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold">Partner PAN Number</Label>
                <Input
                  placeholder="e.g. 601234567"
                  value={partnerPan}
                  onChange={(e) => setPartnerPan(e.target.value)}
                  className="h-9 text-xs font-mono bg-[#161d26] border-white/10 text-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 bg-[#121820] p-3 rounded-xl border border-white/5">
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-emerald-400">Partner Commission Rate (%) *</Label>
                <Input
                  required
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={commissionRate}
                  onChange={(e) => setCommissionRate(e.target.value)}
                  className="h-9 text-xs font-mono font-bold bg-[#161d26] border-white/10 text-white"
                />
                <p className="text-[10px] text-muted-foreground">Typical Nepal standard: 1.0% – 2.5%</p>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold">Lead Managing Partner Share (%)</Label>
                <Input
                  disabled
                  value="100% Operational"
                  className="h-9 text-xs bg-[#161d26]/50 border-white/5 text-gray-400"
                />
                <p className="text-[10px] text-muted-foreground">Lead executes 100% of site work</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Contact Person</Label>
                <Input
                  placeholder="e.g. Er. Ramesh Sharma"
                  value={contactPerson}
                  onChange={(e) => setContactPerson(e.target.value)}
                  className="h-9 text-xs bg-[#161d26] border-white/10 text-white"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Phone Number</Label>
                <Input
                  placeholder="e.g. 9851012345"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="h-9 text-xs font-mono bg-[#161d26] border-white/10 text-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Partner Bank Name</Label>
                <Input
                  placeholder="e.g. Global IME Bank"
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  className="h-9 text-xs bg-[#161d26] border-white/10 text-white"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Bank Account Number</Label>
                <Input
                  placeholder="e.g. 01201017500123"
                  value={bankAccountNumber}
                  onChange={(e) => setBankAccountNumber(e.target.value)}
                  className="h-9 text-xs font-mono bg-[#161d26] border-white/10 text-white"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-4 border-t border-white/10">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setAgreementOpen(false)}
                className="text-xs text-muted-foreground"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={saveAgreementMut.isPending}
                className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs px-5"
              >
                {saveAgreementMut.isPending ? "Saving..." : "Save Agreement"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* 16:10 Disburse Commission Payout Dialog */}
      <Dialog open={payoutOpen} onOpenChange={setPayoutOpen}>
        <DialogContent className="sm:max-w-[540px] bg-[#0c1015] border-white/10 text-white backdrop-blur-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold text-white">
              <CreditCard className="h-5 w-5 text-emerald-400" /> Disburse JV Partner Commission
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Record commission settlement with statutory 1.5% TDS deduction.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handlePayoutSubmit} className="space-y-4 pt-2">
            <div className="grid grid-cols-3 gap-3 bg-[#121820] p-3 rounded-xl border border-white/5">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Gross Comm. (Rs.) *</Label>
                <Input
                  required
                  type="number"
                  step="any"
                  value={payoutGross}
                  onChange={(e) => setPayoutGross(e.target.value)}
                  className="h-9 text-xs font-mono font-bold bg-[#161d26] border-white/10 text-white"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold">TDS (%)</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={tdsPercent}
                  onChange={(e) => setTdsPercent(e.target.value)}
                  className="h-9 text-xs font-mono bg-[#161d26] border-white/10 text-white"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold text-blue-400">Net Payable (Rs.)</Label>
                <div className="h-9 px-3 flex items-center bg-[#161d26] rounded-md font-mono font-bold text-blue-400 text-xs border border-white/10">
                  Rs. {fmt(parseFloat(payoutGross || "0") * (1 - (parseFloat(tdsPercent || "1.5") / 100)))}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Payment Mode</Label>
                <Select value={paymentMode} onValueChange={(v: any) => setPaymentMode(v)}>
                  <SelectTrigger className="h-9 text-xs bg-[#161d26] border-white/10 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0f141c] border-white/10 text-white text-xs">
                    <SelectItem value="bank_transfer">Bank Transfer (A/C Payee)</SelectItem>
                    <SelectItem value="cheque">Cheque Payment</SelectItem>
                    <SelectItem value="connectips">ConnectIPS / Digital</SelectItem>
                    <SelectItem value="cash">Cash Settlement</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold">Deduct From Company Account</Label>
                <Select value={selectedBankId} onValueChange={setSelectedBankId}>
                  <SelectTrigger className="h-9 text-xs bg-[#161d26] border-white/10 text-white">
                    <SelectValue placeholder="Select Bank" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0f141c] border-white/10 text-white text-xs">
                    <SelectItem value="none">Do Not Deduct (Manual)</SelectItem>
                    {bankAccounts.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.bankName} ({b.accountNumber})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Cheque / Transaction Ref No</Label>
                <Input
                  placeholder="e.g. CHQ-990142"
                  value={chequeNo}
                  onChange={(e) => setChequeNo(e.target.value)}
                  className="h-9 text-xs font-mono bg-[#161d26] border-white/10 text-white"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold">Disbursement Miti (Date)</Label>
                <Input
                  value={payoutMiti}
                  onChange={(e) => {
                    setPayoutMiti(e.target.value);
                    try {
                      const parts = e.target.value.split("-").map(Number);
                      if (parts.length === 3 && parts[0] && parts[1] && parts[2]) {
                        const ad = bsToAd(parts[0], parts[1], parts[2]);
                        if (ad) setPayoutDate(format(ad, "yyyy-MM-dd"));
                      }
                    } catch {}
                  }}
                  className="h-9 text-xs font-mono bg-[#161d26] border-white/10 text-white"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Remarks / Note</Label>
              <Input
                placeholder="e.g. Commission settlement for IPC Bill No 02"
                value={payoutRemarks}
                onChange={(e) => setPayoutRemarks(e.target.value)}
                className="h-9 text-xs bg-[#161d26] border-white/10 text-white"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-4 border-t border-white/10">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setPayoutOpen(false)}
                className="text-xs text-muted-foreground"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={recordPayoutMut.isPending}
                className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs px-5"
              >
                {recordPayoutMut.isPending ? "Disbursing..." : "Confirm & Disburse"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
