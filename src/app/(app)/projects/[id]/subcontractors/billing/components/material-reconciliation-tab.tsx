"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc-client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Package,
  ArrowDownLeft,
  ArrowUpRight,
  ShieldAlert,
  CheckCircle2,
  Download,
  Plus,
  RefreshCw,
  FileSpreadsheet,
  AlertTriangle,
  Loader2,
  Calendar,
  Layers,
} from "lucide-react";
import { cn } from "@/lib/utils";
import * as XLSX from "@e965/xlsx";
import { toast } from "sonner";
import { format } from "date-fns";

export function MaterialReconciliationTab({
  projectId,
  subcontractors,
}: {
  projectId: string;
  subcontractors: Array<{ id: string; name: string }>;
}) {
  const [selectedSubId, setSelectedSubId] = useState<string>(() => {
    return subcontractors[0]?.id || "";
  });
  const [expandedMaterialId, setExpandedMaterialId] = useState<string | null>(null);

  const { data, isLoading, refetch, isFetching } =
    trpc.subcontractorBill.getSubcontractorMaterialReconciliation.useQuery(
      {
        projectId,
        subcontractorId: selectedSubId,
      },
      { enabled: !!selectedSubId }
    );

  const selectedSub = subcontractors.find((s) => s.id === selectedSubId);
  const statement = data?.statement || [];
  const totalDebit = data?.totalDebitDeduction || 0;

  const handleExportExcel = () => {
    if (!statement.length) {
      toast.info("No statement data to export");
      return;
    }

    try {
      const headers = [
        "Material Name",
        "Unit",
        "Total Issued Qty",
        "Total Returned Qty",
        "Net Issued to Sub",
        "Theoretical Billed Requirement",
        "Allowed Wastage (2%)",
        "Excess / Unaccounted Qty",
        "Recovery Rate (NPR)",
        "Material Debit Deduction (NPR)",
        "Status",
      ];

      const exportRows = statement.map((item) => ({
        "Material Name": item.name,
        Unit: item.unit,
        "Total Issued Qty": item.issuedQty,
        "Total Returned Qty": item.returnedQty,
        "Net Issued to Sub": item.netIssuedQty,
        "Theoretical Billed Requirement": item.theoreticalReq,
        "Allowed Wastage (2%)": item.allowedWastage,
        "Excess / Unaccounted Qty": item.excessQty,
        "Recovery Rate (NPR)": item.recoveryRate,
        "Material Debit Deduction (NPR)": item.debitAmount,
        Status: item.excessQty > 0 ? "EXCESS WASTAGE (Debit)" : "Balanced",
      }));

      const ws = XLSX.utils.json_to_sheet(exportRows, { header: headers });
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Material Reconciliation");

      const colWidths = headers.map((h) => ({ wch: Math.max(h.length + 3, 16) }));
      ws["!cols"] = colWidths;

      const subName = selectedSub?.name.replace(/[^a-zA-Z0-9]/g, "_") || "Subcontractor";
      XLSX.writeFile(wb, `material-reconciliation-${subName}-${new Date().toISOString().slice(0, 10)}.xlsx`);
      toast.success("Material statement exported");
    } catch {
      toast.error("Failed to export Excel");
    }
  };

  if (!subcontractors.length) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground text-sm">
          No subcontractors found for this project.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Subcontractor Selector & Summary Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-muted/20 p-3 rounded-lg border">
        <div className="flex items-center gap-2.5 w-full sm:w-auto">
          <span className="text-xs font-semibold text-muted-foreground shrink-0">Subcontractor Package:</span>
          <Select value={selectedSubId} onValueChange={setSelectedSubId}>
            <SelectTrigger className="h-8 w-60 text-xs font-medium bg-card">
              <SelectValue placeholder="Select Subcontractor" />
            </SelectTrigger>
            <SelectContent>
              {subcontractors.map((sub) => (
                <SelectItem key={sub.id} value={sub.id}>
                  {sub.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => refetch()}
            disabled={isFetching}
            className="h-8 text-xs gap-1.5"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />
            Refresh
          </Button>
          <Button
            size="sm"
            onClick={handleExportExcel}
            className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
          >
            <Download className="h-3.5 w-3.5" />
            Export Statement (Excel)
          </Button>
        </div>
      </div>

      {/* KPI Cards for Material Statement */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-3 shadow-xs">
          <p className="text-[10px] text-muted-foreground uppercase font-medium">Materials Tracked</p>
          <p className="text-xl font-bold font-mono">{statement.length}</p>
          <p className="text-[9px] text-muted-foreground mt-0.5">Active warehouse items</p>
        </Card>

        <Card className="p-3 shadow-xs">
          <p className="text-[10px] text-muted-foreground uppercase font-medium">Excess Wastage Items</p>
          <p className={cn("text-xl font-bold font-mono", statement.filter((s) => s.excessQty > 0).length > 0 ? "text-amber-600" : "text-emerald-600")}>
            {statement.filter((s) => s.excessQty > 0).length}
          </p>
          <p className="text-[9px] text-muted-foreground mt-0.5">Exceeds 2% tolerance</p>
        </Card>

        <Card className="p-3 shadow-xs border-l-4 border-l-red-500 bg-red-50/20 dark:bg-red-950/10">
          <p className="text-[10px] text-muted-foreground uppercase font-medium">Total Material Debit</p>
          <p className="text-xl font-bold font-mono text-red-600 dark:text-red-400">
            NPR {totalDebit.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
          </p>
          <p className="text-[9px] text-muted-foreground mt-0.5">Auto-deducted from bill</p>
        </Card>

        <Card className="p-3 shadow-xs border-l-4 border-l-emerald-500">
          <p className="text-[10px] text-muted-foreground uppercase font-medium">Reconciliation Status</p>
          <p className="text-xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
            {totalDebit === 0 ? "Balanced" : "Debit Active"}
          </p>
          <p className="text-[9px] text-muted-foreground mt-0.5">Based on verified BOQ work</p>
        </Card>
      </div>

      {/* Statement Table */}
      <Card className="overflow-hidden border border-border/80 shadow-xs">
        <CardHeader className="py-3 px-4 bg-muted/30 border-b">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Layers className="h-4 w-4 text-violet-600" />
                Material Issued vs. Consumed Reconciliation Statement
              </CardTitle>
              <CardDescription className="text-xs">
                Comparison of warehouse store issues against theoretical consumption calculated from {selectedSub?.name}&apos;s billed BOQ work.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs font-mono tabular-nums">
              <thead className="bg-muted/50 border-b text-[10px] text-muted-foreground uppercase">
                <tr>
                  <th className="py-2.5 px-3 text-left font-semibold">Material / Item</th>
                  <th className="py-2.5 px-1 text-center w-12">Unit</th>
                  <th className="py-2.5 px-2 text-right w-20">Issued</th>
                  <th className="py-2.5 px-2 text-right w-20">Returned</th>
                  <th className="py-2.5 px-2 text-right w-24 font-bold text-foreground">Net Handed</th>
                  <th className="py-2.5 px-2 text-right w-24 text-blue-600 dark:text-blue-400">Theoretical Req</th>
                  <th className="py-2.5 px-2 text-right w-20 text-muted-foreground">Allowed (2%)</th>
                  <th className="py-2.5 px-2 text-right w-20 text-red-600">Excess Qty</th>
                  <th className="py-2.5 px-2 text-right w-24">Recovery Rate</th>
                  <th className="py-2.5 px-3 text-right w-28 font-bold text-red-600">Debit (NPR)</th>
                  <th className="py-2.5 px-2 text-center w-24">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {isLoading ? (
                  <tr>
                    <td colSpan={11} className="p-8 text-center text-muted-foreground">
                      <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-primary" />
                      Computing material reconciliation statement...
                    </td>
                  </tr>
                ) : statement.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="p-8 text-center text-muted-foreground">
                      No material transactions or issued materials recorded for this subcontractor.
                    </td>
                  </tr>
                ) : (
                  statement.map((item) => {
                    const isExcess = item.excessQty > 0;
                    const isExpanded = expandedMaterialId === item.materialId;

                    return (
                      <>
                        <tr
                          key={item.materialId}
                          className={cn(
                            "hover:bg-muted/15 transition-colors cursor-pointer",
                            isExcess && "bg-amber-50/30 dark:bg-amber-950/15"
                          )}
                          onClick={() => setExpandedMaterialId(isExpanded ? null : item.materialId)}
                        >
                          <td className="py-2 px-3 font-sans font-medium text-foreground">
                            {item.name}
                            <span className="block text-[9px] font-mono text-muted-foreground">
                              {item.transactions.length} transaction slip(s)
                            </span>
                          </td>
                          <td className="py-2 px-1 text-center text-muted-foreground text-[10px]">{item.unit}</td>
                          <td className="py-2 px-2 text-right text-emerald-600 font-semibold">{item.issuedQty.toLocaleString()}</td>
                          <td className="py-2 px-2 text-right text-blue-600">{item.returnedQty > 0 ? item.returnedQty.toLocaleString() : "—"}</td>
                          <td className="py-2 px-2 text-right font-bold text-foreground">{item.netIssuedQty.toLocaleString()}</td>
                          <td className="py-2 px-2 text-right font-medium text-blue-600 dark:text-blue-400">
                            {item.theoreticalReq.toLocaleString()}
                          </td>
                          <td className="py-2 px-2 text-right text-muted-foreground">{item.allowedWastage.toLocaleString()}</td>
                          <td className={cn("py-2 px-2 text-right font-bold", isExcess ? "text-red-600 dark:text-red-400 font-extrabold" : "text-muted-foreground")}>
                            {item.excessQty > 0 ? item.excessQty.toLocaleString() : "0"}
                          </td>
                          <td className="py-2 px-2 text-right font-mono text-muted-foreground">
                            NPR {item.recoveryRate.toLocaleString()}
                          </td>
                          <td className={cn("py-2 px-3 text-right font-bold font-mono", item.debitAmount > 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground")}>
                            {item.debitAmount > 0 ? `NPR ${item.debitAmount.toLocaleString()}` : "—"}
                          </td>
                          <td className="py-2 px-2 text-center">
                            {isExcess ? (
                              <Badge variant="destructive" className="text-[9px] px-1.5 py-0 font-bold gap-1 uppercase">
                                <ShieldAlert className="h-2.5 w-2.5" /> Debit Due
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="text-[9px] px-1.5 py-0 font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 gap-1 uppercase">
                                <CheckCircle2 className="h-2.5 w-2.5" /> Balanced
                              </Badge>
                            )}
                          </td>
                        </tr>

                        {/* Transaction history drawer */}
                        {isExpanded && item.transactions.length > 0 && (
                          <tr key={`${item.materialId}-details`} className="bg-muted/30">
                            <td colSpan={11} className="p-3 pl-8">
                              <div className="rounded border bg-card p-2.5 space-y-2">
                                <div className="flex items-center justify-between text-[11px] font-bold">
                                  <span>Issue & Return Slips for {item.name}</span>
                                  <span className="text-[10px] text-muted-foreground font-normal">
                                    {item.transactions.length} total records
                                  </span>
                                </div>
                                <table className="w-full text-[10px]">
                                  <thead>
                                    <tr className="border-b text-muted-foreground text-left uppercase">
                                      <th className="py-1">Date</th>
                                      <th className="py-1">Type</th>
                                      <th className="py-1">Ref / Slip #</th>
                                      <th className="py-1 text-right">Quantity</th>
                                      <th className="py-1 text-right">Rate</th>
                                      <th className="py-1">Remarks</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-border/30">
                                    {item.transactions.map((tx) => (
                                      <tr key={tx.id} className="hover:bg-muted/20">
                                        <td className="py-1">{format(new Date(tx.date), "dd MMM yyyy")}</td>
                                        <td className="py-1">
                                          <Badge variant="outline" className={cn("text-[8px] uppercase", tx.type === "issue" ? "text-emerald-600" : "text-blue-600")}>
                                            {tx.type}
                                          </Badge>
                                        </td>
                                        <td className="py-1 font-mono text-muted-foreground">{tx.reference || "—"}</td>
                                        <td className="py-1 text-right font-bold font-mono">{tx.quantity.toLocaleString()} {item.unit}</td>
                                        <td className="py-1 text-right font-mono">NPR {tx.rate.toLocaleString()}</td>
                                        <td className="py-1 text-muted-foreground italic truncate max-w-[200px]">{tx.remarks || "—"}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })
                )}
              </tbody>
              {statement.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 bg-muted/40 font-bold text-xs">
                    <td colSpan={9} className="py-2.5 px-3 text-right">
                      Total Calculated Material Deduction for {selectedSub?.name}:
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-red-600 dark:text-red-400 font-extrabold text-sm">
                      NPR {totalDebit.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
