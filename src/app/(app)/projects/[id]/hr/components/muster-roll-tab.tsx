"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Download,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import * as XLSX from "@e965/xlsx";
import { toast } from "sonner";
import { format } from "date-fns";
import { formatNpr } from "@/lib/currency";
import { ConstructionTable, ConstructionTableColumn } from "@/components/ui/construction-table";

export function MusterRollTab({ projectId }: { projectId: string }) {
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    return format(new Date(), "yyyy-MM");
  });
  const [gangFilter, setGangFilter] = useState<string>("all");

  const { data, isLoading, refetch, isFetching } = trpc.hr.getMusterRoll.useQuery({
    projectId,
    month: selectedMonth,
    gangName: gangFilter === "all" ? undefined : gangFilter,
  });

  const rows = data?.rows || [];
  const daysInMonth = data?.daysInMonth || 31;
  const summary = data?.summary;

  const dayNumbers = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const handleExportExcel = () => {
    if (!rows.length) {
      toast.info("No muster roll data to export");
      return;
    }

    try {
      const headers = [
        "Worker Name",
        "Designation",
        "Category",
        "Gang / Toli",
        "Daily Wage (NPR)",
        ...dayNumbers.map((d) => `Day ${d}`),
        "Total Present Days",
        "Total Half Days",
        "Total Absent Days",
        "Total Leave Days",
        "Effective Man-Days",
        "Total OT Hours",
        "Estimated Gross Wage (NPR)",
      ];

      const exportRows = rows.map((r) => {
        const rowObj: Record<string, any> = {
          "Worker Name": r.name,
          Designation: r.designation || "",
          Category: r.category || "",
          "Gang / Toli": r.gangName || "",
          "Daily Wage (NPR)": r.dailyWage,
        };

        for (let d = 1; d <= daysInMonth; d++) {
          const dayInfo = r.days[d];
          let statusText = "—";
          if (dayInfo?.status === "present") statusText = "P";
          else if (dayInfo?.status === "half_day") statusText = "HD";
          else if (dayInfo?.status === "absent") statusText = "A";
          else if (dayInfo?.status === "leave") statusText = "L";
          else if (dayInfo?.status === "overtime") statusText = `OT (${dayInfo.overtime}h)`;
          rowObj[`Day ${d}`] = statusText;
        }

        rowObj["Total Present Days"] = r.presentDays;
        rowObj["Total Half Days"] = r.halfDays;
        rowObj["Total Absent Days"] = r.absentDays;
        rowObj["Total Leave Days"] = r.leaveDays;
        rowObj["Effective Man-Days"] = r.effectiveDays;
        rowObj["Total OT Hours"] = r.totalOvertimeHours;
        rowObj["Estimated Gross Wage (NPR)"] = r.estimatedGross;

        return rowObj;
      });

      const ws = XLSX.utils.json_to_sheet(exportRows, { header: headers });
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, `Muster Roll ${selectedMonth}`);

      XLSX.writeFile(wb, `Muster_Roll_${projectId}_${selectedMonth}.xlsx`);
      toast.success("Muster roll exported to Excel successfully");
    } catch (e: any) {
      toast.error(e.message || "Failed to export muster roll");
    }
  };

  const columns: ConstructionTableColumn<any>[] = [
    {
      key: "name",
      header: "Worker Name",
      render: (_, r) => (
        <div className="truncate max-w-[160px]">
          <span className="font-sans font-medium text-foreground">{r.name}</span>
          {r.gangName && (
            <span className="block text-[9px] text-muted-foreground font-mono">
              {r.gangName}
            </span>
          )}
        </div>
      ),
    },
    {
      key: "designation",
      header: "Trade",
      render: (_, r) => (
        <span className="text-muted-foreground text-[10px] truncate max-w-[80px]">
          {r.designation || r.category || "Labor"}
        </span>
      ),
    },
    {
      key: "dailyWage",
      header: "Wage",
      align: "right",
      render: (_, r) => (
        <span className="font-mono text-muted-foreground text-xs">
          {r.dailyWage > 0 ? formatNpr(r.dailyWage) : "—"}
        </span>
      ),
    },
    ...dayNumbers.map((d) => ({
      key: `day_${d}`,
      header: `${d}`,
      align: "center" as const,
      render: (_: any, r: any) => {
        const day = r.days[d];
        const st = day?.status;
        if (st === "present") return <span className="font-bold text-success dark:text-success/80">P</span>;
        if (st === "half_day") return <span className="font-bold text-amber-600 dark:text-amber-400">HD</span>;
        if (st === "absent") return <span className="font-bold text-red-600 dark:text-red-400">A</span>;
        if (st === "leave") return <span className="font-bold text-info dark:text-info/80">L</span>;
        if (st === "overtime") return <span className="font-bold text-info dark:text-info/80 text-[9px]">{day.overtime}h</span>;
        return <span className="text-muted-foreground/30">—</span>;
      },
    })),
    {
      key: "presentDays",
      header: "P",
      align: "right",
      render: (_, r) => <span className="font-bold text-success dark:text-success/80">{r.presentDays}</span>,
    },
    {
      key: "halfDays",
      header: "HD",
      align: "right",
      render: (_, r) => <span className="text-amber-700 dark:text-amber-400">{r.halfDays}</span>,
    },
    {
      key: "absentDays",
      header: "A",
      align: "right",
      render: (_, r) => <span className="text-red-600 dark:text-red-400">{r.absentDays}</span>,
    },
    {
      key: "totalOvertimeHours",
      header: "OT(h)",
      align: "right",
      render: (_, r) => <span className="text-info dark:text-info/80">{r.totalOvertimeHours || "—"}</span>,
    },
    {
      key: "estimatedGross",
      header: "Est. Gross",
      align: "right",
      render: (_, r) => (
        <span className="font-bold font-mono text-foreground text-xs">
          {formatNpr(r.estimatedGross)}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-3">
      {/* Month Picker & Export Controls Ribbon */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-2 bg-muted/30 rounded-md border text-xs">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 font-mono">
            <span className="text-muted-foreground">Month:</span>
            <Input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="h-7 w-36 text-xs font-mono"
            />
          </div>

          <Select value={gangFilter} onValueChange={setGangFilter}>
            <SelectTrigger className="h-7 w-32 text-xs font-mono">
              <SelectValue placeholder="All Gangs" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Gangs</SelectItem>
              <SelectItem value="Civil Gang">Civil Gang</SelectItem>
              <SelectItem value="Steel Fixing Gang">Steel Fixing Gang</SelectItem>
              <SelectItem value="Formwork Gang">Formwork Gang</SelectItem>
              <SelectItem value="Masonry Gang">Masonry Gang</SelectItem>
              <SelectItem value="MEP Gang">MEP Gang</SelectItem>
            </SelectContent>
          </Select>

          <Button
            size="sm"
            variant="ghost"
            onClick={() => refetch()}
            className="h-7 w-7 p-0"
            title="Refresh Muster Roll"
          >
            <RefreshCw className={cn("h-3 w-3", isFetching && "animate-spin")} />
          </Button>
        </div>

        <Button
          size="sm"
          variant="outline"
          onClick={handleExportExcel}
          disabled={rows.length === 0}
          className="h-7 text-xs gap-1.5 font-mono"
        >
          <Download className="h-3 w-3" />
          Export Muster Roll (.xlsx)
        </Button>
      </div>

      {/* Summary Aggregate Stats */}
      {summary && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-2.5 py-1.5 bg-muted/20 rounded border text-[11px] font-mono">
          <div className="flex items-center gap-3">
            <span className="text-foreground font-semibold">
              👷 Headcount: {summary.totalStaff}
            </span>
            <span className="text-muted-foreground/40">│</span>
            <span className="text-success dark:text-success/80 font-semibold">
              Present Man-Days: {summary.totalPresentManDays}
            </span>
            <span className="text-muted-foreground/40">│</span>
            <span className="text-info dark:text-info/80 font-semibold">
              ⏱ Total OT: {summary.totalOtHours} hrs
            </span>
          </div>

          <div>
            <span className="text-foreground font-bold">
              💰 Estimated Gross Wage: {formatNpr(summary.totalEstimatedGross)}
            </span>
          </div>
        </div>

      )}

      {/* Central Table Engine Matrix */}
      <ConstructionTable
        data={rows}
        columns={columns}
        isLoading={isLoading}
        searchPlaceholder="Search muster roll by worker, trade, gang..."
        searchFilterKeys={["name", "designation", "gangName", "category"]}
      />
    </div>
  );
}
