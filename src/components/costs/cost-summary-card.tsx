"use client";

import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc-client";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Plus, Download, TrendingUp, Package, HardHat, Wrench, Users, Receipt,
  Trash2, Loader2, FileText,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ExpenseEntryDialog } from "./expense-entry-dialog";

type Props = {
  projectId: string;
  canWrite?: boolean;
};

const CATEGORY_CONFIG = {
  material: { label: "Material", icon: Package, color: "text-amber-600", bg: "bg-amber-50 dark:bg-amber-950/30" },
  labor: { label: "Labor", icon: HardHat, color: "text-info", bg: "bg-info/10 dark:bg-[var(--navy-deep)]/30" },
  equipment: { label: "Equipment", icon: Wrench, color: "text-purple-600", bg: "bg-purple-50 dark:bg-purple-950/30" },
  subcontractor: { label: "Subcontractor", icon: Users, color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-950/30" },
  overhead: { label: "Overhead", icon: Receipt, color: "text-muted-foreground", bg: "bg-muted/60 dark:bg-[var(--navy-mid)]/50" },
};

const PERIODS = [
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "all", label: "All time" },
];

function npr(amount: number): string {
  return "NPR " + amount.toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

export function CostSummaryCard({ projectId, canWrite = true }: Props) {
  const utils = trpc.useUtils();
  const [period, setPeriod] = useState("30d");
  const [expenseDialogOpen, setExpenseDialogOpen] = useState(false);

  // Calculate date range based on period
  const dateRange = useMemo(() => {
    if (period === "all") return {};
    const days = parseInt(period);
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - days);
    return { startDate: start.toISOString(), endDate: end.toISOString() };
  }, [period]);

  const { data: statsData, isLoading: statsLoading } = trpc.projectCost.stats.useQuery({
    projectId,
    ...dateRange,
  });

  const { data: costsData, isLoading: costsLoading } = trpc.projectCost.list.useQuery({
    projectId,
    ...dateRange,
    limit: 20,
  });

  const deleteMut = trpc.projectCost.delete.useMutation({
    onSuccess: () => {
      utils.projectCost.list.invalidate({ projectId });
      utils.projectCost.stats.invalidate({ projectId });
      toast.success("Expense deleted");
    },
    onError: (e) => toast.error(e.message),
  });

  const handleExport = async () => {
    try {
      const result = await utils.projectCost.exportCsv.fetch({ projectId, ...dateRange });
      // Download CSV
      const blob = new Blob([result.csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `costs-${projectId}-${format(new Date(), "yyyy-MM-dd")}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`Exported ${result.count} cost entries`);
    } catch (e: any) {
      toast.error(e.message ?? "Export failed");
    }
  };

  const stats = statsData;
  const costs = costsData?.costs ?? [];

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-sm flex items-center gap-2">
                <TrendingUp className="h-4 w-4" /> Cost Summary
              </CardTitle>
              <CardDescription className="text-xs">
                {stats ? `${stats.count} entries · ${npr(stats.total)} total` : "Loading..."}
              </CardDescription>
            </div>
            <div className="flex items-center gap-1.5">
              <Select value={period} onValueChange={setPeriod}>
                <SelectTrigger className="h-7 w-32 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PERIODS.map(p => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={handleExport} title="Export CSV">
                <Download className="h-3.5 w-3.5" />
              </Button>
              {canWrite && (
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setExpenseDialogOpen(true)}>
                  <Plus className="h-3 w-3" /> Add Expense
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {statsLoading ? (
            <Skeleton className="h-32" />
          ) : !stats || stats.total === 0 ? (
            <div className="text-center py-6 text-xs text-muted-foreground">
              <TrendingUp className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p>No costs recorded yet.</p>
              {canWrite && (
                <p className="mt-1">
                  Click <strong>Add Expense</strong> for manual entries, or submit a daily report
                  to auto-capture material, labor & equipment costs.
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {/* Category breakdown */}
              <div className="grid grid-cols-5 gap-2">
                {Object.entries(CATEGORY_CONFIG).map(([cat, cfg]) => {
                  const amount = stats.byCategory[cat] ?? 0;
                  const pct = stats.total > 0 ? Math.round((amount / stats.total) * 100) : 0;
                  const Icon = cfg.icon;
                  return (
                    <div key={cat} className={cn("rounded-md border p-2 text-center", cfg.bg)}>
                      <Icon className={cn("h-3.5 w-3.5 mx-auto mb-1", cfg.color)} />
                      <div className="text-[9px] text-muted-foreground uppercase tracking-wide">{cfg.label}</div>
                      <div className={cn("text-xs font-bold", cfg.color)}>
                        {amount > 0 ? npr(amount).replace("NPR ", "") : "—"}
                      </div>
                      <div className="text-[8px] text-muted-foreground">{pct}%</div>
                    </div>
                  );
                })}
              </div>

              {/* Recent costs list */}
              <div className="space-y-1">
                <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide flex items-center justify-between">
                  <span>Recent Costs</span>
                  <span>{costsLoading ? "Loading..." : `${costs.length} shown`}</span>
                </div>
                {costsLoading ? (
                  <Skeleton className="h-20" />
                ) : costs.length === 0 ? (
                  <p className="text-[10px] text-muted-foreground italic text-center py-2">No costs in this period.</p>
                ) : (
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {costs.map((cost) => {
                      const cfg = CATEGORY_CONFIG[cost.category as keyof typeof CATEGORY_CONFIG] ?? CATEGORY_CONFIG.overhead;
                      const Icon = cfg.icon;
                      return (
                        <div key={cost.id} className="flex items-start gap-2 rounded border p-1.5 text-xs hover:bg-muted/30">
                          <Icon className={cn("h-3 w-3 mt-0.5 shrink-0", cfg.color)} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-medium truncate">
                                {cost.description || cost.subcategory || cfg.label}
                              </span>
                              <span className="font-mono tabular-nums shrink-0">{npr(cost.amount)}</span>
                            </div>
                            <div className="flex items-center gap-2 text-[9px] text-muted-foreground">
                              <span>{format(new Date(cost.date), "dd MMM")}</span>
                              <span>·</span>
                              <span className={cn("rounded px-1", cfg.bg, cfg.color)}>{cfg.label}</span>
                              {cost.source !== "manual" && (
                                <>
                                  <span>·</span>
                                  <span className="text-info">{cost.source === "daily_report" ? "📄 " + (cost.sourceRef || "report") : cost.source}</span>
                                </>
                              )}
                              {cost.vendor && (
                                <>
                                  <span>·</span>
                                  <span>{cost.vendor}</span>
                                </>
                              )}
                              {cost.paymentMode && (
                                <>
                                  <span>·</span>
                                  <span className="capitalize">{cost.paymentMode.replace("_", " ")}</span>
                                </>
                              )}
                            </div>
                          </div>
                          {cost.source === "manual" && canWrite && (
                            <button
                              onClick={() => deleteMut.mutate({ id: cost.id, projectId })}
                              className="h-5 w-5 rounded border hover:bg-destructive hover:text-destructive-foreground flex items-center justify-center shrink-0"
                              title="Delete"
                              disabled={deleteMut.isPending}
                            >
                              <Trash2 className="h-2.5 w-2.5" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Auto vs Manual split */}
              <div className="flex items-center justify-between text-[10px] text-muted-foreground border-t pt-2">
                <span>
                  Auto-captured: <strong className="text-info">{npr(stats.bySource["daily_report"] ?? 0)}</strong>
                </span>
                <span>
                  Manual: <strong className="text-amber-600">{npr(stats.bySource["manual"] ?? 0)}</strong>
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <ExpenseEntryDialog
        open={expenseDialogOpen}
        onOpenChange={setExpenseDialogOpen}
        projectId={projectId}
      />
    </>
  );
}
