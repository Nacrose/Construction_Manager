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
import { Loader2, CreditCard, Building2, CheckCircle2, Wallet } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { adToBs } from "@/lib/nepali-calendar";
import { cn } from "@/lib/utils";

function fmt(n: number) {
  return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

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
    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2 text-lg">
          <CreditCard className="h-5 w-5 text-primary" />
          Central Cheque / Transfer Settlement ({supplierName})
        </DialogTitle>
      </DialogHeader>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Bill Allocations List */}
        <div className="space-y-2">
          <Label className="text-xs font-semibold text-muted-foreground uppercase">
            Selected Bills to Settle ({bills.length} Bills)
          </Label>
          <div className="rounded-lg border bg-card divide-y max-h-48 overflow-y-auto">
            {bills.map((b) => {
              const alloc = billAllocations[b.id] || { amountToPay: b.balanceDue, tdsPercent: 1.5 };
              const tds = (alloc.amountToPay * alloc.tdsPercent) / 100;
              const net = Math.max(0, alloc.amountToPay - tds);

              return (
                <div key={b.id} className="p-2.5 flex items-center justify-between gap-3 text-xs">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-[10px] bg-muted px-1.5 py-0.2 rounded font-bold">
                        {b.projectCode}
                      </span>
                      <span className="font-bold text-foreground font-mono">Bill #{b.billNumber}</span>
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      Balance Due: NPR {fmt(b.balanceDue)}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 font-mono">
                    <div className="text-right">
                      <div className="text-[10px] text-muted-foreground">TDS (1.5%): -{fmt(tds)}</div>
                      <div className="font-bold text-foreground">Net: {fmt(net)}</div>
                    </div>
                    <div className="w-28">
                      <Input
                        type="number"
                        min="0"
                        max={b.balanceDue}
                        step="any"
                        className="h-7 text-xs font-mono font-bold text-right"
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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-muted/40 p-3 rounded-lg border">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Pay From Central Bank Account</Label>
            <Select value={selectedBankId} onValueChange={setSelectedBankId}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="Select bank account..." />
              </SelectTrigger>
              <SelectContent>
                {bankAccounts.map((acc) => (
                  <SelectItem key={acc.id} value={acc.id}>
                    {acc.bankName} ({acc.accountNumber}) — Bal: NPR {fmt(acc.currentBalance)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Payment Mode</Label>
            <Select value={paymentMode} onValueChange={(v: any) => setPaymentMode(v)}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
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
            <Label className="text-xs font-semibold">
              {paymentMode === "cheque" ? "Cheque Number *" : "Ref / Txn ID"}
            </Label>
            <Input
              required={paymentMode === "cheque"}
              placeholder="e.g. 048912"
              className="h-9 text-xs font-mono font-bold"
              value={chequeNo}
              onChange={(e) => setChequeNo(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Date (AD)</Label>
            <Input
              type="date"
              className="h-9 text-xs font-mono"
              value={paymentDate}
              onChange={(e) => handleDateChange(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Nepali Miti (BS)</Label>
            <Input
              placeholder="2081-05-15"
              className="h-9 text-xs font-mono"
              value={paymentMiti}
              onChange={(e) => setPaymentMiti(e.target.value)}
            />
          </div>
        </div>

        {/* Notes */}
        <div className="space-y-1.5">
          <Label className="text-xs">Payment Remarks / Cheque Narration</Label>
          <Input
            placeholder="e.g. Lump-sum payment for Road & Building cement supply"
            className="h-8 text-xs"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        {/* Total Cheque Summary Banner */}
        <div className="bg-primary/10 border border-primary/20 p-3.5 rounded-lg flex items-center justify-between">
          <div>
            <div className="text-[10px] uppercase font-mono text-muted-foreground">
              Total Cheque / Disbursement
            </div>
            <div className="text-lg font-bold font-mono text-primary">
              NPR {fmt(totalNetDisbursement)}
            </div>
          </div>
          <div className="text-right text-xs font-mono text-muted-foreground">
            <div>Gross Total: NPR {fmt(totalGross)}</div>
            <div>TDS (1.5%): -NPR {fmt(totalTds)}</div>
          </div>
        </div>

        <DialogFooter className="gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" disabled={settleMutation.isPending || totalNetDisbursement <= 0}>
            {settleMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Issue Payment & Settle Bills
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
