"use client";
import { use, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { ModuleTabs } from "@/components/module-tabs";
import { Lock, Clock, AlertCircle, Receipt } from "lucide-react";
import { trpc } from "@/lib/trpc-client";
import { PaymentsTab } from "./components/payments-tab";
import { RetentionTab } from "./components/retention-tab";
import { AgingTab } from "./components/aging-tab";
import { OutstandingPayablesTab } from "./components/outstanding-payables-tab";
import { Badge } from "@/components/ui/badge";

const FIN_TABS = [
  { label: "Payments", href: "/payments" },
  { label: "Accounting & Day Book", href: "/accounting" },
  { label: "IPC Certificates", href: "/ipc" },
  { label: "Tax Summary", href: "/tax-summary" },
  { label: "Cash Flow", href: "/cash-flow" },
  { label: "Budget vs Actual", href: "/budget-variance" },
];

export default function PaymentsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [tab, setTab] = useState<"payables" | "payments" | "retention" | "aging">("payables");
  const [payableToSettle, setPayableToSettle] = useState<any | null>(null);

  const { data: payablesData } = trpc.projectOps.payment.outstandingPayables.useQuery({ projectId: id });
  const pendingCount = payablesData?.summary?.totalCount ?? 0;

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
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Payment & Payables Tracking</h1>
          <p className="text-sm text-muted-foreground">
            Manage vendor & subcontractor payables, record disbursements, and track tax deductions.
          </p>
        </div>

        {/* Tabs Navigation */}
        <div className="flex gap-2 border-b">
          <button
            onClick={() => setTab("payables")}
            className={cn(
              "px-4 py-2 text-sm font-medium border-b-2 transition flex items-center gap-2",
              tab === "payables"
                ? "border-red-500 text-red-700 dark:text-red-400 font-bold"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <AlertCircle className="h-3.5 w-3.5 text-red-500" />
            Outstanding Payables (तिर्न बाँकी)
            {pendingCount > 0 && (
              <Badge variant="destructive" className="h-4.5 px-1.5 text-[10px] font-mono">
                {pendingCount}
              </Badge>
            )}
          </button>

          <button
            onClick={() => setTab("payments")}
            className={cn(
              "px-4 py-2 text-sm font-medium border-b-2 transition flex items-center gap-1.5",
              tab === "payments"
                ? "border-amber-500 text-amber-700 dark:text-amber-400 font-bold"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <Receipt className="h-3.5 w-3.5 text-amber-500" />
            Disbursement Ledger (भुक्तानी खाता)
          </button>

          <button
            onClick={() => setTab("retention")}
            className={cn(
              "px-4 py-2 text-sm font-medium border-b-2 transition flex items-center gap-1.5",
              tab === "retention"
                ? "border-amber-500 text-amber-700 dark:text-amber-400 font-bold"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <Lock className="h-3.5 w-3.5" />
            Retention
          </button>

          <button
            onClick={() => setTab("aging")}
            className={cn(
              "px-4 py-2 text-sm font-medium border-b-2 transition flex items-center gap-1.5",
              tab === "aging"
                ? "border-amber-500 text-amber-700 dark:text-amber-400 font-bold"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <Clock className="h-3.5 w-3.5" />
            Aging Report
          </button>
        </div>

        {tab === "payables" && (
          <OutstandingPayablesTab
            projectId={id}
            onPayNow={(payable) => {
              setPayableToSettle(payable);
              setTab("payments");
            }}
          />
        )}

        {tab === "payments" && (
          <PaymentsTab
            projectId={id}
            initialPayable={payableToSettle}
            onClearInitialPayable={() => setPayableToSettle(null)}
          />
        )}

        {tab === "retention" && <RetentionTab projectId={id} />}
        {tab === "aging" && <AgingTab projectId={id} />}
      </div>
    </>
  );
}

