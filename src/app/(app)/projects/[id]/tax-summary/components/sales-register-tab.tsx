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
  Filter,
  Eye,
  FileCheck,
  Loader2,
} from "lucide-react";
import { format } from "date-fns";
import { adToBs } from "@/lib/nepali-calendar";
import { formatNpr } from "@/lib/currency";
import { ConstructionTable, ConstructionTableColumn } from "@/components/ui/construction-table";

type SalesRow = {
  id: string;
  date: Date | string;
  invoiceNo: string;
  clientName: string;
  clientPan?: string | null;
  totalAmount: number;
  exemptSales: number;
  taxableSales: number;
  vatAmount: number;
  tdsAmount: number;
  netReceived: number;
  description: string;
  isBillAttached: boolean;
  scannedBillUrl?: string | null;
};

export function SalesRegisterTab({
  projectId,
  canWrite = false,
}: {
  projectId: string;
  canWrite?: boolean;
}) {
  const [filterMissingOnly, setFilterMissingOnly] = useState(false);
  const [selectedScan, setSelectedScan] = useState<{ url: string; name: string } | null>(null);

  const { data, isLoading } = trpc.vatRegister.getSalesRegister.useQuery({ projectId });

  const rows: SalesRow[] = (data?.rows || []) as SalesRow[];
  const totals = data?.totals || {
    totalGrossSales: 0,
    totalExemptSales: 0,
    totalTaxableSales: 0,
    totalOutputVat: 0,
    totalTdsWithheld: 0,
    totalNetReceived: 0,
    missingScansCount: 0,
  };

  const filtered = useMemo(() => {
    if (filterMissingOnly) {
      return rows.filter((r) => !r.isBillAttached);
    }
    return rows;
  }, [rows, filterMissingOnly]);

  const columns: ConstructionTableColumn<SalesRow>[] = useMemo(
    () => [
      {
        key: "date",
        header: "Date (AD / BS)",
        width: "140px",
        sortable: true,
        render: (_, r) => {
          let bsMiti = "";
          try {
            bsMiti = adToBs(new Date(r.date)).formatted;
          } catch {}
          return (
            <div className="font-mono text-xs">
              <div className="font-medium text-foreground">{bsMiti || "—"}</div>
              <div className="text-[10px] text-muted-foreground">
                {format(new Date(r.date), "yyyy-MM-dd")}
              </div>
            </div>
          );
        },
      },
      {
        key: "invoiceNo",
        header: "Invoice # / IPC",
        width: "150px",
        sortable: true,
        render: (val) => (
          <div className="font-bold text-foreground flex items-center gap-1 font-mono">
            <FileCheck className="h-3.5 w-3.5 text-blue-500 shrink-0" />
            <span>{val}</span>
          </div>
        ),
      },
      {
        key: "clientName",
        header: "Client / Employer",
        sortable: true,
        render: (_, r) => (
          <div>
            <span className="font-semibold text-foreground block text-xs">{r.clientName}</span>
            {r.description && (
              <span className="text-[10px] text-muted-foreground truncate block max-w-xs font-mono">
                {r.description}
              </span>
            )}
          </div>
        ),
      },
      {
        key: "clientPan",
        header: "PAN",
        width: "110px",
        render: (val) => <span className="font-mono text-xs text-muted-foreground">{val || "—"}</span>,
      },
      {
        key: "totalAmount",
        header: "Gross Sales",
        align: "right",
        width: "130px",
        summary: "sum",
        render: (val) => <span className="font-semibold text-foreground font-mono">{formatNpr(val)}</span>,
      },
      {
        key: "taxableSales",
        header: "Taxable",
        align: "right",
        width: "130px",
        summary: "sum",
        render: (val) => <span className="text-foreground font-mono">{formatNpr(val)}</span>,
      },
      {
        key: "vatAmount",
        header: "Output VAT (13%)",
        align: "right",
        width: "130px",
        summary: "sum",
        render: (val) => (
          <span className="font-bold text-amber-700 dark:text-amber-300 font-mono">
            {formatNpr(val)}
          </span>
        ),
      },
      {
        key: "tdsAmount",
        header: "TDS (1.5%)",
        align: "right",
        width: "110px",
        summary: "sum",
        render: (val) => (
          <span className="text-red-600 font-mono">
            {val > 0 ? formatNpr(val) : "—"}
          </span>
        ),
      },
      {
        key: "netReceived",
        header: "Net Received",
        align: "right",
        width: "130px",
        summary: "sum",
        render: (val) => (
          <span className="font-bold text-foreground font-mono">
            {formatNpr(val)}
          </span>
        ),
      },
      {
        key: "isBillAttached",
        header: "Scan",
        align: "center",
        width: "90px",
        render: (_, r) =>
          r.isBillAttached && r.scannedBillUrl ? (
            <button
              type="button"
              onClick={() => setSelectedScan({ url: r.scannedBillUrl!, name: r.invoiceNo })}
              className="inline-flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 hover:underline font-medium"
            >
              <Eye className="h-3 w-3" /> View
            </button>
          ) : (
            <Badge variant="outline" className="border-amber-400 bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300 text-[9px] px-1 py-0">
              Missing
            </Badge>
          ),
      },
    ],
    []
  );

  if (isLoading || !data) {
    return (
      <div className="p-8 text-center text-muted-foreground text-xs font-mono">
        <Loader2 className="h-4 w-4 animate-spin mx-auto mb-2 text-primary" />
        Loading बिक्री खाता (Sales Register - Schedule 9)...
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* 28px High-Density Inline Metric Strip */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-1.5 bg-muted/40 rounded-md border text-xs font-mono">
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground">Total Sales Billed:</span>
          <span className="font-bold text-foreground">{formatNpr(totals.totalGrossSales)}</span>
        </div>
        <div className="h-3 w-px bg-border" />
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground">Taxable Value:</span>
          <span className="font-semibold text-foreground">{formatNpr(totals.totalTaxableSales)}</span>
        </div>
        <div className="h-3 w-px bg-border" />
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground">Output VAT Collected (13%):</span>
          <span className="font-bold text-amber-700 dark:text-amber-300">
            {formatNpr(totals.totalOutputVat)}
          </span>
        </div>
        <div className="h-3 w-px bg-border" />
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground">Client TDS Deducted:</span>
          <span className="font-medium text-red-600">{formatNpr(totals.totalTdsWithheld)}</span>
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
              100% Attached
            </Badge>
          )}
        </div>
      </div>

      {/* Official Schedule 9 ConstructionTable */}
      <ConstructionTable<SalesRow>
        data={filtered}
        columns={columns}
        searchPlaceholder="Search Invoice #, IPC #, Client Name, PAN..."
        searchFilterKeys={["invoiceNo", "clientName", "clientPan", "description"]}
        summaryFooterLabel="Total Sales (कुल बिक्री जम्मा)"
        headerActions={
          <Button
            size="sm"
            variant={filterMissingOnly ? "default" : "outline"}
            onClick={() => setFilterMissingOnly(!filterMissingOnly)}
            className="h-8 text-xs gap-1.5 font-mono"
          >
            <Filter className="h-3.5 w-3.5" />
            {filterMissingOnly ? "Showing Missing Scans" : "Missing Scans Only"}
          </Button>
        }
        exportExcel={{
          filename: `Schedule-9-Bikri-Khata-${format(new Date(), "yyyy-MM-dd")}`,
          sheetName: "Schedule9Sales",
        }}
        emptyState={{
          title: "No sales / client IPC records found",
          description: "Schedule 9 will automatically populate when approved IPCs and client invoices are registered.",
        }}
      />

      {/* Scanned Document Viewer Modal with Backdrop Blur */}
      <Dialog open={!!selectedScan} onOpenChange={() => setSelectedScan(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto backdrop-blur-md bg-black/85 border-white/10 text-white">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold flex items-center justify-between text-white">
              <span>Scanned Client Invoice / Certificate: {selectedScan?.name}</span>
              {selectedScan && (
                <a
                  href={selectedScan.url}
                  download={`sales-invoice-${selectedScan.name}`}
                  className="text-xs text-emerald-400 hover:underline font-mono"
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
                className="w-full h-[70vh] rounded border border-white/10"
                title="Scanned Document"
              />
            ) : (
              <img
                src={selectedScan?.url || ""}
                alt="Scanned Bill"
                className="max-h-[75vh] w-auto mx-auto rounded border border-white/10 object-contain"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
