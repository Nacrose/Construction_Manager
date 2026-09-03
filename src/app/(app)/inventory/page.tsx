"use client";

import { OrgInventoryTab } from "@/app/(app)/finance/components/org-inventory-tab";

export default function OrganizationInventoryPage() {
  return (
    <div className="space-y-3 pb-8">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border/75 pb-2">
        <div>
          <h1 className="text-sm font-semibold text-foreground">Inventory</h1>
          <p className="mt-0.5 text-[9px] font-mono uppercase tracking-[0.1em] text-muted-foreground">Cross-project stock matrix and replenishment view</p>
        </div>
      </header>

      {/* Multi-Project Comparative Stock Matrix Component */}
      <OrgInventoryTab />
    </div>
  );
}
