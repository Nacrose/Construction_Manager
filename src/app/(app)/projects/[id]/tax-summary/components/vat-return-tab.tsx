"use client";

import { trpc } from "@/lib/trpc-client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  FileSpreadsheet,
  Download,
  TrendingUp,
  TrendingDown,
  Scale,
  Loader2,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import * as XLSX from "@e965/xlsx";
import { adToBs } from "@/lib/nepali-calendar";
import { formatNpr } from "@/lib/currency";
import { ConstructionTable, ConstructionTableColumn } from "@/components/ui/construction-table";
import { cn } from "@/lib/utils";

export function VatReturnTab({ projectId }: { projectId: string }) {
  const { data, isLoading } = trpc.vatRegister.getVatReturnSchedule10.useQuery({ projectId });
  const { data: pData } = trpc.vatRegister.getPurchaseRegister.useQuery({ projectId });
  const { data: sData } = trpc.vatRegister.getSalesRegister.useQuery({ projectId });

  if (isLoading || !data) {
    return (
      <div className="p-8 text-center text-muted-foreground text-xs font-mono">
        <Loader2 className="h-4 w-4 animate-spin mx-auto mb-2 text-primary" />
        Loading अनुसूची १० (VAT Return &amp; Reconciliation)...
      </div>
    );
  }

  const { sales, purchases, reconciliation } = data;

  const handleExportFullIrdWorkbook = () => {
    try {
      const wb = XLSX.utils.book_new();

      // Sheet 1: Schedule 10 VAT Return
      const s10Data = [
        ["अनुसूची-१० (नियम २३ को उपनियम (१) को खण्ड (झ) सँग सम्बन्धित)"],
        ["मूल्य अभिवृद्धि कर विवरण (VAT Return & Reconciliation)"],
        [`Project: ${projectId}`],
        [],
        ["विवरण (Description)", "करयोग्य रकम (Taxable Amount)", "कर रकम (VAT Amount)"],
        ["१. कुल बिक्री (Total Sales)", sales.taxable, sales.outputVat],
        ["२. कर छुट बिक्री (Exempt Sales)", sales.exempt, 0],
        ["३. जम्मा बिक्री कर (Output VAT Collected - A)", "", sales.outputVat],
        [],
        ["४. स्थानीय करयोग्य खरिद (Taxable Purchases)", purchases.taxable, purchases.inputVat],
        ["५. कर छुट खरिद (Exempt Purchases)", purchases.exempt, 0],
        ["६. जम्मा खरिद कर (Input VAT Credit - B)", "", purchases.inputVat],
        [],
        ["७. खुद तिर्नुपर्ने कर (Net VAT Payable to IRD: A - B)", "", reconciliation.netVatPayable],
        ["८. कर कट्टी बाँकी (Net VAT Credit Carried Forward)", "", reconciliation.netVatCredit],
      ];
      const ws10 = XLSX.utils.aoa_to_sheet(s10Data);
      XLSX.utils.book_append_sheet(wb, ws10, "Schedule 10 VAT Return");

      // Sheet 2: Schedule 8 Kharid Khata
      if (pData) {
        const s8Data = [
          ["अनुसूची-८ खरिद खाता (Purchase Register)"],
          [
            "क्र.सं.",
            "मिति (BS)",
            "मिति (AD)",
            "बीजक नं.",
            "आपूर्तिकर्ताको नाम",
            "PAN",
            "जम्मा खरिद",
            "कर छुट",
            "करयोग्य खरिद",
            "पुँजीगत",
            "पैठारी",
            "VAT (१३%)",
            "TDS",
            "खुद भुक्तानी",
          ],
          ...pData.rows.map((r, i) => {
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
              r.partyName,
              r.partyPan,
              r.totalAmount,
              r.exemptAmount,
              r.taxableLocal,
              r.capitalGoods,
              r.importAmount,
              r.vatAmount,
              r.tdsAmount,
              r.netPayable,
            ];
          }),
        ];
        const ws8 = XLSX.utils.aoa_to_sheet(s8Data);
        XLSX.utils.book_append_sheet(wb, ws8, "Schedule 8 Kharid Khata");
      }

      // Sheet 3: Schedule 9 Bikri Khata
      if (sData) {
        const s9Data = [
          ["अनुसूची-९ बिक्री खाता (Sales Register)"],
          [
            "क्र.सं.",
            "मिति (BS)",
            "मिति (AD)",
            "बीजक नं.",
            "ग्राहकको नाम",
            "PAN",
            "जम्मा बिक्री",
            "कर छुट",
            "करयोग्य बिक्री",
            "निर्यात",
            "VAT (१३%)",
          ],
          ...sData.rows.map((r, i) => {
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
              (r as any).exportSales || 0,
              r.vatAmount,

            ];
          }),
        ];
        const ws9 = XLSX.utils.aoa_to_sheet(s9Data);
        XLSX.utils.book_append_sheet(wb, ws9, "Schedule 9 Bikri Khata");
      }

      XLSX.writeFile(wb, `VAT_Return_Schedule_10_Full_Audit_Package_${format(new Date(), "yyyy-MM-dd")}.xlsx`);
      toast.success("Statutory IRD Tax Pack (Schedules 8, 9 & 10) downloaded!");
    } catch (e: any) {
      toast.error(e.message || "Failed to generate IRD export package");
    }
  };

  const scheduleRows = [
    {
      description: "१. कुल करयोग्य बिक्री (Taxable Sales)",
      taxable: sales.taxable,
      vat: sales.outputVat,
      type: "sales_taxable",
    },
    {
      description: "२. कर छुट बिक्री (Exempt Sales)",
      taxable: sales.exempt,
      vat: 0,
      type: "sales_exempt",
    },
    {
      description: "जम्मा बिक्री कर (Output VAT Collected - A)",
      taxable: sales.taxable + sales.exempt,
      vat: sales.outputVat,
      type: "sales_total",
      isTotal: true,
    },
    {
      description: "३. कुल करयोग्य खरिद (Taxable Purchases)",
      taxable: purchases.taxable,
      vat: purchases.inputVat,
      type: "purchase_taxable",
    },
    {
      description: "४. कर छुट खरिद (Exempt Purchases)",
      taxable: purchases.exempt,
      vat: 0,
      type: "purchase_exempt",
    },
    {
      description: "जम्मा खरिद कर कट्टी (Input VAT Credit - B)",
      taxable: purchases.taxable + purchases.exempt,
      vat: purchases.inputVat,
      type: "purchase_total",
      isTotal: true,
    },
    {
      description: "५. खुद तिर्नुपर्ने कर / कट्टी बाँकी (Net VAT Position: A - B)",
      taxable: 0,
      vat: reconciliation.netVatPayable > 0 ? reconciliation.netVatPayable : reconciliation.netVatCredit,
      type: "net_position",
      isGrandTotal: true,
    },
  ];

  const columns: ConstructionTableColumn<any>[] = [
    {
      key: "description",
      header: "विवरण (Description)",
      render: (_, r) => (
        <span
          className={cn(
            "font-mono text-xs",
            r.isGrandTotal ? "font-bold text-foreground text-sm uppercase" : r.isTotal ? "font-bold text-foreground" : "text-muted-foreground"
          )}
        >
          {r.description}
        </span>
      ),
    },
    {
      key: "taxable",
      header: "करयोग्य रकम (Taxable Amount)",
      align: "right",
      render: (_, r) => (
        <span
          className={cn(
            "font-mono text-xs",
            r.isGrandTotal ? "text-muted-foreground" : r.isTotal ? "font-bold text-foreground" : "text-foreground"
          )}
        >
          {r.isGrandTotal ? "—" : formatNpr(r.taxable)}
        </span>
      ),
    },
    {
      key: "vat",
      header: "कर रकम (VAT Amount)",
      align: "right",
      render: (_, r) => (
        <span
          className={cn(
            "font-mono text-xs font-bold",
            r.isGrandTotal
              ? "text-primary text-sm font-black"
              : r.type.startsWith("sales")
              ? "text-amber-600 dark:text-amber-400"
              : "text-success dark:text-success/80"
          )}
        >
          {r.vat > 0 ? formatNpr(r.vat) : "—"}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      {/* Header Ribbon & Export Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-muted/40 rounded-lg border">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 font-mono">
            <FileSpreadsheet className="h-4 w-4 text-primary" />
            Statutory अनुसूची १० (Schedule 10) VAT Return &amp; Reconciliation
          </h3>
          <p className="text-[11px] text-muted-foreground mt-0.5 font-mono">
            Official monthly tax return filing format under Value Added Tax Rules 2053 (Rule 23).
          </p>
        </div>

        <Button
          size="sm"
          onClick={handleExportFullIrdWorkbook}
          className="h-8 text-xs bg-success hover:bg-success text-white gap-1.5 font-mono"
        >
          <Download className="h-3.5 w-3.5" />
          Export Statutory IRD Tax Pack (Excel)
        </Button>
      </div>

      {/* High-Level Comparison KPI Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Output VAT */}
        <div className="p-3.5 rounded-xl border bg-card space-y-1">
          <div className="flex items-center justify-between text-muted-foreground text-[10px] uppercase font-mono">
            <span>A. Output VAT (बिक्री कर)</span>
            <TrendingUp className="h-3.5 w-3.5 text-amber-500" />
          </div>
          <p className="text-xl font-bold font-mono text-amber-600 dark:text-amber-400">
            {formatNpr(sales.outputVat)}
          </p>
          <p className="text-[11px] text-muted-foreground font-mono">
            Collected on Taxable Sales: {formatNpr(sales.taxable)}
          </p>
        </div>

        {/* Input VAT */}
        <div className="p-3.5 rounded-xl border bg-card space-y-1">
          <div className="flex items-center justify-between text-muted-foreground text-[10px] uppercase font-mono">
            <span>B. Input VAT (खरिद कर कट्टी)</span>
            <TrendingDown className="h-3.5 w-3.5 text-success/90" />
          </div>
          <p className="text-xl font-bold font-mono text-success dark:text-success/80">
            {formatNpr(purchases.inputVat)}
          </p>
          <p className="text-[11px] text-muted-foreground font-mono">
            Claimable on Purchases: {formatNpr(purchases.taxable)}
          </p>
        </div>

        {/* Net VAT Settlement Position */}
        <div
          className={`p-3.5 rounded-xl border space-y-1 ${
            reconciliation.netVatPayable > 0
              ? "bg-red-500/10 border-red-500/30"
              : "bg-success/10 border-success/30"
          }`}
        >
          <div className="flex items-center justify-between text-muted-foreground text-[10px] uppercase font-mono">
            <span>Net IRD Settlement (A - B)</span>
            <Scale className="h-3.5 w-3.5 text-primary" />
          </div>
          <p
            className={`text-xl font-bold font-mono ${
              reconciliation.netVatPayable > 0 ? "text-red-600 dark:text-red-400" : "text-success dark:text-success/80"
            }`}
          >
            {formatNpr(reconciliation.netVatPayable > 0 ? reconciliation.netVatPayable : reconciliation.netVatCredit)}
          </p>
          <p className="text-[11px] text-muted-foreground font-mono">
            {reconciliation.netVatPayable > 0
              ? "Net VAT payable to Inland Revenue Department (IRD)"
              : "Excess input tax credit carried forward to next month"}
          </p>
        </div>
      </div>

      {/* ConstructionTable Schedule 10 Table */}
      <ConstructionTable
        data={scheduleRows}
        columns={columns}
        isLoading={false}
      />
    </div>
  );
}
