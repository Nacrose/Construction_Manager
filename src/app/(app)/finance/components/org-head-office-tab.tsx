"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Building,
  Plus,
  Loader2,
  Calendar,
  Receipt,
  FileText,
} from "lucide-react";
import { format } from "date-fns";
import { adToBs } from "@/lib/nepali-calendar";
import { toast } from "sonner";

function fmt(n: number) {
  return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function OrgHeadOfficeTab() {
  const utils = trpc.useUtils();
  const [addOpen, setAddOpen] = useState(false);

  const [category, setCategory] = useState("Office Rent");
  const [particulars, setParticulars] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [miti, setMiti] = useState(() => {
    try {
      return adToBs(new Date()).formatted;
    } catch {
      return "";
    }
  });
  const [paymentMode, setPaymentMode] = useState("bank_transfer");
  const [bankAccountId, setBankAccountId] = useState("");
  const [chequeNo, setChequeNo] = useState("");
  const [notes, setNotes] = useState("");

  const { data: banksData } = trpc.finance.orgBankAccounts.useQuery();
  const bankAccounts = banksData?.accounts || [];

  const { data, isLoading } = trpc.finance.listHeadOfficeExpenses.useQuery();
  const expenses = data?.expenses || [];
  const total = data?.total || 0;

  const createMutation = trpc.finance.createHeadOfficeExpense.useMutation({
    onSuccess: () => {
      utils.finance.listHeadOfficeExpenses.invalidate();
      utils.finance.orgSummary.invalidate();
      utils.finance.orgMasterDayBook.invalidate();
      utils.finance.orgBankAccounts.invalidate();
      toast.success("Head office expense logged successfully!");
      setAddOpen(false);
      setParticulars("");
      setAmount("");
      setChequeNo("");
      setNotes("");
    },
    onError: (e) => toast.error(e.message),
  });

  const handleDateChange = (adVal: string) => {
    setDate(adVal);
    try {
      setMiti(adToBs(new Date(adVal)).formatted);
    } catch {}
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!particulars.trim() || !amount) {
      toast.error("Please fill in required fields.");
      return;
    }

    createMutation.mutate({
      category,
      particulars: particulars.trim(),
      amount: parseFloat(amount) || 0,
      date,
      miti: miti || undefined,
      paymentMode,
      bankAccountId: bankAccountId || undefined,
      chequeNo: chequeNo.trim() || undefined,
      notes: notes.trim() || undefined,
    });
  };

  return (
    <div className="space-y-4">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-card p-4 rounded-xl border shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-primary/10 text-primary">
            <Building className="h-6 w-6" />
          </div>
          <div>
            <div className="text-xs text-muted-foreground uppercase font-mono">
              Total Head Office Overheads (मुख्यालय प्रशासनिक खर्च)
            </div>
            <div className="text-2xl font-bold font-mono text-foreground">
              NPR {fmt(total)}
            </div>
          </div>
        </div>

        <Button
          size="sm"
          onClick={() => setAddOpen(true)}
          className="gap-1.5 font-semibold text-xs h-9 shadow-sm"
        >
          <Plus className="h-4 w-4" />
          Log Head Office Expense
        </Button>
      </div>

      {/* Expenses Table */}
      {isLoading ? (
        <Skeleton className="h-64 rounded-xl" />
      ) : expenses.length === 0 ? (
        <div className="rounded-xl border border-dashed p-12 text-center bg-card">
          <Building className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
          <h3 className="text-base font-bold text-foreground">No Head Office Expenses Logged</h3>
          <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
            Record company-level expenses like main office rent, company audit & tax fees, internet, and office utility bills.
          </p>
          <Button size="sm" onClick={() => setAddOpen(true)} className="mt-4 gap-1.5 text-xs">
            <Plus className="h-4 w-4" />
            Log First Expense
          </Button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
          <table className="w-full text-left text-xs font-mono">
            <thead className="border-b bg-muted/60 text-[10px] uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Date (AD)</th>
                <th className="px-3 py-3">Category</th>
                <th className="px-4 py-3">Particulars</th>
                <th className="px-3 py-3">Paid From</th>
                <th className="px-3 py-3">Mode / Cheque</th>
                <th className="px-4 py-3 text-right">Amount (NPR)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {expenses.map((e) => (
                <tr key={e.id} className="hover:bg-muted/20">
                  <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">
                    {format(new Date(e.date), "yyyy-MM-dd")}
                  </td>
                  <td className="px-3 py-2.5 font-sans">
                    <Badge variant="outline" className="text-[10px] font-medium">
                      {e.category}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5 font-sans font-medium text-foreground">
                    {e.particulars}
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground font-sans">
                    {e.bankAccount?.bankName || "—"}
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">
                    {e.paymentMode} {e.chequeNo ? `#${e.chequeNo}` : ""}
                  </td>
                  <td className="px-4 py-2.5 text-right font-bold text-foreground">
                    {fmt(e.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Log Expense Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Building className="h-5 w-5 text-primary" />
              Log Head Office Expense
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-3 mt-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Expense Category *</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Office Rent">Office Rent (मुख्यालय भाडा)</SelectItem>
                  <SelectItem value="Audit & Tax Fees">Audit & Tax Consultancy (लेखा परीक्षण तथा कर)</SelectItem>
                  <SelectItem value="Electricity & Internet">Electricity, Water & Internet</SelectItem>
                  <SelectItem value="Company Vehicle Fuel">Company Vehicle Fuel & Repairs</SelectItem>
                  <SelectItem value="Legal & Registration">Company Registrar & License Renewals</SelectItem>
                  <SelectItem value="Director Drawings">Director / Owner Drawings</SelectItem>
                  <SelectItem value="General Office Overhead">General Office Overhead</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Particulars / Description *</Label>
              <Input
                required
                placeholder="e.g. Head office rent for Shrawan 2081"
                className="h-8 text-xs"
                value={particulars}
                onChange={(e) => setParticulars(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Amount (NPR) *</Label>
              <Input
                required
                type="number"
                step="any"
                min="0"
                placeholder="e.g. 25000"
                className="h-8 text-xs font-mono font-bold"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Date (AD)</Label>
                <Input
                  type="date"
                  className="h-8 text-xs font-mono"
                  value={date}
                  onChange={(e) => handleDateChange(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Miti (BS)</Label>
                <Input
                  placeholder="2081-05-15"
                  className="h-8 text-xs font-mono"
                  value={miti}
                  onChange={(e) => setMiti(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Paid From Bank/Cash</Label>
                <Select value={bankAccountId} onValueChange={setBankAccountId}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Select account..." />
                  </SelectTrigger>
                  <SelectContent>
                    {bankAccounts.map((acc) => (
                      <SelectItem key={acc.id} value={acc.id}>
                        {acc.bankName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Payment Mode</Label>
                <Select value={paymentMode} onValueChange={setPaymentMode}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cheque">Cheque</SelectItem>
                    <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="connectips">ConnectIPS</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {paymentMode === "cheque" && (
              <div className="space-y-1.5">
                <Label className="text-xs">Cheque Number</Label>
                <Input
                  placeholder="e.g. 048920"
                  className="h-8 text-xs font-mono"
                  value={chequeNo}
                  onChange={(e) => setChequeNo(e.target.value)}
                />
              </div>
            )}

            <DialogFooter className="gap-2 pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setAddOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={createMutation.isPending}>
                {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Expense
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
