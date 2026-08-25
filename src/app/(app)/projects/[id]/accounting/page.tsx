"use client";

import { use, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { ModuleTabs } from "@/components/module-tabs";
import { BookOpen, Scale, Users, Wallet, Receipt, FileSpreadsheet } from "lucide-react";
import { DayBookTab } from "./components/day-book-tab";
import { LedgerAccountsTab } from "./components/ledger-accounts-tab";
import { TrialBalanceTab } from "./components/trial-balance-tab";

const FIN_TABS = [
  { label: "Payments", href: "/payments" },
  { label: "Accounting & Day Book", href: "/accounting" },
  { label: "IPC Certificates", href: "/ipc" },
  { label: "Tax Summary", href: "/tax-summary" },
  { label: "Cash Flow", href: "/cash-flow" },
  { label: "Budget vs Actual", href: "/budget-variance" },
];

export default function AccountingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [tab, setTab] = useState<"daybook" | "ledgers" | "trial_balance">("daybook");

  return (
    <>
      <ModuleTabs projectId={id} tabs={FIN_TABS} />
      <div className="space-y-6 pb-8">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Link href={`/projects/${id}`} className="hover:text-foreground">
              Project
            </Link>
            <span>/</span>
            <span>Accounting & Day Book</span>
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            Native Accounting & Ledger Statements
          </h1>
          <p className="text-sm text-muted-foreground">
            Tally & Swastik-compatible Day Book, party statements of account, and real-time trial balance.
          </p>
        </div>

        {/* Sub-Tabs Navigation */}
        <div className="flex gap-2 border-b">
          <button
            onClick={() => setTab("daybook")}
            className={cn(
              "px-4 py-2 text-sm font-medium border-b-2 transition flex items-center gap-1.5",
              tab === "daybook"
                ? "border-emerald-500 text-emerald-700 dark:text-emerald-400 font-bold"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <BookOpen className="h-3.5 w-3.5 text-emerald-500" />
            Day Book (दैनिक खाता / रोजकट्टी)
          </button>

          <button
            onClick={() => setTab("ledgers")}
            className={cn(
              "px-4 py-2 text-sm font-medium border-b-2 transition flex items-center gap-1.5",
              tab === "ledgers"
                ? "border-indigo-500 text-indigo-700 dark:text-indigo-400 font-bold"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <Users className="h-3.5 w-3.5 text-indigo-500" />
            Ledger Accounts (खाता पाना)
          </button>

          <button
            onClick={() => setTab("trial_balance")}
            className={cn(
              "px-4 py-2 text-sm font-medium border-b-2 transition flex items-center gap-1.5",
              tab === "trial_balance"
                ? "border-amber-500 text-amber-700 dark:text-amber-400 font-bold"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <Scale className="h-3.5 w-3.5 text-amber-500" />
            Trial Balance (सन्तुलन परीक्षण)
          </button>
        </div>

        {tab === "daybook" && <DayBookTab projectId={id} />}
        {tab === "ledgers" && <LedgerAccountsTab projectId={id} />}
        {tab === "trial_balance" && <TrialBalanceTab projectId={id} />}
      </div>
    </>
  );
}
