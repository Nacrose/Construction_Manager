"use client";

import { ShieldAlert } from "lucide-react";
import { ColumnDef } from "@tanstack/react-table";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";

export function EquipmentFuelTab({
  fuelReconciliation,
  theftCount,
}: {
  fuelReconciliation: any[];
  theftCount: number;
}) {
  const fuelAuditColumns: ColumnDef<any>[] = [
    {
      accessorKey: "name",
      size: 240,
      minSize: 160,
      header: "Machine",
      cell: ({ row }) => (
        <div className="py-0.5">
          <span className="font-semibold text-foreground text-xs break-words whitespace-normal">
            {row.original.name}
          </span>
          {row.original.code && (
            <span className="text-[10px] text-muted-foreground ml-1 font-mono">
              ({row.original.code})
            </span>
          )}
        </div>
      ),
    },
    {
      accessorKey: "factoryFuelRate",
      size: 110,
      minSize: 90,
      maxSize: 130,
      header: () => <div className="text-right">Factory Benchmark</div>,
      cell: ({ row }) => (
        <div className="text-right font-mono text-xs">
          {row.original.factoryFuelRate > 0
            ? row.original.unit === "km"
              ? `${row.original.factoryFuelRate.toFixed(2)} km/L`
              : `${row.original.factoryFuelRate.toFixed(1)} L/hr`
            : "—"}
        </div>
      ),
    },
    {
      accessorKey: "histEfficiency",
      size: 110,
      minSize: 90,
      maxSize: 130,
      header: () => <div className="text-right">Hist Avg</div>,
      cell: ({ row }) => (
        <div className="text-right font-mono text-xs">
          {row.original.histEfficiency > 0 ? `${row.original.histEfficiency.toFixed(2)}` : "—"}
        </div>
      ),
    },
    {
      accessorKey: "currEfficiency",
      size: 115,
      minSize: 95,
      maxSize: 135,
      header: () => <div className="text-right">30-day Avg</div>,
      cell: ({ row }) => {
        const isHigh = row.original.isHighConsumption;
        return (
          <div
            className={`text-right font-mono font-bold text-xs ${isHigh ? "text-red-600" : "text-foreground"}`}
          >
            {row.original.currEfficiency.toFixed(2)}
          </div>
        );
      },
    },
    {
      accessorKey: "variancePct",
      size: 100,
      minSize: 85,
      maxSize: 120,
      header: () => <div className="text-right">Variance</div>,
      cell: ({ row }) => {
        const v = row.original.variancePct;
        const color = row.original.isTheftWarning
          ? "text-red-600 font-bold"
          : v > 0
            ? "text-amber-600 font-semibold"
            : "text-success font-medium";
        return (
          <div className={`text-right font-mono text-xs ${color}`}>
            {v > 0 ? "+" : ""}
            {v.toFixed(1)}%
          </div>
        );
      },
    },
    {
      id: "status",
      size: 120,
      minSize: 100,
      maxSize: 140,
      header: "Status",
      cell: ({ row }) => {
        if (row.original.isTheftWarning)
          return (
            <Badge className="bg-red-100 text-red-700 text-[9.5px] dark:bg-red-950 dark:text-red-300 font-bold whitespace-nowrap">
              Theft Warning
            </Badge>
          );
        if (row.original.isHighConsumption)
          return (
            <Badge className="bg-amber-100 text-amber-700 text-[9.5px] dark:bg-amber-950 dark:text-amber-300 font-medium whitespace-nowrap">
              High Usage
            </Badge>
          );
        return (
          <Badge className="bg-success/15 text-success text-[9.5px] dark:bg-success dark:text-success/80 font-medium whitespace-nowrap">
            Normal
          </Badge>
        );
      },
    },
  ];

  return (
    <div className="space-y-3">
      {theftCount > 0 && (
        <Card className="border-red-200 bg-red-50 dark:border-red-950 dark:bg-red-950/20">
          <CardContent className="flex items-start gap-3 p-3">
            <ShieldAlert className="h-4.5 w-4.5 text-red-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-bold text-red-950 dark:text-red-300">
                Fuel Variance / Theft Warning Detected
              </p>
              <p className="text-[11px] text-red-900 dark:text-red-400 mt-0.5">
                Critical fuel deviations (&gt;5% over standard factory rate) detected on:
                {fuelReconciliation
                  .filter((f) => f.isTheftWarning)
                  .map((f) => ` ${f.name} (+${f.variancePct.toFixed(1)}% excess)`)
                  .join(", ")}
                .
              </p>
            </div>
          </CardContent>
        </Card>
      )}
      <DataTable
        tableId="equipment-table-fuel"
        columns={fuelAuditColumns}
        data={fuelReconciliation || []}
        searchPlaceholder="Search machine audits..."
        searchColumn="name"
      />
    </div>
  );
}
