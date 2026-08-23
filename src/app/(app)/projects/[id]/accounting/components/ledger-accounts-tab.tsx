"use client";

import { useState } from "react";
import * as XLSX from "@e965/xlsx";
import { trpc } from "@/lib/trpc-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Users,
  Building2,
  Wallet,
  FolderTree,
  Search,
  Download,
  Printer,
  FileText,
  CreditCard,
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

function fmt(n: number) {
  return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function LedgerAccountsTab({ projectId }: { projectId: string }) {
  const [searchAccount, setSearchAccount] = useState("");
  const [selectedAccount, setSelectedAccount] = useState<{
    id: string;
    name: string;
    type: "vendor" | "subcontractor" | "bank" | "cash" | "expense_head";
    group: string;
    pan?: string | null;
  } | null>(null);

  const { data: accountsData, isLoading: accountsLoading } = trpc.accounting.ledgerAccounts.useQuery({
    projectId,
  });

  const accounts = accountsData?.accounts || [];

  // Default to first account if none selected
  const activeAccount = selectedAccount || accounts[0] || null;

  const { data: statementData, isLoading: statementLoading } = trpc.accounting.ledgerStatement.useQuery(
    {
      projectId,
      accountId: activeAccount?.id || "",
      accountType: activeAccount?.type || "vendor",
      accountName: activeAccount?.name,
    },
    { enabled: Boolean(activeAccount) }
  );

  const transactions = statementData?.transactions || [];
  const closingBalance = statementData?.closingBalance || 0;
  const totalDebit = statementData?.totalDebit || 0;
  const totalCredit = statementData?.totalCredit || 0;

  const filteredAccounts = accounts.filter((a) => {
    if (!searchAccount) return true;
    const q = searchAccount.toLowerCase();
    return a.name.toLowerCase().includes(q) || a.group.toLowerCase().includes(q) || a.pan?.includes(q);
  });

  const handleExportStatement = () => {
    if (!activeAccount) return;
    try {
      const rows = transactions.map((t, idx) => [
        idx + 1,
        t.date ? format(new Date(t.date), "yyyy-MM-dd") : "—",
        t.miti || "—",
        t.voucherNo,
        t.voucherType,
        t.particulars,
        t.debit,
        t.credit,
        t.runningBalance,
      ]);

      const wsData = [
        [`STATEMENT OF ACCOUNT: ${activeAccount.name.toUpperCase()}`],
        [`Group: ${activeAccount.group}`, `PAN: ${activeAccount.pan || "N/A"}`],
        ["S.N.", "Date (AD)", "Miti (BS)", "Voucher No", "Type", "Particulars", "Debit (NPR)", "Credit (NPR)", "Balance (NPR)"],
        ...rows,
        ["", "", "", "", "", "TOTAL", totalDebit, totalCredit, closingBalance],
      ];

      const ws = XLSX.utils.aoa_to_sheet(wsData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Ledger");
      XLSX.writeFile(wb, `${activeAccount.name}_Ledger_${format(new Date(), "yyyy-MM-dd")}.xlsx`);
    } catch (e) {
      console.error(e);
    }
  };

  if (accountsLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Skeleton className="h-96 rounded-xl" />
        <Skeleton className="h-96 md:col-span-2 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {/* Left Pane: Ledger Accounts Directory */}
      <div className="rounded-xl border bg-card p-3 space-y-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search party or account..."
            className="pl-8 h-8 text-xs"
            value={searchAccount}
            onChange={(e) => setSearchAccount(e.target.value)}
          />
        </div>

        <div className="space-y-1 max-h-[600px] overflow-y-auto pr-1">
          {filteredAccounts.map((acc) => {
            const isSelected = activeAccount?.id === acc.id;
            return (
              <button
                key={acc.id}
                onClick={() => setSelectedAccount(acc)}
                className={cn(
                  "w-full text-left p-2.5 rounded-lg border transition-all text-xs flex items-center justify-between",
                  isSelected
                    ? "bg-primary/10 border-primary text-primary font-bold shadow-sm"
                    : "border-transparent hover:bg-muted/60 text-muted-foreground hover:text-foreground"
                )}
              >
                <div className="space-y-0.5 overflow-hidden pr-2">
                  <div className="font-semibold text-foreground truncate">{acc.name}</div>
                  <div className="text-[10px] text-muted-foreground truncate">{acc.group}</div>
                </div>
                {acc.type === "vendor" ? (
                  <Building2 className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                ) : acc.type === "subcontractor" ? (
                  <Users className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
                ) : acc.type === "bank" ? (
                  <Wallet className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                ) : (
                  <FolderTree className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Right Pane: Statement of Account */}
      <div className="md:col-span-2 rounded-xl border bg-card overflow-hidden flex flex-col">
        {activeAccount ? (
          <>
            {/* Account Header */}
            <div className="p-4 border-b bg-muted/20 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-foreground">{activeAccount.name}</h3>
                  <Badge variant="outline" className="text-[10px]">
                    {activeAccount.group}
                  </Badge>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground font-mono mt-0.5">
                  {activeAccount.pan && <span>PAN: {activeAccount.pan}</span>}
                  <span>Account ID: {activeAccount.id}</span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="text-right font-mono">
                  <div className="text-[10px] uppercase text-muted-foreground">Current Balance</div>
                  <div className="text-sm font-bold text-foreground">
                    NPR {fmt(Math.abs(closingBalance))} {closingBalance >= 0 ? "(Cr)" : "(Dr)"}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleExportStatement}
                  className="h-8 text-xs gap-1 font-mono"
                >
                  <Download className="h-3 w-3 text-emerald-600" />
                  Excel
                </Button>
              </div>
            </div>

            {/* Statement Table */}
            {statementLoading ? (
              <div className="p-8">
                <Skeleton className="h-40 w-full rounded-xl" />
              </div>
            ) : transactions.length === 0 ? (
              <div className="p-12 text-center text-muted-foreground text-xs">
                No transactions recorded for this account yet.
              </div>
            ) : (
              <div className="overflow-x-auto flex-1">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="border-b bg-muted/60 uppercase text-[10px] text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2.5">Date / Miti</th>
                      <th className="px-3 py-2.5">Voucher #</th>
                      <th className="px-3 py-2.5">Type</th>
                      <th className="px-4 py-2.5 font-sans">Particulars</th>
                      <th className="px-3 py-2.5 text-right">Debit (Dr)</th>
                      <th className="px-3 py-2.5 text-right">Credit (Cr)</th>
                      <th className="px-3 py-2.5 text-right">Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {transactions.map((t) => (
                      <tr key={t.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-3 py-2">
                          <div className="font-bold text-foreground">{t.miti}</div>
                          <div className="text-[10px] text-muted-foreground">
                            {format(new Date(t.date), "yyyy-MM-dd")}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-primary font-bold">{t.voucherNo}</td>
                        <td className="px-3 py-2">{t.voucherType}</td>
                        <td className="px-4 py-2 font-sans text-foreground">{t.particulars}</td>
                        <td className="px-3 py-2 text-right">{t.debit > 0 ? fmt(t.debit) : "—"}</td>
                        <td className="px-3 py-2 text-right">{t.credit > 0 ? fmt(t.credit) : "—"}</td>
                        <td className="px-3 py-2 text-right font-bold">
                          {fmt(Math.abs(t.runningBalance))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t-2 bg-muted/40 font-bold">
                    <tr>
                      <td colSpan={4} className="px-4 py-2.5 uppercase font-sans text-xs">
                        Account Total
                      </td>
                      <td className="px-3 py-2.5 text-right text-emerald-600 dark:text-emerald-400">
                        NPR {fmt(totalDebit)}
                      </td>
                      <td className="px-3 py-2.5 text-right text-emerald-600 dark:text-emerald-400">
                        NPR {fmt(totalCredit)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-bold text-foreground">
                        NPR {fmt(Math.abs(closingBalance))}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </>
        ) : (
          <div className="p-12 text-center text-muted-foreground text-xs">
            Select an account from the left to view statement.
          </div>
        )}
      </div>
    </div>
  );
}
