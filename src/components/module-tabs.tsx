"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { type ReactNode } from "react";
import { trpc } from "@/lib/trpc-client";
import { isModuleEnabled } from "@/lib/project-modules";
import {
  NAV_CLUSTERS,
  moduleKeyForTab,
  type ClusterKey,
  type NavTab,
} from "@/lib/nav-registry";

/** Tab shape is owned by the nav registry; kept as an alias for existing imports. */
export type ModuleTab = NavTab;

/**
 * Technical Matrix Sub-Navigation Bar for merged sidebar modules.
 *
 * Tab data comes from the nav registry (src/lib/nav-registry.ts): pass
 * `cluster="resources"` (etc.) instead of hand-building tab arrays.
 * The `tabs` prop remains as the sanctioned escape hatch for one-off bars —
 * exactly one of the two must be provided.
 */
export function ModuleTabs({
  projectId,
  cluster,
  tabs,
  rightContent,
}: {
  projectId: string;
  cluster?: ClusterKey;
  tabs?: ModuleTab[];
  rightContent?: ReactNode;
}) {
  if (!cluster && !tabs) {
    // Fail loud: an empty tab bar is a bug, not a valid render state.
    throw new Error("ModuleTabs: provide either `cluster` or `tabs`.");
  }
  if (cluster && tabs) {
    throw new Error("ModuleTabs: pass `cluster` or `tabs`, not both.");
  }

  const pathname = usePathname();
  const basePath = `/projects/${projectId}`;

  const { data } = trpc.project.getModules.useQuery(
    { projectId },
    { staleTime: 300_000, enabled: !!projectId }
  );
  const enabledModules = data?.modules;

  const resolvedTabs: readonly ModuleTab[] = cluster ? NAV_CLUSTERS[cluster] : tabs!;

  const visibleTabs = resolvedTabs.filter((tab) => {
    const key = moduleKeyForTab(tab);
    if (!key) return true; // not a toggleable module or core
    return isModuleEnabled(enabledModules, key);
  });

  return (
    <div className="flex flex-wrap items-center gap-1 rounded border border-border bg-card/90 p-1 w-fit max-w-full mb-4 shadow-sm">
      {visibleTabs.map((tab) => {
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
