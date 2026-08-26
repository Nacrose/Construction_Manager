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

  // Active project ID fallback to selected or first project (or empty string for org-wide)
  const currentProjectId = selectedProjectId || (projects.length > 0 ? projects[0]?.id : "");

  return (
    <div className="space-y-4 pb-8">
      {/* 1. ModuleTabs Style Bar at Organization Level */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex flex-wrap items-center gap-1 rounded border border-border bg-card/90 p-1 w-fit max-w-full shadow-sm">
          {FIN_TABS.map((tab) => {
            const active = activeMainTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveMainTab(tab.key as any)}
                className={cn(
                  "rounded px-3 py-1 text-xs font-mono transition-all duration-150 shrink-0",
                  active
                    ? "bg-primary/15 text-primary border border-primary/40 font-semibold shadow-[0_0_8px_rgba(0,255,102,0.15)]"
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
              <SelectTrigger className="h-8 text-xs font-mono w-56 bg-[#121820] border-white/10 text-white rounded-lg">
                <SelectValue placeholder="All (HQ + Projects)" />
              </SelectTrigger>
              <SelectContent className="bg-[#0f141c] border-emerald-500/30 text-xs text-white">
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
        currentProjectId ? (
          <ProjectJvTab projectId={currentProjectId} />
        ) : (
          <div className="p-8 text-center bg-[#121820]/30 rounded-2xl border border-dashed border-white/10 text-xs text-muted-foreground">
            Select an active project site from the dropdown to view JV partner commission agreements.
          </div>
        )
      )}

      {/* Tab 1: Day Book & Cashbook */}
      {activeMainTab === "accounting" && (
        <DayBookTab projectId={currentProjectId || undefined} />
      )}

      {/* Tab 2: Parties & Payables */}
      {projects.length > 0 && activeMainTab === "payments" && currentProjectId && (
        <PaymentsPage params={Promise.resolve({ id: currentProjectId })} />
      )}

      {/* Tab 3: Reports & Compliance */}
      {projects.length > 0 && activeMainTab === "tax-summary" && currentProjectId && (
        <TaxSummaryPage params={Promise.resolve({ id: currentProjectId })} />
      )}
    </div>
  );
}
