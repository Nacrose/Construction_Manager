"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import {
  CreditCard,
  Building2,
  Phone,
  Receipt,
  Search,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ShieldCheck,
  Building,
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { formatNpr } from "@/lib/currency";
import { SettleMultiBillDialog, BillToSettle } from "../dialogs/settle-multi-bill-dialog";
import { ConstructionTable, ConstructionTableColumn } from "@/components/ui/construction-table";

export function OrgPayablesTab() {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "vendor" | "subcontractor">("all");
  const [expandedSuppliers, setExpandedSuppliers] = useState<Record<string, boolean>>({});

  // Settle modal state
  const [settleModalOpen, setSettleModalOpen] = useState(false);
  const [selectedBillsToSettle, setSelectedBillsToSettle] = useState<BillToSettle[]>([]);
  const [activeSupplierName, setActiveSupplierName] = useState("");

  const { data, isLoading } = trpc.finance.orgPayables.useQuery({
    search: search || undefined,
    type: typeFilter,
  });

  const suppliers = data?.suppliers || [];
  const totalDue = data?.totalDue || 0;
  const totalBills = data?.totalBills || 0;

  const toggleExpand = (key: string) => {
    setExpandedSuppliers((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handlePaySupplierAll = (sup: any) => {
    const bills: BillToSettle[] = sup.bills.map((b: any) => ({
      id: b.id,
      billType: b.billType,
      projectId: b.projectId,
      projectName: b.projectName,
      projectCode: b.projectCode,
      supplierName: b.supplierName,
      supplierPan: b.supplierPan,
      billNumber: b.billNumber,
      balanceDue: b.balanceDue,
    }));
    setSelectedBillsToSettle(bills);
    setActiveSupplierName(sup.name);
    setSettleModalOpen(true);
  };

  const handlePaySingleBill = (b: any) => {
    setSelectedBillsToSettle([
      {
        id: b.id,
        billType: b.billType,
        projectId: b.projectId,
        projectName: b.projectName,
        projectCode: b.projectCode,
        supplierName: b.supplierName,
        supplierPan: b.supplierPan,
        billNumber: b.billNumber,
        balanceDue: b.balanceDue,
      },
    ]);
    setActiveSupplierName(b.supplierName);
    setSettleModalOpen(true);
  };

  const billColumns: ConstructionTableColumn<any>[] = [
    {
      key: "project",
      header: "Project",
      render: (_, b) => (
        <div>
          <span className="font-bold text-foreground font-mono text-xs">{b.projectCode}</span>
          <div className="text-[10px] text-muted-foreground font-sans truncate max-w-[140px]">
            {b.projectName}
          </div>
        </div>
      ),
    },
    {
      key: "billNumber",
      header: "Bill #",
      render: (_, b) => <span className="font-bold text-foreground font-mono text-xs">{b.billNumber}</span>,
    },
    {
      key: "billDate",
      header: "Date",
      render: (_, b) => (
        <span className="text-muted-foreground font-mono text-xs">
          {format(new Date(b.billDate), "yyyy-MM-dd")}
        </span>
      ),
    },
    {
      key: "grossAmount",
      header: "Gross",
      align: "right",
      render: (_, b) => <span className="font-mono text-xs">{formatNpr(b.grossAmount)}</span>,
    },
    {
      key: "tdsAmount",
      header: "1.5% TDS",
      align: "right",
      render: (_, b) => <span className="font-mono text-xs text-muted-foreground">{formatNpr(b.tdsAmount)}</span>,
    },
    {
      key: "netPayable",
      header: "Net Bill",
      align: "right",
      render: (_, b) => <span className="font-mono text-xs">{formatNpr(b.netPayable)}</span>,
    },
    {
      key: "paidAmount",
      header: "Paid",
      align: "right",
      render: (_, b) => <span className="font-mono text-xs text-muted-foreground">{formatNpr(b.paidAmount)}</span>,
    },
    {
      key: "balanceDue",
      header: "Balance Due",
      align: "right",
      render: (_, b) => (
        <span className="font-bold font-mono text-xs text-amber-600 dark:text-amber-400">
          {formatNpr(b.balanceDue)}
        </span>
      ),
    },
    {
      key: "actions",
      header: "Action",
      align: "center",
      render: (_, b) => (
        <Button
          size="sm"
          variant="outline"
          className="h-6 px-2 text-[11px] font-sans text-primary hover:text-primary-foreground hover:bg-primary"
          onClick={() => handlePaySingleBill(b)}
        >
          Pay →
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      {/* Top Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="border-l-4 border-l-amber-500 shadow-sm bg-card">
          <CardContent className="p-4 space-y-1">
            <div className="text-[10px] font-mono text-muted-foreground uppercase">
              Total Company Payables Owed (कुल तिर्न बाँकी)
            </div>
            <div className="text-2xl font-bold font-mono text-amber-600 dark:text-amber-400">
              {formatNpr(totalDue, { prefix: "Rs.", compact: true })}
            </div>
            <div className="text-[11px] text-muted-foreground font-mono">
              Across all sites and joint ventures
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-info shadow-sm bg-card">
          <CardContent className="p-4 space-y-1">
            <div className="text-[10px] font-mono text-muted-foreground uppercase">
              Total Unsettled Bills (कुल बाँकी बिलहरू)
            </div>
            <div className="text-2xl font-bold font-mono text-foreground">
              {totalBills}{" "}
              <span className="text-xs text-muted-foreground font-normal">vouchers</span>
            </div>
            <div className="text-[11px] text-muted-foreground font-mono">
              Awaiting direct bank transfer / cheque
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-emerald-500 shadow-sm bg-card">
          <CardContent className="p-4 space-y-1">
            <div className="text-[10px] font-mono text-muted-foreground uppercase">
              Active Creditors (आपूर्तिकर्ता / ठेकेदार)
            </div>
            <div className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
              {suppliers.length}{" "}
              <span className="text-xs text-muted-foreground font-normal">entities</span>
            </div>
            <div className="text-[11px] text-muted-foreground font-mono">
              Consolidated vendor ledger
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filter and Search Ribbon */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-2.5 bg-muted/40 rounded-lg border">
        <div className="flex items-center gap-2 flex-1 min-w-[200px]">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search vendor name, PAN, phone or bill..."
              className="h-8 text-xs pl-8 font-mono"
            />
          </div>

          <div className="flex items-center rounded-md border bg-background p-0.5">
            <Button
              size="sm"
              variant={typeFilter === "all" ? "default" : "ghost"}
              onClick={() => setTypeFilter("all")}
              className="h-7 text-xs font-mono px-3"
            >
              All Types
            </Button>
            <Button
              size="sm"
              variant={typeFilter === "vendor" ? "default" : "ghost"}
              onClick={() => setTypeFilter("vendor")}
              className="h-7 text-xs font-mono px-3"
            >
              Suppliers
            </Button>
            <Button
              size="sm"
              variant={typeFilter === "subcontractor" ? "default" : "ghost"}
              onClick={() => setTypeFilter("subcontractor")}
              className="h-7 text-xs font-mono px-3"
            >
              Subcontractors
            </Button>
          </div>
        </div>

        <div className="text-xs text-muted-foreground font-mono">
          Showing <span className="font-bold text-foreground">{suppliers.length}</span> balance
          statements
        </div>
      </div>

      {/* Suppliers / Subcontractors Statement Accordion */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-lg" />
          ))}
        </div>
      ) : suppliers.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center space-y-2">
            <CheckCircle2 className="h-10 w-10 text-emerald-500 mb-1" />
            <p className="text-sm font-semibold text-foreground font-mono">
              No Outstanding Payables Found
            </p>
            <p className="text-xs text-muted-foreground max-w-sm">
              All vendor bills and subcontractor certifications across all sites have been settled in full.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {suppliers.map((sup: any) => {
            const isExpanded = !!expandedSuppliers[sup.key];

            return (
              <div
                key={sup.key}
                className="rounded-lg border bg-card shadow-xs overflow-hidden transition-colors"
              >
                {/* Header Row */}
                <div
                  onClick={() => toggleExpand(sup.key)}
                  className="flex flex-wrap items-center justify-between gap-3 p-3.5 hover:bg-muted/30 cursor-pointer select-none"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-md bg-muted/80 flex items-center justify-center text-muted-foreground shrink-0 border">
                      {sup.type === "vendor" ? (
                        <Building2 className="h-4 w-4" />
                      ) : (
                        <Building className="h-4 w-4 text-purple-500" />
                      )}
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-foreground text-sm font-sans">{sup.name}</span>
                        <Badge
                          variant="secondary"
                          className={cn(
                            "text-[9px] px-1.5 py-0 capitalize font-mono",
                            sup.type === "vendor"
                              ? "bg-info/15 text-info dark:bg-[var(--navy-deep)] dark:text-info/80"
                              : "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300"
                          )}
                        >
                          {sup.type === "vendor" ? "Supplier" : "Subcontractor"}
                        </Badge>
                      </div>

                      <div className="flex items-center gap-3 text-[11px] text-muted-foreground font-mono mt-0.5">
                        {sup.pan && (
                          <span className="flex items-center gap-1">
                            <ShieldCheck className="h-3 w-3 text-muted-foreground/70" />
                            PAN: {sup.pan}
                          </span>
                        )}
                        {sup.phone && (
                          <span className="flex items-center gap-1">
                            <Phone className="h-3 w-3 text-muted-foreground/70" />
                            {sup.phone}
                          </span>
                        )}
                        <span>• {sup.billsCount} pending bills</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="text-right font-mono">
                      <div className="text-[10px] text-muted-foreground uppercase">
                        Unsettled Balance
                      </div>
                      <div className="text-base font-bold text-amber-600 dark:text-amber-400">
                        {formatNpr(sup.totalDue)}
                      </div>
                    </div>

                    <Button
                      size="sm"
                      className="gap-1.5 text-xs font-semibold h-8 shadow-xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePaySupplierAll(sup);
                      }}
                    >
                      <CreditCard className="h-3.5 w-3.5" />
                      Pay Bills
                    </Button>

                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-muted-foreground"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleExpand(sup.key);
                      }}
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>

                {/* Expanded Bills Breakdown with ConstructionTable */}
                {isExpanded && (
                  <div className="border-t p-2 bg-muted/10">
                    <ConstructionTable
                      data={sup.bills}
                      columns={billColumns}
                      searchPlaceholder="Search vendor bills..."
                      searchFilterKeys={["projectCode", "projectName", "billNumber"]}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Multi-Bill Central Settlement Dialog */}
      <Dialog open={settleModalOpen} onOpenChange={setSettleModalOpen}>
        {settleModalOpen && (
          <SettleMultiBillDialog
            bills={selectedBillsToSettle}
            supplierName={activeSupplierName}
            onDone={() => setSettleModalOpen(false)}
          />
        )}
      </Dialog>
    </div>
  );
}
