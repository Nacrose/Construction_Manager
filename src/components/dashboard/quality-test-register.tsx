"use client";

import { trpc } from "@/lib/trpc-client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { FlaskConical, CheckCircle2, XCircle, Clock } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

type Props = { projectId: string };

const STATUS_CONFIG = {
  passed: { label: "Passed", icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-100 dark:bg-emerald-950" },
  failed: { label: "Failed", icon: XCircle, color: "text-red-600", bg: "bg-red-100 dark:bg-red-950" },
  pending: { label: "Pending", icon: Clock, color: "text-amber-600", bg: "bg-amber-100 dark:bg-amber-950" },
};

export function QualityTestRegister({ projectId }: Props) {
  const { data, isLoading } = trpc.dashboard.qualityTestRegister.useQuery({ projectId });

  if (isLoading) return <Card><CardContent><Skeleton className="h-48" /></CardContent></Card>;
  if (!data || data.tests.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><FlaskConical className="h-4 w-4" /> Quality Test Register</CardTitle></CardHeader>
        <CardContent><div className="text-center py-6 text-xs text-muted-foreground"><FlaskConical className="h-8 w-8 mx-auto mb-2 opacity-30" /><p>No material tests recorded.</p></div></CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2"><FlaskConical className="h-4 w-4" /> Quality Test Register</CardTitle>
        <CardDescription className="text-xs">
          {data.stats.total} tests · {data.stats.passRate}% pass rate
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        <div className="grid grid-cols-3 gap-2">
          {(["passed", "failed", "pending"] as const).map(status => {
            const cfg = STATUS_CONFIG[status];
            const Icon = cfg.icon;
            const count = status === "passed" ? data.stats.passed : status === "failed" ? data.stats.failed : data.stats.pending;
            return (
              <div key={status} className={cn("rounded border p-2 text-center", cfg.bg)}>
                <Icon className={cn("h-3.5 w-3.5 mx-auto mb-0.5", cfg.color)} />
                <div className={cn("text-sm font-bold", cfg.color)}>{count}</div>
                <div className="text-[9px] text-muted-foreground uppercase">{cfg.label}</div>
              </div>
            );
          })}
        </div>
        <div className="space-y-1 max-h-48 overflow-y-auto">
          {data.tests.slice(0, 20).map((t, i) => {
            const cfg = STATUS_CONFIG[t.testStatus as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.pending;
            const Icon = cfg.icon;
            return (
              <div key={i} className="flex items-center gap-2 rounded border p-1.5 text-xs hover:bg-muted/30">
                <Icon className={cn("h-3 w-3 shrink-0", cfg.color)} />
                <div className="flex-1 min-w-0">
                  <span className="font-medium">{t.materialName}</span>
                  <span className="text-muted-foreground ml-1">· {t.qty} {t.unit}</span>
                </div>
                {t.supplier && <span className="text-[9px] text-muted-foreground truncate max-w-24">{t.supplier}</span>}
                <span className="text-[9px] text-muted-foreground shrink-0">{t.reportDate ? format(new Date(t.reportDate), "dd MMM") : "—"}</span>
                <span className={cn("rounded px-1 text-[8px] uppercase shrink-0", cfg.bg, cfg.color)}>{cfg.label}</span>
              </div>
            );
          })}
        </div>
        {data.tests.length > 20 && <p className="text-[10px] text-muted-foreground text-center">+{data.tests.length - 20} more</p>}
      </CardContent>
    </Card>
  );
}
