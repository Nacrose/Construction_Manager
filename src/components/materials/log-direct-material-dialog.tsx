"use client";

import { useState, useMemo, useEffect } from "react";
import { trpc } from "@/lib/trpc-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Truck,
  CheckCircle2,
  Loader2,
  Building,
  Tag,
  X,
  Coins,
  Layers,
  Search,
  FileCheck,
  Clock,
  Upload,
  FileText,
  Calculator,
} from "lucide-react";
import { NepaliDatePicker } from "@/components/ui/nepali-date-picker";
import { format } from "date-fns";
import { adToBs } from "@/lib/nepali-calendar";
import { toast } from "sonner";

interface LogDirectMaterialDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultProjectId?: string;
  onSuccess?: () => void;
}

export function LogDirectMaterialDialog({
  open,
  onOpenChange,
  defaultProjectId,
  onSuccess,
}: LogDirectMaterialDialogProps) {
  const utils = trpc.useUtils();

  // Queries
  const { data: projectsData } = trpc.project.list.useQuery();
  const projects = projectsData?.projects || [];

  const [selectedProjectId, setSelectedProjectId] = useState<string>(
    defaultProjectId || ""
  );

  const activeProjectId = selectedProjectId || (projects[0]?.id ?? "");

  const { data: orgBanksData } = trpc.finance.orgBankAccounts.useQuery();
  const bankAccounts = orgBanksData?.accounts || [];

  // Form State: Date & Miti
  const [date, setDate] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [miti, setMiti] = useState(() => {
    try {
      return adToBs(new Date()).formatted;
    } catch {
      return "";
    }
  });

  // 1. Supplier / Vendor Selection
  const [vendorSearch, setVendorSearch] = useState("");
  const [selectedVendor, setSelectedVendor] = useState<any | null>(null);
  const [customVendorName, setCustomVendorName] = useState("");

  const { data: ledgerAccountsData } = trpc.accounting.ledgerAccounts.useQuery(
    { projectId: activeProjectId },
    { enabled: !!activeProjectId && !selectedVendor }
  );

  const vendorSuggestions = useMemo(() => {
    if (!ledgerAccountsData?.accounts || selectedVendor) return [];
    return ledgerAccountsData.accounts.filter(
      (a) =>
        (a.type === "vendor" || a.type === "subcontractor") &&
        (!vendorSearch.trim() ||
          a.name.toLowerCase().includes(vendorSearch.toLowerCase()) ||
          (a.pan && a.pan.includes(vendorSearch)))
    );
  }, [ledgerAccountsData, vendorSearch, selectedVendor]);

  const handleSelectVendor = (v: any) => {
    setSelectedVendor(v);
    setCustomVendorName(v.name);
    setVendorSearch("");
  };

  // 2. 3-Tier Hierarchy:
  // Tier 1: Category -> Tier 2: Material Name -> Tier 3: Specification / Grade
  const { data: taxonomyData } = trpc.catalogV2.getCatalogTaxonomy.useQuery({
    scope: "global",
  });

  const taxonomy = taxonomyData?.taxonomy || {};
  const categories = useMemo(() => Object.keys(taxonomy), [taxonomy]);

  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [selectedMaterialName, setSelectedMaterialName] = useState<string>("");
  const [selectedSpecObj, setSelectedSpecObj] = useState<any | null>(null);

  const materialsInCategory = useMemo(() => {
    if (!selectedCategory || !taxonomy[selectedCategory]) return [];
    return Object.keys(taxonomy[selectedCategory]);
  }, [taxonomy, selectedCategory]);

  const specsForMaterial = useMemo(() => {
    if (!selectedCategory || !selectedMaterialName || !taxonomy[selectedCategory]?.[selectedMaterialName]) {
      return [];
    }
    return taxonomy[selectedCategory][selectedMaterialName];
  }, [taxonomy, selectedCategory, selectedMaterialName]);

  // Specifications
  const [company, setCompany] = useState("");
  const [remarks, setRemarks] = useState("");
  const [unit, setUnit] = useState("Bags");
  const [quantity, setQuantity] = useState("");
  const [rate, setRate] = useState("");
  const [totalAmount, setTotalAmount] = useState("");

  // Rate mode: Inclusive vs Exclusive
  const [vatCalculationMode, setVatCalculationMode] = useState<"inclusive" | "exclusive">("inclusive");

  useEffect(() => {
    if (categories.length > 0 && !selectedCategory) {
      const defaultCat = categories.find((c) => c.toLowerCase().includes("cement")) || categories[0];
      setSelectedCategory(defaultCat);
    }
  }, [categories, selectedCategory]);

  useEffect(() => {
    if (materialsInCategory.length > 0 && (!selectedMaterialName || !materialsInCategory.includes(selectedMaterialName))) {
      setSelectedMaterialName(materialsInCategory[0]);
    }
  }, [materialsInCategory, selectedMaterialName]);

  useEffect(() => {
    if (specsForMaterial.length > 0) {
      const first = specsForMaterial[0];
      setSelectedSpecObj(first);
      if (first.unit) setUnit(first.unit);
      if (first.rate > 0) setRate(first.rate.toString());
    }
  }, [specsForMaterial]);

  const handleSelectTier3Spec = (specId: string) => {
    const item = specsForMaterial.find((i) => i.id === specId);
    if (item) {
      setSelectedSpecObj(item);
      if (item.unit) setUnit(item.unit);
      if (item.rate > 0) {
        setRate(item.rate.toString());
        const q = parseFloat(quantity) || 0;
        if (q > 0) setTotalAmount((q * item.rate).toString());
      }
    }
  };

  // 3. Statutory Tax & VAT Status
  const [billStatus, setBillStatus] = useState<"received" | "pending" | "non_vat">("pending");
  const isVatBill = billStatus === "received" || billStatus === "pending";
  const [isTdsDeductible, setIsTdsDeductible] = useState(false);
  const [tdsPercent, setTdsPercent] = useState("1.5");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [challanNo, setChallanNo] = useState("");

  // File Upload State (Scan / PDF / Photo)
  const [fileData, setFileData] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error("File size must be under 10MB");
      return;
    }
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      setFileData(reader.result as string);
      toast.success(`Attached: ${file.name}`);
    };
    reader.readAsDataURL(file);
  };

  // Transport File Upload State
  const [transportFileData, setTransportFileData] = useState<string | null>(null);
  const [transportFileName, setTransportFileName] = useState<string | null>(null);

  const handleTransportFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error("File size must be under 10MB");
      return;
    }
    setTransportFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      setTransportFileData(reader.result as string);
      toast.success(`Attached Freight Bill: ${file.name}`);
    };
    reader.readAsDataURL(file);
  };

  // 4. Landing & Incidental Costs
  const [transportCost, setTransportCost] = useState("");
  const [transportIsVat, setTransportIsVat] = useState(false);
  const [transportInvoiceNo, setTransportInvoiceNo] = useState("");
  const [loadingCost, setLoadingCost] = useState("");
  const [incidentalCost, setIncidentalCost] = useState("");
  const [incidentalRemarks, setIncidentalRemarks] = useState("");

  // Independent multi-channel payment statuses
  const [materialPaidStatus, setMaterialPaidStatus] = useState<"credit" | "paid_now">("credit");
  const [materialBankAccountId, setMaterialBankAccountId] = useState<string>("");
  const [transportPaidStatus, setTransportPaidStatus] = useState<"credit" | "paid_now">("credit");
  const [transportBankAccountId, setTransportBankAccountId] = useState<string>("");
  const [incidentalPaidStatus, setIncidentalPaidStatus] = useState<"credit" | "paid_now">("credit");
  const [incidentalBankAccountId, setIncidentalBankAccountId] = useState<string>("");

  // Calculations
  const handleQtyChange = (val: string) => {
    setQuantity(val);
    const q = parseFloat(val) || 0;
    const r = parseFloat(rate) || 0;
    if (r > 0) setTotalAmount((q * r).toString());
  };

  const handleRateChange = (val: string) => {
    setRate(val);
    const q = parseFloat(quantity) || 0;
    const r = parseFloat(val) || 0;
    if (q > 0) setTotalAmount((q * r).toString());
  };

  const handleTotalChange = (val: string) => {
    setTotalAmount(val);
    const tot = parseFloat(val) || 0;
    const q = parseFloat(quantity) || 0;
    if (q > 0) setRate((tot / q).toFixed(2));
  };

  const calculations = useMemo(() => {
    const rawTotal = parseFloat(totalAmount) || 0;
    const tCost = parseFloat(transportCost) || 0;
    const lCost = parseFloat(loadingCost) || 0;
    const iCost = parseFloat(incidentalCost) || 0;
    const tPct = parseFloat(tdsPercent) || 0;

    let taxable = rawTotal;
    let vat = 0;
    let finalMaterialBillTotal = rawTotal;

    if (isVatBill) {
      if (vatCalculationMode === "inclusive") {
        taxable = rawTotal / 1.13;
        vat = rawTotal - taxable;
        finalMaterialBillTotal = rawTotal;
      } else {
        taxable = rawTotal;
        vat = rawTotal * 0.13;
        finalMaterialBillTotal = rawTotal + vat;
      }
    }

    // Freight VAT if applicable
    let transportVat = 0;
    if (transportIsVat && tCost > 0) {
      transportVat = tCost - tCost / 1.13;
    }

    // TDS on taxable base
    let tds = 0;
    if (isTdsDeductible && tPct > 0) {
      tds = taxable * (tPct / 100);
    }

    const netPayable = finalMaterialBillTotal - tds;
    const totalSiteLandedCost = finalMaterialBillTotal + tCost + lCost + iCost;

    return {
      taxable: Math.round(taxable * 100) / 100,
      vat: Math.round(vat * 100) / 100,
      transportVat: Math.round(transportVat * 100) / 100,
      tds: Math.round(tds * 100) / 100,
      finalMaterialBillTotal: Math.round(finalMaterialBillTotal * 100) / 100,
      netPayable: Math.round(netPayable * 100) / 100,
      totalSiteLandedCost: Math.round(totalSiteLandedCost * 100) / 100,
    };
  }, [totalAmount, isVatBill, vatCalculationMode, transportIsVat, isTdsDeductible, tdsPercent, transportCost, loadingCost, incidentalCost]);

  // Mutation
  const logMutation = trpc.material.logDirectDelivery.useMutation({
    onSuccess: () => {
      toast.success("Direct material delivery logged successfully!");
      utils.material.invalidate();
      utils.finance.invalidate();
      utils.accounting.invalidate();
      onOpenChange(false);
      onSuccess?.();
    },
    onError: (e) => toast.error(e.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProjectId) {
      toast.error("Please select a target project site.");
      return;
    }
    const finalMaterialName =
      selectedSpecObj?.name || `${selectedCategory} ${selectedMaterialName}`.trim();

    const finalVendorName = selectedVendor?.name || customVendorName.trim() || vendorSearch.trim();

    if (!finalMaterialName || !quantity || !finalVendorName) {
      toast.error("Please select vendor, material, and quantity.");
      return;
    }

    const q = parseFloat(quantity) || 0;
    const r = parseFloat(rate) || 0;

    logMutation.mutate({
      projectId: activeProjectId,
      materialName: finalMaterialName,
      category: selectedCategory.trim() || undefined,
      subCategory: selectedMaterialName.trim() || undefined,
      company: company.trim() || undefined,
      spec: selectedSpecObj?.spec || undefined,
      catalogMaterialId: selectedSpecObj?.id || undefined,
      unit,
      quantity: q,
      rate: r,
      totalAmount: calculations.finalMaterialBillTotal,
      date,
      miti,
      supplierName: finalVendorName,
      isVatBill,
      billStatus,
      vatPercent: 13,
      vatAmount: calculations.vat,
      taxableAmount: calculations.taxable,
      isTdsDeductible,
      tdsPercent: parseFloat(tdsPercent) || 1.5,
      tdsAmount: calculations.tds,
      invoiceNumber: invoiceNumber.trim() || undefined,
      challanNo: challanNo.trim() || undefined,
      fileUrl: fileData || undefined,
      transportationCost: parseFloat(transportCost) || 0,
      transportIsVat,
      transportInvoiceNo: transportInvoiceNo.trim() || undefined,
      transportFileUrl: transportFileData || undefined,
      transportPaidStatus,
      transportBankAccountId: transportPaidStatus === "paid_now" ? transportBankAccountId || undefined : undefined,
      loadingUnloadingCost: parseFloat(loadingCost) || 0,
      incidentalCost: parseFloat(incidentalCost) || 0,
      incidentalPaidStatus,
      incidentalBankAccountId: incidentalPaidStatus === "paid_now" ? incidentalBankAccountId || undefined : undefined,
      incidentalRemarks: incidentalRemarks.trim() || undefined,
      paymentStatus: materialPaidStatus,
      bankAccountId: materialPaidStatus === "paid_now" ? materialBankAccountId || undefined : undefined,
      remarks: remarks.trim() || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-[1280px] !w-[95vw] max-h-[92vh] flex flex-col p-0 gap-0 bg-card border border-[var(--border)] shadow-2xl rounded-2xl font-sans overflow-hidden text-foreground">
        {/* Header Bar */}
        <div className="px-6 py-3.5 shrink-0 border-b border-[var(--input)] bg-[#f8fbfe] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-[var(--accent)] text-[var(--primary)] border border-[#bae6fd]">
              <Truck className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-extrabold text-foreground tracking-tight flex items-center gap-2">
                Log Direct Material Delivery (सामग्री दाखिला / रेकर्ड)
              </DialogTitle>
              <p className="text-xs text-muted-foreground">
                Unified Procurement Hub: 3-Tier Catalog, Multi-stream Landing &amp; Statutory VAT/TDS Engine.
              </p>
            </div>
          </div>
          {miti && (
            <span className="text-xs font-mono font-bold text-[var(--primary)] px-3 py-1 rounded-full bg-[var(--background)] border border-[var(--border)]">
              {miti} BS ({date})
            </span>
          )}
        </div>

        {/* 2-Column Balanced Dashboard Grid Layout */}
        <form onSubmit={handleSubmit} className="flex-1 p-5 grid grid-cols-12 gap-5 overflow-hidden">
          {/* ═════════════════════════════════════════════════════════════════════ */}
          {/* LEFT COLUMN: Site, Vendor & 3-Tier Material Taxonomy                 */}
          {/* ═════════════════════════════════════════════════════════════════════ */}
          <div className="col-span-6 flex flex-col justify-between space-y-3">
            {/* 1. Target Site & Supplier Header Card */}
            <div className="p-4 rounded-2xl bg-[#f8fbfe] border border-[var(--border)] space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-[11px] font-semibold text-foreground/80">
                    Target Site (साइट) <span className="text-[var(--primary)]">*</span>
                  </Label>
                  <Select value={activeProjectId} onValueChange={setSelectedProjectId}>
                    <SelectTrigger className="h-9 text-xs bg-card text-foreground rounded-xl border-[var(--border)]">
                      <SelectValue placeholder="Select target site" />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-[var(--border)] text-xs text-foreground">
                      {projects.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-[11px] font-semibold text-foreground/80">
                    Delivery Date (मिति) <span className="text-[var(--primary)]">*</span>
                  </Label>
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
                    placeholder="Select BS date"
                    className="w-full h-9 text-xs font-mono rounded-xl border-[var(--border)] bg-card text-foreground"
                  />
                </div>
              </div>

              {/* Vendor Search Dropdown */}
              <div className="space-y-1 pt-1 border-t border-[var(--input)]">
                <div className="flex items-center justify-between">
                  <Label className="text-[11px] font-bold text-[var(--primary)] flex items-center gap-1.5">
                    <Building className="h-3.5 w-3.5" /> Supplier / Vendor (कसबाट प्राप्त?) <span className="text-[var(--primary)]">*</span>
                  </Label>
                  {selectedVendor && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedVendor(null);
                        setCustomVendorName("");
                      }}
                      className="text-[10px] text-rose-400 hover:underline flex items-center gap-0.5"
                    >
                      <X className="h-3 w-3" /> Change
                    </button>
                  )}
                </div>

                {selectedVendor ? (
                  <div className="h-9 px-3 rounded-xl bg-info/10 border border-info/40 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge className="bg-info/70 text-foreground text-[9px] font-bold">Party</Badge>
                      <span className="font-bold text-foreground text-xs">{selectedVendor.name}</span>
                    </div>
                    {selectedVendor.pan && (
                      <span className="text-[10px] text-[var(--primary)] font-mono">PAN: {selectedVendor.pan}</span>
                    )}
                  </div>
                ) : (
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      value={vendorSearch}
                      onChange={(e) => {
                        setVendorSearch(e.target.value);
                        setCustomVendorName(e.target.value);
                      }}
                      placeholder="Search registered vendor or type supplier name..."
                      className="h-9 pl-8 text-xs bg-card text-foreground rounded-xl border-[var(--border)]"
                    />
                    {vendorSuggestions.length > 0 && vendorSearch.trim().length > 0 && (
                      <div className="absolute top-10 left-0 right-0 z-50 bg-card border border-[var(--border)] rounded-xl shadow-2xl max-h-36 overflow-y-auto p-1">
                        {vendorSuggestions.map((v) => (
                          <button
                            key={v.id}
                            type="button"
                            onClick={() => handleSelectVendor(v)}
                            className="w-full text-left px-3 py-1.5 text-xs hover:bg-emerald-500/10 rounded-lg flex items-center justify-between text-foreground/90 hover:text-foreground"
                          >
                            <span className="font-semibold">{v.name}</span>
                            <span className="text-[10px] text-[var(--primary)] font-mono">
                              {v.pan ? `PAN: ${v.pan}` : "Party"}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* 2. 3-Tier Hierarchical Catalog Dropdowns Card */}
            <div className="p-4 rounded-2xl bg-[#f8fbfe] border border-[var(--border)] space-y-3 shadow-lg">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-bold text-[var(--primary)] flex items-center gap-1.5">
                  <Layers className="h-4 w-4" /> 3-Tier Material Catalog (वर्गीकरण) <span className="text-[var(--primary)]">*</span>
                </Label>
                <span className="text-[10px] text-muted-foreground">Category $\rightarrow$ Material $\rightarrow$ Spec</span>
              </div>

              <div className="grid grid-cols-3 gap-2.5">
                {/* Tier 1: Category */}
                <div className="space-y-1">
                  <Label className="text-[10px] font-semibold text-foreground/80">
                    1. Category (मुख्य वर्ग)
                  </Label>
                  <Select
                    value={selectedCategory}
                    onValueChange={(val) => {
                      setSelectedCategory(val);
                      setSelectedMaterialName("");
                      setSelectedSpecObj(null);
                    }}
                  >
                    <SelectTrigger className="h-9 text-xs bg-card text-foreground rounded-xl border-[var(--border)]">
                      <SelectValue placeholder="Category" />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-[var(--border)] text-xs text-foreground max-h-52">
                      {categories.map((cat) => (
                        <SelectItem key={cat} value={cat}>
                          {cat}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Tier 2: Material Name */}
                <div className="space-y-1">
                  <Label className="text-[10px] font-semibold text-foreground/80">
                    2. Material (सामग्री)
                  </Label>
                  <Select
                    value={selectedMaterialName}
                    onValueChange={(val) => {
                      setSelectedMaterialName(val);
                      setSelectedSpecObj(null);
                    }}
                    disabled={materialsInCategory.length === 0}
                  >
                    <SelectTrigger className="h-9 text-xs bg-card text-foreground rounded-xl border-[var(--border)]">
                      <SelectValue placeholder="Material" />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-[var(--border)] text-xs text-foreground max-h-52">
                      {materialsInCategory.map((mat) => (
                        <SelectItem key={mat} value={mat}>
                          {mat}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Tier 3: Specification / Grade */}
                <div className="space-y-1">
                  <Label className="text-[10px] font-semibold text-foreground/80">
                    3. Spec / Grade (साइज)
                  </Label>
                  <Select
                    value={selectedSpecObj?.id || ""}
                    onValueChange={handleSelectTier3Spec}
                    disabled={specsForMaterial.length === 0}
                  >
                    <SelectTrigger className="h-9 text-xs bg-card text-foreground rounded-xl border-[var(--border)] font-semibold">
                      <SelectValue placeholder="Spec" />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-[var(--border)] text-xs text-foreground max-h-52">
                      {specsForMaterial.map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.spec || item.name} {item.unit ? `(${item.unit})` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Brand & Remarks */}
              <div className="grid grid-cols-2 gap-3 pt-1 border-t border-[var(--input)]">
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground font-medium">Brand / Manufacturer (कम्पनी)</Label>
                  <Input
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    placeholder="e.g. Maruti, Shivam, Jagdamba"
                    className="h-8.5 text-xs bg-card text-foreground rounded-xl border-[var(--border)]"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground font-medium">Remarks (कैफियत)</Label>
                  <Input
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                    placeholder="e.g. Site drop notes"
                    className="h-8.5 text-xs bg-card text-foreground rounded-xl border-[var(--border)]"
                  />
                </div>
              </div>
            </div>

            {/* Direct Bill Upload Card */}
            <div className="p-3.5 rounded-2xl bg-[#f8fbfe] border border-[var(--border)] flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-emerald-500/10 text-[var(--primary)] border border-[var(--border)]">
                  <Upload className="h-4 w-4" />
                </div>
                <div>
                  <span className="text-xs font-semibold text-foreground block">Official Bill / Challan Attachment</span>
                  <span className="text-[10px] text-muted-foreground">Attach scanned VAT invoice, challan or delivery slip (PDF/Image)</span>
                </div>
              </div>

              <label className="h-8.5 px-3 flex items-center gap-1.5 bg-card border border-[var(--border)] hover:border-emerald-400 text-[var(--primary)] rounded-xl cursor-pointer text-xs font-semibold shrink-0 transition shadow-sm">
                <FileText className="h-3.5 w-3.5" />
                <span>{fileName ? fileName.slice(0, 15) + "..." : "Browse Bill"}</span>
                <input
                  type="file"
                  accept="image/*,.pdf"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          {/* ═════════════════════════════════════════════════════════════════════ */}
          {/* RIGHT COLUMN: Unified Material Cost, VAT & TDS Engine + Landing Cost */}
          {/* ═════════════════════════════════════════════════════════════════════ */}
          <div className="col-span-6 flex flex-col justify-between space-y-3">
            {/* 3 & 4. COMBINED UNIFIED MATERIAL COST, VAT & TDS ENGINE CARD */}
            <div className="p-4 rounded-2xl bg-[#f8fbfe] border border-[var(--border)] space-y-3 shadow-lg">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-bold text-[var(--primary)] flex items-center gap-1.5">
                  <Calculator className="h-4 w-4" /> Material Cost, VAT &amp; TDS Engine (मूल्य तथा कर गणना)
                </Label>
                {/* 3 Bill States */}
                <div className="flex items-center gap-1 bg-card p-1 rounded-xl border border-[var(--border)]">
                  <button
                    type="button"
                    onClick={() => setBillStatus("received")}
                    className={`px-2 py-0.5 rounded-lg text-[10px] font-semibold transition ${
                      billStatus === "received" ? "bg-info/70 text-foreground" : "text-muted-foreground"
                    }`}
                  >
                    VAT Bill
                  </button>
                  <button
                    type="button"
                    onClick={() => setBillStatus("pending")}
                    className={`px-2 py-0.5 rounded-lg text-[10px] font-semibold transition ${
                      billStatus === "pending" ? "bg-amber-500 text-black font-bold" : "text-muted-foreground"
                    }`}
                  >
                    Challan / Pending
                  </button>
                  <button
                    type="button"
                    onClick={() => setBillStatus("non_vat")}
                    className={`px-2 py-0.5 rounded-lg text-[10px] font-semibold transition ${
                      billStatus === "non_vat" ? "bg-white/20 text-foreground" : "text-muted-foreground"
                    }`}
                  >
                    Non-VAT
                  </button>
                </div>
              </div>

              {/* Quantity, Unit, Rate, Mode & Total Material Bill */}
              <div className="grid grid-cols-12 gap-2.5">
                <div className="col-span-3 space-y-1">
                  <Label className="text-[11px] font-semibold text-foreground/80">Quantity *</Label>
                  <Input
                    type="number"
                    step="any"
                    value={quantity}
                    onChange={(e) => handleQtyChange(e.target.value)}
                    placeholder="200"
                    className="h-8.5 text-xs font-mono font-bold bg-card text-foreground rounded-xl border-[var(--border)]"
                  />
                </div>

                <div className="col-span-2 space-y-1">
                  <Label className="text-[11px] font-semibold text-foreground/80">Unit</Label>
                  <div className="h-8.5 px-2 flex items-center justify-center bg-card text-[var(--primary)] font-mono font-bold rounded-xl border border-[var(--border)] text-xs">
                    {unit || "Pcs"}
                  </div>
                </div>

                <div className="col-span-3 space-y-1">
                  <Label className="text-[11px] font-semibold text-foreground/80">Unit Rate</Label>
                  <Input
                    type="number"
                    step="any"
                    value={rate}
                    onChange={(e) => handleRateChange(e.target.value)}
                    placeholder="750"
                    className="h-8.5 text-xs font-mono bg-card text-foreground rounded-xl border-[var(--border)]"
                  />
                </div>

                <div className="col-span-4 space-y-1">
                  <div className="flex items-center justify-between">
                    <Label className="text-[11px] font-semibold text-[var(--primary)]">Total Material</Label>
                    {isVatBill && (
                      <button
                        type="button"
                        onClick={() => setVatCalculationMode(vatCalculationMode === "inclusive" ? "exclusive" : "inclusive")}
                        className="text-[9px] text-muted-foreground hover:text-[var(--primary)]"
                      >
                        {vatCalculationMode === "inclusive" ? "Gross Incl" : "+13% Base"}
                      </button>
                    )}
                  </div>
                  <Input
                    type="number"
                    step="any"
                    value={totalAmount}
                    onChange={(e) => handleTotalChange(e.target.value)}
                    placeholder="150000"
                    className="h-8.5 text-xs font-mono font-bold bg-card text-[var(--primary)] rounded-xl border-[var(--border)]"
                  />
                </div>
              </div>

              {/* TDS & Invoice / Challan Identification Strip */}
              <div className="grid grid-cols-12 gap-2.5 pt-1 border-t border-[var(--input)] items-center">
                <div className="col-span-4 flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setIsTdsDeductible(!isTdsDeductible)}
                    className={`px-2.5 py-1 rounded-lg border text-[10px] font-semibold transition ${
                      isTdsDeductible
                        ? "border-amber-500 bg-amber-500/20 text-amber-600"
                        : "border-[var(--border)] bg-card text-muted-foreground"
                    }`}
                  >
                    ✂️ TDS Deduct
                  </button>
                  {isTdsDeductible && (
                    <div className="flex items-center gap-1">
                      <Input
                        type="number"
                        step="0.1"
                        value={tdsPercent}
                        onChange={(e) => setTdsPercent(e.target.value)}
                        placeholder="1.5"
                        className="h-7 w-12 text-[10px] font-mono font-bold bg-card text-amber-600 rounded-lg p-0.5 text-center border-[var(--border)]"
                      />
                      <span className="text-[10px] text-muted-foreground">%</span>
                    </div>
                  )}
                </div>

                <div className="col-span-4">
                  <Input
                    value={invoiceNumber}
                    onChange={(e) => setInvoiceNumber(e.target.value)}
                    placeholder="VAT Invoice No"
                    className="h-7 text-[10px] font-mono bg-card text-foreground rounded-lg border-[var(--border)]"
                  />
                </div>

                <div className="col-span-4">
                  <Input
                    value={challanNo}
                    onChange={(e) => setChallanNo(e.target.value)}
                    placeholder="Challan / Slip No"
                    className="h-7 text-[10px] font-mono bg-card text-foreground rounded-lg border-[var(--border)]"
                  />
                </div>
              </div>

              {/* Integrated Tax Breakdown Strip */}
              {parseFloat(totalAmount) > 0 && (
                <div className="p-2 rounded-xl bg-card border border-[var(--input)] grid grid-cols-4 gap-2 text-center">
                  <div>
                    <div className="text-[9px] text-muted-foreground">Taxable (करयोग्य)</div>
                    <div className="text-xs font-bold font-mono text-foreground">Rs. {calculations.taxable.toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-[9px] text-info/80">VAT 13% (भ्याट)</div>
                    <div className="text-xs font-bold font-mono text-info/80">Rs. {calculations.vat.toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-[9px] text-amber-600">TDS {tdsPercent}%</div>
                    <div className="text-xs font-bold font-mono text-amber-600">Rs. {calculations.tds.toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-[9px] text-[var(--primary)]">Net Due / Payable</div>
                    <div className="text-xs font-bold font-mono text-[var(--primary)]">Rs. {calculations.netPayable.toLocaleString()}</div>
                  </div>
                </div>
              )}

              {/* Material Due vs Paid Now Settlement Controls */}
              <div className="flex items-center justify-between pt-1 border-t border-[var(--input)]">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground font-semibold">Material Settlement:</span>
                  <button
                    type="button"
                    onClick={() => setMaterialPaidStatus("credit")}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition ${
                      materialPaidStatus === "credit"
                        ? "bg-amber-500/20 text-amber-600 border border-[var(--border)]"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    📝 Due / Credit (उधारो)
                  </button>
                  <button
                    type="button"
                    onClick={() => setMaterialPaidStatus("paid_now")}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition ${
                      materialPaidStatus === "paid_now"
                        ? "bg-emerald-500/20 text-[var(--primary)] border border-[var(--border)]"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    💵 Paid Now
                  </button>
                </div>

                {materialPaidStatus === "paid_now" && (
                  <div className="w-48">
                    <Select value={materialBankAccountId} onValueChange={setMaterialBankAccountId}>
                      <SelectTrigger className="h-7 text-[10px] bg-card text-foreground rounded-lg border-[var(--border)]">
                        <SelectValue placeholder="Account" />
                      </SelectTrigger>
                      <SelectContent className="bg-card border-[var(--border)] text-xs text-foreground">
                        <SelectItem value="cash_petty">Site Petty Cash</SelectItem>
                        {bankAccounts.map((b) => (
                          <SelectItem key={b.id} value={b.id}>
                            {b.bankName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            </div>

            {/* 5. Landing Costs (Freight VAT & Incidentals) Card */}
            <div className="p-4 rounded-2xl bg-[#f8fbfe] border border-[var(--border)] space-y-2.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-bold text-amber-600 flex items-center gap-1.5">
                  <Coins className="h-3.5 w-3.5" /> Landing &amp; Incidental Costs (ढुवानी, अनलोडिङ)
                </Label>
                <span className="text-[10px] text-muted-foreground font-mono">Independent settlements</span>
              </div>

              {/* Freight Row with 13% VAT Option */}
              <div className="p-2 rounded-xl bg-card border border-[var(--input)] space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-semibold text-foreground/90">🚛 Freight:</span>
                    <Input
                      type="number"
                      step="any"
                      value={transportCost}
                      onChange={(e) => setTransportCost(e.target.value)}
                      placeholder="Freight Rs. 0"
                      className="h-7 w-24 text-xs font-mono bg-card text-foreground rounded-lg border-[var(--border)]"
                    />
                    <button
                      type="button"
                      onClick={() => setTransportIsVat(!transportIsVat)}
                      className={`px-2 py-0.5 rounded text-[10px] font-semibold transition ${
                        transportIsVat
                          ? "bg-info/20 text-info/80 border border-info/40"
                          : "bg-card text-muted-foreground"
                      }`}
                    >
                      {transportIsVat ? "13% Freight VAT" : "+ Non-VAT"}
                    </button>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setTransportPaidStatus("credit")}
                      className={`px-2 py-0.5 rounded text-[10px] ${
                        transportPaidStatus === "credit" ? "bg-amber-500/20 text-amber-600 font-bold" : "text-muted-foreground"
                      }`}
                    >
                      Due
                    </button>
                    <button
                      type="button"
                      onClick={() => setTransportPaidStatus("paid_now")}
                      className={`px-2 py-0.5 rounded text-[10px] ${
                        transportPaidStatus === "paid_now" ? "bg-emerald-500/20 text-[var(--primary)] font-bold" : "text-muted-foreground"
                      }`}
                    >
                      Paid
                    </button>
                    {transportPaidStatus === "paid_now" && (
                      <Select value={transportBankAccountId} onValueChange={setTransportBankAccountId}>
                        <SelectTrigger className="h-7 w-28 text-[10px] bg-card text-foreground rounded-lg border-[var(--border)]">
                          <SelectValue placeholder="Account" />
                        </SelectTrigger>
                        <SelectContent className="bg-card border-[var(--border)] text-xs text-foreground">
                          <SelectItem value="cash_petty">Petty Cash</SelectItem>
                          {bankAccounts.map((b) => (
                            <SelectItem key={b.id} value={b.id}>
                              {b.bankName}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                </div>

                {transportIsVat && (
                  <div className="flex items-center gap-2 pt-0.5">
                    <Input
                      value={transportInvoiceNo}
                      onChange={(e) => setTransportInvoiceNo(e.target.value)}
                      placeholder="Transport VAT Invoice Number"
                      className="h-6 flex-1 text-[10px] font-mono bg-card text-foreground rounded border-[var(--border)]"
                    />
                    <label className="h-6 px-2 flex items-center gap-1 bg-card border border-info/40 hover:border-info/50 text-info/80 rounded cursor-pointer text-[9px] font-semibold shrink-0 transition">
                      <Upload className="h-2.5 w-2.5" />
                      <span>{transportFileName ? transportFileName.slice(0, 10) + "..." : "Upload Freight Bill"}</span>
                      <input
                        type="file"
                        accept="image/*,.pdf"
                        onChange={handleTransportFileUpload}
                        className="hidden"
                      />
                    </label>
                  </div>
                )}
              </div>

              {/* Incidental / Unloading Row */}
              <div className="p-2 rounded-xl bg-card border border-[var(--input)] space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-semibold text-foreground/90">🛠️ Unload/Incident:</span>
                    <Input
                      type="number"
                      step="any"
                      value={loadingCost}
                      onChange={(e) => setLoadingCost(e.target.value)}
                      placeholder="Unload Rs. 0"
                      className="h-7 w-20 text-xs font-mono bg-card text-foreground rounded-lg border-[var(--border)]"
                    />
                    <Input
                      type="number"
                      step="any"
                      value={incidentalCost}
                      onChange={(e) => setIncidentalCost(e.target.value)}
                      placeholder="Incidental Rs. 0"
                      className="h-7 w-20 text-xs font-mono bg-card text-foreground rounded-lg border-[var(--border)]"
                    />
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setIncidentalPaidStatus("credit")}
                      className={`px-2 py-0.5 rounded text-[10px] ${
                        incidentalPaidStatus === "credit" ? "bg-amber-500/20 text-amber-600 font-bold" : "text-muted-foreground"
                      }`}
                    >
                      Due
                    </button>
                    <button
                      type="button"
                      onClick={() => setIncidentalPaidStatus("paid_now")}
                      className={`px-2 py-0.5 rounded text-[10px] ${
                        incidentalPaidStatus === "paid_now" ? "bg-emerald-500/20 text-[var(--primary)] font-bold" : "text-muted-foreground"
                      }`}
                    >
                      Paid
                    </button>
                    {incidentalPaidStatus === "paid_now" && (
                      <Select value={incidentalBankAccountId} onValueChange={setIncidentalBankAccountId}>
                        <SelectTrigger className="h-7 w-28 text-[10px] bg-card text-foreground rounded-lg border-[var(--border)]">
                          <SelectValue placeholder="Account" />
                        </SelectTrigger>
                        <SelectContent className="bg-card border-[var(--border)] text-xs text-foreground">
                          <SelectItem value="cash_petty">Petty Cash</SelectItem>
                          {bankAccounts.map((b) => (
                            <SelectItem key={b.id} value={b.id}>
                              {b.bankName}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                </div>

                <Input
                  value={incidentalRemarks}
                  onChange={(e) => setIncidentalRemarks(e.target.value)}
                  placeholder="Incidental remarks (e.g. tipper puncture / spot unloading labor)"
                  className="h-7 text-[10px] bg-card text-foreground rounded-lg border-[var(--border)]"
                />
              </div>
            </div>

            {/* Bottom Actions & Total */}
            <div className="p-3.5 rounded-2xl bg-card border border-[var(--border)] flex items-center justify-between">
              <div>
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider block">Total Site Landed Cost</span>
                <span className="text-base font-bold font-mono text-[var(--primary)]">
                  Rs. {calculations.totalSiteLandedCost.toLocaleString()}
                </span>
              </div>

              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  className="h-9 px-4 text-xs border-[var(--border)] bg-card text-foreground/80 hover:text-foreground rounded-xl"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={logMutation.isPending}
                  className="amber-cta-btn h-9 px-6 text-xs gap-1.5"
                >
                  {logMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
                  Log &amp; Update Inventory (दाखिला गर्नुहोस्)
                </Button>
              </div>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
