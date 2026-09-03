"use client";

import { format } from "date-fns";
import { ArrowUpDown, Wrench } from "lucide-react";
import { ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTable } from "@/components/ui/data-table";
import { Maintenance } from "./types";

export function EquipmentMaintenanceTab({
  isMaintLoading,
  maintenance,
  canWrite,
  setActiveMaintId,
  setResolveOpen,
}: {
  isMaintLoading: boolean;
  maintenance: Maintenance[];
  canWrite: boolean;
  setActiveMaintId: (id: string) => void;
  setResolveOpen: (open: boolean) => void;
}) {
  const maintenanceColumns: ColumnDef<Maintenance>[] = [
    {
      accessorKey: "date",
      size: 95,
      minSize: 85,
      maxSize: 110,
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
          {format(new Date(row.original.date ?? ""), "dd MMM yyyy")}
        </span>
      ),
    },
    {
      accessorKey: "equipment.name",
      size: 200,
      minSize: 150,
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
      accessorKey: "type",
      size: 130,
      minSize: 100,
      maxSize: 150,
      header: "Service Type",
      cell: ({ row }) => (
        <Badge variant="outline" className="text-[9.5px] font-medium capitalize bg-muted/30">
          {row.original.type}
        </Badge>
      ),
    },
    {
      accessorKey: "cost",
      size: 110,
      minSize: 90,
      maxSize: 130,
      header: () => <div className="text-right">Cost (NPR)</div>,
      cell: ({ row }) => (
        <div className="text-right font-bold text-foreground font-mono text-xs">
          {row.original.cost.toLocaleString()}
        </div>
      ),
    },
    {
      accessorKey: "status",
      size: 100,
      minSize: 85,
      maxSize: 115,
      header: "Status",
      cell: ({ row }) => {
        const color =
          row.original.status === "resolved"
            ? "bg-success/15 text-success dark:bg-success dark:text-success/80"
            : "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300";
        return (
          <Badge
            variant="secondary"
            className={`${color} text-[9.5px] font-medium capitalize whitespace-nowrap`}
          >
            {row.original.status}
          </Badge>
        );
      },
    },
    {
      accessorKey: "description",
      size: 250,
      minSize: 160,
      header: "Description / Notes",
      cell: ({ row }) => (
        <span className="text-muted-foreground text-xs break-words whitespace-normal">
          {row.original.description || "—"}
        </span>
      ),
    },
    {
      id: "actions",
      size: 80,
      minSize: 70,
      maxSize: 90,
      header: () => <div className="text-right"></div>,
      cell: ({ row }) => {
        if (!canWrite || row.original.status !== "pending") return null;
        return (
          <div className="flex items-center justify-end">
            <Button
              size="sm"
              variant="outline"
              className="h-6.5 px-2 text-[10.5px] font-medium border-success/40 text-success bg-success hover:bg-success/15 gap-1 rounded-md"
              onClick={() => {
                setActiveMaintId(row.original.id);
                setResolveOpen(true);
              }}
            >
              <Wrench className="h-3 w-3" /> Resolve
            </Button>
          </div>
        );
      },
    },
  ];

  if (isMaintLoading) {
    return <Skeleton className="h-64" />;
  }

  return (
    <DataTable
      tableId="equipment-table-maint"
      columns={maintenanceColumns}
      data={maintenance}
      searchPlaceholder="Search maintenance tickets by description..."
      searchColumn="description"
    />
  );
}
