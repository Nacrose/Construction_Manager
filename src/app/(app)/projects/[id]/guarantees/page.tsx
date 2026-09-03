"use client";

import { use, useState } from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc-client";
import { sanitizeUrl } from "@/lib/safe-url";
import { ModuleTabs } from "@/components/module-tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import {
  ShieldAlert,
  ShieldCheck,
  Plus,
  CalendarClock,
  Building2,
  AlertTriangle,
  Download,
  Trash2,
  Check,
  Eye,
  AlertCircle,
  Pencil,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { toastError } from "@/lib/toast-error";
import { cn } from "@/lib/utils";
import { formatNpr } from "@/lib/currency";
import { StatusBadge } from "@/components/ui/status-badge";
import { GuaranteeFormDialog } from "./dialogs/guarantee-form-dialog";
import { ExtendGuaranteeDialog } from "./dialogs/extend-guarantee-dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ConstructionTable, ConstructionTableColumn } from "@/components/ui/construction-table";

const CONTRACT_TABS = [
  { label: "BOQ & Rates", href: "/boq" },
  { label: "Bank Guarantees & Insurance", href: "/guarantees" },
  { label: "IPC Certificates", href: "/ipc" },
  { label: "Variation Orders", href: "/variations" },
  { label: "RFI / Workflow", href: "/workflow/rfi" },
  { label: "Submittals", href: "/submittals" },
];

const TYPE_LABELS: Record<string, { label: string; labelNp: string; color: string }> = {
  performance_bond: {
    label: "Performance Security",
    labelNp: "कार्यसम्पादन जमानत",
    color: "bg-info/10 text-info dark:bg-[var(--navy-deep)]/50 dark:text-info/80 border-info/30",
  },
  advance_payment: {
    label: "Mobilization APG",
    labelNp: "पेश्की जमानत",
    color: "bg-purple-50 text-purple-700 dark:bg-purple-950/50 dark:text-purple-300 border-purple-200",
  },
  car_insurance: {
    label: "CAR Insurance",
    labelNp: "निर्माण जोखिम बीमा",
    color: "bg-success/10 text-success dark:bg-success dark:text-success/80 border-success/30",
  },
  retention_bond: {
    label: "Retention Guarantee",
    labelNp: "धरौटी जमानत",
    color: "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300 border-amber-200",
  },
  bid_bond: {
    label: "Bid Bond / EMD",
    labelNp: "बोलपत्र जमानत",
    color: "bg-muted/60 text-foreground/80 dark:bg-[var(--navy-mid)] dark:text-foreground/80 border-border",
  },
  other: {
    label: "Other Guarantee",
    labelNp: "अन्य जमानत",
    color: "bg-muted/60 text-foreground/80 dark:bg-[var(--navy-mid)] dark:text-foreground/80 border-border",
  },
};

