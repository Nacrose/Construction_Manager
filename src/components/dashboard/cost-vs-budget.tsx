"use client";

import { trpc } from "@/lib/trpc-client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, TrendingDown, DollarSign } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatNpr } from "@/lib/currency";

type Props = {
  projectId: string;
};

const CATEGORIES = [
  { key: "material", label: "Material", color: "bg-amber-500" },
  { key: "labor", label: "Labor", color: "bg-blue-500" },
  { key: "equipment", label: "Equipment", color: "bg-purple-500" },
  { key: "subcontractor", label: "Subcontractor", color: "bg-emerald-500" },
  { key: "overhead", label: "Overhead", color: "bg-slate-500" },
];

export function CostVsBudget({ projectId }: Props) {
  const { data, isLoading } = trpc.dashboard.costVsBudget.useQuery({ projectId });

  if (isLoading) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-sm">Cost vs Budget</CardTitle></CardHeader>
        <CardContent><Skeleton className="h-48" /></CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const variancePositive = data.totalVariance >= 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <DollarSign className="h-4 w-4" /> Cost vs Budget
        </CardTitle>
        <CardDescription className="text-xs font-mono">
          Actual costs vs BOQ budget · Burn rate: {formatNpr(data.dailyBurnRate)}/day
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0 space-y-4">
        {/* Top-level numbers */}
        <div className="grid grid-cols-3 gap-3 font-mono">
          <div className="rounded-lg border p-3">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Budget</div>
            <div className="text-lg font-bold text-slate-700 dark:text-slate-300">{formatNpr(data.totalBudget)}</div>
          </div>
          <div className="rounded-lg border p-3">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Actual</div>
            <div className="text-lg font-bold text-blue-600">{formatNpr(data.totalActual)}</div>
          </div>
          <div className={cn("rounded-lg border p-3", variancePositive ? "border-emerald-200 bg-emerald-50/30" : "border-red-200 bg-red-50/30")}>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Variance</div>
            <div className={cn("text-lg font-bold flex items-center gap-1", variancePositive ? "text-emerald-600" : "text-red-600")}>
              {variancePositive ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
              {data.variancePct}%
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <div>
          <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1 font-mono">
            <span>Spent: {formatNpr(data.totalActual)}</span>
            <span>{data.totalBudget > 0 ? Math.round((data.totalActual / data.totalBudget) * 100) : 0}% of budget</span>
          </div>
          <div className="h-3 rounded-full bg-muted overflow-hidden">
            <div
              className={cn("h-full transition-all", data.totalActual / data.totalBudget > 1 ? "bg-red-500" : "bg-blue-500")}
              style={{ width: `${Math.min(100, data.totalBudget > 0 ? (data.totalActual / data.totalBudget) * 100 : 0)}%` }}
            />
          </div>
        </div>

        {/* Category breakdown */}
        <div className="space-y-2 font-mono">
          <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">By Category</div>
          {CATEGORIES.map(cat => {
            const amount = data.byCategory[cat.key] ?? 0;
            const pct = data.totalActual > 0 ? (amount / data.totalActual) * 100 : 0;
            return (
              <div key={cat.key} className="flex items-center gap-2 text-xs">
                <div className={cn("h-2 w-2 rounded-full shrink-0", cat.color)} />
                <span className="w-20 shrink-0 font-sans">{cat.label}</span>
                <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                  <div className={cn("h-full", cat.color)} style={{ width: `${pct}%` }} />
                </div>
                <span className="w-24 text-right font-mono tabular-nums">{formatNpr(amount)}</span>
                <span className="w-10 text-right text-muted-foreground">{Math.round(pct)}%</span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
