"use client";

import { Trash2, ArrowUpDown, MoreVertical, Plus, Package } from "lucide-react";
import { cn } from "@/lib/utils";
import { ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTable } from "@/components/ui/data-table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DeleteButton } from "./delete-button";

export type Material = {
  id: string;
  name: string;
  code: string | null;
  category: string | null;
  subCategory?: string | null;
  unit: string;
  minStock: number;
  currentStock: number;
  reorderLevel: number;
  _count: { transactions: number };
};

export function MaterialsInventoryTab({
  id,
  isLoading,
  data,
  filteredMaterials,
  stockFilter,
  setStockFilter,
  inStockCount,
  lowStockCount,
  zeroStockCount,
  totalStockItems,
  selectedMaterialIds,
  setSelectedMaterialIds,
  setDeleteConfirmIds,
  canWrite,
  openQuickTxn,
}: {
  id: string;
  isLoading: boolean;
  data: any;
  filteredMaterials: Material[];
  stockFilter: "all" | "in_stock" | "low_stock" | "zero_stock";
  setStockFilter: (filter: "all" | "in_stock" | "low_stock" | "zero_stock") => void;
  inStockCount: number;
  lowStockCount: number;
  zeroStockCount: number;
  totalStockItems: number;
  selectedMaterialIds: Set<string>;
  setSelectedMaterialIds: (updater: (prev: Set<string>) => Set<string>) => void;
  setDeleteConfirmIds: (ids: string[]) => void;
  canWrite: boolean;
  openQuickTxn: (materialId: string, type: "receive" | "issue") => void;
}) {
  const materialColumns: ColumnDef<Material>[] = [
    {
      id: "select",
      size: 36,
      minSize: 36,
      maxSize: 36,
      header: () => (
        <input
          type="checkbox"
          checked={
            !!data?.materials &&
            selectedMaterialIds.size === data.materials.length &&
            data.materials.length > 0
          }
          onChange={() => {
            if (data?.materials) {
              if (selectedMaterialIds.size === data.materials.length) {
                setSelectedMaterialIds(() => new Set());
              } else {
                setSelectedMaterialIds(() => new Set(data.materials.map((m: any) => m.id)));
              }
            }
          }}
          className="rounded border-zinc-300 text-red-600 focus:ring-red-500 h-3.5 w-3.5 cursor-pointer"
        />
      ),
      cell: ({ row }) => (
        <input
          type="checkbox"
          checked={selectedMaterialIds.has(row.original.id)}
          onChange={() => {
            setSelectedMaterialIds((prev) => {
              const next = new Set(prev);
              if (next.has(row.original.id)) next.delete(row.original.id);
              else next.add(row.original.id);
              return next;
            });
          }}
          className="rounded border-zinc-300 text-red-600 focus:ring-red-500 h-3.5 w-3.5 cursor-pointer"
        />
      ),
    },
    {
      accessorKey: "code",
      size: 75,
      minSize: 60,
      maxSize: 85,
      header: "Code",
      cell: ({ row }) => (
        <span className="font-mono text-xs text-muted-foreground">{row.original.code || "—"}</span>
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
          Name <ArrowUpDown className="ml-1.5 h-3.5 w-3.5" />
        </Button>
      ),
      cell: ({ row }) => (
        <div className="font-semibold text-foreground break-words whitespace-normal leading-snug py-0.5">
          {row.original.name}
        </div>
      ),
    },
    {
      accessorKey: "category",
      size: 110,
      minSize: 90,
      maxSize: 130,
      header: "Category",
      cell: ({ row }) => (
        <span className="text-muted-foreground text-xs">{row.original.category || "—"}</span>
      ),
    },
    {
      accessorKey: "subCategory",
      size: 100,
      minSize: 80,
      maxSize: 120,
      header: "Size / Spec",
      cell: ({ row }) =>
        row.original.subCategory ? (
          <Badge
            variant="outline"
            className="bg-blue-50/50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300 border-blue-200 text-[10px] py-0 font-mono"
          >
            {row.original.subCategory}
          </Badge>
        ) : (
          <span className="text-muted-foreground text-xs">—</span>
        ),
    },
    {
      accessorKey: "currentStock",
      size: 110,
      minSize: 90,
      maxSize: 130,
      header: () => <div className="text-right">Current Stock</div>,
      cell: ({ row }) => (
        <div className="text-right font-bold text-foreground text-xs">
          {row.original.currentStock.toLocaleString()} {row.original.unit}
        </div>
      ),
    },
    {
      id: "reorder",
      size: 90,
      minSize: 75,
      maxSize: 105,
      header: () => <div className="text-right">Min / Reorder</div>,
      cell: ({ row }) => (
        <div className="text-right text-xs text-muted-foreground font-mono">
          {row.original.minStock} / {row.original.reorderLevel}
        </div>
      ),
    },
    {
      id: "status",
      size: 130,
      minSize: 110,
      maxSize: 150,
      header: "Stock Status",
      cell: ({ row }) => {
        const m = row.original;
        const isZeroStock = m.currentStock === 0;
        const hasReorderConfigured = m.minStock > 0 || m.reorderLevel > 0;

        let statusText = "Healthy";
        let statusColor =
          "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300";
        let progressVal = Math.min(
          100,
          (m.currentStock / (m.reorderLevel || m.minStock || 1)) * 100
        );

        if (isZeroStock && !hasReorderConfigured) {
          statusText = "Unstocked";
          statusColor = "bg-muted text-muted-foreground";
          progressVal = 0;
        } else if (m.currentStock <= m.minStock && m.minStock > 0) {
          statusText = "Critical Stock";
          statusColor = "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300";
          progressVal = 0;
        } else if (m.currentStock <= m.reorderLevel && m.reorderLevel > 0) {
          statusText = "Low Reorder";
          statusColor = "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300";
        }

        return (
          <div className="flex items-center gap-2">
            <Progress value={progressVal} className="h-1.5 w-12 bg-muted" />
            <Badge
              variant="secondary"
              className={`${statusColor} text-[9.5px] font-medium whitespace-nowrap`}
            >
              {statusText}
            </Badge>
          </div>
        );
      },
    },
    {
      id: "actions",
      size: 40,
      minSize: 36,
      maxSize: 44,
      header: () => <div className="text-right"></div>,
      cell: ({ row }) => {
        if (!canWrite) return null;
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
                <DropdownMenuItem
                  onClick={() => openQuickTxn(row.original.id, "receive")}
                  className="cursor-pointer gap-2 text-xs font-medium py-1.5 text-emerald-700 dark:text-emerald-300"
                >
                  <Plus className="h-4 w-4 text-emerald-600" />
                  <span>Receive Stock</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => openQuickTxn(row.original.id, "issue")}
                  className="cursor-pointer gap-2 text-xs font-medium py-1.5 text-amber-700 dark:text-amber-300"
                >
                  <Package className="h-4 w-4 text-amber-600" />
                  <span>Issue Stock</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="p-0">
                  <DeleteButton itemId={row.original.id} projectId={id} />
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-2">
      {/* Inventory Filter Bar */}
      <div className="flex items-center justify-between gap-2 pt-0.5">
        <div className="flex items-center gap-1 bg-muted/40 p-0.5 rounded-lg text-xs w-fit">
          <button
            type="button"
            onClick={() => setStockFilter("in_stock")}
            className={cn(
              "px-2.5 py-1 rounded-md text-[11px] transition-colors font-medium flex items-center gap-1.5",
              stockFilter === "in_stock"
                ? "bg-card text-foreground shadow-2xs font-semibold"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <span>In Stock</span>
            <span className="font-mono text-[10px] opacity-75">({inStockCount})</span>
          </button>
          <button
            type="button"
            onClick={() => setStockFilter("low_stock")}
            className={cn(
              "px-2.5 py-1 rounded-md text-[11px] transition-colors font-medium flex items-center gap-1.5",
              stockFilter === "low_stock"
                ? "bg-card text-amber-700 dark:text-amber-400 shadow-2xs font-semibold"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <span>Low / Reorder</span>
            {lowStockCount > 0 && (
              <span className="font-mono text-[10px] bg-amber-500/15 text-amber-700 dark:text-amber-300 px-1 rounded-full">
                {lowStockCount}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setStockFilter("zero_stock")}
            className={cn(
              "px-2.5 py-1 rounded-md text-[11px] transition-colors font-medium flex items-center gap-1.5",
              stockFilter === "zero_stock"
                ? "bg-card text-foreground shadow-2xs font-semibold"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <span>Zero Stock</span>
            <span className="font-mono text-[10px] opacity-75">({zeroStockCount})</span>
          </button>
          <button
            type="button"
            onClick={() => setStockFilter("all")}
            className={cn(
              "px-2.5 py-1 rounded-md text-[11px] transition-colors font-medium flex items-center gap-1.5",
              stockFilter === "all"
                ? "bg-card text-foreground shadow-2xs font-semibold"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <span>All Tracked</span>
            <span className="font-mono text-[10px] opacity-75">({totalStockItems})</span>
          </button>
        </div>
      </div>

      {selectedMaterialIds.size > 0 && (
        <div className="flex items-center gap-3 bg-red-500/5 dark:bg-red-950/20 border border-red-500/25 p-2 rounded-lg animate-fade-in">
          <span className="text-xs text-red-700 dark:text-red-300 font-semibold font-mono">
            {selectedMaterialIds.size} material(s) selected
          </span>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => setDeleteConfirmIds(Array.from(selectedMaterialIds))}
            className="h-7 text-xs font-semibold px-3 bg-red-600 hover:bg-red-700 text-white rounded-md"
          >
            <Trash2 className="h-3 w-3 mr-1" /> Delete Selected
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setSelectedMaterialIds(() => new Set())}
            className="h-7 text-xs text-muted-foreground"
          >
            Cancel
          </Button>
        </div>
      )}
      {isLoading ? (
        <Skeleton className="h-80 rounded-xl" />
      ) : (
        <DataTable
          tableId="materials-table-compact"
          columns={materialColumns}
          data={filteredMaterials}
          searchPlaceholder="Search materials..."
          searchColumn="name"
        />
      )}
    </div>
  );
}
