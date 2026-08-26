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
  Building,
  Plus,
  Receipt,
  Landmark,
  Calendar,
  CreditCard,
  FileSpreadsheet,
  Trash2,
  TrendingDown,
  Building2,
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

const HO_CATEGORIES = [
  { id: "office_rent", label: "Head Office Rent (कार्यालय भाडा)" },
  { id: "audit_tax", label: "Audit & Tax Consultant Fees (लेखापरीक्षण / कर शुल्क)" },
  { id: "legal_compliance", label: "Legal, Company Registration & Renewals" },
  { id: "utilities_internet", label: "Electricity, Water, Internet & Communication" },
  { id: "ho_salary", label: "HQ Administration & Management Salaries" },
  { id: "director_draw", label: "Director Drawings / Personal Advance" },
  { id: "tender_fees", label: "e-GP Bidding Document & Tender Fees" },
  { id: "bank_charges", label: "Bank Service Charges & Loan Interest" },
  { id: "vehicle_fuel", label: "HQ Vehicle Maintenance & Fuel" },
  { id: "hospitality", label: "Office Tea, Snacks & Business Hospitality" },
  { id: "other_overhead", label: "General Office Overhead & Miscellaneous" },
];

export function OrgHeadOfficeExpensesTab() {
  const utils = trpc.useUtils();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  // Create Form State
  const [category, setCategory] = useState("office_rent");
  const [particulars, setParticulars] = useState("");
  const [amount, setAmount] = useState("");
  const [paymentMode, setPaymentMode] = useState<"bank_transfer" | "cheque" | "connectips" | "cash">("bank_transfer");
  const [bankAccountId, setBankAccountId] = useState<string>("none");
  const [chequeNo, setChequeNo] = useState("");
  const [expenseDate, setExpenseDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [expenseMiti, setExpenseMiti] = useState(() => {
    try { return adToBs(new Date()).formatted; } catch { return ""; }
  });
  const [notes, setNotes] = useState("");

  const { data, isLoading } = trpc.finance.listHeadOfficeExpenses.useQuery();
  const { data: bankData } = trpc.finance.orgBankAccounts.useQuery();
  const bankAccounts = bankData?.accounts || [];

  const rawExpenses = data?.expenses || [];
  const totalExpenses = data?.total || 0;

  const expenses = rawExpenses.filter((e) => {
    if (categoryFilter !== "all" && e.category !== categoryFilter) return false;
    return true;
  });

  const createMutation = trpc.finance.createHeadOfficeExpense.useMutation({
    onSuccess: () => {
      toast.success("Head Office overhead expense recorded");
      utils.finance.listHeadOfficeExpenses.invalidate();
      utils.finance.orgBankAccounts.invalidate();
      setCreateDialogOpen(false);
      setParticulars("");
      setAmount("");
      setChequeNo("");
      setNotes("");
    },
    onError: (err) => toast.error(err.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!particulars || !amount || parseFloat(amount) <= 0) {
      toast.error("Please fill in valid expense particulars and amount");
      return;
    }

    createMutation.mutate({
      category,
      particulars,
      amount: parseFloat(amount),
      date: expenseDate,
      miti: expenseMiti || undefined,
      paymentMode,
      bankAccountId: bankAccountId !== "none" ? bankAccountId : undefined,
      chequeNo: chequeNo || undefined,
      notes: notes || undefined,
    });
  };

  return (
    <div className="space-y-6">
      {/* Header & KPI Summary */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#121820]/80 p-5 rounded-2xl border border-white/10 shadow-sm">
        <div className="flex items-center gap-3.5">
          <div className="h-11 w-11 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
            <Building className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              Head Office Overhead &amp; Company General Expenses
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Track recurring organizational expenses: Office Rent, Audit/Tax Fees, Legal renewals, e-GP tender purchases, and HQ Admin salaries.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right">
            <span className="text-[10px] uppercase font-mono text-muted-foreground tracking-wider">Total HQ Overheads</span>
            <div className="text-lg font-bold font-mono text-amber-400">
              Rs. {fmt(totalExpenses)}
            </div>
          </div>

          <Button
            onClick={() => setCreateDialogOpen(true)}
            className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs gap-1.5 shadow-[0_0_12px_rgba(0,255,102,0.2)]"
          >
            <Plus className="h-4 w-4" /> Log HQ Expense
          </Button>
        </div>
      </div>

      {/* Filter and Content */}
      <div className="flex items-center justify-between gap-3 bg-[#121820]/50 p-3 rounded-xl border border-white/10">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-muted-foreground">Category:</span>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="h-8 text-xs bg-[#161d26] border-white/10 text-white w-64">
              <SelectValue placeholder="All Categories" />
            </SelectTrigger>
            <SelectContent className="bg-[#0f141c] border-white/10 text-white text-xs">
              <SelectItem value="all">All Overhead Categories</SelectItem>
              {HO_CATEGORIES.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Expenses Ledger Table */}
      {expenses.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 px-4 text-center bg-[#121820]/30 rounded-2xl border border-dashed border-white/10 space-y-3">
          <div className="h-12 w-12 rounded-2xl bg-amber-500/10 flex items-center justify-center text-amber-400 border border-amber-500/20">
            <Receipt className="h-6 w-6" />
          </div>
          <h3 className="text-sm font-bold text-white">No Head Office Expenses Recorded</h3>
          <p className="text-xs text-muted-foreground max-w-sm">
            Record recurring central company expenditures that are not tied to a specific project site.
          </p>
          <Button
            onClick={() => setCreateDialogOpen(true)}
            variant="outline"
            className="text-xs font-bold border-primary/40 text-primary"
          >
            + Record First HQ Expense
          </Button>
        </div>
      ) : (
        <div className="rounded-2xl border border-white/10 bg-[#121820]/80 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-[#161d26] text-muted-foreground uppercase font-mono text-[10px] tracking-wider border-b border-white/10">
                <tr>
                  <th className="p-3.5">Date (Miti)</th>
                  <th className="p-3.5">Category</th>
                  <th className="p-3.5">Particulars / Description</th>
                  <th className="p-3.5">Payment Method / Account</th>
                  <th className="p-3.5 text-right">Amount (NPR)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 font-mono">
                {expenses.map((e) => {
                  const catMeta = HO_CATEGORIES.find((c) => c.id === e.category);

                  return (
                    <tr key={e.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="p-3.5 text-white/90">
                        {e.miti || format(new Date(e.date), "yyyy-MM-dd")}
                      </td>

                      <td className="p-3.5 font-sans">
                        <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-400 border-amber-500/30">
                          {catMeta?.label.split(" (")[0] || e.category}
                        </Badge>
                      </td>

                      <td className="p-3.5 font-sans">
                        <div className="font-semibold text-white">{e.particulars}</div>
                        {e.notes && <p className="text-[11px] text-muted-foreground mt-0.5">{e.notes}</p>}
                      </td>

                      <td className="p-3.5 font-sans text-muted-foreground capitalize">
                        {e.bankAccount ? (
                          <div className="flex items-center gap-1.5 text-emerald-400 font-mono">
                            <Landmark className="h-3 w-3" />
                            <span>{e.bankAccount.bankName}</span>
                          </div>
                        ) : (
                          <span>{e.paymentMode.replace("_", " ")}</span>
                        )}
                        {e.chequeNo && <span className="text-[10px] text-gray-400 font-mono ml-1">(Chq: {e.chequeNo})</span>}
                      </td>

                      <td className="p-3.5 text-right font-bold text-amber-400 text-sm">
                        Rs. {fmt(e.amount)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 16:10 Log HQ Expense Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="sm:max-w-[560px] bg-[#0c1015] border-white/10 text-white backdrop-blur-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold text-white">
              <Building className="h-5 w-5 text-amber-400" /> Log Head Office Overhead Expense
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Record central operational costs (Office rent, tax fees, utilities, e-GP tender fees).
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Expense Category *</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger className="h-9 text-xs bg-[#161d26] border-white/10 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0f141c] border-white/10 text-white text-xs">
                    {HO_CATEGORIES.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold">Expense Date (Miti)</Label>
                <Input
                  value={expenseMiti}
                  onChange={(e) => {
                    setExpenseMiti(e.target.value);
                    try {
                      const parts = e.target.value.split("-").map(Number);
                      if (parts.length === 3 && parts[0] && parts[1] && parts[2]) {
                        const ad = bsToAd(parts[0], parts[1], parts[2]);
                        if (ad) setExpenseDate(format(ad, "yyyy-MM-dd"));
                      }
                    } catch {}
                  }}
                  className="h-9 text-xs font-mono bg-[#161d26] border-white/10 text-white"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold">Particulars / Description *</Label>
              <Input
                required
                placeholder="e.g. Head office monthly rent for Shrawan 2081 / Tax audit fee"
                value={particulars}
                onChange={(e) => setParticulars(e.target.value)}
                className="h-9 text-xs bg-[#161d26] border-white/10 text-white"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Amount (Rs.) *</Label>
                <Input
                  required
                  type="number"
                  step="any"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="h-9 text-xs font-mono font-bold bg-[#161d26] border-white/10 text-white"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold">Payment Mode</Label>
                <Select value={paymentMode} onValueChange={(v: any) => setPaymentMode(v)}>
                  <SelectTrigger className="h-9 text-xs bg-[#161d26] border-white/10 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0f141c] border-white/10 text-white text-xs">
                    <SelectItem value="bank_transfer">Bank Transfer (A/C Payee)</SelectItem>
                    <SelectItem value="cheque">Cheque</SelectItem>
                    <SelectItem value="connectips">ConnectIPS / Digital</SelectItem>
                    <SelectItem value="cash">HQ Petty Cash</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Deduct From Company Account</Label>
                <Select value={bankAccountId} onValueChange={setBankAccountId}>
                  <SelectTrigger className="h-9 text-xs bg-[#161d26] border-white/10 text-white">
                    <SelectValue placeholder="Select Bank" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0f141c] border-white/10 text-white text-xs">
                    <SelectItem value="none">Do Not Deduct (Cash/Manual)</SelectItem>
                    {bankAccounts.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.bankName} ({b.accountNumber})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Cheque / Voucher Ref No</Label>
                <Input
                  placeholder="e.g. CHQ-10492"
                  value={chequeNo}
                  onChange={(e) => setChequeNo(e.target.value)}
                  className="h-9 text-xs font-mono bg-[#161d26] border-white/10 text-white"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Notes / Remarks</Label>
              <Input
                placeholder="e.g. Paid to Landlord Mr. Sharma with TDS deducted"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="h-9 text-xs bg-[#161d26] border-white/10 text-white"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-4 border-t border-white/10">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setCreateDialogOpen(false)}
                className="text-xs text-muted-foreground"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createMutation.isPending}
                className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs px-5"
              >
                {createMutation.isPending ? "Recording..." : "Record Expense"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
