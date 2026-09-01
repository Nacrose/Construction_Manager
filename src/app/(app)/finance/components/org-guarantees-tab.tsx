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
  Pencil,
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
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { sanitizeUrl } from "@/lib/safe-url";
import { GuaranteeFormDialog } from "@/app/(app)/projects/[id]/guarantees/dialogs/guarantee-form-dialog";

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
  const [editingGuarantee, setEditingGuarantee] = useState<any | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "extended" | "released" | "expired">("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  const [confirmModal, setConfirmModal] = useState<{
    open: boolean;
    type: "release" | "delete";
    id: string;
    title: string;
    description: string;
    variant: "destructive" | "warning";
    confirmLabel: string;
  } | null>(null);

  const { data: projectList } = trpc.project.list.useQuery();
  const projects = projectList?.projects || [];

  const { data, isLoading } = trpc.bankGuarantee.list.useQuery({
    status: statusFilter !== "all" ? statusFilter : undefined,
    type: typeFilter !== "all" ? typeFilter : undefined,
  });

  const releaseMutation = trpc.bankGuarantee.release.useMutation({
    onSuccess: () => {
      toast.success("Guarantee marked as released & margin unblocked");
      utils.bankGuarantee.list.invalidate();
      setConfirmModal(null);
    },
    onError: (err) => toastError("Guarantee could not be marked as released. Please try again.", err.message),
  });

  const deleteMutation = trpc.bankGuarantee.delete.useMutation({
    onSuccess: () => {
      toast.success("Guarantee record deleted");
      utils.bankGuarantee.list.invalidate();
      utils.finance.orgMasterDayBook.invalidate();
      utils.finance.orgBankAccounts.invalidate();
      setConfirmModal(null);
    },
    onError: (err) => toastError("Guarantee record could not be deleted. Please try again.", err.message),
  });

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
                onClick={() =>
                  setConfirmModal({
                    open: true,
                    type: "release",
                    id: idVal,
                    title: "Release Bank Guarantee?",
                    description: `Mark guarantee #${g.guaranteeNumber} (${g.issuingBank}) as officially released/returned by the employer? This will unblock Rs. ${formatNpr(g.marginAmount)} in margin funds.`,
                    variant: "warning",
                    confirmLabel: "Confirm Release",
                  })
                }
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-[10px] font-bold text-muted-foreground hover:text-emerald-400 hover:bg-emerald-500/10"
              >
                Release
              </Button>
            )}
            <Button
              onClick={() => setEditingGuarantee(g)}
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-muted-foreground hover:text-white hover:bg-white/10"
              title="Edit Guarantee & Ledger"
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              onClick={() =>
                setConfirmModal({
                  open: true,
                  type: "delete",
                  id: idVal,
                  title: "Delete Guarantee Record?",
                  description: `Permanently remove guarantee #${g.guaranteeNumber}? This will also remove any auto-posted Day Book commission entry. This action cannot be undone.`,
                  variant: "destructive",
                  confirmLabel: "Delete Record",
                })
              }
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
      {createDialogOpen && (
        <GuaranteeFormDialog
          open={createDialogOpen}
          onOpenChange={setCreateDialogOpen}
          onDone={() => setCreateDialogOpen(false)}
        />
      )}

      {/* Edit Guarantee Dialog */}
      {editingGuarantee && (
        <GuaranteeFormDialog
          open={Boolean(editingGuarantee)}
          onOpenChange={(open) => {
            if (!open) setEditingGuarantee(null);
          }}
          initialData={editingGuarantee}
          onDone={() => setEditingGuarantee(null)}
        />
      )}

      {/* Confirmation Dialog for Release / Delete */}
      {confirmModal && (
        <ConfirmDialog
          open={confirmModal.open}
          onOpenChange={(open) => {
            if (!open) setConfirmModal(null);
          }}
          title={confirmModal.title}
          description={confirmModal.description}
          variant={confirmModal.variant}
          confirmLabel={confirmModal.confirmLabel}
          isLoading={releaseMutation.isPending || deleteMutation.isPending}
          onConfirm={async () => {
            if (confirmModal.type === "release") {
              await releaseMutation.mutateAsync({ id: confirmModal.id });
            } else if (confirmModal.type === "delete") {
              await deleteMutation.mutateAsync({ id: confirmModal.id });
            }
          }}
        />
      )}
    </div>
  );
}
