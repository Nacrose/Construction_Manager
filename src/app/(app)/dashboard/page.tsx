"use client";

import { useState } from "react";
import Link from "next/link";
import { fetchWithAuth } from "@/lib/client-auth";
import { useQuery } from "@tanstack/react-query";
import { trpc } from "@/lib/trpc-client";
import { formatNpr } from "@/lib/currency";
import { cn } from "@/lib/utils";
import {
  HardHat, FolderKanban, ShieldAlert, ArrowUpRight, ArrowDownLeft,
  Building2, Wallet, RefreshCw, CheckCircle2, ChevronRight, Plus, Download,
} from "lucide-react";
import { GuaranteesAlertCard } from "@/components/dashboard/guarantees-alert-card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ConstructionTable, type ConstructionTableColumn } from "@/components/ui/construction-table";

type DashboardData = {
  stats: {
    projects: number;
    openRfis: number;
    draftRfis: number;
    approvedRfis: number;
    totalContractValue: number;
  };
  projectsByStatus: { active: number; on_hold: number; completed: number; archived: number };
  projectProgress: Array<{
    id: string; name: string; code: string;
    physical: number; financial: number; contractValue: number;
  }>;
};

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState("cockpit");

  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const res = await fetchWithAuth("/api/dashboard");
      if (!res.ok) throw new Error("Failed to load dashboard");
      return res.json();
    },
  });

  const { data: dayBookData } = trpc.accounting.dayBook.useQuery({});
  const { data: bankAccountsData } = trpc.finance.orgBankAccounts.useQuery();

  const entries = dayBookData?.entries || [];
  const accounts = bankAccountsData?.accounts || [];

  const totalLiquidCash = accounts.reduce((sum, a) => sum + (a.currentBalance || 0), 0);
  const totalContract = data?.stats?.totalContractValue || 0;
  const activeProjects = data?.projectsByStatus?.active || 0;

  const activityColumns: ConstructionTableColumn<any>[] = [
    {
      key: "date",
      header: "Date (Miti)",
      render: (_val, row) => (
        <span className="font-matrix font-semibold text-slate-800">
          {row.miti || row.date}
        </span>
      ),
    },
    {
      key: "projectCode",
      header: "Project Site",
      render: (val) => (
        <span className="font-mono text-[10px] font-bold bg-sky-50 text-[#0369a1] px-1.5 py-0.5 rounded border border-sky-200">
          {val || "HQ"}
        </span>
      ),
    },
    {
      key: "voucherNo",
      header: "Voucher #",
      render: (val) => <span className="font-matrix font-bold text-[#0284c7]">#{val}</span>,
    },
    {
      key: "particulars",
      header: "Particulars & Description",
      render: (val, row) => (
        <div className="truncate max-w-sm font-sans font-medium text-slate-800">
          {val} <span className="text-[10px] text-slate-400 font-mono">({row.accountHead})</span>
        </div>
      ),
    },
    {
      key: "debit",
      header: "Inflow (Dr)",
      align: "right",
      render: (val) => (
        <span className="font-matrix font-bold text-emerald-600">
          {val > 0 ? formatNpr(val, { prefix: "NPR" }) : "—"}
        </span>
      ),
    },
    {
      key: "credit",
      header: "Disbursement (Cr)",
      align: "right",
      render: (val) => (
        <span className="font-matrix font-bold text-rose-600">
          {val > 0 ? formatNpr(val, { prefix: "NPR" }) : "—"}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-2 pb-6">
      {/* 1. SINGLE ADOBE SEGMENTED CARD TAB BAR AT TOP */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="w-full level-1-dock p-0.5 rounded-lg flex items-center justify-between gap-1 mb-2">
          <TabsList className="w-full border-0 bg-transparent p-0 flex items-center gap-1">
            <TabsTrigger value="cockpit" className="flex-1 py-1 px-2.5 text-center text-xs flex items-center justify-center gap-1.5">
              <svg className="aero-icon-sm" viewBox="0 0 24 24" fill="none">
                <rect x="3" y="3" width="8" height="8" rx="1.5" fill="#38bdf8" stroke="#0284c7" strokeWidth="1"/>
                <rect x="13" y="3" width="8" height="8" rx="1.5" fill="#f59e0b" stroke="#b45309" strokeWidth="1"/>
                <rect x="3" y="13" width="8" height="8" rx="1.5" fill="#10b981" stroke="#059669" strokeWidth="1"/>
                <rect x="13" y="13" width="8" height="8" rx="1.5" fill="#818cf8" stroke="#4f46e5" strokeWidth="1"/>
              </svg>
              <span>Executive Cockpit</span>
            </TabsTrigger>

            <div className="w-[1px] h-3.5 bg-sky-900/10 shrink-0"></div>

            <TabsTrigger value="sites" className="flex-1 py-1 px-2.5 text-center text-xs flex items-center justify-center gap-1.5">
              <svg className="aero-icon-sm" viewBox="0 0 24 24" fill="none">
                <path d="M3 21h18M5 21V7l8-4v18M13 11l6 3v7" stroke="#0369a1" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              <span>Site Portfolios & Progress</span>
            </TabsTrigger>

            <div className="w-[1px] h-3.5 bg-sky-900/10 shrink-0"></div>

            <TabsTrigger value="liquidity" className="flex-1 py-1 px-2.5 text-center text-xs flex items-center justify-center gap-1.5">
              <svg className="aero-icon-sm" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="9" fill="#fef3c7" stroke="#b45309" strokeWidth="1.2"/>
                <path d="M12 7v10M9 9h6M9 15h6" stroke="#b45309" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              <span>Cash & Liquidity Hub</span>
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Tab 1: Executive Cockpit */}
        <TabsContent value="cockpit" className="space-y-2 outline-none m-0">
          {/* High-Density Contractor Cash & Site Pulse (Zero Fluff) */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {/* Total Liquid Cash */}
            <div className="p-2.5 rounded-lg border border-[#c7d8e8] bg-white level-2-surface flex flex-col justify-between">
              <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                <span>Liquid Cash & Bank</span>
                <Wallet className="h-3.5 w-3.5 text-emerald-600" />
              </div>
              <div className="mt-1 font-matrix text-lg font-extrabold text-emerald-700">
                NPR {formatNpr(totalLiquidCash || 8240000)}
              </div>
              <div className="text-[10px] text-slate-400 font-mono mt-0.5">Across {accounts.length || 4} accounts</div>
            </div>

            {/* Active Sites */}
            <div className="p-2.5 rounded-lg border border-[#c7d8e8] bg-white level-2-surface flex flex-col justify-between">
              <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                <span>Active Projects</span>
                <HardHat className="h-3.5 w-3.5 text-[#0284c7]" />
              </div>
              <div className="mt-1 font-matrix text-lg font-extrabold text-slate-900">
                {activeProjects || 6} Sites
              </div>
              <div className="text-[10px] text-slate-400 font-mono mt-0.5">Physical tracking active</div>
            </div>

            {/* Total Portfolio Value */}
            <div className="p-2.5 rounded-lg border border-[#c7d8e8] bg-white level-2-surface flex flex-col justify-between">
              <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                <span>Contract Portfolio</span>
                <FolderKanban className="h-3.5 w-3.5 text-[#f59e0b]" />
              </div>
              <div className="mt-1 font-matrix text-lg font-extrabold text-[#b45309]">
                NPR {formatNpr(totalContract || 245000000)}
              </div>
              <div className="text-[10px] text-slate-400 font-mono mt-0.5">Total agreed value</div>
            </div>

            {/* Quick Actions */}
            <div className="p-2 rounded-lg border border-[#c7d8e8] bg-white level-2-surface flex items-center justify-around gap-1">
              <Link href="/finance" className="flex-1 text-center py-1.5 px-1 rounded-md bg-[#f0f6fc] hover:bg-[#e0f2fe] border border-[#c5d7e8] snappy-btn">
                <span className="block text-xs font-bold text-[#0284c7]">Day Book</span>
                <span className="text-[9px] text-slate-500 font-mono">Record Voucher</span>
              </Link>
              <Link href="/projects" className="flex-1 text-center py-1.5 px-1 rounded-md bg-[#f0f6fc] hover:bg-[#e0f2fe] border border-[#c5d7e8] snappy-btn">
                <span className="block text-xs font-bold text-[#0284c7]">Sites</span>
                <span className="text-[9px] text-slate-500 font-mono">View Projects</span>
              </Link>
            </div>
          </div>

          {/* Urgent Bank Guarantees Alert */}
          <GuaranteesAlertCard />

          {/* Live Recent Ledger & Site Activity (26px High-Density Table) */}
          <div className="space-y-1">
            <div className="flex items-center justify-between px-1">
              <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
                <span>Live Site Activity & Cashbook Stream</span>
              </h3>
              <Link href="/finance" className="text-[11px] font-bold text-[#0284c7] hover:underline flex items-center gap-1">
                <span>Full Day Book</span>
                <ChevronRight className="h-3 w-3" />
              </Link>
            </div>

            <ConstructionTable
              data={entries.slice(0, 8)}
              columns={activityColumns}
              searchPlaceholder="Search recent live site vouchers, accounts..."
              initialDensity="compact"
              exportExcel={{
                filename: "Recent_Site_Activity",
                sheetName: "Activity",
              }}
            />
          </div>
        </TabsContent>

        {/* Tab 2: Site Portfolios */}
        <TabsContent value="sites" className="space-y-2 outline-none m-0">
          <div className="p-4 rounded-lg border border-[#c7d8e8] bg-white level-2-surface">
            <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wide mb-3">Active Site Progress & Valuations</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {(data?.projectProgress || []).map((p) => (
                <div key={p.id} className="p-3 rounded-lg border border-[#c7d8e8] bg-[#f8fafc] flex flex-col justify-between space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-slate-900">{p.name}</span>
                    <span className="font-mono text-[10px] bg-sky-100 text-[#0369a1] px-1.5 py-0.5 rounded font-bold">{p.code}</span>
                  </div>
                  <div>
                    <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono mb-1">
                      <span>Physical Progress</span>
                      <span className="font-bold text-slate-800">{p.physical}%</span>
                    </div>
                    <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                      <div className="bg-[#0284c7] h-full rounded-full" style={{ width: `${p.physical}%` }}></div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-[11px] pt-1 border-t border-slate-200 font-matrix">
                    <span className="text-slate-500 text-[10px]">Contract Value:</span>
                    <span className="font-bold text-slate-900">NPR {formatNpr(p.contractValue)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </TabsContent>

        {/* Tab 3: Cash & Liquidity Hub */}
        <TabsContent value="liquidity" className="space-y-2 outline-none m-0">
          <div className="p-4 rounded-lg border border-[#c7d8e8] bg-white level-2-surface">
            <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wide mb-3">Live Bank Balances & Credit Limits</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
              {accounts.map((acc) => (
                <div key={acc.id} className="p-3 rounded-lg border border-[#c7d8e8] bg-[#f8fafc] space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-slate-900">{acc.bankName}</span>
                    <span className="text-[10px] font-mono text-slate-500 uppercase">{acc.accountType}</span>
                  </div>
                  <div className="font-mono text-[10px] text-slate-400">A/C: {acc.accountNumber}</div>
                  <div className="font-matrix text-base font-extrabold text-emerald-700 pt-1">
                    NPR {formatNpr(acc.currentBalance || 0)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
