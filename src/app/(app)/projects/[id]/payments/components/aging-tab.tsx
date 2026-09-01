"use client";

import { trpc } from "@/lib/trpc-client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, AlertTriangle } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { formatNpr } from "@/lib/currency";
import { ConstructionTable, ConstructionTableColumn } from "@/components/ui/construction-table";

const bucketLabels: Record<string, string> = {
  current: "0–30 days",
  d30: "31–60 days",
  d60: "61–90 days",
  d90: "91–120 days",
  d90plus: "120+ days",
};

const bucketColors: Record<string, string> = {
  current: "text-emerald-600 dark:text-emerald-400",
  d30: "text-blue-600 dark:text-blue-400",
  d60: "text-amber-600 dark:text-amber-400",
  d90: "text-orange-600 dark:text-orange-400",
  d90plus: "text-red-600 dark:text-red-400",
};

export function AgingTab({ projectId }: { projectId: string }) {
  const { data, isLoading } = trpc.projectOps.payment.agingReport.useQuery({ projectId });

  const rows = data?.rows ?? [];
  const buckets = data?.buckets;
  const total = data?.totalOutstanding ?? 0;

  const columns: ConstructionTableColumn<any>[] = [
    {
      key: "ipcNumber",
      header: "IPC #",
      render: (_, r) => (
        <Link
          href={`/projects/${projectId}/ipc/${r.ipcId}`}
          className="font-mono text-xs text-amber-600 hover:underline font-bold"
        >
          {r.ipcNumber}
        </Link>
      ),
    },
    {
      key: "payeeName",
      header: "Payee",
      render: (_, r) => <span className="font-medium text-xs font-sans text-foreground">{r.payeeName}</span>,
    },
    {
      key: "issueDate",
      header: "Issue Date",
      render: (_, r) => (
        <span className="text-[10px] text-muted-foreground font-mono">
          {r.issueDate ? format(new Date(r.issueDate), "dd MMM yy") : "—"}
        </span>
      ),
    },
    {
      key: "finalPayable",
      header: "Final Payable",
      align: "right",
      render: (_, r) => <span className="font-mono text-xs">{formatNpr(r.finalPayable)}</span>,
    },
    {
      key: "paidAmount",
      header: "Paid",
      align: "right",
      render: (_, r) => (
        <span className="font-mono text-xs text-emerald-600 dark:text-emerald-400 font-medium">
          {formatNpr(r.paidAmount)}
        </span>
      ),
    },
    {
      key: "outstanding",
      header: "Outstanding",
      align: "right",
      render: (_, r) => (
        <span className="font-mono text-xs font-bold text-amber-600 dark:text-amber-400">
          {formatNpr(r.outstanding)}
        </span>
      ),
    },
    {
      key: "ageDays",
      header: "Age (days)",
      align: "center",
      render: (_, r) => <span className="font-mono text-xs">{r.ageDays}</span>,
    },
    {
      key: "bucket",
      header: "Bucket",
      align: "center",
      render: (_, r) => (
        <Badge variant="outline" className={cn("text-[9px] font-mono", bucketColors[r.bucket])}>
          {bucketLabels[r.bucket] ?? r.bucket}
        </Badge>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      {buckets && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {(["current", "d30", "d60", "d90", "d90plus"] as const).map((b) => (
            <Card key={b} className="p-3 text-center bg-card">
              <div className={cn("text-sm font-bold font-mono", bucketColors[b])}>{formatNpr(buckets[b])}</div>
              <div className="text-[9px] text-muted-foreground uppercase font-mono">{bucketLabels[b]}</div>
            </Card>
          ))}
        </div>
      )}

      <Card className="border-amber-300/50 bg-amber-50/30 dark:bg-amber-950/10">
        <CardContent className="py-3 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
          <span className="text-xs text-amber-700 dark:text-amber-400 font-mono">
            Total outstanding: <strong>{formatNpr(total)}</strong> across {rows.length} IPCs
          </span>
        </CardContent>
      </Card>

      <ConstructionTable
        data={rows}
        columns={columns}
        isLoading={isLoading}
        searchPlaceholder="Search payee, IPC number..."
        searchFilterKeys={["ipcNumber", "payeeName"]}
      />
    </div>
  );
}
