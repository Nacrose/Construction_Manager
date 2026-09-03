"use client";

import { trpc } from "@/lib/trpc-client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, Clock, TrendingUp } from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts";
import { cn } from "@/lib/utils";

type Props = { projectId: string };

const REASON_COLORS: Record<string, string> = {
  weather: "#3b82f6",
  material: "#f59e0b",
  equipment: "#8b5cf6",
  labor: "#4a8b57",
  client: "#ef4444",
  other: "#6b7280",
  unspecified: "#94a3b8",
};

const REASON_LABELS: Record<string, string> = {
  weather: "Weather",
  material: "Material",
  equipment: "Equipment",
  labor: "Labor",
  client: "Client",
  other: "Other",
  unspecified: "Unspecified",
};

export function DelayAnalyticsChart({ projectId }: Props) {
  const { data, isLoading } = trpc.dashboard.delayAnalytics.useQuery({ projectId });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Delay Analytics</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-48" />
        </CardContent>
      </Card>
    );
  }

  if (!data || data.total === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" /> Delay Root Cause Analytics
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-6 text-xs text-muted-foreground">
            <AlertTriangle className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p>No delays recorded. All tasks on track!</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const pieData = data.reasonStats.map(r => ({
    name: REASON_LABELS[r.reason] || r.reason,
    value: r.count,
    reason: r.reason,
  }));

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" /> Delay Root Cause Analytics
        </CardTitle>
        <CardDescription className="text-xs">
          {data.total} delays · Top reason: {REASON_LABELS[data.summary.topReason || ""] || data.summary.topReason} ({data.summary.topReasonCount})
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border p-3">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Uncompleted</div>
            <div className="text-lg font-bold text-red-600">{data.summary.uncompleted}</div>
          </div>
          <div className="rounded-lg border p-3">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Postponed</div>
            <div className="text-lg font-bold text-purple-600">{data.summary.postponed}</div>
          </div>
        </div>

        <div>
          <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-2">
            Delays by Reason
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={35}
                outerRadius={65}
                paddingAngle={2}
                dataKey="value"
              >
                {pieData.map((entry) => (
                  <Cell
                    key={entry.reason}
                    fill={REASON_COLORS[entry.reason] || "#94a3b8"}
                  />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  fontSize: 11,
                  borderRadius: 8,
                  border: "1px solid hsl(var(--border))",
                  background: "hsl(var(--background))",
                }}
                formatter={(value: number) => [`${value} delays`, "Count"]}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="space-y-1.5">
          {data.reasonStats.map(r => (
            <div key={r.reason} className="flex items-center gap-2 text-xs">
              <div
                className="h-2 w-2 rounded-full shrink-0"
                style={{ backgroundColor: REASON_COLORS[r.reason] || "#94a3b8" }}
              />
              <span className="w-24 shrink-0">{REASON_LABELS[r.reason] || r.reason}</span>
              <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full"
                  style={{
                    width: `${r.pctOfTotal}%`,
                    backgroundColor: REASON_COLORS[r.reason] || "#94a3b8",
                  }}
                />
              </div>
              <span className="w-8 text-right font-mono tabular-nums">{r.count}</span>
              <span className="w-10 text-right text-muted-foreground">{r.pctOfTotal}%</span>
            </div>
          ))}
        </div>

        {data.trend.length > 1 && (
          <div>
            <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
              <Clock className="h-3 w-3" /> Delay Trend (Weekly)
            </div>
            <ResponsiveContainer width="100%" height={120}>
              <LineChart data={data.trend} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="week" tick={{ fontSize: 9 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip
                  contentStyle={{
                    fontSize: 11,
                    borderRadius: 8,
                    border: "1px solid hsl(var(--border))",
                    background: "hsl(var(--background))",
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="count"
                  stroke="#ef4444"
                  strokeWidth={2}
                  dot={{ fill: "#ef4444", r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {data.reasonStats.slice(0, 5).map(r => (
            <span
              key={r.reason}
              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium"
              style={{
                backgroundColor: `${REASON_COLORS[r.reason] || "#94a3b8"}15`,
                color: REASON_COLORS[r.reason] || "#94a3b8",
              }}
            >
              {REASON_LABELS[r.reason] || r.reason}: {r.count}
            </span>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
