"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { adToBs, formatNepaliDate, type NepaliDate } from "@/lib/nepali-calendar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export interface DualDateBadgeProps {
  date: Date | string | number | null | undefined;
  mode?: "dual" | "bs" | "ad";
  format?: "short" | "long" | "devanagari";
  showWeekendIndicator?: boolean;
  className?: string;
}

export function DualDateBadge({
  date,
  mode = "dual",
  format = "short",
  showWeekendIndicator = true,
  className,
}: DualDateBadgeProps) {
  if (!date) {
    return <span className="text-muted-foreground">—</span>;
  }

  let bs: NepaliDate | null = null;
  let adStr = "";
  try {
    const d = typeof date === "object" ? date : new Date(date);
    adStr = d.toISOString().slice(0, 10);
    bs = adToBs(d);
  } catch {
    return <span className="text-muted-foreground">{String(date)}</span>;
  }

  const bsFormatted =
    format === "devanagari"
      ? bs.displayNp
      : format === "long"
      ? bs.display
      : bs.formatted;

  const content =
    mode === "bs" ? (
      <span>{bsFormatted} <span className="text-[10px] text-muted-foreground">BS</span></span>
    ) : mode === "ad" ? (
      <span>{adStr} <span className="text-[10px] text-muted-foreground">AD</span></span>
    ) : (
      <span className="inline-flex items-baseline gap-1">
        <span className="font-medium text-foreground">{bsFormatted}</span>
        <span className="text-[10px] text-muted-foreground font-mono">({adStr})</span>
      </span>
    );

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              "inline-flex items-center gap-1.5 text-xs rounded-md px-1.5 py-0.5 bg-muted/60 hover:bg-muted transition-colors cursor-default",
              bs.isWeekend && showWeekendIndicator && "border border-red-500/20 text-red-600 dark:text-red-400",
              className
            )}
          >
            {showWeekendIndicator && bs.isWeekend && (
              <span className="h-1.5 w-1.5 rounded-full bg-red-500 shrink-0" title="Saturday (Non-working)" />
            )}
            {content}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs space-y-0.5">
          <p className="font-semibold">{bs.displayNp} ({bs.dayOfWeekNameNp})</p>
          <p className="text-[11px] text-muted-foreground">{bs.display} ({bs.dayOfWeekName})</p>
          <p className="text-[10px] opacity-80">AD: {adStr} · FY: {bs.fiscalYear}</p>
          {bs.holidayName && (
            <p className="text-[10px] text-amber-500 font-medium">✨ {bs.holidayName}</p>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
