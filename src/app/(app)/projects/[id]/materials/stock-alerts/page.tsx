"use client";

import { use, useState } from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc-client";
import { AnimatedPage } from "@/components/ui/animated-page";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronLeft, AlertTriangle, Package, ShoppingCart } from "lucide-react";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";

const RES_TABS = [
  { label: "Materials & Procurement", href: "/materials" },
  { label: "Resource & Rate Library", href: "/rate-library" },
  { label: "Equipment & Fleet", href: "/equipment" },
  { label: "Plant & Production", href: "/production" },
  { label: "Subcontractors", href: "/subcontractors" },
  { label: "HR / Staff", href: "/hr" },
  { label: "Vendors Directory", href: "/vendors" },
];

function getUrgencyStyle(urgency: string) {
  if (urgency === "critical") return "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400 border-red-200 dark:border-red-900";
  if (urgency === "warning") return "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-400 border-orange-200 dark:border-orange-900";
  return "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900";
}

function getUrgencyBadge(urgency: string) {
  if (urgency === "critical") return "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400";
  if (urgency === "warning") return "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-400";
  return "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400";
}

export default function StockAlertsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();

  const { data: projectInfo } = trpc.project.get.useQuery({ id }, { staleTime: 300_000 });
  const { data, isLoading } = trpc.material.stockAlerts.useQuery({ projectId: id });

  const canWrite = projectInfo?.myRole && projectInfo.myRole !== "client" && projectInfo.myRole !== "inspector";

  return (
    <AnimatedPage className="space-y-4 pb-8">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href={`/projects/${id}/materials`} className="hover:text-foreground flex items-center gap-1">
          <ChevronLeft className="h-4 w-4" /> Materials
        </Link>
        <span>/</span>
        <span>Stock Alerts</span>
      </div>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <AlertTriangle className="h-6 w-6 text-primary" />
          Stock Level Alerts
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Materials at risk of stockout with consumption analysis.
        </p>
      </div>

      {isLoading ? (
        <Card>
          <CardContent>
            <Skeleton className="h-64" />
          </CardContent>
        </Card>
      ) : !data || data.alerts.length === 0 ? (
        <Card>
          <CardContent>
            <div className="text-center py-8 text-xs text-muted-foreground">
              <Package className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p>All materials are adequately stocked.</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {data.summary.critical > 0 && (
            <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50/50 dark:border-red-900 dark:bg-red-950/20 p-3 text-xs text-red-700 dark:text-red-400">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>
                <strong>{data.summary.critical}</strong> material{data.summary.critical > 1 ? "s" : ""} below minimum stock level — immediate reorder required.
              </span>
            </div>
          )}
          {data.summary.warning > 0 && (
            <div className="flex items-center gap-2 rounded-md border border-orange-200 bg-orange-50/50 dark:border-orange-900 dark:bg-orange-950/20 p-3 text-xs text-orange-700 dark:text-orange-400">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>
                <strong>{data.summary.warning}</strong> material{data.summary.warning > 1 ? "s" : ""} below reorder level — schedule procurement.
              </span>
            </div>
          )}

          <div className="grid grid-cols-3 gap-3">
            <Card>
              <CardContent className="p-3 text-center">
                <div className="text-[10px] text-muted-foreground uppercase">Total Alerts</div>
                <div className="text-2xl font-bold">{data.summary.total}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 text-center">
                <div className="text-[10px] text-muted-foreground uppercase">Critical</div>
                <div className="text-2xl font-bold text-red-600">{data.summary.critical}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 text-center">
                <div className="text-[10px] text-muted-foreground uppercase">Warning</div>
                <div className="text-2xl font-bold text-orange-600">{data.summary.warning}</div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">Materials at Risk</CardTitle>
                {canWrite && (
                  <Button
                    size="sm"
                    onClick={() => router.push(`/projects/${id}/materials?tab=requisitions`)}
                  >
                    <ShoppingCart className="mr-1.5 h-3.5 w-3.5" />
                    Create Purchase Requisition
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="pb-2 font-medium text-muted-foreground">Material</th>
                      <th className="pb-2 font-medium text-muted-foreground text-right">Current Stock</th>
                      <th className="pb-2 font-medium text-muted-foreground text-right">Min Stock</th>
                      <th className="pb-2 font-medium text-muted-foreground text-right">Reorder Level</th>
                      <th className="pb-2 font-medium text-muted-foreground text-right">Daily Consumption</th>
                      <th className="pb-2 font-medium text-muted-foreground text-right">Days Until Stockout</th>
                      <th className="pb-2 font-medium text-muted-foreground text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.alerts.map(m => (
                      <tr key={m.id} className={cn("border-b last:border-0 hover:bg-muted/30", getUrgencyStyle(m.urgency))}>
                        <td className="py-2">
                          <div className="font-medium">{m.name}</div>
                          {m.code && <div className="text-[10px] text-muted-foreground">{m.code}</div>}
                        </td>
                        <td className="py-2 text-right tabular-nums font-semibold">
                          {m.currentStock} {m.unit}
                        </td>
                        <td className="py-2 text-right tabular-nums">{m.minStock} {m.unit}</td>
                        <td className="py-2 text-right tabular-nums">{m.reorderLevel} {m.unit}</td>
                        <td className="py-2 text-right tabular-nums">
                          {m.avgDailyConsumption > 0 ? `${m.avgDailyConsumption} ${m.unit}/day` : "—"}
                        </td>
                        <td className="py-2 text-right tabular-nums font-semibold">
                          {m.daysUntilStockout !== null ? (
                            <span className={cn(
                              m.daysUntilStockout <= 3 ? "text-red-600" : m.daysUntilStockout <= 7 ? "text-orange-600" : ""
                            )}>
                              {m.daysUntilStockout} days
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="py-2 text-right">
                          <span className={cn("inline-flex items-center rounded px-2 py-0.5 text-[10px] font-semibold", getUrgencyBadge(m.urgency))}>
                            {m.urgency}
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
