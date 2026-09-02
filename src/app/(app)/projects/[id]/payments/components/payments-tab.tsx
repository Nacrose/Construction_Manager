"use client";

import { useState, useMemo, useEffect } from "react";
import { trpc } from "@/lib/trpc-client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
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
  Plus,
  Inbox,
  FolderTree,
  UploadCloud,
  Eye,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { adToBs } from "@/lib/nepali-calendar";
import { formatNpr } from "@/lib/construction-finance";
import { ConstructionTable, type ConstructionTableColumn } from "@/components/ui/construction-table";
import { RecordPaymentDialog } from "./record-payment-dialog";
import { CategoryManagerDialog } from "./category-manager-dialog";
import { BulkImportDialog } from "./bulk-import-dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

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
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; amount: number; payeeName: string } | null>(null);

  // Filters
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
  });

  const { data: stats } = trpc.projectOps.payment.stats.useQuery({ projectId });
  const payments = listData?.payments ?? [];

  const deleteMut = trpc.projectOps.payment.delete.useMutation({
    onSuccess: () => {
      toast.success("Payment record deleted");
      utils.projectOps.payment.list.invalidate({ projectId });
      utils.projectOps.payment.stats.invalidate({ projectId });
      utils.projectOps.payment.categorySummary.invalidate({ projectId });
      setDeleteTarget(null);
    },
    onError: (err) => {
      toast.error(err.message || "Failed to delete payment");
    },
  });

  useEffect(() => {
    if (initialPayable) {
      setAddOpen(true);
    }
  }, [initialPayable, setAddOpen]);

  const columns: ConstructionTableColumn<any>[] = useMemo(
    () => [
      {
        key: "paymentDate",
        header: "Date (BS / AD)",
        render: (_val, row) => {
          let bsMiti = row.paymentMiti;
          if (!bsMiti) {
            try {
              bsMiti = adToBs(row.paymentDate).formatted;
            } catch {
              bsMiti = "—";
            }
          }
          return (
            <div>
              <div className="font-bold text-foreground leading-tight">{bsMiti}</div>
              <div className="text-[10px] text-muted-foreground leading-tight">
                {format(new Date(row.paymentDate), "yyyy-MM-dd")}
              </div>
            </div>
          );
        },
      },
      {
        key: "accountingVoucherNo",
        header: "Voucher #",
        render: (val, row) =>
          val ? (
            <div className="flex flex-col">
              <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 font-bold text-[var(--primary)] border-[var(--border)] w-fit">
                {val}
              </Badge>
              {row.accountingSoftware && (
                <span className="text-[9px] text-muted-foreground uppercase mt-0.5">
                  {row.accountingSoftware}
                </span>
              )}
            </div>
          ) : row.chequeNo ? (
            <span className="text-[10px] text-muted-foreground font-mono">Chq: {row.chequeNo}</span>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        key: "category",
        header: "Category & Head",
        render: (val, row) => (
          <div>
            <div className="font-bold text-foreground truncate text-xs">{val || "General"}</div>
            {row.subCategory && (
              <div className="text-[10px] text-muted-foreground truncate">↳ {row.subCategory}</div>
            )}
          </div>
        ),
      },
      {
        key: "payeeName",
        header: "Payee & Narration",
        className: "font-sans",
        render: (val, row) => (
          <div>
            <div className="font-semibold text-foreground truncate max-w-[220px] text-xs">{val}</div>
            <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground font-mono">
              {row.partyPan && <span>PAN: {row.partyPan}</span>}
              {row.notes && <span className="truncate max-w-[200px] text-muted-foreground">{row.notes}</span>}
            </div>
          </div>
        ),
      },
      {
        key: "paymentMode",
        header: "Mode / Account",
        render: (val, row) => (
          <div>
            <div className="capitalize text-foreground/80 font-medium text-xs">
              {val?.replace(/_/g, " ") || "—"}
            </div>
            {row.bankAccount && (
              <div className="text-[10px] text-muted-foreground truncate max-w-[120px]">
                {row.bankAccount}
              </div>
            )}
          </div>
        ),
      },
      {
        key: "amount",
        header: "Gross Amount",
        align: "right",
        summary: "sum",
        className: "text-foreground/90 font-bold",
        render: (val) => formatNpr(val),
      },
      {
        key: "tdsDeducted",
        header: "TDS (1.5%)",
        align: "right",
        summary: "sum",
        className: "text-red-400 font-bold",
        render: (val) => (val > 0 ? formatNpr(val) : "—"),
      },
      {
        key: "netPaid",
        header: "Net Paid",
        align: "right",
        summary: "sum",
        className: "text-[var(--primary)] font-bold font-mono",
        render: (val) => formatNpr(val),
      },
      {
        key: "scannedBillUrl",
        header: "Scan",
        align: "center",
        render: (val) =>
          val ? (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setViewScanUrl(val)}
              className="h-6 w-6 text-[var(--primary)] hover:bg-emerald-500/20"
              title="View Voucher Scan"
            >
              <Eye className="h-3.5 w-3.5" />
            </Button>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      ...(canWrite
        ? [
            {
              key: "id" as const,
              header: "Action",
              align: "center" as const,
              render: (idVal: any, row: any) => (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setDeleteTarget({ id: idVal, amount: row.amount, payeeName: row.payeeName })}
                  className="h-6 w-6 text-muted-foreground hover:text-red-400 hover:bg-red-500/10"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              ),
            },
          ]
        : []),
    ],
    [canWrite, deleteMut, projectId]
  );

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-16 w-full rounded-2xl bg-white/5" />
        <Skeleton className="h-64 w-full rounded-2xl bg-white/5" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Single-Line Summary Strip (Khatabook Style) */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 rounded-xl border border-[var(--border)] bg-card text-xs font-mono">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Total Disbursements:</span>
            <span className="font-bold text-red-400">NPR {formatNpr(stats?.totalPaid || 0)}</span>
          </div>
          <div className="h-3 w-[1px] bg-white/10" />
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">TDS Remitted:</span>
            <span className="font-bold text-amber-400">NPR {formatNpr(stats?.totalTds || 0)}</span>
          </div>
          <div className="h-3 w-[1px] bg-white/10" />
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Net Cash Outflow:</span>
            <span className="font-bold text-[var(--primary)]">NPR {formatNpr((stats?.totalPaid || 0) - (stats?.totalTds || 0))}</span>
          </div>
        </div>

        <div className="text-[11px] text-muted-foreground font-mono">
          {payments.length} Payments Recorded
        </div>
      </div>

      {/* Construction Table */}
      <ConstructionTable
        title="Project Disbursements & Payments Register"
        data={payments}
        columns={columns}
        searchPlaceholder="Search payee, PAN, voucher, narration..."
        exportExcel={{
          filename: `Payments_${projectId}_${format(new Date(), "yyyy-MM-dd")}`,
          sheetName: "Disbursements",
        }}
        emptyState={{
          icon: Inbox,
          title: "No Payments Recorded",
          description: "Click '+ Record Payment' or 'Bulk Import' to log site disbursements.",
        }}
        headerActions={
          <div className="flex items-center gap-2">
            {/* Category Filter */}
            <div className="w-32">
              <Select value={filterCategory} onValueChange={setFilterCategory}>
                <SelectTrigger className="h-8 text-xs font-mono bg-[#f8fbfe] border-[var(--border)] text-foreground rounded-lg">
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent className="bg-card border-emerald-500/30 text-xs">
                  <SelectItem value="all">All Categories</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.name}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Payee Type Filter */}
            <div className="w-28">
              <Select value={filterPayeeType} onValueChange={setFilterPayeeType}>
                <SelectTrigger className="h-8 text-xs font-mono bg-[#f8fbfe] border-[var(--border)] text-foreground rounded-lg">
                  <SelectValue placeholder="All Payees" />
                </SelectTrigger>
                <SelectContent className="bg-card border-emerald-500/30 text-xs">
                  <SelectItem value="all">All Payees</SelectItem>
                  <SelectItem value="vendor">Vendor</SelectItem>
                  <SelectItem value="subcontractor">Subcontractor</SelectItem>
                  <SelectItem value="supplier">Supplier</SelectItem>
                  <SelectItem value="staff">Staff</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {canWrite && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setCatManagerOpen(true)}
                  className="h-8 px-2.5 text-xs font-mono text-amber-400 border-amber-500/30 bg-[#f8fbfe] hover:bg-muted/60 rounded-lg gap-1"
                >
                  <FolderTree className="h-3 w-3" /> Categories
                </Button>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setBulkImportOpen(true)}
                  className="h-8 px-2.5 text-xs font-mono text-purple-400 border-purple-500/30 bg-[#f8fbfe] hover:bg-muted/60 rounded-lg gap-1"
                >
                  <UploadCloud className="h-3 w-3" /> Import
                </Button>

                <Button
                  size="sm"
                  onClick={() => setAddOpen(true)}
                  className="h-8 px-3 text-xs font-semibold amber-cta-btn rounded-lg shadow-[0_0_15px_rgba(245,158,11,0.25)] gap-1"
                >
                  <Plus className="h-3 w-3" /> + Record Payment
                </Button>
              </>
            )}
          </div>
        }
      />

      {/* Record Payment Dialog */}
      <RecordPaymentDialog
        projectId={projectId}
        open={addOpen}
        onOpenChange={setAddOpen}
        initialPayable={initialPayable}
        onSuccess={() => {
          if (onClearInitialPayable) onClearInitialPayable();
          utils.projectOps.payment.list.invalidate({ projectId });
          utils.projectOps.payment.stats.invalidate({ projectId });
          utils.projectOps.payment.categorySummary.invalidate({ projectId });
        }}
      />

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
        <DialogContent className="max-w-3xl max-h-[85vh] p-4 flex flex-col font-sans bg-card border-[var(--border)] text-foreground">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold">Attached Payment Voucher / Receipt</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-auto flex items-center justify-center p-2 bg-[#f8fbfe] rounded-xl border border-[var(--border)] min-h-[300px]">
            {viewScanUrl?.startsWith("data:application/pdf") ? (
              <iframe src={viewScanUrl} className="w-full h-[60vh] rounded" title="Payment Voucher PDF" />
            ) : viewScanUrl ? (
              <img src={viewScanUrl} alt="Voucher" className="max-h-[60vh] max-w-full object-contain rounded shadow" />
            ) : null}
          </div>
          <DialogFooter>
            <Button size="sm" onClick={() => setViewScanUrl(null)} className="h-8 text-xs bg-white/10 hover:bg-white/20 text-foreground rounded-xl">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmation Modal for Payment Voucher Deletion */}
      {deleteTarget && (
        <ConfirmDialog
          open={Boolean(deleteTarget)}
          onOpenChange={(open) => {
            if (!open) setDeleteTarget(null);
          }}
          title="Delete Payment Voucher?"
          description={`Are you sure you want to permanently delete the payment of NPR ${formatNpr(deleteTarget.amount)} to ${deleteTarget.payeeName}? This action cannot be undone.`}
          variant="destructive"
          confirmLabel="Delete Payment"
          isLoading={deleteMut.isPending}
          onConfirm={async () => {
            await deleteMut.mutateAsync({ id: deleteTarget.id, projectId });
          }}
        />
      )}
    </div>
  );
}
