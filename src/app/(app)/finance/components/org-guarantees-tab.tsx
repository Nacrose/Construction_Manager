"use client";

import { useState, useMemo } from "react";
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
  ShieldAlert,
  ShieldCheck,
  Plus,
  Trash2,
  Loader2,
  FileText,
  Eye,
} from "lucide-react";
import { format } from "date-fns";
import { adToBs } from "@/lib/nepali-calendar";
import { toast } from "sonner";
import { toastError } from "@/lib/toast-error";
import { cn } from "@/lib/utils";
import { formatNpr } from "@/lib/construction-finance";
import { ConstructionTable, type ConstructionTableColumn } from "@/components/ui/construction-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { Textarea } from "@/components/ui/textarea";
import { AttachmentDropzone } from "@/components/ui/attachment-dropzone";
import { sanitizeUrl } from "@/lib/safe-url";

const TYPE_LABELS: Record<string, { label: string; labelNp: string; color: string }> = {
  bid_bond: {
    label: "Bid Bond / Tender Security",
    labelNp: "बोलपत्र जमानत",
    color: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  },
  performance_bond: {
    label: "Performance Security",
    labelNp: "कार्यसम्पादन जमानत",
    color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  },
  advance_payment: {
    label: "Mobilization APG",
    labelNp: "पेश्की जमानत",
    color: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  },
  retention_bond: {
    label: "Retention Guarantee",
    labelNp: "धरौटी जमानत",
    color: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  },
  car_insurance: {
    label: "CAR Insurance Policy",
    labelNp: "निर्माण जोखिम बीमा",
    color: "bg-teal-500/20 text-teal-400 border-teal-500/30",
  },
  other: {
    label: "Other Guarantee",
    labelNp: "अन्य जमानत",
    color: "bg-slate-500/20 text-slate-400 border-slate-500/30",
  },
};

