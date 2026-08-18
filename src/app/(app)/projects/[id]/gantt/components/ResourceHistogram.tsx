"use client";

import { useMemo } from "react";
import { addDays, differenceInDays, format } from "date-fns";
import type { Task } from "../../gantt/types";

type ResourceHistogramProps = {
  tasks: Task[];
  rangeStart: Date;
  days: number;
  dayWidth: number;
  height?: number;
};

type ResourceBucket = {
  date: Date;
  labor: number;
  total: number;
};

export function ResourceHistogram({ tasks, rangeStart, days, dayWidth, height = 50 }: ResourceHistogramProps) {
  const buckets = useMemo(() => {
    const map = new Map<string, ResourceBucket>();
    for (let i = 0; i < days; i++) {
      const d = addDays(rangeStart, i);
      const key = format(d, "yyyy-MM-dd");
      map.set(key, { date: d, labor: 0, total: 0 });
    }
    for (const task of tasks) {
      const start = new Date(task.startDate);
      const end = new Date(task.endDate);
      const taskDays = differenceInDays(end, start) + 1;
      if (taskDays <= 0) continue;
      const laborPerDay = (task.laborCount || 0) / taskDays;
      for (let i = 0; i < taskDays; i++) {
        const d = addDays(start, i);
        const key = format(d, "yyyy-MM-dd");
        const bucket = map.get(key);
        if (bucket) {
          bucket.labor += laborPerDay;
          bucket.total += 1;
        }
      }
    }
    return Array.from(map.values());
  }, [tasks, rangeStart, days]);

  const maxLabor = Math.max(...buckets.map(b => b.labor), 1);
  const svgWidth = days * dayWidth;
  const barWidth = Math.max(dayWidth - 1, 1);

  return (
    <div className="border-b bg-muted/10">
      <div className="flex items-center gap-2 px-3 py-1">
        <span className="text-[10px] font-semibold text-muted-foreground">Resources</span>
        <span className="text-[10px] text-muted-foreground/60">{tasks.reduce((s, t) => s + (t.laborCount || 0), 0)} total labor</span>
      </div>
      <svg width={svgWidth + 20} height={height} className="block">
        <defs>
          <linearGradient id="histGradient" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="hsl(190 70% 45%)" />
            <stop offset="100%" stopColor="hsl(190 80% 60%)" />
          </linearGradient>
        </defs>
        {buckets.map((b, i) => {
          const barH = (b.labor / maxLabor) * (height - 4);
          return (
            <rect key={i} x={i * dayWidth + 10} y={height - 2 - barH}
              width={barWidth} height={barH} fill="url(#histGradient)" opacity={0.7} rx={1} />
          );
        })}
        {/* Baseline */}
        <line x1={10} y1={height - 2} x2={svgWidth + 10} y2={height - 2}
          style={{ stroke: "hsl(var(--border))", strokeOpacity: 0.5, strokeWidth: 0.5 }} />
      </svg>
    </div>
  );
}
