"use client";

import React, { useState, useMemo, useTransition } from "react";
import * as XLSX from "@e965/xlsx";
import { format } from "date-fns";
import {
  Search,
  Download,
  LayoutList,
  ChevronRight,
  ChevronDown,
  Trash2,
  AlertTriangle,
  CheckSquare,
  Square,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { formatNpr } from "@/lib/currency";
import { cn } from "@/lib/utils";

export type ColumnAlign = "left" | "center" | "right";

export type ColumnFormat =
  | "text"
  | "currency"
  | "currency-compact"
  | "date"
  | "badge"
  | "number"
  | "wbs";

export type ConstructionTableColumn<T> = {
  key: string;
  header: string;
  accessor?: (row: T) => any;
  align?: ColumnAlign;
  format?: ColumnFormat;
  width?: string;
  searchable?: boolean;
  sortable?: boolean;
  summary?: "sum" | "avg" | "count";
  className?: string;
  render?: (value: any, row: T, index: number) => React.ReactNode;
};

export type BulkAction<T> = {
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  variant?: "default" | "outline" | "destructive" | "secondary";
  onAction: (selectedRows: T[]) => void | Promise<void>;
};

export type ConstructionTableProps<T> = {
  data: T[];
  columns: ConstructionTableColumn<T>[];
  title?: string;
  subtitle?: string;
  searchPlaceholder?: string;
  searchFilterKeys?: (keyof T | string)[];
  isLoading?: boolean;
  isWbsTree?: boolean; // Hierarchical WBS Mode
  wbsKey?: string; // e.g. "code" or "wbs" (e.g. "1.1.2")
  parentIdKey?: string; // e.g. "parentId"
  selectable?: boolean;
  rowKey?: (row: T) => string;
  onRowClick?: (row: T) => void;
  bulkActions?: BulkAction<T>[];
  exportExcel?: {
    filename: string;
    sheetName?: string;
  };
  emptyState?: {
    icon?: React.ComponentType<{ className?: string }>;
    title?: string;
    description?: string;
    action?: React.ReactNode;
  };
  headerActions?: React.ReactNode;
  summaryFooterLabel?: string;
  initialDensity?: "compact" | "comfortable";
  className?: string;
};

export function ConstructionTable<T extends Record<string, any>>({
  data,
  columns,
  title,
  subtitle,
  searchPlaceholder = "Search records...",
  searchFilterKeys,
  isLoading = false,
  isWbsTree = false,
  wbsKey = "code",
  parentIdKey = "parentId",
  selectable = false,
  rowKey = (r) => r.id || JSON.stringify(r),
  onRowClick,
  bulkActions,
  exportExcel,
  emptyState,
  headerActions,
  summaryFooterLabel = "Total",
  initialDensity = "compact",
  className,
}: ConstructionTableProps<T>) {
  const [search, setSearch] = useState("");
  const [isCompact, setIsCompact] = useState(initialDensity === "compact");
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({});
  const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>({});
  const [, startTransition] = useTransition();

  // 1. Filtered Data
  const filteredData = useMemo(() => {
    if (!search.trim()) return data;
    const query = search.toLowerCase();

    return data.filter((row) => {
      if (searchFilterKeys && searchFilterKeys.length > 0) {
        return searchFilterKeys.some((k) => {
          const val = row[k as string];
          return val !== undefined && val !== null && String(val).toLowerCase().includes(query);
        });
      }
      return columns.some((col) => {
        const val = col.accessor ? col.accessor(row) : row[col.key];
        return val !== undefined && val !== null && String(val).toLowerCase().includes(query);
      });
    });
  }, [data, search, columns, searchFilterKeys]);

  // 2. WBS Tree Hierarchy Computation
  const treeNodes = useMemo(() => {
    if (!isWbsTree) return filteredData.map((row) => ({ row, depth: 0, hasChildren: false, isVisible: true }));

    const byParent = new Map<string | null, T[]>();
    filteredData.forEach((row) => {
      const pId = row[parentIdKey] ?? null;
      const arr = byParent.get(pId) ?? [];
      arr.push(row);
      byParent.set(pId, arr);
    });

    const result: Array<{ row: T; depth: number; hasChildren: boolean; isVisible: boolean }> = [];

    function traverse(parentId: string | null, depth: number, parentVisible: boolean) {
      const children = byParent.get(parentId) ?? [];
      children.forEach((child) => {
        const id = rowKey(child);
        const hasKids = (byParent.get(id)?.length ?? 0) > 0;
        const isExpanded = expandedNodes[id] ?? true; // default expanded

        result.push({
          row: child,
          depth,
          hasChildren: hasKids,
          isVisible: parentVisible,
        });

        if (hasKids) {
          traverse(id, depth + 1, parentVisible && isExpanded);
        }
      });
    }

    traverse(null, 0, true);
    return result;
  }, [filteredData, isWbsTree, parentIdKey, rowKey, expandedNodes]);

  const visibleRows = isWbsTree ? treeNodes.filter((n) => n.isVisible) : treeNodes;

  // 3. Selection Handlers
  const selectedRowsList = useMemo(() => {
    return data.filter((r) => selectedIds[rowKey(r)]);
  }, [data, selectedIds, rowKey]);

  const allSelected = data.length > 0 && selectedRowsList.length === data.length;

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds({});
    } else {
      const next: Record<string, boolean> = {};
      data.forEach((r) => {
        next[rowKey(r)] = true;
      });
      setSelectedIds(next);
    }
  };

  const toggleRowSelect = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setSelectedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // 4. Toggle Node Expansion
  const toggleExpand = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    startTransition(() => {
      setExpandedNodes((prev) => ({
        ...prev,
        [id]: !(prev[id] ?? true),
      }));
    });
  };

  // 5. Excel Export Handler
  const handleExportExcel = () => {
    if (data.length === 0) return;
    try {
      const sanitizeCell = (val: any) => {
        if (typeof val === "string" && /^[=\+\-\@\t\r]/.test(val)) {
          return `'${val}`;
        }
        return val;
      };

      const headers = columns.map((c) => sanitizeCell(c.header));
      const rows = filteredData.map((row, idx) => {
        return columns.map((col) => {
          if (col.key === "sn" || col.key === "index") return idx + 1;
          const rawVal = col.accessor ? col.accessor(row) : row[col.key];
          if (col.format === "currency") return typeof rawVal === "number" ? rawVal : parseFloat(rawVal) || 0;
          return sanitizeCell(rawVal ?? "");
        });
      });

      // Calculate Total Summary Row if any columns have summary
      const hasSummary = columns.some((c) => c.summary);
      let summaryRow: any[] = [];
      if (hasSummary) {
        summaryRow = columns.map((col, cIdx) => {
          if (cIdx === 0) return summaryFooterLabel;
          if (col.summary === "sum") {
            return filteredData.reduce((s, r) => {
              const val = col.accessor ? col.accessor(r) : r[col.key];
              return s + (parseFloat(val) || 0);
            }, 0);
          }
          if (col.summary === "count") return filteredData.length;
          return "";
        });
      }

      const titleHeader = title ? [[sanitizeCell(title.toUpperCase())], [`Export Date: ${format(new Date(), "yyyy-MM-dd HH:mm")}`], []] : [];
      const wsData = [...titleHeader, headers, ...rows, ...(hasSummary ? [summaryRow] : [])];

      const ws = XLSX.utils.aoa_to_sheet(wsData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, exportExcel?.sheetName || "Sheet1");
      const filename = `${exportExcel?.filename || "Report"}_${format(new Date(), "yyyy-MM-dd")}.xlsx`;
      XLSX.writeFile(wb, filename);
    } catch (err) {
      console.error("[ConstructionTable] Export failed:", err);
    }
  };

  // 6. Summary Totals Calculation
  const summaryTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    columns.forEach((col) => {
      if (col.summary === "sum") {
        totals[col.key] = filteredData.reduce((sum, row) => {
          const val = col.accessor ? col.accessor(row) : row[col.key];
          return sum + (parseFloat(val) || 0);
        }, 0);
      } else if (col.summary === "count") {
        totals[col.key] = filteredData.length;
      }
    });
    return totals;
  }, [filteredData, columns]);

  const hasAnySummary = columns.some((c) => c.summary);

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-12 w-full rounded-xl bg-white/5" />
        <Skeleton className="h-64 w-full rounded-xl bg-white/5" />
      </div>
    );
  }

  return (
    <div className={cn("space-y-2.5", className)}>
      {/* Table Toolbar Strip */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 p-2.5 rounded-xl border border-white/10 bg-[#0c1015]">
        <div className="flex flex-wrap items-center gap-2 flex-1">
          {/* Search Box */}
          <div className="relative min-w-[200px] max-w-sm flex-1">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-gray-400" />
            <Input
              placeholder={searchPlaceholder}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-8 text-xs bg-[#121820] text-white rounded-lg border-white/10 focus:border-emerald-400 placeholder:text-gray-500 font-mono"
            />
          </div>

          {subtitle && (
            <span className="text-[11px] text-gray-400 font-mono hidden sm:inline">
              {filteredData.length} records
            </span>
          )}
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1.5">
          {headerActions}

          <Button
            size="sm"
            variant="outline"
            onClick={() => setIsCompact(!isCompact)}
            className="h-8 px-2.5 text-xs gap-1.5 font-mono bg-[#121820] text-gray-300 border-white/10 hover:text-white rounded-lg"
            title={isCompact ? "Switch to Comfortable Row Density" : "Switch to Compact Density"}
          >
            <LayoutList className="h-3.5 w-3.5 text-emerald-400" />
            <span className="hidden sm:inline">{isCompact ? "Compact" : "Comfortable"}</span>
          </Button>

          {exportExcel && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleExportExcel}
              className="h-8 px-2.5 text-xs gap-1.5 font-mono bg-[#121820] text-gray-300 border-white/10 hover:text-white rounded-lg"
            >
              <Download className="h-3.5 w-3.5 text-emerald-400" />
              <span className="hidden sm:inline">Export Excel</span>
            </Button>
          )}
        </div>
      </div>

      {/* Main Table Body */}
      {filteredData.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/10 p-12 text-center bg-[#0c1015]">
          {emptyState?.icon ? (
            <emptyState.icon className="mx-auto h-8 w-8 text-gray-500 mb-2" />
          ) : (
            <Sparkles className="mx-auto h-8 w-8 text-gray-500 mb-2" />
          )}
          <p className="text-sm font-semibold text-white">
            {emptyState?.title || "No Records Found"}
          </p>
          <p className="text-xs text-gray-400 mt-1">
            {emptyState?.description || "No records match your active search or filter criteria."}
          </p>
          {emptyState?.action && <div className="mt-4">{emptyState.action}</div>}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-white/10 bg-[#0c1015]">
          <table className="w-full text-left text-xs font-mono">
            <thead className="border-b border-white/10 bg-[#121820] uppercase text-[10px] text-gray-400 sticky top-0 z-10 select-none">
              <tr>
                {selectable && (
                  <th className="w-8 px-3 py-2 text-center">
                    <button
                      type="button"
                      onClick={toggleSelectAll}
                      className="text-gray-400 hover:text-white transition-colors"
                    >
                      {allSelected ? (
                        <CheckSquare className="h-3.5 w-3.5 text-emerald-400" />
                      ) : (
                        <Square className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </th>
                )}
                {columns.map((col) => (
                  <th
                    key={col.key}
                    style={{ width: col.width }}
                    className={cn(
                      "font-bold tracking-wider",
                      isCompact ? "px-3 py-2" : "px-4 py-3",
                      col.align === "right" && "text-right",
                      col.align === "center" && "text-center",
                      col.className
                    )}
                  >
                    {col.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {visibleRows.map((node, rIdx) => {
                const row = node.row;
                const id = rowKey(row);
                const isSelected = !!selectedIds[id];
                const isExpanded = expandedNodes[id] ?? true;

                return (
                  <tr
                    key={id}
                    onClick={() => onRowClick && onRowClick(row)}
                    className={cn(
                      "transition-colors group",
                      onRowClick && "cursor-pointer hover:bg-white/[0.03]",
                      isSelected ? "bg-emerald-500/10" : "hover:bg-white/[0.015]"
                    )}
                  >
                    {selectable && (
                      <td className="px-3 py-2 text-center" onClick={(e) => toggleRowSelect(id, e)}>
                        <button type="button" className="text-gray-400 hover:text-white">
                          {isSelected ? (
                            <CheckSquare className="h-3.5 w-3.5 text-emerald-400" />
                          ) : (
                            <Square className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </td>
                    )}

                    {columns.map((col, cIdx) => {
                      const rawValue = col.accessor ? col.accessor(row) : row[col.key];

                      return (
                        <td
                          key={col.key}
                          className={cn(
                            isCompact ? "px-3 py-1.5" : "px-4 py-2.5",
                            col.align === "right" && "text-right",
                            col.align === "center" && "text-center",
                            col.className
                          )}
                        >
                          {/* First Column Indentation & Chevron in WBS Mode */}
                          {cIdx === 0 && isWbsTree ? (
                            <div
                              className="flex items-center gap-1.5"
                              style={{ paddingLeft: `${node.depth * 18}px` }}
                            >
                              {node.hasChildren ? (
                                <button
                                  type="button"
                                  onClick={(e) => toggleExpand(id, e)}
                                  className="p-0.5 text-gray-400 hover:text-white rounded hover:bg-white/10"
                                >
                                  {isExpanded ? (
                                    <ChevronDown className="h-3.5 w-3.5 text-emerald-400" />
                                  ) : (
                                    <ChevronRight className="h-3.5 w-3.5 text-gray-400" />
                                  )}
                                </button>
                              ) : (
                                <span className="w-3.5 inline-block" />
                              )}

                              {row[wbsKey] && (
                                <span className="font-bold text-[10px] text-emerald-400 bg-emerald-500/10 px-1 py-0.2 rounded border border-emerald-500/20">
                                  {row[wbsKey]}
                                </span>
                              )}

                              {col.render ? (
                                col.render(rawValue, row, rIdx)
                              ) : (
                                renderFormattedValue(rawValue, col.format)
                              )}
                            </div>
                          ) : col.render ? (
                            col.render(rawValue, row, rIdx)
                          ) : (
                            renderFormattedValue(rawValue, col.format)
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>

            {/* Summary Footer Row */}
            {hasAnySummary && (
              <tfoot className="border-t-2 border-white/10 bg-[#121820] font-bold text-white">
                <tr>
                  {selectable && <td />}
                  {columns.map((col, idx) => {
                    if (idx === 0) {
                      return (
                        <td key={col.key} className={cn("uppercase tracking-wider", isCompact ? "px-3 py-2" : "px-4 py-3")}>
                          {summaryFooterLabel} ({filteredData.length})
                        </td>
                      );
                    }

                    if (col.summary === "sum") {
                      const total = summaryTotals[col.key] || 0;
                      return (
                        <td
                          key={col.key}
                          className={cn(
                            "text-right text-emerald-400 font-bold",
                            isCompact ? "px-3 py-2" : "px-4 py-3"
                          )}
                        >
                          {col.format === "currency" ? formatNpr(total, { prefix: "NPR" }) : total.toLocaleString()}
                        </td>
                      );
                    }

                    if (col.summary === "count") {
                      return (
                        <td key={col.key} className={cn("text-center", isCompact ? "px-3 py-2" : "px-4 py-3")}>
                          {summaryTotals[col.key]}
                        </td>
                      );
                    }

                    return <td key={col.key} className={isCompact ? "px-3 py-2" : "px-4 py-3"} />;
                  })}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      {/* Floating Bulk Action Drawer */}
      {selectedRowsList.length > 0 && bulkActions && bulkActions.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-2.5 rounded-2xl border border-white/20 bg-[#0f141c]/90 backdrop-blur-xl shadow-2xl text-xs font-mono text-white animate-in fade-in slide-in-from-bottom-4">
          <span className="font-bold text-emerald-400">
            {selectedRowsList.length} row{selectedRowsList.length > 1 ? "s" : ""} selected
          </span>
          <div className="h-4 w-[1px] bg-white/20" />
          <div className="flex items-center gap-2">
            {bulkActions.map((action, idx) => (
              <Button
                key={idx}
                size="sm"
                variant={action.variant || "default"}
                onClick={() => action.onAction(selectedRowsList)}
                className="h-7 text-xs gap-1.5 font-semibold shadow-sm"
              >
                {action.icon && <action.icon className="h-3 w-3" />}
                {action.label}
              </Button>
            ))}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setSelectedIds({})}
              className="h-7 text-xs text-gray-400 hover:text-white"
            >
              Clear
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function renderFormattedValue(value: any, colFormat?: ColumnFormat): React.ReactNode {
  if (value === undefined || value === null || value === "") return "—";

  switch (colFormat) {
    case "currency":
      return typeof value === "number" || !isNaN(parseFloat(value))
        ? formatNpr(value, { prefix: "NPR" })
        : value;
    case "currency-compact":
      return formatNpr(value, { prefix: "NPR", compact: true });
    case "number":
      return typeof value === "number" ? value.toLocaleString() : value;
    case "date":
      try {
        return format(new Date(value), "yyyy-MM-dd");
      } catch {
        return String(value);
      }
    case "badge":
      return (
        <Badge variant="outline" className="text-[10px] uppercase font-mono bg-white/5 border-white/10 text-gray-300">
          {String(value)}
        </Badge>
      );
    default:
      return String(value);
  }
}

/**
 * Standard Dark-Glass Delete Confirmation Hook & Dialog
 */
export function useConfirmDelete() {
  const [isOpen, setIsOpen] = useState(false);
  const [config, setConfig] = useState<{
    title: string;
    description: string;
    onConfirm: () => void | Promise<void>;
  }>({
    title: "Confirm Deletion",
    description: "Are you sure you want to delete this record? This action cannot be undone.",
    onConfirm: () => {},
  });

  const confirmDelete = (options: {
    title?: string;
    description?: string;
    onConfirm: () => void | Promise<void>;
  }) => {
    setConfig({
      title: options.title || "Confirm Deletion",
      description: options.description || "Are you sure you want to delete this record? This action cannot be undone.",
      onConfirm: options.onConfirm,
    });
    setIsOpen(true);
  };

  const dialog = (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="max-w-md bg-[#0c1015] border border-white/10 text-white backdrop-blur-xl">
        <DialogHeader>
          <div className="flex items-center gap-2.5 text-red-400">
            <AlertTriangle className="h-5 w-5" />
            <DialogTitle className="text-base font-bold font-mono">{config.title}</DialogTitle>
          </div>
          <DialogDescription className="text-xs text-gray-400 mt-2 font-mono">
            {config.description}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 mt-4">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setIsOpen(false)}
            className="h-8 text-xs font-mono bg-[#121820] text-gray-300 border-white/10"
          >
            Cancel
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={async () => {
              await config.onConfirm();
              setIsOpen(false);
            }}
            className="h-8 text-xs font-mono gap-1.5"
          >
            <Trash2 className="h-3.5 w-3.5" /> Confirm Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return { confirmDelete, deleteDialog: dialog };
}
