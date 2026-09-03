"use client";

import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc-client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
  AlertTriangle,
  CheckCircle2,
  ShieldAlert,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import * as XLSX from "@e965/xlsx";
import { toast } from "sonner";
import { formatNpr } from "@/lib/currency";
import { ConstructionTable, ConstructionTableColumn } from "@/components/ui/construction-table";

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
        rowObj["Verification Status"] = r.status.toUpperCase();

        return rowObj;
      });

      const ws = XLSX.utils.json_to_sheet(exportData, { header: headers });
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Reconciliation Matrix");

      const colWidths = headers.map((h) => ({ wch: Math.max(h.length + 3, 14) }));
      ws["!cols"] = colWidths;

      XLSX.writeFile(wb, `subcontractor-reconciliation-matrix-${new Date().toISOString().slice(0, 10)}.xlsx`);
      toast.success("Cross-package reconciliation matrix exported");
    } catch {
      toast.error("Failed to export Excel");
    }
  };

  const columns: ConstructionTableColumn<any>[] = [
    {
      key: "boqCode",
      header: "Code",
      render: (_, r) => <span className="font-bold text-primary font-mono text-xs">{r.boqCode || "—"}</span>,
    },
    {
      key: "description",
      header: "Description",
      render: (_, r) => (
        <span className="font-sans font-medium text-foreground text-xs truncate max-w-[200px] block" title={r.description}>
          {r.description}
        </span>
      ),
    },
    {
      key: "unit",
      header: "Unit",
      align: "center",
      render: (_, r) => <span className="text-muted-foreground text-[10px] font-mono">{r.unit || "—"}</span>,
    },
    {
      key: "boqQty",
      header: "BOQ Qty",
      align: "right",
      render: (_, r) => (
        <span className="font-mono text-xs font-medium">{r.boqQty.toLocaleString()}</span>
      ),
    },
    {
      key: "boqRate",
      header: "BOQ Rate",
      align: "right",
      render: (_, r) => (
        <span className="font-mono text-xs text-muted-foreground">{formatNpr(r.boqRate)}</span>
      ),
    },
    {
      key: "ipcQty",
      header: "IPC Qty",
      align: "right",
      render: (_, r) => (
        <span className="font-mono text-xs font-bold text-info dark:text-info/80">
          {r.ipcQty > 0 ? r.ipcQty.toLocaleString() : "—"}
        </span>
      ),
    },
    {
      key: "ipcAmount",
      header: "IPC Value",
      align: "right",
      render: (_, r) => (
        <span className="font-mono text-xs text-muted-foreground">
          {r.ipcAmount > 0 ? formatNpr(r.ipcAmount) : "—"}
        </span>
      ),
    },
    ...subcontractors.map((s) => ({
      key: `sub_${s.id}`,
      header: s.name,
      align: "center" as const,
      render: (_: any, r: any) => {
        const claim = r.subBreakdown[s.id];
        const hasClaim = claim && claim.qty > 0;
        if (!hasClaim) return <span className="text-muted-foreground/30 font-mono text-xs">—</span>;
        return (
          <div className="font-mono text-[11px] text-center">
            <span className="font-semibold text-foreground">{claim.qty.toLocaleString()}</span>
            <span className="text-muted-foreground ml-1">@{formatNpr(claim.rate)}</span>
          </div>
        );
      },
    })),
    {
      key: "totalSubQty",
      header: "Total Sub Qty",
      align: "right",
      render: (_, r) => {
        const isOverClaim = r.status === "exceeds_boq";
        return (
          <span
            className={cn(
              "font-mono text-xs font-bold",
              isOverClaim ? "text-red-600 dark:text-red-400 font-extrabold" : "text-foreground"
            )}
          >
            {r.totalSubQty > 0 ? r.totalSubQty.toLocaleString() : "—"}
          </span>
        );
      },
    },
    {
      key: "totalSubAmount",
      header: "Total Sub Amt",
      align: "right",
      render: (_, r) => (
        <span className="font-mono text-xs">
          {r.totalSubAmount > 0 ? formatNpr(r.totalSubAmount) : "—"}
        </span>
      ),
    },
    {
      key: "marginGain",
      header: "Margin",
      align: "right",
      render: (_, r) => (
        <span
          className={cn(
            "font-mono text-xs",
            r.marginGain > 0 ? "text-success dark:text-success/80 font-semibold" : "text-muted-foreground"
          )}
        >
          {r.marginGain !== 0 ? formatNpr(r.marginGain) : "—"}
        </span>
      ),
    },
    {
      key: "balanceQty",
      header: "Balance Qty",
      align: "right",
      render: (_, r) => (
        <span
          className={cn(
            "font-mono text-xs font-bold",
            r.balanceQty < 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground"
          )}
        >
          {r.balanceQty.toLocaleString()}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      align: "center",
      render: (_, r) => {
        if (r.status === "exceeds_boq") {
          return (
            <Badge variant="destructive" className="text-[9px] px-1.5 py-0 font-bold gap-0.5">
              <ShieldAlert className="h-2.5 w-2.5" /> Over BOQ
            </Badge>
          );
        }
        if (r.status === "exceeds_ipc") {
          return (
            <Badge variant="outline" className="text-[9px] px-1.5 py-0 font-bold border-amber-400 bg-amber-50 dark:bg-amber-950 text-amber-800 dark:text-amber-200 gap-0.5">
              <AlertTriangle className="h-2.5 w-2.5" /> &gt; IPC
            </Badge>
          );
        }
        if (r.status === "ok") {
          return (
            <Badge variant="secondary" className="text-[9px] px-1.5 py-0 font-bold bg-success/15 dark:bg-success text-success dark:text-success/80 gap-0.5">
              <CheckCircle2 className="h-2.5 w-2.5" /> OK
            </Badge>
          );
        }
        return <span className="text-[10px] text-muted-foreground/60 font-mono">—</span>;
      },
    },
  ];

  return (
    <div className="space-y-4">
      {/* KPI Cards */}
      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="p-3 border-l-4 border-l-primary shadow-xs">
            <div className="text-[10px] uppercase font-mono text-muted-foreground">Contract BOQ Total</div>
            <div className="text-base font-bold font-mono text-foreground mt-0.5">
              {formatNpr(summary.totalBoqAmount, { compact: true })}
            </div>
            <div className="text-[11px] text-muted-foreground font-mono mt-0.5">
              {rows.length} Scope Work Items
            </div>
          </Card>

          <Card className="p-3 border-l-4 border-l-info shadow-xs">
            <div className="text-[10px] uppercase font-mono text-muted-foreground">Client IPC Certified</div>
            <div className="text-base font-bold font-mono text-info dark:text-info/80 mt-0.5">
              {formatNpr(summary.totalIpcAmount, { compact: true })}
            </div>
            <div className="text-[11px] text-muted-foreground font-mono mt-0.5">
              Employer Approved Progress
            </div>
          </Card>

          <Card className="p-3 border-l-4 border-l-violet-500 shadow-xs">
            <div className="text-[10px] uppercase font-mono text-muted-foreground">Total Sub Billed</div>
            <div className="text-base font-bold font-mono text-violet-600 dark:text-violet-400 mt-0.5">
              {formatNpr(summary.totalSubcontractorAmount, { compact: true })}
            </div>
            <div className="text-[11px] text-muted-foreground font-mono mt-0.5">
              {subcontractors.length} Subcontractor Packages
            </div>
          </Card>

          <Card className="p-3 border-l-4 border-l-success shadow-xs">
            <div className="text-[10px] uppercase font-mono text-muted-foreground">Retained Margin Gain</div>
            <div className="text-base font-bold font-mono text-success dark:text-success/80 mt-0.5">
              {formatNpr(summary.totalMarginGain, { compact: true })}
            </div>
            <div className="text-[11px] text-muted-foreground font-mono mt-0.5">
              BOQ vs Sub Rate Delta
            </div>
          </Card>
        </div>
      )}


      {/* Filter & Action Ribbon */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-muted/40 rounded-lg border border-border/80">
        <div className="flex items-center gap-3">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[200px] h-8 text-xs font-mono">
              <SelectValue placeholder="All Verification Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Verification Status</SelectItem>
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
            className="h-8 text-xs gap-1.5 font-mono"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />
            Refresh
          </Button>
          <Button
            size="sm"
            onClick={handleExportExcel}
            className="h-8 text-xs bg-success hover:bg-success text-white gap-1.5 font-mono"
          >
            <Download className="h-3.5 w-3.5" />
            Export Matrix (Excel)
          </Button>
        </div>
      </div>

      {/* Central ConstructionTable Matrix */}
      <ConstructionTable
        data={filteredRows}
        columns={columns}
        isLoading={isLoading}
        searchPlaceholder="Search BOQ code, description..."
        searchFilterKeys={["boqCode", "description", "unit"]}
      />
    </div>
  );
}
