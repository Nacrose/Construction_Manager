"use client";

import { useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { BookOpen, Users, Scale } from "lucide-react";
import { DayBookTab } from "@/app/(app)/projects/[id]/accounting/components/day-book-tab";
import { LedgerAccountsTab } from "@/app/(app)/projects/[id]/accounting/components/ledger-accounts-tab";
import { TrialBalanceTab } from "@/app/(app)/projects/[id]/accounting/components/trial-balance-tab";
import { trpc } from "@/lib/trpc-client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import PaymentsPage from "@/app/(app)/projects/[id]/payments/page";
import TaxSummaryPage from "@/app/(app)/projects/[id]/tax-summary/page";
import { OrgInventoryTab } from "@/app/(app)/finance/components/org-inventory-tab";

export const FIN_TABS = [
  { label: "Day Book & Cashbook", key: "accounting" },
  { label: "Parties & Payables", key: "payments" },
  { label: "Reports & Compliance", key: "tax-summary" },
];

export default function OrganizationFinancePage() {
  const [activeMainTab, setActiveMainTab] = useState<"accounting" | "payments" | "tax-summary">("accounting");
  const [subTab, setSubTab] = useState<"daybook" | "ledgers" | "trial_balance">("daybook");
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");

  const { data: projectsData } = trpc.project.list.useQuery();
  const projects = projectsData?.projects || [];

  // Active project ID fallback to first project
  const currentProjectId = selectedProjectId || projects[0]?.id || "";

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
        {projects.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground font-mono">Project:</span>
            <Select value={currentProjectId} onValueChange={setSelectedProjectId}>
              <SelectTrigger className="h-8 text-xs font-mono w-52 bg-[#121820] border-white/10 text-white rounded-lg">
                <SelectValue placeholder="Select Project" />
              </SelectTrigger>
              <SelectContent className="bg-[#0f141c] border-emerald-500/30 text-xs text-white">
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} ({p.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* Empty State when Organization has no projects yet */}
      {projects.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 px-4 text-center bg-[#121820]/30 rounded-2xl border border-dashed border-white/10 my-4 space-y-4">
          <div className="h-12 w-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-400 border border-emerald-500/20 shadow-[0_0_16px_rgba(0,255,102,0.15)]">
            <BookOpen className="h-6 w-6" />
          </div>
          <div className="space-y-1 max-w-sm">
            <h3 className="text-base font-bold text-white">No Projects Created Yet</h3>
            <p className="text-xs text-muted-foreground">
              Accounting ledgers, Day Book vouchers, and cashbooks are scoped to project sites. Create your first project to begin recording daily site transactions.
            </p>
          </div>
          <Link href="/projects">
            <button className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs px-5 py-2.5 rounded-xl transition shadow-[0_0_12px_rgba(0,255,102,0.25)] flex items-center gap-2">
              <span>+ Create First Project</span>
            </button>
          </Link>
        </div>
      )}

      {/* Tab 1: Day Book & Cashbook (renders exactly the project accounting tab views) */}
      {projects.length > 0 && activeMainTab === "accounting" && (
        <div className="space-y-4">
          {/* Compact Sub-Tabs Navigation */}
          <div className="flex items-center justify-between border-b border-white/10 pb-0">
            <div className="flex gap-1">
              <button
                onClick={() => setSubTab("daybook")}
                className={cn(
                  "px-3.5 py-2 text-xs font-semibold border-b-2 transition flex items-center gap-1.5",
                  subTab === "daybook"
                    ? "border-emerald-500 text-emerald-400 font-bold"
                    : "border-transparent text-gray-400 hover:text-white"
                )}
              >
                <BookOpen className="h-3.5 w-3.5 text-emerald-400" />
                Day Book (रोजकट्टी)
              </button>

              <button
                onClick={() => setSubTab("ledgers")}
                className={cn(
                  "px-3.5 py-2 text-xs font-semibold border-b-2 transition flex items-center gap-1.5",
                  subTab === "ledgers"
                    ? "border-emerald-500 text-emerald-400 font-bold"
                    : "border-transparent text-gray-400 hover:text-white"
                )}
              >
                <Users className="h-3.5 w-3.5" />
                Ledger Accounts (खाता सूची)
              </button>

              <button
                onClick={() => setSubTab("trial_balance")}
                className={cn(
                  "px-3.5 py-2 text-xs font-semibold border-b-2 transition flex items-center gap-1.5",
                  subTab === "trial_balance"
                    ? "border-emerald-500 text-emerald-400 font-bold"
                    : "border-transparent text-gray-400 hover:text-white"
                )}
              >
                <Scale className="h-3.5 w-3.5" />
                Trial Balance (वासलात)
              </button>
            </div>
          </div>

          {currentProjectId && (
            <>
              {subTab === "daybook" && <DayBookTab projectId={currentProjectId} />}
              {subTab === "ledgers" && <LedgerAccountsTab projectId={currentProjectId} />}
              {subTab === "trial_balance" && <TrialBalanceTab projectId={currentProjectId} />}
            </>
          )}
        </div>
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
