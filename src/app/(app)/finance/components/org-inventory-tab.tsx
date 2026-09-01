"use client";

import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc-client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Search,
  Plus,
  Package,
} from "lucide-react";
import { LogDirectMaterialDialog } from "@/components/materials/log-direct-material-dialog";
import { formatNpr } from "@/lib/currency";

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
    return Array.from(map.values()).map((row) => {
      row.avgRate = row.totalStock > 0 ? row.totalValue / row.totalStock : 0;
      return row;
    });
  }, [inventory, categoryFilter]);

  // Aggregate Company Valuation
  const totalCompanyValuation = useMemo(() => {
    return matrixRows.reduce((sum, r) => sum + r.totalValue, 0);
  }, [matrixRows]);

  return (
    <div className="space-y-4 font-sans">
      {/* Top Filter, Category Pills & Log Material Bar */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 p-3 rounded-2xl bg-[#e5eef7] border border-[#c7d8e8]">
        <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
          {/* Search Input */}
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search material across sites..."
              className="h-8 pl-8 text-xs bg-white text-slate-900 rounded-lg border border-[#c7d8e8] focus:border-[#0284c7] font-mono"
            />
          </div>

          {/* Category Filter Pills */}
          <div className="flex items-center gap-1 overflow-x-auto max-w-full py-0.5 custom-scrollbar">
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategoryFilter(cat)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-mono capitalize shrink-0 transition ${
                  categoryFilter === cat
                    ? "bg-white text-[#0284c7] border border-[#bae6fd] font-bold shadow-xs"
                    : "bg-white/60 text-slate-600 border border-[#c7d8e8] hover:bg-white hover:text-slate-900"
                }`}
              >
                {cat === "all" ? "All Categories" : cat}
              </button>
            ))}
          </div>
        </div>

        {/* Action Button & Valuation Summary */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="hidden lg:flex items-center gap-1.5 px-3 py-1 rounded-lg bg-white border border-[#c7d8e8] text-xs font-mono">
            <span className="text-slate-500 text-[10px] uppercase">Total Valuation:</span>
            <span className="text-slate-900 font-bold font-matrix">{formatNpr(totalCompanyValuation)}</span>
          </div>

          <Button
            onClick={() => setLogMaterialOpen(true)}
            size="sm"
            className="amber-cta-btn h-8 px-3 text-xs font-bold text-white rounded-lg gap-1.5 shadow-sm font-mono"
          >
            <Plus className="h-3.5 w-3.5 stroke-[2.5]" />
            Log Material (दाखिला)
          </Button>
        </div>
      </div>

      {/* Multi-Project Comparative Stock Matrix Table */}
      {isLoading ? (
        <div className="p-8 text-center space-y-3 bg-white rounded-2xl border border-[#c7d8e8]">
          <Skeleton className="h-10 w-full bg-slate-100 rounded-xl" />
          <Skeleton className="h-10 w-full bg-slate-100 rounded-xl" />
          <Skeleton className="h-10 w-full bg-slate-100 rounded-xl" />
        </div>
      ) : matrixRows.length === 0 ? (
        <div className="p-12 text-center rounded-2xl bg-white border border-[#c7d8e8]">
          <Package className="h-8 w-8 text-slate-400 mx-auto mb-2 opacity-60" />
          <h3 className="text-sm font-semibold text-slate-900">No Inventory Items Found</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto font-mono">
            Click &quot;+ Log Material&quot; to record physical material delivery against any project site.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[#c7d8e8] bg-white shadow-xs">
          <table className="w-full text-left text-xs font-mono border-collapse">
            {/* Table Header */}
            <thead className="border-b border-[#c7d8e8] bg-[#f8fbfe] uppercase text-[10px] text-slate-600 tracking-wider">
              <tr>
                {/* Frozen Column: Material Spec */}
                <th className="px-4 py-3 min-w-[220px] font-sans sticky left-0 z-20 bg-[#f8fbfe] border-r border-[#c7d8e8] shadow-[2px_0_6px_rgba(0,0,0,0.04)] font-bold text-slate-800">
                  Material &amp; Specification
                </th>

                {/* Dynamic Columns: One for each Real Project */}
                {projects.map((proj) => (
                  <th
                    key={proj.id}
                    className="px-3 py-3 min-w-[170px] border-r border-[#e2edf7] text-center font-mono"
                  >
                    <div className="font-bold text-slate-900 text-[11px] truncate max-w-[160px] mx-auto">
                      {proj.name}
                    </div>
                    <div className="text-[10px] text-[#0284c7] font-normal">
                      {proj.code}
                    </div>
                  </th>
                ))}

                {/* Frozen Column: Total Company Stock */}
                <th className="px-4 py-3 min-w-[180px] text-right font-mono bg-[#f1f7fc] text-[#0284c7] sticky right-0 z-20 border-l border-[#c7d8e8] shadow-[-2px_0_6px_rgba(0,0,0,0.04)] font-bold">
                  Total Company Stock
                </th>
              </tr>
            </thead>

            {/* Table Body Matrix */}
            <tbody className="divide-y divide-[#e2edf7]">
              {matrixRows.map((row) => (
                <tr key={row.key} className="hover:bg-slate-50 transition-colors group">
                  {/* Left Column: Material Info */}
                  <td className="px-4 py-2.5 font-sans sticky left-0 z-10 bg-white group-hover:bg-slate-50 border-r border-[#c7d8e8] shadow-[2px_0_6px_rgba(0,0,0,0.04)]">
                    <div className="font-bold text-slate-900 text-xs leading-tight">
                      {row.name}
                    </div>
                    <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                      {row.unit} • <span className="text-slate-600">{row.category}</span>
                      {row.subCategory ? ` • ${row.subCategory}` : ""}
                    </div>
                  </td>

                  {/* Project Specific Cells */}
                  {projects.map((proj) => {
                    const cell = row.projectData[proj.id];
                    const hasStock = cell && cell.currentStock > 0;
                    const isLow =
                      cell &&
                      cell.currentStock > 0 &&
                      cell.currentStock <= (cell.reorderLevel || 10);

                    return (
                      <td
                        key={proj.id}
                        className="px-3 py-2.5 text-center border-r border-[#e2edf7] font-mono"
                      >
                        {hasStock ? (
                          <div className="flex flex-col items-center justify-center">
                            <div className="flex items-center gap-1 text-xs font-bold leading-tight">
                              <span
                                className={`h-1.5 w-1.5 rounded-full ${
                                  isLow ? "bg-amber-500 animate-pulse" : "bg-emerald-500"
                                }`}
                              />
                              <span className={isLow ? "text-amber-700" : "text-slate-900 font-matrix"}>
                                {cell.currentStock.toLocaleString("en-IN")} {row.unit}
                              </span>
                            </div>
                            <div className="text-[10px] text-slate-500 mt-0.5 leading-tight font-matrix">
                              @ {formatNpr(cell.lastRate)} | {formatNpr(cell.totalValue)}
                              {isLow && (
                                <span className="text-amber-700 ml-1 font-semibold">
                                  (Low)
                                </span>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center justify-center text-slate-400">
                            <span className="text-xs font-bold leading-tight">—</span>
                            <span className="text-[10px] text-slate-400 mt-0.5 leading-tight">
                              NPR 0
                            </span>
                          </div>
                        )}
                      </td>
                    );
                  })}

                  {/* Right Column: Total Company Stock & Valuation */}
                  <td className="px-4 py-2.5 text-right font-mono bg-[#f8fbfe] group-hover:bg-slate-100 sticky right-0 z-10 border-l border-[#c7d8e8] shadow-[-2px_0_6px_rgba(0,0,0,0.04)]">
                    <div className="font-bold text-xs text-[#0284c7] leading-tight font-matrix">
                      {row.totalStock.toLocaleString("en-IN")} {row.unit}
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5 leading-tight font-matrix">
                      Avg: {formatNpr(row.avgRate)} | {formatNpr(row.totalValue)}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>

            {/* Summary Footer */}
            <tfoot className="border-t-2 border-[#c7d8e8] bg-[#f8fbfe] font-bold text-slate-900 font-mono">
              <tr>
                <td className="px-4 py-3 font-sans text-xs sticky left-0 z-20 bg-[#f8fbfe] border-r border-[#c7d8e8]">
                  Total Matrix ({matrixRows.length} Material Types)
                </td>
                {projects.map((proj) => {
                  const projTotalVal = matrixRows.reduce(
                    (s, r) => s + (r.projectData[proj.id]?.totalValue || 0),
                    0
                  );
                  return (
                    <td
                      key={proj.id}
                      className="px-3 py-3 text-center text-xs text-slate-900 border-r border-[#e2edf7] font-matrix"
                    >
                      {formatNpr(projTotalVal)}
                    </td>
                  );
                })}
                <td className="px-4 py-3 text-right text-xs text-[#0284c7] sticky right-0 z-20 bg-[#f1f7fc] border-l border-[#c7d8e8] font-matrix">
                  {formatNpr(totalCompanyValuation)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Unified Material Delivery Dialog (Direct Inward) */}
      <LogDirectMaterialDialog
        open={logMaterialOpen}
        onOpenChange={setLogMaterialOpen}
      />
    </div>
  );
}
