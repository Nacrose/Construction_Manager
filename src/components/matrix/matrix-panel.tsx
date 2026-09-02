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
        "relative overflow-hidden rounded-xl border border-[var(--border)] bg-card shadow-xs transition-all duration-200",
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--input)] bg-[#f8fbfe] select-none shrink-0 relative z-10 font-sans">
        <span className="text-xs font-bold text-foreground/90 tracking-wide uppercase flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-[var(--primary)]" />
          {title}
        </span>
        {action && <div className="flex items-center gap-2">{action}</div>}
      </div>

      {/* Content */}
      <div className="relative z-10 p-0 text-foreground">{children}</div>
    </div>
  );
}
