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
          <Badge variant="outline" className="text-[10px] font-bold bg-white/5 border-white/10 text-success/80">
            {val}
          </Badge>
        ),
      },
      {
        key: "voucherNo",
        header: "Voucher #",
        width: "120px",
        render: (val) => <span className="font-bold text-success/80">{val}</span>,
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
          <span className="font-bold text-info/80">
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
          <span className="font-bold text-success/80">
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
        <div className="lg:col-span-4 space-y-3 rounded-2xl border border-[var(--border)] bg-card shadow-xs p-3.5">
          <div className="flex items-center justify-between pb-2 border-b border-[var(--input)]">
            <span className="text-xs font-bold text-foreground uppercase tracking-wider">
              Suppliers &amp; Contractors ({suppliers.length})
            </span>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground/80" />
            <Input
              placeholder="Search party by name or PAN..."
              className="pl-8 h-9 text-xs bg-card text-foreground rounded-lg border border-[var(--border)] focus:border-[var(--primary)]"
              value={searchParty}
              onChange={(e) => setSearchParty(e.target.value)}
            />
          </div>

          <div className="space-y-1.5 max-h-[620px] overflow-y-auto pr-1">
            {payablesLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full rounded-xl bg-muted" />
              ))
            ) : suppliers.length === 0 ? (
              <div className="py-12 text-center text-xs text-muted-foreground">
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
                        ? "bg-info/10 border-[var(--primary)] text-foreground shadow-xs"
                        : "border-[var(--input)] bg-card hover:bg-muted/60 text-foreground/80"
                    )}
                  >
                    <div className="space-y-1 min-w-0 pr-2">
                      <div className="font-semibold truncate text-foreground flex items-center gap-1.5">
                        {p.name}
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground font-mono">
                        {p.pan && <span>PAN: {p.pan}</span>}
                        <span>• {p.billsCount} Bills</span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-bold font-mono text-amber-700 text-xs font-matrix">
                        {formatNpr(p.totalDue)}
                      </div>
                      <span className="text-[9px] text-muted-foreground uppercase">Due</span>
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
          <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-2xl border border-[var(--border)] bg-card shadow-xs">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-foreground tracking-wide">
                  {activeParty || "Select a Party"}
                </h2>
                <Badge variant="outline" className="text-[10px] uppercase font-mono bg-info/10 border-[#bae6fd] text-[var(--primary)]">
                  Consolidated Statement
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 font-mono">
                Multi-project chronological transaction history &amp; running balance.
              </p>
            </div>
          </div>

          {/* 3-Head Financial Summary Strip */}
          <div className="grid grid-cols-3 gap-3">
            <div className="p-3 rounded-xl border border-[var(--border)] bg-card shadow-xs space-y-0.5">
              <span className="text-[10px] font-mono text-muted-foreground uppercase">Total Invoiced / Billed</span>
              <div className="text-base font-bold font-mono text-foreground font-matrix">
                {formatNpr(totalBilled)}
              </div>
            </div>
            <div className="p-3 rounded-xl border border-[var(--border)] bg-card shadow-xs space-y-0.5">
              <span className="text-[10px] font-mono text-muted-foreground uppercase">Total Settled / Paid</span>
              <div className="text-base font-bold font-mono text-[var(--primary)] font-matrix">
                {formatNpr(totalPaid)}
              </div>
            </div>
            <div className="p-3 rounded-xl border border-[var(--border)] bg-card shadow-xs space-y-0.5">
              <span className="text-[10px] font-mono text-muted-foreground uppercase">Net Closing Balance Due</span>
              <div className="text-base font-bold font-mono text-amber-700 font-matrix">
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
            className="border-[var(--border)] bg-card"
          />
        </div>
      </div>
    </div>
  );
}
