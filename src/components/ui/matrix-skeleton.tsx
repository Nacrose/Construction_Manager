"use client";

import { cn } from "@/lib/utils";

export function SkeletonBlock({
  className,
}: {
  className?: string;
}) {
  return (
    <div
      className={cn(
        "animate-pulse rounded bg-[#d8e5f2]/70 border border-[#c5d7e8]/40",
        className
      )}
    />
  );
}

export function StatCardSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="rounded-lg p-3 bg-white border border-[#c7d8e8] shadow-xs flex items-center justify-between"
        >
          <div className="space-y-1.5 flex-1">
            <SkeletonBlock className="h-3 w-24" />
            <SkeletonBlock className="h-5 w-32" />
          </div>
          <SkeletonBlock className="h-8 w-8 rounded-lg" />
        </div>
      ))}
    </div>
  );
}

export function TableSkeleton({
  rows = 5,
  cols = 5,
}: {
  rows?: number;
  cols?: number;
}) {
  return (
    <div className="rounded-lg border border-[#c7d8e8] bg-white overflow-hidden shadow-xs">
      {/* Table Header Skeleton */}
      <div className="bg-[#f0f6fc] border-b border-[#c7d8e8] px-3 py-2 flex items-center justify-between gap-4">
        <SkeletonBlock className="h-4 w-28" />
        <SkeletonBlock className="h-6 w-48" />
      </div>

      {/* Rows */}
      <div className="divide-y divide-[#e2ecf5]">
        {Array.from({ length: rows }).map((_, r) => (
          <div
            key={r}
            className="px-3 py-2 flex items-center gap-4 animate-pulse"
          >
            {Array.from({ length: cols }).map((_, c) => (
              <div
                key={c}
                className={cn(
                  "flex-1",
                  c === 0 ? "max-w-[80px]" : "",
                  c === cols - 1 ? "max-w-[100px] text-right" : ""
                )}
              >
                <SkeletonBlock
                  className={cn(
                    "h-3.5",
                    c === 0 ? "w-14" : c === cols - 1 ? "w-20 ml-auto" : "w-3/4"
                  )}
                />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function CockpitSkeleton() {
  return (
    <div className="space-y-2.5 animate-in fade-in duration-200">
      {/* Top Stat Row */}
      <StatCardSkeleton count={3} />

      {/* Middle Alerts / Quick Actions Bar Skeleton */}
      <div className="rounded-lg p-2.5 bg-white border border-[#c7d8e8] shadow-xs flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 flex-1">
          <SkeletonBlock className="h-4 w-4 rounded-full" />
          <SkeletonBlock className="h-3.5 w-64" />
        </div>
        <SkeletonBlock className="h-6 w-28" />
      </div>

      {/* Main Grid: Liquid Cash / Projects & Live Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-2.5">
        <div className="lg:col-span-4 space-y-2.5">
          <div className="rounded-lg p-3 bg-white border border-[#c7d8e8] shadow-xs space-y-2">
            <SkeletonBlock className="h-4 w-32" />
            <SkeletonBlock className="h-10 w-full" />
            <SkeletonBlock className="h-10 w-full" />
          </div>
        </div>
        <div className="lg:col-span-8">
          <TableSkeleton rows={6} cols={5} />
        </div>
      </div>
    </div>
  );
}
