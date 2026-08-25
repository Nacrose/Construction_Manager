"use client";

import { useState, useMemo } from "react";
import * as XLSX from "@e965/xlsx";
import { trpc } from "@/lib/trpc-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Search,
  Download,
  LayoutList,
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

function fmt(n: number) {
  return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function OrgPartyStatementTab() {
  const [isCompact, setIsCompact] = useState(true);
  const [searchParty, setSearchParty] = useState("");
  const [selectedPartyName, setSelectedPartyName] = useState<string>("");

  // 1. Fetch all distinct payables/parties across the company
  const { data: payablesData, isLoading: payablesLoading } = trpc.finance.orgPayables.useQuery({
    search: searchParty || undefined,
    type: "all",
  });

  const suppliers = payablesData?.suppliers || [];
  const activeParty = selectedPartyName || suppliers[0]?.name || "";

  // 2. Fetch full multi-project statement for selected party
  const { data: statementData, isLoading: statementLoading } = trpc.finance.orgPartyStatement.useQuery(
    { partyName: activeParty },
    { enabled: Boolean(activeParty) }
  );

  const transactions = statementData?.transactions || [];
  const totalBilled = statementData?.totalBilled || 0;
  const totalPaid = statementData?.totalPaid || 0;
  const closingBalance = statementData?.closingBalanceDue || 0;

  // Compute running balance chronologically
  const transactionsWithRunning = useMemo(() => {
    let running = 0;
    return transactions.map((t) => {
      running += (t.credit || 0) - (t.debit || 0); // Billed increases payable, paid reduces it
      return { ...t, runningBalance: running };
    });
  }, [transactions]);

  const handleExportExcel = () => {
    if (transactions.length === 0 || !activeParty) return;
    try {
      const rows = transactionsWithRunning.map((t, idx) => [
        idx + 1,
        format(new Date(t.date), "yyyy-MM-dd"),
        t.projectCode || "HO",
        t.voucherNo,
        t.voucherType,
        t.particulars,
        t.debit > 0 ? t.debit : "",
        t.credit > 0 ? t.credit : "",
        t.runningBalance,
      ]);

      const wsData = [
        [`COMPANY STATEMENT OF ACCOUNT: ${activeParty.toUpperCase()}`],
        [`As of: ${format(new Date(), "yyyy-MM-dd")}`],
        ["S.N.", "Date (AD)", "Project", "Voucher No", "Type", "Particulars", "Debit Paid (NPR)", "Credit Billed (NPR)", "Closing Balance Due (NPR)"],
        ...rows,
        ["", "", "", "", "", "TOTAL", totalPaid, totalBilled, closingBalance],
      ];

      const ws = XLSX.utils.aoa_to_sheet(wsData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Statement");
      XLSX.writeFile(wb, `${activeParty}_Master_Statement_${format(new Date(), "yyyy-MM-dd")}.xlsx`);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="space-y-4">
      {/* 2-Column Split Khatabook Ledger (Exactly Matching Project Level) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Pane: Parties Directory (4 cols) */}
        <div className="lg:col-span-4 space-y-3 rounded-2xl border border-white/10 bg-[#0c1015] p-3.5">
          <div className="flex items-center justify-between pb-2 border-b border-white/5">
            <span className="text-xs font-bold text-white uppercase tracking-wider">
              Suppliers &amp; Contractors ({suppliers.length})
            </span>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-gray-400" />
            <Input
              placeholder="Search party by name or PAN..."
              className="pl-8 h-9 text-xs bg-[#121820] text-white rounded-xl border-white/10 focus:border-emerald-400"
              value={searchParty}
              onChange={(e) => setSearchParty(e.target.value)}
            />
          </div>

          <div className="space-y-1.5 max-h-[620px] overflow-y-auto pr-1">
            {payablesLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full rounded-xl bg-white/5" />
              ))
            ) : suppliers.length === 0 ? (
              <div className="py-12 text-center text-xs text-gray-400">
                No parties found matching "{searchParty}"
              </div>
            ) : (
              suppliers.map((p) => {
                const isSelected = activeParty === p.name;
                return (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => setSelectedPartyName(p.name)}
                    className={cn(
                      "w-full text-left p-3 rounded-xl border transition-all text-xs flex items-center justify-between group",
                      isSelected
                        ? "bg-emerald-500/10 border-emerald-500/40 text-white shadow-[0_0_15px_rgba(0,255,102,0.06)]"
                        : "border-white/5 bg-[#121820]/60 hover:bg-[#121820] text-gray-300 hover:text-white"
                    )}
                  >
                    <div className="space-y-1 min-w-0 pr-2">
                      <div className="font-semibold truncate text-white flex items-center gap-1.5">
                        {p.name}
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-gray-400 font-mono">
                        {p.pan && <span>PAN: {p.pan}</span>}
                        <span>• {p.billsCount} Bills</span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-bold font-mono text-amber-400 text-xs">
                        Rs. {fmt(p.totalDue)}
                      </div>
                      <span className="text-[9px] text-gray-500 uppercase">Due</span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Right Pane: Party Khata Statement Ledger (8 cols) */}
        <div className="lg:col-span-8 space-y-3">
          {/* Active Party Header Banner */}
          <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-2xl border border-white/10 bg-[#0c1015]">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white tracking-wide">
                  {activeParty || "Select a Party"}
                </h2>
                <Badge variant="outline" className="text-[10px] uppercase font-mono bg-white/5 border-white/10 text-gray-300">
                  Consolidated Statement
                </Badge>
              </div>
              <p className="text-xs text-gray-400 mt-0.5 font-mono">
                Multi-project chronological transaction history &amp; running balance.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setIsCompact(!isCompact)}
                className="h-8 px-2.5 text-xs gap-1.5 font-mono bg-[#121820] text-gray-300 border-white/10 hover:text-white rounded-xl"
              >
                <LayoutList className="h-3.5 w-3.5 text-emerald-400" />
                {isCompact ? "Compact" : "Comfortable"}
              </Button>

              <Button
                size="sm"
                variant="outline"
                onClick={handleExportExcel}
                disabled={transactions.length === 0}
                className="h-8 text-xs gap-1.5 font-mono bg-[#121820] text-gray-300 border-white/10 hover:text-white rounded-xl"
              >
                <Download className="h-3.5 w-3.5 text-emerald-400" /> Export Excel
              </Button>
            </div>
          </div>

          {/* 3-Head Financial Summary Strip */}
          <div className="grid grid-cols-3 gap-3">
            <div className="p-3 rounded-xl border border-white/10 bg-[#0c1015] space-y-0.5">
              <span className="text-[10px] font-mono text-gray-400 uppercase">Total Invoiced / Billed</span>
              <div className="text-base font-bold font-mono text-emerald-400">
                Rs. {fmt(totalBilled)}
              </div>
            </div>
            <div className="p-3 rounded-xl border border-white/10 bg-[#0c1015] space-y-0.5">
              <span className="text-[10px] font-mono text-gray-400 uppercase">Total Settled / Paid</span>
              <div className="text-base font-bold font-mono text-blue-400">
                Rs. {fmt(totalPaid)}
              </div>
            </div>
            <div className="p-3 rounded-xl border border-white/10 bg-[#0c1015] space-y-0.5">
              <span className="text-[10px] font-mono text-gray-400 uppercase">Net Closing Balance Due</span>
              <div className="text-base font-bold font-mono text-amber-400">
                Rs. {fmt(closingBalance)}
              </div>
            </div>
          </div>

          {/* Transactions Statement Table */}
          {statementLoading ? (
            <Skeleton className="h-72 rounded-2xl bg-white/5" />
          ) : transactions.length === 0 ? (
            <div className="p-16 rounded-2xl border border-dashed border-white/10 bg-[#0c1015] text-center text-xs text-gray-400">
              No transactions recorded for this party.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-white/10 bg-[#0c1015]">
              <table className="w-full text-left text-xs font-mono">
                <thead className="border-b border-white/10 bg-[#121820] uppercase text-[10px] text-gray-400">
                  <tr>
                    <th className={cn(isCompact ? "px-3 py-1.5" : "px-4 py-3")}>Date</th>
                    <th className={cn(isCompact ? "px-2.5 py-1.5" : "px-3 py-3")}>Project</th>
                    <th className={cn(isCompact ? "px-2.5 py-1.5" : "px-3 py-3")}>Voucher #</th>
                    <th className={cn("font-sans", isCompact ? "px-3 py-1.5" : "px-4 py-3")}>Particulars</th>
                    <th className={cn("text-right", isCompact ? "px-2.5 py-1.5" : "px-3 py-3")}>Paid (Dr)</th>
                    <th className={cn("text-right", isCompact ? "px-2.5 py-1.5" : "px-3 py-3")}>Billed (Cr)</th>
                    <th className={cn("text-right", isCompact ? "px-2.5 py-1.5" : "px-3 py-3")}>Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {transactionsWithRunning.map((t) => (
                    <tr key={t.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className={cn(isCompact ? "px-3 py-1.5" : "px-4 py-3")}>
                        <div className="text-gray-300">
                          {format(new Date(t.date), "yyyy-MM-dd")}
                        </div>
                      </td>
                      <td className={cn(isCompact ? "px-2.5 py-1.5" : "px-3 py-3")}>
                        <Badge variant="outline" className="text-[10px] font-bold bg-white/5 border-white/10 text-emerald-400">
                          {t.projectCode || "HO"}
                        </Badge>
                      </td>
                      <td className={cn("font-bold text-emerald-400", isCompact ? "px-2.5 py-1.5 text-xs" : "px-3 py-3")}>
                        {t.voucherNo}
                      </td>
                      <td className={cn("font-sans", isCompact ? "px-3 py-1.5" : "px-4 py-3")}>
                        <div className="font-medium text-white truncate max-w-md">{t.particulars}</div>
                      </td>
                      <td className={cn("text-right font-bold text-blue-400", isCompact ? "px-2.5 py-1.5" : "px-3 py-3")}>
                        {t.debit > 0 ? fmt(t.debit) : "—"}
                      </td>
                      <td className={cn("text-right font-bold text-emerald-400", isCompact ? "px-2.5 py-1.5" : "px-3 py-3")}>
                        {t.credit > 0 ? fmt(t.credit) : "—"}
                      </td>
                      <td className={cn("text-right font-bold font-mono text-amber-400", isCompact ? "px-2.5 py-1.5" : "px-3 py-3")}>
                        {fmt(t.runningBalance)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
