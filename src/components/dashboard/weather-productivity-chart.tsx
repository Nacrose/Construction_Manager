"use client";

import { trpc } from "@/lib/trpc-client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CloudRain, TrendingDown, BarChart3 } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  Cell,
} from "recharts";

type Props = { projectId: string };

const CONDITION_COLORS: Record<string, string> = {
  clear: "#22c55e",
  cloudy: "#eab308",
  rain: "#3b82f6",
  heavy_rain: "#ef4444",
};

const CONDITION_LABELS: Record<string, string> = {
  clear: "Clear",
  cloudy: "Cloudy",
  rain: "Rain",
  heavy_rain: "Heavy Rain",
};

export function WeatherProductivityChart({ projectId }: Props) {
  const { data, isLoading } = trpc.dashboard.weatherImpact.useQuery({ projectId });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Weather Impact</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64" />
        </CardContent>
      </Card>
    );
  }

  if (!data || data.conditions.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <CloudRain className="h-4 w-4" /> Weather Impact on Productivity
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-6 text-xs text-muted-foreground">
            <CloudRain className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p>No weather data recorded in daily reports.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const barData = data.conditions.map(c => ({
    name: CONDITION_LABELS[c.condition] || c.condition,
    condition: c.condition,
    tasks: c.avgTasksCompleted,
    headcount: c.avgHeadcount,
    equipment: c.avgEquipmentHours,
    days: c.days,
  }));

  const scatterData = data.scatter.map(s => ({
    x: s.rainfall,
    y: s.tasksCompleted,
    condition: s.condition,
  }));

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <CloudRain className="h-4 w-4" /> Weather Impact on Productivity
        </CardTitle>
        <CardDescription className="text-xs">
          {data.summary.totalDays} days analyzed · {data.summary.clearPct}% clear, {data.summary.rainPct}% rain
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0 space-y-4">
        {data.summary.productivityDropPct > 0 && (
          <div className="flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50/50 dark:border-blue-900 dark:bg-blue-950/20 p-2 text-xs text-blue-700 dark:text-blue-400">
            <TrendingDown className="h-3.5 w-3.5 shrink-0" />
            <span>
              Rain causes <strong>{data.summary.productivityDropPct}%</strong> productivity drop
              ({data.summary.rainAvgTasks} avg tasks vs {data.summary.clearAvgTasks} on clear days)
            </span>
          </div>
        )}

        <div>
          <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-2">
            Avg Tasks Completed by Weather
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={barData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip
                contentStyle={{
                  fontSize: 11,
                  borderRadius: 8,
                  border: "1px solid hsl(var(--border))",
                  background: "hsl(var(--background))",
                }}
              />
              <Bar dataKey="tasks" radius={[4, 4, 0, 0]}>
                {barData.map((entry) => (
                  <Cell
                    key={entry.condition}
                    fill={CONDITION_COLORS[entry.condition] || "#94a3b8"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {data.scatter.length > 0 && (
          <div>
            <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-2">
              Rainfall vs Tasks Completed
            </div>
            <ResponsiveContainer width="100%" height={160}>
              <ScatterChart margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  type="number"
                  dataKey="x"
                  name="Rainfall (mm)"
                  tick={{ fontSize: 10 }}
                  label={{ value: "mm", position: "bottom", fontSize: 9 }}
                />
                <YAxis
                  type="number"
                  dataKey="y"
                  name="Tasks"
                  tick={{ fontSize: 10 }}
                />
                <Tooltip
                  cursor={{ strokeDasharray: "3 3" }}
                  contentStyle={{
                    fontSize: 11,
                    borderRadius: 8,
                    border: "1px solid hsl(var(--border))",
                    background: "hsl(var(--background))",
                  }}
                  formatter={(value: number, name: string) => [
                    value,
                    name === "x" ? "Rainfall (mm)" : "Tasks Completed",
                  ]}
                />
                <Scatter data={scatterData} fillOpacity={0.6}>
                  {scatterData.map((entry, index) => (
                    <Cell
                      key={index}
                      fill={CONDITION_COLORS[entry.condition] || "#94a3b8"}
                    />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {Object.entries(CONDITION_COLORS).map(([key, color]) => (
            <span key={key} className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
              {CONDITION_LABELS[key]}
            </span>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
