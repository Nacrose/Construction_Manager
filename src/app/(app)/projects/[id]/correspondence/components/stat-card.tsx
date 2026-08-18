"use client";

import type React from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function StatCard({ label, value, icon: Icon, color, urgent }: {
  label: string; value: number; icon: React.ComponentType<{ className?: string }>; color: string; urgent?: boolean;
}) {
  return (
    <Card className={cn("p-3", urgent && "border-red-200 dark:border-red-900 bg-red-50/30 dark:bg-red-950/10")}>
      <div className="flex items-center gap-2">
        <Icon className={cn("h-4 w-4", color)} />
        <div>
          <div className={cn("text-lg font-bold", color)}>{value}</div>
          <div className="text-[9px] text-muted-foreground uppercase tracking-wide">{label}</div>
        </div>
      </div>
    </Card>
  );
}
