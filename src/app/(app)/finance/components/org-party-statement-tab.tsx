"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import {
  Search,
  Building2,
  FileSpreadsheet,
  Download,
  Share2,
  Receipt,
  UserCheck,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

function fmt(n: number) {
  return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function OrgPartyStatementTab() {
  const [partyInput, setPartyInput] = useState("");
  const [activePartyName, setActivePartyName] = useState("");

  const { data, isLoading } = trpc.finance.orgPartyStatement.useQuery(
    { partyName: activePartyName },
    { enabled: Boolean(activePartyName.trim()) }
  );

  const transactions = data?.transactions || [];
  const totalBilled = data?.totalBilled || 0;
  const totalPaid = data?.totalPaid || 0;
  const closingBalance = data?.closingBalanceDue || 0;

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!partyInput.trim()) {
      toast.error("Please enter a supplier or subcontractor name.");
      return;
    }
    setActivePartyName(partyInput.trim());
  };

  const handleExportCSV = () => {
    if (transactions.length === 0) return;

    const headers = [
      "Date (AD)",
      "Project",
      "Voucher / Bill No",
      "Voucher Type",
      "Particulars",
      "Debit Paid (Dr)",
      "Credit Billed (Cr)",
      "Running Balance (Due)",
    ];

    const rows = transactions.map((t) => [
      format(new Date(t.date), "yyyy-MM-dd"),
      t.projectCode,
      t.voucherNo,
      t.voucherType,
      `"${t.particulars.replace(/"/g, '""')}"`,
      t.debit,
      t.credit,
      t.runningBalance,
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [`Statement for: ${activePartyName}`, headers.join(","), ...rows.map((r) => r.join(","))].join(
        "\n"
      );

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Statement_${activePartyName.replace(/\s+/g, "_")}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-4">
      {/* Search Header */}
      <div className="bg-card p-4 rounded-xl border shadow-sm">
        <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              required
              placeholder="Enter Supplier or Subcontractor Name (e.g. Shivam Cement, Brij Steel)..."
              className="pl-9 h-9 text-xs"
              value={partyInput}
              onChange={(e) => setPartyInput(e.target.value)}
            />
          </div>
          <Button type="submit" size="sm" className="h-9 font-semibold text-xs gap-1.5">
            <UserCheck className="h-4 w-4" />
            Generate Statement
          </Button>
        </form>
      </div>

      {activePartyName && (
        <>
          {/* Summary Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Card className="border-l-4 border-l-emerald-500 shadow-sm bg-card">
              <CardContent className="p-3 space-y-0.5">
                <div className="text-[10px] font-mono text-muted-foreground uppercase">
                  Total Billed by Supplier (Cr)
                </div>
                <div className="text-xl font-bold font-mono text-foreground">
                  NPR {fmt(totalBilled)}
                </div>
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-blue-500 shadow-sm bg-card">
              <CardContent className="p-3 space-y-0.5">
                <div className="text-[10px] font-mono text-muted-foreground uppercase">
                  Total Paid by Company (Dr)
                </div>
                <div className="text-xl font-bold font-mono text-foreground">
                  NPR {fmt(totalPaid)}
                </div>
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-amber-500 shadow-sm bg-card">
              <CardContent className="p-3 space-y-0.5">
                <div className="text-[10px] font-mono text-muted-foreground uppercase">
                  Net Closing Balance (Due)
                </div>
                <div className="text-xl font-bold font-mono text-amber-600 dark:text-amber-400">
                  NPR {fmt(closingBalance)}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Statement Table */}
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold flex items-center gap-2">
              <Building2 className="h-4 w-4 text-primary" />
              Consolidated Statement of Account:{" "}
              <span className="text-primary">{activePartyName}</span>
            </h3>
            <Button
              size="sm"
              variant="outline"
              onClick={handleExportCSV}
              disabled={transactions.length === 0}
              className="h-8 gap-1.5 text-xs font-sans"
            >
              <Download className="h-3.5 w-3.5" />
              Export Statement (Excel)
            </Button>
          </div>

          {isLoading ? (
            <Skeleton className="h-64 rounded-xl" />
          ) : transactions.length === 0 ? (
            <div className="rounded-xl border border-dashed p-10 text-center bg-card">
              <Receipt className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
              <p className="text-xs text-muted-foreground">
                No transactions found for &quot;{activePartyName}&quot;.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
              <table className="w-full text-left text-xs font-mono">
                <thead className="border-b bg-muted/60 text-[10px] uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Date (AD)</th>
                    <th className="px-3 py-3">Project</th>
                    <th className="px-3 py-3">Voucher / Bill #</th>
                    <th className="px-4 py-3">Particulars</th>
                    <th className="px-3 py-3 text-right">Debit Paid (Dr)</th>
                    <th className="px-3 py-3 text-right">Credit Billed (Cr)</th>
                    <th className="px-4 py-3 text-right">Running Due</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {transactions.map((t) => (
                    <tr key={t.id} className="hover:bg-muted/20">
                      <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">
                        {format(new Date(t.date), "yyyy-MM-dd")}
                      </td>
                      <td className="px-3 py-2.5">
                        <Badge variant="outline" className="text-[10px] font-bold">
                          {t.projectCode}
                        </Badge>
                      </td>
                      <td className="px-3 py-2.5 font-bold text-foreground">{t.voucherNo}</td>
                      <td className="px-4 py-2.5 font-sans">
                        <div className="text-foreground">{t.particulars}</div>
                      </td>
                      <td className="px-3 py-2.5 text-right text-blue-600 dark:text-blue-400 font-bold">
                        {t.debit > 0 ? fmt(t.debit) : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-right text-emerald-600 dark:text-emerald-400 font-bold">
                        {t.credit > 0 ? fmt(t.credit) : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right font-bold text-foreground">
                        NPR {fmt(t.runningBalance)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
