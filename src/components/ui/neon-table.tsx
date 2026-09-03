"use client"

import * as React from "react"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  ArrowUp, ArrowDown, ChevronsUpDown, Search, Download,
  Plus, Trash2, Check, X, Loader2,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { TableSkeleton } from "./table-skeleton"

export type NeonColumn<T> = {
  key: string
  header: string
  width?: number
  sortable?: boolean
  editable?: boolean
  type?: "text" | "number" | "date" | "boolean" | "select"
  options?: Array<{ value: string; label: string }>
  render?: (row: T) => React.ReactNode
  format?: (value: any) => string
  className?: string
}

export type NeonTableProps<T> = {
  columns: NeonColumn<T>[]
  data: T[]
  rowKey?: (row: T, index: number) => string
  pageSize?: number
  searchable?: boolean
  searchKeys?: string[]
  onRowClick?: (row: T) => void
  onCellEdit?: (rowId: string, columnKey: string, newValue: any) => Promise<void> | void
  onRowDelete?: (rowId: string) => Promise<void> | void
  onRowCreate?: () => void
  loading?: boolean
  emptyMessage?: string
  totalCount?: number
  serverSide?: {
    page: number
    pageSize: number
    onPageChange: (page: number) => void
    onSearchChange?: (search: string) => void
    onSortChange?: (column: string | null, direction: "asc" | "desc") => void
    sortColumn?: string | null
    sortDirection?: "asc" | "desc"
  }
}

