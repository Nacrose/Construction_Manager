"use client";

import { useState, useMemo } from "react";
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
  ReceiptText,
  Plus,
  CreditCard,
  Trash2,
  Loader2,
} from "lucide-react";
import { format } from "date-fns";
import { adToBs } from "@/lib/nepali-calendar";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatNpr } from "@/lib/construction-finance";
import { ConstructionTable, type ConstructionTableColumn } from "@/components/ui/construction-table";
import { StatusBadge } from "@/components/ui/status-badge";

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

  const ipcColumns: ConstructionTableColumn<any>[] = useMemo(
    () => [
      {
        key: "number",
        header: "IPC Running Bill",
        className: "font-bold text-white font-sans",
        render: (val) => `Bill No. ${val}`,
      },
      {
        key: "period",
        header: "Bill Period",
        className: "text-muted-foreground font-sans",
        render: (val) => val || "—",
      },
      {
        key: "grossAmount",
        header: "Certified Gross",
        align: "right",
        summary: "sum",
        className: "text-white",
        render: (val) => formatNpr(val),
      },
      {
        key: "accruedCommission",
        header: `Accrued Commission (${summary.commissionRate}%)`,
        align: "right",
        summary: "sum",
        className: "font-bold text-amber-400",
        render: (val) => formatNpr(val),
      },
      {
        key: "isPaid",
        header: "Status",
        align: "center",
        render: (val) => <StatusBadge status={val ? "approved" : "pending"} label={val ? "Settled" : "Accrued"} size="xs" />,
      },
      {
        key: "ipcId",
        header: "Action",
        align: "right",
        render: (ipcIdVal, row) =>
          !row.isPaid ? (
            <Button
              onClick={() => openPayoutForIpc(ipcIdVal, row.accruedCommission)}
              size="sm"
              className="h-7 px-2.5 text-[10px] font-bold bg-primary/20 text-primary hover:bg-primary/30 border border-primary/30"
            >
              Pay Commission
            </Button>
          ) : null,
      },
    ],
    [summary.commissionRate]
  );

  const payoutColumns: ConstructionTableColumn<any>[] = useMemo(
    () => [
      {
        key: "voucherNo",
        header: "Voucher No",
        className: "font-bold text-emerald-400",
      },
      {
        key: "payoutDate",
        header: "Date (Miti)",
        render: (val, row) => row.payoutMiti || format(new Date(val), "yyyy-MM-dd"),
      },
      {
        key: "paymentMode",
        header: "Payment Mode / Ref",
        render: (val, row) => (
          <span className="capitalize text-muted-foreground font-sans">
            {val.replace("_", " ")} {row.chequeNo && `(Chq: ${row.chequeNo})`}
          </span>
        ),
      },
      {
        key: "grossAmount",
        header: "Gross Commission",
        align: "right",
        summary: "sum",
        className: "text-white font-mono",
        render: (val) => formatNpr(val),
      },
      {
        key: "tdsAmount",
        header: "TDS (1.5%)",
        align: "right",
        summary: "sum",
        className: "text-rose-400 font-mono",
        render: (val) => formatNpr(val),
      },
      {
        key: "netAmount",
        header: "Net Paid",
        align: "right",
        summary: "sum",
        className: "font-bold text-blue-400 font-mono",
        render: (val) => formatNpr(val),
      },
      {
        key: "id",
        header: "Actions",
        align: "right",
        render: (idVal) => (
          <Button
            onClick={() => {
              if (confirm("Delete this commission payout voucher?")) {
                deletePayoutMut.mutate({ projectId, payoutId: idVal });
              }
            }}
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-rose-400"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        ),
      },
    ],
    [deletePayoutMut, projectId]
  );

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
                {formatNpr(summary.totalCertifiedTurnover, { compact: true, prefix: "Rs." })}
              </div>
              <span className="text-[11px] text-muted-foreground">{summary.ipcCount} Certified IPCs</span>
            </div>

            <div className="bg-[#121820]/80 p-4 rounded-2xl border border-white/10">
              <span className="text-[10px] uppercase font-mono text-muted-foreground tracking-wider">Accrued Commission ({summary.commissionRate}%)</span>
              <div className="text-xl font-bold font-mono text-amber-400 mt-1">
                Rs. {formatNpr(summary.totalCommissionAccrued)}
              </div>
              <span className="text-[11px] text-muted-foreground">Total partner entitlement</span>
            </div>

            <div className="bg-[#121820]/80 p-4 rounded-2xl border border-white/10">
              <span className="text-[10px] uppercase font-mono text-muted-foreground tracking-wider">Total Disbursed (TDS 1.5%)</span>
              <div className="text-xl font-bold font-mono text-blue-400 mt-1">
                Rs. {formatNpr(summary.totalNetDisbursed)}
              </div>
              <span className="text-[11px] text-muted-foreground">TDS: Rs. {formatNpr(summary.totalTdsDeducted)}</span>
            </div>

            <div className="bg-[#121820]/80 p-4 rounded-2xl border border-white/10">
              <span className="text-[10px] uppercase font-mono text-muted-foreground tracking-wider">Balance Due (बाँकी कमिसन)</span>
              <div className={cn("text-xl font-bold font-mono mt-1", summary.balanceDue > 0 ? "text-emerald-400" : "text-gray-400")}>
                Rs. {formatNpr(summary.balanceDue)}
              </div>
              <span className="text-[11px] text-muted-foreground">Outstanding payable</span>
            </div>
          </div>

          {/* IPC Commission Accrual Breakdown Table */}
          <ConstructionTable
            title="Client IPC Certified Billing & Commission Accruals"
            data={ipcBreakdown}
            columns={ipcColumns}
            searchPlaceholder="Search IPC bill number, period..."
            emptyState={{
              icon: ReceiptText,
              title: "No Certified IPC Running Bills",
              description: "As client IPC bills are certified, partner commission accrues automatically.",
            }}
          />

          {/* Commission Payout Disbursements Ledger */}
          <ConstructionTable
            title="Commission Payouts & TDS Deductions Ledger"
            data={payouts}
            columns={payoutColumns}
            searchPlaceholder="Search voucher number, mode..."
            emptyState={{
              icon: CreditCard,
              title: "No Commission Payouts Recorded",
              description: "Commission disbursement vouchers will appear here.",
            }}
          />
        </>
      )}

      {/* 16:10 Setup JV Agreement Dialog */}
      <Dialog open={agreementOpen} onOpenChange={setAgreementOpen}>
        <DialogContent className="sm:max-w-[640px] w-full p-0 gap-0 bg-white border border-[#c7d8e8] text-slate-900 rounded-2xl shadow-2xl overflow-hidden font-sans">
          <div className="px-6 py-4 border-b border-[#e2edf7] bg-[#f8fbfe] flex items-center justify-between">
            <div>
              <DialogTitle className="flex items-center gap-2 text-base font-bold text-slate-900">
                <Handshake className="h-5 w-5 text-[#0284c7]" /> Joint Venture Partner Agreement
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500 mt-0.5">
                Define the non-operating JV partner and agreed commission percentage on certified billing.
              </DialogDescription>
            </div>
          </div>

          <form onSubmit={handleAgreementSubmit} className="p-6 space-y-4 text-xs bg-white">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-[11px] font-semibold text-slate-700">JV Partner Company Name *</Label>
                <Input
                  required
                  placeholder="e.g. Sharma Construction Pvt. Ltd."
                  value={partnerName}
                  onChange={(e) => setPartnerName(e.target.value)}
                  className="h-9 text-xs bg-white border-[#c7d8e8] text-slate-900 focus:border-[#0284c7]"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-[11px] font-semibold text-slate-700">Partner PAN Number</Label>
                <Input
                  placeholder="e.g. 600123456"
                  value={partnerPan}
                  onChange={(e) => setPartnerPan(e.target.value)}
                  className="h-9 text-xs bg-white border-[#c7d8e8] text-slate-900 font-mono focus:border-[#0284c7]"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-[11px] font-semibold text-slate-700">Commission Rate (%) *</Label>
                <Input
                  required
                  type="number"
                  step="0.01"
                  placeholder="1.5"
                  value={commissionRate}
                  onChange={(e) => setCommissionRate(e.target.value)}
                  className="h-9 text-xs bg-white border-[#c7d8e8] text-slate-900 font-mono focus:border-[#0284c7]"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-[11px] font-semibold text-slate-700">Contact Person</Label>
                <Input
                  placeholder="e.g. Ram Shrestha"
                  value={contactPerson}
                  onChange={(e) => setContactPerson(e.target.value)}
                  className="h-9 text-xs bg-white border-[#c7d8e8] text-slate-900 focus:border-[#0284c7]"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-[11px] font-semibold text-slate-700">Contact Phone</Label>
                <Input
                  placeholder="98510..."
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="h-9 text-xs bg-white border-[#c7d8e8] text-slate-900 font-mono focus:border-[#0284c7]"
                />
              </div>
            </div>

            <div className="border-t border-[#e2edf7] pt-3 space-y-3">
              <span className="text-[11px] uppercase font-mono text-slate-500 font-bold">Partner Settlement Bank Account</span>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-[11px] text-slate-700 font-medium">Bank Name</Label>
                  <Input
                    placeholder="e.g. Nabil Bank"
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                    className="h-8 text-xs bg-white border-[#c7d8e8] text-slate-900 focus:border-[#0284c7]"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] text-slate-700 font-medium">Account Number</Label>
                  <Input
                    placeholder="012001..."
                    value={bankAccountNumber}
                    onChange={(e) => setBankAccountNumber(e.target.value)}
                    className="h-8 text-xs bg-white border-[#c7d8e8] text-slate-900 font-mono focus:border-[#0284c7]"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] text-slate-700 font-medium">Branch</Label>
                  <Input
                    placeholder="Kathmandu"
                    value={branch}
                    onChange={(e) => setBranch(e.target.value)}
                    className="h-8 text-xs bg-white border-[#c7d8e8] text-slate-900 focus:border-[#0284c7]"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2.5 pt-3 border-t border-[#e2edf7]">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setAgreementOpen(false)}
                className="text-xs h-8 border-[#c7d8e8] text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={saveAgreementMut.isPending}
                className="amber-cta-btn h-8 text-xs font-bold text-white shadow-sm"
              >
                {saveAgreementMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                Save JV Agreement
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Disburse Commission Payout Dialog */}
      <Dialog open={payoutOpen} onOpenChange={setPayoutOpen}>
        <DialogContent className="sm:max-w-[560px] w-full p-0 gap-0 bg-white border border-[#c7d8e8] text-slate-900 rounded-2xl shadow-2xl overflow-hidden font-sans">
          <div className="px-6 py-4 border-b border-[#e2edf7] bg-[#f8fbfe] flex items-center justify-between">
            <div>
              <DialogTitle className="flex items-center gap-2 text-base font-bold text-slate-900">
                <CreditCard className="h-5 w-5 text-[#0284c7]" /> Disburse JV Partner Commission
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500 mt-0.5">
                Record a commission payment to {agreement?.partnerName}. Automatically calculates 1.5% TDS.
              </DialogDescription>
            </div>
          </div>

          <form onSubmit={handlePayoutSubmit} className="p-6 space-y-4 text-xs bg-white">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-[11px] font-semibold text-slate-700">Gross Commission (NPR) *</Label>
                <Input
                  required
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={payoutGross}
                  onChange={(e) => setPayoutGross(e.target.value)}
                  className="h-9 text-xs bg-white border-[#c7d8e8] text-slate-900 font-mono font-bold focus:border-[#0284c7]"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-[11px] font-semibold text-slate-700">TDS Rate (%) *</Label>
                <Input
                  required
                  type="number"
                  step="0.01"
                  value={tdsPercent}
                  onChange={(e) => setTdsPercent(e.target.value)}
                  className="h-9 text-xs bg-white border-[#c7d8e8] text-slate-900 font-mono focus:border-[#0284c7]"
                />
              </div>
            </div>

            {/* Calculated Breakdown preview */}
            {parseFloat(payoutGross) > 0 && (
              <div className="bg-[#f8fbfe] p-3 rounded-xl border border-[#c7d8e8] text-xs font-mono space-y-1">
                <div className="flex justify-between text-slate-600 font-matrix">
                  <span>Gross Commission:</span>
                  <span>Rs. {formatNpr(parseFloat(payoutGross) || 0)}</span>
                </div>
                <div className="flex justify-between text-rose-600 font-matrix">
                  <span>Less 1.5% TDS:</span>
                  <span>- Rs. {formatNpr(((parseFloat(payoutGross) || 0) * (parseFloat(tdsPercent) || 1.5)) / 100)}</span>
                </div>
                <div className="flex justify-between font-bold text-emerald-700 border-t border-[#c7d8e8] pt-1 text-sm font-matrix">
                  <span>Net Disbursed:</span>
                  <span>
                    Rs.{" "}
                    {formatNpr(
                      (parseFloat(payoutGross) || 0) -
                        ((parseFloat(payoutGross) || 0) * (parseFloat(tdsPercent) || 1.5)) / 100
                    )}
                  </span>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-[11px] font-semibold text-slate-700">Payment Mode</Label>
                <Select value={paymentMode} onValueChange={(v: any) => setPaymentMode(v)}>
                  <SelectTrigger className="h-9 text-xs bg-white border-[#c7d8e8] text-slate-900 focus:border-[#0284c7]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-[#c7d8e8] text-slate-900 text-xs rounded-xl shadow-xl">
                    <SelectItem value="bank_transfer">Bank Transfer / connectIPS</SelectItem>
                    <SelectItem value="cheque">Cheque</SelectItem>
                    <SelectItem value="cash">Cash</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-[11px] font-semibold text-slate-700">Paid from Bank Account</Label>
                <Select value={selectedBankId} onValueChange={setSelectedBankId}>
                  <SelectTrigger className="h-9 text-xs bg-white border-[#c7d8e8] text-slate-900 focus:border-[#0284c7]">
                    <SelectValue placeholder="Select Account" />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-[#c7d8e8] text-slate-900 text-xs rounded-xl shadow-xl">
                    <SelectItem value="none">Site Petty Cash / Unlinked</SelectItem>
                    {bankAccounts.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.bankName} - {b.accountNumber.slice(-4)} (Bal: {formatNpr(b.currentBalance, { compact: true, prefix: "Rs." })})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {paymentMode === "cheque" && (
              <div className="space-y-1">
                <Label className="text-[11px] font-semibold text-slate-700">Cheque Number</Label>
                <Input
                  placeholder="e.g. CHQ-99104"
                  value={chequeNo}
                  onChange={(e) => setChequeNo(e.target.value)}
                  className="h-9 text-xs bg-white border-[#c7d8e8] text-slate-900 font-mono focus:border-[#0284c7]"
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-[11px] font-semibold text-slate-700">Date (AD)</Label>
                <Input
                  type="date"
                  value={payoutDate}
                  onChange={(e) => {
                    setPayoutDate(e.target.value);
                    try { setPayoutMiti(adToBs(e.target.value).formatted); } catch {}
                  }}
                  className="h-9 text-xs bg-white border-[#c7d8e8] text-slate-900 font-mono focus:border-[#0284c7]"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] font-semibold text-slate-700">Miti (BS)</Label>
                <Input
                  value={payoutMiti}
                  onChange={(e) => setPayoutMiti(e.target.value)}
                  placeholder="YYYY-MM-DD"
                  className="h-9 text-xs bg-white border-[#c7d8e8] text-slate-900 font-mono text-[#0284c7] font-bold focus:border-[#0284c7]"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-[11px] font-semibold text-slate-700">Narration / Remarks</Label>
              <Input
                placeholder="e.g. Commission settlement for IPC #02"
                value={payoutRemarks}
                onChange={(e) => setPayoutRemarks(e.target.value)}
                className="h-9 text-xs bg-white border-[#c7d8e8] text-slate-900 focus:border-[#0284c7]"
              />
            </div>

            <div className="flex justify-end gap-2.5 pt-3 border-t border-[#e2edf7]">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPayoutOpen(false)}
                className="text-xs h-8 border-[#c7d8e8] text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={recordPayoutMut.isPending}
                className="amber-cta-btn h-8 text-xs font-bold text-white shadow-sm"
              >
                {recordPayoutMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                Record Payout Voucher
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
