"use client";

import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc-client";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Search } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { formatNpr } from "@/lib/currency";
import { ConstructionTable, ConstructionTableColumn } from "@/components/ui/construction-table";

type StatementTxn = {
  id: string;
  date: Date | string;
  projectCode?: string | null;
  voucherNo: string;
  voucherType: string;
  particulars: string;
  debit: number;
  credit: number;
  runningBalance: number;
};

export function OrgPartyStatementTab() {
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
  const transactionsWithRunning: StatementTxn[] = useMemo(() => {
    let acc = 0;
    const result: StatementTxn[] = new Array(transactions.length);
    for (let i = 0; i < transactions.length; i++) {
      const t = transactions[i];
      acc += (t.credit || 0) - (t.debit || 0); // Billed increases payable, paid reduces it
      result[i] = { ...t, runningBalance: acc };
    }
    return result;
  }, [transactions]);

  const columns: ConstructionTableColumn<StatementTxn>[] = useMemo(
    () => [
      {
        key: "date",
        header: "Date (AD)",
        accessor: (r) => format(new Date(r.date), "yyyy-MM-dd"),
        width: "120px",
        sortable: true,
      },
      {
        key: "projectCode",
        header: "Project",
        accessor: (r) => r.projectCode || "HO",
        width: "100px",
        render: (val) => (
          <Badge variant="outline" className="text-[10px] font-bold bg-white/5 border-white/10 text-emerald-400">
            {val}
          </Badge>
        ),
      },
      {
        key: "voucherNo",
        header: "Voucher #",
        width: "120px",
        render: (val) => <span className="font-bold text-emerald-400">{val}</span>,
      },
      {
        key: "particulars",
        header: "Particulars",
        render: (val) => <span className="text-white font-medium truncate max-w-md block">{val}</span>,
      },
      {
        key: "debit",
        header: "Paid (Dr)",
        align: "right",
        width: "130px",
        render: (val) => (
          <span className="font-bold text-blue-400">
            {val > 0 ? formatNpr(val) : "—"}
          </span>
        ),
      },
      {
        key: "credit",
        header: "Billed (Cr)",
        align: "right",
        width: "130px",
        render: (val) => (
          <span className="font-bold text-emerald-400">
            {val > 0 ? formatNpr(val) : "—"}
          </span>
        ),
      },
      {
        key: "runningBalance",
        header: "Closing Balance Due",
        align: "right",
        width: "160px",
        render: (val) => (
          <span className="font-bold font-mono text-amber-400">
            {formatNpr(val)}
          </span>
        ),
      },
    ],
    []
  );

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
                        {formatNpr(p.totalDue)}
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
          </div>

          {/* 3-Head Financial Summary Strip */}
          <div className="grid grid-cols-3 gap-3">
            <div className="p-3 rounded-xl border border-white/10 bg-[#0c1015] space-y-0.5">
              <span className="text-[10px] font-mono text-gray-400 uppercase">Total Invoiced / Billed</span>
              <div className="text-base font-bold font-mono text-emerald-400">
                {formatNpr(totalBilled)}
              </div>
            </div>
            <div className="p-3 rounded-xl border border-white/10 bg-[#0c1015] space-y-0.5">
              <span className="text-[10px] font-mono text-gray-400 uppercase">Total Settled / Paid</span>
              <div className="text-base font-bold font-mono text-blue-400">
                {formatNpr(totalPaid)}
              </div>
            </div>
            <div className="p-3 rounded-xl border border-white/10 bg-[#0c1015] space-y-0.5">
              <span className="text-[10px] font-mono text-gray-400 uppercase">Net Closing Balance Due</span>
              <div className="text-base font-bold font-mono text-amber-400">
                {formatNpr(closingBalance)}
              </div>
            </div>
          </div>

          {/* Transactions Statement ConstructionTable */}
          <ConstructionTable<StatementTxn>
            data={transactionsWithRunning}
            columns={columns}
            isLoading={statementLoading}
            searchPlaceholder="Search particulars, voucher #..."
            searchFilterKeys={["voucherNo", "particulars", "projectCode"]}
            exportExcel={{
              filename: `${activeParty || "Party"}_Master_Statement_${format(new Date(), "yyyy-MM-dd")}`,
              sheetName: "PartyStatement",
            }}
            emptyState={{
              title: "No transactions recorded for this party",
              description: "Transactions will automatically populate when vendor bills or subcontractor payments are posted.",
            }}
            className="border-white/10 bg-[#0c1015]"
          />
        </div>
      </div>
    </div>
  );
}
