"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { type ReactNode } from "react";
import { trpc } from "@/lib/trpc-client";
import { isModuleEnabled, type ModuleKey } from "@/lib/project-modules";
import { capabilitiesSchema, type CapabilityRequirement, type OperatingCapabilities } from "@/lib/capabilities";
import { filterNavByCapabilities } from "@/lib/nav-registry";
import { useMemo } from "react";

export type ModuleTab = {
  label: string;
  href: string;
  moduleKey?: ModuleKey;
  /** Resolved-capability requirement (ADR-0004): hidden when unmet. */
  cap?: CapabilityRequirement;
};

const AUTO_MODULE_MAP: Record<string, ModuleKey> = {
  "/ipc": "ipc",
  "/tax-summary": "vat",
  "/vendors": "purchaseOrders",
  "/workflow/rfi": "rfi",
  "/rfis": "rfi",
  "/submittals": "submittals",
  "/correspondence": "correspondence",
  "/punch-list": "punchList",
  "/quality": "qualitySafety",
  "/safety": "qualitySafety",
  "/production": "production",
  "/drawings": "drawings",
  "/document-center": "documents",
  "/hr": "hr",
  "/hr/payroll": "hr",
  "/hr/leaves": "hr",
  "/equipment": "equipment",
  "/subcontractors": "subcontractors",
  "/subcontractors/billing": "subcontractors",
  "/variations": "variations",
  "/workflow/program": "dailyProgramme",
  "/daily-program": "dailyProgramme",
  "/look-ahead": "dailyProgramme",
  "/accounting": "accounting",
  "/guarantees": "guarantees",
};

/**
 * Technical Matrix Sub-Navigation Bar for merged sidebar modules.
 * Automatically filters out tabs for modules that are disabled for the project.
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

  const { data } = trpc.project.getModules.useQuery(
    { projectId },
    { staleTime: 300_000, enabled: !!projectId }
  );
  const enabledModules = data?.modules;

  // Resolved capability map (ADR-0004) — shared react-query cache with the
  // sidebar and the team page (same getOrgProfile query). Nav is a
  // PROJECTION, never the guard: fail-open while loading or unparsable,
  // because capabilityGuard owns the real server-side enforcement.
  const { data: orgProfile } = trpc.project.getOrgProfile.useQuery(undefined, {
    staleTime: 300_000,
  });
  const orgCapabilities = useMemo<OperatingCapabilities | null>(() => {
    const parsed = capabilitiesSchema.safeParse(orgProfile?.org?.capabilities);
    return parsed.success ? parsed.data : null;
  }, [orgProfile]);

  const visibleTabs = filterNavByCapabilities(tabs, orgCapabilities).filter((tab) => {
    const key = tab.moduleKey ?? AUTO_MODULE_MAP[tab.href];
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
                ? "bg-primary/15 text-primary border border-primary/40 font-semibold shadow-[0_0_8px_rgba(245,158,11,0.15)]"
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

