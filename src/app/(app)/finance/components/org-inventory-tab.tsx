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

function fmt(n: number) {
  return n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

function fmtCurrency(n: number) {
  if (n >= 10000000) return `Rs. ${(n / 10000000).toFixed(2)} Cr`;
  if (n >= 100000) return `Rs. ${(n / 100000).toFixed(2)} L`;
  if (n >= 1000) return `Rs. ${(n / 1000).toFixed(1)} K`;
  return `Rs. ${fmt(n)}`;
}

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
    <div className="space-y-4">
      {/* Top Filter, Category Pills & Log Material Bar */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 p-3 rounded-2xl bg-[#0c1015] border border-white/10">
        <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
          {/* Search Input */}
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-gray-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search material across sites..."
              className="h-8 pl-8 text-xs bg-[#121820] text-white rounded-xl border-white/10 focus:border-emerald-500 font-mono"
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
                    ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-bold"
                    : "bg-[#121820] text-gray-400 border border-white/5 hover:text-white hover:border-white/20"
                }`}
              >
                {cat === "all" ? "All Categories" : cat}
              </button>
            ))}
          </div>
        </div>

        {/* Action Button & Valuation Summary */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="hidden lg:flex items-center gap-1.5 px-3 py-1 rounded-xl bg-[#121820] border border-emerald-500/20 text-xs font-mono">
            <span className="text-gray-400 text-[10px] uppercase">Total Valuation:</span>
            <span className="text-emerald-400 font-bold">{fmtCurrency(totalCompanyValuation)}</span>
          </div>

          <Button
            onClick={() => setLogMaterialOpen(true)}
            size="sm"
            className="h-8 px-3 text-xs font-semibold bg-emerald-500 hover:bg-emerald-600 text-black rounded-xl gap-1.5 shadow-[0_0_15px_rgba(0,255,102,0.2)]"
          >
            <Plus className="h-3.5 w-3.5 stroke-[2.5]" />
            Log Material (दाखिला)
          </Button>
        </div>
      </div>

      {/* Multi-Project Comparative Stock Matrix Table */}
      {isLoading ? (
        <div className="p-8 text-center space-y-3 bg-[#0c1015] rounded-2xl border border-white/10">
          <Skeleton className="h-10 w-full bg-white/5 rounded-xl" />
          <Skeleton className="h-10 w-full bg-white/5 rounded-xl" />
          <Skeleton className="h-10 w-full bg-white/5 rounded-xl" />
        </div>
      ) : matrixRows.length === 0 ? (
        <div className="p-12 text-center rounded-2xl bg-[#0c1015] border border-white/10">
          <Package className="h-8 w-8 text-gray-500 mx-auto mb-2 opacity-60" />
          <h3 className="text-sm font-semibold text-white">No Inventory Items Found</h3>
          <p className="text-xs text-gray-400 mt-1 max-w-sm mx-auto">
            Click "+ Log Material" to record physical material delivery against any project site.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-white/10 bg-[#0c1015]">
          <table className="w-full text-left text-xs font-mono border-collapse">
            {/* Table Header */}
            <thead className="border-b border-white/10 bg-[#121820] uppercase text-[10px] text-gray-400 tracking-wider">
              <tr>
                {/* Frozen Column: Material Spec */}
                <th className="px-4 py-3 min-w-[220px] font-sans sticky left-0 z-20 bg-[#121820] border-r border-white/10 shadow-[2px_0_10px_rgba(0,0,0,0.5)]">
                  Material &amp; Specification
                </th>

                {/* Dynamic Columns: One for each Real Project */}
                {projects.map((proj) => (
                  <th
                    key={proj.id}
                    className="px-3 py-3 min-w-[170px] border-r border-white/5 text-center font-mono"
                  >
                    <div className="font-bold text-white text-[11px] truncate max-w-[160px] mx-auto">
                      {proj.name}
                    </div>
                    <div className="text-[10px] text-emerald-400/80 font-normal">
                      {proj.code}
                    </div>
                  </th>
                ))}

                {/* Frozen Column: Total Company Stock */}
                <th className="px-4 py-3 min-w-[180px] text-right font-mono bg-[#141b24] text-emerald-400 sticky right-0 z-20 border-l border-white/10 shadow-[-2px_0_10px_rgba(0,0,0,0.5)]">
                  Total Company Stock
                </th>
              </tr>
            </thead>

            {/* Table Body Matrix */}
            <tbody className="divide-y divide-white/5">
              {matrixRows.map((row) => (
                <tr key={row.key} className="hover:bg-white/[0.02] transition-colors group">
                  {/* Left Column: Material Info */}
                  <td className="px-4 py-2.5 font-sans sticky left-0 z-10 bg-[#0c1015] group-hover:bg-[#10151d] border-r border-white/10 shadow-[2px_0_10px_rgba(0,0,0,0.5)]">
                    <div className="font-bold text-white text-xs leading-tight">
                      {row.name}
                    </div>
                    <div className="text-[10px] text-gray-400 font-mono mt-0.5">
                      {row.unit} • <span className="text-gray-500">{row.category}</span>
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
                        className="px-3 py-2.5 text-center border-r border-white/5 font-mono"
                      >
                        {hasStock ? (
                          <div className="flex flex-col items-center justify-center">
                            <div className="flex items-center gap-1 text-xs font-bold leading-tight">
                              <span
                                className={`h-1.5 w-1.5 rounded-full ${
                                  isLow ? "bg-amber-400 animate-pulse" : "bg-emerald-400"
                                }`}
                              />
                              <span className={isLow ? "text-amber-400" : "text-white"}>
                                {fmt(cell.currentStock)} {row.unit}
                              </span>
                            </div>
                            <div className="text-[10px] text-gray-400 mt-0.5 leading-tight">
                              @ Rs. {fmt(cell.lastRate)} | {fmtCurrency(cell.totalValue)}
                              {isLow && (
                                <span className="text-amber-400/90 ml-1 font-semibold">
                                  (Low)
                                </span>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center justify-center text-gray-600">
                            <span className="text-xs font-bold leading-tight">—</span>
                            <span className="text-[10px] text-gray-600 mt-0.5 leading-tight">
                              Rs. 0
                            </span>
                          </div>
                        )}
                      </td>
                    );
                  })}

                  {/* Right Column: Total Company Stock & Valuation */}
                  <td className="px-4 py-2.5 text-right font-mono bg-[#0e141c] group-hover:bg-[#121822] sticky right-0 z-10 border-l border-white/10 shadow-[-2px_0_10px_rgba(0,0,0,0.5)]">
                    <div className="font-bold text-xs text-emerald-400 leading-tight">
                      {fmt(row.totalStock)} {row.unit}
                    </div>
                    <div className="text-[10px] text-emerald-500/80 mt-0.5 leading-tight">
                      Avg: Rs. {fmt(row.avgRate)} | {fmtCurrency(row.totalValue)}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>

            {/* Summary Footer */}
            <tfoot className="border-t-2 border-white/10 bg-[#121820] font-bold text-white font-mono">
              <tr>
                <td className="px-4 py-3 font-sans text-xs sticky left-0 z-20 bg-[#121820] border-r border-white/10">
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
                      className="px-3 py-3 text-center text-xs text-emerald-400 border-r border-white/5"
                    >
                      {fmtCurrency(projTotalVal)}
                    </td>
                  );
                })}
                <td className="px-4 py-3 text-right text-xs text-emerald-400 sticky right-0 z-20 bg-[#141b24] border-l border-white/10">
                  {fmtCurrency(totalCompanyValuation)}
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
