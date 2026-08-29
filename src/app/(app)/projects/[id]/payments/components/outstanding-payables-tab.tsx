"use client";

import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc-client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CreditCard,
  Building2,
  Users,
  AlertCircle,
  Phone,
} from "lucide-react";
import { format } from "date-fns";
import { adToBs } from "@/lib/nepali-calendar";
import { cn } from "@/lib/utils";
import { formatNpr } from "@/lib/currency";
import { ConstructionTable, ConstructionTableColumn } from "@/components/ui/construction-table";

type OutstandingPayableItem = {
  id: string;
  entityType: "vendor" | "subcontractor" | "staff";
  entityId: string;
  entityName: string;
  entityPan?: string | null;
  entityPhone?: string | null;
  billNumber: string;
  billDate: string | Date;
  poNumber?: string | null;
  grossAmount: number;
  tdsAmount: number;
  tdsPercent?: number;
  netPayable: number;
  paidAmount: number;
  balanceDue: number;
  category: string;
};

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

  const { data, isLoading } = trpc.projectOps.payment.outstandingPayables.useQuery({ projectId });

  const payables: OutstandingPayableItem[] = (data?.payables || []) as OutstandingPayableItem[];
  const summary = data?.summary || {
    totalVendorDue: 0,
    totalSubcontractorDue: 0,
    totalDue: 0,
    vendorBillsCount: 0,
    subBillsCount: 0,
    totalCount: 0,
  };

  const filtered = useMemo(() => {
    if (filterType === "all") return payables;
    return payables.filter((p) => p.entityType === filterType);
  }, [payables, filterType]);

  const columns: ConstructionTableColumn<OutstandingPayableItem>[] = useMemo(
    () => [
      {
        key: "entityName",
        header: "Payee / Party",
        accessor: (r) => r.entityName,
        sortable: true,
        render: (_, item) => (
          <div>
            <div className="font-semibold text-foreground font-sans text-xs">
              {item.entityName}
            </div>
            <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground font-mono">
              {item.entityPan && (
                <span className="bg-muted px-1.5 py-0.2 rounded">
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
          </div>
        ),
      },
      {
        key: "entityType",
        header: "Type",
        width: "110px",
        render: (_, item) =>
          item.entityType === "vendor" ? (
            <Badge variant="outline" className="text-[10px] bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-300">
              Supplier
            </Badge>
          ) : (
            <Badge variant="outline" className="text-[10px] bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border-indigo-300">
              Subcontractor
            </Badge>
          ),
      },
      {
        key: "billNumber",
        header: "Bill Ref / Date",
        width: "140px",
        render: (_, item) => {
          let bsDate = "—";
          try {
            bsDate = adToBs(new Date(item.billDate)).formatted;
          } catch {}
          return (
            <div>
              <div className="font-bold text-foreground text-xs font-mono">{item.billNumber}</div>
              <div className="text-[10px] text-muted-foreground font-mono">
                {bsDate} ({format(new Date(item.billDate), "yyyy-MM-dd")})
              </div>
              {item.poNumber && <div className="text-[10px] text-primary font-mono">PO: {item.poNumber}</div>}
            </div>
          );
        },
      },
      {
        key: "grossAmount",
        header: "Gross",
        align: "right",
        width: "120px",
        render: (val) => <span className="text-muted-foreground font-mono">{formatNpr(val)}</span>,
      },
      {
        key: "tdsAmount",
        header: "TDS",
        align: "right",
        width: "100px",
        render: (val) => <span className="text-muted-foreground font-mono">{formatNpr(val)}</span>,
      },
      {
        key: "netPayable",
        header: "Net Payable",
        align: "right",
        width: "120px",
        render: (val) => <span className="font-medium text-foreground font-mono">{formatNpr(val)}</span>,
      },
      {
        key: "paidAmount",
        header: "Paid",
        align: "right",
        width: "120px",
        render: (val) => <span className="text-emerald-600 dark:text-emerald-400 font-mono">{formatNpr(val)}</span>,
      },
      {
        key: "balanceDue",
        header: "Balance Due",
        align: "right",
        width: "130px",
        render: (val) => (
          <span className="font-bold text-red-600 dark:text-red-400 text-xs font-mono">
            {formatNpr(val)}
          </span>
        ),
      },
      {
        key: "action",
        header: "Action",
        align: "center",
        width: "100px",
        render: (_, item) => (
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
                tdsAmount: item.tdsAmount ?? 0,
                category: item.category,
              })
            }
          >
            <CreditCard className="h-3 w-3" />
            Pay Now
          </Button>
        ),
      },
    ],
    [onPayNow]
  );

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
    <div className="space-y-4">
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
            {formatNpr(summary.totalDue)}
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground font-mono">
            Unsettled vendor &amp; subcontractor balances
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
            {formatNpr(summary.totalVendorDue)}
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground font-mono">
            Cement, rebar, fuel &amp; site supplies
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
            {formatNpr(summary.totalSubcontractorDue)}
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground font-mono">
            Certified bills pending disbursement
          </div>
        </div>
      </div>

      {/* Filter Tabs & ConstructionTable */}
      <ConstructionTable<OutstandingPayableItem>
        data={filtered}
        columns={columns}
        searchPlaceholder="Search vendor, subcontractor, bill #, PAN..."
        searchFilterKeys={["entityName", "billNumber", "entityPan", "poNumber"]}
        headerActions={
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
        }
        exportExcel={{
          filename: `Outstanding_Payables_${format(new Date(), "yyyy-MM-dd")}`,
          sheetName: "Payables",
        }}
        emptyState={{
          title: "All Payables are Settled!",
          description: "There are no outstanding vendor or subcontractor bills awaiting payment for this project.",
        }}
      />
    </div>
  );
}
