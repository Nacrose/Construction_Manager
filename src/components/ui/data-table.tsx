"use client";

import * as React from "react";
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
  getPaginationRowModel,
  SortingState,
  getSortedRowModel,
  ColumnFiltersState,
  getFilteredRowModel,
  VisibilityState,
  ColumnSizingState,
} from "@tanstack/react-table";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {Search, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Settings2} from "lucide-react";
import { cn } from "@/lib/utils";
import { useUserPreferences } from "@/components/user-preferences-provider";

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  searchPlaceholder?: string;
  searchColumn?: string;
  pageSize?: number;
  tableId?: string; // For state persistence in localStorage
  enableColumnVisibility?: boolean;
  enableResizing?: boolean;
  enableZebraStriping?: boolean;
  enableSearch?: boolean;
  onRowClick?: (row: TData) => void;
}

export function DataTable<TData, TValue>({
  columns,
  data,
  searchPlaceholder = "Search...",
  searchColumn,
  pageSize = 10,
  tableId,
  enableColumnVisibility = true,
  enableResizing = true,
  enableZebraStriping = true,
  enableSearch = true,
  onRowClick,
}: DataTableProps<TData, TValue>) {
  const { getPref, setPref } = useUserPreferences();

  const loadTablePref = (key: string, defaultValue: any) => {
    const prefKey = tableId ? `tables.${tableId}.${key}` : null;
    if (prefKey) {
      const val = getPref(prefKey);
      if (val !== undefined && val !== null) return val;
    }
    if (typeof window !== "undefined" && tableId) {
      const saved = localStorage.getItem(`dt_${tableId}_${key}`);
      if (saved) return JSON.parse(saved);
    }
    return defaultValue;
  };

  const [sorting, setSorting] = React.useState<SortingState>(() => loadTablePref("sorting", []));
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>(() => loadTablePref("visibility", {}));
  const [columnSizing, setColumnSizing] = React.useState<ColumnSizingState>(() => loadTablePref("sizing", {}));

  // Save state to local storage and sync to server when it changes
  React.useEffect(() => {
    if (tableId) {
      const key = `dt_${tableId}_sorting`;
      localStorage.setItem(key, JSON.stringify(sorting));
      setPref(`tables.${tableId}.sorting`, sorting);
    }
  }, [sorting, tableId, setPref]);

  React.useEffect(() => {
    if (tableId) {
      const key = `dt_${tableId}_visibility`;
      localStorage.setItem(key, JSON.stringify(columnVisibility));
      setPref(`tables.${tableId}.visibility`, columnVisibility);
    }
  }, [columnVisibility, tableId, setPref]);

  React.useEffect(() => {
    if (tableId) {
      const key = `dt_${tableId}_sizing`;
      localStorage.setItem(key, JSON.stringify(columnSizing));
      setPref(`tables.${tableId}.sizing`, columnSizing);
    }
  }, [columnSizing, tableId, setPref]);

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onSortingChange: setSorting,
    getSortedRowModel: getSortedRowModel(),
    onColumnFiltersChange: setColumnFilters,
    getFilteredRowModel: getFilteredRowModel(),
    onColumnVisibilityChange: setColumnVisibility,
    onColumnSizingChange: setColumnSizing,
    enableColumnResizing: enableResizing,
    columnResizeMode: "onChange",
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      columnSizing,
    },
    initialState: {
      pagination: {
        pageSize,
      },
    },
  });

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        {enableSearch && searchColumn ? (
          <div className="flex items-center gap-2 relative min-w-[140px] flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={searchPlaceholder}
              value={(table.getColumn(searchColumn)?.getFilterValue() as string) ?? ""}
              onChange={(event) =>
                table.getColumn(searchColumn)?.setFilterValue(event.target.value)
              }
              className="h-8 pl-8 text-xs bg-card"
            />
          </div>
        ) : (
          <div /> // Spacer
        )}
        
        {enableColumnVisibility && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="ml-auto h-8 bg-card text-xs">
                <Settings2 className="mr-1.5 h-3.5 w-3.5" />
                View
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[150px]">
              {table
                .getAllColumns()
                .filter((column) => typeof column.accessorFn !== "undefined" && column.getCanHide())
                .map((column) => {
                  return (
                    <DropdownMenuCheckboxItem
                      key={column.id}
                      className="capitalize"
                      checked={column.getIsVisible()}
                      onCheckedChange={(value) => column.toggleVisibility(!!value)}
                    >
                      {typeof column.columnDef.header === 'string' ? column.columnDef.header : column.id}
                    </DropdownMenuCheckboxItem>
                  );
                })}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      <div className="rounded-md border border-border/40 bg-card overflow-hidden relative">
        <table className="w-full table-fixed text-xs caption-bottom tabular-nums">
          <TableHeader className="sticky top-0 z-20 bg-muted shadow-[0_1px_0_0_var(--border)]">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="border-border/40">
                {headerGroup.headers.map((header) => {
                  return (
                    <TableHead 
                      key={header.id}
                      style={{ width: header.getSize() }}
                      className={cn(
                        "relative whitespace-nowrap overflow-hidden text-ellipsis px-2 py-1.5 select-none text-sm font-semibold text-foreground",
                        header.column.getCanSort() && "cursor-pointer hover:bg-muted/50"
                      )}
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                      {{ asc: " ▲", desc: " ▼" }[header.column.getIsSorted() as string] ?? null}
                      
                      {/* Resize Handle */}
                      {enableResizing && header.column.getCanResize() && (
                        <div
                          onMouseDown={header.getResizeHandler()}
                          onTouchStart={header.getResizeHandler()}
                          className={`absolute right-0 top-0 h-full w-1.5 cursor-col-resize select-none touch-none hover:bg-primary/50 ${
                            header.column.getIsResizing() ? "bg-primary" : "bg-transparent"
                          }`}
                        />
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                 <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                  className={cn(
                    "border-border/40 hover:bg-primary/5",
                    enableZebraStriping ? "even:bg-muted/20" : "",
                    onRowClick && "cursor-pointer select-none"
                  )}
                  onClick={() => onRowClick?.(row.original)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell 
                      key={cell.id}
                      style={{ width: cell.column.getSize() }}
                      className="break-words whitespace-normal px-2 py-1 text-xs"
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center text-xs">
                  No results.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </table>
      </div>
      <div className="flex items-center justify-between px-2">
        <div className="flex-1 text-xs text-muted-foreground">
          Showing {table.getRowModel().rows.length} of {data.length} row(s).
        </div>
        <div className="flex items-center space-x-6 lg:space-x-8">
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              className="hidden h-8 w-8 p-0 lg:flex"
              onClick={() => table.setPageIndex(0)}
              disabled={!table.getCanPreviousPage()}
            >
              <span className="sr-only">Go to first page</span>
              <ChevronsLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              className="h-8 w-8 p-0"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              <span className="sr-only">Go to previous page</span>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="flex items-center justify-center text-sm font-medium">
              Page {table.getState().pagination.pageIndex + 1} of{" "}
              {table.getPageCount() || 1}
            </div>
            <Button
              variant="outline"
              className="h-8 w-8 p-0"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              <span className="sr-only">Go to next page</span>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              className="hidden h-8 w-8 p-0 lg:flex"
              onClick={() => table.setPageIndex(table.getPageCount() - 1)}
              disabled={!table.getCanNextPage()}
            >
              <span className="sr-only">Go to last page</span>
              <ChevronsRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
