"use client";

import { useState, useEffect } from "react";
import * as XLSX from "@e965/xlsx";
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
  ChevronsUpDown,
  Check,
  ChevronDown,
  ChevronRight,
  User,
  Truck,
  HardHat,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { toast } from "sonner";
import { format } from "date-fns";
import { adToBs } from "@/lib/nepali-calendar";
import { NepaliDatePicker } from "@/components/ui/nepali-date-picker";
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
  isDialogOpen,
  onDialogOpenChange,
}: {
  projectId: string;
  canWrite?: boolean;
  initialPayable?: {
    entityType: "vendor" | "subcontractor" | "staff";
    entityId: string;
    entityName: string;
    entityPan?: string | null;
    billNumber: string;
    balanceDue: number;
    tdsAmount: number;
    category: string;
  } | null;
  onClearInitialPayable?: () => void;
  isDialogOpen?: boolean;
  onDialogOpenChange?: (open: boolean) => void;
}) {
  const utils = trpc.useUtils();

  // Dialog states
  const [internalAddOpen, setInternalAddOpen] = useState(false);
  const addOpen = isDialogOpen !== undefined ? isDialogOpen : internalAddOpen;
  const setAddOpen = onDialogOpenChange !== undefined ? onDialogOpenChange : setInternalAddOpen;
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

  // Registered Entities in project for Searchable Payee Dropdown
  const { data: suppliersData } = trpc.partner.listSuppliers.useQuery({ projectId });
  const { data: subcontractorsData } = trpc.partner.listSubcontractors.useQuery({ projectId });
  const { data: staffData } = trpc.hr.list.useQuery({ projectId, status: "active" });

  const registeredPayees = [
    ...(suppliersData?.suppliers || []).map((s) => ({
      id: s.id,
      name: s.name,
      pan: s.pan || "",
      type: "vendor" as const,
      typeLabel: "Supplier / Vendor",
      contact: s.phone || s.contact || "",
    })),
    ...(subcontractorsData?.subcontractors || []).map((sub) => ({
      id: sub.id,
      name: sub.name,
      pan: sub.pan || "",
      type: "subcontractor" as const,
      typeLabel: "Subcontractor",
      contact: sub.phone || sub.contact || "",
    })),
    ...(staffData && "staff" in staffData ? staffData.staff : []).map((st) => ({
      id: st.id,
      name: st.name,
      pan: st.pan || "",
      type: "staff" as const,
      typeLabel: "Staff / Worker",
      contact: st.phone || st.designation || "",
    })),
  ];

  // Form states for Record Payment
  const [allocationType, setAllocationType] = useState<"specific_payee" | "bulk_category" | "advance">("specific_payee");
  const [payeeType, setPayeeType] = useState<"vendor" | "subcontractor" | "supplier" | "staff" | "other">("vendor");
  const [payeeName, setPayeeName] = useState("");
  const [partyPan, setPartyPan] = useState("");
  const [payeePopoverOpen, setPayeePopoverOpen] = useState(false);
  const [payeeSearchQuery, setPayeeSearchQuery] = useState("");
  const [showErpSync, setShowErpSync] = useState(false);
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [amount, setAmount] = useState("");
  const [tds, setTds] = useState("0");
  const [tdsPercent, setTdsPercent] = useState("");
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
    setTdsPercent("");
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

                <DialogContent className="sm:max-w-[560px] max-h-[85vh] flex flex-col p-0 gap-0 bg-[#0c1015] border border-emerald-500/20 shadow-[0_0_60px_rgba(0,255,102,0.08)] rounded-3xl font-sans overflow-hidden">
                  {/* Premium Header */}
                  <div className="px-6 pt-6 pb-4 shrink-0 text-center relative border-b border-white/5">
                    <DialogTitle className="text-xl font-bold text-white tracking-tight">
                      Record Payment
                    </DialogTitle>
                    <DialogDescription className="text-xs text-gray-400 mt-0.5">
                      Log daily site expenses, vendor payments, or contractor advances.
                    </DialogDescription>
                    {miti && (
                      <span className="absolute right-6 top-6 text-xs font-mono font-medium text-emerald-400 px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 shadow-[0_0_10px_rgba(0,255,102,0.2)]">
                        {miti} BS
                      </span>
                    )}
                  </div>

                  {/* Scrollable Form Body */}
                  <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4 text-xs custom-scrollbar">
                    {/* Row 1: Date & Paid To */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Date (First Field) */}
                      <div className="space-y-1.5 min-w-0">
                        <Label className="text-xs font-medium text-gray-300">Date (मिति)</Label>
                        <NepaliDatePicker
                          value={date}
                          onChange={(d, dateStr) => {
                            if (dateStr) {
                              setDate(dateStr);
                              try {
                                setMiti(adToBs(dateStr).formatted);
                              } catch {}
                            }
                          }}
                          placeholder="Select Nepali date (BS)"
                          className="w-full h-11 text-xs font-mono rounded-xl border-emerald-500/30 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20 bg-[#121820] text-white transition-all shadow-[0_0_15px_rgba(0,255,102,0.03)]"
                        />
                      </div>

                      {/* Paid To (Payee) */}
                      <div className="space-y-1.5 min-w-0">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs font-medium text-gray-300">Paid To</Label>
                          {partyPan && (
                            <span className="text-[10px] font-mono text-emerald-400/80">
                              PAN: {partyPan}
                            </span>
                          )}
                        </div>

                        <Popover open={payeePopoverOpen} onOpenChange={setPayeePopoverOpen}>
                          <PopoverTrigger asChild>
                            <div className="relative flex items-center w-full">
                              <Input
                                value={payeeName}
                                onChange={(e) => {
                                  setPayeeName(e.target.value);
                                  setPayeeSearchQuery(e.target.value);
                                  if (!payeePopoverOpen) setPayeePopoverOpen(true);
                                }}
                                onFocus={() => setPayeePopoverOpen(true)}
                                placeholder="Search payee or type..."
                                className="w-full h-11 text-xs pr-8 rounded-xl border-emerald-500/30 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20 bg-[#121820] text-white truncate shadow-[0_0_15px_rgba(0,255,102,0.03)] transition-all"
                              />
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={(e) => {
                                  e.preventDefault();
                                  setPayeePopoverOpen(!payeePopoverOpen);
                                }}
                                className="absolute right-0 h-11 w-8 p-0 text-gray-400 hover:text-white"
                              >
                                <ChevronsUpDown className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </PopoverTrigger>

                          <PopoverContent
                            className="w-[var(--radix-popover-trigger-width)] p-1.5 shadow-[0_20px_50px_rgba(0,0,0,0.8)] border border-emerald-500/30 bg-[#0f141c] rounded-2xl"
                            align="start"
                            sideOffset={6}
                            onOpenAutoFocus={(e) => e.preventDefault()}
                          >
                            <div className="max-h-48 overflow-y-auto space-y-1 text-xs custom-scrollbar">
                              {registeredPayees
                                .filter((p) =>
                                  !payeeSearchQuery.trim() ||
                                  p.name.toLowerCase().includes(payeeSearchQuery.toLowerCase()) ||
                                  (p.pan && p.pan.includes(payeeSearchQuery))
                                )
                                .map((p) => (
                                  <button
                                    key={`${p.type}-${p.id}`}
                                    type="button"
                                    onClick={() => {
                                      setPayeeName(p.name);
                                      if (p.pan) setPartyPan(p.pan);
                                      setPayeeType(p.type);
                                      setPayeePopoverOpen(false);
                                    }}
                                    className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-left hover:bg-emerald-500/15 hover:text-emerald-400 transition cursor-pointer group"
                                  >
                                    <div className="truncate">
                                      <p className="font-medium text-white group-hover:text-emerald-400 truncate">
                                        {p.name}
                                      </p>
                                      <p className="text-[10px] text-gray-400">
                                        {p.typeLabel} {p.pan ? `• PAN: ${p.pan}` : ""}
                                      </p>
                                    </div>
                                    {payeeName === p.name && (
                                      <Check className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                                    )}
                                  </button>
                                ))}

                              {registeredPayees.filter((p) =>
                                !payeeSearchQuery.trim() ||
                                p.name.toLowerCase().includes(payeeSearchQuery.toLowerCase()) ||
                                (p.pan && p.pan.includes(payeeSearchQuery))
                              ).length === 0 && (
                                <div className="py-2.5 px-3 text-center text-xs text-gray-400">
                                  Use <span className="text-emerald-400 font-semibold">"{payeeName}"</span> as one-time payee
                                </div>
                              )}
                            </div>
                          </PopoverContent>
                        </Popover>
                      </div>
                    </div>

                    {/* Row 2: Category & Subcategory */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Category */}
                      <div className="space-y-1.5 min-w-0">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs font-medium text-gray-300">Category</Label>
                          <button
                            type="button"
                            onClick={() => setCatManagerOpen(true)}
                            className="text-[10px] text-emerald-400 hover:underline"
                          >
                            + Manage
                          </button>
                        </div>
                        <Select
                          value={selectedCatId}
                          onValueChange={(val) => {
                            setSelectedCatId(val);
                            setSelectedSubId("");
                          }}
                        >
                          <SelectTrigger className="w-full min-w-0 h-11 text-xs rounded-xl border-emerald-500/30 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20 bg-[#121820] text-white shadow-[0_0_15px_rgba(0,255,102,0.03)]">
                            <SelectValue placeholder="Select Category" className="truncate" />
                          </SelectTrigger>
                          <SelectContent className="max-h-60 bg-[#0f141c] border-emerald-500/30 rounded-2xl">
                            {categories.map((c) => (
                              <SelectItem key={c.id} value={c.id} className="text-xs text-gray-200 focus:bg-emerald-500/20 focus:text-white">
                                {c.name} {c.nameNp ? `(${c.nameNp})` : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Subcategory */}
                      <div className="space-y-1.5 min-w-0">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs font-medium text-gray-300">Subcategory</Label>
                          {selectedCategoryObj && !isCreatingSub && (
                            <button
                              type="button"
                              onClick={() => setIsCreatingSub(true)}
                              className="text-[10px] text-emerald-400 hover:underline"
                            >
                              + New Sub
                            </button>
                          )}
                        </div>

                        {isCreatingSub ? (
                          <div className="flex items-center gap-1.5">
                            <Input
                              placeholder="e.g. Fuel / Mess / Repair"
                              value={newSubName}
                              onChange={(e) => setNewSubName(e.target.value)}
                              className="h-11 text-xs bg-[#121820] border-emerald-500/30 text-white rounded-xl flex-1"
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
                              className="h-11 text-xs px-3 bg-[#00ff66] hover:bg-[#00e65c] text-black font-bold rounded-xl shadow-[0_0_12px_rgba(0,255,102,0.4)]"
                            >
                              {createSubMut.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setIsCreatingSub(false)}
                              className="h-11 text-xs px-2 text-gray-400 hover:text-white"
                            >
                              ✕
                            </Button>
                          </div>
                        ) : (
                          <Select
                            value={selectedSubId}
                            onValueChange={setSelectedSubId}
                            disabled={!selectedCategoryObj || subcategoryList.length === 0}
                          >
                            <SelectTrigger className="w-full min-w-0 h-11 text-xs rounded-xl border-emerald-500/30 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20 bg-[#121820] text-white shadow-[0_0_15px_rgba(0,255,102,0.03)] disabled:opacity-40">
                              <SelectValue
                                placeholder={
                                  !selectedCategoryObj
                                    ? "Select Category First"
                                    : subcategoryList.length === 0
                                    ? "No subcategories (Optional)"
                                    : "-- Select Subcategory --"
                                }
                                className="truncate"
                              />
                            </SelectTrigger>
                            <SelectContent className="max-h-56 bg-[#0f141c] border-emerald-500/30 rounded-2xl">
                              {subcategoryList.map((s) => (
                                <SelectItem key={s.id} value={s.id} className="text-xs text-gray-200 focus:bg-emerald-500/20 focus:text-white">
                                  {s.name} {s.nameNp ? `(${s.nameNp})` : ""}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                    </div>

                    {/* Row 3: Amount & Payment Mode */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
                      {/* Amount */}
                      <div className="space-y-1.5 min-w-0">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs font-medium text-gray-300">Amount (NPR)</Label>
                          {amount && parseFloat(tds) > 0 && (
                            <span className="text-[10px] text-emerald-400 font-mono font-semibold">
                              Net: NPR {fmt(computedNet)}
                            </span>
                          )}
                        </div>
                        <Input
                          type="number"
                          value={amount}
                          onChange={(e) => {
                            const newAmt = e.target.value;
                            setAmount(newAmt);
                            const gross = parseFloat(newAmt) || 0;
                            const pVal = parseFloat(tdsPercent) || 0;
                            if (pVal > 0) {
                              setTds(((gross * pVal) / 100).toFixed(2));
                            }
                          }}
                          placeholder="e.g. 50000"
                          className="w-full h-11 text-xs font-mono font-bold rounded-xl border-emerald-500/30 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20 bg-[#121820] text-white shadow-[0_0_15px_rgba(0,255,102,0.03)]"
                        />
                      </div>

                      {/* Payment Mode Selector */}
                      <div className="space-y-1.5 min-w-0">
                        <Label className="text-xs font-medium text-gray-300">Payment Mode</Label>
                        <div className="flex items-center justify-between p-2 h-11 rounded-xl border border-emerald-500/30 bg-[#121820]">
                          {[
                            { value: "cash", label: "Cash" },
                            { value: "bank_transfer", label: "Bank" },
                            { value: "cheque", label: "Cheque" },
                            { value: "connectips", label: "Digital" },
                          ].map((item) => (
                            <label
                              key={item.value}
                              onClick={() => setMode(item.value as any)}
                              className="flex items-center gap-1.5 cursor-pointer text-xs text-gray-300 hover:text-white"
                            >
                              <div
                                className={`h-3.5 w-3.5 rounded-full border flex items-center justify-center transition-all ${
                                  mode === item.value
                                    ? "border-emerald-400 bg-emerald-500/20 shadow-[0_0_8px_rgba(0,255,102,0.5)]"
                                    : "border-gray-600"
                                }`}
                              >
                                {mode === item.value && (
                                  <div className="h-1.5 w-1.5 rounded-full bg-[#00ff66]" />
                                )}
                              </div>
                              <span className={mode === item.value ? "font-bold text-white" : "text-gray-400"}>
                                {item.label}
                              </span>
                            </label>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Contextual Bank / Cheque / Digital Details */}
                    {mode !== "cash" && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-3.5 rounded-2xl border border-emerald-500/30 bg-[#121820] shadow-[0_0_20px_rgba(0,255,102,0.04)] transition-all">
                        <div className="space-y-1 min-w-0">
                          <Label className="text-[11px] font-medium text-gray-300">
                            {mode === "cheque"
                              ? "Cheque Number"
                              : mode === "connectips"
                              ? "Digital Txn / Ref No."
                              : "Bank Reference / Txn No."}
                          </Label>
                          <Input
                            value={chequeNo}
                            onChange={(e) => setChequeNo(e.target.value)}
                            placeholder={
                              mode === "cheque"
                                ? "e.g. CHQ-99104"
                                : mode === "connectips"
                                ? "e.g. TXN-881923"
                                : "e.g. REF-44120"
                            }
                            className="h-10 text-xs font-mono bg-[#0c1015] text-white rounded-xl border-emerald-500/30 focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400/20"
                          />
                        </div>
                        <div className="space-y-1 min-w-0 w-full">
                          <Label className="text-[11px] font-medium text-gray-300">
                            {mode === "connectips" ? "Digital Wallet / Channel" : "Bank Account Used"}
                          </Label>
                          <Select value={bankAccount} onValueChange={setBankAccount}>
                            <SelectTrigger className="w-full min-w-0 h-10 text-xs font-mono bg-[#0c1015] text-white rounded-xl border-emerald-500/30 focus:border-emerald-400">
                              <SelectValue placeholder="Select Bank / Channel" className="truncate" />
                            </SelectTrigger>
                            <SelectContent className="max-h-60 text-xs bg-[#0f141c] border-emerald-500/30 rounded-2xl">
                              {mode === "connectips" ? (
                                <>
                                  <SelectItem value="connectIPS (NCHL)" className="text-gray-200 focus:bg-emerald-500/20 focus:text-white">connectIPS (NCHL)</SelectItem>
                                  <SelectItem value="eSewa Wallet" className="text-gray-200 focus:bg-emerald-500/20 focus:text-white">eSewa Wallet</SelectItem>
                                  <SelectItem value="Khalti Digital Wallet" className="text-gray-200 focus:bg-emerald-500/20 focus:text-white">Khalti Digital Wallet</SelectItem>
                                  <SelectItem value="Corporate Mobile Banking" className="text-gray-200 focus:bg-emerald-500/20 focus:text-white">Corporate Mobile Banking</SelectItem>
                                </>
                              ) : (
                                <>
                                  <SelectItem value="Nabil Bank Site A/C" className="text-gray-200 focus:bg-emerald-500/20 focus:text-white">Nabil Bank Site A/C</SelectItem>
                                  <SelectItem value="Global IME Bank Ltd" className="text-gray-200 focus:bg-emerald-500/20 focus:text-white">Global IME Bank Ltd</SelectItem>
                                  <SelectItem value="NIC Asia Bank Ltd" className="text-gray-200 focus:bg-emerald-500/20 focus:text-white">NIC Asia Bank Ltd</SelectItem>
                                  <SelectItem value="Rastriya Banijya Bank (RBB)" className="text-gray-200 focus:bg-emerald-500/20 focus:text-white">Rastriya Banijya Bank (RBB)</SelectItem>
                                  <SelectItem value="Nepal Investment Mega Bank (NIMB)" className="text-gray-200 focus:bg-emerald-500/20 focus:text-white">Nepal Investment Mega Bank (NIMB)</SelectItem>
                                  <SelectItem value="Prabhu Bank Ltd" className="text-gray-200 focus:bg-emerald-500/20 focus:text-white">Prabhu Bank Ltd</SelectItem>
                                  <SelectItem value="Himalayan Bank Ltd" className="text-gray-200 focus:bg-emerald-500/20 focus:text-white">Himalayan Bank Ltd</SelectItem>
                                  <SelectItem value="Siddhartha Bank Ltd" className="text-gray-200 focus:bg-emerald-500/20 focus:text-white">Siddhartha Bank Ltd</SelectItem>
                                  <SelectItem value="Sanima Bank Ltd" className="text-gray-200 focus:bg-emerald-500/20 focus:text-white">Sanima Bank Ltd</SelectItem>
                                  <SelectItem value="Everest Bank Ltd" className="text-gray-200 focus:bg-emerald-500/20 focus:text-white">Everest Bank Ltd</SelectItem>
                                  <SelectItem value="Laxmi Sunrise Bank" className="text-gray-200 focus:bg-emerald-500/20 focus:text-white">Laxmi Sunrise Bank</SelectItem>
                                  <SelectItem value="Kumari Bank Ltd" className="text-gray-200 focus:bg-emerald-500/20 focus:text-white">Kumari Bank Ltd</SelectItem>
                                  <SelectItem value="Prime Commercial Bank" className="text-gray-200 focus:bg-emerald-500/20 focus:text-white">Prime Commercial Bank</SelectItem>
                                  <SelectItem value="Agriculture Development Bank (ADBL)" className="text-gray-200 focus:bg-emerald-500/20 focus:text-white">ADBL</SelectItem>
                                  <SelectItem value="Main Operating Project A/C" className="text-gray-200 focus:bg-emerald-500/20 focus:text-white">Main Operating Project A/C</SelectItem>
                                  <SelectItem value="Petty Cash Site A/C" className="text-gray-200 focus:bg-emerald-500/20 focus:text-white">Petty Cash Site A/C</SelectItem>
                                </>
                              )}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    )}

                    {/* Discreet Optional Details Toggle */}
                    <div className="pt-1">
                      {!showErpSync ? (
                        <button
                          type="button"
                          onClick={() => setShowErpSync(true)}
                          className="text-xs text-gray-400 hover:text-emerald-400 flex items-center gap-1.5 transition font-medium"
                        >
                          <Plus className="h-3.5 w-3.5 text-emerald-400" /> Add TDS, Payment Voucher / Slip, or Notes (Optional)
                        </button>
                      ) : (
                        <div className="space-y-3.5 p-4 rounded-2xl border border-emerald-500/20 bg-[#121820]/90">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-white">Additional Details & Attachments</span>
                            <button
                              type="button"
                              onClick={() => setShowErpSync(false)}
                              className="text-[10px] text-gray-400 hover:text-white"
                            >
                              ✕ Close
                            </button>
                          </div>

                          {/* TDS Withholding Section */}
                          <div className="space-y-2 p-3 rounded-xl border border-emerald-500/20 bg-[#0c1015]">
                            <div className="flex items-center justify-between">
                              <Label className="text-[11px] font-medium text-gray-300">
                                TDS Withholding (कर कट्टी)
                              </Label>
                              {parseFloat(tds) > 0 && (
                                <span className="text-[10px] font-mono text-emerald-400 font-bold">
                                  Deduct: NPR {fmt(parseFloat(tds))}
                                </span>
                              )}
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              {/* TDS Percentage with Quick Presets */}
                              <div className="space-y-1">
                                <div className="flex items-center justify-between">
                                  <span className="text-[10px] text-gray-400">TDS Rate (%)</span>
                                  <div className="flex items-center gap-1">
                                    {[
                                      { label: "1.5%", val: 1.5 },
                                      { label: "10%", val: 10 },
                                      { label: "15%", val: 15 },
                                    ].map((preset) => (
                                      <button
                                        key={preset.val}
                                        type="button"
                                        onClick={() => {
                                          setTdsPercent(preset.val.toString());
                                          const gross = parseFloat(amount) || 0;
                                          setTds(((gross * preset.val) / 100).toFixed(2));
                                        }}
                                        className={`px-2 py-0.5 text-[10px] font-mono rounded-lg border transition ${
                                          tdsPercent === preset.val.toString()
                                            ? "bg-[#00ff66] text-black font-bold border-[#00ff66] shadow-[0_0_8px_rgba(0,255,102,0.4)]"
                                            : "bg-[#121820] border-white/10 text-gray-400 hover:text-white hover:border-white/20"
                                        }`}
                                      >
                                        {preset.label}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                                <div className="relative">
                                  <Input
                                    type="number"
                                    step="0.1"
                                    value={tdsPercent}
                                    onChange={(e) => {
                                      const p = e.target.value;
                                      setTdsPercent(p);
                                      const gross = parseFloat(amount) || 0;
                                      const pVal = parseFloat(p) || 0;
                                      setTds(pVal > 0 ? ((gross * pVal) / 100).toFixed(2) : "0");
                                    }}
                                    placeholder="e.g. 1.5"
                                    className="h-9 text-xs font-mono bg-[#121820] text-white pr-6 rounded-xl border-emerald-500/30 focus:border-emerald-400"
                                  />
                                  <span className="absolute right-2.5 top-2.5 text-[10px] text-gray-400 font-bold">%</span>
                                </div>
                              </div>

                              {/* Direct TDS Amount (NPR) */}
                              <div className="space-y-1">
                                <span className="text-[10px] text-gray-400">TDS Amount (NPR)</span>
                                <Input
                                  type="number"
                                  value={tds}
                                  onChange={(e) => {
                                    const a = e.target.value;
                                    setTds(a);
                                    const gross = parseFloat(amount) || 0;
                                    const aVal = parseFloat(a) || 0;
                                    if (gross > 0 && aVal > 0) {
                                      setTdsPercent(((aVal / gross) * 100).toFixed(2));
                                    } else {
                                      setTdsPercent("");
                                    }
                                  }}
                                  placeholder="0.00"
                                  className="h-9 text-xs font-mono bg-[#121820] text-white rounded-xl border-emerald-500/30 focus:border-emerald-400"
                                />
                              </div>
                            </div>
                          </div>

                          {/* Upload Payment Voucher */}
                          <div className="space-y-1">
                            <Label className="text-[11px] text-gray-300">
                              Upload Payment Voucher / Slip / Cheque
                            </Label>
                            <label className="flex items-center justify-center gap-2 h-10 px-3 border border-dashed border-emerald-500/40 rounded-xl cursor-pointer hover:bg-emerald-500/10 text-xs text-gray-300 hover:text-white transition">
                              <Paperclip className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                              <span className="truncate">
                                {fileName || "Attach signed voucher, cheque copy, or transfer slip (PDF/Image)"}
                              </span>
                              <input
                                type="file"
                                accept="image/*,.pdf"
                                onChange={handleFileSelect}
                                className="hidden"
                              />
                            </label>
                          </div>

                          {/* Notes */}
                          <div className="space-y-1">
                            <Label className="text-[11px] text-gray-300">Narration / Notes (कैफियत)</Label>
                            <Input
                              value={notes}
                              onChange={(e) => setNotes(e.target.value)}
                              placeholder="e.g. Being payment disbursed for site expenses..."
                              className="h-9 text-xs bg-[#0c1015] text-white rounded-xl border-emerald-500/30 focus:border-emerald-400"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Sticky Footer with Glowing Pill Buttons */}
                  <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-white/5 bg-[#0c1015] shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setAddOpen(false)}
                      className="h-10 text-xs rounded-xl px-5 text-gray-400 hover:text-white hover:bg-white/5"
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleRecordPayment}
                      disabled={createMut.isPending || !amount}
                      className="h-10 text-xs px-6 font-bold bg-[#00ff66] text-black hover:bg-[#00e65c] shadow-[0_0_25px_rgba(0,255,102,0.4)] rounded-xl transition-all"
                    >
                      {createMut.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />} Record Payment
                    </Button>
                  </div>
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
