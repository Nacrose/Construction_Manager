"use client";

import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc-client";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { BookOpen } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { formatNpr } from "@/lib/currency";
import { ConstructionTable, type ConstructionTableColumn } from "@/components/ui/construction-table";

export function OrgDayBookTab() {
  const [selectedProjectId, setSelectedProjectId] = useState<string>("all");
  const [voucherType, setVoucherType] = useState<string>("all");

  const { data: projectsData } = trpc.project.list.useQuery();
  const projects = projectsData?.projects || [];

  const { data, isLoading } = trpc.finance.orgMasterDayBook.useQuery({
    projectId: selectedProjectId !== "all" ? selectedProjectId : undefined,
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

  const columns: ConstructionTableColumn<any>[] = useMemo(
    () => [
      {
        key: "date",
        header: "Date (Miti / AD)",
        render: (_val, row) => (
          <div>
            <div className="font-bold text-white leading-tight">{row.miti || "—"}</div>
            <div className="text-[10px] text-gray-400 leading-tight">
              {format(new Date(row.date), "yyyy-MM-dd")}
            </div>
          </div>
        ),
      },
      {
        key: "projectCode",
        header: "Project",
        render: (val) => (
          <Badge variant="outline" className="text-[10px] font-bold bg-white/5 border-white/10 text-emerald-400">
            {val || "HO"}
          </Badge>
        ),
      },
      {
        key: "voucherNo",
        header: "Voucher #",
        className: "font-bold text-emerald-400",
      },
      {
        key: "voucherType",
        header: "Type",
        format: "badge",
      },
      {
        key: "particulars",
        header: "Particulars & Account Head",
        className: "font-sans",
        render: (val, row) => (
          <div>
            <div className="font-semibold text-white truncate max-w-md text-xs">{val}</div>
            <div className="flex items-center gap-2 mt-0.5 text-[10px] text-gray-400 font-mono">
              <span className="bg-[#121820] px-1.5 py-0.2 rounded text-emerald-400 border border-white/5 font-semibold">
                {row.accountHead}
              </span>
              {row.partyPan && <span>PAN: {row.partyPan}</span>}
            </div>
          </div>
        ),
      },
      {
        key: "paymentMode",
        header: "Mode",
        render: (val) => <span className="capitalize text-gray-300">{val?.replace(/_/g, " ") || "—"}</span>,
      },
      {
        key: "debit",
        header: "Debit (Dr)",
        align: "right",
        summary: "sum",
        className: "text-red-400 font-bold",
        render: (val) => (val > 0 ? formatNpr(val) : "—"),
      },
      {
        key: "credit",
        header: "Credit (Cr)",
        align: "right",
        summary: "sum",
        className: "text-emerald-400 font-bold",
        render: (val) => (val > 0 ? formatNpr(val) : "—"),
      },
      {
        key: "runningBalance",
        header: "Balance",
        align: "right",
        className: "font-bold font-mono text-white",
        render: (val) => formatNpr(val),
      },
    ],
    []
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
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 rounded-xl border border-[#c7d8e8] bg-white shadow-xs text-xs font-mono">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <span className="text-slate-500">Total Disbursements (Dr):</span>
            <span className="font-bold text-rose-700 font-matrix">NPR {formatNpr(summary.totalDebit)}</span>
          </div>
          <div className="h-3 w-[1px] bg-[#c7d8e8]" />
          <div className="flex items-center gap-2">
            <span className="text-slate-500">Total Invoiced / Inflow (Cr):</span>
            <span className="font-bold text-emerald-700 font-matrix">NPR {formatNpr(summary.totalCredit)}</span>
          </div>
          <div className="h-3 w-[1px] bg-[#c7d8e8]" />
          <div className="flex items-center gap-2">
            <span className="text-slate-500">Net Flow:</span>
            <span className={cn("font-bold font-matrix", summary.totalCredit - summary.totalDebit >= 0 ? "text-emerald-700" : "text-rose-700")}>
              NPR {formatNpr(summary.totalCredit - summary.totalDebit)}
            </span>
          </div>
        </div>

        <div className="text-[11px] text-slate-500 font-mono">
          {entries.length} Master Journal Entries
        </div>
      </div>

      {/* Construction Table Component */}
      <ConstructionTable
        title="Company Master Day Book / Daily Cashbook (दैनिक रोजकट्टी)"
        data={entriesWithRunning}
        columns={columns}
        searchPlaceholder="Search party, PAN, particulars, voucher..."
        exportExcel={{
          filename: "Company_Master_DayBook",
          sheetName: "MasterDayBook",
        }}
        emptyState={{
          icon: BookOpen,
          title: "No Journal Entries Recorded",
          description: "Master Day Book entries appear automatically when transactions are logged across any site.",
        }}
        headerActions={
          <div className="flex items-center gap-2">
            {/* Project Selector */}
            <div className="w-44">
              <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
                <SelectTrigger className="h-8 text-xs bg-[#121820] text-white rounded-lg border-white/10">
                  <SelectValue placeholder="All Projects" />
                </SelectTrigger>
                <SelectContent className="bg-[#0f141c] border-white/10 text-xs text-white">
                  <SelectItem value="all">🌐 All Projects</SelectItem>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Voucher Type Filter */}
            <div className="w-36">
              <Select value={voucherType} onValueChange={setVoucherType}>
                <SelectTrigger className="h-8 text-xs font-mono bg-[#121820] border-white/10 text-white rounded-lg">
                  <SelectValue placeholder="All Vouchers" />
                </SelectTrigger>
                <SelectContent className="bg-[#0f141c] border-emerald-500/30 text-xs text-white">
                  <SelectItem value="all">All Vouchers</SelectItem>
                  <SelectItem value="payment">Disbursements (भुक्तानी)</SelectItem>
                  <SelectItem value="billing">Inflows / Receipts</SelectItem>
                  <SelectItem value="purchase">Vendor Bills</SelectItem>
                  <SelectItem value="work_done">Subcontractor Bills</SelectItem>
                  <SelectItem value="head_office">Head Office</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        }
      />
    </div>
  );
}