export default function BankGuaranteesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: projectId } = use(params);
  const utils = trpc.useUtils();

  const [addOpen, setAddOpen] = useState(false);
  const [editItem, setEditItem] = useState<any | null>(null);
  const [extendItem, setExtendItem] = useState<any | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "extended" | "released" | "expired">("all");

  const [confirmModal, setConfirmModal] = useState<{
    open: boolean;
    type: "release" | "delete";
    id: string;
    title: string;
    description: string;
    variant: "destructive" | "warning";
    confirmLabel: string;
  } | null>(null);

  const { data, isLoading } = trpc.bankGuarantee.list.useQuery({
    projectId,
    status: statusFilter,
  });

  const releaseMutation = trpc.bankGuarantee.release.useMutation({
    onSuccess: () => {
      toast.success("Bank guarantee marked as released / returned");
      utils.bankGuarantee.list.invalidate({ projectId });
      setConfirmModal(null);
    },
    onError: (e) => toast.error(e.message || "Failed to release guarantee"),
  });

  const deleteMutation = trpc.bankGuarantee.delete.useMutation({
    onSuccess: () => {
      toast.success("Guarantee record deleted");
      utils.bankGuarantee.list.invalidate({ projectId });
      setConfirmModal(null);
    },
    onError: (e) => toast.error(e.message || "Failed to delete guarantee"),
  });

  const items = data?.items || [];
  const kpis = data?.kpis;


  const columns: ConstructionTableColumn<any>[] = [
    {
      key: "type",
      header: "Type & Details",
      render: (_, g) => {
        const typeMeta = TYPE_LABELS[g.type] || TYPE_LABELS.other;
        return (
          <div className="font-sans">
            <Badge
              variant="outline"
              className={cn("text-[10px] font-medium border", typeMeta.color)}
            >
              {typeMeta.label}
            </Badge>
            <div className="font-mono font-bold text-foreground text-xs mt-1">
              {g.guaranteeNumber}
            </div>
            {g.purpose && (
              <div className="text-[11px] text-muted-foreground truncate max-w-xs mt-0.5">
                {g.purpose}
              </div>
            )}
          </div>
        );
      },
    },
    {
      key: "issuingBank",
      header: "Issuing Bank & Beneficiary",
      render: (_, g) => (
        <div className="font-sans">
          <div className="font-semibold text-foreground flex items-center gap-1 text-xs">
            <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
            {g.issuingBank} {g.branch ? `(${g.branch})` : ""}
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            To: {g.beneficiary}
          </div>
        </div>
      ),
    },
    {
      key: "amount",
      header: "Amount (NPR)",
      align: "right",
      render: (_, g) => (
        <span className="font-bold font-mono text-foreground text-xs">
          {formatNpr(g.amount)}
        </span>
      ),
    },
    {
      key: "marginAmount",
      header: "Cash Margin",
      align: "right",
      render: (_, g) => (
        <span className="font-mono text-muted-foreground text-xs">
          {g.marginAmount > 0 ? formatNpr(g.marginAmount) : "—"}
        </span>
      ),
    },
    {
      key: "issuedDate",
      header: "Issue Date (BS)",
      render: (_, g) => (
        <div className="font-mono text-xs">
          <div className="font-bold text-foreground">{g.issuedMiti || "—"}</div>
          <div className="text-[10px] text-muted-foreground">
            {format(new Date(g.issuedDate), "yyyy-MM-dd")}
          </div>
        </div>
      ),
    },
    {
      key: "expiryDate",
      header: "Expiry Date (BS)",
      render: (_, g) => (
        <div className="font-mono text-xs">
          <div className="font-bold text-foreground">{g.expiryMiti || "—"}</div>
          <div className="text-[10px] text-muted-foreground">
            {format(new Date(g.expiryDate), "yyyy-MM-dd")}
          </div>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status / Countdown",
      align: "center",
      render: (_, g) => {
        const isReleased = g.status === "released";
        if (isReleased) {
          return (
            <Badge variant="outline" className="bg-muted text-foreground/80 dark:bg-[var(--navy-mid)] text-[10px]">
              Released
            </Badge>
          );
        }
        if (g.isExpired) {
          return (
            <Badge variant="destructive" className="text-[10px]">
              Expired ({Math.abs(g.daysRemaining)}d ago)
            </Badge>
          );
        }
        if (g.isExpiringSoon) {
          return (
            <Badge className="bg-red-600 text-white animate-pulse text-[10px]">
              {g.daysRemaining} Days Left
            </Badge>
          );
        }
        return (
          <Badge variant="outline" className="bg-success/10 text-success dark:bg-success text-[10px] border-success/40">
            {g.daysRemaining} Days Left
          </Badge>
        );
      },
    },
    {
      key: "doc",
      header: "Doc",
      align: "center",
      render: (_, g) =>
        g.documentUrl ? (
          <a
            href={sanitizeUrl(g.documentUrl) ?? "#"}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center text-primary hover:underline"
            title="View Scanned Policy / BG"
          >
            <Eye className="h-4 w-4" />
          </a>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: "actions",
      header: "Actions",
      align: "center",
      render: (_, g) => {
        const isReleased = g.status === "released";
        return (
          <div className="flex items-center justify-center gap-1">
            {!isReleased && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-xs gap-1 font-mono"
                  onClick={() => setExtendItem(g)}
                >
                  <CalendarClock className="h-3 w-3 text-amber-500" />
                  Extend
                </Button>

                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs text-muted-foreground hover:text-success/80"
                  title="Mark as Released / Returned"
                  onClick={() =>
                    setConfirmModal({
                      open: true,
                      type: "release",
                      id: g.id,
                      title: "Release Bank Guarantee?",
                      description: `Mark guarantee #${g.guaranteeNumber} (${g.issuingBank}) as officially released/returned by the employer? This will unblock ${formatNpr(g.marginAmount)} in margin funds.`,
                      variant: "warning",
                      confirmLabel: "Confirm Release",
                    })
                  }
                >
                  <Check className="h-3.5 w-3.5" />
                </Button>
              </>
            )}

            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
              title="Edit Guarantee & Ledger"
              onClick={() => setEditItem(g)}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>

            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs text-muted-foreground hover:text-rose-400"
              onClick={() =>
                setConfirmModal({
                  open: true,
                  type: "delete",
                  id: g.id,
                  title: "Delete Guarantee Record?",
                  description: `Permanently delete guarantee #${g.guaranteeNumber}? This action cannot be undone.`,
                  variant: "destructive",
                  confirmLabel: "Delete Record",
                })
              }
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        );
      },
    },
  ];

  return (
    <>
      <ModuleTabs projectId={projectId} tabs={CONTRACT_TABS} />
      <div className="space-y-4 p-4">
        {/* KPI Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="border-l-4 border-l-info shadow-xs bg-card">
            <CardContent className="p-3.5 space-y-1">
              <div className="text-[10px] font-mono text-muted-foreground uppercase">
                Active Guarantees
              </div>
              <div className="text-xl font-bold font-mono text-info dark:text-info/80">
                {formatNpr(kpis?.totalActiveExposure || 0, { compact: true })}
              </div>
              <div className="text-[11px] text-muted-foreground font-mono">
                {kpis?.activeCount || 0} active instruments
              </div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-purple-500 shadow-xs bg-card">
            <CardContent className="p-3.5 space-y-1">
              <div className="text-[10px] font-mono text-muted-foreground uppercase">
                Blocked Cash Margin
              </div>
              <div className="text-xl font-bold font-mono text-purple-600 dark:text-purple-400">
                {formatNpr(kpis?.totalMarginHeld || 0, { compact: true })}
              </div>
              <div className="text-[11px] text-muted-foreground font-mono">
                Locked bank FD / margins
              </div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-amber-500 shadow-xs bg-card">
            <CardContent className="p-3.5 space-y-1">
              <div className="text-[10px] font-mono text-muted-foreground uppercase">
                Expiring in 30 Days
              </div>
              <div className="text-xl font-bold font-mono text-amber-600 dark:text-amber-400">
                {kpis?.expiringWithin30DaysCount || 0}
              </div>
              <div className="text-[11px] text-muted-foreground font-mono">
                Require renewal / extension
              </div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-red-500 shadow-xs bg-card">
            <CardContent className="p-3.5 space-y-1">
              <div className="text-[10px] font-mono text-muted-foreground uppercase">
                Overdue / Expired
              </div>
              <div className="text-xl font-bold font-mono text-red-600 dark:text-red-400">
                {kpis?.expiredCount || 0}
              </div>
              <div className="text-[11px] text-muted-foreground font-mono">
                Critical claim risk
              </div>
            </CardContent>
          </Card>
        </div>


        {/* Controls Ribbon */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-muted/20 p-2.5 rounded-lg border">
          <div className="flex items-center gap-2">
            <div className="flex items-center rounded-md border bg-background p-0.5">
              <Button
                size="sm"
                variant={statusFilter === "all" ? "default" : "ghost"}
                onClick={() => setStatusFilter("all")}
                className="h-7 text-xs font-mono px-3"
              >
                All
              </Button>
              <Button
                size="sm"
                variant={statusFilter === "active" ? "default" : "ghost"}
                onClick={() => setStatusFilter("active")}
                className="h-7 text-xs font-mono px-3"
              >
                Active
              </Button>
              <Button
                size="sm"
                variant={statusFilter === "released" ? "default" : "ghost"}
                onClick={() => setStatusFilter("released")}
                className="h-7 text-xs font-mono px-3"
              >
                Released
              </Button>
            </div>
          </div>

          <Button
            size="sm"
            onClick={() => setAddOpen(true)}
            className="h-8 text-xs gap-1.5 font-mono bg-info hover:bg-info text-white"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Guarantee
          </Button>
        </div>

        {/* Central Table Engine */}
        <ConstructionTable
          data={items}
          columns={columns}
          isLoading={isLoading}
          searchPlaceholder="Search bank guarantees by number, bank, beneficiary..."
          searchFilterKeys={["guaranteeNumber", "issuingBank", "beneficiary", "purpose", "type"]}
        />
      </div>

      {/* Add Dialog */}
      {addOpen && (
        <GuaranteeFormDialog
          open={addOpen}
          onOpenChange={setAddOpen}
          projectId={projectId}
          onDone={() => setAddOpen(false)}
        />
      )}

      {/* Edit Dialog */}
      {editItem && (
        <GuaranteeFormDialog
          open={Boolean(editItem)}
          onOpenChange={(open) => {
            if (!open) setEditItem(null);
          }}
          projectId={projectId}
          initialData={editItem}
          onDone={() => setEditItem(null)}
        />
      )}

      {/* Extend Dialog */}
      <Dialog open={Boolean(extendItem)} onOpenChange={(open) => !open && setExtendItem(null)}>
        {extendItem && (
          <ExtendGuaranteeDialog
            guarantee={extendItem}
            onDone={() => setExtendItem(null)}
          />
        )}
      </Dialog>

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
    </>
  );
}
