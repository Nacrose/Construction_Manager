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

const RES_TABS = [
  { label: "Materials & Procurement", href: "/materials" },
  { label: "Resource & Rate Library", href: "/rate-library" },
  { label: "Equipment & Fleet", href: "/equipment" },
  { label: "Plant & Production", href: "/production" },
  { label: "Subcontractors", href: "/subcontractors" },
  { label: "HR / Staff", href: "/hr" },
  { label: "Vendors Directory", href: "/vendors" },
];

function getUtilizationColor(rate: number) {
  if (rate > 70) return "text-emerald-600 bg-emerald-50 dark:bg-emerald-950 dark:text-emerald-400";
  if (rate > 40) return "text-amber-600 bg-amber-50 dark:bg-amber-950 dark:text-amber-400";
  return "text-red-600 bg-red-50 dark:bg-red-950 dark:text-red-400";
}

function getBarColor(rate: number) {
  if (rate > 70) return "#22c55e";
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

  const canWrite = projectInfo?.myRole && projectInfo.myRole !== "client" && projectInfo.myRole !== "inspector";

  const chartData = useMemo(() => {
    if (!data) return [];
    return data.report.map(e => ({
      name: e.code ? `${e.code} - ${e.name}` : e.name,
      shortName: e.name.length > 15 ? e.name.slice(0, 15) + "..." : e.name,
      hours: e.totalHours,
      utilization: e.utilizationRate,
    }));
  }, [data]);

  const summary = useMemo(() => {
    if (!data) return null;
    const total = data.report.length;
    const high = data.report.filter(e => e.utilizationLevel === "high").length;
    const medium = data.report.filter(e => e.utilizationLevel === "medium").length;
    const low = data.report.filter(e => e.utilizationLevel === "low").length;
    const avgUtilization = total > 0
      ? Math.round(data.report.reduce((s, e) => s + e.utilizationRate, 0) / total)
      : 0;
    return { total, high, medium, low, avgUtilization };
  }, [data]);

  return (
    <AnimatedPage className="space-y-4 pb-8">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href={`/projects/${id}/materials`} className="hover:text-foreground flex items-center gap-1">
          <ChevronLeft className="h-4 w-4" /> Resources
        </Link>
        <span>/</span>
        <span>Equipment Utilization</span>
      </div>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <Gauge className="h-6 w-6 text-primary" />
          Equipment Utilization Report
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Analyze fleet utilization rates, working hours, and fuel consumption.
        </p>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1">
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Start Date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="rounded-md border border-input bg-background px-3 py-1.5 text-xs"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">End Date</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="rounded-md border border-input bg-background px-3 py-1.5 text-xs"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Card>
            <CardContent className="p-3 text-center">
              <div className="text-[10px] text-muted-foreground uppercase">Total Equipment</div>
              <div className="text-2xl font-bold">{summary.total}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <div className="text-[10px] text-muted-foreground uppercase">Avg Utilization</div>
              <div className={cn("text-2xl font-bold", getUtilizationColor(summary.avgUtilization).split(" ")[0])}>
                {summary.avgUtilization}%
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <div className="text-[10px] text-muted-foreground uppercase">High (&gt;70%)</div>
              <div className="text-2xl font-bold text-emerald-600">{summary.high}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <div className="text-[10px] text-muted-foreground uppercase">Medium (40-70%)</div>
              <div className="text-2xl font-bold text-amber-600">{summary.medium}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <div className="text-[10px] text-muted-foreground uppercase">Low (&lt;40%)</div>
              <div className="text-2xl font-bold text-red-600">{summary.low}</div>
            </CardContent>
          </Card>
        </div>
      )}

      {isLoading ? (
        <Card>
          <CardContent>
            <Skeleton className="h-64" />
          </CardContent>
        </Card>
      ) : !data || data.report.length === 0 ? (
        <Card>
          <CardContent>
            <div className="text-center py-8 text-xs text-muted-foreground">
              <BarChart3 className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p>No equipment logs found for this date range.</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <BarChart3 className="h-4 w-4" /> Utilization by Equipment
              </CardTitle>
              <CardDescription className="text-xs">
                {data.dateRange.daysInRange} days in range · Sorted by utilization rate
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

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Detailed Report</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="pb-2 font-medium text-muted-foreground">Equipment</th>
                      <th className="pb-2 font-medium text-muted-foreground text-right">Days Used</th>
                      <th className="pb-2 font-medium text-muted-foreground text-right">Total Hours</th>
                      <th className="pb-2 font-medium text-muted-foreground text-right">Avg Hrs/Day</th>
                      <th className="pb-2 font-medium text-muted-foreground text-right">Fuel Used</th>
                      <th className="pb-2 font-medium text-muted-foreground text-right">Utilization</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.report.map(e => (
                      <tr key={e.id} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="py-2">
                          <div className="font-medium">{e.name}</div>
                          {e.code && <div className="text-[10px] text-muted-foreground">{e.code}</div>}
                        </td>
                        <td className="py-2 text-right tabular-nums">{e.daysUsed}</td>
                        <td className="py-2 text-right tabular-nums">{e.totalHours}</td>
                        <td className="py-2 text-right tabular-nums">{e.avgHoursPerDay}</td>
                        <td className="py-2 text-right tabular-nums">{e.totalFuel} L</td>
                        <td className="py-2 text-right">
                          <span className={cn("inline-flex items-center rounded px-2 py-0.5 text-[10px] font-semibold", getUtilizationColor(e.utilizationRate))}>
                            {e.utilizationRate}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </AnimatedPage>
  );
}
