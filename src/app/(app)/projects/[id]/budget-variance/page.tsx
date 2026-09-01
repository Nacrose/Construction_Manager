"use client";

import { use, useState } from "react";
import { trpc } from "@/lib/trpc-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  TrendingUp, TrendingDown, CheckCircle2, Loader2, ChevronDown, ChevronRight,
} from "lucide-react";
import { AnimatedPage } from "@/components/ui/animated-page";
import { cn } from "@/lib/utils";
import { ModuleTabs } from "@/components/module-tabs";
import { formatNpr } from "@/lib/currency";


export default function BudgetVariancePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

  const { data, isLoading } = trpc.finance.budgetVariance.useQuery({ projectId: id });

  function toggleSection(section: string) {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
  }

  return (
    <>
      <ModuleTabs projectId={id} cluster="finance" />
      <AnimatedPage className="space-y-4 pb-8">

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
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 font-mono">
            <Card className="p-4">
              <p className="text-xs text-muted-foreground uppercase">Total Budget</p>
              <p className="mt-1 text-lg font-semibold text-blue-600">
                {formatNpr(data.totals.totalBudget)}
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-muted-foreground uppercase">Total Actual</p>
              <p className="mt-1 text-lg font-semibold text-amber-600">
                {formatNpr(data.totals.totalActual)}
              </p>
            </Card>
            <Card className={cn(
              "p-4",
              data.totals.totalVariance >= 0
                ? "border-emerald-300 dark:border-emerald-800 bg-emerald-50/20"
                : "border-red-300 dark:border-red-800 bg-red-50/20"
            )}>
              <p className="text-xs text-muted-foreground uppercase">Variance</p>
              <p className={cn(
                "mt-1 text-lg font-bold",
                data.totals.totalVariance >= 0 ? "text-emerald-600" : "text-red-600"
              )}>
                {data.totals.totalVariance >= 0 ? "+" : ""}{formatNpr(data.totals.totalVariance)}
              </p>
              <p className="text-[10px] text-muted-foreground font-sans">
                ({data.totals.totalVariance >= 0 ? "under budget" : "over budget"})
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-muted-foreground uppercase">Variance %</p>
              <p className={cn(
                "mt-1 text-lg font-bold",
                data.totals.totalVariancePercent >= 0 ? "text-emerald-600" : "text-red-600"
              )}>
                {data.totals.totalVariancePercent >= 0 ? "+" : ""}{data.totals.totalVariancePercent.toFixed(1)}%
              </p>
              <div className="flex gap-2 mt-1 text-[10px]">
                <span className="text-emerald-600">{data.totals.underBudgetCount} under</span>
                <span className="text-red-600">{data.totals.overBudgetCount} over</span>
              </div>
            </Card>
          </div>

          {/* Section summary */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-mono">Variance by Section</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="font-mono text-xs">
                    <TableHead>Section</TableHead>
                    <TableHead className="text-right">Budget</TableHead>
                    <TableHead className="text-right">Actual</TableHead>
                    <TableHead className="text-right">Variance</TableHead>
                    <TableHead className="text-right">Variance %</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.sections.map((s) => (
                    <TableRow key={s.section}>
                      <TableCell className="font-medium text-xs">{s.section}</TableCell>
                      <TableCell className="text-right font-mono text-xs text-blue-600">{formatNpr(s.budgetAmount)}</TableCell>
                      <TableCell className="text-right font-mono text-xs text-amber-600">{formatNpr(s.actualAmount)}</TableCell>
                      <TableCell className={cn(
                        "text-right font-mono text-xs font-semibold",
                        s.variance >= 0 ? "text-emerald-600" : "text-red-600"
                      )}>
                        {s.variance >= 0 ? "+" : ""}{formatNpr(s.variance)}
                      </TableCell>
                      <TableCell className={cn(
                        "text-right font-mono text-xs",
                        s.variancePercent >= 0 ? "text-emerald-600" : "text-red-600"
                      )}>
                        {s.variancePercent >= 0 ? "+" : ""}{s.variancePercent.toFixed(1)}%
                      </TableCell>
                      <TableCell className="text-center">
                        {s.variance > 0 ? (
                          <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 text-[10px]">
                            <TrendingUp className="h-3 w-3 mr-1" /> Under
                          </Badge>
                        ) : s.variance < 0 ? (
                          <Badge className="bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300 text-[10px]">
                            <TrendingDown className="h-3 w-3 mr-1" /> Over
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px]">
                            <CheckCircle2 className="h-3 w-3 mr-1" /> On Track
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Detailed item-level breakdown */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-mono">Item-Level Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                {data.sections.map((section) => (
                  <div key={section.section}>
                    {/* Section header — clickable to expand */}
                    <button
                      onClick={() => toggleSection(section.section)}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-md hover:bg-muted/50 transition text-left"
                    >
                      {expandedSections.has(section.section) ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      )}
                      <span className="font-medium text-sm flex-1">{section.section}</span>
                      <span className="text-xs text-muted-foreground font-mono">
                        {section.items.length} items
                      </span>
                      <span className={cn(
                        "text-xs font-mono font-semibold",
                        section.variance >= 0 ? "text-emerald-600" : "text-red-600"
                      )}>
                        {section.variance >= 0 ? "+" : ""}{formatNpr(section.variance)}
                      </span>
                    </button>

                    {/* Items — only show when expanded */}
                    {expandedSections.has(section.section) && (
                      <div className="ml-6 mb-2 overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow className="font-mono text-xs">
                              <TableHead className="text-xs">Code</TableHead>
                              <TableHead className="text-xs">Description</TableHead>
                              <TableHead className="text-right text-xs">Budget Qty</TableHead>
                              <TableHead className="text-right text-xs">Actual Qty</TableHead>
                              <TableHead className="text-right text-xs">Rate</TableHead>
                              <TableHead className="text-right text-xs">Budget Amt</TableHead>
                              <TableHead className="text-right text-xs">Actual Amt</TableHead>
                              <TableHead className="text-right text-xs">Variance</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {section.items.map((item) => (
                              <TableRow key={item.boqItemId}>
                                <TableCell className="text-xs font-mono">{item.code}</TableCell>
                                <TableCell className="text-xs font-sans">{item.description}</TableCell>
                                <TableCell className="text-right text-xs font-mono">{item.budgetQty} {item.unit}</TableCell>
                                <TableCell className="text-right text-xs font-mono">{item.actualQty} {item.unit}</TableCell>
                                <TableCell className="text-right text-xs font-mono">{formatNpr(item.rate)}</TableCell>
                                <TableCell className="text-right text-xs font-mono text-blue-600">{formatNpr(item.budgetAmount)}</TableCell>
                                <TableCell className="text-right text-xs font-mono text-amber-600">{formatNpr(item.actualAmount)}</TableCell>
                                <TableCell className={cn(
                                  "text-right text-xs font-mono font-semibold",
                                  item.variance >= 0 ? "text-emerald-600" : "text-red-600"
                                )}>
                                  {item.variance >= 0 ? "+" : ""}{formatNpr(item.variance)}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
        )}
      </AnimatedPage>
    </>
  );
}
