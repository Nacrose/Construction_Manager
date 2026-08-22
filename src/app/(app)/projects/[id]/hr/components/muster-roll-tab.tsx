"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc-client";
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
  Loader2,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { format } from "date-fns";

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

      const colWidths = headers.map((h) => ({ wch: Math.max(h.length + 2, 7) }));
      colWidths[0] = { wch: 22 };
      colWidths[1] = { wch: 18 };
      ws["!cols"] = colWidths;

      XLSX.writeFile(wb, `muster-roll-${selectedMonth}.xlsx`);
      toast.success("Muster roll exported successfully");
    } catch {
      toast.error("Failed to export muster roll");
    }
  };

  return (
    <div className="space-y-2.5">
      {/* Dense Controls & Export Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-2 bg-muted/30 rounded-md border text-xs">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-muted-foreground">Month:</span>
          <Input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="h-7 text-xs font-mono font-bold w-36"
          />
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => refetch()}
            disabled={isFetching}
            className="h-7 text-xs gap-1.5 px-2.5"
          >
            <RefreshCw className={cn("h-3 w-3", isFetching && "animate-spin")} />
            Refresh
          </Button>
          <Button
            size="sm"
            onClick={handleExportExcel}
            className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 px-3"
          >
            <Download className="h-3 w-3" />
            Export Excel
          </Button>
        </div>
      </div>

      {/* Slim 28px High-Density Inline Metrics Ribbon */}
      {summary && (
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-3 py-1.5 bg-muted/40 rounded border text-[11px] font-mono tabular-nums">
          <div className="flex items-center gap-3">
            <span>
              <strong className="text-foreground">Workforce:</strong> {summary.totalStaff} workers
            </span>
            <span className="text-muted-foreground/40">│</span>
            <span className="text-emerald-600 dark:text-emerald-400 font-bold">
              🟢 Total Man-Days: {summary.totalPresentManDays.toFixed(1)}
            </span>
            <span className="text-muted-foreground/40">│</span>
            <span className="text-blue-600 dark:text-blue-400 font-semibold">
              ⏱ Total OT: {summary.totalOtHours} hrs
            </span>
          </div>

          <div>
            <span className="text-foreground font-bold">
              💰 Estimated Gross Wage: NPR {summary.totalEstimatedGross.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
            </span>
          </div>
        </div>
      )}

      {/* Full-Bleed 31-Day Cross-Grid Matrix Table */}
      <div className="overflow-x-auto rounded border border-border/80 max-h-[calc(100vh-210px)] relative">
        <table className="w-full text-[11px] font-mono border-collapse tabular-nums">
          <thead className="sticky top-0 z-20 bg-muted/95 backdrop-blur-xs border-b shadow-2xs">
            <tr className="text-left text-[10px] text-muted-foreground uppercase">
              <th className="py-2 px-2 w-8 text-center">#</th>
              <th className="py-2 px-3 min-w-[150px] font-semibold text-foreground">Worker Name</th>
              <th className="py-2 px-2 w-20">Trade</th>
              <th className="py-2 px-2 text-right w-16 border-r">Wage</th>
              {dayNumbers.map((d) => (
                <th key={d} className="py-1.5 px-0.5 text-center w-6 text-[9px] font-bold border-r border-border/30">
                  {d}
                </th>
              ))}
              <th className="py-2 px-2 text-right w-12 bg-emerald-50/50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-300 font-bold">
                P
              </th>
              <th className="py-2 px-2 text-right w-10 bg-amber-50/50 dark:bg-amber-950/20 text-amber-700">HD</th>
              <th className="py-2 px-2 text-right w-10 bg-red-50/50 dark:bg-red-950/20 text-red-600">A</th>
              <th className="py-2 px-2 text-right w-12 bg-blue-50/50 dark:bg-blue-950/20 text-blue-600">OT(h)</th>
              <th className="py-2 px-3 text-right w-24 font-bold text-foreground bg-muted/40">Est. Gross</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/30">
            {isLoading ? (
              <tr>
                <td colSpan={5 + daysInMonth + 5} className="p-8 text-center text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin mx-auto mb-1.5 text-primary" />
                  Loading monthly 31-day muster roll matrix...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={5 + daysInMonth + 5} className="p-8 text-center text-muted-foreground">
                  No active staff found for this month.
                </td>
              </tr>
            ) : (
              rows.map((r, idx) => (
                <tr key={r.staffId} className="hover:bg-muted/20 transition-colors">
                  <td className="py-1 px-2 text-center text-[10px] text-muted-foreground">{idx + 1}</td>

                  <td className="py-1 px-3 font-sans font-medium text-foreground truncate max-w-[160px]">
                    {r.name}
                    {r.gangName && (
                      <span className="block text-[9px] text-muted-foreground font-mono">
                        {r.gangName}
                      </span>
                    )}
                  </td>

                  <td className="py-1 px-2 text-muted-foreground text-[10px] truncate max-w-[80px]">
                    {r.designation || r.category || "Labor"}
                  </td>

                  <td className="py-1 px-2 text-right text-muted-foreground border-r font-mono">
                    {r.dailyWage > 0 ? r.dailyWage.toLocaleString() : "—"}
                  </td>

                  {/* 31 Days Grid */}
                  {dayNumbers.map((d) => {
                    const day = r.days[d];
                    const st = day?.status;

                    let cellBg = "text-muted-foreground/30";
                    let label = "—";

                    if (st === "present") {
                      cellBg = "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-bold";
                      label = "P";
                    } else if (st === "half_day") {
                      cellBg = "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 font-bold";
                      label = "HD";
                    } else if (st === "absent") {
                      cellBg = "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300 font-bold";
                      label = "A";
                    } else if (st === "leave") {
                      cellBg = "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300 font-bold";
                      label = "L";
                    } else if (st === "overtime") {
                      cellBg = "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 font-bold";
                      label = `OT${day.overtime}`;
                    }

                    return (
                      <td
                        key={d}
                        className={cn(
                          "py-0.5 px-0 text-center border-r border-border/20 text-[9px]",
                          cellBg
                        )}
                        title={`Day ${d}: ${st || "Unlogged"}${day?.overtime ? ` (${day.overtime}h OT)` : ""}`}
                      >
                        {label}
                      </td>
                    );
                  })}

                  <td className="py-1 px-2 text-right font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50/20 dark:bg-emerald-950/10">
                    {r.presentDays}
                  </td>
                  <td className="py-1 px-2 text-right text-amber-600 bg-amber-50/20 dark:bg-amber-950/10">
                    {r.halfDays > 0 ? r.halfDays : "0"}
                  </td>
                  <td className="py-1 px-2 text-right text-red-600 bg-red-50/20 dark:bg-red-950/10">
                    {r.absentDays > 0 ? r.absentDays : "0"}
                  </td>
                  <td className="py-1 px-2 text-right font-bold text-blue-600 bg-blue-50/20 dark:bg-blue-950/10">
                    {r.totalOvertimeHours > 0 ? `${r.totalOvertimeHours}h` : "0"}
                  </td>
                  <td className="py-1 px-3 text-right font-bold font-mono text-foreground bg-muted/30">
                    NPR {r.estimatedGross.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
