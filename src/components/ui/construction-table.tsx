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
import { TableSkeleton } from "@/components/ui/matrix-skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
  renderRowPreview?: (row: T, onClose: () => void) => React.ReactNode;
  rowPreviewTitle?: (row: T) => string;
  onRowPreview?: (row: T) => void;
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
  renderRowPreview,
  rowPreviewTitle,
  onRowPreview,
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
  const [previewRow, setPreviewRow] = useState<T | null>(null);
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
  }, [data, search, searchFilterKeys, columns]);

  // 2. Hierarchical WBS Tree Processing
  type TreeNode = {
    row: T;
    depth: number;
    hasChildren: boolean;
    children: TreeNode[];
  };

  const treeNodes = useMemo(() => {
    if (!isWbsTree) {
      return filteredData.map((row) => ({
        row,
        depth: 0,
        hasChildren: false,
        children: [],
      }));
    }

    const nodeMap = new Map<string, TreeNode>();
    const roots: TreeNode[] = [];

    filteredData.forEach((row) => {
      const id = rowKey(row);
      nodeMap.set(id, { row, depth: 0, hasChildren: false, children: [] });
    });

    filteredData.forEach((row) => {
      const id = rowKey(row);
      const parentId = row[parentIdKey];
      const node = nodeMap.get(id)!;

      if (parentId && nodeMap.has(parentId)) {
        const parentNode = nodeMap.get(parentId)!;
        parentNode.hasChildren = true;
        node.depth = parentNode.depth + 1;
        parentNode.children.push(node);
      } else {
        roots.push(node);
      }
    });

    return roots;
  }, [filteredData, isWbsTree, parentIdKey, rowKey]);

  // 3. Flatten tree based on expanded states
  const visibleRows = useMemo(() => {
    if (!isWbsTree) return treeNodes;

    const flat: TreeNode[] = [];
    function traverse(nodes: TreeNode[]) {
      nodes.forEach((n) => {
        flat.push(n);
        const id = rowKey(n.row);
        const isExpanded = expandedNodes[id] ?? true;
        if (isExpanded && n.children.length > 0) {
          traverse(n.children);
        }
      });
    }
    traverse(treeNodes);
    return flat;
  }, [treeNodes, isWbsTree, expandedNodes, rowKey]);

  // 4. Selection Handlers
  const selectedRowsList = useMemo(() => {
    return filteredData.filter((r) => selectedIds[rowKey(r)]);
  }, [filteredData, selectedIds, rowKey]);

  const toggleSelectAll = () => {
    if (Object.keys(selectedIds).length === filteredData.length) {
      setSelectedIds({});
    } else {
      const all: Record<string, boolean> = {};
      filteredData.forEach((r) => {
        all[rowKey(r)] = true;
      });
      setSelectedIds(all);
    }
  };

  const toggleRowSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds((prev) => {
      const next = { ...prev };
      if (next[id]) delete next[id];
      else next[id] = true;
      return next;
    });
  };

  const toggleExpand = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedNodes((prev) => ({
      ...prev,
      [id]: !(prev[id] ?? true),
    }));
  };

  const allSelected = filteredData.length > 0 && Object.keys(selectedIds).length === filteredData.length;

  // 5. Excel Export
  const handleExportExcel = () => {
    try {
      const sanitizeCell = (val: any): string => {
        if (val === null || val === undefined) return "";
        const s = String(val).trim();
        if (s.startsWith("=") || s.startsWith("+") || s.startsWith("-") || s.startsWith("@")) {
          return "'" + s;
        }
        return s;
      };

      const headers = columns.map((c) => sanitizeCell(c.header));
      const rows = filteredData.map((row) => {
        return columns.map((col) => {
          const val = col.accessor ? col.accessor(row) : row[col.key];
          return sanitizeCell(val);
        });
      });

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
    return <TableSkeleton rows={6} cols={columns.length} />;
  }

  return (
    <div className={cn("space-y-2", className)}>
      {/* Table Toolbar Strip (Single Action Bar) */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-1.5 rounded-lg border border-[#c7d8e8] bg-white level-2-surface shadow-xs">
        <div className="flex flex-wrap items-center gap-2 flex-1">
          {/* Recessed Inset Search Box */}
          <div className="relative min-w-[200px] max-w-sm flex-1">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <Input
              placeholder={searchPlaceholder}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-7 text-xs bg-[#f0f6fc] text-slate-900 rounded-md border-[#c5d7e8] focus:border-[#0284c7] placeholder:text-slate-400 font-mono shadow-inner"
            />
          </div>

          {subtitle && (
            <span className="text-[11px] text-slate-500 font-mono hidden sm:inline">
              {filteredData.length} records
            </span>
          )}
        </div>

        {/* Action Controls (Pure Icon-First & 3D Jewels) */}
        <div className="flex items-center gap-1.5">
          {headerActions}

          <Button
            size="sm"
            variant="outline"
            onClick={() => setIsCompact(!isCompact)}
            className="h-7 px-2.5 text-xs gap-1.5 font-semibold bg-[#f0f6fc] text-slate-700 border-[#c5d7e8] hover:text-slate-950 rounded-md snappy-btn"
            title={isCompact ? "Switch to Comfortable Row Density" : "Switch to Compact Density"}
          >
            <LayoutList className="h-3.5 w-3.5 text-[#0284c7]" />
            <span className="hidden sm:inline">{isCompact ? "Compact" : "Comfortable"}</span>
          </Button>

          {exportExcel && (
            <Button
              size="sm"
              onClick={handleExportExcel}
              className="h-7 px-2.5 text-xs gap-1.5 font-bold bg-emerald-600 hover:bg-emerald-500 text-white rounded-md shadow-xs snappy-btn border border-emerald-700"
              title="Export to Excel"
            >
              <svg className="aero-icon-sm h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
                <rect x="3" y="3" width="18" height="18" rx="2" fill="#15803d" stroke="#14532d" strokeWidth="1"/>
                <path d="M7 8l4 8M11 8l-4 8" stroke="#ffffff" strokeWidth="2" strokeLinecap="round"/>
                <path d="M15 8h4v8h-4" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              <span className="hidden sm:inline">Excel</span>
            </Button>
          )}
        </div>
      </div>

      {/* Main Table Body (Ultra-Compact 26px Density with Matrix Typography) */}
      {filteredData.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[#c7d8e8] p-8 text-center bg-white">
          {emptyState?.icon ? (
            <emptyState.icon className="mx-auto h-7 w-7 text-slate-400 mb-1.5" />
          ) : (
            <Sparkles className="mx-auto h-7 w-7 text-slate-400 mb-1.5" />
          )}
          <p className="text-xs font-semibold text-slate-800">
            {emptyState?.title || "No Records Found"}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            {emptyState?.description || "No records match your active search or filter criteria."}
          </p>
          {emptyState?.action && <div className="mt-3">{emptyState.action}</div>}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-[#c7d8e8] bg-white shadow-xs">
          <table className="w-full text-left text-xs font-mono">
            <thead className="border-b border-[#c7d8e8] bg-[#edf4fa] uppercase text-[10px] text-slate-600 font-bold sticky top-0 z-10 select-none">
              <tr>
                {selectable && (
                  <th className="w-8 px-2.5 py-1.5 text-center">
                    <button
                      type="button"
                      onClick={toggleSelectAll}
                      className="text-slate-400 hover:text-slate-800 transition-colors"
                    >
                      {allSelected ? (
                        <CheckSquare className="h-3.5 w-3.5 text-[#0284c7]" />
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
                      "font-extrabold tracking-wide text-slate-700",
                      isCompact ? "px-2.5 py-1.5" : "px-3 py-2",
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
            <tbody className="divide-y divide-[#edf4fa]">
              {visibleRows.map((node, rIdx) => {
                const row = node.row;
                const id = rowKey(row);
                const isSelected = Boolean(selectedIds[id]);
                const isExpanded = expandedNodes[id] ?? true;

                return (
                  <tr
                    key={id}
                    onClick={() => {
                      if (renderRowPreview) {
                        setPreviewRow(row);
                        onRowPreview?.(row);
                      } else if (onRowClick) {
                        onRowClick(row);
                      }
                    }}
                    className={cn(
                      "transition-colors group",
                      (onRowClick || renderRowPreview) && "cursor-pointer hover:bg-[#f0f7ff]",
                      isSelected ? "bg-[#e0f2fe]" : "hover:bg-[#f0f7ff]"
                    )}
                  >
                    {selectable && (
                      <td className="px-2.5 py-1 text-center" onClick={(e) => toggleRowSelect(id, e)}>
                        <button type="button" className="text-slate-400 hover:text-slate-800">
                          {isSelected ? (
                            <CheckSquare className="h-3.5 w-3.5 text-[#0284c7]" />
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
                            isCompact ? "px-2.5 py-1 text-xs" : "px-3 py-2 text-xs",
                            col.align === "right" && "text-right font-matrix",
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
                                  className="p-0.5 text-slate-400 hover:text-slate-800 rounded hover:bg-slate-100"
                                >
                                  {isExpanded ? (
                                    <ChevronDown className="h-3.5 w-3.5 text-[#0284c7]" />
                                  ) : (
                                    <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
                                  )}
                                </button>
                              ) : (
                                <span className="w-3.5 inline-block" />
                              )}

                              {row[wbsKey] && (
                                <span className="font-bold text-[10px] text-[#0369a1] bg-sky-100 px-1 py-0.2 rounded border border-sky-200">
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
              <tfoot className="border-t-2 border-[#c7d8e8] bg-[#edf4fa] font-bold text-slate-900">
                <tr>
                  {selectable && <td />}
                  {columns.map((col, idx) => {
                    if (idx === 0) {
                      return (
                        <td key={col.key} className={cn("uppercase tracking-wider", isCompact ? "px-2.5 py-1.5 text-xs" : "px-3 py-2 text-xs")}>
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
                            "text-right text-[#0369a1] font-bold font-matrix",
                            isCompact ? "px-2.5 py-1.5 text-xs" : "px-3 py-2 text-xs"
                          )}
                        >
                          {col.format === "currency" ? formatNpr(total, { prefix: "NPR" }) : total.toLocaleString()}
                        </td>
                      );
                    }

                    if (col.summary === "count") {
                      return (
                        <td key={col.key} className={cn("text-center font-matrix", isCompact ? "px-2.5 py-1.5 text-xs" : "px-3 py-2 text-xs")}>
                          {summaryTotals[col.key]}
                        </td>
                      );
                    }

                    return <td key={col.key} className={isCompact ? "px-2.5 py-1.5" : "px-3 py-2"} />;
                  })}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      {/* Floating Bulk Action Drawer */}
      {selectedRowsList.length > 0 && bulkActions && bulkActions.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-2 rounded-xl border border-[#c7d8e8] bg-white/95 backdrop-blur-xl shadow-xl text-xs font-mono text-slate-900 animate-in fade-in slide-in-from-bottom-4">
          <span className="font-bold text-[#0284c7]">
            {selectedRowsList.length} row{selectedRowsList.length > 1 ? "s" : ""} selected
          </span>
          <div className="h-4 w-[1px] bg-slate-200" />
          <div className="flex items-center gap-2">
            {bulkActions.map((action, idx) => (
              <Button
                key={idx}
                size="sm"
                variant={action.variant || "default"}
                onClick={() => action.onAction(selectedRowsList)}
                className="h-7 text-xs gap-1.5 font-semibold shadow-xs snappy-btn"
              >
                {action.icon && <action.icon className="h-3 w-3" />}
                {action.label}
              </Button>
            ))}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setSelectedIds({})}
              className="h-7 text-xs text-slate-500 hover:text-slate-900"
            >
              Clear
            </Button>
          </div>
        </div>
      )}

      {/* Row Preview Slide-Out Drawer (Sheet) */}
      {renderRowPreview && (
        <Sheet open={Boolean(previewRow)} onOpenChange={(open) => !open && setPreviewRow(null)}>
          <SheetContent className="w-full sm:max-w-xl bg-white border-l border-[#c7d8e8] text-slate-900 backdrop-blur-2xl p-6 overflow-y-auto z-50">
            <SheetHeader className="mb-4 pb-3 border-b border-[#c7d8e8]">
              <SheetTitle className="text-base font-bold font-mono text-slate-900">
                {previewRow && rowPreviewTitle ? rowPreviewTitle(previewRow) : "Record Overview"}
              </SheetTitle>
            </SheetHeader>
            {previewRow && renderRowPreview(previewRow, () => setPreviewRow(null))}
          </SheetContent>
        </Sheet>
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
        <Badge variant="outline" className="text-[10px] uppercase font-mono bg-sky-50 border-sky-200 text-[#0369a1] font-semibold">
          {String(value)}
        </Badge>
      );
    default:
      return String(value);
  }
}

/**
 * Standard Dark-Glass / Modal Delete Confirmation Hook & Dialog
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
      <DialogContent className="max-w-md bg-white border border-[#c7d8e8] text-slate-900 shadow-2xl backdrop-blur-xl">
        <DialogHeader>
          <div className="flex items-center gap-2.5 text-rose-600">
            <AlertTriangle className="h-5 w-5" />
            <DialogTitle className="text-base font-bold font-mono">{config.title}</DialogTitle>
          </div>
          <DialogDescription className="text-xs text-slate-600 mt-2 font-mono">
            {config.description}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 mt-4">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setIsOpen(false)}
            className="h-8 text-xs font-mono bg-[#f0f6fc] text-slate-700 border-[#c5d7e8]"
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
            className="h-8 text-xs font-mono gap-1.5 bg-rose-600 hover:bg-rose-500"
          >
            <Trash2 className="h-3.5 w-3.5" /> Confirm Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return { confirmDelete, deleteDialog: dialog };
}
