"use client";

import { trpc } from "@/lib/trpc-client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, Activity } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

type Props = {
  projectId: string;
};

function npr(n: number) {
  if (n >= 10000000) return "NPR " + (n / 10000000).toFixed(1) + "Cr";
  if (n >= 100000) return "NPR " + (n / 100000).toFixed(1) + "L";
  if (n >= 1000) return "NPR " + (n / 1000).toFixed(0) + "K";
  return "NPR " + n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

export function ProgressSCurve({ projectId }: Props) {
  const { data, isLoading } = trpc.dashboard.progressSCurve.useQuery({ projectId });

  if (isLoading) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-sm">Progress S-Curve</CardTitle></CardHeader>
        <CardContent><Skeleton className="h-64" /></CardContent>
      </Card>
    );
  }

  if (!data || data.planned.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <TrendingUp className="h-4 w-4" /> Progress S-Curve
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-xs text-muted-foreground">
            <Activity className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p>No schedule data. Create Gantt tasks to see the S-curve.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Build SVG chart
  const planned = data.planned;
  const actual = data.actual;
  const maxPct = 100;

  // Chart dimensions
  const width = 100; // percentage-based
  const height = 200;
  const padding = { top: 10, right: 10, bottom: 20, left: 30 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  // Find date range
  const allDates = [...planned.map(p => new Date(p.date)), ...actual.map(a => new Date(a.date))];
  if (allDates.length === 0) return null;
  const minDate = Math.min(...allDates.map(d => d.getTime()));
  const maxDate = Math.max(...allDates.map(d => d.getTime()));
  const dateRange = Math.max(1, maxDate - minDate);

  // Convert to SVG points
  const toX = (date: string) => padding.left + ((new Date(date).getTime() - minDate) / dateRange) * chartW;
  const toY = (pct: number) => padding.top + chartH - (pct / maxPct) * chartH;

  const plannedPath = planned.map((p, i) => `${i === 0 ? "M" : "L"} ${toX(p.date)} ${toY(p.pct)}`).join(" ");
  const actualPath = actual.length > 0 ? actual.map((a, i) => `${i === 0 ? "M" : "L"} ${toX(a.date)} ${toY(a.pct)}`).join(" ") : "";

  // Find current position on planned curve
  const now = Date.now();
  const currentPlannedPct = planned.find(p => new Date(p.date).getTime() >= now)?.pct ?? planned[planned.length - 1]?.pct ?? 0;
  const currentActualPct = actual.length > 0 ? actual[actual.length - 1].pct : 0;
  const scheduleVariance = currentActualPct - currentPlannedPct;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <TrendingUp className="h-4 w-4" /> Progress S-Curve
        </CardTitle>
        <CardDescription className="text-xs">
          Planned vs Actual cumulative progress · Avg task progress: {data.summary.avgProgress}%
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        {/* Summary stats */}
        <div className="grid grid-cols-4 gap-2 text-xs">
          <div className="rounded border p-2 text-center">
            <div className="text-[9px] text-muted-foreground uppercase">Planned</div>
            <div className="font-bold text-info">{currentPlannedPct}%</div>
          </div>
          <div className="rounded border p-2 text-center">
            <div className="text-[9px] text-muted-foreground uppercase">Actual</div>
            <div className="font-bold text-success">{currentActualPct}%</div>
          </div>
          <div className={cn("rounded border p-2 text-center", scheduleVariance >= 0 ? "border-success/30" : "border-red-200")}>
            <div className="text-[9px] text-muted-foreground uppercase">SV</div>
            <div className={cn("font-bold", scheduleVariance >= 0 ? "text-success" : "text-red-600")}>
              {scheduleVariance > 0 ? "+" : ""}{scheduleVariance}%
            </div>
          </div>
          <div className="rounded border p-2 text-center">
            <div className="text-[9px] text-muted-foreground uppercase">Budget</div>
            <div className="font-bold text-muted-foreground">{npr(data.summary.totalPlanned)}</div>
          </div>
        </div>

        {/* SVG Chart */}
        <div className="relative">
          <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ height: "200px" }} preserveAspectRatio="none">
            {/* Grid lines */}
            {[0, 25, 50, 75, 100].map(pct => (
              <g key={pct}>
                <line
                  x1={padding.left} y1={toY(pct)}
                  x2={width - padding.right} y2={toY(pct)}
                  stroke="currentColor" strokeWidth="0.2" className="text-muted-foreground/30"
                />
                <text x={padding.left - 2} y={toY(pct) + 2} fontSize="3" textAnchor="end" className="fill-muted-foreground">
                  {pct}%
                </text>
              </g>
            ))}

            {/* Planned curve (dashed blue) */}
            <path
              d={plannedPath}
              fill="none"
              stroke="#3b82f6"
              strokeWidth="0.8"
              strokeDasharray="2,1"
            />

            {/* Actual curve (solid green) */}
            {actualPath && (
              <path
                d={actualPath}
                fill="none"
                stroke="#4a8b57"
                strokeWidth="1"
              />
            )}

            {/* "Now" line */}
            {now >= minDate && now <= maxDate && (
              <line
                x1={toX(new Date().toISOString())} y1={padding.top}
                x2={toX(new Date().toISOString())} y2={height - padding.bottom}
                stroke="#ef4444" strokeWidth="0.3" strokeDasharray="1,1"
              />
            )}

            {/* X-axis labels */}
            <text x={padding.left} y={height - 4} fontSize="3" className="fill-muted-foreground">
              {format(new Date(minDate), "MMM yy")}
            </text>
            <text x={width - padding.right} y={height - 4} fontSize="3" textAnchor="end" className="fill-muted-foreground">
              {format(new Date(maxDate), "MMM yy")}
            </text>
          </svg>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="h-0.5 w-4 border-t-2 border-dashed border-info/60" /> Planned
          </span>
          <span className="flex items-center gap-1">
            <span className="h-0.5 w-4 border-t-2 border-success" /> Actual
          </span>
          <span className="flex items-center gap-1">
            <span className="h-3 w-px bg-red-500" /> Today
          </span>
          {scheduleVariance < 0 && (
            <span className="text-red-600 ml-auto">
              ⚠ Behind schedule by {-scheduleVariance}%
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
