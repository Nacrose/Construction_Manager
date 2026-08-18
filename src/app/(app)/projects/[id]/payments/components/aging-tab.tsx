"use client";

import { trpc } from "@/lib/trpc-client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Clock, AlertTriangle } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

function npr(n: number) { return "NPR " + n.toLocaleString("en-IN", { maximumFractionDigits: 0 }); }

const bucketLabels: Record<string, string> = {
  current: "0–30 days",
  d30: "31–60 days",
  d60: "61–90 days",
  d90: "91–120 days",
  d90plus: "120+ days",
};

const bucketColors: Record<string, string> = {
  current: "text-emerald-600",
  d30: "text-blue-600",
  d60: "text-amber-600",
  d90: "text-orange-600",
  d90plus: "text-red-600",
};

export function AgingTab({ projectId }: { projectId: string }) {
  const { data, isLoading } = trpc.projectOps.payment.agingReport.useQuery({ projectId });

  if (isLoading) return <Skeleton className="h-64" />;

  const rows = data?.rows ?? [];
  const buckets = data?.buckets;
  const total = data?.totalOutstanding ?? 0;

  if (rows.length === 0) {
    return (
      <Card><CardContent className="flex flex-col items-center justify-center py-16 text-center">
        <Clock className="h-12 w-12 text-emerald-500/40 mb-3" />
        <p className="text-sm text-muted-foreground">No outstanding payments.</p>
        <p className="text-xs text-muted-foreground mt-1">All approved IPCs have been fully paid.</p>
      </CardContent></Card>
    );
  }

  return (
    <>
      {buckets && (
        <div className="grid grid-cols-5 gap-2">
          {(["current", "d30", "d60", "d90", "d90plus"] as const).map((b) => (
            <Card key={b} className="p-3 text-center">
              <div className={cn("text-sm font-bold", bucketColors[b])}>{npr(buckets[b])}</div>
              <div className="text-[9px] text-muted-foreground uppercase">{bucketLabels[b]}</div>
            </Card>
          ))}
        </div>
      )}

      <Card className="border-amber-300/50 bg-amber-50/30 dark:bg-amber-950/10">
        <CardContent className="py-3 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
          <span className="text-xs text-amber-700 dark:text-amber-400">
            Total outstanding: <strong>{npr(total)}</strong> across {rows.length} IPCs
          </span>
        </CardContent>
      </Card>

      <div className="rounded-md border overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-muted/30">
            <tr>
              <th className="p-2 text-left font-medium text-muted-foreground">IPC #</th>
              <th className="p-2 text-left font-medium text-muted-foreground">Payee</th>
              <th className="p-2 text-left font-medium text-muted-foreground">Issue Date</th>
              <th className="p-2 text-right font-medium text-muted-foreground">Final Payable</th>
              <th className="p-2 text-right font-medium text-muted-foreground">Paid</th>
              <th className="p-2 text-right font-medium text-muted-foreground">Outstanding</th>
              <th className="p-2 text-center font-medium text-muted-foreground">Age (days)</th>
              <th className="p-2 text-center font-medium text-muted-foreground">Bucket</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.ipcId} className="border-t hover:bg-muted/20">
                <td className="p-2">
                  <Link href={`/projects/${projectId}/ipc/${r.ipcId}`} className="font-mono text-amber-600 hover:underline">
                    {r.ipcNumber}
                  </Link>
                </td>
                <td className="p-2 font-medium">{r.payeeName}</td>
                <td className="p-2 text-[10px]">{r.issueDate ? format(new Date(r.issueDate), "dd MMM yy") : "—"}</td>
                <td className="p-2 text-right tabular-nums">{npr(r.finalPayable)}</td>
                <td className="p-2 text-right tabular-nums text-emerald-600">{npr(r.paidAmount)}</td>
                <td className="p-2 text-right tabular-nums font-bold text-amber-600">{npr(r.outstanding)}</td>
                <td className="p-2 text-center tabular-nums">{r.ageDays}</td>
                <td className="p-2 text-center">
                  <Badge variant="outline" className={cn("text-[9px]", bucketColors[r.bucket])}>
                    {bucketLabels[r.bucket]}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
