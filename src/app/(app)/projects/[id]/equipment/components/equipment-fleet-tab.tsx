"use client";

import { useState } from "react";
import { ArrowUpDown, MoreVertical, Trash2, Table as TableIcon, LayoutGrid } from "lucide-react";
import { ColumnDef } from "@tanstack/react-table";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTable } from "@/components/ui/data-table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Equipment, STATUS_STYLES } from "./types";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

export function EquipmentFleetTab({
  id,
  isLoading,
  allEquipment,
  canWrite,
  updateStatusMutation,
  deleteMutation,
}: {
  id: string;
  isLoading: boolean;
  allEquipment: Equipment[];
  canWrite: boolean;
  updateStatusMutation: any;
  deleteMutation: any;
}) {
  const [fleetViewMode, setFleetViewMode] = useState<"table" | "grid">("table");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "active" | "maintenance" | "breakdown" | "idle"
  >("all");
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  const filteredEquipment = allEquipment.filter((e) => {
    if (statusFilter === "all") return true;
    return e.status === statusFilter;
  });

  const fleetColumns: ColumnDef<Equipment>[] = [
    {
      accessorKey: "code",
      size: 80,
      minSize: 65,
      maxSize: 95,
      header: "Code",
      cell: ({ row }) => (
        <span className="font-mono text-xs text-muted-foreground">
          {row.original.code || "—"}
        </span>
      ),
    },
    {
      accessorKey: "name",
      size: 260,
      minSize: 180,
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="-ml-4 hover:bg-transparent text-xs font-semibold"
        >
          Machine & Model <ArrowUpDown className="ml-1.5 h-3.5 w-3.5" />
        </Button>
      ),
      cell: ({ row }) => (
        <div className="py-0.5">
          <div className="font-semibold text-foreground break-words whitespace-normal leading-snug flex items-center flex-wrap gap-1">
            <span>{row.original.name}</span>
            {row.original.isServiceOverdue && (
              <Badge
                variant="destructive"
                className="text-[9px] py-0 px-1 font-mono animate-pulse"
              >
                🚨 Service Overdue
              </Badge>
            )}
            {row.original.isServiceDue && !row.original.isServiceOverdue && (
              <Badge
                variant="outline"
                className="text-[9px] py-0 px-1 font-mono border-amber-400 bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
              >
                ⚠️ Service Due ({row.original.hoursUntilService} {row.original.unit} left)
              </Badge>
            )}
          </div>
          {row.original.model && (
            <div className="text-[10px] text-muted-foreground">{row.original.model}</div>
          )}
        </div>
      ),
    },
    {
      accessorKey: "type",
      size: 130,
      minSize: 100,
      maxSize: 150,
      header: "Category",
      cell: ({ row }) => (
        <span className="text-muted-foreground text-xs">{row.original.type || "Machinery"}</span>
      ),
    },
    {
      accessorKey: "status",
      size: 110,
      minSize: 90,
      maxSize: 125,
      header: "Status",
      cell: ({ row }) => (
        <Badge
          variant="secondary"
          className={`${STATUS_STYLES[row.original.status] || ""} text-[9.5px] font-medium capitalize whitespace-nowrap`}
        >
          {row.original.status}
        </Badge>
      ),
    },
    {
      accessorKey: "fuelRate",
      size: 110,
      minSize: 90,
      maxSize: 125,
      header: () => <div className="text-right">Fuel Benchmark</div>,
      cell: ({ row }) => (
        <div className="text-right font-mono text-xs text-foreground">
          {row.original.fuelRate > 0
            ? row.original.unit === "km"
              ? `${row.original.fuelRate.toFixed(2)} km/L`
              : `${row.original.fuelRate.toFixed(1)} L/hr`
            : "—"}
        </div>
      ),
    },
    {
      id: "counts",
      size: 90,
      minSize: 75,
      maxSize: 105,
      header: () => <div className="text-right">Logs / Maint</div>,
      cell: ({ row }) => (
        <div className="text-right text-xs text-muted-foreground font-mono">
          {row.original._count.logs} / {row.original._count.maintenance}
        </div>
      ),
    },
    {
      id: "actions",
      size: 40,
      minSize: 36,
      maxSize: 44,
      header: () => <div className="text-right"></div>,
      cell: ({ row }) => {
        if (!canWrite) return null;
        const e = row.original;
        return (
          <div className="flex items-center justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6.5 w-6.5 text-muted-foreground hover:text-foreground"
                >
                  <MoreVertical className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44 p-1.5 rounded-xl shadow-lg">
                <DropdownMenuLabel className="text-[10px] text-muted-foreground uppercase font-bold px-2 py-1">
                  Change Status
                </DropdownMenuLabel>
                <DropdownMenuItem
                  onClick={() =>
                    updateStatusMutation.mutate({
                      projectId: id,
                      equipId: e.id,
                      status: "active",
                    })
                  }
                  className="text-xs cursor-pointer text-emerald-700 dark:text-emerald-400 font-medium"
                >
                  Mark Active
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    updateStatusMutation.mutate({
                      projectId: id,
                      equipId: e.id,
                      status: "idle",
                    })
                  }
                  className="text-xs cursor-pointer text-slate-600 dark:text-slate-400 font-medium"
                >
                  Mark Idle
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    updateStatusMutation.mutate({
                      projectId: id,
                      equipId: e.id,
                      status: "breakdown",
                    })
                  }
                  className="text-xs cursor-pointer text-red-600 font-medium"
                >
                  Mark Breakdown
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    updateStatusMutation.mutate({
                      projectId: id,
                      equipId: e.id,
                      status: "maintenance",
                    })
                  }
                  className="text-xs cursor-pointer text-amber-600 font-medium"
                >
                  Mark Maintenance
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => setDeleteTarget({ id: e.id, name: e.name })}
                  className="text-xs cursor-pointer text-red-600 font-medium focus:text-red-700 focus:bg-red-50 dark:focus:bg-red-950/30"
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1.5 text-red-600" />
                  Delete Equipment
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-3">
      {/* Filter Chips & View Mode Switcher */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          {(
            [
              { id: "all", label: `All Fleet (${allEquipment.length})` },
              {
                id: "active",
                label: `Active (${allEquipment.filter((e) => e.status === "active").length})`,
              },
              {
                id: "maintenance",
                label: `Maintenance (${allEquipment.filter((e) => e.status === "maintenance").length})`,
              },
              {
                id: "breakdown",
                label: `Breakdown (${allEquipment.filter((e) => e.status === "breakdown").length})`,
              },
              {
                id: "idle",
                label: `Idle (${allEquipment.filter((e) => e.status === "idle").length})`,
              },
            ] as const
          ).map(({ id: filterKey, label }) => (
            <button
              key={filterKey}
              onClick={() => setStatusFilter(filterKey)}
              className={cn(
                "px-2.5 py-0.5 text-[11px] rounded-full font-medium transition-all border",
                statusFilter === filterKey
                  ? "bg-primary text-primary-foreground border-primary font-semibold"
                  : "bg-background text-muted-foreground border-border/70 hover:bg-muted"
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Grid / Table Toggle */}
        <div className="flex items-center border rounded-md p-0.5 bg-muted/40 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setFleetViewMode("table")}
            className={cn(
              "h-6 w-6 rounded-sm",
              fleetViewMode === "table"
                ? "bg-card shadow-2xs text-foreground"
                : "text-muted-foreground"
            )}
            title="Table View"
          >
            <TableIcon className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setFleetViewMode("grid")}
            className={cn(
              "h-6 w-6 rounded-sm",
              fleetViewMode === "grid"
                ? "bg-card shadow-2xs text-foreground"
                : "text-muted-foreground"
            )}
            title="Cards Grid"
          >
            <LayoutGrid className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {isLoading ? (
        <Skeleton className="h-64" />
      ) : fleetViewMode === "table" ? (
        <DataTable
          tableId="equipment-table-fleet"
          columns={fleetColumns}
          data={filteredEquipment}
          searchPlaceholder="Search fleet by machine name, code..."
          searchColumn="name"
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {filteredEquipment.map((e) => (
            <Card
              key={e.id}
              className={cn(
                "relative overflow-hidden border-l-4 shadow-2xs",
                e.status === "active"
                  ? "border-l-emerald-500"
                  : e.status === "maintenance"
                    ? "border-l-amber-500"
                    : e.status === "breakdown"
                      ? "border-l-red-500"
                      : "border-l-slate-300 dark:border-l-slate-600"
              )}
            >
              <CardContent className="p-3.5">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="font-semibold text-xs text-foreground">{e.name}</p>
                      {e.isServiceOverdue && (
                        <Badge
                          variant="destructive"
                          className="text-[8.5px] py-0 px-1 font-mono animate-pulse"
                        >
                          🚨 Overdue
                        </Badge>
                      )}
                      {e.isServiceDue && !e.isServiceOverdue && (
                        <Badge
                          variant="outline"
                          className="text-[8.5px] py-0 px-1 font-mono border-amber-400 bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
                        >
                          ⚠️ Due in {e.hoursUntilService} {e.unit}
                        </Badge>
                      )}
                    </div>
                    <p className="text-[10.5px] text-muted-foreground">
                      {e.type}
                      {e.model ? ` • ${e.model}` : ""}
                    </p>
                  </div>
                  <Badge
                    variant="secondary"
                    className={`${STATUS_STYLES[e.status] || ""} text-[9.5px] font-medium capitalize`}
                  >
                    {e.status}
                  </Badge>
                </div>
                <div className="grid grid-cols-2 gap-2 mt-2.5 text-xs">
                  <div>
                    <span className="text-muted-foreground">Benchmark:</span>{" "}
                    <span className="font-semibold">
                      {e.fuelRate > 0
                        ? e.unit === "km"
                          ? `${e.fuelRate.toFixed(2)} km/L`
                          : `${e.fuelRate.toFixed(1)} L/hr`
                        : "—"}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Code:</span>{" "}
                    <span className="font-mono font-semibold">{e.code || "—"}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Run Logs:</span>{" "}
                    <span className="font-semibold">{e._count.logs}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Maint Tickets:</span>{" "}
                    <span className="font-semibold">{e._count.maintenance}</span>
                  </div>
                </div>
                {canWrite && (
                  <div className="absolute right-2.5 bottom-2.5">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6.5 w-6.5 text-muted-foreground"
                        >
                          <MoreVertical className="h-3.5 w-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-40 p-1 rounded-lg">
                        <DropdownMenuItem
                          onClick={() =>
                            updateStatusMutation.mutate({
                              projectId: id,
                              equipId: e.id,
                              status: "active",
                            })
                          }
                          className="text-xs text-emerald-600 font-medium"
                        >
                          Mark Active
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() =>
                            updateStatusMutation.mutate({
                              projectId: id,
                              equipId: e.id,
                              status: "idle",
                            })
                          }
                          className="text-xs text-slate-600 font-medium"
                        >
                          Mark Idle
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() =>
                            updateStatusMutation.mutate({
                              projectId: id,
                              equipId: e.id,
                              status: "breakdown",
                            })
                          }
                          className="text-xs text-red-600 font-medium"
                        >
                          Mark Breakdown
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() =>
                            updateStatusMutation.mutate({
                              projectId: id,
                              equipId: e.id,
                              status: "maintenance",
                            })
                          }
                          className="text-xs text-amber-600 font-medium"
                        >
                          Mark Maintenance
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => setDeleteTarget({ id: e.id, name: e.name })}
                          className="text-xs text-red-600 font-medium cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5 mr-1.5 text-red-600" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Confirmation Modal for Deleting Equipment */}
      {deleteTarget && (
        <ConfirmDialog
          open={Boolean(deleteTarget)}
          onOpenChange={(open) => {
            if (!open) setDeleteTarget(null);
          }}
          title="Delete Equipment Machine?"
          description={`Are you sure you want to permanently delete equipment "${deleteTarget.name}"? This action cannot be undone.`}
          variant="destructive"
          confirmLabel="Delete Machine"
          isLoading={deleteMutation.isPending}
          onConfirm={async () => {
            await deleteMutation.mutateAsync({ itemId: deleteTarget.id });
            setDeleteTarget(null);
          }}
        />
      )}
    </div>
  );
}
