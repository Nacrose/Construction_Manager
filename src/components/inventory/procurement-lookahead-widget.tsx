"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc-client";
import { format } from "date-fns";
import {
  Clock,
  AlertTriangle,
  Calendar,
  Layers,
  ArrowRight,
  TrendingUp,
  Loader2,
  CheckCircle2,
  Plus
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface ProcurementLookaheadWidgetProps {
  projectId: string;
  onCreateRequisition?: () => void;
}

export function ProcurementLookaheadWidget({ projectId, onCreateRequisition }: ProcurementLookaheadWidgetProps) {
  const [lookaheadDays, setLookaheadDays] = useState<number>(30);
  const { data, isLoading } = trpc.procurementLookahead.getLookahead.useQuery({
    projectId,
    lookaheadDays,
  });

  const alerts = data?.alerts || [];
  const criticalCount = data?.criticalAlertsCount || 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b pb-3">
        <div>
          <h3 className="text-base font-bold text-foreground flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" />
            <span>Procurement Schedule Lookahead</span>
            {criticalCount > 0 && (
              <Badge variant="destructive" className="font-mono text-xs animate-pulse">
                {criticalCount} Action Required
              </Badge>
            )}
          </h3>
          <p className="text-xs text-muted-foreground">
            Calculates material lead-time buffers from upcoming Gantt scheduled tasks
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Select
            value={lookaheadDays.toString()}
            onValueChange={(val) => setLookaheadDays(Number(val))}
          >
            <SelectTrigger className="h-8 w-32 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="14">Next 14 Days</SelectItem>
              <SelectItem value="30">Next 30 Days</SelectItem>
              <SelectItem value="60">Next 60 Days</SelectItem>
            </SelectContent>
          </Select>

          {onCreateRequisition && (
            <Button size="sm" onClick={onCreateRequisition} className="gap-1 h-8 text-xs">
              <Plus className="h-3.5 w-3.5" />
              Create PR
            </Button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="p-8 text-center text-muted-foreground flex items-center justify-center gap-2 text-xs">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Analyzing Gantt tasks and lead times...</span>
        </div>
      ) : alerts.length === 0 ? (
        <Card className="p-6 text-center border-dashed">
          <CardContent className="space-y-2 pt-2">
            <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto" />
            <p className="text-sm font-semibold text-foreground">No Procurement Bottlenecks</p>
            <p className="text-xs text-muted-foreground">
              Current inventory levels sufficiently cover scheduled tasks for the next {lookaheadDays} days.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {alerts.map((alert) => {
            const isOverdue = alert.status === "overdue";
            const isUrgent = alert.status === "urgent";

            return (
              <div
                key={alert.materialId}
                className={`rounded-xl border p-3.5 space-y-2.5 transition-all ${
                  isOverdue
                    ? "bg-rose-50/50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/60"
                    : isUrgent
                    ? "bg-amber-50/50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/60"
                    : "bg-card border-border/80"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h4 className="text-sm font-bold text-foreground">{alert.materialName}</h4>
                    {alert.materialCategory && (
                      <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                        {alert.materialCategory}
                      </span>
                    )}
                  </div>

                  {isOverdue ? (
                    <Badge variant="destructive" className="text-[10px] font-mono py-0.5 px-2">
                      Overdue ({Math.abs(alert.daysUntilRequisitionDue)}d late)
                    </Badge>
                  ) : isUrgent ? (
                    <Badge variant="secondary" className="bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300 text-[10px] font-mono py-0.5 px-2">
                      Order within {alert.daysUntilRequisitionDue} days
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px] font-mono py-0.5 px-2">
                      Lead Time: {alert.leadDays}d
                    </Badge>
                  )}
                </div>

                {/* Demand Metrics */}
                <div className="grid grid-cols-3 gap-2 py-2 px-2.5 rounded-lg bg-background/80 border text-xs font-mono">
                  <div>
                    <span className="text-[10px] text-muted-foreground block font-sans">Current Stock:</span>
                    <span className="font-semibold text-foreground">{alert.currentStock} {alert.unit}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground block font-sans">Task Demand:</span>
                    <span className="font-semibold text-foreground">{alert.plannedDemand} {alert.unit}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground block font-sans">Shortfall:</span>
                    <span className={`font-bold ${alert.shortfall > 0 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600"}`}>
                      {alert.shortfall} {alert.unit}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs text-muted-foreground pt-0.5">
                  <div className="flex items-center gap-1.5 truncate">
                    <Calendar className="h-3.5 w-3.5 text-primary shrink-0" />
                    <span className="truncate">First Task: <strong>{alert.earliestTaskName}</strong> ({format(new Date(alert.earliestTaskDate), "dd MMM")})</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
