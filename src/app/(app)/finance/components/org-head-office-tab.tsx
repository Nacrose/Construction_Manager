"use client";

import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
} from "lucide-react";
import { format } from "date-fns";
import { adToBs } from "@/lib/nepali-calendar";
import { toast } from "sonner";
import { formatNpr } from "@/lib/currency";
import { ConstructionTable, ConstructionTableColumn } from "@/components/ui/construction-table";

type HeadOfficeExpense = {
  id: string;
  date: Date | string;
  category: string;
  particulars: string;
  amount: number;
  paymentMode: string;
  chequeNo?: string | null;
  bankAccount?: { bankName: string } | null;
};

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

  const expensesQuery = trpc.finance.listHeadOfficeExpenses.useInfiniteQuery(
    {},
    { getNextPageParam: (last) => (last.hasMore ? last.nextCursor : undefined) }
  );
  const isLoading = expensesQuery.isLoading;
  const expenses: HeadOfficeExpense[] = (
    expensesQuery.data ? expensesQuery.data.pages.flatMap((p) => p.expenses) : []
  ) as HeadOfficeExpense[];
  // `total` is a whole-set DB aggregate (not per-page) — read it from page 0.
  const total = expensesQuery.data?.pages[0]?.total || 0;

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

  const columns: ConstructionTableColumn<HeadOfficeExpense>[] = useMemo(
    () => [
      {
        key: "date",
        header: "Date (AD)",
        width: "120px",
        sortable: true,
        render: (val) => (
          <span className="text-muted-foreground font-mono text-xs">
            {format(new Date(val), "yyyy-MM-dd")}
          </span>
        ),
      },
      {
        key: "category",
        header: "Category",
        width: "160px",
        render: (val) => (
          <Badge variant="outline" className="text-[10px] font-mono">
            {val}
          </Badge>
        ),
      },
      {
        key: "particulars",
        header: "Particulars",
        render: (val) => <span className="font-medium text-foreground text-xs">{val}</span>,
      },
      {
        key: "bankAccount",
        header: "Paid From",
        width: "160px",
        render: (_, r) => (
          <span className="text-muted-foreground text-xs font-mono">
            {r.bankAccount?.bankName || "—"}
          </span>
        ),
      },
      {
        key: "paymentMode",
        header: "Mode / Cheque",
        width: "150px",
        render: (_, r) => (
          <span className="text-muted-foreground text-xs font-mono">
            {r.paymentMode} {r.chequeNo ? `#${r.chequeNo}` : ""}
          </span>
        ),
      },
      {
        key: "amount",
        header: "Amount",
        align: "right",
        width: "140px",
        summary: "sum",
        render: (val) => (
          <span className="font-bold text-foreground font-mono text-xs">
            {formatNpr(val)}
          </span>
        ),
      },
    ],
    []
  );

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
              {formatNpr(total)}
            </div>
          </div>
        </div>

        <Button
          size="sm"
          onClick={() => setAddOpen(true)}
          className="gap-1.5 font-semibold text-xs h-9 shadow-sm font-mono"
        >
          <Plus className="h-4 w-4" />
          Log Head Office Expense
        </Button>
      </div>

      {/* Expenses ConstructionTable */}
      <ConstructionTable<HeadOfficeExpense>
        data={expenses}
        columns={columns}
        isLoading={isLoading}
        searchPlaceholder="Search category, particulars, cheque..."
        searchFilterKeys={["category", "particulars", "chequeNo"]}
        summaryFooterLabel="Total Overheads"
        loadMore={
          expensesQuery.hasNextPage
            ? {
                onLoadMore: () => expensesQuery.fetchNextPage(),
                isLoadingMore: expensesQuery.isFetchingNextPage,
                label: "Load more expenses",
              }
            : undefined
        }
        exportExcel={{
          filename: `HeadOffice_Expenses_${format(new Date(), "yyyy-MM-dd")}`,
          sheetName: "HOExpenses",
        }}
        emptyState={{
          title: "No Head Office Expenses Logged",
          description: "Record company-level expenses like main office rent, company audit & tax fees, internet, and office utility bills.",
        }}
      />

      {/* Log Expense Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-[560px] w-full p-0 gap-0 bg-card border border-[var(--border)] text-foreground rounded-2xl shadow-2xl overflow-hidden font-sans">
          <div className="px-6 py-4 border-b border-[var(--input)] bg-[#f8fbfe] flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2 text-base font-bold text-foreground">
              <Building className="h-5 w-5 text-[var(--primary)]" />
              Log Head Office Expense (मुख्यालय खर्च)
            </DialogTitle>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-3.5 text-xs bg-card">
            <div className="space-y-1.5">
              <Label className="text-[11px] font-semibold text-foreground/80">Expense Category *</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="h-9 text-xs bg-card border-[var(--border)] text-foreground font-mono focus:border-[var(--primary)]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-card border-[var(--border)] text-foreground text-xs font-mono shadow-xl rounded-xl">
                  <SelectItem value="Office Rent">Office Rent (मुख्यालय भाडा)</SelectItem>
                  <SelectItem value="Audit & Tax Fees">Audit &amp; Tax Consultancy (लेखा परीक्षण तथा कर)</SelectItem>
                  <SelectItem value="Electricity & Internet">Electricity, Water &amp; Internet</SelectItem>
                  <SelectItem value="Company Vehicle Fuel">Company Vehicle Fuel &amp; Repairs</SelectItem>
                  <SelectItem value="Legal & Registration">Company Registrar &amp; License Renewals</SelectItem>
                  <SelectItem value="Director Drawings">Director / Owner Drawings</SelectItem>
                  <SelectItem value="General Office Overhead">General Office Overhead</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[11px] font-semibold text-foreground/80">Particulars / Description *</Label>
              <Input
                required
                placeholder="e.g. Head office rent for Shrawan 2081"
                className="h-9 text-xs bg-card border-[var(--border)] text-foreground focus:border-[var(--primary)]"
                value={particulars}
                onChange={(e) => setParticulars(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-[11px] font-semibold text-foreground/80">Amount (NPR) *</Label>
              <Input
                required
                type="number"
                step="any"
                min="0"
                placeholder="e.g. 25000"
                className="h-9 text-xs font-mono font-bold bg-card border-[var(--border)] text-foreground focus:border-[var(--primary)]"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[11px] font-semibold text-foreground/80">Date (AD)</Label>
                <Input
                  type="date"
                  className="h-9 text-xs font-mono bg-card border-[var(--border)] text-foreground focus:border-[var(--primary)]"
                  value={date}
                  onChange={(e) => handleDateChange(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-[11px] font-semibold text-foreground/80">Miti (BS)</Label>
                <Input
                  placeholder="2081-05-15"
                  className="h-9 text-xs font-mono bg-card border-[var(--border)] text-foreground font-bold text-[var(--primary)] focus:border-[var(--primary)]"
                  value={miti}
                  onChange={(e) => setMiti(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[11px] font-semibold text-foreground/80">Payment Mode</Label>
                <Select value={paymentMode} onValueChange={setPaymentMode}>
                  <SelectTrigger className="h-9 text-xs bg-card border-[var(--border)] text-foreground font-mono focus:border-[var(--primary)]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-[var(--border)] text-foreground text-xs font-mono shadow-xl rounded-xl">
                    <SelectItem value="bank_transfer">Bank Transfer (IPS/Online)</SelectItem>
                    <SelectItem value="cheque">Cheque (चेक)</SelectItem>
                    <SelectItem value="cash">Cash (नगद)</SelectItem>
                    <SelectItem value="mobile_pay">Mobile Wallet (eSewa/Khalti)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-[11px] font-semibold text-foreground/80">Paid From Account</Label>
                <Select value={bankAccountId} onValueChange={setBankAccountId}>
                  <SelectTrigger className="h-9 text-xs bg-card border-[var(--border)] text-foreground font-mono focus:border-[var(--primary)]">
                    <SelectValue placeholder="Select bank" />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-[var(--border)] text-foreground text-xs font-mono shadow-xl rounded-xl">
                    {bankAccounts.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.bankName} ({b.accountType})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {paymentMode === "cheque" && (
              <div className="space-y-1.5">
                <Label className="text-[11px] font-semibold text-foreground/80">Cheque Number</Label>
                <Input
                  placeholder="e.g. CHQ-990182"
                  className="h-9 text-xs font-mono bg-card border-[var(--border)] text-foreground focus:border-[var(--primary)]"
                  value={chequeNo}
                  onChange={(e) => setChequeNo(e.target.value)}
                />
              </div>
            )}

            <div className="flex justify-end gap-2.5 pt-3 border-t border-[var(--input)]">
              <Button type="button" variant="outline" size="sm" onClick={() => setAddOpen(false)} className="h-8 text-xs border-[var(--border)] text-muted-foreground hover:bg-muted">
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={createMutation.isPending} className="amber-cta-btn h-8 text-xs font-bold text-white shadow-sm">
                {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Log Overhead Expense (दर्ता गर्नुहोस्)
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
