"use client";

import { use } from "react";
import { ModuleTabs } from "@/components/module-tabs";
import { DayBookTab } from "./components/day-book-tab";

const FIN_TABS = [
  { label: "Day Book & Cashbook", href: "/accounting" },
  { label: "Parties & Payables", href: "/payments" },
  { label: "Reports & Compliance", href: "/tax-summary" },
];

export default function AccountingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  return (
    <>
      <ModuleTabs projectId={id} tabs={FIN_TABS} />
      <div className="space-y-4 pb-8">
        <DayBookTab projectId={id} />
      </div>
    </>
  );
}
