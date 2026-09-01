"use client";

import { use } from "react";
import { ModuleTabs } from "@/components/module-tabs";
import { DayBookTab } from "./components/day-book-tab";


export default function AccountingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  return (
    <>
      <ModuleTabs projectId={id} cluster="finance-compact" />
      <div className="space-y-4 pb-8">
        <DayBookTab projectId={id} />
      </div>
    </>
  );
}
