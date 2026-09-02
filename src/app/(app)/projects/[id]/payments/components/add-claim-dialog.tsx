"use client";

import { useState } from "react";
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
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { toast } from "sonner";
import { format } from "date-fns";
import { adToBs } from "@/lib/nepali-calendar";
import { NepaliDatePicker } from "@/components/ui/nepali-date-picker";

interface AddClaimDialogProps {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function AddClaimDialog({
  projectId,
  open,
  onOpenChange,
  onSuccess,
}: AddClaimDialogProps) {
  const utils = trpc.useUtils();

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

  // Form State
  const [claimPartyName, setClaimPartyName] = useState("");
  const [partyPopoverOpen, setPartyPopoverOpen] = useState(false);
  const [partySearchQuery, setPartySearchQuery] = useState("");

  const [date, setDate] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [miti, setMiti] = useState(() => {
    try {
      return adToBs(new Date()).formatted;
    } catch {
      return "";
    }
  });

  const [claimBillNo, setClaimBillNo] = useState("");
  const [claimCategory, setClaimCategory] = useState("food_mess");
  const [claimAmount, setClaimAmount] = useState("");
  const [claimDesc, setClaimDesc] = useState("");

  // Scanned Bill Attachment State
  const [fileData, setFileData] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

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

  const logVatBillMut = trpc.vatRegister.createDirectVatBill.useMutation({
    onSuccess: () => {
      toast.success("Bill / Expense Claim registered successfully!");
      onOpenChange(false);
      // Reset
      setClaimPartyName("");
      setClaimAmount("");
      setClaimDesc("");
      setClaimBillNo("");
      setFileData(null);
      setFileName(null);
      utils.projectOps.payment.outstandingPayables.invalidate();
      utils.accounting.ledgerAccounts.invalidate();
      utils.accounting.ledgerStatement.invalidate();
      utils.accounting.dayBook.invalidate();
      if (onSuccess) onSuccess();
    },
    onError: (err) => {
      toast.error(err.message || "Failed to log bill / claim");
    },
  });

  const handleSaveClaim = () => {
    if (!claimPartyName.trim() || !claimAmount || parseFloat(claimAmount) <= 0) {
      toast.error("Please enter claimant name and a valid amount");
      return;
    }

    logVatBillMut.mutate({
      projectId: targetProjectId || projectId,
      billType: "expense",
      billNumber: claimBillNo || `CLAIM-${Date.now().toString().slice(-4)}`,
      billDate: date,
      billMiti: miti || undefined,
      partyName: claimPartyName.trim(),
      taxableAmount: parseFloat(claimAmount) || 0,
      vatPercent: 0,
      category: claimCategory,
      description: claimDesc || undefined,
      scannedBillUrl: fileData || undefined,
      scannedBillName: fileName || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[760px] w-full p-0 gap-0 bg-card border border-[var(--border)] text-foreground rounded-2xl shadow-2xl overflow-hidden font-sans">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[var(--input)] bg-[#f8fbfe] flex items-center justify-between">
          <div>
            <DialogTitle className="text-base font-bold text-foreground tracking-tight font-sans">
              Log Bill / Expense Claim (बिल तथा दाबी दर्ता)
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground mt-0.5">
              Register approved staff food/mess/travel reimbursement claims or vendor bills.
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
              <SelectContent className="bg-card border border-[var(--border)] text-xs text-foreground rounded-xl shadow-xl">
                {allProjects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} ({p.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Row 1: Date & Party / Claimant Name (Searchable Popover) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Date */}
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

            {/* Claimant / Party (Searchable Dropdown) */}
            <div className="space-y-1.5 min-w-0">
              <Label className="text-[11px] font-semibold text-foreground/80">Claimant / Party (कसको दाबी?)</Label>
              <Popover open={partyPopoverOpen} onOpenChange={setPartyPopoverOpen}>
                <PopoverTrigger asChild>
                  <div className="relative flex items-center w-full">
                    <Input
                      value={claimPartyName}
                      onChange={(e) => {
                        setClaimPartyName(e.target.value);
                        setPartySearchQuery(e.target.value);
                        if (!partyPopoverOpen) setPartyPopoverOpen(true);
                      }}
                      onFocus={() => setPartyPopoverOpen(true)}
                      placeholder="Search staff, supplier or type name..."
                      className="w-full h-9 text-xs pr-8 rounded-lg border border-[var(--border)] focus:border-[var(--primary)] bg-card text-foreground truncate"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.preventDefault();
                        setPartyPopoverOpen(!partyPopoverOpen);
                      }}
                      className="absolute right-0 h-9 w-8 p-0 text-muted-foreground/80 hover:text-foreground/80"
                    >
                      <ChevronsUpDown className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </PopoverTrigger>

                <PopoverContent
                  className="w-[var(--radix-popover-trigger-width)] p-1.5 shadow-xl border border-[var(--border)] bg-card rounded-xl z-50"
                  align="start"
                  sideOffset={6}
                  onOpenAutoFocus={(e) => e.preventDefault()}
                >
                  <div className="max-h-48 overflow-y-auto space-y-1 text-xs custom-scrollbar">
                    {registeredPayees
                      .filter((p) =>
                        !partySearchQuery.trim() ||
                        p.name.toLowerCase().includes(partySearchQuery.toLowerCase())
                      )
                      .map((p) => (
                        <button
                          key={`${p.type}-${p.id}`}
                          type="button"
                          onClick={() => {
                            setClaimPartyName(p.name);
                            setPartyPopoverOpen(false);
                          }}
                          className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-left hover:bg-info/10 hover:text-[var(--primary)] transition cursor-pointer group"
                        >
                          <div className="truncate">
                            <p className="font-medium text-foreground group-hover:text-[var(--primary)] truncate">
                              {p.name}
                            </p>
                            <p className="text-[10px] text-muted-foreground/80">
                              {p.typeLabel} {p.contact ? `• ${p.contact}` : ""}
                            </p>
                          </div>
                          {claimPartyName === p.name && (
                            <Check className="h-3.5 w-3.5 text-[var(--primary)] shrink-0" />
                          )}
                        </button>
                      ))}

                    {registeredPayees.filter((p) =>
                      !partySearchQuery.trim() ||
                      p.name.toLowerCase().includes(partySearchQuery.toLowerCase())
                    ).length === 0 && (
                      <div className="py-2 px-3 text-center text-xs text-muted-foreground">
                        Use <span className="text-[var(--primary)] font-semibold">"{claimPartyName}"</span> as new claimant
                      </div>
                    )}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* Row 2: Bill # & Expense Category */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5 min-w-0">
              <Label className="text-[11px] font-semibold text-foreground/80">Bill / Voucher # (Optional)</Label>
              <Input
                value={claimBillNo}
                onChange={(e) => setClaimBillNo(e.target.value)}
                placeholder="e.g. BILL-2900 or EXP-01"
                className="w-full h-9 text-xs font-mono bg-card text-foreground rounded-lg border border-[var(--border)] focus:border-[var(--primary)]"
              />
            </div>

            <div className="space-y-1.5 min-w-0">
              <Label className="text-[11px] font-semibold text-foreground/80">Expense Category</Label>
              <Select value={claimCategory} onValueChange={setClaimCategory}>
                <SelectTrigger className="w-full min-w-0 h-9 text-xs bg-card text-foreground rounded-lg border border-[var(--border)] focus:border-[var(--primary)]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-card border border-[var(--border)] text-xs text-foreground rounded-xl shadow-xl max-h-56">
                  <SelectItem value="food_mess">
                    Food & Mess (खाजा / खाना)
                  </SelectItem>
                  <SelectItem value="travel_fuel">
                    Travel & Fuel (इन्धन / यात्रा)
                  </SelectItem>
                  <SelectItem value="site_expense">
                    Site General Expense (दैनिक मसलन्द)
                  </SelectItem>
                  <SelectItem value="material">
                    Direct Material Purchase Bill (सामग्री बिल)
                  </SelectItem>
                  <SelectItem value="equipment_repair">
                    Equipment Repair & Maintenance (उपकरण मर्मत)
                  </SelectItem>
                  <SelectItem value="office_overhead">
                    Office Overhead & Utilities (कार्यालय खर्च)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Row 3: Claim Amount */}
          <div className="space-y-1.5 min-w-0">
            <Label className="text-[11px] font-semibold text-foreground/80">Claim Amount (NPR)</Label>
            <Input
              type="number"
              value={claimAmount}
              onChange={(e) => setClaimAmount(e.target.value)}
              placeholder="e.g. 2900 or 15000"
              className="w-full h-9 text-xs font-mono font-bold bg-card text-foreground rounded-lg border border-[var(--border)] focus:border-[var(--primary)]"
            />
          </div>

          {/* Row 4: Attach Scanned Bill / Voucher Photo */}
          <div className="space-y-1.5">
            <Label className="text-[11px] font-semibold text-foreground/80">
              Attach Scanned Bill / Receipt Photo (बिल फोटो)
            </Label>
            <label className="flex items-center justify-center gap-2 h-9 px-3 border border-dashed border-[var(--border)] rounded-lg cursor-pointer hover:bg-muted text-xs text-muted-foreground transition bg-muted/60">
              <Paperclip className="h-4 w-4 text-[var(--primary)] shrink-0" />
              <span className="truncate">
                {fileName || "Attach bill photo, receipt, or approved claim slip (PDF / Image)"}
              </span>
              <input
                type="file"
                accept="image/*,.pdf"
                onChange={handleFileSelect}
                className="hidden"
              />
            </label>
          </div>

          {/* Row 5: Narration / Purpose */}
          <div className="space-y-1.5">
            <Label className="text-[11px] font-semibold text-foreground/80">Narration / Approval Notes (कैफियत)</Label>
            <Input
              value={claimDesc}
              onChange={(e) => setClaimDesc(e.target.value)}
              placeholder="e.g. Lunch for site concreting crew (Approved by PM)"
              className="h-9 text-xs bg-card text-foreground rounded-lg border border-[var(--border)] focus:border-[var(--primary)]"
            />
          </div>
        </div>

        {/* Footer */}
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
            onClick={handleSaveClaim}
            disabled={logVatBillMut.isPending || !claimPartyName.trim() || !claimAmount}
            className="amber-cta-btn h-8 text-xs px-5 font-bold text-white rounded-lg shadow-sm transition-all"
          >
            {logVatBillMut.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />} Save Claim (दाबी सुरक्षित)
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
