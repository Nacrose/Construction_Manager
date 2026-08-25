"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc-client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import {
  Download,
  Search,
  BookOpen,
  ArrowDownLeft,
  ArrowUpRight,
  Filter,
  CheckCircle2,
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

function fmt(n: number) {
  return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function OrgDayBookTab() {
  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const { data, isLoading } = trpc.finance.orgMasterDayBook.useQuery({
    search: search || undefined,
    fromDate: fromDate || undefined,
    toDate: toDate || undefined,
  });

  const entries = data?.entries || [];
  const summary = data?.summary || { totalDebit: 0, totalCredit: 0, count: 0 };

  const handleExportCSV = () => {
    if (entries.length === 0) return;

    const headers = [
      "Date (AD)",
      "Miti (BS)",
      "Project",
      "Voucher No",
      "Voucher Type",
      "Account Head",
      "Particulars",
      "Debit (NPR)",
      "Credit (NPR)",
      "Payment Mode",
      "Cheque No",
      "PAN",
    ];

    const rows = entries.map((e) => [
      format(new Date(e.date), "yyyy-MM-dd"),
      e.miti,
      e.projectCode,
      e.voucherNo,
      e.voucherType,
      e.accountHead,
      `"${e.particulars.replace(/"/g, '""')}"`,
      e.debit,
      e.credit,
      e.paymentMode || "",
      e.chequeNo || "",
      e.partyPan || "",
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Company_Master_DayBook_${format(new Date(), "yyyy-MM-dd")}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-4">
      {/* Top Filter Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-card p-3 rounded-xl border shadow-sm">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search particulars, voucher #, project..."
            className="pl-8 h-9 text-xs"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto font-mono text-xs">
          <Input
            type="date"
            placeholder="From"
            className="h-9 w-36 text-xs font-mono"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
          />
          <span className="text-muted-foreground">to</span>
          <Input
            type="date"
            placeholder="To"
            className="h-9 w-36 text-xs font-mono"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
          />
          <Button
            size="sm"
            variant="outline"
            onClick={handleExportCSV}
            disabled={entries.length === 0}
            className="h-9 gap-1.5 text-xs font-sans"
          >
            <Download className="h-4 w-4 text-muted-foreground" />
            Export Excel
          </Button>
        </div>
      </div>

      {/* Summary Matrix */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="border-l-4 border-l-blue-500 shadow-sm bg-card">
          <CardContent className="p-3 space-y-0.5">
            <div className="text-[10px] font-mono text-muted-foreground uppercase">
              Total Incurred / Debits (कुल खर्च / भुक्तानी)
            </div>
            <div className="text-xl font-bold font-mono text-foreground">
              NPR {fmt(summary.totalDebit)}
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-emerald-500 shadow-sm bg-card">
          <CardContent className="p-3 space-y-0.5">
            <div className="text-[10px] font-mono text-muted-foreground uppercase">
              Total Invoiced / Credits (कुल बिलिङ / दायित्व)
            </div>
            <div className="text-xl font-bold font-mono text-foreground">
              NPR {fmt(summary.totalCredit)}
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-primary shadow-sm bg-card">
          <CardContent className="p-3 space-y-0.5">
            <div className="text-[10px] font-mono text-muted-foreground uppercase">
              Total Master Journal Entries
            </div>
            <div className="text-xl font-bold font-mono text-foreground">
              {summary.count} Vouchers
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      {isLoading ? (
        <Skeleton className="h-72 rounded-xl" />
      ) : entries.length === 0 ? (
        <div className="rounded-xl border border-dashed p-12 text-center bg-card">
          <BookOpen className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
          <h3 className="text-base font-bold text-foreground">No Transactions Found</h3>
          <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
            Transactions logged across any project or the head office will appear here in chronological order.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
          <table className="w-full text-left text-xs font-mono">
            <thead className="border-b bg-muted/60 text-[10px] uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Date (AD)</th>
                <th className="px-3 py-3">Project</th>
                <th className="px-3 py-3">Voucher #</th>
                <th className="px-3 py-3">Account Head</th>
                <th className="px-4 py-3">Particulars / Details</th>
                <th className="px-3 py-3 text-right">Debit (Dr)</th>
                <th className="px-3 py-3 text-right">Credit (Cr)</th>
                <th className="px-3 py-3">Mode / Cheque</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {entries.map((e) => (
                <tr key={e.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">
                    {format(new Date(e.date), "yyyy-MM-dd")}
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge variant="outline" className="text-[10px] font-bold">
                      {e.projectCode}
                    </Badge>
                  </td>
                  <td className="px-3 py-2.5 font-bold text-foreground whitespace-nowrap">
                    {e.voucherNo}
                  </td>
                  <td className="px-3 py-2.5 font-sans">
                    <span className="bg-muted px-1.5 py-0.5 rounded text-[10px] text-foreground">
                      {e.accountHead}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 font-sans">
                    <div className="font-medium text-foreground">{e.particulars}</div>
                    {e.partyPan && (
                      <div className="text-[10px] text-muted-foreground font-mono">
                        PAN: {e.partyPan}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right font-bold text-blue-600 dark:text-blue-400">
                    {e.debit > 0 ? fmt(e.debit) : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-right font-bold text-emerald-600 dark:text-emerald-400">
                    {e.credit > 0 ? fmt(e.credit) : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">
                    {e.paymentMode || "—"}{" "}
                    {e.chequeNo ? <span className="font-bold text-foreground">#{e.chequeNo}</span> : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
