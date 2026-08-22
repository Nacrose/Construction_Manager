"use client";

import { useState, useEffect } from "react";
import * as XLSX from "xlsx";
import { trpc } from "@/lib/trpc-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
  Plus,
  Loader2,
  Inbox,
  FolderTree,
  UploadCloud,
  Download,
  Search,
  Paperclip,
  Eye,
  CheckCircle2,
  AlertTriangle,
  Building2,
  Trash2,
  Receipt,
  RotateCcw,
  CreditCard,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { adToBs } from "@/lib/nepali-calendar";
import { CategoryManagerDialog } from "./category-manager-dialog";
import { BulkImportDialog } from "./bulk-import-dialog";

function fmt(n: number) {
  return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function PaymentsTab({
  projectId,
  canWrite = true,
  initialPayable,
  onClearInitialPayable,
}: {
  projectId: string;
  canWrite?: boolean;
  initialPayable?: {
    entityType: "vendor" | "subcontractor";
    entityId: string;
    entityName: string;
    entityPan?: string | null;
    billNumber: string;
    balanceDue: number;
    tdsAmount: number;
    category: string;
  } | null;
  onClearInitialPayable?: () => void;
}) {
  const utils = trpc.useUtils();

  // Dialog states
  const [addOpen, setAddOpen] = useState(false);
  const [catManagerOpen, setCatManagerOpen] = useState(false);
  const [bulkImportOpen, setBulkImportOpen] = useState(false);
  const [viewScanUrl, setViewScanUrl] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterSoftware, setFilterSoftware] = useState<string>("all");
  const [filterPayeeType, setFilterPayeeType] = useState<string>("all");

  // Queries
  const { data: catData } = trpc.paymentCategory.list.useQuery({ projectId });
  const categories = catData?.categories || [];

  const { data: listData, isLoading } = trpc.projectOps.payment.list.useQuery({
    projectId,
    category: filterCategory !== "all" ? filterCategory : undefined,
    accountingSoftware: filterSoftware !== "all" ? filterSoftware : undefined,
    payeeType: filterPayeeType !== "all" ? filterPayeeType : undefined,
    search: search || undefined,
  });

  const { data: stats } = trpc.projectOps.payment.stats.useQuery({ projectId });
  const { data: catSummary } = trpc.projectOps.payment.categorySummary.useQuery({ projectId });
  const { data: payablesData } = trpc.projectOps.payment.outstandingPayables.useQuery({ projectId });
  const pendingPayables = payablesData?.payables || [];
  const payments = listData?.payments ?? [];

  // Form states for Record Payment
  const [allocationType, setAllocationType] = useState<"specific_payee" | "bulk_category" | "advance">("specific_payee");
  const [payeeType, setPayeeType] = useState("vendor");
  const [payeeName, setPayeeName] = useState("");
  const [partyPan, setPartyPan] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [amount, setAmount] = useState("");
  const [tds, setTds] = useState("0");
  const [mode, setMode] = useState<"cash" | "bank_transfer" | "cheque" | "mobile_pay" | "connectips">("bank_transfer");
  const [bankAccount, setBankAccount] = useState("Nabil Bank Site A/C");
  const [chequeNo, setChequeNo] = useState("");
  const [notes, setNotes] = useState("");
  const [date, setDate] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [miti, setMiti] = useState(() => {
    try {
      return adToBs(new Date()).formatted;
    } catch {
      return "";
    }
  });

  // Handle incoming initialPayable trigger (e.g. from Outstanding Payables tab)
  useEffect(() => {
    if (initialPayable) {
      setAllocationType("specific_payee");
      setPayeeType(initialPayable.entityType);
      setPayeeName(initialPayable.entityName);
      setPartyPan(initialPayable.entityPan || "");
      setInvoiceNumber(initialPayable.billNumber);
      setAmount(initialPayable.balanceDue.toString());
      setTds(initialPayable.tdsAmount.toString());

      // Match category
      const matchedCat = categories.find((c) =>
        c.name.toLowerCase().includes(initialPayable.category.toLowerCase())
      );
      if (matchedCat) setSelectedCatId(matchedCat.id);

      setAddOpen(true);
      if (onClearInitialPayable) onClearInitialPayable();
    }
  }, [initialPayable, categories, onClearInitialPayable]);

  // Category & Subcategory selection
  const [selectedCatId, setSelectedCatId] = useState<string>("");
  const [selectedSubId, setSelectedSubId] = useState<string>("");
  const [newSubName, setNewSubName] = useState("");
  const [isCreatingSub, setIsCreatingSub] = useState(false);

  // Accounting Software
  const [accountingSoftware, setAccountingSoftware] = useState<"tally" | "swastik" | "other">("tally");
  const [accountingVoucherNo, setAccountingVoucherNo] = useState("");
  const [voucherType, setVoucherType] = useState<"payment" | "bank_payment" | "cash_payment" | "journal">("bank_payment");

  // Scanned voucher attachment
  const [fileData, setFileData] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");

  const selectedCategoryObj = categories.find((c) => c.id === selectedCatId || c.name === selectedCatId);
  const subcategoryList = selectedCategoryObj?.children || [];

  const handleDateChange = (adDateStr: string) => {
    setDate(adDateStr);
    try {
      setMiti(adToBs(adDateStr).formatted);
    } catch {
      // ignore
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      setFileData(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const createSubMut = trpc.paymentCategory.create.useMutation({
    onSuccess: (res) => {
      utils.paymentCategory.list.invalidate({ projectId });
      setSelectedSubId(res.category.id);
      setIsCreatingSub(false);
      setNewSubName("");
      toast.success(`Subcategory "${res.category.name}" created`);
    },
    onError: (e) => toast.error(e.message),
  });

  const createMut = trpc.projectOps.payment.create.useMutation({
    onSuccess: () => {
      utils.projectOps.payment.list.invalidate({ projectId });
      utils.projectOps.payment.stats.invalidate({ projectId });
      utils.projectOps.payment.categorySummary.invalidate({ projectId });
      utils.projectOps.payment.outstandingPayables.invalidate({ projectId });
      utils.vendorBill.list.invalidate({ projectId });
      utils.subcontractorBill.list.invalidate({ projectId });
      setAddOpen(false);
      resetForm();
      toast.success("Payment recorded successfully into project ledger");
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMut = trpc.projectOps.payment.delete.useMutation({
    onSuccess: () => {
      utils.projectOps.payment.list.invalidate({ projectId });
      utils.projectOps.payment.stats.invalidate({ projectId });
      utils.projectOps.payment.categorySummary.invalidate({ projectId });
      utils.projectOps.payment.outstandingPayables.invalidate({ projectId });
      toast.success("Payment record deleted");
    },
    onError: (e) => toast.error(e.message),
  });

  const resetForm = () => {
    setPayeeName("");
    setPartyPan("");
    setInvoiceNumber("");
    setAmount("");
    setTds("0");
    setChequeNo("");
    setAccountingVoucherNo("");
    setNotes("");
    setFileData(null);
    setFileName("");
    setIsCreatingSub(false);
    setNewSubName("");
  };

  const handleRecordPayment = () => {
    const numAmount = parseFloat(amount) || 0;
    const numTds = parseFloat(tds) || 0;
    if (numAmount <= 0) {
      toast.error("Please enter a valid payment amount.");
      return;
    }

    const resolvedCategoryName = selectedCategoryObj?.name || (allocationType === "bulk_category" ? "Site Overheads" : "General");
    const resolvedSubCategoryName =
      subcategoryList.find((s) => s.id === selectedSubId)?.name || (isCreatingSub && newSubName ? newSubName : undefined);

    createMut.mutate({
      projectId,
      allocationType,
      payeeType,
      payeeName: payeeName.trim() || `${resolvedCategoryName} (${resolvedSubCategoryName || "Disbursement"})`,
      partyPan: partyPan.trim() || undefined,
      invoiceNumber: invoiceNumber.trim() || undefined,
      amount: numAmount,
      tdsDeducted: numTds,
      netPaid: numAmount - numTds,
      paymentDate: new Date(date).toISOString(),
      paymentMiti: miti || undefined,
      paymentMode: mode,
      bankAccount: bankAccount || undefined,
      chequeNo: chequeNo.trim() || undefined,
      categoryId: selectedCategoryObj?.id,
      subCategoryId: selectedSubId || undefined,
      category: resolvedCategoryName,
      subCategory: resolvedSubCategoryName,
      accountingSoftware,
      accountingVoucherNo: accountingVoucherNo.trim() || undefined,
      voucherType,
      scannedBillUrl: fileData || undefined,
      scannedBillName: fileName || undefined,
      notes: notes.trim() || undefined,
    });
  };

  const handleExportExcel = () => {
    try {
      const rows = payments.map((p, i) => [
        i + 1,
        p.paymentMiti || "—",
        format(new Date(p.paymentDate), "yyyy-MM-dd"),
        p.accountingSoftware ? p.accountingSoftware.toUpperCase() : "MANUAL",
        p.accountingVoucherNo || "—",
        p.category || "Uncategorized",
        p.subCategory || "—",
        p.payeeName,
        p.partyPan || "—",
        p.paymentMode.replace(/_/g, " ").toUpperCase(),
        p.bankAccount || "—",
        p.chequeNo || "—",
        p.amount,
        p.tdsDeducted,
        p.netPaid,
        p.notes || "",
        p.isBillAttached ? "Yes" : "No",
      ]);

      const headers = [
        "S.N.",
        "Miti (BS)",
        "Date (AD)",
        "Accounting Software",
        "Voucher No",
        "Cost Head (Category)",
        "Sub-Ledger (Subcategory)",
        "Payee / Ledger Name",
        "PAN No",
        "Payment Mode",
        "Bank / Cash Account",
        "Cheque / Ref No",
        "Gross Amount (NPR)",
        "TDS Deducted (NPR)",
        "Net Paid (NPR)",
        "Narration / Notes",
        "Bill Attached",
      ];

      const ws = XLSX.utils.aoa_to_sheet([["Payment Register / Daybook"], [], headers, ...rows]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Payment Register");
      XLSX.writeFile(wb, `payment_register_${format(new Date(), "yyyyMMdd")}.xlsx`);
      toast.success("Payment Register (.xlsx) exported");
    } catch {
      toast.error("Failed to export Excel");
    }
  };

  const numAmount = parseFloat(amount) || 0;
  const numTds = parseFloat(tds) || 0;
  const computedNet = Math.max(0, numAmount - numTds);

  return (
    <div className="space-y-3 font-sans">
      {/* 28px High-Density Inline Metric Strip */}
      {stats && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-1.5 bg-muted/40 rounded-md border text-xs font-mono">
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">Total Disbursed:</span>
            <span className="font-bold text-foreground">NPR {fmt(stats.totalPaid)}</span>
          </div>
          <div className="flex items-center gap-1.5 border-l pl-3">
            <span className="text-muted-foreground">TDS Withheld:</span>
            <span className="font-bold text-red-600">NPR {fmt(stats.totalTds)}</span>
          </div>
          <div className="flex items-center gap-1.5 border-l pl-3">
            <span className="text-muted-foreground">Net Paid:</span>
            <span className="font-bold text-emerald-600">NPR {fmt(stats.totalPaid - stats.totalTds)}</span>
          </div>
          <div className="flex items-center gap-1.5 border-l pl-3">
            <span className="text-muted-foreground">Vouchers:</span>
            <span className="font-bold text-foreground">{stats.count}</span>
          </div>
          <div className="flex items-center gap-1.5 border-l pl-3">
            <span className="text-muted-foreground">Tally/Swastik Synced:</span>
            <span className="font-bold text-purple-600">
              {payments.filter((p) => p.accountingSoftware).length}
            </span>
          </div>
        </div>
      )}

      {/* Category Cost Breakdown Strip */}
      {catSummary && catSummary.breakdown.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 p-2 bg-card rounded-md border text-xs">
          <span className="text-[11px] font-bold text-muted-foreground uppercase font-mono mr-1">
            Cost Heads:
          </span>
          {catSummary.breakdown.map((b) => (
            <Badge
              key={b.category}
              variant="outline"
              onClick={() => setFilterCategory(filterCategory === b.category ? "all" : b.category)}
              className={`cursor-pointer text-[11px] h-6 px-2 font-mono gap-1 transition ${
                filterCategory === b.category
                  ? "bg-primary/20 border-primary text-primary font-bold shadow-sm"
                  : "bg-muted/30 hover:bg-muted/70 text-foreground"
              }`}
            >
              <span>{b.category}:</span>
              <strong>NPR {fmt(b.totalGross)}</strong>
              <span className="text-[9px] text-muted-foreground">({b.count})</span>
            </Badge>
          ))}
        </div>
      )}

      {/* Toolbar & Action Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* Left: Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-44 sm:w-56">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search payee, PAN, voucher..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 pl-8 text-xs font-mono"
            />
          </div>

          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="h-8 text-xs w-36 font-mono">
              <SelectValue placeholder="All Categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.name}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filterSoftware} onValueChange={setFilterSoftware}>
            <SelectTrigger className="h-8 text-xs w-32 font-mono">
              <SelectValue placeholder="All Software" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Software</SelectItem>
              <SelectItem value="tally">TallyPrime</SelectItem>
              <SelectItem value="swastik">Swastik ERP</SelectItem>
              <SelectItem value="other">Manual Entry</SelectItem>
            </SelectContent>
          </Select>

          <Select value={filterPayeeType} onValueChange={setFilterPayeeType}>
            <SelectTrigger className="h-8 text-xs w-28 font-mono">
              <SelectValue placeholder="All Types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="vendor">Vendor</SelectItem>
              <SelectItem value="subcontractor">Subcontractor</SelectItem>
              <SelectItem value="supplier">Supplier</SelectItem>
              <SelectItem value="staff">Staff</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportExcel}
            className="h-8 text-xs gap-1 font-mono"
          >
            <Download className="h-3.5 w-3.5" /> Export (.xlsx)
          </Button>

          {canWrite && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setBulkImportOpen(true)}
                className="h-8 text-xs gap-1 font-mono text-purple-700 dark:text-purple-300 border-purple-500/30"
              >
                <UploadCloud className="h-3.5 w-3.5" /> Bulk Import
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setCatManagerOpen(true)}
                className="h-8 text-xs gap-1 font-mono text-amber-700 dark:text-amber-300 border-amber-500/30"
              >
                <FolderTree className="h-3.5 w-3.5" /> Categories
              </Button>

              <Dialog open={addOpen} onOpenChange={setAddOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" className="h-8 text-xs gap-1 font-bold">
                    <Plus className="h-3.5 w-3.5" /> Record Payment
                  </Button>
                </DialogTrigger>

                <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden font-sans">
                  <DialogHeader className="p-4 border-b bg-muted/20">
                    <DialogTitle className="text-base font-bold text-foreground">
                      Record Project Payment / Disbursement
                    </DialogTitle>
                    <DialogDescription className="text-xs text-muted-foreground">
                      Log bill-by-bill payments or bulk category journal entries with Tally & Swastik sync.
                    </DialogDescription>
                  </DialogHeader>

                  <div className="p-4 space-y-3 overflow-y-auto flex-1 text-xs">
                    {/* Allocation Mode Selector Pills */}
                    <div className="grid grid-cols-3 gap-1.5 p-1 bg-muted/30 rounded border text-center font-semibold">
                      <button
                        type="button"
                        onClick={() => setAllocationType("specific_payee")}
                        className={`py-1 rounded text-xs transition ${
                          allocationType === "specific_payee"
                            ? "bg-primary text-primary-foreground shadow-sm font-bold"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        🎯 Against Payee / Bill
                      </button>
                      <button
                        type="button"
                        onClick={() => setAllocationType("bulk_category")}
                        className={`py-1 rounded text-xs transition ${
                          allocationType === "bulk_category"
                            ? "bg-primary text-primary-foreground shadow-sm font-bold"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        📊 Bulk Category (Tally/Swastik)
                      </button>
                      <button
                        type="button"
                        onClick={() => setAllocationType("advance")}
                        className={`py-1 rounded text-xs transition ${
                          allocationType === "advance"
                            ? "bg-primary text-primary-foreground shadow-sm font-bold"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        💵 Advance Payment
                      </button>
                    </div>

                    {/* Category & Subcategory Cascading Grid */}
                    <div className="p-3 rounded border bg-card space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-foreground flex items-center gap-1.5">
                          <FolderTree className="h-3.5 w-3.5 text-primary" />
                          Cost Head & Subcategory (Chart of Accounts)
                        </span>
                        <button
                          type="button"
                          onClick={() => setCatManagerOpen(true)}
                          className="text-[11px] text-primary hover:underline"
                        >
                          Manage Heads
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-[11px] text-muted-foreground">Main Category</Label>
                          <Select
                            value={selectedCatId}
                            onValueChange={(val) => {
                              setSelectedCatId(val);
                              setSelectedSubId("");
                            }}
                          >
                            <SelectTrigger className="h-8 text-xs font-medium">
                              <SelectValue placeholder="Select Category Head" />
                            </SelectTrigger>
                            <SelectContent>
                              {categories.map((c) => (
                                <SelectItem key={c.id} value={c.id}>
                                  {c.name} {c.nameNp ? `(${c.nameNp})` : ""}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <Label className="text-[11px] text-muted-foreground">Subcategory</Label>
                            {!isCreatingSub && selectedCategoryObj && (
                              <button
                                type="button"
                                onClick={() => setIsCreatingSub(true)}
                                className="text-[10px] text-primary hover:underline flex items-center gap-0.5"
                              >
                                <Plus className="h-2.5 w-2.5" /> New Sub
                              </button>
                            )}
                          </div>

                          {isCreatingSub ? (
                            <div className="flex items-center gap-1">
                              <Input
                                placeholder="Subcategory name (e.g. Food/Mess)"
                                value={newSubName}
                                onChange={(e) => setNewSubName(e.target.value)}
                                className="h-8 text-xs"
                                autoFocus
                              />
                              <Button
                                size="sm"
                                onClick={() => {
                                  if (!newSubName.trim() || !selectedCategoryObj) return;
                                  createSubMut.mutate({
                                    projectId,
                                    name: newSubName.trim(),
                                    parentId: selectedCategoryObj.id,
                                  });
                                }}
                                disabled={createSubMut.isPending || !newSubName.trim()}
                                className="h-8 text-xs px-2"
                              >
                                {createSubMut.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setIsCreatingSub(false)}
                                className="h-8 text-xs px-2"
                              >
                                ✕
                              </Button>
                            </div>
                          ) : (
                            <Select value={selectedSubId} onValueChange={setSelectedSubId}>
                              <SelectTrigger className="h-8 text-xs font-medium">
                                <SelectValue placeholder="Select Subcategory" />
                              </SelectTrigger>
                              <SelectContent>
                                {subcategoryList.map((s) => (
                                  <SelectItem key={s.id} value={s.id}>
                                    {s.name} {s.nameNp ? `(${s.nameNp})` : ""}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Quick Settle from Outstanding Bill helper */}
                    {allocationType === "specific_payee" && pendingPayables.length > 0 && (
                      <div className="p-2.5 rounded bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/40 space-y-1.5">
                        <div className="flex items-center justify-between text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                          <span className="flex items-center gap-1.5 font-bold">
                            <CreditCard className="h-3.5 w-3.5 text-emerald-600" />
                            Quick Settle Outstanding Bill ({pendingPayables.length} Unpaid)
                          </span>
                          <span className="text-[10px] text-muted-foreground">Select to auto-fill</span>
                        </div>
                        <Select
                          onValueChange={(val) => {
                            const item = pendingPayables.find((p) => p.id === val);
                            if (!item) return;
                            setPayeeType(item.entityType);
                            setPayeeName(item.entityName);
                            setPartyPan(item.entityPan || "");
                            setInvoiceNumber(item.billNumber);
                            setAmount(item.balanceDue.toString());
                            setTds(((item.balanceDue * (item.tdsPercent || 1.5)) / 100).toFixed(2));
                            const matchedCat = categories.find((c) =>
                              c.name.toLowerCase().includes(item.category.toLowerCase())
                            );
                            if (matchedCat) setSelectedCatId(matchedCat.id);
                          }}
                        >
                          <SelectTrigger className="h-8 text-xs font-medium bg-background">
                            <SelectValue placeholder="-- Select an Outstanding Bill to Pay --" />
                          </SelectTrigger>
                          <SelectContent>
                            {pendingPayables.map((p) => (
                              <SelectItem key={p.id} value={p.id} className="text-xs">
                                {p.entityName} — Bill #{p.billNumber} (Due: NPR {fmt(p.balanceDue)})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    {/* Date (Dual BS & AD), Payee Type & Name, PAN, Bill # */}
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                      <div className="space-y-1">
                        <Label className="text-[11px] text-muted-foreground">Date (AD / BS)</Label>
                        <Input
                          type="date"
                          value={date}
                          onChange={(e) => handleDateChange(e.target.value)}
                          className="h-8 text-xs font-mono"
                        />
                        {miti && <span className="text-[10px] text-muted-foreground font-mono">Miti: {miti}</span>}
                      </div>

                      <div className="space-y-1">
                        <Label className="text-[11px] text-muted-foreground">
                          {allocationType === "bulk_category" ? "Expense Description / Batch" : "Payee / Ledger Name"}
                        </Label>
                        <Input
                          value={payeeName}
                          onChange={(e) => setPayeeName(e.target.value)}
                          placeholder={
                            allocationType === "bulk_category"
                              ? "e.g. August Mess & Worker Food Batch"
                              : "e.g. ABC Suppliers / Subcontractor"
                          }
                          className="h-8 text-xs"
                        />
                      </div>

                      <div className="space-y-1">
                        <Label className="text-[11px] text-muted-foreground">Bill / Invoice # (Optional)</Label>
                        <Input
                          value={invoiceNumber}
                          onChange={(e) => setInvoiceNumber(e.target.value)}
                          placeholder="e.g. SC-042 or SUB-001"
                          className="h-8 text-xs font-mono"
                        />
                      </div>

                      <div className="space-y-1">
                        <Label className="text-[11px] text-muted-foreground">Payee PAN (9-digit)</Label>
                        <Input
                          value={partyPan}
                          onChange={(e) => setPartyPan(e.target.value)}
                          placeholder="e.g. 300123456"
                          maxLength={9}
                          className="h-8 text-xs font-mono"
                        />
                      </div>
                    </div>

                    {/* Amount, TDS Deducted, Net Calculation */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-2.5 rounded bg-muted/20 border">
                      <div className="space-y-1">
                        <Label className="text-[11px] text-muted-foreground">Gross Amount (NPR)</Label>
                        <Input
                          type="number"
                          value={amount}
                          onChange={(e) => setAmount(e.target.value)}
                          placeholder="50000"
                          className="h-8 text-xs font-mono font-bold"
                        />
                      </div>

                      <div className="space-y-1">
                        <Label className="text-[11px] text-muted-foreground">TDS Deducted (NPR)</Label>
                        <Input
                          type="number"
                          value={tds}
                          onChange={(e) => setTds(e.target.value)}
                          placeholder="750"
                          className="h-8 text-xs font-mono text-red-600"
                        />
                      </div>

                      <div className="space-y-1">
                        <Label className="text-[11px] text-muted-foreground">Net Disbursed (NPR)</Label>
                        <div className="h-8 flex items-center px-3 rounded border bg-background font-mono font-bold text-emerald-600">
                          NPR {fmt(computedNet)}
                        </div>
                      </div>
                    </div>

                    {/* Tally / Swastik Accounting Software Section */}
                    <div className="p-3 rounded border bg-card space-y-2">
                      <span className="font-bold text-foreground flex items-center gap-1.5">
                        <Building2 className="h-3.5 w-3.5 text-purple-600" />
                        Accounting Software (Tally / Swastik) Voucher Sync
                      </span>

                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
                        <div className="space-y-1">
                          <Label className="text-[10px] text-muted-foreground">Software</Label>
                          <Select value={accountingSoftware} onValueChange={(val: any) => setAccountingSoftware(val)}>
                            <SelectTrigger className="h-7 text-xs font-mono">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="tally">TallyPrime</SelectItem>
                              <SelectItem value="swastik">Swastik ERP</SelectItem>
                              <SelectItem value="other">General / Other</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-1">
                          <Label className="text-[10px] text-muted-foreground">Voucher Type</Label>
                          <Select value={voucherType} onValueChange={(val: any) => setVoucherType(val)}>
                            <SelectTrigger className="h-7 text-xs font-mono">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="payment">Payment (PV)</SelectItem>
                              <SelectItem value="bank_payment">Bank Payment (BP)</SelectItem>
                              <SelectItem value="cash_payment">Cash Payment (CP)</SelectItem>
                              <SelectItem value="journal">Journal (JV)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-1">
                          <Label className="text-[10px] text-muted-foreground">Voucher No.</Label>
                          <Input
                            value={accountingVoucherNo}
                            onChange={(e) => setAccountingVoucherNo(e.target.value)}
                            placeholder="PV-2081-0104"
                            className="h-7 text-xs font-mono font-bold"
                          />
                        </div>

                        <div className="space-y-1">
                          <Label className="text-[10px] text-muted-foreground">Bank / Cash Account</Label>
                          <Input
                            value={bankAccount}
                            onChange={(e) => setBankAccount(e.target.value)}
                            placeholder="Nabil Bank Site A/C"
                            className="h-7 text-xs font-mono"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Payment Mode, Cheque No, Notes & Scanned Copy */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="space-y-1">
                        <Label className="text-[11px] text-muted-foreground">Payment Mode</Label>
                        <Select value={mode} onValueChange={(val: any) => setMode(val)}>
                          <SelectTrigger className="h-8 text-xs font-mono">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                            <SelectItem value="connectips">connectIPS / Digital</SelectItem>
                            <SelectItem value="cheque">Cheque</SelectItem>
                            <SelectItem value="cash">Cash</SelectItem>
                            <SelectItem value="mobile_pay">Mobile Pay</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-1">
                        <Label className="text-[11px] text-muted-foreground">Cheque / connectIPS Ref No.</Label>
                        <Input
                          value={chequeNo}
                          onChange={(e) => setChequeNo(e.target.value)}
                          placeholder="e.g. CHQ-99104"
                          className="h-8 text-xs font-mono"
                        />
                      </div>

                      <div className="space-y-1">
                        <Label className="text-[11px] text-muted-foreground">Scanned Voucher / Receipt</Label>
                        <label className="flex items-center justify-center gap-1.5 h-8 px-2 border border-dashed rounded cursor-pointer hover:bg-muted/40 text-xs text-muted-foreground">
                          <Paperclip className="h-3.5 w-3.5" />
                          <span className="truncate">{fileName || "Attach Slip / Cheque"}</span>
                          <input
                            type="file"
                            accept="image/*,.pdf"
                            onChange={handleFileSelect}
                            className="hidden"
                          />
                        </label>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground">Narration / Notes</Label>
                      <Textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Accounting narration or notes for payment voucher..."
                        rows={2}
                        className="text-xs"
                      />
                    </div>
                  </div>

                  <DialogFooter className="p-3 border-t bg-muted/10 flex items-center justify-between">
                    <Button variant="ghost" size="sm" onClick={() => setAddOpen(false)} className="h-7 text-xs">
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleRecordPayment}
                      disabled={createMut.isPending || !amount}
                      className="h-7 text-xs px-5 font-bold"
                    >
                      {createMut.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />} Record Payment
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </>
          )}
        </div>
      </div>

      {/* Main Payments Data Table */}
      {isLoading ? (
        <div className="flex items-center justify-center p-16 text-xs text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading payments...
        </div>
      ) : payments.length === 0 ? (
        <div className="border rounded-lg p-12 text-center space-y-2 bg-card">
          <Inbox className="h-10 w-10 mx-auto text-muted-foreground/40" />
          <p className="text-xs font-semibold text-foreground">No payments recorded matching filter.</p>
          <p className="text-[11px] text-muted-foreground">
            Click "+ Record Payment" or "Bulk Import" to log transactions.
          </p>
        </div>
      ) : (
        <div className="rounded-md border overflow-x-auto bg-card">
          <table className="w-full text-xs font-mono border-collapse">
            <thead className="bg-muted/80 backdrop-blur border-b text-[11px] font-bold">
              <tr>
                <th className="p-2 w-8 text-center">#</th>
                <th className="p-2 w-24">Date (BS/AD)</th>
                <th className="p-2 w-28">Voucher No</th>
                <th className="p-2 w-44">Category / Sub</th>
                <th className="p-2">Payee / Narration</th>
                <th className="p-2 w-24">Mode / Bank</th>
                <th className="p-2 w-28 text-right">Gross (NPR)</th>
                <th className="p-2 w-24 text-right text-red-600">TDS</th>
                <th className="p-2 w-28 text-right font-bold text-emerald-700 dark:text-emerald-300">
                  Net Paid
                </th>
                <th className="p-2 w-16 text-center">Scan</th>
                {canWrite && <th className="p-2 w-12 text-center">Action</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {payments.map((p, idx) => {
                let bsMiti = p.paymentMiti;
                if (!bsMiti) {
                  try {
                    bsMiti = adToBs(p.paymentDate).formatted;
                  } catch {
                    bsMiti = "—";
                  }
                }

                return (
                  <tr key={p.id} className="hover:bg-muted/20 transition-colors">
                    <td className="p-2 text-center text-muted-foreground">{idx + 1}</td>
                    <td className="p-2 whitespace-nowrap">
                      <div className="font-bold text-foreground">{bsMiti}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {format(new Date(p.paymentDate), "yyyy-MM-dd")}
                      </div>
                    </td>
                    <td className="p-2 whitespace-nowrap">
                      {p.accountingVoucherNo ? (
                        <div className="flex flex-col">
                          <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 font-bold w-fit">
                            {p.accountingVoucherNo}
                          </Badge>
                          {p.accountingSoftware && (
                            <span className="text-[9px] text-muted-foreground uppercase mt-0.5">
                              {p.accountingSoftware}
                            </span>
                          )}
                        </div>
                      ) : p.chequeNo ? (
                        <span className="text-[10px] text-muted-foreground font-mono">
                          Chq: {p.chequeNo}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="p-2">
                      <div className="font-bold text-foreground truncate">{p.category || "General"}</div>
                      {p.subCategory && (
                        <div className="text-[10px] text-muted-foreground truncate">
                          ↳ {p.subCategory}
                        </div>
                      )}
                    </td>
                    <td className="p-2">
                      <div className="font-medium text-foreground truncate max-w-[220px]">
                        {p.payeeName}
                      </div>
                      {p.partyPan && (
                        <span className="text-[10px] text-muted-foreground">PAN: {p.partyPan} </span>
                      )}
                      {p.notes && (
                        <div className="text-[10px] text-muted-foreground truncate max-w-[220px]">
                          {p.notes}
                        </div>
                      )}
                    </td>
                    <td className="p-2 whitespace-nowrap">
                      <div className="capitalize text-foreground font-medium">
                        {p.paymentMode.replace(/_/g, " ")}
                      </div>
                      {p.bankAccount && (
                        <div className="text-[10px] text-muted-foreground truncate max-w-[120px]">
                          {p.bankAccount}
                        </div>
                      )}
                    </td>
                    <td className="p-2 text-right font-semibold text-foreground">
                      {fmt(p.amount)}
                    </td>
                    <td className="p-2 text-right text-red-600">
                      {p.tdsDeducted > 0 ? fmt(p.tdsDeducted) : "—"}
                    </td>
                    <td className="p-2 text-right font-bold text-emerald-700 dark:text-emerald-300">
                      {fmt(p.netPaid)}
                    </td>
                    <td className="p-2 text-center">
                      {p.scannedBillUrl ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setViewScanUrl(p.scannedBillUrl)}
                          className="h-6 w-6 text-emerald-600 hover:text-emerald-700"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                      ) : (
                        <span className="text-[10px] text-muted-foreground" title="No scan attached">
                          —
                        </span>
                      )}
                    </td>
                    {canWrite && (
                      <td className="p-2 text-center">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            if (confirm(`Delete payment of NPR ${fmt(p.amount)} to ${p.payeeName}?`)) {
                              deleteMut.mutate({ id: p.id, projectId });
                            }
                          }}
                          className="h-6 w-6 text-muted-foreground hover:text-red-500"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Category Manager Drawer */}
      <CategoryManagerDialog
        projectId={projectId}
        open={catManagerOpen}
        onOpenChange={setCatManagerOpen}
      />

      {/* Bulk Importer Modal */}
      <BulkImportDialog
        projectId={projectId}
        open={bulkImportOpen}
        onOpenChange={setBulkImportOpen}
        onSuccess={() => {
          utils.projectOps.payment.list.invalidate({ projectId });
          utils.projectOps.payment.stats.invalidate({ projectId });
          utils.projectOps.payment.categorySummary.invalidate({ projectId });
        }}
      />

      {/* Scanned Document Viewer Modal */}
      <Dialog open={Boolean(viewScanUrl)} onOpenChange={() => setViewScanUrl(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] p-4 flex flex-col font-sans">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold">Attached Payment Voucher / Receipt</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-auto flex items-center justify-center p-2 bg-muted/20 rounded border min-h-[300px]">
            {viewScanUrl?.startsWith("data:application/pdf") ? (
              <iframe src={viewScanUrl} className="w-full h-[60vh] rounded" title="Payment Voucher PDF" />
            ) : viewScanUrl ? (
              <img src={viewScanUrl} alt="Voucher" className="max-h-[60vh] max-w-full object-contain rounded shadow" />
            ) : null}
          </div>
          <DialogFooter>
            <Button size="sm" onClick={() => setViewScanUrl(null)} className="h-7 text-xs">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
