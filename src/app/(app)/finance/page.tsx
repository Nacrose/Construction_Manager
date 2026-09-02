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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export default function OrganizationFinancePage() {
  const [activeMainTab, setActiveMainTab] = useState<string>("accounting");
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");

  const { data: projectsData } = trpc.project.list.useQuery();
  const projects = projectsData?.projects || [];

  const projectSpecificId = selectedProjectId || (projects.length > 0 ? projects[0]?.id : "");

  return (
    <div className="space-y-2 pb-6">
      {/* 1. THE ONLY TAB BAR FOR NAVIGATION (Adobe Segmented Card Dock as First Element) */}
      <Tabs value={activeMainTab} onValueChange={setActiveMainTab} className="w-full">
        <div className="w-full level-1-dock p-0.5 rounded-lg flex items-center justify-between gap-1 mb-2">
          <TabsList className="w-full border-0 bg-transparent p-0 flex items-center gap-1">
            
            {/* Tab 1: Day Book & Cashbook */}
            <TabsTrigger value="accounting" className="flex-1 py-1 px-2.5 text-center text-xs flex items-center justify-center gap-1.5">
              <svg className="aero-icon-sm" viewBox="0 0 24 24" fill="none">
                <path d="M4 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" fill="url(#finBookGrad)" stroke="#b45309" stroke-width="1.2"/>
                <path d="M3 5v16a1 1 0 0 0 1 1h2V4H4a1 1 0 0 0-1 1z" fill="#d97706"/>
                <path d="M12 4v7l2-1.5 2 1.5V4h-4z" fill="#facc15" stroke="#ca8a04" stroke-width="0.8"/>
                <defs>
                  <linearGradient id="finBookGrad" x1="3" y1="4" x2="20" y2="22" gradientUnits="userSpaceOnUse">
                    <stop stop-color="#38bdf8"/>
                    <stop offset="1" stop-color="#d97706"/>
                  </linearGradient>
                </defs>
              </svg>
              <span>Day Book & Cashbook</span>
            </TabsTrigger>

            <div className="w-[1px] h-3.5 bg-[var(--navy-mid)]/10 shrink-0"></div>

            {/* Tab 2: Bank Accounts & OD */}
            <TabsTrigger value="bank-accounts" className="flex-1 py-1 px-2.5 text-center text-xs flex items-center justify-center gap-1.5">
              <svg className="aero-icon-sm" viewBox="0 0 24 24" fill="none">
                <polygon points="12,3 21,8 3,8" fill="url(#finBankRoofGrad)" stroke="#1e3a8a" stroke-width="1"/>
                <rect x="2" y="19" width="20" height="3" rx="0.5" fill="#f59e0b" stroke="#b45309" stroke-width="1"/>
                <rect x="4.5" y="8" width="2" height="11" fill="url(#finPillarGrad)" stroke="#1d4ed8" stroke-width="0.8"/>
                <rect x="9" y="8" width="2" height="11" fill="url(#finPillarGrad)" stroke="#1d4ed8" stroke-width="0.8"/>
                <rect x="13" y="8" width="2" height="11" fill="url(#finPillarGrad)" stroke="#1d4ed8" stroke-width="0.8"/>
                <rect x="17.5" y="8" width="2" height="11" fill="url(#finPillarGrad)" stroke="#1d4ed8" stroke-width="0.8"/>
                <defs>
                  <linearGradient id="finBankRoofGrad" x1="12" y1="3" x2="12" y2="8" gradientUnits="userSpaceOnUse">
                    <stop stop-color="#60a5fa"/>
                    <stop offset="1" stop-color="#1d4ed8"/>
                  </linearGradient>
                  <linearGradient id="finPillarGrad" x1="0" y1="8" x2="0" y2="19" gradientUnits="userSpaceOnUse">
                    <stop stop-color="#dbeafe"/>
                    <stop offset="1" stop-color="#93c5fd"/>
                  </linearGradient>
                </defs>
              </svg>
              <span>Bank Accounts & OD</span>
            </TabsTrigger>

            <div className="w-[1px] h-3.5 bg-[var(--navy-mid)]/10 shrink-0"></div>

            {/* Tab 3: Guarantees & Bid Bonds */}
            <TabsTrigger value="guarantees" className="flex-1 py-1 px-2.5 text-center text-xs flex items-center justify-center gap-1.5">
              <svg className="aero-icon-sm" viewBox="0 0 24 24" fill="none">
                <rect x="4" y="3" width="16" height="18" rx="2" fill="url(#finCertGrad)" stroke="#b45309" stroke-width="1.2"/>
                <circle cx="16" cy="16" r="3" fill="url(#finSealGrad)" stroke="#991b1b" stroke-width="0.8"/>
                <defs>
                  <linearGradient id="finCertGrad" x1="4" y1="3" x2="20" y2="21" gradientUnits="userSpaceOnUse">
                    <stop stop-color="#fef3c7"/>
                    <stop offset="1" stop-color="#fde68a"/>
                  </linearGradient>
                  <linearGradient id="finSealGrad" x1="16" y1="13" x2="16" y2="19" gradientUnits="userSpaceOnUse">
                    <stop stop-color="#ef4444"/>
                    <stop offset="1" stop-color="#b91c1c"/>
                  </linearGradient>
                </defs>
              </svg>
              <span>Guarantees & Bid Bonds</span>
            </TabsTrigger>

            <div className="w-[1px] h-3.5 bg-[var(--navy-mid)]/10 shrink-0"></div>

            {/* Tab 4: Parties & Payables */}
            <TabsTrigger value="payments" className="flex-1 py-1 px-2.5 text-center text-xs flex items-center justify-center gap-1.5">
              <svg className="aero-icon-sm" viewBox="0 0 24 24" fill="none">
                <rect x="3" y="6" width="18" height="14" rx="3" fill="url(#finPayGrad)" stroke="#b45309" stroke-width="1.2"/>
                <circle cx="12" cy="13" r="2.5" fill="#facc15" stroke="#b45309" stroke-width="0.8"/>
                <defs>
                  <linearGradient id="finPayGrad" x1="3" y1="6" x2="21" y2="20" gradientUnits="userSpaceOnUse">
                    <stop stop-color="#38bdf8"/>
                    <stop offset="1" stop-color="#d97706"/>
                  </linearGradient>
                </defs>
              </svg>
              <span>Parties & Payables</span>
            </TabsTrigger>

            <div className="w-[1px] h-3.5 bg-[var(--navy-mid)]/10 shrink-0"></div>

            {/* Tab 5: JV Commissions */}
            <TabsTrigger value="jv-commission" className="flex-1 py-1 px-2.5 text-center text-xs flex items-center justify-center gap-1.5">
              <svg className="aero-icon-sm" viewBox="0 0 24 24" fill="none">
                <rect x="4" y="5" width="16" height="15" rx="2" fill="url(#finJvGrad)" stroke="#7c3aed" stroke-width="1.2"/>
                <circle cx="9" cy="11" r="2" fill="#ffffff"/>
                <circle cx="15" cy="11" r="2" fill="#ffffff"/>
                <defs>
                  <linearGradient id="finJvGrad" x1="4" y1="5" x2="20" y2="20" gradientUnits="userSpaceOnUse">
                    <stop stop-color="#a78bfa"/>
                    <stop offset="1" stop-color="#7c3aed"/>
                  </linearGradient>
                </defs>
              </svg>
              <span>JV Commissions</span>
            </TabsTrigger>

            <div className="w-[1px] h-3.5 bg-[var(--navy-mid)]/10 shrink-0"></div>

            {/* Tab 6: Reports & Compliance */}
            <TabsTrigger value="tax-summary" className="flex-1 py-1 px-2.5 text-center text-xs flex items-center justify-center gap-1.5">
              <svg className="aero-icon-sm" viewBox="0 0 24 24" fill="none">
                <path d="M4 3h16v18l-2.5-1.5-2.5 1.5-3-1.5-3 1.5-2.5-1.5L4 21V3z" fill="url(#finTaxGrad)" stroke="#475569" stroke-width="1.2"/>
                <rect x="11" y="12" width="6" height="3" rx="0.5" fill="#fee2e2" stroke="#dc2626" stroke-width="0.8"/>
                <defs>
                  <linearGradient id="finTaxGrad" x1="4" y1="3" x2="20" y2="21" gradientUnits="userSpaceOnUse">
                    <stop stop-color="#ffffff"/>
                    <stop offset="1" stop-color="#e2e8f0"/>
                  </linearGradient>
                </defs>
              </svg>
              <span>Reports & Compliance</span>
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Tab 1: Day Book & Cashbook */}
        <TabsContent value="accounting" className="outline-none m-0">
          <DayBookTab projectId={selectedProjectId || undefined} />
        </TabsContent>

        {/* Tab 2: Bank Accounts & Wallets */}
        <TabsContent value="bank-accounts" className="outline-none m-0">
          <OrgBankAccountsTab />
        </TabsContent>

        {/* Tab 3: Bank Guarantees & Bid Bonds */}
        <TabsContent value="guarantees" className="outline-none m-0">
          <OrgGuaranteesTab />
        </TabsContent>

        {/* Tab 4: Parties & Payables */}
        <TabsContent value="payments" className="outline-none m-0">
          {projects.length > 0 && projectSpecificId ? (
            <PaymentsPage params={Promise.resolve({ id: projectSpecificId })} />
          ) : (
            <div className="p-8 text-center bg-card rounded-xl border border-border text-xs text-muted-foreground">
              Select an active project site from the dropdown to view party ledgers and payables.
            </div>
          )}
        </TabsContent>

        {/* Tab 5: JV Partner Commissions */}
        <TabsContent value="jv-commission" className="outline-none m-0">
          {projectSpecificId ? (
            <ProjectJvTab projectId={projectSpecificId} />
          ) : (
            <div className="p-8 text-center bg-card rounded-xl border border-border text-xs text-muted-foreground">
              Select an active project site from the dropdown to view JV partner commission agreements.
            </div>
          )}
        </TabsContent>

        {/* Tab 6: Reports & Compliance */}
        <TabsContent value="tax-summary" className="outline-none m-0">
          {projects.length > 0 && projectSpecificId ? (
            <TaxSummaryPage params={Promise.resolve({ id: projectSpecificId })} />
          ) : (
            <div className="p-8 text-center bg-card rounded-xl border border-border text-xs text-muted-foreground">
              Select an active project site from the dropdown to view VAT and TDS tax reports.
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
