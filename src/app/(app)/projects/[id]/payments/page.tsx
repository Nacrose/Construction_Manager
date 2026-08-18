"use client";
import { use, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { ModuleTabs } from "@/components/module-tabs";
import { Lock, Clock } from "lucide-react";
import { PaymentsTab } from "./components/payments-tab";
import { RetentionTab } from "./components/retention-tab";
import { AgingTab } from "./components/aging-tab";

const FIN_TABS = [
  { label: "Payments", href: "/payments" },
  { label: "IPC Certificates", href: "/ipc" },
  { label: "Tax Summary", href: "/tax-summary" },
  { label: "Cash Flow", href: "/cash-flow" },
  { label: "Budget vs Actual", href: "/budget-variance" },
];

export default function PaymentsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [tab, setTab] = useState<"payments" | "retention" | "aging">("payments");

  return (
    <>
      <ModuleTabs projectId={id} tabs={FIN_TABS} />
      <div className="space-y-6 pb-8">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Link href={`/projects/${id}`} className="hover:text-foreground">Project</Link>
            <span>/</span>
            <span>Payments</span>
          </div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Payment Tracking</h1>
        <p className="text-sm text-muted-foreground">
          Track payments, retention releases, and outstanding IPCs.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b">
        <button
          onClick={() => setTab("payments")}
          className={cn(
            "px-4 py-2 text-sm font-medium border-b-2 transition",
            tab === "payments" ? "border-amber-500 text-amber-700 dark:text-amber-400" : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          Payments
        </button>
        <button
          onClick={() => setTab("retention")}
          className={cn(
            "px-4 py-2 text-sm font-medium border-b-2 transition",
            tab === "retention" ? "border-amber-500 text-amber-700 dark:text-amber-400" : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          <Lock className="inline h-3.5 w-3.5 mr-1" />
          Retention
        </button>
        <button
          onClick={() => setTab("aging")}
          className={cn(
            "px-4 py-2 text-sm font-medium border-b-2 transition",
            tab === "aging" ? "border-amber-500 text-amber-700 dark:text-amber-400" : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          <Clock className="inline h-3.5 w-3.5 mr-1" />
          Aging Report
        </button>
      </div>

        {tab === "payments" && <PaymentsTab projectId={id} />}
        {tab === "retention" && <RetentionTab projectId={id} />}
        {tab === "aging" && <AgingTab projectId={id} />}
      </div>
    </>
  );
}
