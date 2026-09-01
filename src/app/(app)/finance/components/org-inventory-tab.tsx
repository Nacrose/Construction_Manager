"use client";

import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc-client";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Package,
} from "lucide-react";
import { LogDirectMaterialDialog } from "@/components/materials/log-direct-material-dialog";
import { formatNpr } from "@/lib/currency";
import { ConstructionTable, ConstructionTableColumn } from "@/components/ui/construction-table";

export function OrgInventoryTab() {
  const [search, setSearch] = useState<string>("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [logMaterialOpen, setLogMaterialOpen] = useState(false);

  const { data, isLoading } = trpc.material.listOrgInventory.useQuery({
    search: search.trim() || undefined,
  });

  const inventory = data?.inventory || [];
  const projects = data?.projects || [];

  // Distinct Categories
  const categories = useMemo(() => {
    const set = new Set<string>();
    inventory.forEach((i) => {
      if (i.category) set.add(i.category);
    });
    return ["all", ...Array.from(set)];
  }, [inventory]);

  // Group materials by standardized Name & Unit to form the Matrix Rows
  const matrixRows = useMemo(() => {
    const map = new Map<
      string,
      {
        key: string;
        name: string;
        unit: string;
        category: string;
        subCategory?: string;
        projectData: Record<
          string,
          {
            materialId: string;
            currentStock: number;
            minStock: number;
            reorderLevel: number;
            lastRate: number;
            totalValue: number;
          }
        >;
        totalStock: number;
        totalValue: number;
        avgRate: number;
      }
    >();

    inventory.forEach((item) => {
      if (categoryFilter !== "all" && item.category !== categoryFilter) {
        return;
      }

      const key = `${item.name.toLowerCase().trim()}__${item.unit.toLowerCase().trim()}`;
      let row = map.get(key);
      if (!row) {
        row = {
          key,
          name: item.name,
          unit: item.unit,
          category: item.category || "General",
          subCategory: item.subCategory || "",
          projectData: {},
          totalStock: 0,
          totalValue: 0,
          avgRate: 0,
        };
        map.set(key, row);
      }

      const itemValuation = (item.currentStock || 0) * (item.lastRate || 0);
      row.projectData[item.projectId] = {
        materialId: item.id,
        currentStock: item.currentStock || 0,
        minStock: item.minStock || 0,
        reorderLevel: item.reorderLevel || 0,
        lastRate: item.lastRate || 0,
        totalValue: itemValuation,
      };

      row.totalStock += item.currentStock || 0;
      row.totalValue += itemValuation;
    });

    // Compute weighted average rate
    map.forEach((row) => {
      if (row.totalStock > 0) {
        row.avgRate = row.totalValue / row.totalStock;
      }
    });

    return Array.from(map.values());
  }, [inventory, categoryFilter]);

  const totalCompanyValuation = useMemo(() => {
    return matrixRows.reduce((sum, r) => sum + r.totalValue, 0);
  }, [matrixRows]);

  const columns: ConstructionTableColumn<any>[] = [
    {
      key: "name",
      header: "Material & Specification",
      render: (_, row) => (
        <div>
          <div className="font-bold text-foreground text-xs leading-tight font-sans">{row.name}</div>
          <div className="text-[10px] text-muted-foreground font-mono mt-0.5">
            {row.unit} • <span>{row.category}</span>
            {row.subCategory ? ` • ${row.subCategory}` : ""}
          </div>
        </div>
      ),
    },
    ...projects.map((proj) => ({
      key: `proj_${proj.id}`,
      header: `${proj.code || proj.name}`,
      align: "center" as const,
      render: (_: any, row: any) => {
        const cell = row.projectData[proj.id];
        const hasStock = cell && cell.currentStock > 0;
        const isLow = cell && cell.currentStock > 0 && cell.currentStock <= (cell.reorderLevel || 10);
        if (!hasStock) return <span className="text-muted-foreground/30 font-mono text-xs">—</span>;
        return (
          <div className="flex flex-col items-center justify-center font-mono">
            <div className="flex items-center gap-1 text-xs font-bold leading-tight">
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  isLow ? "bg-amber-500 animate-pulse" : "bg-emerald-500"
                }`}
              />
              <span className={isLow ? "text-amber-600 dark:text-amber-400" : "text-foreground"}>
                {cell.currentStock.toLocaleString()} {row.unit}
              </span>
            </div>
            {cell.lastRate > 0 && (
              <div className="text-[10px] text-muted-foreground">
                @ {formatNpr(cell.lastRate)}
              </div>
            )}
          </div>
        );
      },
    })),
    {
      key: "totalCompanyStock",
      header: "Total Company Stock",
      align: "right",
      render: (_, row) => (
        <div className="font-mono text-right">
          <div className="font-bold text-xs text-foreground">
            {row.totalStock.toLocaleString()} {row.unit}
          </div>
          <div className="text-[10px] text-primary font-semibold">
            {formatNpr(row.totalValue)}
          </div>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      {/* Controls Header Ribbon */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-2.5 bg-muted/40 rounded-lg border">
        <div className="flex items-center gap-2 flex-1 min-w-[200px]">
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="h-8 w-44 text-xs font-mono">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories
                .filter((c) => c !== "all")
                .map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-3 py-1 bg-muted/60 rounded-md border text-xs font-mono">
            <span className="text-muted-foreground text-[10px] uppercase">Total Valuation:</span>
            <span className="text-foreground font-bold">{formatNpr(totalCompanyValuation)}</span>
          </div>

          <Button
            onClick={() => setLogMaterialOpen(true)}
            size="sm"
            className="h-8 px-3 text-xs font-bold text-white rounded-lg gap-1.5 shadow-xs font-mono bg-emerald-600 hover:bg-emerald-700"
          >
            <Plus className="h-3.5 w-3.5 stroke-[2.5]" />
            Log Material (दाखिला)
          </Button>
        </div>
      </div>

      {/* Central Table Engine Matrix */}
      <ConstructionTable
        data={matrixRows}
        columns={columns}
        isLoading={isLoading}
        searchPlaceholder="Search materials by name, category, specification..."
        searchFilterKeys={["name", "category", "subCategory", "unit"]}
      />

      {/* Log Material Dialog */}
      <LogDirectMaterialDialog
        open={logMaterialOpen}
        onOpenChange={setLogMaterialOpen}
      />
    </div>
  );
}
