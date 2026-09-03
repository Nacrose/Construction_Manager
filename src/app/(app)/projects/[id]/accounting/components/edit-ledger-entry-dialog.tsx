"use client";

import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogHeader } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, AlertTriangle } from "lucide-react";

const EDITABLE = new Set<string>(["payment", "site_expense", "head_office_expense"]);

function num(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "number") return String(v);
  if (typeof v === "string") return v;
  if (typeof v === "object" && "toNumber" in (v as any)) return String((v as any).toNumber());
  return "";
}

export function EditLedgerEntryDialog({
  entry,
  open,
  onOpenChange,
  onSaved,
}: {
  entry: { id?: string; source?: string } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}) {
  const source = entry?.source ?? "payment";
  const isEditable = entry?.source != null && EDITABLE.has(entry.source);

  const [date, setDate] = useState("");
  const [amount, setAmount] = useState("");
  const [payee, setPayee] = useState("");
  const [particulars, setParticulars] = useState("");
  const [pan, setPan] = useState("");
  const [mode, setMode] = useState("");
  const [voucherType, setVoucherType] = useState("");

  const { data, isLoading } = trpc.accounting.getLedgerSource.useQuery(
    { source: entry?.source as any, id: entry?.id ?? "" },
    { enabled: open && Boolean(entry?.id && entry?.source) }
  );

  useEffect(() => {
    if (!open) return;
    if (!data?.record || entry?.source !== "payment") return;
    const r = data.record as any;
    setDate(r.paymentDate ? new Date(r.paymentDate).toISOString().slice(0, 10) : "");
    setAmount(num(r.amount));
    setPayee(r.payeeName || "");
    setParticulars(r.notes || "");
    setPan(r.partyPan || "");
    setMode(r.paymentMode || "");
    setVoucherType(r.voucherType || "");
  }, [data, open, entry?.source]);

  useEffect(() => {
    if (!open) return;
    if (!data?.record || entry?.source === "payment") return;
    const r = data.record as any;
    const d = r.date ?? r.paymentDate ?? r.billDate ?? r.issueDate;
    setDate(d ? new Date(d).toISOString().slice(0, 10) : "");
    setAmount(num(r.amount ?? r.totalAmount ?? r.grossAmount ?? r.netPayable));
    setParticulars(r.particulars || r.description || r.notes || "");
    setPayee(r.vendorName || r.payeeName || "");
    setMode(r.paymentMode || "");
    setVoucherType(r.voucherType || "");
  }, [data, open, entry?.source]);

  const updateMut = trpc.accounting.updateLedgerEntry.useMutation({
    onSuccess: () => {
      toast.success("Entry updated.");
      onOpenChange(false);
      onSaved?.();
    },
    onError: (e) => toast.error(e.message),
  });

  const handleSave = () => {
    if (!entry?.id) return;
    updateMut.mutate({
      source: entry.source as any,
      id: entry.id,
      patch: {
        ...(date ? { date: new Date(date).toISOString() } : {}),
        ...(amount !== "" ? { amount: parseFloat(amount) } : {}),
        ...(payee.trim() ? { payeeName: payee.trim() } : {}),
        ...(particulars.trim() ? { particulars: particulars.trim() } : {}),
        ...(pan.trim() ? { partyPan: pan.trim() } : {}),
        ...(mode ? { paymentMode: mode } : {}),
        ...(voucherType ? { voucherType } : {}),
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px] p-0 gap-0 bg-card border border-[var(--border)] text-foreground rounded-2xl overflow-hidden font-sans">
        <DialogHeader className="px-6 py-4 border-b border-[var(--input)] bg-[#f8fbfe]">
          <DialogTitle className="text-base font-bold text-foreground">Edit Voucher</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            {entry?.source === "payment"
              ? "Update the underlying payment voucher."
              : entry?.source === "site_expense"
                ? "Update the site petty-cash expense."
                : entry?.source === "head_office_expense"
                  ? "Update the head-office expense."
                  : "Edit this entry from its source module."}
          </DialogDescription>
        </DialogHeader>

        <div className="p-5 space-y-4 text-xs">
          {isLoading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading entry…
            </div>
          ) : !isEditable ? (
            <div className="rounded-lg border border-dashed border-[var(--border)] p-6 text-center text-muted-foreground space-y-2">
              <AlertTriangle className="mx-auto h-6 w-6 text-amber-500" />
              <p>This entry is a {source === "vendor_bill" ? "vendor bill" : source === "subcontractor_bill" ? "subcontractor bill" : "client/subcontractor IPC"}.</p>
              <p className="text-[10px]">Edit it from its source module (Payments, Bills, or IPC) to keep valuations and TDS correct.</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-semibold text-foreground/80">Date</Label>
                  <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-9 text-xs" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-semibold text-foreground/80">Amount (NPR)</Label>
                  <Input type="number" inputMode="decimal" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="h-9 font-mono text-xs" />
                </div>
                {entry?.source === "payment" && (
                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-semibold text-foreground/80">Payee / Party</Label>
                    <Input value={payee} onChange={(e) => setPayee(e.target.value)} className="h-9 text-xs" />
                  </div>
                )}
                {(entry?.source === "site_expense" || entry?.source === "head_office_expense") && (
                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-semibold text-foreground/80">Payment Mode</Label>
                    <Select value={mode} onValueChange={setMode}>
                      <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Mode" /></SelectTrigger>
                      <SelectContent className="bg-card text-xs text-foreground">
                        <SelectItem value="cash">Cash</SelectItem>
                        <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                        <SelectItem value="cheque">Cheque</SelectItem>
                        <SelectItem value="mobile">Mobile Pay</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {entry?.source === "payment" && (
                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-semibold text-foreground/80">PAN / VAT</Label>
                    <Input value={pan} onChange={(e) => setPan(e.target.value)} className="h-9 font-mono text-xs" />
                  </div>
                )}
                {entry?.source === "payment" && (
                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-semibold text-foreground/80">Voucher Type</Label>
                    <Select value={voucherType} onValueChange={setVoucherType}>
                      <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Type" /></SelectTrigger>
                      <SelectContent className="bg-card text-xs text-foreground">
                        <SelectItem value="payment">Payment</SelectItem>
                        <SelectItem value="receipt">Receipt</SelectItem>
                        <SelectItem value="bank_payment">Bank Payment</SelectItem>
                        <SelectItem value="cash_payment">Cash Payment</SelectItem>
                        <SelectItem value="journal">Journal</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <Label className="text-[11px] font-semibold text-foreground/80">Particulars / Narration</Label>
                <textarea
                  value={particulars}
                  onChange={(e) => setParticulars(e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-[var(--border)] bg-card px-3 py-2 text-xs text-foreground focus:border-[var(--primary)] focus:outline-none"
                />
              </div>
            </>
          )}
        </div>

        {isEditable && (
          <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-[var(--input)]">
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={updateMut.isPending}
              className="amber-cta-btn h-8 text-xs font-bold text-white"
            >
              {updateMut.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />} Save Changes
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