export function NeonTable<T extends Record<string, any>>({
  columns, data, rowKey = (_, i) => String(i), pageSize: initialPageSize = 50,
  searchable = true, searchKeys, onRowClick, onCellEdit, onRowCreate, onRowDelete,
  loading = false, emptyMessage = "No data found.", totalCount, serverSide,
}: NeonTableProps<T>) {
  const [search, setSearch] = React.useState("")
  const [page, setPage] = React.useState(1)
  const [pageSize] = React.useState(initialPageSize)
  const [sortCol, setSortCol] = React.useState<string | null>(serverSide?.sortColumn ?? null)
  const [sortDir, setSortDir] = React.useState<"asc" | "desc">(serverSide?.sortDirection ?? "asc")
  const [columnWidths, setColumnWidths] = React.useState<Record<string, number>>({})
  const [editing, setEditing] = React.useState<{ rowId: string; col: string } | null>(null)
  const [editValue, setEditValue] = React.useState("")
  const [saving, setSaving] = React.useState(false)

  const filteredData = React.useMemo(() => {
    if (serverSide || !search) return data
    const keys = searchKeys ?? columns.map(c => c.key)
    const s = search.toLowerCase()
    return data.filter(row => keys.some(k => { const v = row[k]; return v != null && String(v).toLowerCase().includes(s) }))
  }, [data, search, searchKeys, columns, serverSide])

  const sortedData = React.useMemo(() => {
    if (serverSide || !sortCol) return filteredData
    return [...filteredData].sort((a, b) => {
      const av = a[sortCol], bv = b[sortCol]
      if (av == null) return 1; if (bv == null) return -1
      if (typeof av === "number" && typeof bv === "number") return sortDir === "asc" ? av - bv : bv - av
      return sortDir === "asc" ? String(av).localeCompare(String(bv), undefined, { numeric: true }) : String(bv).localeCompare(String(av), undefined, { numeric: true })
    })
  }, [filteredData, sortCol, sortDir, serverSide])

  const totalRows = totalCount ?? sortedData.length
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize))
  const currentPage = serverSide?.page ?? page
  const displayData = serverSide ? sortedData : sortedData.slice((page - 1) * pageSize, page * pageSize)

  const resizeRef = React.useRef<{ col: string; startX: number; startWidth: number } | null>(null)
  function startResize(e: React.MouseEvent, colKey: string) {
    e.stopPropagation(); e.preventDefault()
    resizeRef.current = { col: colKey, startX: e.clientX, startWidth: columnWidths[colKey] ?? 150 }
    document.body.style.cursor = "col-resize"; document.body.style.userSelect = "none"
  }
  React.useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!resizeRef.current) return
      const { col, startX, startWidth } = resizeRef.current
      setColumnWidths(p => ({ ...p, [col]: Math.max(60, startWidth + (e.clientX - startX)) }))
    }
    function onUp() { resizeRef.current = null; document.body.style.cursor = ""; document.body.style.userSelect = "" }
    window.addEventListener("mousemove", onMove); window.addEventListener("mouseup", onUp)
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp) }
  }, [])

  function handleSort(colKey: string) {
    if (serverSide?.onSortChange) {
      const newDir = sortCol === colKey && sortDir === "asc" ? "desc" : "asc"
      setSortCol(colKey); setSortDir(newDir); serverSide.onSortChange(colKey, newDir); return
    }
    if (sortCol === colKey) setSortDir(d => d === "asc" ? "desc" : "asc")
    else { setSortCol(colKey); setSortDir("asc") }
    setPage(1)
  }

  function startEdit(rowId: string, col: string, val: any) {
    if (!onCellEdit) return
    setEditing({ rowId, col }); setEditValue(val == null ? "" : String(val))
  }
  async function saveEdit() {
    if (!editing || !onCellEdit) return
    setSaving(true)
    try { await onCellEdit(editing.rowId, editing.col, editValue); setEditing(null) } catch {} finally { setSaving(false) }
  }

  function handleExport() {
    const headers = columns.map(c => c.header).join(",")
    const rows = sortedData.map(row => columns.map(c => {
      let v = row[c.key]; if (c.format) v = c.format(v); if (v == null) v = ""
      const s = String(v); return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s
    }).join(","))
    const blob = new Blob([headers + "\n" + rows.join("\n")], { type: "text/csv" })
    const url = URL.createObjectURL(blob); const a = document.createElement("a")
    a.href = url; a.download = "export.csv"; a.click(); URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        {searchable && (
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search…" value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); serverSide?.onSearchChange?.(e.target.value) }}
              className="pl-7 h-9 text-sm" />
          </div>
        )}
        <span className="text-xs text-muted-foreground">{totalRows} rows</span>
        <div className="flex-1" />
        {onRowCreate && <Button size="sm" variant="outline" onClick={onRowCreate} className="h-8 text-xs"><Plus className="h-3.5 w-3.5 mr-1" /> Add</Button>}
        <Button size="sm" variant="ghost" onClick={handleExport} className="h-8 text-xs"><Download className="h-3.5 w-3.5" /></Button>
      </div>

      <div className="rounded-lg border border-border/40 overflow-hidden">
        <div className="overflow-auto max-h-[calc(100vh-320px)]">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                {onRowDelete && <TableHead className="w-10" />}
                {columns.map(col => (
                  <TableHead key={col.key} style={{ width: columnWidths[col.key] ?? col.width, minWidth: 60 }}>
                    <div className="flex items-center gap-1">
                      {col.sortable !== false && (
                        <button onClick={() => handleSort(col.key)} className="rounded p-0.5 hover:bg-muted">
                          {sortCol === col.key ? (sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ChevronsUpDown className="h-3 w-3 opacity-30" />}
                        </button>
                      )}
                      <span>{col.header}</span>
                    </div>
                    <div className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-primary/20" onMouseDown={(e) => startResize(e, col.key)} />
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={columns.length + 1} className="p-0"><TableSkeleton columns={columns.length} rows={6} /></TableCell></TableRow>
              ) : displayData.length === 0 ? (
                <TableRow><TableCell colSpan={columns.length + 1} className="py-12 text-center text-sm text-muted-foreground">{emptyMessage}</TableCell></TableRow>
              ) : (
                displayData.map((row, i) => {
                  const rid = rowKey(row, i)
                  return (
                    <TableRow key={rid} data-animate className={cn(onRowClick && "cursor-pointer")} onClick={() => onRowClick?.(row)}>
                      {onRowDelete && (
                        <TableCell className="w-10" onClick={e => e.stopPropagation()}>
                          <button onClick={() => confirm("Delete?") && onRowDelete(rid)} className="rounded p-1 text-muted-foreground hover:bg-red-100 hover:text-red-600"><Trash2 className="h-3 w-3" /></button>
                        </TableCell>
                      )}
                      {columns.map(col => {
                        const isEditing = editing?.rowId === rid && editing?.col === col.key
                        const val = row[col.key]
                        return (
                          <TableCell key={col.key} style={{ width: columnWidths[col.key] ?? col.width }}
                            className={cn(col.className, col.editable && "cursor-text hover:bg-muted/30", col.type === "number" && "font-mono tabular-nums text-right", col.type === "boolean" && (val ? "text-success" : "text-red-600"), val == null && "text-muted-foreground/40 italic")}
                            onClick={e => { if (col.editable) { e.stopPropagation(); startEdit(rid, col.key, val) } }}>
                            {isEditing ? (
                              <div className="flex items-center gap-1">
                                {col.type === "boolean" ? (
                                  <select value={editValue} onChange={e => setEditValue(e.target.value)} onKeyDown={e => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") setEditing(null) }} autoFocus className="h-7 rounded border bg-background px-1 text-xs"><option value="true">true</option><option value="false">false</option></select>
                                ) : col.type === "select" && col.options ? (
                                  <select value={editValue} onChange={e => setEditValue(e.target.value)} onKeyDown={e => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") setEditing(null) }} autoFocus className="h-7 rounded border bg-background px-1 text-xs">{col.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
                                ) : (
                                  <input type={col.type === "number" ? "number" : col.type === "date" ? "date" : "text"} value={editValue} onChange={e => setEditValue(e.target.value)} onKeyDown={e => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") setEditing(null) }} onBlur={saveEdit} autoFocus className="h-7 w-full rounded border border-primary bg-background px-1.5 text-xs" />
                                )}
                                {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <><button onClick={saveEdit} className="rounded p-0.5 hover:bg-success/15"><Check className="h-3 w-3 text-success" /></button><button onClick={() => setEditing(null)} className="rounded p-0.5 hover:bg-red-100"><X className="h-3 w-3 text-red-600" /></button></>}
                              </div>
                            ) : col.render ? col.render(row) : (
                              <span className="truncate block max-w-[300px]" title={col.format ? col.format(val) : String(val ?? "")}>{col.format ? col.format(val) : val == null ? "—" : String(val)}</span>
                            )}
                          </TableCell>
                        )
                      })}
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{totalRows > 0 && `Showing ${((currentPage - 1) * pageSize) + 1}–${Math.min(currentPage * pageSize, totalRows)} of ${totalRows}`}</span>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" disabled={currentPage <= 1} onClick={() => serverSide ? serverSide.onPageChange(1) : setPage(1)}><ChevronsLeft className="h-3.5 w-3.5" /></Button>
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" disabled={currentPage <= 1} onClick={() => serverSide ? serverSide.onPageChange(currentPage - 1) : setPage(p => p - 1)}><ChevronLeft className="h-3.5 w-3.5" /></Button>
          <span className="text-xs px-2 tabular-nums">{currentPage} / {totalPages}</span>
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" disabled={currentPage >= totalPages} onClick={() => serverSide ? serverSide.onPageChange(currentPage + 1) : setPage(p => p + 1)}><ChevronRight className="h-3.5 w-3.5" /></Button>
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" disabled={currentPage >= totalPages} onClick={() => serverSide ? serverSide.onPageChange(totalPages) : setPage(totalPages)}><ChevronsRight className="h-3.5 w-3.5" /></Button>
        </div>
      </div>
    </div>
  )
}
