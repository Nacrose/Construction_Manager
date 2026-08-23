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
  Plus,
  ArrowRight,
  ShieldCheck,
  Building,
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { SettleMultiBillDialog, BillToSettle } from "../dialogs/settle-multi-bill-dialog";

function fmt(n: number) {
  return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtShort(n: number) {
  if (Math.abs(n) >= 10000000) return `Rs. ${(n / 10000000).toFixed(2)} Cr`;
  if (Math.abs(n) >= 100000) return `Rs. ${(n / 100000).toFixed(2)} L`;
  return `Rs. ${fmt(n)}`;
}

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
              {fmtShort(totalDue)}
            </div>
            <div className="text-[11px] text-muted-foreground font-mono">
              Across all active sites & suppliers
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-primary shadow-sm bg-card">
          <CardContent className="p-4 space-y-1">
            <div className="text-[10px] font-mono text-muted-foreground uppercase">
              Vendors & Subcontractors with Dues
            </div>
            <div className="text-2xl font-bold font-mono text-foreground">
              {suppliers.length}
            </div>
            <div className="text-[11px] text-muted-foreground font-mono">
              Material vendors & labor contractors
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-slate-400 shadow-sm bg-card">
          <CardContent className="p-4 space-y-1">
            <div className="text-[10px] font-mono text-muted-foreground uppercase">
              Open Bills Pending Payment
            </div>
            <div className="text-2xl font-bold font-mono text-foreground">
              {totalBills}
            </div>
            <div className="text-[11px] text-muted-foreground font-mono">
              Unpaid or partially settled bills
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-card p-3 rounded-xl border shadow-sm">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search vendor name, PAN, project code..."
            className="pl-8 h-9 text-xs"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-1.5 w-full sm:w-auto">
          <Button
            size="sm"
            variant={typeFilter === "all" ? "default" : "outline"}
            className="h-8 text-xs flex-1 sm:flex-initial"
            onClick={() => setTypeFilter("all")}
          >
            All Parties ({suppliers.length})
          </Button>
          <Button
            size="sm"
            variant={typeFilter === "vendor" ? "default" : "outline"}
            className="h-8 text-xs flex-1 sm:flex-initial"
            onClick={() => setTypeFilter("vendor")}
          >
            Material Vendors
          </Button>
          <Button
            size="sm"
            variant={typeFilter === "subcontractor" ? "default" : "outline"}
            className="h-8 text-xs flex-1 sm:flex-initial"
            onClick={() => setTypeFilter("subcontractor")}
          >
            Subcontractors
          </Button>
        </div>
      </div>

      {/* Supplier Payables Accordion Matrix */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      ) : suppliers.length === 0 ? (
        <div className="rounded-xl border border-dashed p-12 text-center bg-card">
          <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500 mb-3" />
          <h3 className="text-base font-bold text-foreground">All Clear! No Outstanding Payables</h3>
          <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
            All vendor material bills and certified subcontractor bills across all projects are fully settled.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {suppliers.map((sup) => {
            const isExpanded = expandedSuppliers[sup.key] ?? false;

            return (
              <div
                key={sup.key}
                className="rounded-xl border bg-card shadow-sm overflow-hidden transition-all"
              >
                {/* Supplier Header Row */}
                <div
                  className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-muted/20 hover:bg-muted/40 cursor-pointer transition-colors"
                  onClick={() => toggleExpand(sup.key)}
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-primary/10 text-primary">
                      {sup.type === "vendor" ? (
                        <Building2 className="h-5 w-5" />
                      ) : (
                        <Building className="h-5 w-5" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-foreground text-sm font-sans">{sup.name}</span>
                        {sup.pan && (
                          <Badge variant="outline" className="text-[10px] font-mono">
                            PAN: {sup.pan}
                          </Badge>
                        )}
                        {sup.phone && (
                          <span className="text-[11px] text-muted-foreground flex items-center gap-1 font-mono">
                            <Phone className="h-3 w-3" /> {sup.phone}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className="text-[11px] text-muted-foreground">Active in Projects:</span>
                        {sup.projectCodes.map((code) => (
                          <Badge
                            key={code}
                            variant="secondary"
                            className="text-[10px] font-mono font-semibold"
                          >
                            {code}
                          </Badge>
                        ))}
                        <span className="text-[11px] text-muted-foreground ml-2">
                          • {sup.billsCount} open bill{sup.billsCount > 1 ? "s" : ""}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 self-end sm:self-center font-mono">
                    <div className="text-right">
                      <div className="text-[10px] text-muted-foreground uppercase">Total Due</div>
                      <div className="text-lg font-bold text-amber-600 dark:text-amber-400">
                        NPR {fmt(sup.totalDue)}
                      </div>
                    </div>

                    <Button
                      size="sm"
                      className="gap-1.5 text-xs font-semibold h-8 shadow-sm"
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

                {/* Expanded Bills Breakdown */}
                {isExpanded && (
                  <div className="border-t overflow-x-auto">
                    <table className="w-full text-left text-xs font-mono">
                      <thead className="bg-muted/60 text-[10px] uppercase text-muted-foreground">
                        <tr>
                          <th className="px-4 py-2">Project</th>
                          <th className="px-3 py-2">Bill #</th>
                          <th className="px-3 py-2">Date (AD)</th>
                          <th className="px-3 py-2 text-right">Gross</th>
                          <th className="px-3 py-2 text-right">1.5% TDS</th>
                          <th className="px-3 py-2 text-right">Net Bill</th>
                          <th className="px-3 py-2 text-right">Paid</th>
                          <th className="px-3 py-2 text-right text-amber-600 dark:text-amber-400">
                            Balance Due
                          </th>
                          <th className="px-4 py-2 text-center">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {sup.bills.map((b: any) => (
                          <tr key={b.id} className="hover:bg-muted/20">
                            <td className="px-4 py-2.5">
                              <span className="font-bold text-foreground">{b.projectCode}</span>
                              <div className="text-[10px] text-muted-foreground font-sans truncate max-w-[140px]">
                                {b.projectName}
                              </div>
                            </td>
                            <td className="px-3 py-2.5 font-bold text-foreground">
                              {b.billNumber}
                            </td>
                            <td className="px-3 py-2.5 text-muted-foreground">
                              {format(new Date(b.billDate), "yyyy-MM-dd")}
                            </td>
                            <td className="px-3 py-2.5 text-right">{fmt(b.grossAmount)}</td>
                            <td className="px-3 py-2.5 text-right text-muted-foreground">
                              {fmt(b.tdsAmount)}
                            </td>
                            <td className="px-3 py-2.5 text-right">{fmt(b.netPayable)}</td>
                            <td className="px-3 py-2.5 text-right text-muted-foreground">
                              {fmt(b.paidAmount)}
                            </td>
                            <td className="px-3 py-2.5 text-right font-bold text-amber-600 dark:text-amber-400">
                              {fmt(b.balanceDue)}
                            </td>
                            <td className="px-4 py-2.5 text-center">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-6 px-2 text-[11px] font-sans text-primary hover:text-primary-foreground hover:bg-primary"
                                onClick={() => handlePaySingleBill(b)}
                              >
                                Pay →
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
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
