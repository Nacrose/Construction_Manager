"use client";

import { OrgInventoryTab } from "@/app/(app)/finance/components/org-inventory-tab";

export default function OrganizationInventoryPage() {
  return (
    <div className="space-y-4 pb-8">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            Multi-Project Inventory Matrix
            <span className="text-xs font-normal text-[#0284c7] font-mono bg-sky-50 px-2.5 py-0.5 rounded-full border border-[#bae6fd]">
              सम्पूर्ण प्रोजेक्ट मौज्दात तुलना
            </span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Real-time material stock balances, landed valuations, and deliveries across all company project sites.
          </p>
        </div>
      </div>

      {/* Multi-Project Comparative Stock Matrix Component */}
      <OrgInventoryTab />
    </div>
  );
}
