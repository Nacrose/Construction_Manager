"use client";

import { trpc } from "@/lib/trpc-client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Wallet, TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatNpr } from "@/lib/currency";

type Props = { projectId: string };

export function CashFlowForecast({ projectId }: Props) {
  const { data, isLoading } = trpc.dashboard.cashFlow.useQuery({ projectId });

  if (isLoading) return <Card><CardContent><Skeleton className="h-48" /></CardContent></Card>;
  if (!data || data.timeline.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><Wallet className="h-4 w-4" /> Cash Flow Forecast</CardTitle></CardHeader>
        <CardContent><div className="text-center py-6 text-xs text-muted-foreground"><Wallet className="h-8 w-8 mx-auto mb-2 opacity-30" /><p>No billing or cost data yet.</p></div></CardContent>
      </Card>
    );
  }

  const s = data.summary;
  const netPositive = s.netCashFlow >= 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2"><Wallet className="h-4 w-4" /> Cash Flow Forecast</CardTitle>
        <CardDescription className="text-xs font-mono">
          Billed vs Spent · {s.pendingIPCs} pending · {s.certifiedIPCs} certified · {s.paidIPCs} paid
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0 space-y-3 font-mono">
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded border p-2 text-center">
            <div className="text-[9px] text-muted-foreground uppercase">Billed</div>
            <div className="text-sm font-bold text-emerald-600">{formatNpr(s.totalBilled)}</div>
          </div>
          <div className="rounded border p-2 text-center">
            <div className="text-[9px] text-muted-foreground uppercase">Spent</div>
            <div className="text-sm font-bold text-red-600">{formatNpr(s.totalSpent)}</div>
          </div>
          <div className={cn("rounded border p-2 text-center", netPositive ? "border-emerald-200 bg-emerald-50/30" : "border-red-200 bg-red-50/30")}>
            <div className="text-[9px] text-muted-foreground uppercase">Net</div>
            <div className={cn("text-sm font-bold flex items-center justify-center gap-1", netPositive ? "text-emerald-600" : "text-red-600")}>
              {netPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              {formatNpr(Math.abs(s.netCashFlow))}
            </div>
          </div>
        </div>

        {/* Monthly timeline */}
        <div className="space-y-1 max-h-40 overflow-y-auto">
          <div className="grid grid-cols-4 gap-1 text-[8px] font-medium text-muted-foreground uppercase px-1">
            <span>Month</span>
            <span className="text-right">Billed</span>
            <span className="text-right">Spent</span>
            <span className="text-right">Cum.</span>
          </div>
          {data.timeline.map(t => {
            const [yr, mo] = t.month.split("-");
            const monthLabel = new Date(parseInt(yr), parseInt(mo) - 1).toLocaleDateString("en", { month: "short", year: "2-digit" });
            return (
              <div key={t.month} className="grid grid-cols-4 gap-1 text-[10px] px-1 py-0.5 rounded hover:bg-muted/30">
                <span className="font-medium font-sans">{monthLabel}</span>
                <span className="text-right text-emerald-600 tabular-nums">{t.billed > 0 ? formatNpr(t.billed) : "—"}</span>
                <span className="text-right text-red-600 tabular-nums">{t.spent > 0 ? formatNpr(t.spent) : "—"}</span>
                <span className={cn("text-right tabular-nums font-medium", t.cumulative >= 0 ? "text-emerald-600" : "text-red-600")}>
                  {t.cumulative >= 0 ? "+" : ""}{formatNpr(t.cumulative)}
                </span>
              </div>
            );
          })}
        </div>

        {/* Retention + advance */}
        {(s.totalRetention > 0 || s.totalAdvanceRecovered > 0) && (
          <div className="flex items-center gap-4 text-[10px] text-muted-foreground border-t pt-2">
            {s.totalRetention > 0 && <span>Retention held: <strong className="text-amber-600">{formatNpr(s.totalRetention)}</strong></span>}
            {s.totalAdvanceRecovered > 0 && <span>Advance recovered: <strong className="text-blue-600">{formatNpr(s.totalAdvanceRecovered)}</strong></span>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
