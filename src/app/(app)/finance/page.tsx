"use client";

import { useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { DayBookTab } from "@/app/(app)/projects/[id]/accounting/components/day-book-tab";
import { trpc } from "@/lib/trpc-client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import PaymentsPage from "@/app/(app)/projects/[id]/payments/page";
import TaxSummaryPage from "@/app/(app)/projects/[id]/tax-summary/page";
import { OrgBankAccountsTab } from "@/app/(app)/finance/components/org-bank-accounts-tab";
import { OrgGuaranteesTab } from "@/app/(app)/finance/components/org-guarantees-tab";
import { ProjectJvTab } from "@/app/(app)/projects/[id]/accounting/components/project-jv-tab";

export const FIN_TABS = [
  { label: "Day Book & Cashbook", key: "accounting" },
  { label: "JV Partner Commissions", key: "jv-commission" },
  { label: "Bank Accounts & Wallets", key: "bank-accounts" },
  { label: "Guarantees & Bid Bonds", key: "guarantees" },
  { label: "Parties & Payables", key: "payments" },
  { label: "Reports & Compliance", key: "tax-summary" },
];

export default function OrganizationFinancePage() {
  const [activeMainTab, setActiveMainTab] = useState<"accounting" | "jv-commission" | "bank-accounts" | "guarantees" | "payments" | "tax-summary">("accounting");
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");

  const { data: projectsData } = trpc.project.list.useQuery();
  const projects = projectsData?.projects || [];

  // When viewing Day Book / Cashbook, an empty selectedProjectId means Org-Wide (All Sites + HQ).
  // For project-specific tabs (Payments, Tax Summary, JV), fallback to the first project if none is selected.
  const projectSpecificId = selectedProjectId || (projects.length > 0 ? projects[0]?.id : "");

  return (
    <div className="space-y-4 pb-8">
      {/* 1. ModuleTabs Style Bar at Organization Level */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex flex-wrap items-center gap-1 rounded-lg border border-border bg-card/90 p-1 w-fit max-w-full shadow-sm">
          {FIN_TABS.map((tab) => {
            const active = activeMainTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveMainTab(tab.key as any)}
                className={cn(
                  "rounded-md px-3 py-1 text-xs font-mono transition-all duration-150 shrink-0",
                  active
                    ? "bg-primary/15 text-primary border border-primary/40 font-semibold shadow-[0_0_8px_var(--primary-glow)]"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                )}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Project Selector for Multi-Site Scoping */}
        {projects.length > 0 && (activeMainTab === "accounting" || activeMainTab === "jv-commission" || activeMainTab === "payments" || activeMainTab === "tax-summary") && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground font-mono">Scope:</span>
            <Select value={selectedProjectId || "all"} onValueChange={(val) => setSelectedProjectId(val === "all" ? "" : val)}>
              <SelectTrigger className="h-8 text-xs font-mono w-56 bg-card border-border text-foreground rounded-lg">
                <SelectValue placeholder="All (HQ + Projects)" />
              </SelectTrigger>
              <SelectContent className="bg-popover border-border text-xs text-foreground backdrop-blur-md">
                <SelectItem value="all">🌐 All (HQ + All Site Projects)</SelectItem>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    🏗️ {p.name} ({p.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* Tab: Organization Bank Accounts & Wallets */}
      {activeMainTab === "bank-accounts" && (
        <OrgBankAccountsTab />
      )}

      {/* Tab: Organization Bank Guarantees & Bid Bonds */}
      {activeMainTab === "guarantees" && (
        <OrgGuaranteesTab />
      )}

      {/* Tab: JV Partner Commission Ledger */}
      {activeMainTab === "jv-commission" && (
        projectSpecificId ? (
          <ProjectJvTab projectId={projectSpecificId} />
        ) : (
          <div className="p-8 text-center bg-card/40 rounded-2xl border border-dashed border-border text-xs text-muted-foreground">
            Select an active project site from the dropdown to view JV partner commission agreements.
          </div>
        )
      )}

      {/* Tab 1: Day Book & Cashbook */}
      {activeMainTab === "accounting" && (
        <DayBookTab projectId={selectedProjectId || undefined} />
      )}

      {/* Tab 2: Parties & Payables */}
      {projects.length > 0 && activeMainTab === "payments" && projectSpecificId && (
        <PaymentsPage params={Promise.resolve({ id: projectSpecificId })} />
      )}

      {/* Tab 3: Reports & Compliance */}
      {projects.length > 0 && activeMainTab === "tax-summary" && projectSpecificId && (
        <TaxSummaryPage params={Promise.resolve({ id: projectSpecificId })} />
      )}
    </div>
  );
}
