"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc-client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
  ShieldAlert,
  CheckCircle2,
  Download,
  RefreshCw,
  Layers,
} from "lucide-react";
import { cn } from "@/lib/utils";
import * as XLSX from "@e965/xlsx";
import { toast } from "sonner";
import { formatNpr } from "@/lib/currency";
import { ConstructionTable, ConstructionTableColumn } from "@/components/ui/construction-table";

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

  const columns: ConstructionTableColumn<any>[] = [
    {
      key: "name",
      header: "Material / Item",
      render: (_, item) => (
        <div className="font-sans font-medium text-foreground text-xs">
          {item.name}
          <span className="block text-[9px] font-mono text-muted-foreground">
            {item.transactions?.length || 0} transaction slip(s)
          </span>
        </div>
      ),
    },
    {
      key: "unit",
      header: "Unit",
      align: "center",
      render: (_, item) => <span className="text-muted-foreground text-[10px] font-mono">{item.unit}</span>,
    },
    {
      key: "issuedQty",
      header: "Issued",
      align: "right",
      render: (_, item) => (
        <span className="text-success font-mono text-xs font-semibold">
          {item.issuedQty.toLocaleString()}
        </span>
      ),
    },
    {
      key: "returnedQty",
      header: "Returned",
      align: "right",
      render: (_, item) => (
        <span className="text-info font-mono text-xs">
          {item.returnedQty > 0 ? item.returnedQty.toLocaleString() : "—"}
        </span>
      ),
    },
    {
      key: "netIssuedQty",
      header: "Net Handed",
      align: "right",
      render: (_, item) => (
        <span className="font-bold font-mono text-xs text-foreground">
          {item.netIssuedQty.toLocaleString()}
        </span>
      ),
    },
    {
      key: "theoreticalReq",
      header: "Theoretical Req",
      align: "right",
      render: (_, item) => (
        <span className="text-info dark:text-info/80 font-mono text-xs font-medium">
          {item.theoreticalReq.toLocaleString()}
        </span>
      ),
    },
    {
      key: "allowedWastage",
      header: "Allowed (2%)",
      align: "right",
      render: (_, item) => (
        <span className="text-muted-foreground font-mono text-xs">
          {item.allowedWastage.toLocaleString()}
        </span>
      ),
    },
    {
      key: "excessQty",
      header: "Excess Qty",
      align: "right",
      render: (_, item) => (
        <span
          className={cn(
            "font-mono text-xs font-bold",
            item.excessQty > 0 ? "text-red-600 dark:text-red-400 font-extrabold" : "text-muted-foreground"
          )}
        >
          {item.excessQty > 0 ? item.excessQty.toLocaleString() : "0"}
        </span>
      ),
    },
    {
      key: "recoveryRate",
      header: "Recovery Rate",
      align: "right",
      render: (_, item) => (
        <span className="font-mono text-xs text-muted-foreground">
          {formatNpr(item.recoveryRate)}
        </span>
      ),
    },
    {
      key: "debitAmount",
      header: "Debit (NPR)",
      align: "right",
      render: (_, item) => (
        <span
          className={cn(
            "font-mono text-xs font-bold",
            item.debitAmount > 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground"
          )}
        >
          {item.debitAmount > 0 ? formatNpr(item.debitAmount) : "—"}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      align: "center",
      render: (_, item) => {
        const isExcess = item.excessQty > 0;
        return isExcess ? (
          <Badge variant="destructive" className="text-[9px] px-1.5 py-0 font-bold gap-1 uppercase font-mono">
            <ShieldAlert className="h-2.5 w-2.5" /> Debit Due
          </Badge>
        ) : (
          <Badge variant="secondary" className="text-[9px] px-1.5 py-0 font-bold bg-success/15 text-success dark:bg-success dark:text-success/80 gap-1 uppercase font-mono">
            <CheckCircle2 className="h-2.5 w-2.5" /> Balanced
          </Badge>
        );
      },
    },
  ];

  return (
    <div className="space-y-4">
      {/* Top Filter & Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-muted/40 rounded-lg border border-border/80">
        <div className="flex items-center gap-3">
          <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider font-mono">
            Select Subcontractor:
          </span>
          <Select value={selectedSubId} onValueChange={setSelectedSubId}>
            <SelectTrigger className="w-[260px] h-8 text-xs font-medium">
              <SelectValue placeholder="Choose Subcontractor..." />
            </SelectTrigger>
            <SelectContent>
              {subcontractors.map((s) => (
                <SelectItem key={s.id} value={s.id} className="text-xs font-mono">
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <div className="px-3 py-1 bg-muted/60 rounded-md border text-xs font-mono">
            <span className="text-muted-foreground text-[10px] uppercase mr-2">Total Debit:</span>
            <span className="font-bold text-red-600 dark:text-red-400">{formatNpr(totalDebit)}</span>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="h-8 text-xs gap-1.5 font-mono"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />
            Recalculate
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleExportExcel}
            className="h-8 text-xs gap-1.5 font-mono"
          >
            <Download className="h-3.5 w-3.5" />
            Excel
          </Button>
        </div>
      </div>

      {/* Central Table Engine */}
      <ConstructionTable
        data={statement}
        columns={columns}
        isLoading={isLoading}
        searchPlaceholder="Search reconciliation items..."
        searchFilterKeys={["name", "unit"]}
        renderRowPreview={(item) =>
          item.transactions && item.transactions.length > 0 ? (
            <div className="space-y-2 p-2 font-mono text-xs">
              <div className="font-semibold text-foreground">Transaction Slips for {item.name}:</div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                {item.transactions.map((tx: any, i: number) => (
                  <div key={i} className="p-2 rounded bg-muted/30 border text-[11px] space-y-0.5">
                    <div className="flex justify-between font-bold">
                      <span>{tx.slipNo || `Slip #${i + 1}`}</span>
                      <span className={tx.type === "issue" ? "text-success" : "text-info"}>
                        {tx.type === "issue" ? "+" : "-"}{tx.quantity} {item.unit}
                      </span>
                    </div>
                    <div className="text-muted-foreground text-[10px]">
                      {tx.date ? new Date(tx.date).toLocaleDateString() : ""} {tx.remarks ? `• ${tx.remarks}` : ""}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="p-2 text-xs text-muted-foreground font-mono">No transaction slips detailed.</div>
          )
        }
      />
    </div>
  );
}
