"use client";

import { useState } from "react";
import { format } from "date-fns";
import { ArrowUpDown, Sparkles, ListOrdered, BarChart3 } from "lucide-react";
import { ColumnDef } from "@tanstack/react-table";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTable } from "@/components/ui/data-table";
import { EquipmentLog } from "./types";

export function EquipmentLogsTab({
  isLogsLoading,
  logs,
  isTaskStatsLoading,
  taskStats,
}: {
  isLogsLoading: boolean;
  logs: EquipmentLog[];
  isTaskStatsLoading: boolean;
  taskStats: any[];
}) {
  const [logsSubView, setLogsSubView] = useState<"table" | "tasks">("table");

  const runLogColumns: ColumnDef<EquipmentLog>[] = [
    {
      accessorKey: "date",
      size: 90,
      minSize: 80,
      maxSize: 100,
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="-ml-4 hover:bg-transparent text-xs font-semibold"
        >
          Date <ArrowUpDown className="ml-1.5 h-3.5 w-3.5" />
        </Button>
      ),
      cell: ({ row }) => (
        <span className="text-muted-foreground text-xs whitespace-nowrap">
          {format(new Date(row.original.date), "dd MMM yyyy")}
        </span>
      ),
    },
    {
      accessorKey: "equipment.name",
      size: 160,
      minSize: 120,
      header: "Machine",
      cell: ({ row }) => (
        <div className="py-0.5">
          <span className="font-semibold text-foreground text-xs break-words whitespace-normal">
            {row.original.equipment.name}
          </span>
          {row.original.equipment.code && (
            <span className="text-[10px] text-muted-foreground ml-1 font-mono">
              ({row.original.equipment.code})
            </span>
          )}
        </div>
      ),
    },
    {
      accessorKey: "workedHours",
      size: 85,
      minSize: 70,
      maxSize: 95,
      header: () => <div className="text-right">Run / Dist</div>,
      cell: ({ row }) => {
        const isKm = row.original.equipment.unit === "km";
        return (
          <div className="text-right font-bold text-foreground font-mono text-xs">
            {row.original.workedHours.toFixed(1)} {isKm ? "km" : "hrs"}
          </div>
        );
      },
    },
    {
      id: "activityOutput",
      size: 230,
      minSize: 160,
      header: "Linked Activity & Output",
      cell: ({ row }) => {
        const log = row.original;
        const taskName =
          log.ganttTask?.name ||
          (log.boqItem ? `${log.boqItem.code} - ${log.boqItem.description}` : null);
        const hasOutput = log.outputQty && log.outputQty > 0;
        const hasTrips = log.tripCount && log.tripCount > 0;

        return (
          <div className="py-0.5 text-xs space-y-0.5">
            {taskName ? (
              <div className="font-medium text-foreground truncate flex items-center gap-1">
                <Sparkles className="h-3 w-3 text-violet-600 shrink-0" />
                <span className="truncate">{taskName}</span>
              </div>
            ) : (
              <span className="text-muted-foreground italic text-[11px]">
                General Work (Unlinked)
              </span>
            )}
            <div className="flex items-center gap-1.5 text-[10.5px] font-mono text-muted-foreground">
              {hasOutput && (
                <span className="text-violet-700 dark:text-violet-300 font-semibold">
                  {log.outputQty} {log.outputUnit || "cum"}
                  {log.workedHours > 0 &&
                    ` (~${(log.outputQty! / log.workedHours).toFixed(1)} ${log.outputUnit || "cum"}/hr)`}
                </span>
              )}
              {hasTrips && (
                <span className="text-info dark:text-info/80 font-semibold">
                  • {log.tripCount} Trips
                </span>
              )}
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: "fuelFilled",
      size: 80,
      minSize: 65,
      maxSize: 95,
      header: () => <div className="text-right">Fuel (L)</div>,
      cell: ({ row }) => (
        <div className="text-right text-success font-semibold font-mono text-xs">
          {row.original.fuelFilled > 0 ? `${row.original.fuelFilled} L` : "—"}
        </div>
      ),
    },
    {
      accessorKey: "operator",
      size: 110,
      minSize: 85,
      maxSize: 130,
      header: "Operator",
      cell: ({ row }) => (
        <span className="text-muted-foreground text-xs truncate block">
          {row.original.operator || "—"}
        </span>
      ),
    },
    {
      accessorKey: "workDescription",
      size: 180,
      minSize: 130,
      header: "Location / Notes",
      cell: ({ row }) => (
        <span className="text-muted-foreground text-xs break-words whitespace-normal">
          {row.original.workDescription || "—"}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-3">
      {/* Sub-view Switcher: Logs Table vs Task Utilization Breakdown */}
      <div className="flex items-center justify-between border-b border-border/40 pb-2">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setLogsSubView("table")}
            className={cn(
              "flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md transition-all",
              logsSubView === "table"
                ? "bg-muted text-foreground font-semibold"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <ListOrdered className="h-3.5 w-3.5" />
            <span>Daily Run Logs ({logs.length})</span>
          </button>
          <button
            onClick={() => setLogsSubView("tasks")}
            className={cn(
              "flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md transition-all",
              logsSubView === "tasks"
                ? "bg-muted text-foreground font-semibold"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <BarChart3 className="h-3.5 w-3.5 text-violet-600" />
            <span>Activity & Task Breakdown ({taskStats.length})</span>
          </button>
        </div>
      </div>

      {logsSubView === "table" ? (
        isLogsLoading ? (
          <Skeleton className="h-64" />
        ) : (
          <DataTable
            tableId="equipment-table-logs"
            columns={runLogColumns}
            data={logs}
            searchPlaceholder="Search run logs by operator, machine, task, location..."
            searchColumn="equipment_name"
          />
        )
      ) : isTaskStatsLoading ? (
        <Skeleton className="h-64" />
      ) : (
        <div className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {taskStats.map((t) => (
              <Card key={t.taskId} className="border shadow-2xs">
                <CardContent className="p-3.5 space-y-2">
                  <div className="flex justify-between items-start gap-2">
                    <div className="min-w-0">
                      <div className="font-semibold text-xs text-foreground truncate">
                        {t.taskName}
                      </div>
                      {t.taskCode && (
                        <div className="text-[10px] text-muted-foreground font-mono">
                          Code: {t.taskCode}
                        </div>
                      )}
                    </div>
                    <Badge
                      variant="outline"
                      className="text-[9.5px] font-mono shrink-0 bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-300"
                    >
                      {t.logCount} Shifts
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1 border-t border-border/40 text-xs">
                    <div>
                      <span className="text-muted-foreground">Total Hours:</span>{" "}
                      <strong className="font-mono text-foreground">
                        {t.totalHours.toFixed(1)} hrs
                      </strong>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Fuel Refilled:</span>{" "}
                      <strong className="font-mono text-success">
                        {t.totalFuel > 0 ? `${t.totalFuel} L` : "—"}
                      </strong>
                    </div>
                    {t.totalOutput > 0 && (
                      <div>
                        <span className="text-muted-foreground">Output:</span>{" "}
                        <strong className="font-mono text-violet-700 dark:text-violet-300">
                          {t.totalOutput} {t.outputUnit || "cum"}
                        </strong>
                      </div>
                    )}
                    {t.productivityRate !== null && (
                      <div>
                        <span className="text-muted-foreground">Productivity:</span>{" "}
                        <strong className="font-mono text-info">
                          {t.productivityRate.toFixed(1)} {t.outputUnit || "cum"}/hr
                        </strong>
                      </div>
                    )}
                    {t.totalTrips > 0 && (
                      <div className="col-span-2">
                        <span className="text-muted-foreground">Haulage Trips:</span>{" "}
                        <strong className="font-mono text-foreground">
                          {t.totalTrips} Trips
                        </strong>
                      </div>
                    )}
                  </div>

                  <div className="text-[10px] text-muted-foreground pt-1 border-t border-border/30 truncate">
                    <strong>Fleet Used:</strong> {t.machines.join(", ")}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
