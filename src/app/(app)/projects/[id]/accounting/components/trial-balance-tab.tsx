"use client";

import * as XLSX from "xlsx";
import { trpc } from "@/lib/trpc-client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Scale,
  CheckCircle2,
  AlertTriangle,
  Download,
  Printer,
  FileSpreadsheet,
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

function fmt(n: number) {
  return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function TrialBalanceTab({ projectId }: { projectId: string }) {
  const { data, isLoading } = trpc.accounting.trialBalance.useQuery({ projectId });

  const rows = data?.rows || [];
  const totalDebits = data?.totalDebits || 0;
  const totalCredits = data?.totalCredits || 0;
  const isBalanced = data?.isBalanced ?? true;
  const difference = data?.difference || 0;

  const handleExportExcel = () => {
    try {
      const exportRows = rows.map((r, idx) => [
        idx + 1,
        r.head,
        r.group,
        r.debit > 0 ? r.debit : "",
        r.credit > 0 ? r.credit : "",
      ]);

      const wsData = [
        ["TRIAL BALANCE (सन्तुलन परीक्षण)"],
        [`As of: ${format(new Date(), "yyyy-MM-dd")}`],
        ["S.N.", "Account Head", "Group / Classification", "Debit (NPR)", "Credit (NPR)"],
        ...exportRows,
        ["", "TOTAL", "", totalDebits, totalCredits],
        ["", "DIFFERENCE", "", difference, ""],
      ];

      const ws = XLSX.utils.aoa_to_sheet(wsData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "TrialBalance");
      XLSX.writeFile(wb, `TrialBalance_${format(new Date(), "yyyy-MM-dd")}.xlsx`);
    } catch (e) {
      console.error(e);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-16 w-full rounded-xl" />
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Integrity Status Banner */}
      <div
        className={cn(
          "p-4 rounded-xl border flex flex-wrap items-center justify-between gap-3",
          isBalanced
            ? "bg-emerald-50/60 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/40 text-emerald-800 dark:text-emerald-200"
            : "bg-red-50/60 dark:bg-red-950/20 border-red-200 dark:border-red-900/40 text-red-800 dark:text-red-200"
        )}
      >
        <div className="flex items-center gap-3">
          {isBalanced ? (
            <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          ) : (
            <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
          )}
          <div>
            <h4 className="font-bold text-sm">
              {isBalanced ? "Ledger Accounts are in Perfect Balance" : "Trial Balance Discrepancy Detected"}
            </h4>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isBalanced
                ? "Total debits match total credits across all direct costs, liabilities, and income heads."
                : `Total debits and credits differ by NPR ${fmt(difference)}. Please review unlinked vouchers.`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handleExportExcel}
            className="h-8 text-xs gap-1.5 font-mono"
          >
            <Download className="h-3.5 w-3.5 text-emerald-600" />
            Export Excel
          </Button>
        </div>
      </div>

      {/* Trial Balance Matrix Table */}
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-left text-xs font-mono">
          <thead className="border-b bg-muted/60 uppercase text-[10px] text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-sans">Account Head / Ledger</th>
              <th className="px-3 py-3">Group / Classification</th>
              <th className="px-4 py-3 text-right">Debit (Dr) NPR</th>
              <th className="px-4 py-3 text-right">Credit (Cr) NPR</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r, idx) => (
              <tr key={idx} className="hover:bg-muted/30 transition-colors">
                <td className="px-4 py-2.5 font-sans font-semibold text-foreground">
                  {r.head}
                </td>
                <td className="px-3 py-2.5">
                  <Badge variant="outline" className="text-[10px]">
                    {r.group}
                  </Badge>
                </td>
                <td className="px-4 py-2.5 text-right font-medium text-foreground">
                  {r.debit > 0 ? fmt(r.debit) : "—"}
                </td>
                <td className="px-4 py-2.5 text-right font-medium text-foreground">
                  {r.credit > 0 ? fmt(r.credit) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 border-border bg-muted/50 font-bold text-foreground">
            <tr>
              <td colSpan={2} className="px-4 py-3 uppercase tracking-wider font-sans text-xs">
                Grand Total
              </td>
              <td className="px-4 py-3 text-right text-emerald-600 dark:text-emerald-400 text-sm">
                NPR {fmt(totalDebits)}
              </td>
              <td className="px-4 py-3 text-right text-emerald-600 dark:text-emerald-400 text-sm">
                NPR {fmt(totalCredits)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
