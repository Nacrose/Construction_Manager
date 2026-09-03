"use client";

import { use, useState, useMemo } from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc-client";
import { AnimatedPage } from "@/components/ui/animated-page";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronLeft, BarChart3, Gauge } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ConstructionTable, ConstructionTableColumn } from "@/components/ui/construction-table";

function getUtilizationColor(rate: number) {
  if (rate > 70) return "text-success bg-success/10 dark:bg-success dark:text-success/80";
  if (rate > 40) return "text-amber-600 bg-amber-50 dark:bg-amber-950 dark:text-amber-400";
  return "text-red-600 bg-red-50 dark:bg-red-950 dark:text-red-400";
}

function getBarColor(rate: number) {
  if (rate > 70) return "#4a8b57";
  if (rate > 40) return "#eab308";
  return "#ef4444";
}

export default function EquipmentUtilizationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return format(d, "yyyy-MM-dd");
  });
  const [endDate, setEndDate] = useState(() => format(new Date(), "yyyy-MM-dd"));

  const { data: projectInfo } = trpc.project.get.useQuery({ id }, { staleTime: 300_000 });

  const { data, isLoading } = trpc.equipment.utilizationReport.useQuery({
    projectId: id,
    startDate,
    endDate,
  });

  const chartData = useMemo(() => {
    if (!data) return [];
    return data.report.map((e) => ({
      name: e.code ? `${e.code} - ${e.name}` : e.name,
      shortName: e.name.length > 15 ? e.name.slice(0, 15) + "..." : e.name,
      hours: e.totalHours,
      utilization: e.utilizationRate,
    }));
  }, [data]);

  const summary = useMemo(() => {
    if (!data) return null;
    const total = data.report.length;
    const high = data.report.filter((e) => e.utilizationLevel === "high").length;
    const medium = data.report.filter((e) => e.utilizationLevel === "medium").length;
    const low = data.report.filter((e) => e.utilizationLevel === "low").length;
    const avgUtilization =
      total > 0
        ? Math.round(data.report.reduce((s, e) => s + e.utilizationRate, 0) / total)
        : 0;
    return { total, high, medium, low, avgUtilization };
  }, [data]);

  const columns: ConstructionTableColumn<any>[] = [
    {
      key: "name",
      header: "Equipment",
      render: (_, e) => (
        <div>
          <div className="font-medium font-sans text-foreground">{e.name}</div>
          {e.code && <div className="text-[10px] text-muted-foreground font-mono">{e.code}</div>}
        </div>
      ),
    },
    {
      key: "daysUsed",
      header: "Days Used",
      align: "right",
      render: (_, e) => <span className="font-mono text-xs">{e.daysUsed}</span>,
    },
    {
      key: "totalHours",
      header: "Total Hours",
      align: "right",
      render: (_, e) => <span className="font-mono text-xs font-semibold">{e.totalHours}</span>,
    },
    {
      key: "avgHoursPerDay",
      header: "Avg Hrs/Day",
      align: "right",
      render: (_, e) => <span className="font-mono text-xs text-muted-foreground">{e.avgHoursPerDay}</span>,
    },
    {
      key: "totalFuel",
      header: "Fuel Used",
      align: "right",
      render: (_, e) => <span className="font-mono text-xs">{e.totalFuel} L</span>,
    },
    {
      key: "utilizationRate",
      header: "Utilization",
      align: "right",
      render: (_, e) => (
        <span
          className={cn(
            "inline-flex items-center rounded px-2 py-0.5 text-[10px] font-semibold font-mono",
            getUtilizationColor(e.utilizationRate)
          )}
        >
          {e.utilizationRate}%
        </span>
      ),
    },
  ];

  return (
    <AnimatedPage className="space-y-4 pb-8">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href={`/projects/${id}/equipment`} className="hover:text-foreground flex items-center gap-1">
          <ChevronLeft className="h-4 w-4" /> Equipment & Fleet
        </Link>
        <span>/</span>
        <span>Equipment Utilization</span>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Equipment Utilization Report</h1>
          <p className="text-xs text-muted-foreground">
            Analysis of equipment usage, operating hours, and idle rates across the site
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs font-mono">
            <span className="text-muted-foreground">From:</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="h-8 rounded-md border border-input bg-background px-2 text-xs font-mono"
            />
          </div>
          <div className="flex items-center gap-1.5 text-xs font-mono">
            <span className="text-muted-foreground">To:</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="h-8 rounded-md border border-input bg-background px-2 text-xs font-mono"
            />
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
          <Skeleton className="h-64 w-full" />
        </div>
      ) : !data || data.report.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <Gauge className="mx-auto h-8 w-8 text-muted-foreground/50 mb-2" />
          <p className="text-sm text-muted-foreground font-medium">No equipment utilization data</p>
          <p className="text-xs text-muted-foreground mt-1">
            Log daily equipment logs to generate utilization reports
          </p>
        </div>
      ) : (
        <>
          {/* Summary KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <Card>
              <CardContent className="p-3">
                <div className="text-xs text-muted-foreground font-medium">Average Utilization</div>
                <div className="text-xl font-bold mt-1 text-primary">{summary?.avgUtilization}%</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">Across all active fleet</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3">
                <div className="text-xs text-muted-foreground font-medium">Total Tracked</div>
                <div className="text-xl font-bold mt-1">{summary?.total}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">Equipment units</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3">
                <div className="text-xs text-muted-foreground font-medium">High (&gt;70%)</div>
                <div className="text-xl font-bold mt-1 text-success">{summary?.high}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">Optimal usage</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3">
                <div className="text-xs text-muted-foreground font-medium">Moderate (40-70%)</div>
                <div className="text-xl font-bold mt-1 text-amber-600">{summary?.medium}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">Underutilized</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3">
                <div className="text-xs text-muted-foreground font-medium">Low (&lt;40%)</div>
                <div className="text-xl font-bold mt-1 text-red-600">{summary?.low}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">Idle / Cost drain</div>
              </CardContent>
            </Card>
          </div>

          {/* Utilization Bar Chart */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
                Utilization by Equipment (%)
              </CardTitle>
              <CardDescription className="text-xs">
                Percentage of available working hours actually operated
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <ResponsiveContainer width="100%" height={Math.max(200, data.report.length * 40)}>
                <BarChart
                  data={chartData}
                  layout="vertical"
                  margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10 }} />
                  <YAxis
                    type="category"
                    dataKey="shortName"
                    width={100}
                    tick={{ fontSize: 10 }}
                  />
                  <Tooltip
                    contentStyle={{
                      fontSize: 11,
                      borderRadius: 8,
                      border: "1px solid hsl(var(--border))",
                      background: "hsl(var(--background))",
                    }}
                    formatter={(value: number) => [`${value}%`, "Utilization"]}
                  />
                  <Bar dataKey="utilization" radius={[0, 4, 4, 0]}>
                    {chartData.map((entry, index) => (
                      <Cell key={index} fill={getBarColor(entry.utilization)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Central Table Engine */}
          <ConstructionTable
            data={data.report}
            columns={columns}
            searchPlaceholder="Search equipment by name or code..."
            searchFilterKeys={["name", "code"]}
          />
        </>
      )}
    </AnimatedPage>
  );
}
