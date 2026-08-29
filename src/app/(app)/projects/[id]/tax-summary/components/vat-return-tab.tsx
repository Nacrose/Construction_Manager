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
        XLSX.utils.book_append_sheet(wb, ws8, "Schedule 8 Purchases");
      }

      // Sheet 3: Schedule 9 Bikri Khata
      if (sData) {
        const s9Data = [
          ["अनुसूची-९ बिक्री खाता (Sales Register)"],
          [
            "क्र.सं.",
            "मिति (BS)",
            "मिति (AD)",
            "बीजक नं. / IPC",
            "ग्राहकको नाम",
            "PAN",
            "जम्मा बिक्री",
            "करयोग्य बिक्री",
            "VAT (१३%)",
            "TDS",
            "खुद प्राप्त",
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
              r.taxableSales,
              r.vatAmount,
              r.tdsAmount,
              r.netReceived,
            ];
          }),
        ];
        const ws9 = XLSX.utils.aoa_to_sheet(s9Data);
        XLSX.utils.book_append_sheet(wb, ws9, "Schedule 9 Sales");
      }

      XLSX.writeFile(wb, `Nepal-IRD-VAT-Filing-Workbook-${format(new Date(), "yyyy-MM-dd")}.xlsx`);
      toast.success("Complete 3-Tab IRD Filing Workbook (.xlsx) generated successfully");
    } catch {
      toast.error("Failed to export IRD workbook");
    }
  };

  return (
    <div className="space-y-4">
      {/* 1-Click Official IRD Filing Banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 rounded-md">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded bg-blue-600 text-white">
            <FileSpreadsheet className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-blue-950 dark:text-blue-200">
              Nepal IRD Multi-Tab Statutory Tax Workbook
            </h3>
            <p className="text-[11px] text-muted-foreground">
              Includes Anusuchi 8 (Purchase), Anusuchi 9 (Sales), and Anusuchi 10 (Return) formatted for Nepal Taxpayer Portal.
            </p>
          </div>
        </div>

        <Button
          size="sm"
          onClick={handleExportFullIrdWorkbook}
          className="h-8 text-xs font-semibold gap-1.5 shadow-xs"
        >
          <Download className="h-3.5 w-3.5" /> Download 3-Tab IRD Workbook (.xlsx)
        </Button>
      </div>

      {/* 3-Column Visual Reconciliation Strip */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Output VAT Card */}
        <div className="p-3.5 rounded-md border bg-amber-50/20 dark:bg-amber-950/10 border-amber-200 dark:border-amber-900/50">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground font-semibold flex items-center gap-1">
              <TrendingUp className="h-3.5 w-3.5 text-amber-600" /> Output VAT (बिक्री कर)
            </span>
            <Badge variant="outline" className="text-[10px] bg-amber-100 dark:bg-amber-950 text-amber-800">
              From IPCs
            </Badge>
          </div>
          <p className="text-xl font-bold font-mono text-amber-800 dark:text-amber-300 mt-1">
            {formatNpr(sales.outputVat)}
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5 font-mono">
            On Taxable Sales: {formatNpr(sales.taxable)}
          </p>
        </div>

        {/* Input VAT Card */}
        <div className="p-3.5 rounded-md border bg-emerald-50/20 dark:bg-emerald-950/10 border-emerald-200 dark:border-emerald-900/50">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground font-semibold flex items-center gap-1">
              <TrendingDown className="h-3.5 w-3.5 text-emerald-600" /> Input VAT Credit (खरिद कर कट्टी)
            </span>
            <Badge variant="outline" className="text-[10px] bg-emerald-100 dark:bg-emerald-950 text-emerald-800">
              Materials + Subs
            </Badge>
          </div>
          <p className="text-xl font-bold font-mono text-emerald-800 dark:text-emerald-300 mt-1">
            {formatNpr(purchases.inputVat)}
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5 font-mono">
            On Taxable Purchases: {formatNpr(purchases.taxable)}
          </p>
        </div>

        {/* Net Reconciliation Card */}
        <div className={`p-3.5 rounded-md border ${
          reconciliation.netVatPayable > 0
            ? "bg-blue-50/30 border-blue-300 dark:bg-blue-950/20"
            : "bg-emerald-50/30 border-emerald-300 dark:bg-emerald-950/20"
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground font-semibold flex items-center gap-1">
              <Scale className="h-3.5 w-3.5 text-primary" /> Net IRD Position (अनुसूची १०)
            </span>
            <Badge className={reconciliation.netVatPayable > 0 ? "bg-blue-600" : "bg-emerald-600"}>
              {reconciliation.netVatPayable > 0 ? "Payable" : "VAT Credit"}
            </Badge>
          </div>
          <p className="text-xl font-extrabold font-mono text-foreground mt-1">
            {formatNpr(reconciliation.netVatPayable > 0 ? reconciliation.netVatPayable : reconciliation.netVatCredit)}
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {reconciliation.netVatPayable > 0
              ? "Net VAT payable to Inland Revenue Department (IRD)"
              : "Excess input tax credit carried forward to next month"}
          </p>
        </div>
      </div>

      {/* Official Schedule 10 Statement Table */}
      <div className="rounded-md border bg-card p-4 shadow-xs">
        <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
          अनुसूची-१०: मूल्य अभिवृद्धि कर विवरण (Statutory Return Format)
        </h4>
        <table className="w-full text-xs font-mono border-collapse tabular-nums">
          <thead>
            <tr className="border-b bg-muted/40 text-[11px] text-muted-foreground font-semibold">
              <th className="p-2 text-left">विवरण (Description)</th>
              <th className="p-2 text-right w-40">करयोग्य रकम (Taxable Amount)</th>
              <th className="p-2 text-right w-40">कर रकम (VAT Amount)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            <tr>
              <td className="p-2 font-medium">१. कुल करयोग्य बिक्री (Taxable Sales)</td>
              <td className="p-2 text-right">{formatNpr(sales.taxable)}</td>
              <td className="p-2 text-right font-bold text-amber-700 dark:text-amber-300">{formatNpr(sales.outputVat)}</td>
            </tr>
            <tr>
              <td className="p-2 text-muted-foreground">२. कर छुट बिक्री (Exempt Sales)</td>
              <td className="p-2 text-right text-muted-foreground">{formatNpr(sales.exempt)}</td>
              <td className="p-2 text-right text-muted-foreground">—</td>
            </tr>
            <tr className="bg-muted/10 font-bold">
              <td className="p-2 uppercase text-[11px]">जम्मा बिक्री कर (Output VAT Collected - A)</td>
              <td className="p-2 text-right">{formatNpr(sales.taxable + sales.exempt)}</td>
              <td className="p-2 text-right font-bold text-amber-800 dark:text-amber-300">{formatNpr(sales.outputVat)}</td>
            </tr>

            <tr>
              <td className="p-2 font-medium pt-3">३. कुल करयोग्य खरिद (Taxable Purchases)</td>
              <td className="p-2 text-right pt-3">{formatNpr(purchases.taxable)}</td>
              <td className="p-2 text-right pt-3 font-bold text-emerald-700 dark:text-emerald-300">{formatNpr(purchases.inputVat)}</td>
            </tr>
            <tr>
              <td className="p-2 text-muted-foreground">४. कर छुट खरिद (Exempt Purchases)</td>
              <td className="p-2 text-right text-muted-foreground">{formatNpr(purchases.exempt)}</td>
              <td className="p-2 text-right text-muted-foreground">—</td>
            </tr>
            <tr className="bg-muted/10 font-bold">
              <td className="p-2 uppercase text-[11px]">जम्मा खरिद कर कट्टी (Input VAT Credit - B)</td>
              <td className="p-2 text-right">{formatNpr(purchases.taxable + purchases.exempt)}</td>
              <td className="p-2 text-right font-bold text-emerald-800 dark:text-emerald-300">{formatNpr(purchases.inputVat)}</td>
            </tr>

            <tr className="bg-primary/10 font-extrabold border-t-2 text-sm">
              <td className="p-2.5 uppercase text-foreground">
                ५. खुद तिर्नुपर्ने कर / कट्टी बाँकी (Net VAT Position: A - B)
              </td>
              <td className="p-2.5 text-right">—</td>
              <td className="p-2.5 text-right text-primary font-black">
                {formatNpr(reconciliation.netVatPayable > 0 ? reconciliation.netVatPayable : reconciliation.netVatCredit)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
