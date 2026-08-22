"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc-client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Search,
  Download,
  Filter,
  Eye,
  Paperclip,
  CheckCircle2,
  AlertTriangle,
  Receipt,
  FileCheck,
  Loader2,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { adToBs } from "@/lib/nepali-calendar";

function fmt(n: number) {
  return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function SalesRegisterTab({
  projectId,
  canWrite = false,
}: {
  projectId: string;
  canWrite?: boolean;
}) {
  const [search, setSearch] = useState("");
  const [filterMissingOnly, setFilterMissingOnly] = useState(false);
  const [selectedScan, setSelectedScan] = useState<{ url: string; name: string } | null>(null);

  const { data, isLoading } = trpc.vatRegister.getSalesRegister.useQuery({ projectId });

  if (isLoading || !data) {
    return (
      <div className="p-8 text-center text-muted-foreground text-xs font-mono">
        <Loader2 className="h-4 w-4 animate-spin mx-auto mb-2 text-primary" />
        Loading बिक्री खाता (Sales Register - Schedule 9)...
      </div>
    );
  }

  const { rows, totals } = data;

  const filtered = rows.filter((r) => {
    if (filterMissingOnly && r.isBillAttached) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      r.invoiceNo.toLowerCase().includes(q) ||
      r.clientName.toLowerCase().includes(q) ||
      r.clientPan.toLowerCase().includes(q) ||
      r.description.toLowerCase().includes(q)
    );
  });

  const handleExportExcel = () => {
    try {
      const wsData = [
        ["अनुसूची-९ (नियम २३ को उपनियम (१) को खण्ड (ज) सँग सम्बन्धित)"],
        ["बिक्री खाता (Sales Register)"],
        [`Project: ${projectId}`],
        [],
        [
          "क्र.सं.",
          "मिति (BS)",
          "मिति (AD)",
          "बीजक नं. / IPC नं.",
          "खरिदकर्ता / ग्राहकको नाम",
          "ग्राहकको स्थायी लेखा नं. (PAN)",
          "जम्मा बिक्री मूल्य (रु.)",
          "कर छुट हुने बिक्री (रु.)",
          "करयोग्य बिक्री मूल्य (रु.)",
          "बिक्री कर (Output VAT १३%)",
          "अग्रिम कर कट्टी (TDS १.५%)",
          "खुद प्राप्त रकम (रु.)",
          "विवरण",
          "स्क्यान प्रमाण",
        ],
        ...filtered.map((r, i) => {
          let bsMiti = "";
          try {
            bsMiti = adToBs(r.date).formatted;
          } catch {
            bsMiti = "";
          }
          return [
            i + 1,
            bsMiti,
            format(new Date(r.date), "yyyy-MM-dd"),
            r.invoiceNo,
            r.clientName,
            r.clientPan,
            r.totalAmount,
            r.exemptSales,
            r.taxableSales,
            r.vatAmount,
            r.tdsAmount,
            r.netReceived,
            r.description,
            r.isBillAttached ? "संलग्न" : "छैन (Missing)",
          ];
        }),
        [],
        [
          "कुल जम्मा",
          "",
          "",
          "",
          "",
          "",
          totals.totalGrossSales,
          totals.totalExemptSales,
          totals.totalTaxableSales,
          totals.totalOutputVat,
          totals.totalTdsWithheld,
          totals.totalNetReceived,
          "",
          "",
        ],
      ];

      const ws = XLSX.utils.aoa_to_sheet(wsData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Schedule 9 Bikri Khata");
      XLSX.writeFile(wb, `Schedule-9-Bikri-Khata-${format(new Date(), "yyyy-MM-dd")}.xlsx`);
      toast.success("बिक्री खाता (.xlsx) exported successfully");
    } catch {
      toast.error("Failed to export Excel");
    }
  };

  return (
    <div className="space-y-2.5">
      {/* 28px High-Density Inline Metric Strip */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-1.5 bg-muted/40 rounded-md border text-xs font-mono">
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground">Total Sales Billed:</span>
          <span className="font-bold text-foreground">NPR {fmt(totals.totalGrossSales)}</span>
        </div>
        <div className="h-3 w-px bg-border" />
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground">Taxable Value:</span>
          <span className="font-semibold text-foreground">NPR {fmt(totals.totalTaxableSales)}</span>
        </div>
        <div className="h-3 w-px bg-border" />
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground">Output VAT Collected (13%):</span>
          <span className="font-bold text-amber-700 dark:text-amber-300">
            NPR {fmt(totals.totalOutputVat)}
          </span>
        </div>
        <div className="h-3 w-px bg-border" />
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground">Client TDS Deducted:</span>
          <span className="font-medium text-red-600">NPR {fmt(totals.totalTdsWithheld)}</span>
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

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-1 max-w-md">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search Invoice #, IPC #, Client Name, PAN..."
              className="h-7.5 pl-8 text-xs font-sans"
            />
          </div>

          <Button
            size="sm"
            variant={filterMissingOnly ? "default" : "outline"}
            onClick={() => setFilterMissingOnly(!filterMissingOnly)}
            className="h-7.5 text-xs gap-1"
          >
            <Filter className="h-3 w-3" />
            {filterMissingOnly ? "Showing Missing Scans" : "Missing Scans Only"}
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handleExportExcel}
            className="h-7.5 text-xs text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800 gap-1"
          >
            <Download className="h-3 w-3" /> Export Schedule 9 (Excel)
          </Button>
        </div>
      </div>

      {/* Official Schedule 9 Data Table */}
      <div className="rounded-md border overflow-x-auto bg-card shadow-xs">
        <table className="w-full text-xs font-mono border-collapse tabular-nums">
          <thead>
            <tr className="bg-muted/70 border-b text-[11px] font-semibold text-muted-foreground text-left">
              <th className="p-2 w-10 text-center">S.N.</th>
              <th className="p-2 w-20">Miti (BS)</th>
              <th className="p-2 w-24">Date (AD)</th>
              <th className="p-2 w-32">Invoice # / IPC</th>
              <th className="p-2 min-w-[180px]">Client / Employer Name</th>
              <th className="p-2 w-24">Client PAN</th>
              <th className="p-2 w-24 text-right">Gross Amount</th>
              <th className="p-2 w-24 text-right">Taxable Sales</th>
              <th className="p-2 w-24 text-right bg-amber-50/40 dark:bg-amber-950/20 text-amber-800 dark:text-amber-300 font-bold">
                VAT (13%)
              </th>
              <th className="p-2 w-20 text-right text-red-600">TDS (1.5%)</th>
              <th className="p-2 w-24 text-right font-bold">Net Received</th>
              <th className="p-2 w-20 text-center">Scan</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={12} className="p-8 text-center text-muted-foreground font-sans text-xs">
                  No sales / client IPC records found matching filter.
                </td>
              </tr>
            ) : (
              filtered.map((r, idx) => {
                let bsMiti = "";
                try {
                  bsMiti = adToBs(r.date).formatted;
                } catch {
                  bsMiti = "—";
                }

                return (
                  <tr key={r.id} className="hover:bg-muted/10 transition-colors">
                    <td className="p-2 text-center text-muted-foreground">{idx + 1}</td>
                    <td className="p-2 text-foreground font-medium whitespace-nowrap">{bsMiti}</td>
                    <td className="p-2 text-muted-foreground whitespace-nowrap">
                      {format(new Date(r.date), "dd MMM yyyy")}
                    </td>
                    <td className="p-2 font-bold text-foreground flex items-center gap-1">
                      <FileCheck className="h-3 w-3 text-blue-600" />
                      <span>{r.invoiceNo}</span>
                    </td>
                    <td className="p-2 text-foreground font-sans truncate max-w-[220px]" title={r.description}>
                      <span className="font-semibold">{r.clientName}</span>
                      <span className="block text-[10px] text-muted-foreground truncate">{r.description}</span>
                    </td>
                    <td className="p-2 text-muted-foreground font-mono">{r.clientPan || "—"}</td>
                    <td className="p-2 text-right font-semibold text-foreground">{fmt(r.totalAmount)}</td>
                    <td className="p-2 text-right text-foreground">{fmt(r.taxableSales)}</td>
                    <td className="p-2 text-right bg-amber-50/40 dark:bg-amber-950/20 font-bold text-amber-700 dark:text-amber-300">
                      {fmt(r.vatAmount)}
                    </td>
                    <td className="p-2 text-right text-red-600">{r.tdsAmount > 0 ? fmt(r.tdsAmount) : "—"}</td>
                    <td className="p-2 text-right font-bold text-foreground">{fmt(r.netReceived)}</td>
                    <td className="p-2 text-center">
                      {r.isBillAttached && r.scannedBillUrl ? (
                        <button
                          type="button"
                          onClick={() => setSelectedScan({ url: r.scannedBillUrl!, name: r.invoiceNo })}
                          className="inline-flex items-center gap-0.5 text-[10px] text-emerald-700 dark:text-emerald-400 hover:underline font-sans"
                        >
                          <Eye className="h-3 w-3" /> View
                        </button>
                      ) : (
                        <Badge variant="outline" className="border-amber-400 bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300 text-[9px] px-1 py-0 font-sans">
                          Missing
                        </Badge>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
          <tfoot className="bg-muted/80 border-t-2 font-bold text-[11px]">
            <tr>
              <td colSpan={6} className="p-2 text-right uppercase">
                Total Sales (कुल बिक्री जम्मा):
              </td>
              <td className="p-2 text-right">{fmt(totals.totalGrossSales)}</td>
              <td className="p-2 text-right">{fmt(totals.totalTaxableSales)}</td>
              <td className="p-2 text-right text-amber-700 dark:text-amber-300 bg-amber-100/50 dark:bg-amber-950/40">
                {fmt(totals.totalOutputVat)}
              </td>
              <td className="p-2 text-right text-red-600">{fmt(totals.totalTdsWithheld)}</td>
              <td className="p-2 text-right">{fmt(totals.totalNetReceived)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Scanned Document Viewer Modal */}
      <Dialog open={!!selectedScan} onOpenChange={() => setSelectedScan(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold flex items-center justify-between">
              <span>Scanned Client Invoice / Certificate: {selectedScan?.name}</span>
              {selectedScan && (
                <a
                  href={selectedScan.url}
                  download={`sales-invoice-${selectedScan.name}`}
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
