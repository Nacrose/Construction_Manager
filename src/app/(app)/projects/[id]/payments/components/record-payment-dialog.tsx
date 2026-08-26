"use client";

import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
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
  Plus,
  Loader2,
  Paperclip,
  ChevronsUpDown,
  Check,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { toast } from "sonner";
import { format } from "date-fns";
import { adToBs } from "@/lib/nepali-calendar";
import { NepaliDatePicker } from "@/components/ui/nepali-date-picker";
import { CategoryManagerDialog } from "./category-manager-dialog";

function fmt(n: number) {
  return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

interface RecordPaymentDialogProps {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
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
  onSuccess?: () => void;
}

export function RecordPaymentDialog({
  projectId,
  open,
  onOpenChange,
  initialPayable,
  onSuccess,
}: RecordPaymentDialogProps) {
  const utils = trpc.useUtils();

  // Queries
  const { data: catData } = trpc.paymentCategory.list.useQuery({ projectId });
  const categories = catData?.categories || [];

  // Query all unified project ledger accounts
  const { data: accountsData } = trpc.accounting.ledgerAccounts.useQuery({ projectId });
  const accounts = accountsData?.accounts || [];

  // Filter only payable parties (Vendors, Subcontractors, Staff)
  const registeredPayees = accounts
    .filter((a) => a.type === "vendor" || a.type === "subcontractor" || a.type === "staff")
    .map((a) => ({
      id: a.id,
      name: a.name,
      pan: a.pan || "",
      type: a.type as "vendor" | "subcontractor" | "staff",
      typeLabel:
        a.type === "staff"
          ? "Staff & Employee"
          : a.type === "subcontractor"
          ? "Subcontractor / Labor"
          : "Supplier / Vendor",
      contact: a.phone || "",
    }));

  const [targetProjectId, setTargetProjectId] = useState(projectId);
  const { data: allProjectsData } = trpc.project.list.useQuery();
  const allProjects = allProjectsData?.projects || [];

  // Form states
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

  const [selectedCatId, setSelectedCatId] = useState<string>("");
  const [selectedSubId, setSelectedSubId] = useState<string>("");
  const [isCreatingSub, setIsCreatingSub] = useState(false);
  const [newSubName, setNewSubName] = useState("");
  const [catManagerOpen, setCatManagerOpen] = useState(false);
  const [fileData, setFileData] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  // Auto select default category if exists
  useEffect(() => {
    if (categories.length > 0 && !selectedCatId) {
      setSelectedCatId(categories[0].id);
    }
  }, [categories, selectedCatId]);

  const selectedCategoryObj = categories.find((c) => c.id === selectedCatId || c.name === selectedCatId);
  const subcategoryList = selectedCategoryObj?.children || [];

  // Sync initialPayable if passed
  useEffect(() => {
    if (initialPayable && open) {
      setPayeeName(initialPayable.entityName);
      setPartyPan(initialPayable.entityPan || "");
      setPayeeType(initialPayable.entityType === "subcontractor" ? "subcontractor" : initialPayable.entityType === "staff" ? "staff" : "vendor");
      setInvoiceNumber(initialPayable.billNumber || "");
      setAmount(initialPayable.balanceDue.toString());
      setTds(initialPayable.tdsAmount ? initialPayable.tdsAmount.toString() : "0");
      setShowErpSync(true);
    }
  }, [initialPayable, open]);

  const createSubMut = trpc.paymentCategory.create.useMutation({
    onSuccess: (res) => {
      toast.success(`Subcategory "${res.category.name}" created`);
      utils.paymentCategory.list.invalidate({ projectId });
      setSelectedSubId(res.category.id);
      setIsCreatingSub(false);
      setNewSubName("");
    },
    onError: (err) => toast.error(err.message),
  });

  const createHoExpenseMut = trpc.finance.createHeadOfficeExpense.useMutation({
    onSuccess: () => {
      toast.success("Head Office expense recorded in Day Book!");
      onOpenChange(false);
      setAmount("");
      setTds("0");
      setInvoiceNumber("");
      setNotes("");
      setChequeNo("");
      utils.accounting.dayBook.invalidate();
      utils.finance.orgBankAccounts.invalidate();
      if (onSuccess) onSuccess();
    },
    onError: (err) => toast.error(err.message),
  });

  const createMut = trpc.projectOps.payment.create.useMutation({
    onSuccess: () => {
      toast.success("Payment recorded successfully in Day Book & Ledgers!");
      onOpenChange(false);
      setAmount("");
      setTds("0");
      setTdsPercent("");
      setInvoiceNumber("");
      setNotes("");
      setChequeNo("");
      setFileData(null);
      setFileName(null);
      utils.projectOps.payment.list.invalidate();
      utils.projectOps.payment.stats.invalidate();
      utils.projectOps.payment.outstandingPayables.invalidate();
      utils.accounting.dayBook.invalidate();
      utils.accounting.ledgerAccounts.invalidate();
      utils.accounting.ledgerStatement.invalidate();
      if (onSuccess) onSuccess();
    },
    onError: (err) => {
      toast.error(err.message || "Failed to record payment");
    },
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("File size must be under 5MB");
      return;
    }
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      setFileData(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const computedNet = Math.max(0, (parseFloat(amount) || 0) - (parseFloat(tds) || 0));

  const handleRecordPayment = () => {
    if (!amount || parseFloat(amount) <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }
    if (!payeeName.trim()) {
      toast.error("Please enter payee name or expense particular");
      return;
    }

    const netAmount = parseFloat(amount);
    const tdsVal = parseFloat(tds) || 0;
    const catName = selectedCategoryObj?.name || "Direct Material / Site Supplies";

    // If Head Office is selected or no project exists
    if (targetProjectId === "head_office" || !targetProjectId) {
      createHoExpenseMut.mutate({
        category: catName.toLowerCase().includes("rent")
          ? "office_rent"
          : catName.toLowerCase().includes("audit") || catName.toLowerCase().includes("tax")
          ? "audit_tax"
          : catName.toLowerCase().includes("tender")
          ? "tender_fees"
          : catName.toLowerCase().includes("salary")
          ? "ho_salary"
          : catName.toLowerCase().includes("director")
          ? "director_draw"
          : "other_overhead",
        particulars: `${payeeName.trim()} ${invoiceNumber ? `(#${invoiceNumber})` : ""}`,
        amount: netAmount,
        date,
        miti,
        paymentMode: mode === "cash" ? "cash" : mode === "cheque" ? "cheque" : mode === "connectips" ? "connectips" : "bank_transfer",
        chequeNo: mode === "cheque" ? chequeNo : undefined,
        notes: notes || undefined,
      });
      return;
    }

    createMut.mutate({
      projectId: targetProjectId,
      amount: netAmount,
      tdsDeducted: tdsVal,
      paymentDate: date,
      paymentMode: mode,
      bankAccount: mode !== "cash" ? bankAccount : undefined,
      chequeNo: mode === "cheque" ? chequeNo : undefined,
      payeeName: payeeName.trim(),
      payeeType,
      partyPan: partyPan || undefined,
      category: catName,
      invoiceNumber: invoiceNumber || undefined,
      notes: notes || undefined,
      accountingSoftware: "tally",
      scannedBillUrl: fileData || undefined,
    });
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
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
            {/* Row 0: Target Project */}
            <div className="space-y-1.5 min-w-0">
              <Label className="text-xs font-medium text-gray-300">Target Project (प्रोजेक्ट)</Label>
              <Select value={targetProjectId} onValueChange={setTargetProjectId}>
                <SelectTrigger className="w-full min-w-0 h-11 text-xs bg-[#121820] text-white rounded-xl border-emerald-500/30">
                  <SelectValue placeholder="Select Project" />
                </SelectTrigger>
                <SelectContent className="bg-[#0f141c] border-emerald-500/30 text-xs text-white">
                  <SelectItem value="head_office" className="text-amber-400 font-semibold">
                    🏢 Head Office (कार्यालय खर्च)
                  </SelectItem>
                  {allProjects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      🏗️ {p.name} ({p.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

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
              onClick={() => onOpenChange(false)}
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

      {/* Category Manager Modal */}
      <CategoryManagerDialog
        projectId={projectId}
        open={catManagerOpen}
        onOpenChange={setCatManagerOpen}
      />
    </>
  );
}
