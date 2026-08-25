"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CreditCard,
  Building2,
  Users,
  Search,
  ArrowUpRight,
  AlertCircle,
  Clock,
  CheckCircle2,
  FileText,
  Phone,
} from "lucide-react";
import { format } from "date-fns";
import { adToBs } from "@/lib/nepali-calendar";
import { cn } from "@/lib/utils";

function fmt(n: number) {
  return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

interface OutstandingPayablesTabProps {
  projectId: string;
  onPayNow: (payable: {
    entityType: "vendor" | "subcontractor" | "staff";
    entityId: string;
    entityName: string;
    entityPan?: string | null;
    billNumber: string;
    balanceDue: number;
    tdsAmount: number;
    category: string;
  }) => void;
}

export function OutstandingPayablesTab({ projectId, onPayNow }: OutstandingPayablesTabProps) {
  const [filterType, setFilterType] = useState<"all" | "vendor" | "subcontractor" | "staff">("all");
  const [search, setSearch] = useState("");

  const { data, isLoading } = trpc.projectOps.payment.outstandingPayables.useQuery({ projectId });

  const payables = data?.payables || [];
  const summary = data?.summary || {
    totalVendorDue: 0,
    totalSubcontractorDue: 0,
    totalDue: 0,
    vendorBillsCount: 0,
    subBillsCount: 0,
    totalCount: 0,
  };

  const filtered = payables.filter((p) => {
    if (filterType !== "all" && p.entityType !== filterType) return false;
    if (search) {
      const q = search.toLowerCase();
      const matchName = p.entityName.toLowerCase().includes(q);
      const matchBill = p.billNumber.toLowerCase().includes(q);
      const matchPan = p.entityPan?.toLowerCase().includes(q);
      const matchPo = p.poNumber?.toLowerCase().includes(q);
      if (!matchName && !matchBill && !matchPan && !matchPo) return false;
    }
    return true;
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPI Top Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {/* Total Outstanding */}
        <div className="rounded-xl border border-red-200 dark:border-red-900/40 bg-red-50/50 dark:bg-red-950/20 p-4">
          <div className="flex items-center justify-between text-xs font-mono text-red-700 dark:text-red-300">
            <span className="flex items-center gap-1.5 uppercase font-bold tracking-wider">
              <AlertCircle className="h-3.5 w-3.5" /> Total We Owe (बाँकी भुक्तानी)
            </span>
            <Badge variant="destructive" className="h-5 px-1.5 text-[10px]">
              {summary.totalCount} Bills Due
            </Badge>
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-red-900 dark:text-red-100">
            NPR {fmt(summary.totalDue)}
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground font-mono">
            Unsettled vendor & subcontractor balances
          </div>
        </div>

        {/* Vendor Payables */}
        <div className="rounded-xl border border-amber-200 dark:border-amber-900/40 bg-amber-50/50 dark:bg-amber-950/20 p-4">
          <div className="flex items-center justify-between text-xs font-mono text-amber-700 dark:text-amber-300">
            <span className="flex items-center gap-1.5 uppercase font-bold tracking-wider">
              <Building2 className="h-3.5 w-3.5" /> Material Vendors (सप्लायर)
            </span>
            <Badge variant="outline" className="h-5 px-1.5 text-[10px] border-amber-300 text-amber-800 dark:text-amber-300">
              {summary.vendorBillsCount} Bills
            </Badge>
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-amber-900 dark:text-amber-100">
            NPR {fmt(summary.totalVendorDue)}
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground font-mono">
            Cement, rebar, fuel & site supplies
          </div>
        </div>

        {/* Subcontractor Payables */}
        <div className="rounded-xl border border-indigo-200 dark:border-indigo-900/40 bg-indigo-50/50 dark:bg-indigo-950/20 p-4">
          <div className="flex items-center justify-between text-xs font-mono text-indigo-700 dark:text-indigo-300">
            <span className="flex items-center gap-1.5 uppercase font-bold tracking-wider">
              <Users className="h-3.5 w-3.5" /> Subcontractors (पेटी ठेकेदार)
            </span>
            <Badge variant="outline" className="h-5 px-1.5 text-[10px] border-indigo-300 text-indigo-800 dark:text-indigo-300">
              {summary.subBillsCount} Bills
            </Badge>
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-indigo-900 dark:text-indigo-100">
            NPR {fmt(summary.totalSubcontractorDue)}
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground font-mono">
            Certified bills pending disbursement
          </div>
        </div>
      </div>

      {/* Filter & Search Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-border bg-muted/40 p-0.5">
            <button
              onClick={() => setFilterType("all")}
              className={cn(
                "rounded-md px-3 py-1 text-xs font-medium transition",
                filterType === "all" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              All Due ({summary.totalCount})
            </button>
            <button
              onClick={() => setFilterType("vendor")}
              className={cn(
                "rounded-md px-3 py-1 text-xs font-medium transition",
                filterType === "vendor" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              Vendors ({summary.vendorBillsCount})
            </button>
            <button
              onClick={() => setFilterType("subcontractor")}
              className={cn(
                "rounded-md px-3 py-1 text-xs font-medium transition",
                filterType === "subcontractor" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              Subcontractors ({summary.subBillsCount})
            </button>
          </div>
        </div>

        <div className="relative w-72">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search vendor, bill #, PAN..."
            className="pl-8 text-xs h-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Payables Table */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center">
          <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500 mb-2" />
          <p className="text-sm font-semibold text-foreground">All Payables are Settled!</p>
          <p className="text-xs text-muted-foreground mt-1">
            There are no outstanding vendor or subcontractor bills awaiting payment for this project.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-left text-xs">
            <thead className="border-b bg-muted/60 font-mono uppercase text-[10px] text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Payee / Party</th>
                <th className="px-3 py-3">Type</th>
                <th className="px-3 py-3">Bill Ref / Date</th>
                <th className="px-3 py-3 text-right">Gross (NPR)</th>
                <th className="px-3 py-3 text-right">TDS (1.5%)</th>
                <th className="px-3 py-3 text-right">Net Payable</th>
                <th className="px-3 py-3 text-right">Paid</th>
                <th className="px-4 py-3 text-right">Balance Due</th>
                <th className="px-4 py-3 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border font-mono">
              {filtered.map((item) => {
                let bsDate = "—";
                try {
                  bsDate = adToBs(new Date(item.billDate)).formatted;
                } catch {}

                return (
                  <tr key={item.id} className="hover:bg-muted/30 transition-colors">
                    {/* Payee */}
                    <td className="px-4 py-3">
                      <div className="font-semibold text-foreground font-sans text-sm">
                        {item.entityName}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 text-[11px] text-muted-foreground">
                        {item.entityPan && (
                          <span className="bg-muted px-1.5 py-0.2 rounded font-mono text-[10px]">
                            PAN: {item.entityPan}
                          </span>
                        )}
                        {item.entityPhone && (
                          <span className="flex items-center gap-0.5">
                            <Phone className="h-2.5 w-2.5" />
                            {item.entityPhone}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Type Badge */}
                    <td className="px-3 py-3">
                      {item.entityType === "vendor" ? (
                        <Badge variant="outline" className="text-[10px] bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-300">
                          Supplier
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border-indigo-300">
                          Subcontractor
                        </Badge>
                      )}
                    </td>

                    {/* Bill Ref & Date */}
                    <td className="px-3 py-3">
                      <div className="font-bold text-foreground">
                        {item.billNumber}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {bsDate} ({format(new Date(item.billDate), "yyyy-MM-dd")})
                      </div>
                      {item.poNumber && (
                        <div className="text-[10px] text-primary">PO: {item.poNumber}</div>
                      )}
                    </td>

                    {/* Gross */}
                    <td className="px-3 py-3 text-right text-muted-foreground">
                      {fmt(item.grossAmount)}
                    </td>

                    {/* TDS */}
                    <td className="px-3 py-3 text-right text-muted-foreground">
                      {fmt(item.tdsAmount)}
                    </td>

                    {/* Net Payable */}
                    <td className="px-3 py-3 text-right font-medium text-foreground">
                      {fmt(item.netPayable)}
                    </td>

                    {/* Paid */}
                    <td className="px-3 py-3 text-right text-emerald-600 dark:text-emerald-400">
                      {fmt(item.paidAmount)}
                    </td>

                    {/* Balance Due */}
                    <td className="px-4 py-3 text-right">
                      <span className="font-bold text-red-600 dark:text-red-400 text-sm">
                        NPR {fmt(item.balanceDue)}
                      </span>
                    </td>

                    {/* Action button */}
                    <td className="px-4 py-3 text-center">
                      <Button
                        size="sm"
                        className="h-7 gap-1 px-2.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
                        onClick={() =>
                          onPayNow({
                            entityType: item.entityType,
                            entityId: item.entityId,
                            entityName: item.entityName,
                            entityPan: item.entityPan,
                            billNumber: item.billNumber,
                            balanceDue: item.balanceDue,
                            tdsAmount: (item.balanceDue * (item.tdsPercent || 1.5)) / 100,
                            category: item.category,
                          })
                        }
                      >
                        <CreditCard className="h-3 w-3" />
                        Pay Now
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
