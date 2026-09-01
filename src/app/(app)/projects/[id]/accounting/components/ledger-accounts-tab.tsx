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
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { formatNpr } from "@/lib/currency";
import { ConstructionTable, ConstructionTableColumn } from "@/components/ui/construction-table";

export function LedgerAccountsTab({ projectId }: { projectId: string }) {
  const [searchAccount, setSearchAccount] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<"all" | "suppliers" | "subcontractors" | "staff" | "bank_cash">("all");
  const [selectedAccount, setSelectedAccount] = useState<{
    id: string;
    name: string;
    type: "vendor" | "subcontractor" | "staff" | "bank" | "cash";
    group: string;
    pan?: string | null;
  } | null>(null);

  const { data: accountsData, isLoading: accountsLoading } = trpc.accounting.ledgerAccounts.useQuery({
    projectId,
  });

  const accounts = accountsData?.accounts || [];

  const filteredAccounts = accounts.filter((a) => {
    // Category Filter
    if (categoryFilter === "suppliers") {
      if (a.type !== "vendor") return false;
    } else if (categoryFilter === "subcontractors") {
      if (a.type !== "subcontractor") return false;
    } else if (categoryFilter === "staff") {
      if (a.type !== "staff") return false;
    } else if (categoryFilter === "bank_cash") {
      if (a.type !== "bank" && a.type !== "cash") return false;
    }

    if (!searchAccount) return true;
    const q = searchAccount.toLowerCase();
    return a.name.toLowerCase().includes(q) || a.group.toLowerCase().includes(q) || a.pan?.includes(q);
  });

  // Default to first account if none selected or selected account is filtered out
  const activeAccount = filteredAccounts.find((a) => a.id === selectedAccount?.id) || filteredAccounts[0] || null;

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

  const columns: ConstructionTableColumn<any>[] = [
    {
      key: "date",
      header: "Date / Miti",
      render: (_, t) => (
        <div className="font-mono text-xs">
          <div className="font-bold text-foreground">{t.miti}</div>
          <div className="text-[10px] text-muted-foreground">
            {format(new Date(t.date), "yyyy-MM-dd")}
          </div>
        </div>
      ),
    },
    {
      key: "voucherNo",
      header: "Voucher #",
      render: (_, t) => <span className="font-bold font-mono text-xs text-primary">{t.voucherNo}</span>,
    },
    {
      key: "voucherType",
      header: "Type",
      render: (_, t) => <span className="font-mono text-xs text-muted-foreground">{t.voucherType}</span>,
    },
    {
      key: "particulars",
      header: "Particulars",
      render: (_, t) => (
        <span className="font-sans font-medium text-foreground text-xs truncate max-w-sm block" title={t.particulars}>
          {t.particulars}
        </span>
      ),
    },
    {
      key: "debit",
      header: "Debit (Dr)",
      align: "right",
      render: (_, t) => (
        <span className="font-mono text-xs text-primary font-bold">
          {t.debit > 0 ? formatNpr(t.debit) : "—"}
        </span>
      ),
    },
    {
      key: "credit",
      header: "Credit (Cr)",
      align: "right",
      render: (_, t) => (
        <span className="font-mono text-xs text-amber-600 dark:text-amber-400 font-bold">
          {t.credit > 0 ? formatNpr(t.credit) : "—"}
        </span>
      ),
    },
    {
      key: "runningBalance",
      header: "Balance",
      align: "right",
      render: (_, t) => (
        <span className="font-mono text-xs font-bold text-foreground">
          {formatNpr(Math.abs(t.runningBalance))}
        </span>
      ),
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start">
      {/* Left Column: Account Hierarchy & Directory */}
      <div className="md:col-span-4 rounded-xl border bg-card p-3 space-y-3 flex flex-col max-h-[640px]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 font-bold text-xs uppercase font-mono text-foreground">
            <FolderTree className="h-4 w-4 text-primary" />
            Chart of Accounts ({accounts.length})
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={searchAccount}
            onChange={(e) => setSearchAccount(e.target.value)}
            placeholder="Search account, group, PAN..."
            className="h-8 text-xs pl-8 font-mono"
          />
        </div>

        {/* Quick Filter Buttons */}
        <div className="flex flex-wrap gap-1">
          <Button
            size="sm"
            variant={categoryFilter === "all" ? "default" : "outline"}
            onClick={() => setCategoryFilter("all")}
            className="h-6 text-[10px] px-2 font-mono"
          >
            All
          </Button>
          <Button
            size="sm"
            variant={categoryFilter === "suppliers" ? "default" : "outline"}
            onClick={() => setCategoryFilter("suppliers")}
            className="h-6 text-[10px] px-2 font-mono"
          >
            Vendors
          </Button>
          <Button
            size="sm"
            variant={categoryFilter === "subcontractors" ? "default" : "outline"}
            onClick={() => setCategoryFilter("subcontractors")}
            className="h-6 text-[10px] px-2 font-mono"
          >
            Subs
          </Button>
          <Button
            size="sm"
            variant={categoryFilter === "staff" ? "default" : "outline"}
            onClick={() => setCategoryFilter("staff")}
            className="h-6 text-[10px] px-2 font-mono"
          >
            Staff
          </Button>
          <Button
            size="sm"
            variant={categoryFilter === "bank_cash" ? "default" : "outline"}
            onClick={() => setCategoryFilter("bank_cash")}
            className="h-6 text-[10px] px-2 font-mono"
          >
            Bank/Cash
          </Button>
        </div>

        {/* Accounts List */}
        <div className="flex-1 overflow-y-auto space-y-1 pr-1">
          {accountsLoading ? (
            <div className="space-y-2 p-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : filteredAccounts.length === 0 ? (
            <div className="p-8 text-center text-xs text-muted-foreground font-mono">
              No accounts match filters.
            </div>
          ) : (
            filteredAccounts.map((a) => {
              const isSelected = activeAccount?.id === a.id;
              return (
                <div
                  key={`${a.type}-${a.id}`}
                  onClick={() => setSelectedAccount(a as any)}
                  className={cn(
                    "p-2 rounded-lg border cursor-pointer transition select-none flex items-center justify-between gap-2",
                    isSelected
                      ? "bg-primary/10 border-primary/40 shadow-xs"
                      : "bg-muted/20 border-transparent hover:bg-muted/50"
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      {a.type === "vendor" ? (
                        <Building2 className="h-3 w-3 text-blue-500 shrink-0" />
                      ) : a.type === "subcontractor" ? (
                        <Users className="h-3 w-3 text-purple-500 shrink-0" />
                      ) : a.type === "bank" || a.type === "cash" ? (
                        <Wallet className="h-3 w-3 text-emerald-500 shrink-0" />
                      ) : (
                        <Users className="h-3 w-3 text-amber-500 shrink-0" />
                      )}
                      <span className="font-semibold text-xs text-foreground truncate">{a.name}</span>
                    </div>
                    <div className="text-[10px] text-muted-foreground font-mono truncate mt-0.5">
                      {a.group} {a.pan ? `• PAN: ${a.pan}` : ""}
                    </div>
                  </div>

                  <div className="text-right font-mono text-xs">
                    <span
                      className={cn(
                        "font-bold",
                        ((a as any).balance || 0) > 0 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"
                      )}
                    >
                      {formatNpr((a as any).balance || 0)}
                    </span>
                  </div>

                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Right Column: Statement Table */}
      <div className="md:col-span-8 rounded-xl border bg-card p-4 space-y-3 flex flex-col">
        {activeAccount ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-foreground text-sm font-sans">{activeAccount.name}</h3>
                  <Badge variant="outline" className="text-[10px] font-mono">
                    {activeAccount.group}
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground font-mono mt-0.5 flex items-center gap-3">
                  {activeAccount.pan && <span>PAN: {activeAccount.pan}</span>}
                  <span>Account ID: {activeAccount.id}</span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="text-right font-mono">
                  <div className="text-[10px] uppercase text-muted-foreground">Current Balance</div>
                  <div className="text-sm font-bold text-foreground">
                    {formatNpr(Math.abs(closingBalance))} {closingBalance >= 0 ? "(Cr)" : "(Dr)"}
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

            {/* Statement Table with ConstructionTable */}
            <ConstructionTable
              data={transactions}
              columns={columns}
              isLoading={statementLoading}
              searchPlaceholder="Search statement transactions..."
              searchFilterKeys={["voucherNo", "voucherType", "particulars"]}
            />
          </>
        ) : (
          <div className="p-12 text-center text-muted-foreground text-xs font-mono">
            Select an account from the left to view statement.
          </div>
        )}
      </div>
    </div>
  );
}
