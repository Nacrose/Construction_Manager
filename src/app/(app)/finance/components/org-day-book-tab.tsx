"use client";

import { useState, useMemo } from "react";
import * as XLSX from "@e965/xlsx";
import { trpc } from "@/lib/trpc-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BookOpen,
  Search,
  Download,
  Eye,
  Plus,
  LayoutList,
  Building2,
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

export function OrgDayBookTab() {
  const [isCompact, setIsCompact] = useState(true);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("all");
  const [voucherType, setVoucherType] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const { data: projectsData } = trpc.project.list.useQuery();
  const projects = projectsData?.projects || [];

  const { data, isLoading } = trpc.finance.orgMasterDayBook.useQuery({
    projectId: selectedProjectId !== "all" ? selectedProjectId : undefined,
    search: search || undefined,
    fromDate: fromDate || undefined,
    toDate: toDate || undefined,
  });

  const rawEntries = data?.entries || [];
  const summary = data?.summary || { totalDebit: 0, totalCredit: 0, count: 0 };

  // Filter by voucher type if selected
  const entries = useMemo(() => {
    if (voucherType === "all") return rawEntries;
    return rawEntries.filter((e) => e.voucherType.toLowerCase() === voucherType.toLowerCase());
  }, [rawEntries, voucherType]);

  // Compute running balance chronologically
  const entriesWithRunning = useMemo(() => {
    let acc = 0;
    const result = new Array(entries.length);
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      acc += (e.debit || 0) - (e.credit || 0);
      result[i] = { ...e, runningBalance: acc };
    }
    return result;
  }, [entries]);

  const handleExportExcel = () => {
    if (entries.length === 0) return;
    try {
      const rows = entriesWithRunning.map((e, idx) => [
        idx + 1,
        format(new Date(e.date), "yyyy-MM-dd"),
        e.miti || "—",
        e.projectCode || "HO",
        e.voucherNo,
        e.voucherType,
        e.accountHead,
        e.particulars,
        e.partyPan || "",
        e.paymentMode || "",
        e.debit > 0 ? e.debit : "",
        e.credit > 0 ? e.credit : "",
        e.runningBalance,
      ]);

      const wsData = [
        ["COMPANY MASTER DAY BOOK / DAILY CASHBOOK (दैनिक रोजकट्टी)"],
        [`As of: ${format(new Date(), "yyyy-MM-dd")}`],
        ["S.N.", "Date (AD)", "Miti (BS)", "Project", "Voucher No", "Voucher Type", "Account Head", "Particulars", "PAN", "Mode", "Debit / Outflow (NPR)", "Credit / Inflow (NPR)", "Running Balance (NPR)"],
        ...rows,
        ["", "", "", "", "", "", "", "TOTAL", "", "", summary.totalDebit, summary.totalCredit, ""],
      ];

      const ws = XLSX.utils.aoa_to_sheet(wsData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "MasterDayBook");
      XLSX.writeFile(wb, `Company_Master_DayBook_${format(new Date(), "yyyy-MM-dd")}.xlsx`);
    } catch (e) {
      console.error(e);
    }
  };

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
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 rounded-xl border border-white/10 bg-[#0c1015] text-xs font-mono">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <span className="text-gray-400">Total Disbursements (Dr):</span>
            <span className="font-bold text-red-400">NPR {fmt(summary.totalDebit)}</span>
          </div>
          <div className="h-3 w-[1px] bg-white/10" />
          <div className="flex items-center gap-2">
            <span className="text-gray-400">Total Invoiced / Inflow (Cr):</span>
            <span className="font-bold text-emerald-400">NPR {fmt(summary.totalCredit)}</span>
          </div>
          <div className="h-3 w-[1px] bg-white/10" />
          <div className="flex items-center gap-2">
            <span className="text-gray-400">Net Flow:</span>
            <span className={cn("font-bold", (summary.totalCredit - summary.totalDebit) >= 0 ? "text-emerald-400" : "text-red-400")}>
              NPR {fmt(summary.totalCredit - summary.totalDebit)}
            </span>
          </div>
        </div>

        <div className="text-[11px] text-gray-500 font-mono">
          {entries.length} Master Journal Entries
        </div>
      </div>

      {/* Action Bar & Quick Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-2xl border border-white/10 bg-[#0c1015]">
        <div className="flex flex-wrap items-center gap-2">
          {/* Project Selector */}
          <div className="w-48">
            <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
              <SelectTrigger className="h-9 text-xs bg-[#121820] text-white rounded-xl border-white/10">
                <SelectValue placeholder="All Projects" />
              </SelectTrigger>
              <SelectContent className="bg-[#0f141c] border-white/10 text-xs text-white">
                <SelectItem value="all">🌐 All Projects (सम्पूर्ण)</SelectItem>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Voucher Type Filter */}
          <Select value={voucherType} onValueChange={setVoucherType}>
            <SelectTrigger className="h-9 text-xs font-mono w-40 bg-[#121820] border-white/10 text-white rounded-xl">
              <SelectValue placeholder="All Vouchers" />
            </SelectTrigger>
            <SelectContent className="bg-[#0f141c] border-emerald-500/30 text-xs text-white">
              <SelectItem value="all">All Vouchers</SelectItem>
              <SelectItem value="payment">Disbursements (भुक्तानी)</SelectItem>
              <SelectItem value="billing">Inflows / Receipts (आम्दानी)</SelectItem>
              <SelectItem value="purchase">Vendor Bills</SelectItem>
              <SelectItem value="work_done">Subcontractor Bills</SelectItem>
              <SelectItem value="head_office">Head Office</SelectItem>
            </SelectContent>
          </Select>

          {/* Search Box */}
          <div className="relative w-64">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-gray-400" />
            <Input
              placeholder="Search party, PAN, particulars..."
              className="pl-8 h-9 text-xs bg-[#121820] text-white rounded-xl border-white/10 focus:border-emerald-400"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setIsCompact(!isCompact)}
            className="h-9 px-2.5 text-xs gap-1.5 font-mono bg-[#121820] text-gray-300 border-white/10 hover:text-white rounded-xl"
            title={isCompact ? "Switch to Comfortable View" : "Switch to Compact View"}
          >
            <LayoutList className="h-3.5 w-3.5 text-emerald-400" />
            {isCompact ? "Compact" : "Comfortable"}
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={handleExportExcel}
            className="h-9 text-xs gap-1.5 font-mono bg-[#121820] text-gray-300 border-white/10 hover:text-white rounded-xl"
          >
            <Download className="h-3.5 w-3.5 text-emerald-400" /> Export Excel
          </Button>
        </div>
      </div>

      {/* Day Book Table - Exactly Matching Project Day Book Layout */}
      {entries.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 p-16 text-center bg-[#0c1015]">
          <BookOpen className="mx-auto h-8 w-8 text-gray-500 mb-2" />
          <p className="text-sm font-semibold text-white">No Journal Entries Recorded</p>
          <p className="text-xs text-gray-400 mt-1">
            Master Day Book entries appear automatically when transactions are logged across any site.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-white/10 bg-[#0c1015]">
          <table className="w-full text-left text-xs font-mono">
            <thead className="border-b border-white/10 bg-[#121820] uppercase text-[10px] text-gray-400">
              <tr>
                <th className={cn(isCompact ? "px-3 py-1.5" : "px-4 py-3")}>Date (Miti / AD)</th>
                <th className={cn(isCompact ? "px-2.5 py-1.5" : "px-3 py-3")}>Project</th>
                <th className={cn(isCompact ? "px-2.5 py-1.5" : "px-3 py-3")}>Voucher #</th>
                <th className={cn(isCompact ? "px-2.5 py-1.5" : "px-3 py-3")}>Type</th>
                <th className={cn("font-sans", isCompact ? "px-3 py-1.5" : "px-4 py-3")}>Particulars &amp; Account Head</th>
                <th className={cn(isCompact ? "px-2.5 py-1.5" : "px-3 py-3")}>Mode</th>
                <th className={cn("text-right", isCompact ? "px-2.5 py-1.5" : "px-3 py-3")}>Debit (Dr)</th>
                <th className={cn("text-right", isCompact ? "px-2.5 py-1.5" : "px-3 py-3")}>Credit (Cr)</th>
                <th className={cn("text-right", isCompact ? "px-2.5 py-1.5" : "px-3 py-3")}>Balance</th>
                <th className={cn("text-center", isCompact ? "px-2.5 py-1.5" : "px-3 py-3")}>Scan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {entriesWithRunning.map((e) => (
                <tr key={e.id} className="hover:bg-white/[0.02] transition-colors">
                  <td className={cn(isCompact ? "px-3 py-1.5" : "px-4 py-3")}>
                    <div className="font-bold text-white leading-tight">{e.miti || "—"}</div>
                    <div className="text-[10px] text-gray-400 leading-tight">
                      {format(new Date(e.date), "yyyy-MM-dd")}
                    </div>
                  </td>
                  <td className={cn(isCompact ? "px-2.5 py-1.5" : "px-3 py-3")}>
                    <Badge variant="outline" className="text-[10px] font-bold bg-white/5 border-white/10 text-emerald-400">
                      {e.projectCode || "HO"}
                    </Badge>
                  </td>
                  <td className={cn("font-bold text-emerald-400", isCompact ? "px-2.5 py-1.5 text-xs" : "px-3 py-3")}>
                    {e.voucherNo}
                  </td>
                  <td className={cn(isCompact ? "px-2.5 py-1.5" : "px-3 py-3")}>
                    <Badge variant="outline" className="text-[10px] uppercase font-mono bg-white/5 border-white/10 text-gray-300 py-0 px-1.5 h-5">
                      {e.voucherType}
                    </Badge>
                  </td>
                  <td className={cn("font-sans", isCompact ? "px-3 py-1.5" : "px-4 py-3")}>
                    <div className={cn("font-semibold text-white truncate max-w-md", isCompact ? "text-xs" : "text-sm")}>
                      {e.particulars}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-[10px] text-gray-400 font-mono">
                      <span className="bg-[#121820] px-1.5 py-0.2 rounded text-emerald-400 border border-white/5 font-semibold">
                        {e.accountHead}
                      </span>
                      {e.partyPan && <span>PAN: {e.partyPan}</span>}
                    </div>
                  </td>
                  <td className={cn("capitalize text-gray-300", isCompact ? "px-2.5 py-1.5" : "px-3 py-3")}>
                    {e.paymentMode?.replace(/_/g, " ") || "—"}
                  </td>
                  <td className={cn("text-right font-bold text-red-400", isCompact ? "px-2.5 py-1.5" : "px-3 py-3")}>
                    {e.debit > 0 ? fmt(e.debit) : "—"}
                  </td>
                  <td className={cn("text-right font-bold text-emerald-400", isCompact ? "px-2.5 py-1.5" : "px-3 py-3")}>
                    {e.credit > 0 ? fmt(e.credit) : "—"}
                  </td>
                  <td className={cn("text-right font-bold font-mono text-white", isCompact ? "px-2.5 py-1.5" : "px-3 py-3")}>
                    {fmt(e.runningBalance)}
                  </td>
                  <td className={cn("text-center", isCompact ? "px-2.5 py-1.5" : "px-3 py-3")}>
                    <span className="text-gray-600">—</span>
                  </td>
                </tr>
              ))}
            </tbody>
            {/* Summary Footer */}
            <tfoot className="border-t-2 border-white/10 bg-[#121820] font-bold text-white">
              <tr>
                <td colSpan={6} className="px-4 py-3.5 uppercase tracking-wider font-sans text-xs">
                  Master Day Book Total ({entries.length} Transactions)
                </td>
                <td className="px-3 py-3.5 text-right text-red-400">
                  NPR {fmt(summary.totalDebit)}
                </td>
                <td className="px-3 py-3.5 text-right text-emerald-400">
                  NPR {fmt(summary.totalCredit)}
                </td>
                <td className="px-3 py-3.5 text-right font-mono text-white">
                  NPR {fmt(summary.totalDebit - summary.totalCredit)}
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
