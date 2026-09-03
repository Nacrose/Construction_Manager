"use client";

import { trpc } from "@/lib/trpc-client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Clock, AlertTriangle, CheckCircle2, FileText, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  projectId: string;
};

function formatHours(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  if (hours < 24) return `${Math.round(hours)} hr`;
  return `${(hours / 24).toFixed(1)} days`;
}

const PRIORITY_COLORS: Record<string, string> = {
  urgent: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400",
  high: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400",
  normal: "bg-info/15 text-info dark:bg-[var(--navy-deep)] dark:text-info/80",
  low: "bg-muted text-muted-foreground dark:bg-[var(--navy-mid)] dark:text-muted-foreground/80",
};

export function RfiMetrics({ projectId }: Props) {
  const { data, isLoading } = trpc.dashboard.rfiMetrics.useQuery({ projectId });

  if (isLoading) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-sm">RFI Metrics</CardTitle></CardHeader>
        <CardContent><Skeleton className="h-48" /></CardContent>
      </Card>
    );
  }

  if (!data) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <FileText className="h-4 w-4" /> RFI Metrics
        </CardTitle>
        <CardDescription className="text-xs">
          {data.total} RFIs · {data.respondedCount} responded · {data.overdue.length} overdue
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0 space-y-4">
        {/* Response time stats */}
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-lg border p-2 text-center">
            <div className="text-[9px] text-muted-foreground uppercase">Avg Response</div>
            <div className="text-sm font-bold text-info flex items-center justify-center gap-1">
              <Clock className="h-3 w-3" />
              {data.avgResponseHours > 0 ? formatHours(data.avgResponseHours) : "—"}
            </div>
          </div>
          <div className="rounded-lg border p-2 text-center">
            <div className="text-[9px] text-muted-foreground uppercase">Fastest</div>
            <div className="text-sm font-bold text-success">
              {data.minResponseHours > 0 ? formatHours(data.minResponseHours) : "—"}
            </div>
          </div>
          <div className="rounded-lg border p-2 text-center">
            <div className="text-[9px] text-muted-foreground uppercase">Slowest</div>
            <div className="text-sm font-bold text-amber-600">
              {data.maxResponseHours > 0 ? formatHours(data.maxResponseHours) : "—"}
            </div>
          </div>
        </div>

        {/* Status breakdown */}
        <div className="flex flex-wrap gap-2 text-xs">
          {Object.entries(data.byStatus).map(([status, count]) => (
            <div key={status} className={cn("rounded px-2 py-1 font-medium capitalize", 
              status === "approved" ? "bg-success/15 text-success dark:bg-success dark:text-success/80" :
              status === "submitted" ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400" :
              status === "rejected" ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400" :
              "bg-muted text-muted-foreground dark:bg-[var(--navy-mid)] dark:text-muted-foreground/80"
            )}>
              {status}: {count}
            </div>
          ))}
        </div>

        {/* Overdue RFIs */}
        {data.overdue.length > 0 && (
          <div className="space-y-1">
            <div className="text-[10px] font-medium text-red-600 uppercase tracking-wide flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" /> Overdue ({data.overdue.length})
            </div>
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {data.overdue.map(rfi => (
                <div key={rfi.id} className="flex items-center gap-2 rounded border border-red-200 dark:border-red-900 p-1.5 text-xs">
                  <Zap className={cn("h-3 w-3 shrink-0", rfi.priority === "urgent" ? "text-red-600" : "text-amber-600")} />
                  <div className="flex-1 min-w-0">
                    <span className="font-mono font-medium">{rfi.number}</span>
                    <span className="text-muted-foreground ml-1 truncate">{rfi.subject}</span>
                  </div>
                  <span className={cn("rounded px-1 text-[9px] uppercase shrink-0", PRIORITY_COLORS[rfi.priority])}>
                    {rfi.priority}
                  </span>
                  <span className="text-red-600 font-medium shrink-0">
                    {formatHours(rfi.hoursOverdue)} overdue
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {data.overdue.length === 0 && data.respondedCount > 0 && (
          <div className="flex items-center gap-2 text-xs text-success">
            <CheckCircle2 className="h-3.5 w-3.5" />
            All submitted RFIs have been responded to.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
