"use client";

import React from "react";
import { cn } from "@/lib/utils";

export function MatrixPanel({
  title,
  children,
  className,
  action,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded border border-border/80 bg-card shadow-[0_0_16px_rgba(52,211,153,0.08)] transition-all duration-200",
        className
      )}
    >
      {/* Title bar (Matrix Technical Header) */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/60 bg-muted/60 select-none shrink-0 relative z-10 font-mono">
        <span className="text-xs font-bold text-primary tracking-wide uppercase flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-primary shadow-[0_0_6px_#34d399]" />
          {title}
        </span>
        {action && <div className="flex items-center gap-2">{action}</div>}
      </div>

      {/* Content */}
      <div className="relative z-10">{children}</div>
    </div>
  );
}
