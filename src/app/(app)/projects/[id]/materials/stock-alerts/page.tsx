"use client";

import { use, useMemo } from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc-client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft, AlertTriangle, ShoppingCart, ShieldAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { ConstructionTable, ConstructionTableColumn } from "@/components/ui/construction-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { format } from "date-fns";

type StockAlertItem = {
  id: string;
  name: string;
  code?: string | null;
  unit: string;
  currentStock: number;
  minStock: number;
  reorderLevel: number;
  avgDailyConsumption: number;
  daysUntilStockout: number | null;
  urgency: string;
};

export default function StockAlertsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();

  const { data: projectInfo } = trpc.project.get.useQuery({ id }, { staleTime: 300_000 });
  const { data, isLoading } = trpc.material.stockAlerts.useQuery({ projectId: id });

  const canWrite = projectInfo?.myRole && projectInfo.myRole !== "client" && projectInfo.myRole !== "inspector";
  const alerts = (data?.alerts ?? []) as StockAlertItem[];

  const columns: ConstructionTableColumn<StockAlertItem>[] = useMemo(
    () => [
      {
        key: "name",
        header: "Material Spec",
        sortable: true,
        render: (val, r) => (
          <div>
            <span className="font-bold text-foreground text-xs">{val}</span>
            {r.code && (
              <span className="block text-[10px] text-muted-foreground font-mono">
                Code: {r.code}
              </span>
            )}
          </div>
        ),
      },
      {
        key: "currentStock",
        header: "Current Stock",
        width: "120px",
        align: "right",
        sortable: true,
        render: (val, r) => (
          <span className="font-mono font-bold text-foreground text-xs">
            {val.toLocaleString("en-IN")} {r.unit}
          </span>
        ),
      },
      {
        key: "minStock",
        header: "Min Stock",
        width: "100px",
        align: "right",
        render: (val, r) => (
          <span className="font-mono text-muted-foreground text-xs">
            {val.toLocaleString("en-IN")} {r.unit}
          </span>
        ),
      },
      {
        key: "reorderLevel",
        header: "Reorder Level",
        width: "110px",
        align: "right",
        render: (val, r) => (
          <span className="font-mono text-amber-500 font-semibold text-xs">
            {val.toLocaleString("en-IN")} {r.unit}
          </span>
        ),
      },
      {
        key: "avgDailyConsumption",
        header: "Daily Burn Rate",
        width: "130px",
        align: "right",
        render: (val, r) => (
          <span className="font-mono text-muted-foreground text-xs">
            {val > 0 ? `${val.toLocaleString("en-IN")} ${r.unit}/day` : "—"}
          </span>
        ),
      },
      {
        key: "daysUntilStockout",
        header: "Stockout Est.",
        width: "120px",
        align: "right",
        render: (val) => {
          if (val === null || val === undefined) return <span className="text-muted-foreground">—</span>;
          const isCritical = val <= 3;
          return (
            <span className={`font-mono text-xs font-bold ${isCritical ? "text-red-400" : "text-amber-400"}`}>
              {val} days
            </span>
          );
        },
      },
      {
        key: "urgency",
        header: "Urgency",
        width: "110px",
        align: "center",
        render: (val) => <StatusBadge status={val} />,
      },
    ],
    []
  );

  return (
    <div className="space-y-4 pb-8 font-sans">
      {/* Breadcrumb Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground font-mono">
          <Link href={`/projects/${id}/materials`} className="hover:text-foreground flex items-center gap-1">
            <ChevronLeft className="h-4 w-4" /> Materials
          </Link>
          <span>/</span>
          <span className="text-foreground font-bold">Stock Alerts</span>
        </div>

        {canWrite && (
          <Button
            size="sm"
            onClick={() => router.push(`/projects/${id}/materials?tab=requisitions`)}
            className="h-8 px-3 text-xs font-mono bg-emerald-500 hover:bg-emerald-600 text-black font-semibold"
          >
            <ShoppingCart className="mr-1.5 h-3.5 w-3.5" />
            Create Purchase Requisition
          </Button>
        )}
      </div>

      {/* KPI Ribbon */}
      {data && (
        <div className="grid grid-cols-3 gap-3 font-mono">
          <Card className="bg-[#0c1015] border-white/10 rounded-xl">
            <CardContent className="p-3 text-center">
              <div className="text-[10px] text-muted-foreground uppercase">Total Alerts</div>
              <div className="text-xl font-bold text-slate-300">{data.summary.total}</div>
            </CardContent>
          </Card>
          <Card className="bg-[#0c1015] border-white/10 rounded-xl">
            <CardContent className="p-3 text-center">
              <div className="text-[10px] text-muted-foreground uppercase">Critical (Immediate Reorder)</div>
              <div className="text-xl font-bold text-red-400">{data.summary.critical}</div>
            </CardContent>
          </Card>
          <Card className="bg-[#0c1015] border-white/10 rounded-xl">
            <CardContent className="p-3 text-center">
              <div className="text-[10px] text-muted-foreground uppercase">Warning (Reorder Level)</div>
              <div className="text-xl font-bold text-orange-400">{data.summary.warning}</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ConstructionTable Integration */}
      <ConstructionTable<StockAlertItem>
        data={alerts}
        columns={columns}
        isLoading={isLoading}
        searchPlaceholder="Search material name, code..."
        searchFilterKeys={["name", "code", "urgency"]}
        exportExcel={{
          filename: `Stock_Alerts_${format(new Date(), "yyyy-MM-dd")}`,
          sheetName: "StockAlerts",
        }}
        emptyState={{
          title: "All Materials Adequately Stocked",
          description: "No materials are currently below their minimum safety stock or reorder levels.",
        }}
      />
    </div>
  );
}
