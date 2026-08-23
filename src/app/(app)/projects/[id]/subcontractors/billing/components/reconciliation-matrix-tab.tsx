"use client";

import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc-client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Download,
  Search,
  AlertTriangle,
  CheckCircle2,
  ShieldAlert,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import * as XLSX from "@e965/xlsx";
import { toast } from "sonner";

export function ReconciliationMatrixTab({ projectId }: { projectId: string }) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data, isLoading, refetch, isFetching } =
    trpc.subcontractorBill.getReconciliationMatrix.useQuery({
      projectId,
      q: search || undefined,
    });

  const subcontractors = data?.subcontractors || [];
  const rows = data?.rows || [];
  const summary = data?.summary;

  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      return true;
    });
  }, [rows, statusFilter]);

  const handleExportExcel = () => {
    if (!data || !rows.length) {
      toast.info("No data available to export");
      return;
    }

    try {
      const headers = [
        "BOQ Code",
        "Description",
        "Unit",
        "Contract BOQ Qty",
        "BOQ Rate (NPR)",
        "Contract BOQ Amount (NPR)",
        "Client IPC Certified Qty",
        "Client IPC Amount (NPR)",
        ...subcontractors.flatMap((s) => [
          `${s.name} (Qty)`,
          `${s.name} (Rate)`,
          `${s.name} (Amount)`,
        ]),
        "Total Subcontractor Qty",
        "Total Subcontractor Amount (NPR)",
        "Balance Qty",
        "Balance Amount (NPR)",
        "Gross Margin (NPR)",
        "Verification Status",
      ];

      const exportData = rows.map((r) => {
        const rowObj: Record<string, any> = {
          "BOQ Code": r.boqCode || "",
          Description: r.description,
          Unit: r.unit || "",
          "Contract BOQ Qty": r.boqQty,
          "BOQ Rate (NPR)": r.boqRate,
          "Contract BOQ Amount (NPR)": r.boqAmount,
          "Client IPC Certified Qty": r.ipcQty,
          "Client IPC Amount (NPR)": r.ipcAmount,
        };

        for (const s of subcontractors) {
          const claim = r.subBreakdown[s.id] || { qty: 0, rate: 0, amount: 0 };
          rowObj[`${s.name} (Qty)`] = claim.qty;
          rowObj[`${s.name} (Rate)`] = claim.rate;
          rowObj[`${s.name} (Amount)`] = claim.amount;
        }

        rowObj["Total Subcontractor Qty"] = r.totalSubQty;
        rowObj["Total Subcontractor Amount (NPR)"] = r.totalSubAmount;
        rowObj["Balance Qty"] = r.balanceQty;
        rowObj["Balance Amount (NPR)"] = r.balanceAmount;
        rowObj["Gross Margin (NPR)"] = r.marginGain;
        rowObj["Verification Status"] =
          r.status === "exceeds_boq"
            ? "OVER-CLAIM (Exceeds BOQ)"
            : r.status === "exceeds_ipc"
            ? "UNCERTIFIED (Exceeds IPC)"
            : r.status === "ok"
            ? "OK / Verified"
            : "Not Started";

        return rowObj;
      });

      const ws = XLSX.utils.json_to_sheet(exportData, { header: headers });
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Reconciliation Matrix");

      const colWidths = headers.map((h) => ({ wch: Math.max(h.length + 3, 14) }));
      ws["!cols"] = colWidths;

      XLSX.writeFile(wb, `subcontractor-reconciliation-matrix-${new Date().toISOString().slice(0, 10)}.xlsx`);
      toast.success("Excel exported successfully");
    } catch {
      toast.error("Failed to export Excel");
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Banner KPI Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2.5">
          <Card className="p-3 border-l-4 border-l-primary shadow-xs">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Contract BOQ</p>
            <p className="text-base font-bold font-mono">NPR {summary.totalBoqAmount.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</p>
            <p className="text-[9px] text-muted-foreground mt-0.5">{summary.totalItems} Work Items</p>
          </Card>

          <Card className="p-3 border-l-4 border-l-blue-500 shadow-xs">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Client IPC Certified</p>
            <p className="text-base font-bold font-mono text-blue-600 dark:text-blue-400">NPR {summary.totalIpcAmount.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</p>
            <p className="text-[9px] text-muted-foreground mt-0.5">
              {summary.totalBoqAmount > 0 ? Math.round((summary.totalIpcAmount / summary.totalBoqAmount) * 100) : 0}% of Scope
            </p>
          </Card>

          <Card className="p-3 border-l-4 border-l-violet-500 shadow-xs">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Subcontractors Total</p>
            <p className="text-base font-bold font-mono text-violet-600 dark:text-violet-400">NPR {summary.totalSubcontractorAmount.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</p>
            <p className="text-[9px] text-muted-foreground mt-0.5">{subcontractors.length} Subcontractor Packages</p>
          </Card>

          <Card className="p-3 border-l-4 border-l-emerald-500 shadow-xs">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Gross Margin Captured</p>
            <p className="text-base font-bold font-mono text-emerald-600 dark:text-emerald-400">NPR {summary.totalMarginGain.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</p>
            <p className="text-[9px] text-muted-foreground mt-0.5">Rate differential</p>
          </Card>

          <Card className={cn("p-3 border-l-4 shadow-xs", summary.overClaimCount > 0 ? "border-l-red-500 bg-red-50/30 dark:bg-red-950/20" : "border-l-slate-300")}>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium flex items-center gap-1">
              {summary.overClaimCount > 0 && <ShieldAlert className="h-3 w-3 text-red-600" />} Over-Scope Claims
            </p>
            <p className={cn("text-base font-bold font-mono", summary.overClaimCount > 0 ? "text-red-600" : "text-slate-700 dark:text-slate-300")}>
              {summary.overClaimCount} items
            </p>
            <p className="text-[9px] text-muted-foreground mt-0.5">Exceeds 100% BOQ</p>
          </Card>

          <Card className={cn("p-3 border-l-4 shadow-xs", summary.exceedsIpcCount > 0 ? "border-l-amber-500 bg-amber-50/30 dark:bg-amber-950/20" : "border-l-slate-300")}>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium flex items-center gap-1">
              {summary.exceedsIpcCount > 0 && <AlertTriangle className="h-3 w-3 text-amber-600" />} Uncertified IPC Risk
            </p>
            <p className={cn("text-base font-bold font-mono", summary.exceedsIpcCount > 0 ? "text-amber-600" : "text-slate-700 dark:text-slate-300")}>
              {summary.exceedsIpcCount} items
            </p>
            <p className="text-[9px] text-muted-foreground mt-0.5">Billed ahead of Client</p>
          </Card>
        </div>
      )}

      {/* Action & Filter Toolbar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5">
        <div className="flex flex-1 items-center gap-2 w-full sm:max-w-md">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search by BOQ Code or Description..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 text-xs pl-8"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-8 w-44 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="exceeds_boq">🔴 Over-Claim (Exceeds BOQ)</SelectItem>
              <SelectItem value="exceeds_ipc">🟡 Uncertified (Exceeds IPC)</SelectItem>
              <SelectItem value="ok">🟢 OK / Verified</SelectItem>
              <SelectItem value="not_started">⚪ Not Started</SelectItem>
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
            Export Matrix (Excel)
          </Button>
        </div>
      </div>

      {/* Master Cross-Package Spreadsheet Grid */}
      <Card className="overflow-hidden border border-border/80 shadow-xs">
        <div className="overflow-x-auto max-h-[600px] relative">
          <table className="w-full text-xs font-mono border-collapse tabular-nums">
            <thead className="sticky top-0 z-20 bg-muted/95 backdrop-blur-sm border-b shadow-2xs">
              {/* Level 1 Group Headers */}
              <tr className="border-b text-[10px] uppercase font-bold tracking-wide">
                <th colSpan={5} className="py-2 px-3 text-left bg-slate-100 dark:bg-slate-900 border-r text-slate-800 dark:text-slate-200">
                  Main Contract (BOQ Master)
                </th>
                <th colSpan={2} className="py-2 px-2 text-center bg-blue-100 dark:bg-blue-950/60 border-r text-blue-900 dark:text-blue-200">
                  Client Certified (IPC)
                </th>
                {subcontractors.map((s, idx) => (
                  <th
                    key={s.id}
                    colSpan={2}
                    className={cn(
                      "py-2 px-2 text-center border-r",
                      idx % 2 === 0 ? "bg-amber-100 dark:bg-amber-950/50 text-amber-900 dark:text-amber-200" : "bg-emerald-100 dark:bg-emerald-950/50 text-emerald-900 dark:text-emerald-200"
                    )}
                  >
                    {s.name}
                  </th>
                ))}
                <th colSpan={3} className="py-2 px-2 text-center bg-violet-100 dark:bg-violet-950/60 border-r text-violet-900 dark:text-violet-200">
                  Total Subcontractor Claims
                </th>
                <th colSpan={2} className="py-2 px-2 text-center bg-slate-200 dark:bg-slate-800 text-slate-900 dark:text-slate-100">
                  Verification & Balance
                </th>
              </tr>
              {/* Level 2 Column Headers */}
              <tr className="text-left text-[10px] text-muted-foreground border-b bg-card">
                <th className="py-2 px-2 w-16">Code</th>
                <th className="py-2 px-3 min-w-[200px]">Description</th>
                <th className="py-2 px-1 text-center w-12">Unit</th>
                <th className="py-2 px-2 text-right w-20">BOQ Qty</th>
                <th className="py-2 px-2 text-right w-24 border-r">BOQ Rate</th>
                <th className="py-2 px-2 text-right w-20 bg-blue-50/50 dark:bg-blue-950/20">IPC Qty</th>
                <th className="py-2 px-2 text-right w-24 bg-blue-50/50 dark:bg-blue-950/20 border-r">IPC Value</th>
                {subcontractors.map((s) => (
                  <th key={`${s.id}-headers`} colSpan={2} className="py-2 px-1 border-r text-center">
                    <div className="grid grid-cols-2 text-[9px]">
                      <span className="text-right pr-1">Qty</span>
                      <span className="text-right pr-1">Rate</span>
                    </div>
                  </th>
                ))}
                <th className="py-2 px-2 text-right w-20 bg-violet-50/50 dark:bg-violet-950/20">Total Qty</th>
                <th className="py-2 px-2 text-right w-24 bg-violet-50/50 dark:bg-violet-950/20">Total Amt</th>
                <th className="py-2 px-2 text-right w-20 bg-violet-50/50 dark:bg-violet-950/20 border-r">Margin</th>
                <th className="py-2 px-2 text-right w-20">Balance Qty</th>
                <th className="py-2 px-2 text-center w-28">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {isLoading ? (
                <tr>
                  <td colSpan={12 + subcontractors.length * 2} className="p-8 text-center text-muted-foreground">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-primary" />
                    Loading Master Subcontractor Reconciliation Matrix...
                  </td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={12 + subcontractors.length * 2} className="p-8 text-center text-muted-foreground">
                    No items found matching the filter.
                  </td>
                </tr>
              ) : (
                filteredRows.map((r, i) => {
                  const isOverClaim = r.status === "exceeds_boq";
                  const isOverIpc = r.status === "exceeds_ipc";

                  return (
                    <tr
                      key={r.boqId}
                      className={cn(
                        "hover:bg-muted/15 transition-colors",
                        i % 2 === 1 ? "bg-muted/5" : "bg-card",
                        isOverClaim && "bg-red-50/40 dark:bg-red-950/20 text-red-950 dark:text-red-200",
                        isOverIpc && "bg-amber-50/40 dark:bg-amber-950/20"
                      )}
                    >
                      {/* BOQ Code */}
                      <td className="py-1.5 px-2 font-bold text-primary">{r.boqCode || "—"}</td>

                      {/* Description */}
                      <td className="py-1.5 px-3 font-sans font-medium text-foreground truncate max-w-[220px]" title={r.description}>
                        {r.description}
                      </td>

                      {/* Unit */}
                      <td className="py-1.5 px-1 text-center text-muted-foreground text-[10px]">{r.unit || "—"}</td>

                      {/* Contract BOQ Qty */}
                      <td className="py-1.5 px-2 text-right font-medium">{r.boqQty.toLocaleString()}</td>

                      {/* Contract BOQ Rate */}
                      <td className="py-1.5 px-2 text-right text-muted-foreground border-r font-mono">
                        {r.boqRate.toLocaleString()}
                      </td>

                      {/* Client IPC Certified Qty */}
                      <td className="py-1.5 px-2 text-right bg-blue-50/30 dark:bg-blue-950/10 font-bold text-blue-700 dark:text-blue-400">
                        {r.ipcQty > 0 ? r.ipcQty.toLocaleString() : "—"}
                      </td>

                      {/* Client IPC Certified Value */}
                      <td className="py-1.5 px-2 text-right bg-blue-50/30 dark:bg-blue-950/10 border-r text-muted-foreground font-mono">
                        {r.ipcAmount > 0 ? r.ipcAmount.toLocaleString("en-IN", { maximumFractionDigits: 0 }) : "—"}
                      </td>

                      {/* Subcontractor Columns */}
                      {subcontractors.map((s) => {
                        const claim = r.subBreakdown[s.id];
                        const hasClaim = claim && claim.qty > 0;

                        return (
                          <td key={s.id} colSpan={2} className="py-1.5 px-1 border-r">
                            {hasClaim ? (
                              <div className="grid grid-cols-2 text-[10px]">
                                <span className="text-right font-semibold text-foreground pr-1">{claim.qty.toLocaleString()}</span>
                                <span className="text-right text-muted-foreground font-mono pr-1">{claim.rate.toLocaleString()}</span>
                              </div>
                            ) : (
                              <span className="text-center block text-muted-foreground/40">—</span>
                            )}
                          </td>
                        );
                      })}

                      {/* Total Subcontractor Qty */}
                      <td className={cn("py-1.5 px-2 text-right font-bold bg-violet-50/30 dark:bg-violet-950/10", isOverClaim && "text-red-600 dark:text-red-400 font-extrabold")}>
                        {r.totalSubQty > 0 ? r.totalSubQty.toLocaleString() : "—"}
                      </td>

                      {/* Total Subcontractor Amount */}
                      <td className="py-1.5 px-2 text-right font-mono bg-violet-50/30 dark:bg-violet-950/10">
                        {r.totalSubAmount > 0 ? r.totalSubAmount.toLocaleString("en-IN", { maximumFractionDigits: 0 }) : "—"}
                      </td>

                      {/* Margin Gain */}
                      <td className={cn("py-1.5 px-2 text-right font-mono border-r bg-violet-50/30 dark:bg-violet-950/10", r.marginGain > 0 ? "text-emerald-600 dark:text-emerald-400 font-semibold" : "text-muted-foreground")}>
                        {r.marginGain !== 0 ? r.marginGain.toLocaleString("en-IN", { maximumFractionDigits: 0 }) : "—"}
                      </td>

                      {/* Balance Remaining Qty */}
                      <td className={cn("py-1.5 px-2 text-right font-bold", r.balanceQty < 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground")}>
                        {r.balanceQty.toLocaleString()}
                      </td>

                      {/* Status Badge */}
                      <td className="py-1.5 px-2 text-center">
                        {r.status === "exceeds_boq" ? (
                          <Badge variant="destructive" className="text-[9px] px-1.5 py-0 font-bold gap-1 uppercase">
                            <ShieldAlert className="h-2.5 w-2.5" /> Over-Claim
                          </Badge>
                        ) : r.status === "exceeds_ipc" ? (
                          <Badge variant="secondary" className="text-[9px] px-1.5 py-0 font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 gap-1 uppercase">
                            <AlertTriangle className="h-2.5 w-2.5" /> &gt; IPC Qty
                          </Badge>
                        ) : r.status === "ok" ? (
                          <Badge variant="secondary" className="text-[9px] px-1.5 py-0 font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 gap-1 uppercase">
                            <CheckCircle2 className="h-2.5 w-2.5" /> Verified
                          </Badge>
                        ) : (
                          <span className="text-[10px] text-muted-foreground/60">Not Started</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
