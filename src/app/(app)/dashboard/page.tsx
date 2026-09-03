"use client";

import { useState } from "react";
import Link from "next/link";
import { fetchWithAuth } from "@/lib/client-auth";
import { useQuery } from "@tanstack/react-query";
import { trpc } from "@/lib/trpc-client";
import { formatNpr } from "@/lib/currency";
import {
  HardHat, FolderKanban, Wallet, ChevronRight, Plus,
} from "lucide-react";
import { GuaranteesAlertCard } from "@/components/dashboard/guarantees-alert-card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ConstructionTable, type ConstructionTableColumn } from "@/components/ui/construction-table";
import { CockpitSkeleton } from "@/components/ui/matrix-skeleton";
import { AnimatedCounter, StaggerContainer, StaggerItem } from "@/components/ui/motion";

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
        <span className="font-matrix font-semibold text-foreground/90">
          {row.miti || row.date}
        </span>
      ),
    },
    {
      key: "projectCode",
      header: "Project Site",
      render: (val) => (
        <span className="font-mono text-[10px] font-bold bg-info/10 text-[var(--primary)] px-1.5 py-0.5 rounded border border-info/30">
          {val || "HQ"}
        </span>
      ),
    },
    {
      key: "voucherNo",
      header: "Voucher #",
      render: (val) => <span className="font-matrix font-bold text-[var(--primary)]">#{val}</span>,
    },
    {
      key: "particulars",
      header: "Particulars & Description",
      render: (val, row) => (
        <div className="truncate max-w-sm font-sans font-medium text-foreground/90">
          {val} <span className="text-[10px] text-muted-foreground/80 font-mono">({row.accountHead})</span>
        </div>
      ),
    },
    {
      key: "debit",
      header: "Inflow (Dr)",
      align: "right",
      render: (val) => (
        <span className="font-matrix font-bold text-success">
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

  if (isLoading) {
    return (
      <div className="space-y-2 pb-6">
        <CockpitSkeleton />
      </div>
    );
  }

  return (
    <div className="space-y-2 pb-6">
      {/* 1. SINGLE ADOBE SEGMENTED CARD TAB BAR AT TOP */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="w-full level-1-dock p-0.5 rounded-lg flex items-center justify-between gap-1 mb-2">
          <TabsList className="w-full border-0 bg-transparent p-0 flex items-center gap-1">
            <TabsTrigger value="cockpit" className="flex-1 py-1 px-2.5 text-center text-xs flex items-center justify-center gap-1.5">
              <svg className="aero-icon-sm" viewBox="0 0 24 24" fill="none">
                <rect x="3" y="3" width="8" height="8" rx="1.5" fill="#38bdf8" stroke="#d97706" strokeWidth="1"/>
                <rect x="13" y="3" width="8" height="8" rx="1.5" fill="#f59e0b" stroke="#b45309" strokeWidth="1"/>
                <rect x="3" y="13" width="8" height="8" rx="1.5" fill="#4a8b57" stroke="#4a8b57" strokeWidth="1"/>
                <rect x="13" y="13" width="8" height="8" rx="1.5" fill="#818cf8" stroke="#4f46e5" strokeWidth="1"/>
              </svg>
              <span>Executive Cockpit</span>
            </TabsTrigger>

            <div className="w-[1px] h-3.5 bg-[var(--navy-mid)]/10 shrink-0"></div>

            <TabsTrigger value="sites" className="flex-1 py-1 px-2.5 text-center text-xs flex items-center justify-center gap-1.5">
              <svg className="aero-icon-sm" viewBox="0 0 24 24" fill="none">
                <path d="M3 21h18M5 21V7l8-4v18M13 11l6 3v7" stroke="#b45309" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              <span>Site Portfolios & Progress</span>
            </TabsTrigger>

            <div className="w-[1px] h-3.5 bg-[var(--navy-mid)]/10 shrink-0"></div>

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
          <StaggerContainer className="grid grid-cols-2 sm:grid-cols-4 gap-2" stagger={0.07}>
            {/* Total Liquid Cash */}
            <StaggerItem className="p-2.5 rounded-[5px] border border-border bg-card level-2-surface flex flex-col justify-between">
              <div className="flex items-center justify-between text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                <span>Liquid Cash & Bank</span>
                <Wallet className="h-3.5 w-3.5 text-success" />
              </div>
              <div className="mt-1 font-matrix text-lg font-extrabold text-success">
                <AnimatedCounter value={totalLiquidCash || 0} format={(n) => formatNpr(n)} prefix="NPR " />
              </div>
              <div className="text-[10px] text-muted-foreground font-mono mt-0.5">Across {accounts.length} accounts</div>
            </StaggerItem>

            {/* Active Sites */}
            <StaggerItem className="p-2.5 rounded-[5px] border border-border bg-card level-2-surface flex flex-col justify-between">
              <div className="flex items-center justify-between text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                <span>Active Projects</span>
                <HardHat className="h-3.5 w-3.5 text-[var(--primary)]" />
              </div>
              <div className="mt-1 font-matrix text-lg font-extrabold text-foreground">
                <AnimatedCounter value={activeProjects} /> Sites
              </div>
              <div className="text-[10px] text-muted-foreground font-mono mt-0.5">Physical tracking active</div>
            </StaggerItem>

            {/* Total Portfolio Value */}
            <StaggerItem className="p-2.5 rounded-[5px] border border-border bg-card level-2-surface flex flex-col justify-between">
              <div className="flex items-center justify-between text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                <span>Contract Portfolio</span>
                <FolderKanban className="h-3.5 w-3.5 text-[#f59e0b]" />
              </div>
              <div className="mt-1 font-matrix text-lg font-extrabold">
                <span className="amber-mark rounded-sm px-0.5">
                  <AnimatedCounter value={totalContract || 0} format={(n) => formatNpr(n)} prefix="NPR " />
                </span>
              </div>
              <div className="text-[10px] text-muted-foreground font-mono mt-0.5">Total agreed value</div>
            </StaggerItem>

            {/* Quick Actions */}
            <StaggerItem className="p-2 rounded-[5px] border border-border bg-card level-2-surface flex items-center justify-around gap-1">
              <Link href="/finance" className="recessed-control flex-1 text-center py-1.5 px-1 rounded-[4px]">
                <span className="block text-xs font-bold text-[var(--primary)]">Day Book</span>
                <span className="text-[9px] text-muted-foreground font-mono">Record Voucher</span>
              </Link>
              <Link href="/projects" className="recessed-control flex-1 text-center py-1.5 px-1 rounded-[4px]">
                <span className="block text-xs font-bold text-[var(--primary)]">Sites</span>
                <span className="text-[9px] text-muted-foreground font-mono">View Projects</span>
              </Link>
            </StaggerItem>
          </StaggerContainer>

          {/* Urgent Bank Guarantees Alert */}
          <GuaranteesAlertCard />

          {/* Live Recent Ledger & Site Activity (26px High-Density Table) */}
          <div className="space-y-1">
            <div className="flex items-center justify-between px-1">
              <h3 className="text-xs font-extrabold text-foreground/90 uppercase tracking-wide flex items-center gap-1.5">
                <span>Live Site Activity & Cashbook Stream</span>
              </h3>
              <Link href="/finance" className="text-[11px] font-bold text-[var(--primary)] hover:underline flex items-center gap-1">
                <span>Full Day Book</span>
                <ChevronRight className="h-3 w-3" />
              </Link>
            </div>

            <ConstructionTable
              data={entries.slice(0, 8)}
              columns={activityColumns}
              searchPlaceholder="Search recent live site vouchers, accounts..."
              initialDensity="compact"
              emptyState={{
                icon: Wallet,
                title: "No Journal / Site Vouchers Recorded Yet",
                description: "Record your first disbursement, billing receipt, or bank transaction to initiate live stream.",
                action: (
                  <Link
                    href="/finance"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md amber-cta-btn text-xs font-bold text-foreground shadow-sm"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Record Day Book Voucher</span>
                  </Link>
                ),
              }}
              exportExcel={{
                filename: "Recent_Site_Activity",
                sheetName: "Activity",
              }}
            />
          </div>
        </TabsContent>

        {/* Tab 2: Site Portfolios */}
        <TabsContent value="sites" className="space-y-2 outline-none m-0">
          <div className="p-3 rounded-lg border border-[var(--border)] bg-card level-2-surface">
            <h3 className="text-xs font-extrabold text-foreground/90 uppercase tracking-wide mb-2.5">Active Site Progress & Valuations</h3>
            {(data?.projectProgress || []).length === 0 ? (
              <div className="rounded-lg border border-dashed border-[var(--border)] p-8 text-center bg-[#f8fafc] space-y-2">
                <HardHat className="mx-auto h-8 w-8 text-[var(--primary)]/60" />
                <p className="text-xs font-semibold text-foreground/90">No Active Projects Initialized</p>
                <p className="text-[11px] text-muted-foreground">Create your first construction project to track BoQ, EVM schedule, and site progress.</p>
                <div className="pt-2">
                  <Link
                    href="/projects"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md amber-cta-btn text-xs font-bold text-foreground shadow-sm"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Create First Project</span>
                  </Link>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                {(data?.projectProgress || []).map((p) => (
                  <div key={p.id} className="p-3 rounded-lg border border-[var(--border)] bg-[#f8fafc] flex flex-col justify-between space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs text-foreground">{p.name}</span>
                      <span className="font-mono text-[10px] bg-info/15 text-[var(--primary)] px-1.5 py-0.5 rounded font-bold">{p.code}</span>
                    </div>
                    <div>
                      <div className="flex items-center justify-between text-[10px] text-muted-foreground font-mono mb-1">
                        <span>Physical Progress</span>
                        <span className="font-bold text-foreground/90">{p.physical}%</span>
                      </div>
                      <div className="w-full bg-secondary h-1.5 rounded-full overflow-hidden">
                        <div className="bg-[var(--primary)] h-full rounded-full" style={{ width: `${p.physical}%` }}></div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-[11px] pt-1 border-t border-border font-matrix">
                      <span className="text-muted-foreground text-[10px]">Contract Value:</span>
                      <span className="font-bold text-foreground">NPR {formatNpr(p.contractValue)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        {/* Tab 3: Cash & Liquidity Hub */}
        <TabsContent value="liquidity" className="space-y-2 outline-none m-0">
          <div className="p-3 rounded-lg border border-[var(--border)] bg-card level-2-surface">
            <h3 className="text-xs font-extrabold text-foreground/90 uppercase tracking-wide mb-2.5">Live Bank Balances & Credit Limits</h3>
            {accounts.length === 0 ? (
              <div className="rounded-lg border border-dashed border-[var(--border)] p-8 text-center bg-[#f8fafc] space-y-2">
                <Wallet className="mx-auto h-8 w-8 text-success/60" />
                <p className="text-xs font-semibold text-foreground/90">No Bank or Cash Accounts Connected</p>
                <p className="text-[11px] text-muted-foreground">Add company bank accounts or site petty cash funds to track real-time liquidity.</p>
                <div className="pt-2">
                  <Link
                    href="/finance"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md amber-cta-btn text-xs font-bold text-foreground shadow-sm"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Configure Bank / Cash Account</span>
                  </Link>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                {accounts.map((acc) => (
                  <div key={acc.id} className="p-3 rounded-lg border border-[var(--border)] bg-[#f8fafc] space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs text-foreground">{acc.bankName}</span>
                      <span className="text-[10px] font-mono text-muted-foreground uppercase">{acc.accountType}</span>
                    </div>
                    <div className="font-mono text-[10px] text-muted-foreground/80">A/C: {acc.accountNumber}</div>
                    <div className="font-matrix text-base font-extrabold text-success pt-1">
                      NPR {formatNpr(acc.currentBalance || 0)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
