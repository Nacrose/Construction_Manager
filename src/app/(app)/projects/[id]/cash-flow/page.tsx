"use client";

import { use, useState } from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  TrendingUp, TrendingDown, Wallet, Calendar, Download, Loader2,
} from "lucide-react";
import { AnimatedPage } from "@/components/ui/animated-page";
import { toast } from "sonner";
import { ModuleTabs } from "@/components/module-tabs";

const FIN_TABS = [
  { label: "Payments", href: "/payments" },
  { label: "Accounting & Day Book", href: "/accounting" },
  { label: "IPC Certificates", href: "/ipc" },
  { label: "Tax Summary", href: "/tax-summary" },
  { label: "Cash Flow", href: "/cash-flow" },
  { label: "Budget vs Actual", href: "/budget-variance" },
];

function fmt(n: number) {
  return n.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export default function CashFlowPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [months, setMonths] = useState(12);

  const { data, isLoading } = trpc.finance.cashFlow.useQuery({ projectId: id, months });

  return (
    <>
      <ModuleTabs projectId={id} tabs={FIN_TABS} />
      <AnimatedPage className="space-y-4 pb-8">
        {/* Single-Row Action & Timeline Strip */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-2xl border border-white/10 bg-[#0c1015]">
          <div className="flex items-center gap-2 text-xs font-mono text-gray-400">
            <span>Forecast Horizon:</span>
            <span className="font-bold text-emerald-400">{months} Months</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground font-mono">Period:</span>
            <Select value={String(months)} onValueChange={(v) => setMonths(parseInt(v))}>
              <SelectTrigger className="h-9 w-32 text-xs bg-[#121820] border-white/10 text-white rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#0f141c] border-white/10 text-white text-xs">
                <SelectItem value="6">6 months</SelectItem>
                <SelectItem value="12">12 months</SelectItem>
                <SelectItem value="18">18 months</SelectItem>
                <SelectItem value="24">24 months</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

      {isLoading ? (
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : !data ? (
        <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">
          No data available.
        </CardContent></Card>
      ) : (
        <>
          {/* Totals */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="p-4">
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Calendar className="h-3 w-3" /> Total Planned
              </p>
              <p className="mt-1 text-lg font-semibold text-blue-600">
                NPR {fmt(data.totals.totalPlanned)}
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <TrendingDown className="h-3 w-3" /> Total Actual Costs
              </p>
              <p className="mt-1 text-lg font-semibold text-amber-600">
                NPR {fmt(data.totals.totalActual)}
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Wallet className="h-3 w-3" /> Total IPC Paid
              </p>
              <p className="mt-1 text-lg font-semibold text-purple-600">
                NPR {fmt(data.totals.totalIpcPaid)}
              </p>
            </Card>
            <Card className="p-4 border-emerald-300 dark:border-emerald-800 bg-emerald-50/20">
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <TrendingUp className="h-3 w-3" /> Variance (Planned − Actual)
              </p>
              <p className={`mt-1 text-lg font-bold ${
                data.totals.totalPlanned - data.totals.totalActual >= 0
                  ? "text-emerald-600"
                  : "text-red-600"
              }`}>
                NPR {fmt(data.totals.totalPlanned - data.totals.totalActual)}
              </p>
            </Card>
          </div>

          {/* Chart — simple bar chart with CSS */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Monthly Cash Flow</CardTitle>
            </CardHeader>
            <CardContent>
              <CashFlowChart months={data.months} />
            </CardContent>
          </Card>

          {/* Cumulative S-curve */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Cumulative S-Curve</CardTitle>
            </CardHeader>
            <CardContent>
              <CumulativeChart months={data.months} />
            </CardContent>
          </Card>

          {/* Monthly table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Monthly Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Month</TableHead>
                    <TableHead className="text-right">Planned</TableHead>
                    <TableHead className="text-right">Actual Costs</TableHead>
                    <TableHead className="text-right">IPC Paid</TableHead>
                    <TableHead className="text-right">Net Outflow</TableHead>
                    <TableHead className="text-right">Cum. Planned</TableHead>
                    <TableHead className="text-right">Cum. Actual</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.months.map((m) => (
                    <TableRow key={m.month}>
                      <TableCell className="font-medium">{m.label}</TableCell>
                      <TableCell className="text-right font-mono text-blue-600">{fmt(m.plannedCost)}</TableCell>
                      <TableCell className="text-right font-mono text-amber-600">{fmt(m.actualCost)}</TableCell>
                      <TableCell className="text-right font-mono text-purple-600">{fmt(m.ipcPaid)}</TableCell>
                      <TableCell className="text-right font-mono font-semibold">{fmt(m.netCashFlow)}</TableCell>
                      <TableCell className="text-right font-mono text-muted-foreground">{fmt(m.cumulativePlanned)}</TableCell>
                      <TableCell className="text-right font-mono text-muted-foreground">{fmt(m.cumulativeActual)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
        )}
      </AnimatedPage>
    </>
  );
}

/**
 * Simple CSS-based bar chart — no external chart library needed.
 * Shows planned vs actual side by side per month.
 */
function CashFlowChart({ months }: { months: Array<{ label: string; plannedCost: number; actualCost: number; ipcPaid: number }> }) {
  const maxVal = Math.max(
    ...months.map((m) => Math.max(m.plannedCost, m.actualCost + m.ipcPaid)),
    1
  );

  return (
    <div className="space-y-2">
      {/* Legend */}
      <div className="flex gap-4 text-xs">
        <span className="flex items-center gap-1">
          <span className="h-3 w-3 rounded bg-blue-500" /> Planned
        </span>
        <span className="flex items-center gap-1">
          <span className="h-3 w-3 rounded bg-amber-500" /> Actual Costs
        </span>
        <span className="flex items-center gap-1">
          <span className="h-3 w-3 rounded bg-purple-500" /> IPC Paid
        </span>
      </div>

      {/* Bars */}
      <div className="flex items-end gap-1 h-48 border-b border-l pb-0 pl-2">
        {months.map((m) => (
          <div key={m.label} className="flex-1 flex flex-col items-center gap-0.5 group relative">
            <div className="flex items-end h-full gap-0.5 w-full justify-center">
              {/* Planned */}
              <div
                className="w-1/3 bg-blue-500 rounded-t hover:bg-blue-600 transition-colors"
                style={{ height: `${(m.plannedCost / maxVal) * 100}%`, minHeight: m.plannedCost > 0 ? "2px" : "0" }}
                title={`Planned: NPR ${fmt(m.plannedCost)}`}
              />
              {/* Actual */}
              <div
                className="w-1/3 bg-amber-500 rounded-t hover:bg-amber-600 transition-colors"
                style={{ height: `${(m.actualCost / maxVal) * 100}%`, minHeight: m.actualCost > 0 ? "2px" : "0" }}
                title={`Actual: NPR ${fmt(m.actualCost)}`}
              />
              {/* IPC Paid */}
              <div
                className="w-1/3 bg-purple-500 rounded-t hover:bg-purple-600 transition-colors"
                style={{ height: `${(m.ipcPaid / maxVal) * 100}%`, minHeight: m.ipcPaid > 0 ? "2px" : "0" }}
                title={`IPC Paid: NPR ${fmt(m.ipcPaid)}`}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Labels */}
      <div className="flex gap-1">
        {months.map((m) => (
          <div key={m.label} className="flex-1 text-center text-[9px] text-muted-foreground truncate">
            {m.label.split(" ")[0]}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Cumulative S-curve — shows planned vs actual cumulative spend over time.
 */
function CumulativeChart({ months }: { months: Array<{ label: string; cumulativePlanned: number; cumulativeActual: number }> }) {
  const maxVal = Math.max(
    ...months.map((m) => Math.max(m.cumulativePlanned, m.cumulativeActual)),
    1
  );

  // Build SVG line chart
  const width = 100;
  const height = 100;
  const plannedPoints = months.map((m, i) => ({
    x: (i / (months.length - 1 || 1)) * width,
    y: height - (m.cumulativePlanned / maxVal) * height,
  }));
  const actualPoints = months.map((m, i) => ({
    x: (i / (months.length - 1 || 1)) * width,
    y: height - (m.cumulativeActual / maxVal) * height,
  }));

  const plannedPath = plannedPoints.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const actualPath = actualPoints.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");

  return (
    <div className="space-y-2">
      <div className="flex gap-4 text-xs">
        <span className="flex items-center gap-1">
          <span className="h-0.5 w-4 bg-blue-500" /> Cumulative Planned
        </span>
        <span className="flex items-center gap-1">
          <span className="h-0.5 w-4 bg-emerald-500" /> Cumulative Actual
        </span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-48 border-b border-l" preserveAspectRatio="none">
        {/* Grid lines */}
        {[0.25, 0.5, 0.75].map((pct) => (
          <line key={pct} x1="0" y1={height * pct} x2={width} y2={height * pct} stroke="currentColor" strokeWidth="0.2" className="text-muted-foreground/30" />
        ))}
        {/* Planned line */}
        <path d={plannedPath} fill="none" stroke="#3b82f6" strokeWidth="0.8" />
        {/* Actual line */}
        <path d={actualPath} fill="none" stroke="#10b981" strokeWidth="0.8" />
      </svg>
      <div className="flex justify-between text-[9px] text-muted-foreground">
        <span>{months[0]?.label}</span>
        <span>{months[Math.floor(months.length / 2)]?.label}</span>
        <span>{months[months.length - 1]?.label}</span>
      </div>
    </div>
  );
}
