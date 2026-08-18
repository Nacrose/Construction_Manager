"use client";

import { trpc } from "@/lib/trpc-client";
import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  projectId: string;
  className?: string;
};

export function LowStockAlerts({ projectId, className }: Props) {
  const { data, isLoading } = trpc.material.lowStock.useQuery({ projectId });

  if (isLoading || !data || data.materials.length === 0) return null;

  const critical = data.materials.filter(m => m.urgency === "critical");
  const warning = data.materials.filter(m => m.urgency === "warning");

  return (
    <Card className={cn("border-amber-200 dark:border-amber-900 bg-amber-50/50 dark:bg-amber-950/20", className)}>
      <CardContent className="p-3">
        <div className="flex items-start gap-2">
          <AlertTriangle className={cn("h-4 w-4 shrink-0 mt-0.5", critical.length > 0 ? "text-red-600" : "text-amber-600")} />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium">
              {critical.length > 0 && (
                <span className="text-red-700 dark:text-red-400">
                  {critical.length} material{critical.length > 1 ? "s" : ""} below minimum stock!{" "}
                </span>
              )}
              {warning.length > 0 && (
                <span className="text-amber-700 dark:text-amber-400">
                  {warning.length} material{warning.length > 1 ? "s" : ""} below reorder level.
                </span>
              )}
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {data.materials.slice(0, 8).map(m => (
                <span
                  key={m.id}
                  className={cn(
                    "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium",
                    m.urgency === "critical"
                      ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400"
                      : "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400"
                  )}
                  title={`${m.name}: ${m.currentStock} ${m.unit} (reorder at ${m.reorderLevel}, min ${m.minStock})`}
                >
                  {m.name}: {m.currentStock} {m.unit}
                </span>
              ))}
              {data.materials.length > 8 && (
                <span className="text-[10px] text-muted-foreground">+{data.materials.length - 8} more</span>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
