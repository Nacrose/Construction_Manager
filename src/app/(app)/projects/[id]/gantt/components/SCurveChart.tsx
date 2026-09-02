"use client";

import { useMemo } from "react";
import { differenceInDays, addDays, format, startOfMonth } from "date-fns";
import {
  LineChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine,
} from "recharts";
import { Flag, TrendingUp, TrendingDown, CheckCircle2, Clock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import type { Task } from "../types";

export function SCurveChart({ tasks, rangeStart, days }: { tasks: Task[]; rangeStart: Date; days: number }) {
  const milestones = useMemo(() => {
    return tasks.filter((t) => t.isMilestone);
  }, [tasks]);

  const { data, latestPlanned, latestActual, variance, milestonePoints } = useMemo(() => {
    const taskList = tasks.filter((t) => !t.isMilestone && t.duration > 0);
    if (taskList.length === 0 || days <= 0) {
      return { data: [], latestPlanned: 0, latestActual: 0, variance: 0, milestonePoints: [] };
    }

    // Total work-days across all tasks (normalizer so cumulative reaches exactly 1.0)
    const totalWorkDays = taskList.reduce((sum, t) => {
      const start = new Date(t.startDate);
      const end = new Date(t.endDate);
      return sum + Math.max(1, differenceInDays(end, start) + 1);
    }, 0);

    if (totalWorkDays === 0) {
      return { data: [], latestPlanned: 0, latestActual: 0, variance: 0, milestonePoints: [] };
    }

    const plannedDaily: number[] = new Array(days).fill(0);
    const actualDaily: number[] = new Array(days).fill(0);

    for (const t of taskList) {
      const taskStart = new Date(t.startDate);
      const taskEnd = new Date(t.endDate);
      const taskDuration = Math.max(1, differenceInDays(taskEnd, taskStart) + 1);
      const startOffset = Math.max(0, differenceInDays(taskStart, rangeStart));
      const endDay = Math.min(days - 1, startOffset + taskDuration - 1);

      const plannedPerDay = 1 / totalWorkDays;
      const actualPerDay = (t.progress / 100) / totalWorkDays;

      for (let d = startOffset; d <= endDay; d++) {
        plannedDaily[d] += plannedPerDay;
        actualDaily[d] += actualPerDay;
      }
    }

    // Cumulative sums
    let plannedCum = 0;
    let actualCum = 0;

    // Bucket by month
    const monthMap = new Map<string, { label: string; planned: number; actual: number }>();
    for (let i = 0; i < days; i++) {
      const date = addDays(rangeStart, i);
      const monthStart = startOfMonth(date);
      const key = format(monthStart, "yyyy-MM");
      if (!monthMap.has(key)) {
        monthMap.set(key, { label: format(monthStart, "MMM yyyy"), planned: 0, actual: 0 });
      }
      const bucket = monthMap.get(key)!;
      plannedCum += plannedDaily[i];
      actualCum += actualDaily[i];
      bucket.planned = Math.round(plannedCum * 100);
      bucket.actual = Math.round(actualCum * 100);
    }

    const chartData = Array.from(monthMap.values());
    const lastPoint = chartData[chartData.length - 1];
    const planned = lastPoint?.planned ?? 0;
    const actual = lastPoint?.actual ?? 0;
    const diff = actual - planned;

    // Map milestone dates to closest month labels
    const mPoints = milestones.map((m) => {
      const mDate = new Date(m.startDate);
      const mMonth = startOfMonth(mDate);
      const label = format(mMonth, "MMM yyyy");
      return { name: m.name, label, date: format(mDate, "MMM d, yyyy") };
    });

    return {
      data: chartData,
      latestPlanned: planned,
      latestActual: actual,
      variance: diff,
      milestonePoints: mPoints,
    };
  }, [tasks, rangeStart, days, milestones]);

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-sm text-muted-foreground font-mono">
        No data available for S-Curve calculation.
      </div>
    );
  }

  return (
    <div className="w-full space-y-4 font-mono">
      {/* S-Curve Variance KPI Header */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Card className="p-3 border border-border/70 bg-card/60">
          <div className="flex items-center justify-between text-muted-foreground text-[11px] uppercase">
            <span>Planned Work</span>
            <span className="h-2 w-2 rounded-full bg-amber-500" />
          </div>
          <div className="text-lg font-bold text-amber-400 mt-1">
            {latestPlanned}%
          </div>
          <div className="text-[10px] text-muted-foreground">Target baseline progress</div>
        </Card>

        <Card className="p-3 border border-border/70 bg-card/60">
          <div className="flex items-center justify-between text-muted-foreground text-[11px] uppercase">
            <span>Actual Executed</span>
            <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_6px_#34d399]" />
          </div>
          <div className="text-lg font-bold text-primary mt-1">
            {latestActual}%
          </div>
          <div className="text-[10px] text-muted-foreground">Reported work done</div>
        </Card>

        <Card className="p-3 border border-border/70 bg-card/60">
          <div className="flex items-center justify-between text-muted-foreground text-[11px] uppercase">
            <span>Variance / Slippage</span>
            {variance >= 0 ? <TrendingUp className="h-3.5 w-3.5 text-emerald-400" /> : <TrendingDown className="h-3.5 w-3.5 text-destructive" />}
          </div>
          <div className={cn("text-lg font-bold mt-1", variance >= 0 ? "text-primary" : "text-destructive")}>
            {variance >= 0 ? `+${variance}%` : `${variance}%`}
          </div>
          <div className="text-[10px] text-muted-foreground">
            {variance >= 0 ? "Ahead of Schedule" : "Schedule Lag"}
          </div>
        </Card>

        <Card className="p-3 border border-border/70 bg-card/60">
          <div className="flex items-center justify-between text-muted-foreground text-[11px] uppercase">
            <span>Contract Milestones</span>
            <Flag className="h-3.5 w-3.5 text-info" />
          </div>
          <div className="text-lg font-bold text-info mt-1">
            {milestones.length}
          </div>
          <div className="text-[10px] text-muted-foreground">
            {milestones.filter((m) => m.progress === 100).length} completed
          </div>
        </Card>
      </div>

      {/* Full-width S-Curve Canvas */}
      <div className="rounded border border-border/80 bg-card/70 p-3 shadow-[0_0_20px_rgba(0,0,0,0.2)]">
        <ResponsiveContainer width="100%" height={460}>
          <LineChart data={data} margin={{ top: 20, right: 36, left: 16, bottom: 48 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.07)" />
            <XAxis
              dataKey="label"
              tick={(props: { x: number; y: number; payload: { value: string; index: number } }) => {
                const row = data[props.payload.index];
                return (
                  <g transform={`translate(${props.x},${props.y})`}>
                    <text x={0} y={0} dy={12} textAnchor="middle" fill="#8cb5a1" fontSize={10} fontFamily="monospace">
                      {props.payload.value}
                    </text>
                    <text x={0} y={0} dy={24} textAnchor="middle" fill="#f59e0b" fontSize={9} fontWeight={600} fontFamily="monospace">
                      P:{row?.planned ?? "?"}%
                    </text>
                    <text x={0} y={0} dy={34} textAnchor="middle" fill="#34d399" fontSize={9} fontWeight={600} fontFamily="monospace">
                      A:{row?.actual ?? "?"}%
                    </text>
                  </g>
                );
              }}
              stroke="rgba(255,255,255,0.2)"
              interval={0}
              height={60}
            />
            <YAxis
              domain={[0, 100]}
              tick={{ fontSize: 10, fill: "#8cb5a1", fontFamily: "monospace" }}
              stroke="rgba(255,255,255,0.2)"
              tickFormatter={(v: number) => `${v}%`}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "rgba(8, 14, 10, 0.95)",
                borderColor: "rgba(52, 211, 153, 0.4)",
                fontSize: 11,
                borderRadius: 6,
                fontFamily: "monospace",
                color: "#e4f5eb",
              }}
              formatter={(value: number, name: string) => [`${value}%`, name === "planned" ? "Planned (Target)" : "Actual (Executed)"]}
            />
            <Legend
              wrapperStyle={{ fontSize: 11, fontFamily: "monospace", paddingTop: 10 }}
            />
            
            {/* Milestone vertical reference lines */}
            {milestonePoints.map((m, idx) => (
              <ReferenceLine
                key={idx}
                x={m.label}
                stroke="#06b6d4"
                strokeDasharray="4 4"
                strokeWidth={1.5}
                label={{
                  value: `🚩 ${m.name}`,
                  position: "top",
                  fill: "#06b6d4",
                  fontSize: 10,
                  fontFamily: "monospace",
                }}
              />
            ))}

            <Area type="monotone" dataKey="planned" fill="#f59e0b" fillOpacity={0.06} stroke="none" />
            <Line
              type="monotone"
              dataKey="planned"
              stroke="#f59e0b"
              strokeWidth={2.5}
              dot={{ r: 3.5, fill: "#f59e0b", strokeWidth: 0 }}
              name="Planned Target"
            />
            <Area type="monotone" dataKey="actual" fill="#34d399" fillOpacity={0.06} stroke="none" />
            <Line
              type="monotone"
              dataKey="actual"
              stroke="#34d399"
              strokeWidth={2.5}
              dot={{ r: 3.5, fill: "#34d399", strokeWidth: 0 }}
              name="Actual Progress"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