export function OrgGuaranteesTab() {
  const utils = trpc.useUtils();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "extended" | "released" | "expired">("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  // Create Form State
  const [type, setType] = useState<"bid_bond" | "performance_bond" | "advance_payment" | "retention_bond" | "car_insurance" | "other">("bid_bond");
  const [guaranteeNumber, setGuaranteeNumber] = useState("");
  const [issuingBank, setIssuingBank] = useState("");
  const [branch, setBranch] = useState("");
  const [beneficiary, setBeneficiary] = useState("");
  const [amount, setAmount] = useState("");
  const [marginAmount, setMarginAmount] = useState("");
  const [commissionPaid, setCommissionPaid] = useState("");
  const [purpose, setPurpose] = useState("");
  const [issueDate, setIssueDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [issueMiti, setIssueMiti] = useState(() => {
    try { return adToBs(new Date()).formatted; } catch { return ""; }
  });
  const [expiryDate, setExpiryDate] = useState("");
  const [expiryMiti, setExpiryMiti] = useState("");
  const [claimPeriodDays, setClaimPeriodDays] = useState("30");
  const [selectedProjectId, setSelectedProjectId] = useState<string>("none");
  const [documentUrl, setDocumentUrl] = useState("");
  const [documentName, setDocumentName] = useState("");
  const [notes, setNotes] = useState("");

  const { data: projectList } = trpc.project.list.useQuery();
  const projects = projectList?.projects || [];

  const { data, isLoading } = trpc.bankGuarantee.list.useQuery({
    status: statusFilter !== "all" ? statusFilter : undefined,
    type: typeFilter !== "all" ? typeFilter : undefined,
  });

  const createMutation = trpc.bankGuarantee.create.useMutation({
    onSuccess: () => {
      toast.success("Bank guarantee / bid bond registered successfully");
      utils.bankGuarantee.list.invalidate();
      setCreateDialogOpen(false);
      resetForm();
    },
    onError: (err) => toastError("Bank guarantee could not be registered. Please try again.", err.message),
  });

  const releaseMutation = trpc.bankGuarantee.release.useMutation({
    onSuccess: () => {
      toast.success("Guarantee marked as released & margin unblocked");
      utils.bankGuarantee.list.invalidate();
    },
    onError: (err) => toastError("Guarantee could not be marked as released. Please try again.", err.message),
  });

  const deleteMutation = trpc.bankGuarantee.delete.useMutation({
    onSuccess: () => {
      toast.success("Guarantee record deleted");
      utils.bankGuarantee.list.invalidate();
    },
    onError: (err) => toastError("Guarantee record could not be deleted. Please try again.", err.message),
  });

  const resetForm = () => {
    setGuaranteeNumber("");
    setIssuingBank("");
    setBranch("");
    setBeneficiary("");
    setAmount("");
    setMarginAmount("");
    setCommissionPaid("");
    setPurpose("");
    setExpiryDate("");
    setExpiryMiti("");
    setSelectedProjectId("none");
    setDocumentUrl("");
    setDocumentName("");
    setNotes("");
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedAmount = parseFloat(amount);
    if (!guaranteeNumber.trim() || !issuingBank.trim() || !beneficiary.trim() || !expiryDate || isNaN(parsedAmount) || parsedAmount <= 0) {
      toast.error("Please fill all required fields with a valid amount");
      return;
    }

    const finalIssuedDate = issueDate || format(new Date(), "yyyy-MM-dd");

    createMutation.mutate({
      type,
      guaranteeNumber: guaranteeNumber.trim(),
      issuingBank: issuingBank.trim(),
      branch: branch.trim() || undefined,
      beneficiary: beneficiary.trim(),
      amount: parsedAmount,
      marginAmount: parseFloat(marginAmount) || 0,
      commissionPaid: parseFloat(commissionPaid) || 0,
      purpose: purpose.trim() || undefined,
      issuedDate: finalIssuedDate,
      issuedMiti: issueMiti?.trim() || undefined,
      expiryDate,
      expiryMiti: expiryMiti?.trim() || undefined,
      claimPeriodDays: parseInt(claimPeriodDays) || 30,
      projectId: selectedProjectId !== "none" ? selectedProjectId : undefined,
      documentUrl: documentUrl?.trim() || undefined,
      documentName: documentName?.trim() || undefined,
      notes: notes?.trim() || undefined,
    });
  };

  const kpis = data?.kpis || {
    totalActiveExposure: 0,
    totalMarginHeld: 0,
    totalCommissionPaid: 0,
    expiringWithin30DaysCount: 0,
    expiredCount: 0,
    activeCount: 0,
    totalCount: 0,
  };

  const items = data?.items || [];

  const columns: ConstructionTableColumn<any>[] = useMemo(
    () => [
      {
        key: "guaranteeNumber",
        header: "Type & Bond No",
        render: (val, g) => {
          const typeInfo = TYPE_LABELS[g.type] || TYPE_LABELS.other;
          return (
            <div className="font-sans">
              <div className="flex items-center gap-1.5 flex-wrap">
                <Badge variant="outline" className={cn("text-[9px] px-1.5 py-0.5", typeInfo.color)}>
                  {typeInfo.labelNp}
                </Badge>
                {g.documentUrl && (
                  <a
                    href={sanitizeUrl(g.documentUrl) ?? "#"}
                    target="_blank"
                    rel="noreferrer"
                    className="text-emerald-400 hover:text-emerald-300 inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors"
                    title={g.documentName || "View Attached PDF / Scanned Document"}
                  >
                    <FileText className="h-3 w-3" />
                    <span>PDF</span>
                  </a>
                )}
              </div>
              <div className="font-mono font-bold text-white mt-1">{val}</div>
              {g.purpose && <p className="text-[10px] text-muted-foreground line-clamp-1 mt-0.5">{g.purpose}</p>}
            </div>
          );
        },
      },
      {
        key: "issuingBank",
        header: "Issuing Bank & Branch",
        render: (val, g) => (
          <div className="font-sans">
            <div className="font-semibold text-white">{val}</div>
            <div className="text-[11px] text-muted-foreground font-mono">{g.branch || "Head Office"}</div>
          </div>
        ),
      },
      {
        key: "beneficiary",
        header: "Beneficiary (Employer)",
        render: (val) => <div className="text-white/90 font-medium font-sans">{val}</div>,
      },
      {
        key: "project",
        header: "Linked Project / Tender",
        render: (proj) =>
          proj ? (
            <div className="font-sans">
              <span className="text-emerald-400 font-bold">{proj.code}</span>
              <p className="text-[11px] text-muted-foreground line-clamp-1">{proj.name}</p>
            </div>
          ) : (
            <Badge variant="outline" className="text-[10px] font-mono text-amber-400 border-amber-500/30 bg-amber-500/10">
              Pre-Award / Tender
            </Badge>
          ),
      },
      {
        key: "amount",
        header: "Value (NPR)",
        align: "right",
        summary: "sum",
        className: "font-bold text-white font-mono",
        render: (val) => `Rs. ${formatNpr(val)}`,
      },
      {
        key: "marginAmount",
        header: "Margin / Comm.",
        align: "right",
        render: (marginVal, g) => (
          <div className="font-mono">
            <div className="text-amber-400 font-bold">M: Rs. {formatNpr(marginVal)}</div>
            <div className="text-blue-400 text-[10px]">C: Rs. {formatNpr(g.commissionPaid)}</div>
          </div>
        ),
      },
      {
        key: "expiryDate",
        header: "Expiry Miti (Days Left)",
        render: (val, g) => (
          <div className="font-sans">
            <div className="font-mono font-bold text-white">{g.expiryMiti || format(new Date(val), "yyyy-MM-dd")}</div>
            {g.status === "active" || g.status === "extended" ? (
              <div className={cn("text-[10px] font-mono mt-0.5", g.daysRemaining <= 30 ? "text-rose-400 font-bold" : "text-muted-foreground")}>
                {g.daysRemaining >= 0 ? `${g.daysRemaining} days left` : "Expired"}
              </div>
            ) : (
              <div className="text-[10px] text-muted-foreground capitalize font-mono">{g.status}</div>
            )}
          </div>
        ),
      },
      {
        key: "status",
        header: "Status",
        align: "center",
        render: (val) => (
          <StatusBadge
            status={val === "active" ? "active" : val === "extended" ? "in_progress" : val === "released" ? "approved" : "rejected"}
            label={val}
            size="xs"
          />
        ),
      },
      {
        key: "id",
        header: "Actions",
        align: "right",
        render: (idVal, g) => (
          <div className="flex items-center justify-end gap-1.5 font-sans">
            {g.status !== "released" && (
              <Button
                onClick={() => releaseMutation.mutate({ id: idVal })}
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-[10px] font-bold text-muted-foreground hover:text-emerald-400 hover:bg-emerald-500/10"
              >
                Release
              </Button>
            )}
            <Button
              onClick={() => {
                if (confirm("Delete this guarantee record?")) {
                  deleteMutation.mutate({ id: idVal });
                }
              }}
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-muted-foreground hover:text-rose-400 hover:bg-rose-500/10"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ),
      },
    ],
    [deleteMutation, releaseMutation]
  );

  return (
    <div className="space-y-6">
      {/* 4 Summary KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        <div className="bg-[#121820]/80 p-4 rounded-2xl border border-white/10 shadow-sm">
          <span className="text-[10px] uppercase font-mono text-muted-foreground tracking-wider">Total Active Exposure</span>
          <div className="text-xl font-bold font-mono text-white mt-1">
            {formatNpr(kpis.totalActiveExposure, { compact: true, prefix: "Rs." })}
          </div>
          <span className="text-[11px] text-muted-foreground">{kpis.activeCount} active & extended bonds</span>
        </div>

        <div className="bg-[#121820]/80 p-4 rounded-2xl border border-white/10 shadow-sm">
          <span className="text-[10px] uppercase font-mono text-muted-foreground tracking-wider">Total Blocked Margin (FD/Cash)</span>
          <div className="text-xl font-bold font-mono text-amber-400 mt-1">
            {formatNpr(kpis.totalMarginHeld, { compact: true, prefix: "Rs." })}
          </div>
          <span className="text-[11px] text-muted-foreground">Bank collateral locked</span>
        </div>

        <div className="bg-[#121820]/80 p-4 rounded-2xl border border-white/10 shadow-sm">
          <span className="text-[10px] uppercase font-mono text-muted-foreground tracking-wider">Commission Paid to Banks</span>
          <div className="text-xl font-bold font-mono text-blue-400 mt-1">
            {formatNpr(kpis.totalCommissionPaid, { compact: true, prefix: "Rs." })}
          </div>
          <span className="text-[11px] text-muted-foreground">Total finance fee</span>
        </div>

        <div className="bg-[#121820]/80 p-4 rounded-2xl border border-white/10 shadow-sm">
          <span className="text-[10px] uppercase font-mono text-muted-foreground tracking-wider">Expiring in 30 Days (जोखिम)</span>
          <div className={cn("text-xl font-bold font-mono mt-1", kpis.expiringWithin30DaysCount > 0 ? "text-rose-400 animate-pulse" : "text-emerald-400")}>
            {kpis.expiringWithin30DaysCount} Bonds
          </div>
          <span className="text-[11px] text-muted-foreground">Require extension or release</span>
        </div>
      </div>

      {/* Guarantees Construction Table */}
      <ConstructionTable
        title="Commercial Bank Guarantees & Tender Securities"
        data={items}
        columns={columns}
        searchPlaceholder="Search BG number, issuing bank, employer..."
        exportExcel={{
          filename: `BankGuarantees_${format(new Date(), "yyyy-MM-dd")}`,
          sheetName: "Guarantees",
        }}
        emptyState={{
          icon: ShieldAlert,
          title: "No Guarantees or Bid Bonds Found",
          description: "Track tender bid bonds, performance securities, APG, and CAR insurances across all commercial banks.",
        }}
        headerActions={
          <div className="flex items-center gap-2">
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="h-8 text-xs bg-[#161d26] border-white/10 text-white w-40 rounded-lg">
                <SelectValue placeholder="All Types" />
              </SelectTrigger>
              <SelectContent className="bg-[#0f141c] border-white/10 text-white text-xs">
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="bid_bond">Bid Bonds / Tender</SelectItem>
                <SelectItem value="performance_bond">Performance Bonds</SelectItem>
                <SelectItem value="advance_payment">Mobilization APG</SelectItem>
                <SelectItem value="retention_bond">Retention Guarantees</SelectItem>
                <SelectItem value="car_insurance">CAR Insurance</SelectItem>
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={(v: any) => setStatusFilter(v)}>
              <SelectTrigger className="h-8 text-xs bg-[#161d26] border-white/10 text-white w-28 rounded-lg">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent className="bg-[#0f141c] border-white/10 text-white text-xs">
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="extended">Extended</SelectItem>
                <SelectItem value="released">Released</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
              </SelectContent>
            </Select>

            <Button
              onClick={() => setCreateDialogOpen(true)}
              className="h-8 px-3 text-xs font-semibold bg-[#00ff66] text-black hover:bg-[#00e65c] rounded-lg shadow-[0_0_15px_rgba(0,255,102,0.25)] gap-1"
            >
              <Plus className="h-3.5 w-3.5" /> Add BG
            </Button>
          </div>
        }
      />

      {/* Register BG / Bid Bond Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="sm:max-w-[560px] bg-[#0c1015] border-white/10 text-white backdrop-blur-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold text-white">
              <ShieldCheck className="h-5 w-5 text-emerald-400" /> Register Bank Guarantee / Bid Bond
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Register commercial bank guarantee, tender bid bond, or contractor insurance policy.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateSubmit} className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Guarantee Type *</Label>
                <Select value={type} onValueChange={(v: any) => setType(v)}>
                  <SelectTrigger className="h-9 text-xs bg-[#161d26] border-white/10 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#161d26] border-white/10 text-white text-xs">
                    <SelectItem value="bid_bond">Bid Bond (बोलपत्र जमानत)</SelectItem>
                    <SelectItem value="performance_bond">Performance Bond (कार्यसम्पादन)</SelectItem>
                    <SelectItem value="advance_payment">Mobilization APG (पेश्की जमानत)</SelectItem>
                    <SelectItem value="retention_bond">Retention Bond (धरौटी जमानत)</SelectItem>
                    <SelectItem value="car_insurance">CAR Insurance (जोखिम बीमा)</SelectItem>
                    <SelectItem value="other">Other Guarantee</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold">Guarantee / Policy Number *</Label>
                <Input
                  required
                  placeholder="e.g. BG-NBL-2081-9921"
                  value={guaranteeNumber}
                  onChange={(e) => setGuaranteeNumber(e.target.value)}
                  className="h-9 text-xs bg-[#161d26] border-white/10 text-white font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Issuing Bank / Insurer *</Label>
                <Input
                  required
                  placeholder="e.g. Nabil Bank Ltd."
                  value={issuingBank}
                  onChange={(e) => setIssuingBank(e.target.value)}
                  className="h-9 text-xs bg-[#161d26] border-white/10 text-white"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold">Branch Name</Label>
                <Input
                  placeholder="e.g. Putalisadak Branch"
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  className="h-9 text-xs bg-[#161d26] border-white/10 text-white"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold">Beneficiary (Client / Employer) *</Label>
              <Input
                required
                placeholder="e.g. Department of Roads, Bridge Division"
                value={beneficiary}
                onChange={(e) => setBeneficiary(e.target.value)}
                className="h-9 text-xs bg-[#161d26] border-white/10 text-white"
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Amount (NPR) *</Label>
                <Input
                  required
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="h-9 text-xs bg-[#161d26] border-white/10 text-white font-mono font-bold"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold">Margin Amount</Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={marginAmount}
                  onChange={(e) => setMarginAmount(e.target.value)}
                  className="h-9 text-xs bg-[#161d26] border-white/10 text-white font-mono"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold">Commission Paid</Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={commissionPaid}
                  onChange={(e) => setCommissionPaid(e.target.value)}
                  className="h-9 text-xs bg-[#161d26] border-white/10 text-white font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Issue Date (AD)</Label>
                <Input
                  type="date"
                  value={issueDate}
                  onChange={(e) => {
                    setIssueDate(e.target.value);
                    try { setIssueMiti(adToBs(e.target.value).formatted); } catch {}
                  }}
                  className="h-9 text-xs bg-[#161d26] border-white/10 text-white font-mono"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Expiry Date (AD) *</Label>
                <Input
                  required
                  type="date"
                  value={expiryDate}
                  onChange={(e) => {
                    setExpiryDate(e.target.value);
                    try { setExpiryMiti(adToBs(e.target.value).formatted); } catch {}
                  }}
                  className="h-9 text-xs bg-[#161d26] border-white/10 text-white font-mono text-amber-400"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Link to Project (Optional)</Label>
              <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
                <SelectTrigger className="h-9 text-xs bg-[#161d26] border-white/10 text-white">
                  <SelectValue placeholder="Select Project" />
                </SelectTrigger>
                <SelectContent className="bg-[#161d26] border-white/10 text-white text-xs">
                  <SelectItem value="none">None (Pre-Award Tender Bid Bond)</SelectItem>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.code} - {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Attachment Upload / Dropzone */}
            <AttachmentDropzone
              value={documentUrl}
              onChange={(url, file) => {
                setDocumentUrl(url || "");
                if (file) setDocumentName(file.name);
              }}
              label="Guarantee Scanned PDF / Document (फाइल / कागजात छान्नुहोस्)"
              accept=".pdf,image/*,application/pdf"
              maxSizeMb={10}
            />

            <div className="space-y-1">
              <Label className="text-xs">Remarks / Notes</Label>
              <Textarea
                rows={2}
                placeholder="Any special terms, collateral pledged, or extension conditions..."
                className="text-xs bg-[#161d26] border-white/10 text-white"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-white/10">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setCreateDialogOpen(false)}
                className="text-xs text-muted-foreground hover:text-white"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createMutation.isPending}
                className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs"
              >
                {createMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                Save Guarantee
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
