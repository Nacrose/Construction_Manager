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
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { format } from "date-fns";
import { adToBs } from "@/lib/nepali-calendar";
import { NepaliDatePicker } from "@/components/ui/nepali-date-picker";
import { CategoryManagerDialog } from "./category-manager-dialog";
import { formatNpr } from "@/lib/currency";

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
        <DialogContent className="sm:max-w-[760px] w-full p-0 gap-0 bg-card border border-[var(--border)] text-foreground rounded-2xl shadow-2xl overflow-hidden font-sans">
          {/* Header */}
          <div className="px-6 py-4 border-b border-[var(--input)] bg-[#f8fbfe] flex items-center justify-between">
            <div>
              <DialogTitle className="text-base font-bold text-foreground tracking-tight font-sans">
                Record Payment (भुक्तानी दर्ता)
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                Log daily site expenses, vendor payments, or contractor advances.
              </DialogDescription>
            </div>
            {miti && (
              <span className="text-xs font-mono font-bold text-[var(--primary)] px-2.5 py-0.5 rounded-full bg-info/10 border border-[#bae6fd]">
                {miti} BS
              </span>
            )}
          </div>

          {/* Scrollable Form Body */}
          <div className="p-6 space-y-4 text-xs bg-card">
            {/* Row 0: Target Project */}
            <div className="space-y-1.5 min-w-0">
              <Label className="text-[11px] font-semibold text-foreground/80">Target Project (प्रोजेक्ट)</Label>
              <Select value={targetProjectId} onValueChange={setTargetProjectId}>
                <SelectTrigger className="w-full min-w-0 h-9 text-xs bg-card text-foreground rounded-lg border border-[var(--border)] focus:border-[var(--primary)]">
                  <SelectValue placeholder="Select Project" />
                </SelectTrigger>
                <SelectContent className="bg-card border border-[var(--border)] text-xs text-foreground shadow-xl rounded-xl">
                  <SelectItem value="head_office" className="text-amber-600 font-semibold">
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
                <Label className="text-[11px] font-semibold text-foreground/80">Date (मिति)</Label>
                <NepaliDatePicker
                  value={date}
                  onChange={(_d, dateStr) => {
                    if (dateStr) {
                      setDate(dateStr);
                      try {
                        setMiti(adToBs(dateStr).formatted);
                      } catch {}
                    }
                  }}
                  placeholder="Select Nepali date (BS)"
                  className="w-full h-9 text-xs font-mono rounded-lg border border-[var(--border)] bg-card text-foreground"
                />
              </div>

              {/* Paid To (Payee) */}
              <div className="space-y-1.5 min-w-0">
                <div className="flex items-center justify-between">
                  <Label className="text-[11px] font-semibold text-foreground/80">Paid To</Label>
                  {partyPan && (
                    <span className="text-[10px] font-mono text-muted-foreground font-matrix">
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
                        className="w-full h-9 text-xs pr-8 rounded-lg border border-[var(--border)] focus:border-[var(--primary)] bg-card text-foreground truncate"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.preventDefault();
                          setPayeePopoverOpen(!payeePopoverOpen);
                        }}
                        className="absolute right-0 h-9 w-8 p-0 text-muted-foreground/80 hover:text-foreground/80"
                      >
                        <ChevronsUpDown className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </PopoverTrigger>

                  <PopoverContent
                    className="w-[var(--radix-popover-trigger-width)] p-1.5 shadow-xl border border-[var(--border)] bg-card rounded-xl"
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
                            className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-left hover:bg-info/10 hover:text-[var(--primary)] transition cursor-pointer group"
                          >
                            <div className="truncate">
                              <p className="font-medium text-foreground group-hover:text-[var(--primary)] truncate">
                                {p.name}
                              </p>
                              <p className="text-[10px] text-muted-foreground/80">
                                {p.typeLabel} {p.pan ? `• PAN: ${p.pan}` : ""}
                              </p>
                            </div>
                            {payeeName === p.name && (
                              <Check className="h-3.5 w-3.5 text-[var(--primary)] shrink-0" />
                            )}
                          </button>
                        ))}

                      {registeredPayees.filter((p) =>
                        !payeeSearchQuery.trim() ||
                        p.name.toLowerCase().includes(payeeSearchQuery.toLowerCase()) ||
                        (p.pan && p.pan.includes(payeeSearchQuery))
                      ).length === 0 && (
                        <div className="py-2 px-3 text-center text-xs text-muted-foreground">
                          Use <span className="text-[var(--primary)] font-semibold">"{payeeName}"</span> as one-time payee
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
                  <Label className="text-[11px] font-semibold text-foreground/80">Category</Label>
                  <button
                    type="button"
                    onClick={() => setCatManagerOpen(true)}
                    className="text-[10px] text-[var(--primary)] hover:underline font-medium"
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
                  <SelectTrigger className="w-full min-w-0 h-9 text-xs rounded-lg border border-[var(--border)] focus:border-[var(--primary)] bg-card text-foreground">
                    <SelectValue placeholder="Select Category" className="truncate" />
                  </SelectTrigger>
                  <SelectContent className="max-h-60 bg-card border border-[var(--border)] text-foreground rounded-xl shadow-xl">
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id} className="text-xs text-foreground/90">
                        {c.name} {c.nameNp ? `(${c.nameNp})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Subcategory */}
              <div className="space-y-1.5 min-w-0">
                <div className="flex items-center justify-between">
                  <Label className="text-[11px] font-semibold text-foreground/80">Subcategory</Label>
                  {selectedCategoryObj && !isCreatingSub && (
                    <button
                      type="button"
                      onClick={() => setIsCreatingSub(true)}
                      className="text-[10px] text-[var(--primary)] hover:underline font-medium"
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
                      className="h-9 text-xs bg-card border border-[var(--border)] text-foreground rounded-lg flex-1"
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
                      className="h-9 text-xs px-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg shadow-xs"
                    >
                      {createSubMut.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setIsCreatingSub(false)}
                      className="h-9 text-xs px-2 text-muted-foreground/80 hover:text-foreground/80"
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
                    <SelectTrigger className="w-full min-w-0 h-9 text-xs rounded-lg border border-[var(--border)] focus:border-[var(--primary)] bg-card text-foreground disabled:opacity-40">
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
                    <SelectContent className="max-h-56 bg-card border border-[var(--border)] rounded-xl shadow-xl text-foreground">
                      {subcategoryList.map((s) => (
                        <SelectItem key={s.id} value={s.id} className="text-xs text-foreground/90">
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
                  <Label className="text-[11px] font-semibold text-foreground/80">Amount (NPR)</Label>
                  {amount && parseFloat(tds) > 0 && (
                    <span className="text-[10px] text-emerald-700 font-mono font-bold font-matrix">
                      Net: NPR {formatNpr(computedNet)}
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
                  className="w-full h-9 text-xs font-mono font-bold rounded-lg border border-[var(--border)] focus:border-[var(--primary)] bg-card text-foreground"
                />
              </div>

              {/* Payment Mode Selector */}
              <div className="space-y-1.5 min-w-0">
                <Label className="text-[11px] font-semibold text-foreground/80">Payment Mode</Label>
                <div className="flex items-center justify-between p-1 h-9 rounded-lg border border-[var(--border)] bg-muted/60">
                  {[
                    { value: "cash", label: "Cash" },
                    { value: "bank_transfer", label: "Bank" },
                    { value: "cheque", label: "Cheque" },
                    { value: "connectips", label: "Digital" },
                  ].map((item) => (
                    <button
                      type="button"
                      key={item.value}
                      onClick={() => setMode(item.value as any)}
                      className={cn(
                        "flex-1 py-1 text-xs rounded-md font-mono transition text-center",
                        mode === item.value
                          ? "bg-card text-[var(--primary)] font-bold shadow-xs border border-[#bae6fd]"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Contextual Bank / Cheque / Digital Details */}
            {mode !== "cash" && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-3 rounded-xl border border-[var(--border)] bg-[#f8fbfe]">
                <div className="space-y-1 min-w-0">
                  <Label className="text-[11px] font-medium text-foreground/80">
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
                    className="h-9 text-xs font-mono bg-card text-foreground rounded-lg border border-[var(--border)] focus:border-[var(--primary)]"
                  />
                </div>
                <div className="space-y-1 min-w-0 w-full">
                  <Label className="text-[11px] font-medium text-foreground/80">
                    {mode === "connectips" ? "Digital Wallet / Channel" : "Bank Account Used"}
                  </Label>
                  <Select value={bankAccount} onValueChange={setBankAccount}>
                    <SelectTrigger className="w-full min-w-0 h-9 text-xs font-mono bg-card text-foreground rounded-lg border border-[var(--border)] focus:border-[var(--primary)]">
                      <SelectValue placeholder="Select Bank / Channel" className="truncate" />
                    </SelectTrigger>
                    <SelectContent className="max-h-60 text-xs bg-card border border-[var(--border)] text-foreground rounded-xl shadow-xl">
                      {mode === "connectips" ? (
                        <>
                          <SelectItem value="connectIPS (NCHL)">connectIPS (NCHL)</SelectItem>
                          <SelectItem value="eSewa Wallet">eSewa Wallet</SelectItem>
                          <SelectItem value="Khalti Digital Wallet">Khalti Digital Wallet</SelectItem>
                          <SelectItem value="Corporate Mobile Banking">Corporate Mobile Banking</SelectItem>
                        </>
                      ) : (
                        <>
                          <SelectItem value="Nabil Bank Site A/C">Nabil Bank Site A/C</SelectItem>
                          <SelectItem value="Global IME Bank Ltd">Global IME Bank Ltd</SelectItem>
                          <SelectItem value="NIC Asia Bank Ltd">NIC Asia Bank Ltd</SelectItem>
                          <SelectItem value="Rastriya Banijya Bank (RBB)">Rastriya Banijya Bank (RBB)</SelectItem>
                          <SelectItem value="Nepal Investment Mega Bank (NIMB)">Nepal Investment Mega Bank (NIMB)</SelectItem>
                          <SelectItem value="Prabhu Bank Ltd">Prabhu Bank Ltd</SelectItem>
                          <SelectItem value="Himalayan Bank Ltd">Himalayan Bank Ltd</SelectItem>
                          <SelectItem value="Siddhartha Bank Ltd">Siddhartha Bank Ltd</SelectItem>
                          <SelectItem value="Sanima Bank Ltd">Sanima Bank Ltd</SelectItem>
                          <SelectItem value="Everest Bank Ltd">Everest Bank Ltd</SelectItem>
                          <SelectItem value="Laxmi Sunrise Bank">Laxmi Sunrise Bank</SelectItem>
                          <SelectItem value="Kumari Bank Ltd">Kumari Bank Ltd</SelectItem>
                          <SelectItem value="Prime Commercial Bank">Prime Commercial Bank</SelectItem>
                          <SelectItem value="Agriculture Development Bank (ADBL)">ADBL</SelectItem>
                          <SelectItem value="Main Operating Project A/C">Main Operating Project A/C</SelectItem>
                          <SelectItem value="Petty Cash Site A/C">Petty Cash Site A/C</SelectItem>
                        </>
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {/* Optional Details Toggle */}
            <div className="pt-1">
              {!showErpSync ? (
                <button
                  type="button"
                  onClick={() => setShowErpSync(true)}
                  className="text-xs text-muted-foreground hover:text-[var(--primary)] flex items-center gap-1.5 transition font-medium"
                >
                  <Plus className="h-3.5 w-3.5 text-[var(--primary)]" /> Add TDS, Payment Voucher / Slip, or Notes (Optional)
                </button>
              ) : (
                <div className="space-y-3.5 p-4 rounded-xl border border-[var(--border)] bg-[#f8fbfe]">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-foreground/90">Additional Details & Attachments</span>
                    <button
                      type="button"
                      onClick={() => setShowErpSync(false)}
                      className="text-[10px] text-muted-foreground hover:text-foreground/90"
                    >
                      ✕ Close
                    </button>
                  </div>

                  {/* TDS Withholding Section */}
                  <div className="space-y-2 p-3 rounded-lg border border-[var(--border)] bg-card">
                    <div className="flex items-center justify-between">
                      <Label className="text-[11px] font-medium text-foreground/80">
                        TDS Withholding (कर कट्टी)
                      </Label>
                      {parseFloat(tds) > 0 && (
                        <span className="text-[10px] font-mono text-emerald-700 font-bold font-matrix">
                          Deduct: NPR {formatNpr(parseFloat(tds))}
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {/* TDS Percentage with Quick Presets */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-muted-foreground">TDS Rate (%)</span>
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
                                className={cn(
                                  "px-2 py-0.5 text-[10px] font-mono rounded border transition",
                                  tdsPercent === preset.val.toString()
                                    ? "bg-amber-500 text-foreground font-bold border-amber-500 shadow-xs"
                                    : "bg-muted border-[var(--border)] text-muted-foreground hover:text-foreground"
                                )}
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
                            className="h-9 text-xs font-mono bg-card text-foreground pr-6 rounded-lg border border-[var(--border)] focus:border-[var(--primary)]"
                          />
                          <span className="absolute right-2.5 top-2.5 text-[10px] text-muted-foreground/80 font-bold">%</span>
                        </div>
                      </div>

                      {/* Direct TDS Amount (NPR) */}
                      <div className="space-y-1">
                        <span className="text-[10px] text-muted-foreground">TDS Amount (NPR)</span>
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
                          className="h-9 text-xs font-mono bg-card text-foreground rounded-lg border border-[var(--border)] focus:border-[var(--primary)]"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Upload Payment Voucher */}
                  <div className="space-y-1">
                    <Label className="text-[11px] text-foreground/80">
                      Upload Payment Voucher / Slip / Cheque
                    </Label>
                    <label className="flex items-center justify-center gap-2 h-9 px-3 border border-dashed border-[var(--border)] rounded-lg cursor-pointer hover:bg-muted text-xs text-muted-foreground transition">
                      <Paperclip className="h-3.5 w-3.5 text-[var(--primary)] shrink-0" />
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
                    <Label className="text-[11px] text-foreground/80">Narration / Notes (कैफियत)</Label>
                    <Input
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="e.g. Being payment disbursed for site expenses..."
                      className="h-9 text-xs bg-card text-foreground rounded-lg border border-[var(--border)] focus:border-[var(--primary)]"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Sticky Footer with 3D Amber CTA */}
          <div className="flex items-center justify-end gap-2.5 px-6 py-3.5 border-t border-[var(--input)] bg-[#f8fbfe] shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="h-8 text-xs rounded-lg px-4 border-[var(--border)] text-muted-foreground hover:bg-muted"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleRecordPayment}
              disabled={createMut.isPending || !amount}
              className="amber-cta-btn h-8 text-xs px-5 font-bold text-white rounded-lg shadow-sm transition-all"
            >
              {createMut.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />} Record Payment (भौचर दर्ता)
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
