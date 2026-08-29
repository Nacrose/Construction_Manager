"use client";

import { trpc } from "@/lib/trpc-client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  TrendingUp,
  TrendingDown,
  ArrowRight,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { formatNpr } from "@/lib/currency";

export function CrossProjectFinancialsCard() {
  const { data, isLoading } = trpc.project.crossProjectFinancials.useQuery(undefined, {
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <Card className="shadow-md">
        <CardHeader>
          <Skeleton className="h-6 w-1/3" />
          <Skeleton className="h-4 w-1/2" />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-48 rounded-xl" />
        </CardContent>
      </Card>
    );
  }

  const projects = data?.projects || [];
  const totals = data?.totals || {
    totalContractValue: 0,
    totalRevenueCertified: 0,
    totalRevenueCollected: 0,
    totalClientReceivables: 0,
    totalCostIncurred: 0,
    totalGrossProfit: 0,
    overallMargin: 0,
    totalVendorPayables: 0,
    totalSubcontractorPayables: 0,
    totalPayables: 0,
  };

  if (projects.length === 0) {
    return null;
  }

  const isProfit = totals.totalGrossProfit >= 0;

  return (
    <Card className="shadow-lg border-border/80 overflow-hidden font-sans">
      <CardHeader className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white p-6 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono uppercase px-2 py-0.5 rounded bg-white/10 text-emerald-400 font-semibold tracking-wider">
                Multi-Project P&amp;L
              </span>
              <span className="text-xs text-slate-300 font-mono">
                {projects.length} Active Project{projects.length > 1 ? "s" : ""}
              </span>
            </div>
            <CardTitle className="text-xl font-bold mt-1 text-white tracking-tight">
              Cross-Project Financial Overview &amp; Payables
            </CardTitle>
            <CardDescription className="text-xs text-slate-300 mt-0.5">
              Consolidated contract revenue, actual costs incurred, gross profit margins, and outstanding payables.
            </CardDescription>
          </div>

          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className={cn(
                "h-8 px-3 text-xs font-mono font-bold border-white/20 backdrop-blur-md",
                isProfit ? "bg-emerald-500/20 text-emerald-300" : "bg-red-500/20 text-red-300"
              )}
            >
              {isProfit ? <TrendingUp className="h-3.5 w-3.5 mr-1" /> : <TrendingDown className="h-3.5 w-3.5 mr-1" />}
              Portfolio Margin: {totals.overallMargin.toFixed(1)}%
            </Badge>
          </div>
        </div>

        {/* Portfolio Summary Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mt-6 pt-5 border-t border-white/10 font-mono">
          <div>
            <div className="text-[10px] text-slate-400 uppercase">Contract Value</div>
            <div className="text-base font-bold text-white mt-0.5">
              {formatNpr(totals.totalContractValue)}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-slate-400 uppercase">Certified Revenue</div>
            <div className="text-base font-bold text-emerald-400 mt-0.5">
              {formatNpr(totals.totalRevenueCertified)}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-slate-400 uppercase">Costs Incurred</div>
            <div className="text-base font-bold text-slate-200 mt-0.5">
              {formatNpr(totals.totalCostIncurred)}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-slate-400 uppercase">Net Profit / (Loss)</div>
            <div className={cn("text-base font-bold mt-0.5", isProfit ? "text-emerald-400" : "text-red-400")}>
              {isProfit ? "+" : ""}{formatNpr(totals.totalGrossProfit)}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-slate-400 uppercase">What We Owe (Payables)</div>
            <div className="text-base font-bold text-amber-400 mt-0.5">
              {formatNpr(totals.totalPayables)}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-slate-400 uppercase">Client Due (Receivables)</div>
            <div className="text-base font-bold text-cyan-400 mt-0.5">
              {formatNpr(totals.totalClientReceivables)}
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono tabular-nums">
            <thead className="border-b bg-muted/60 uppercase text-[10px] text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-sans">Project</th>
                <th className="px-3 py-3 text-right">Contract Value</th>
                <th className="px-3 py-3 text-right">Certified (IPC)</th>
                <th className="px-3 py-3 text-right">Total Cost</th>
                <th className="px-3 py-3 text-right">Gross Profit</th>
                <th className="px-3 py-3 text-right">Margin</th>
                <th className="px-3 py-3 text-right">What We Owe</th>
                <th className="px-3 py-3 text-right">Client Due</th>
                <th className="px-4 py-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {projects.map((p) => {
                const projectProfit = p.grossProfit >= 0;
                return (
                  <tr key={p.id} className="hover:bg-muted/30 transition-colors">
                    {/* Project Name & Code */}
                    <td className="px-4 py-3 font-sans">
                      <div className="flex items-center gap-1.5">
                        <Link
                          href={`/projects/${p.id}`}
                          className="font-bold text-foreground hover:text-primary transition-colors text-sm"
                        >
                          {p.name}
                        </Link>
                        <span className="font-mono text-[10px] bg-muted px-1.5 py-0.2 rounded text-muted-foreground">
                          {p.code}
                        </span>
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">
                        Client: {p.client}
                      </div>
                    </td>

                    {/* Contract Value */}
                    <td className="px-3 py-3 text-right text-muted-foreground">
                      {p.contractValue > 0 ? formatNpr(p.contractValue) : "—"}
                    </td>

                    {/* Certified Revenue */}
                    <td className="px-3 py-3 text-right font-medium text-foreground">
                      {p.revenueCertified > 0 ? formatNpr(p.revenueCertified) : "—"}
                    </td>

                    {/* Total Cost */}
                    <td className="px-3 py-3 text-right text-muted-foreground">
                      {p.costs.total > 0 ? formatNpr(p.costs.total) : "—"}
                    </td>

                    {/* Gross Profit / Loss */}
                    <td className="px-3 py-3 text-right font-bold">
                      <span className={cn(projectProfit ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>
                        {projectProfit ? "+" : ""}{formatNpr(p.grossProfit)}
                      </span>
                    </td>

                    {/* Margin % */}
                    <td className="px-3 py-3 text-right">
                      {p.revenueCertified > 0 ? (
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10px] px-1.5 py-0 font-mono",
                            projectProfit
                              ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-300"
                              : "bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border-red-300"
                          )}
                        >
                          {p.marginPercent.toFixed(1)}%
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>

                    {/* What We Owe */}
                    <td className="px-3 py-3 text-right">
                      {p.payables.totalPayables > 0 ? (
                        <Link
                          href={`/projects/${p.id}/payments`}
                          className="font-bold text-amber-600 dark:text-amber-400 hover:underline"
                        >
                          {formatNpr(p.payables.totalPayables)}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground text-[11px]">✓ Settled</span>
                      )}
                    </td>

                    {/* Client Due */}
                    <td className="px-3 py-3 text-right font-medium text-cyan-600 dark:text-cyan-400">
                      {p.clientReceivables > 0 ? formatNpr(p.clientReceivables) : "—"}
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3 text-center">
                      <Link href={`/projects/${p.id}/accounting`}>
                        <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 font-sans">
                          Accounts <ArrowRight className="h-3 w-3" />
                        </Button>
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
