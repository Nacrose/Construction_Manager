"use client";

import { useState } from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CreditCard,
  BookOpen,
  Users,
  Wallet,
  Building,
  TrendingUp,
  ReceiptText,
  Building2,
  FileSpreadsheet,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { OrgPayablesTab } from "./components/org-payables-tab";
import { OrgDayBookTab } from "./components/org-day-book-tab";
import { OrgPartyStatementTab } from "./components/org-party-statement-tab";
import { OrgBanksTab } from "./components/org-banks-tab";
import { OrgHeadOfficeTab } from "./components/org-head-office-tab";

function fmt(n: number) {
  return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtShort(n: number) {
  if (Math.abs(n) >= 10000000) return `Rs. ${(n / 10000000).toFixed(2)} Cr`;
  if (Math.abs(n) >= 100000) return `Rs. ${(n / 100000).toFixed(2)} L`;
  return `Rs. ${fmt(n)}`;
}

type FinanceTab = "payables" | "day-book" | "statements" | "banks" | "head-office";

const TABS: { key: FinanceTab; label: string; labelNp: string; icon: any }[] = [
  { key: "payables", label: "Consolidated Payables", labelNp: "बाँकी भुक्तानी", icon: CreditCard },
  { key: "day-book", label: "Master Day Book", labelNp: "कम्पनी दैनिक खाता", icon: BookOpen },
  { key: "statements", label: "Party Statements", labelNp: "केन्द्रीय खाता पाना", icon: Users },
  { key: "banks", label: "Bank & Cash Accounts", labelNp: "बैंक तथा नगद", icon: Wallet },
  { key: "head-office", label: "Head Office Expenses", labelNp: "मुख्यालय खर्च", icon: Building },
];

export default function OrganizationFinancePage() {
  const [activeTab, setActiveTab] = useState<FinanceTab>("payables");

  const { data: summary, isLoading } = trpc.finance.orgSummary.useQuery();

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Link href="/dashboard" className="hover:text-foreground">
              Dashboard
            </Link>
            <span>/</span>
            <span>Finance & Accounts</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">
            Organization Financial Desk (कम्पनी केन्द्रीय वित्त तथा लेखा)
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Centralized supplier payables, master day book, company bank accounts & multi-project cheque settlements.
          </p>
        </div>
      </div>

      {/* Top Executive KPI Strip */}
      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {/* Total Liquid Balances */}
          <Card className="shadow-sm border-l-4 border-l-primary bg-card">
            <CardContent className="p-4 space-y-1">
              <div className="text-[10px] font-mono text-muted-foreground uppercase">
                Company Cash & Bank Balance
              </div>
              <div className="text-xl font-bold font-mono text-foreground">
                {fmtShort(summary?.totalCashBankBalance || 0)}
              </div>
              <div className="text-[11px] text-muted-foreground">
                {summary?.bankAccountsCount || 0} active accounts
              </div>
            </CardContent>
          </Card>

          {/* Total Accounts Payable */}
          <Card className="shadow-sm border-l-4 border-l-amber-500 bg-card">
            <CardContent className="p-4 space-y-1">
              <div className="text-[10px] font-mono text-muted-foreground uppercase">
                Total Company Payables (तिर्न बाँकी)
              </div>
              <div className="text-xl font-bold font-mono text-amber-600 dark:text-amber-400">
                {fmtShort(summary?.totalPayables || 0)}
              </div>
              <div className="text-[11px] text-muted-foreground">
                Vendors & subcontractors
              </div>
            </CardContent>
          </Card>

          {/* Client Receivables */}
          <Card className="shadow-sm border-l-4 border-l-blue-500 bg-card">
            <CardContent className="p-4 space-y-1">
              <div className="text-[10px] font-mono text-muted-foreground uppercase">
                Govt Client Receivables (उठ्न बाँकी)
              </div>
              <div className="text-xl font-bold font-mono text-foreground">
                {fmtShort(summary?.totalClientReceivables || 0)}
              </div>
              <div className="text-[11px] text-muted-foreground">
                Certified IPC bills due
              </div>
            </CardContent>
          </Card>

          {/* Active Sites */}
          <Card className="shadow-sm border-l-4 border-l-slate-400 bg-card">
            <CardContent className="p-4 space-y-1">
              <div className="text-[10px] font-mono text-muted-foreground uppercase">
                TDS Withheld (कट्टी भएको कर)
              </div>
              <div className="text-xl font-bold font-mono text-foreground">
                {fmtShort(summary?.totalTdsWithheld || 0)}
              </div>
              <div className="text-[11px] text-muted-foreground">
                1.5% TDS deposited / deducted
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Sub-Navigation Tabs */}
      <div className="flex items-center gap-1.5 border-b overflow-x-auto pb-2">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;

          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                "flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              )}
            >
              <Icon className="h-4 w-4" />
              <span>{tab.label}</span>
              <span className="text-[10px] opacity-75 font-sans">({tab.labelNp})</span>
            </button>
          );
        })}
      </div>

      {/* Tab Panels */}
      {activeTab === "payables" && <OrgPayablesTab />}
      {activeTab === "day-book" && <OrgDayBookTab />}
      {activeTab === "statements" && <OrgPartyStatementTab />}
      {activeTab === "banks" && <OrgBanksTab />}
      {activeTab === "head-office" && <OrgHeadOfficeTab />}
    </div>
  );
}
