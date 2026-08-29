"use client";

import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc-client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Eye,
  Package,
  Layers,
  Truck,
  Receipt,
  FileText,
  Filter,
} from "lucide-react";
import { format } from "date-fns";
import { adToBs } from "@/lib/nepali-calendar";
import { formatNpr } from "@/lib/construction-finance";
import { ConstructionTable, type ConstructionTableColumn } from "@/components/ui/construction-table";
import { StatusBadge } from "@/components/ui/status-badge";

export function PurchaseRegisterTab({
  projectId,
  canWrite = false,
}: {
  projectId: string;
  canWrite?: boolean;
}) {
  const [filterMissingOnly, setFilterMissingOnly] = useState(false);
  const [selectedScan, setSelectedScan] = useState<{ url: string; name: string } | null>(null);

  const { data, isLoading } = trpc.vatRegister.getPurchaseRegister.useQuery({ projectId });

  const getSourceIcon = (source: string) => {
    switch (source) {
      case "vendor_bill":
        return <Package className="h-3 w-3 text-blue-500" />;
      case "subcontractor":
        return <Layers className="h-3 w-3 text-purple-500" />;
      case "equipment":
        return <Truck className="h-3 w-3 text-amber-500" />;
      default:
        return <Receipt className="h-3 w-3 text-emerald-500" />;
    }
  };

  const rows = data?.rows || [];
  const totals = data?.totals || {
    totalGross: 0,
    totalExempt: 0,
    totalTaxableLocal: 0,
    totalVatAmount: 0,
    totalTds: 0,
    totalNetPayable: 0,
    missingScansCount: 0,
  };

  const filtered = useMemo(() => {
    if (!filterMissingOnly) return rows;
    return rows.filter((r) => !r.isBillAttached);
  }, [rows, filterMissingOnly]);

  const columns: ConstructionTableColumn<any>[] = useMemo(
    () => [
      {
        key: "date",
        header: "Miti / Date",
        render: (val) => {
          let bsMiti = "—";
          try {
            bsMiti = adToBs(val).formatted;
          } catch {}
          return (
            <div className="font-mono text-[11px]">
              <span className="font-semibold text-foreground">{bsMiti}</span>
              <span className="block text-[10px] text-muted-foreground">{format(new Date(val), "dd MMM yyyy")}</span>
            </div>
          );
        },
      },
      {
        key: "invoiceNo",
        header: "Invoice #",
        className: "font-bold text-foreground font-mono",
        render: (val, r) => (
          <div className="flex items-center gap-1.5">
            {getSourceIcon(r.source)}
            <span>{val}</span>
          </div>
        ),
      },
      {
        key: "partyName",
        header: "Supplier / Party",
        render: (val, r) => (
          <div className="font-sans max-w-[200px] truncate" title={r.description}>
            <span className="font-semibold text-foreground">{val}</span>
            <span className="block text-[10px] text-muted-foreground truncate">{r.description}</span>
          </div>
        ),
      },
      {
        key: "partyPan",
        header: "PAN / VAT",
        className: "font-mono text-muted-foreground",
        render: (val) => val || "—",
      },
      {
        key: "totalAmount",
        header: "Gross Total",
        align: "right",
        summary: "sum",
        className: "font-mono font-semibold text-foreground",
        render: (val) => formatNpr(val),
      },
      {
        key: "exemptAmount",
        header: "Exempt",
        align: "right",
        summary: "sum",
        className: "font-mono text-muted-foreground",
        render: (val) => (val > 0 ? formatNpr(val) : "—"),
      },
      {
        key: "taxableLocal",
        header: "Taxable Local",
        align: "right",
        summary: "sum",
        className: "font-mono text-foreground",
        render: (val) => formatNpr(val),
      },
      {
        key: "vatAmount",
        header: "VAT (13%)",
        align: "right",
        summary: "sum",
        className: "font-mono font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50/20 dark:bg-emerald-950/10",
        render: (val) => formatNpr(val),
      },
      {
        key: "tdsAmount",
        header: "TDS",
        align: "right",
        summary: "sum",
        className: "font-mono text-red-600",
        render: (val) => (val > 0 ? formatNpr(val) : "—"),
      },
      {
        key: "netPayable",
        header: "Net Paid",
        align: "right",
        summary: "sum",
        className: "font-mono font-bold text-foreground",
        render: (val) => formatNpr(val),
      },
      {
        key: "isBillAttached",
        header: "Scan",
        align: "center",
        render: (val, r) =>
          val && r.scannedBillUrl ? (
            <button
              type="button"
              onClick={() => setSelectedScan({ url: r.scannedBillUrl!, name: r.invoiceNo })}
              className="inline-flex items-center gap-0.5 text-[10px] text-emerald-700 dark:text-emerald-400 hover:underline font-sans"
            >
              <Eye className="h-3 w-3" /> View
            </button>
          ) : (
            <StatusBadge status="rejected" label="Missing" size="xs" />
          ),
      },
    ],
    []
  );

  return (
    <div className="space-y-3 font-sans">
      {/* IRD Schedule 8 Legal Tax Header Banner */}
      <div className="rounded-xl border bg-card p-3 shadow-xs space-y-1">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2">
          <div>
            <span className="text-[10px] uppercase font-mono tracking-wider text-muted-foreground font-semibold">
              अनुसूची-८ (नियम २३ को उपनियम (१) को खण्ड (छ) सँग सम्बन्धित)
            </span>
            <h3 className="text-sm font-bold text-foreground">
              खरिद खाता (VAT Purchase Register - Schedule 8)
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant={filterMissingOnly ? "default" : "outline"}
              onClick={() => setFilterMissingOnly(!filterMissingOnly)}
              className="h-7 text-xs gap-1"
            >
              <Filter className="h-3 w-3" />
              {filterMissingOnly ? "Showing Missing Scans" : "Missing Scans Only"}
            </Button>
          </div>
        </div>

        {/* 4 Quick Stat Badges */}
        <div className="flex flex-wrap items-center gap-4 text-xs font-mono pt-1">
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">Total Invoiced:</span>
            <span className="font-bold text-foreground">NPR {formatNpr(totals.totalGross)}</span>
          </div>
          <div className="h-3 w-px bg-border" />
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">Input VAT Credit (13%):</span>
            <span className="font-bold text-emerald-700 dark:text-emerald-300">
              NPR {formatNpr(totals.totalVatAmount)}
            </span>
          </div>
          <div className="h-3 w-px bg-border" />
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">TDS Withheld:</span>
            <span className="font-medium text-red-600">NPR {formatNpr(totals.totalTds)}</span>
          </div>
          <div className="h-3 w-px bg-border" />
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">Audit Scans:</span>
            {totals.missingScansCount > 0 ? (
              <Badge variant="outline" className="h-4.5 px-1.5 text-[10px] border-amber-400 bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                ⚠️ {totals.missingScansCount} Missing
              </Badge>
            ) : (
              <Badge className="h-4.5 px-1.5 text-[10px] bg-emerald-100 text-emerald-800">
                100% Verified
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* Official Schedule 8 Construction Table */}
      <ConstructionTable
        title="Schedule 8 Purchase Entries"
        data={filtered}
        columns={columns}
        searchPlaceholder="Search invoice #, supplier name, PAN, description..."
        exportExcel={{
          filename: `Schedule8_PurchaseRegister_${projectId}_${format(new Date(), "yyyy-MM-dd")}`,
          sheetName: "Schedule8",
        }}
        emptyState={{
          icon: FileText,
          title: "No Purchase Records Found",
          description: "Purchase records will appear here as bills, expenses, and material invoices are entered.",
        }}
      />

      {/* Scanned Document Viewer Modal */}
      <Dialog open={Boolean(selectedScan)} onOpenChange={() => setSelectedScan(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold flex items-center justify-between">
              <span>Scanned Invoice: {selectedScan?.name}</span>
              {selectedScan && (
                <a
                  href={selectedScan.url}
                  download={`invoice-${selectedScan.name}`}
                  className="text-xs text-primary underline"
                >
                  Download File
                </a>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="py-2">
            {selectedScan?.url.startsWith("data:application/pdf") ? (
              <iframe
                src={selectedScan.url}
                className="w-full h-[70vh] rounded border"
                title="Scanned Document"
              />
            ) : (
              <img
                src={selectedScan?.url || ""}
                alt="Scanned Bill"
                className="max-h-[75vh] w-auto mx-auto rounded border object-contain"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
