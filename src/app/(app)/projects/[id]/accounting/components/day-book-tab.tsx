"use client";

import { useState } from "react";
import * as XLSX from "xlsx";
import { trpc } from "@/lib/trpc-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BookOpen,
  Search,
  Download,
  Calendar,
  Filter,
  Eye,
  ArrowDownRight,
  ArrowUpRight,
  Receipt,
  FileSpreadsheet,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

function fmt(n: number) {
  return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function DayBookTab({ projectId }: { projectId: string }) {
  const [voucherType, setVoucherType] = useState<string>("all");
  const [software, setSoftware] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [viewScanUrl, setViewScanUrl] = useState<string | null>(null);

  const { data, isLoading } = trpc.accounting.dayBook.useQuery({
    projectId,
    voucherType: voucherType !== "all" ? voucherType : undefined,
    accountingSoftware: software !== "all" ? software : undefined,
    search: search || undefined,
  });

  const entries = data?.entries || [];
  const summary = data?.summary || { totalDebit: 0, totalCredit: 0, count: 0 };

  const handleExportExcel = () => {
    try {
      const rows = entries.map((e, idx) => [
        idx + 1,
        e.date ? format(new Date(e.date), "yyyy-MM-dd") : "—",
        e.miti || "—",
        e.voucherNo,
        e.voucherType,
        e.accountHead,
        e.particulars,
        e.partyPan || "—",
        e.paymentMode || "—",
        e.debit,
        e.credit,
      ]);

      const wsData = [
        ["S.N.", "Date (AD)", "Miti (BS)", "Voucher No", "Voucher Type", "Account Head", "Particulars", "PAN", "Mode", "Debit (NPR)", "Credit (NPR)"],
        ...rows,
        ["", "", "", "", "", "", "TOTAL", "", "", summary.totalDebit, summary.totalCredit],
      ];

      const ws = XLSX.utils.aoa_to_sheet(wsData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "DayBook");
      XLSX.writeFile(wb, `DayBook_${format(new Date(), "yyyy-MM-dd")}.xlsx`);
    } catch (e) {
      console.error(e);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full rounded-lg" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Top Filter & Export Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-card p-3 rounded-xl border">
        <div className="flex flex-wrap items-center gap-2">
          {/* Voucher Type Filter */}
          <Select value={voucherType} onValueChange={setVoucherType}>
            <SelectTrigger className="h-8 text-xs font-mono w-40">
              <SelectValue placeholder="All Vouchers" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Vouchers</SelectItem>
              <SelectItem value="payment">Payments (PV)</SelectItem>
              <SelectItem value="purchase">Purchase Bills</SelectItem>
              <SelectItem value="work_done">Subcontractor Bills</SelectItem>
              <SelectItem value="billing">IPC Revenue</SelectItem>
            </SelectContent>
          </Select>

          {/* Software Tag */}
          <Select value={software} onValueChange={setSoftware}>
            <SelectTrigger className="h-8 text-xs font-mono w-32">
              <SelectValue placeholder="Software" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Ledgers</SelectItem>
              <SelectItem value="tally">Tally Format</SelectItem>
              <SelectItem value="swastik">Swastik Format</SelectItem>
            </SelectContent>
          </Select>

          {/* Search Box */}
          <div className="relative w-60">
            <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search voucher, party, PAN..."
              className="pl-8 h-8 text-xs"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
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
            Export Day Book (Excel)
          </Button>
        </div>
      </div>

      {/* Day Book Table */}
      {entries.length === 0 ? (
        <div className="rounded-xl border border-dashed p-12 text-center">
          <BookOpen className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
          <p className="text-sm font-semibold text-foreground">No Vouchers Recorded</p>
          <p className="text-xs text-muted-foreground mt-1">
            Day Book entries appear automatically when you record payments, vendor bills, or IPCs.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full text-left text-xs font-mono">
            <thead className="border-b bg-muted/60 uppercase text-[10px] text-muted-foreground">
              <tr>
                <th className="px-3 py-3">Date (Miti / AD)</th>
                <th className="px-3 py-3">Voucher #</th>
                <th className="px-3 py-3">Type</th>
                <th className="px-4 py-3 font-sans">Particulars & Account Head</th>
                <th className="px-3 py-3">Mode</th>
                <th className="px-3 py-3 text-right">Debit (Dr)</th>
                <th className="px-3 py-3 text-right">Credit (Cr)</th>
                <th className="px-3 py-3 text-center">Scan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {entries.map((e) => (
                <tr key={e.id} className="hover:bg-muted/30 transition-colors">
                  {/* Date & Miti */}
                  <td className="px-3 py-2.5">
                    <div className="font-bold text-foreground">{e.miti}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {format(new Date(e.date), "yyyy-MM-dd")}
                    </div>
                  </td>

                  {/* Voucher Number */}
                  <td className="px-3 py-2.5 font-bold text-primary">
                    {e.voucherNo}
                  </td>

                  {/* Voucher Type */}
                  <td className="px-3 py-2.5">
                    <Badge variant="outline" className="text-[10px] uppercase font-mono">
                      {e.voucherType}
                    </Badge>
                  </td>

                  {/* Particulars */}
                  <td className="px-4 py-2.5 font-sans">
                    <div className="font-semibold text-foreground text-sm">
                      {e.particulars}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-[11px] text-muted-foreground font-mono">
                      <span className="bg-muted px-1.5 py-0.2 rounded font-semibold text-foreground">
                        {e.accountHead}
                      </span>
                      {e.partyPan && <span>PAN: {e.partyPan}</span>}
                    </div>
                  </td>

                  {/* Mode */}
                  <td className="px-3 py-2.5 capitalize text-muted-foreground">
                    {e.paymentMode?.replace(/_/g, " ") || "—"}
                  </td>

                  {/* Debit */}
                  <td className="px-3 py-2.5 text-right font-bold text-foreground">
                    {e.debit > 0 ? fmt(e.debit) : "—"}
                  </td>

                  {/* Credit */}
                  <td className="px-3 py-2.5 text-right font-bold text-foreground">
                    {e.credit > 0 ? fmt(e.credit) : "—"}
                  </td>

                  {/* Scan attachment */}
                  <td className="px-3 py-2.5 text-center">
                    {e.scannedBillUrl ? (
                      <a
                        href={e.scannedBillUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center text-primary hover:underline"
                        title="View Scanned Voucher"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </a>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            {/* Summary Footer */}
            <tfoot className="border-t-2 border-border bg-muted/50 font-bold text-foreground">
              <tr>
                <td colSpan={5} className="px-4 py-3 uppercase tracking-wider font-sans text-xs">
                  Day Book Total ({entries.length} Transactions)
                </td>
                <td className="px-3 py-3 text-right text-emerald-600 dark:text-emerald-400">
                  NPR {fmt(summary.totalDebit)}
                </td>
                <td className="px-3 py-3 text-right text-emerald-600 dark:text-emerald-400">
                  NPR {fmt(summary.totalCredit)}
                </td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
