"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc-client";
import { DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, CreditCard } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { adToBs } from "@/lib/nepali-calendar";
import { formatNpr } from "@/lib/currency";

export type BillToSettle = {
  id: string;
  billType: "vendor" | "subcontractor";
  projectId: string;
  projectName: string;
  projectCode: string;
  supplierName: string;
  supplierPan: string | null;
  billNumber: string;
  balanceDue: number;
};

export function SettleMultiBillDialog({
  bills,
  supplierName,
  onDone,
}: {
  bills: BillToSettle[];
  supplierName: string;
  onDone: () => void;
}) {
  const utils = trpc.useUtils();

  const { data: banksData } = trpc.finance.orgBankAccounts.useQuery();
  const bankAccounts = banksData?.accounts || [];

  const [selectedBankId, setSelectedBankId] = useState<string>(
    () => bankAccounts.find((b) => b.isDefault)?.id || bankAccounts[0]?.id || ""
  );

  const [paymentMode, setPaymentMode] = useState<
    "cheque" | "bank_transfer" | "cash" | "mobile_pay" | "connectips"
  >("cheque");

  const [chequeNo, setChequeNo] = useState("");
  const [paymentDate, setPaymentDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [paymentMiti, setPaymentMiti] = useState(() => {
    try {
      return adToBs(new Date()).formatted;
    } catch {
      return "";
    }
  });

  // Track payment allocation per bill
  const [billAllocations, setBillAllocations] = useState<
    Record<string, { amountToPay: number; tdsPercent: number }>
  >(() => {
    const initial: Record<string, { amountToPay: number; tdsPercent: number }> = {};
    bills.forEach((b) => {
      initial[b.id] = {
        amountToPay: b.balanceDue,
        tdsPercent: 1.5, // 1.5% Nepal TDS default
      };
    });
    return initial;
  });

  const [notes, setNotes] = useState("");

  const settleMutation = trpc.finance.orgSettleMultiBill.useMutation({
    onSuccess: (d) => {
      utils.finance.orgPayables.invalidate();
      utils.finance.orgSummary.invalidate();
      utils.finance.orgMasterDayBook.invalidate();
      utils.finance.orgBankAccounts.invalidate();
      toast.success(`Successfully settled ${d.settledBillsCount} bill(s) via central payment!`);
      onDone();
    },
    onError: (e) => toast.error(e.message),
  });

  const handleDateChange = (adVal: string) => {
    setPaymentDate(adVal);
    try {
      setPaymentMiti(adToBs(new Date(adVal)).formatted);
    } catch {}
  };

  const handleAmountChange = (billId: string, val: string) => {
    const num = parseFloat(val) || 0;
    setBillAllocations((prev) => ({
      ...prev,
      [billId]: {
        ...prev[billId],
        amountToPay: num,
      },
    }));
  };

  // Compute grand totals
  const totalGross = Object.values(billAllocations).reduce((s, a) => s + a.amountToPay, 0);
  const totalTds = Object.values(billAllocations).reduce(
    (s, a) => s + (a.amountToPay * a.tdsPercent) / 100,
    0
  );
  const totalNetDisbursement = Math.max(0, totalGross - totalTds);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (totalNetDisbursement <= 0) {
      toast.error("Please enter a valid disbursement amount.");
      return;
    }

    const payloadBills = bills
      .filter((b) => (billAllocations[b.id]?.amountToPay || 0) > 0)
      .map((b) => {
        const alloc = billAllocations[b.id];
        const tds = (alloc.amountToPay * alloc.tdsPercent) / 100;
        return {
          billId: b.id,
          billType: b.billType,
          projectId: b.projectId,
          supplierName: b.supplierName,
          partyPan: b.supplierPan,
          billNumber: b.billNumber,
          amountToPay: alloc.amountToPay,
          tdsDeducted: tds,
          netPaid: Math.max(0, alloc.amountToPay - tds),
        };
      });

    settleMutation.mutate({
      companyBankAccountId: selectedBankId || undefined,
      paymentMode,
      chequeNo: chequeNo.trim() || undefined,
      paymentDate,
      paymentMiti: paymentMiti || undefined,
      bills: payloadBills,
      notes: notes.trim() || undefined,
    });
  };

  return (
    <DialogContent className="sm:max-w-[760px] w-full p-0 gap-0 bg-card border border-[var(--border)] text-foreground rounded-2xl shadow-2xl overflow-hidden font-sans">
      <div className="px-6 py-4 border-b border-[var(--input)] bg-[#f8fbfe] flex items-center justify-between">
        <div>
          <DialogTitle className="flex items-center gap-2 text-base font-bold text-foreground">
            <CreditCard className="h-5 w-5 text-[var(--primary)]" />
            Central Settlement: {supplierName} (भुक्तानी फर्स्यौट)
          </DialogTitle>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs bg-card">
        {/* Bill Allocations List */}
        <div className="space-y-2">
          <Label className="text-[11px] font-semibold text-foreground/80 uppercase font-mono">
            Selected Bills to Settle ({bills.length} Bills)
          </Label>
          <div className="rounded-xl border border-[var(--border)] bg-muted/60 divide-y divide-[var(--input)] max-h-48 overflow-y-auto">
            {bills.map((b) => {
              const alloc = billAllocations[b.id] || { amountToPay: b.balanceDue, tdsPercent: 1.5 };
              const tds = (alloc.amountToPay * alloc.tdsPercent) / 100;
              const net = Math.max(0, alloc.amountToPay - tds);

              return (
                <div key={b.id} className="p-2.5 flex items-center justify-between gap-3 text-xs">
                  <div>
                    <div className="flex items-center gap-1.5 font-mono">
                      <span className="text-[10px] bg-info/15 text-[var(--primary)] px-1.5 py-0.5 rounded font-bold border border-[#bae6fd]">
                        {b.projectCode}
                      </span>
                      <span className="font-bold text-foreground">Bill #{b.billNumber}</span>
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5 font-mono font-matrix">
                      Balance Due: {formatNpr(b.balanceDue)}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 font-mono">
                    <div className="text-right">
                      <div className="text-[10px] text-muted-foreground font-matrix">TDS (1.5%): -{formatNpr(tds)}</div>
                      <div className="font-bold text-foreground font-matrix">Net: {formatNpr(net)}</div>
                    </div>
                    <div className="w-28">
                      <Input
                        type="number"
                        min="0"
                        max={b.balanceDue}
                        step="any"
                        className="h-8 text-xs font-mono font-bold text-right bg-card border-[var(--border)] text-foreground focus:border-[var(--primary)]"
                        value={alloc.amountToPay}
                        onChange={(e) => handleAmountChange(b.id, e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Central Bank Account & Payment Mode */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-muted/60 p-3 rounded-xl border border-[var(--border)]">
          <div className="space-y-1.5">
            <Label className="text-[11px] font-semibold text-foreground/80">Pay From Central Bank Account</Label>
            <Select value={selectedBankId} onValueChange={setSelectedBankId}>
              <SelectTrigger className="h-9 text-xs bg-card border-[var(--border)] text-foreground font-mono focus:border-[var(--primary)]">
                <SelectValue placeholder="Select bank account..." />
              </SelectTrigger>
              <SelectContent className="bg-card border-[var(--border)] text-foreground text-xs font-mono shadow-xl rounded-xl">
                {bankAccounts.map((acc) => (
                  <SelectItem key={acc.id} value={acc.id}>
                    {acc.bankName} ({acc.accountNumber}) — Bal: {formatNpr(acc.currentBalance || 0)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-[11px] font-semibold text-foreground/80">Payment Mode</Label>
            <Select value={paymentMode} onValueChange={(v: any) => setPaymentMode(v)}>
              <SelectTrigger className="h-9 text-xs bg-card border-[var(--border)] text-foreground font-mono focus:border-[var(--primary)]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-card border-[var(--border)] text-foreground text-xs font-mono shadow-xl rounded-xl">
                <SelectItem value="cheque">Cheque (चेक)</SelectItem>
                <SelectItem value="bank_transfer">Bank Transfer / NCHL</SelectItem>
                <SelectItem value="connectips">ConnectIPS</SelectItem>
                <SelectItem value="cash">Head Office Cash</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Cheque # and Dates */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label className="text-[11px] font-semibold text-foreground/80">
              {paymentMode === "cheque" ? "Cheque Number *" : "Ref / Txn ID"}
            </Label>
            <Input
              required={paymentMode === "cheque"}
              placeholder="e.g. 048912"
              className="h-9 text-xs font-mono font-bold bg-card border-[var(--border)] text-foreground focus:border-[var(--primary)]"
              value={chequeNo}
              onChange={(e) => setChequeNo(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-[11px] font-semibold text-foreground/80">Date (AD)</Label>
            <Input
              type="date"
              className="h-9 text-xs font-mono bg-card border-[var(--border)] text-foreground focus:border-[var(--primary)]"
              value={paymentDate}
              onChange={(e) => handleDateChange(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-[11px] font-semibold text-foreground/80">Nepali Miti (BS)</Label>
            <Input
              placeholder="2081-05-15"
              className="h-9 text-xs font-mono bg-card border-[var(--border)] text-foreground font-bold text-[var(--primary)] focus:border-[var(--primary)]"
              value={paymentMiti}
              onChange={(e) => setPaymentMiti(e.target.value)}
            />
          </div>
        </div>

        {/* Notes */}
        <div className="space-y-1.5">
          <Label className="text-[11px] font-semibold text-foreground/80">Payment Remarks / Cheque Narration</Label>
          <Input
            placeholder="e.g. Lump-sum payment for Road & Building cement supply"
            className="h-9 text-xs bg-card border-[var(--border)] text-foreground focus:border-[var(--primary)]"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        {/* Total Cheque Summary Banner */}
        <div className="bg-info/10 border border-[#bae6fd] p-3.5 rounded-xl flex items-center justify-between">
          <div>
            <div className="text-[10px] uppercase font-mono text-muted-foreground">
              Total Cheque / Disbursement
            </div>
            <div className="text-lg font-bold font-mono text-[var(--primary)] font-matrix">
              {formatNpr(totalNetDisbursement)}
            </div>
          </div>
          <div className="text-right text-xs font-mono text-muted-foreground font-matrix">
            <div>Gross Total: {formatNpr(totalGross)}</div>
            <div>TDS (1.5%): -{formatNpr(totalTds)}</div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[var(--input)]">
          <Button type="button" variant="outline" size="sm" onClick={onDone} className="h-8 text-xs border-[var(--border)] text-muted-foreground hover:bg-muted">
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={settleMutation.isPending || totalNetDisbursement <= 0} className="amber-cta-btn h-8 text-xs font-bold text-white shadow-sm">
            {settleMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Issue Payment &amp; Settle Bills (भुक्तानी जारी)
          </Button>
        </div>
      </form>
    </DialogContent>
  );
}
