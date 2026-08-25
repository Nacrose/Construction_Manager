"use client";

import { use, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { ModuleTabs } from "@/components/module-tabs";
import { BookOpen, Scale, Users, Wallet, Receipt, FileSpreadsheet } from "lucide-react";
import { DayBookTab } from "./components/day-book-tab";
import { LedgerAccountsTab } from "./components/ledger-accounts-tab";
import { TrialBalanceTab } from "./components/trial-balance-tab";

export const FIN_TABS = [
  { label: "Day Book & Cashbook", href: "/accounting" },
  { label: "Parties & Payables", href: "/payments" },
  { label: "Reports & Compliance", href: "/tax-summary" },
];

export default function AccountingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [tab, setTab] = useState<"daybook" | "ledgers" | "trial_balance">("daybook");

  return (
    <>
      <ModuleTabs projectId={id} tabs={FIN_TABS} />
      <div className="space-y-4 pb-8">
        {/* Compact Sub-Tabs Navigation */}
        <div className="flex items-center justify-between border-b border-white/10 pb-0">
          <div className="flex gap-1">
            <button
              onClick={() => setTab("daybook")}
              className={cn(
                "px-3.5 py-2 text-xs font-semibold border-b-2 transition flex items-center gap-1.5",
                tab === "daybook"
                  ? "border-emerald-500 text-emerald-400 font-bold"
                  : "border-transparent text-gray-400 hover:text-white"
              )}
            >
              <BookOpen className="h-3.5 w-3.5 text-emerald-400" />
              Day Book (रोजकट्टी)
            </button>

            <button
              onClick={() => setTab("ledgers")}
              className={cn(
                "px-3.5 py-2 text-xs font-semibold border-b-2 transition flex items-center gap-1.5",
                tab === "ledgers"
                  ? "border-emerald-500 text-emerald-400 font-bold"
                  : "border-transparent text-gray-400 hover:text-white"
              )}
            >
              <Users className="h-3.5 w-3.5" />
              Ledger Accounts (खाता सूची)
            </button>

            <button
              onClick={() => setTab("trial_balance")}
              className={cn(
                "px-3.5 py-2 text-xs font-semibold border-b-2 transition flex items-center gap-1.5",
                tab === "trial_balance"
                  ? "border-emerald-500 text-emerald-400 font-bold"
                  : "border-transparent text-gray-400 hover:text-white"
              )}
            >
              <Scale className="h-3.5 w-3.5" />
              Trial Balance (वासलात)
            </button>
          </div>
        </div>

        {tab === "daybook" && <DayBookTab projectId={id} />}
        {tab === "ledgers" && <LedgerAccountsTab projectId={id} />}
        {tab === "trial_balance" && <TrialBalanceTab projectId={id} />}
      </div>
    </>
  );
}
