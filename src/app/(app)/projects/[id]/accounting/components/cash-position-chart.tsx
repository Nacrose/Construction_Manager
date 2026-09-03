"use client";

import { useMemo } from "react";
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import { formatNpr } from "@/lib/currency";

type Row = { date: string; debit: number; credit: number };

/** Step/area chart of the cash position (cumulative running balance) over
 *  time, with a "Today" reference and a configurable minimum-buffer line. */
export function CashPositionChart({
  entries,
  forecastMode = "actual",
}: {
  entries: Row[];
  forecastMode?: "actual" | "forecast";
}) {
  const data = useMemo(() => {
    // Aggregate the day-book into per-date running balances, ordered chronologically.
    const byDate = new Map<string, { date: string; balance: number; inflow: number; outflow: number }>();
    let acc = 0;
    for (const e of entries) {
      const key = String(e.date).slice(0, 10);
      const d = byDate.get(key) ?? { date: key, balance: 0, inflow: 0, outflow: 0 };
      d.inflow += e.debit || 0;
      d.outflow += e.credit || 0;
      acc += (e.debit || 0) - (e.credit || 0);
      d.balance = acc;
      byDate.set(key, d);
    }
    const sorted = Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
    // Keep it bounded (last ~90 days for the "12 weeks"-style window).
    const window = sorted.slice(-90);
    // Project a simple linear forecast from the last two points for "forecast".
    if (forecastMode === "forecast" && window.length >= 2) {
      const last = window[window.length - 1];
      const prev = window[window.length - 2];
      const step = Math.max(1, (last.balance - prev.balance) || 0);
      for (let i = 1; i <= 4; i++) {
        window.push({ date: `fw${i}`, balance: last.balance + step * i, inflow: 0, outflow: 0 });
      }
    }
    return window;
  }, [entries, forecastMode]);

  const minBuffer = 1_000_000; // NPR 1.0m minimum buffer (reference)

  return (
    <div className="h-full w-full p-3 font-mono">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-wider text-foreground">Cash Position</span>
        <span className="text-[9px] text-muted-foreground">Last {forecastMode === "forecast" ? "projected" : "12 weeks"}</span>
      </div>
      <div className="h-[calc(100%-1.25rem)]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="cashPos" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#4a8b57" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#4a8b57" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#d5cabd" opacity={0.4} />
            <XAxis dataKey="date" tick={{ fontSize: 9 }} interval="preserveStartEnd" tickLine={false} />
            <YAxis tick={{ fontSize: 9 }} tickFormatter={(v: number) => `${Math.round(v / 1_000_000)}m`} width={34} tickLine={false} axisLine={false} />
            <Tooltip
              formatter={(v: number, name: string) => [formatNpr(v), name]}
              contentStyle={{ background: "#fffdf9", border: "1px solid #d5cabd", borderRadius: 6, fontSize: 11 }}
            />
            <ReferenceLine y={minBuffer} stroke="#dc2626" strokeDasharray="4 3" label={{ value: "Min buffer", position: "insideBottomLeft", fontSize: 9, fill: "#dc2626" }} />
            <Area type="stepAfter" dataKey="balance" stroke="#3f7180" strokeWidth={2} fill="url(#cashPos)" name="Cash Balance" />
            {forecastMode === "forecast" && (
              <Line type="stepAfter" dataKey="balance" stroke="#3f7180" strokeWidth={2} strokeDasharray="5 4" dot={{ r: 2 }} name="Forecast" />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
