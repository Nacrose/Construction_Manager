"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { type ReactNode } from "react";

export type ModuleTab = {
  label: string;
  href: string;
};

/**
 * Technical Matrix Sub-Navigation Bar for merged sidebar modules.
 */
export function ModuleTabs({
  projectId,
  tabs,
  rightContent,
}: {
  projectId: string;
  tabs: ModuleTab[];
  rightContent?: ReactNode;
}) {
  const pathname = usePathname();
  const basePath = `/projects/${projectId}`;

  return (
    <div className="flex flex-wrap items-center gap-1 rounded border border-border bg-card/90 p-1 w-fit max-w-full mb-4 shadow-sm">
      {tabs.map((tab) => {
        const href = basePath + tab.href;
        const active = pathname === href || pathname.startsWith(href + "/");
        return (
          <Link
            key={tab.href}
            href={href}
            className={cn(
              "rounded px-3 py-1 text-xs font-mono transition-all duration-150 shrink-0",
              active
                ? "bg-primary/15 text-primary border border-primary/40 font-semibold shadow-[0_0_8px_rgba(0,255,102,0.15)]"
                : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
            )}
          >
            {tab.label}
          </Link>
        );
      })}
      {rightContent && (
        <div className="flex items-center gap-2 min-w-0 pr-1 border-l border-border/50 pl-2">
          {rightContent}
        </div>
      )}
    </div>
  );
}
