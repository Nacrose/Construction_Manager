"use client";

import { useMemo } from "react";
import { trpc } from "@/lib/trpc-client";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { formatNpr } from "@/lib/currency";
import { ConstructionTable, ConstructionTableColumn } from "@/components/ui/construction-table";

type TrialBalanceRow = {
  head: string;
  group: string;
  debit: number;
  credit: number;
};

export function TrialBalanceTab({ projectId }: { projectId: string }) {
  const { data, isLoading } = trpc.accounting.trialBalance.useQuery({ projectId });

  const rows: TrialBalanceRow[] = data?.rows || [];
  const totalDebits = data?.totalDebits || 0;
  const totalCredits = data?.totalCredits || 0;
  const isBalanced = data?.isBalanced ?? true;
  const difference = data?.difference || 0;

  const columns: ConstructionTableColumn<TrialBalanceRow>[] = useMemo(
    () => [
      {
        key: "head",
        header: "Account Head / Ledger",
        accessor: (r) => r.head,
        sortable: true,
        render: (val) => <span className="font-semibold text-foreground">{val}</span>,
      },
      {
        key: "group",
        header: "Group / Classification",
        accessor: (r) => r.group,
        width: "180px",
        sortable: true,
        render: (val) => (
          <Badge variant="outline" className="text-[10px] font-mono">
            {val}
          </Badge>
        ),
      },
      {
        key: "debit",
        header: "Debit (Dr)",
        align: "right",
        width: "160px",
        format: "currency",
        summary: "sum",
        render: (val) => (
          <span className="font-medium text-foreground">
            {val > 0 ? formatNpr(val) : "—"}
          </span>
        ),
      },
      {
        key: "credit",
        header: "Credit (Cr)",
        align: "right",
        width: "160px",
        format: "currency",
        summary: "sum",
        render: (val) => (
          <span className="font-medium text-foreground">
            {val > 0 ? formatNpr(val) : "—"}
          </span>
        ),
      },
    ],
    []
  );

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-16 w-full rounded-xl" />
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Integrity Status Banner */}
      <div
        className={cn(
          "p-4 rounded-xl border flex flex-wrap items-center justify-between gap-3",
          isBalanced
            ? "bg-success/60 dark:bg-success/20 border-success/30 dark:border-success/40 text-success dark:text-success/80"
            : "bg-red-50/60 dark:bg-red-950/20 border-red-200 dark:border-red-900/40 text-red-800 dark:text-red-200"
        )}
      >
        <div className="flex items-center gap-3">
          {isBalanced ? (
            <CheckCircle2 className="h-5 w-5 text-success dark:text-success/80" />
          ) : (
            <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
          )}
          <div>
            <h4 className="font-bold text-sm">
              {isBalanced ? "Ledger Accounts are in Perfect Balance" : "Trial Balance Discrepancy Detected"}
            </h4>
            <p className="text-xs text-muted-foreground mt-0.5 font-mono">
              {isBalanced
                ? `Debits (${formatNpr(totalDebits)}) match Credits (${formatNpr(totalCredits)}) across direct costs, liabilities, and income heads.`
                : `Total debits and credits differ by ${formatNpr(difference)}. Please review unlinked vouchers.`}
            </p>
          </div>
        </div>
      </div>

      {/* Trial Balance ConstructionTable */}
      <ConstructionTable<TrialBalanceRow>
        data={rows}
        columns={columns}
        searchPlaceholder="Search account head or group..."
        searchFilterKeys={["head", "group"]}
        summaryFooterLabel="Grand Total"
        exportExcel={{
          filename: `TrialBalance_${format(new Date(), "yyyy-MM-dd")}`,
          sheetName: "TrialBalance",
        }}
        emptyState={{
          title: "No ledger accounts found",
          description: "Trial balance will be generated once vouchers and journal entries are recorded.",
        }}
      />
    </div>
  );
}
