"use client";

import { useState, useMemo, Fragment } from "react";
import { trpc } from "@/lib/trpc-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import {
  Search,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  X,
  Clock,
  User,
  Activity,
  Database,
} from "lucide-react";
import { cn } from "@/lib/utils";

type AuditLogEntry = {
  id: string;
  userId: string | null;
  user: { name: string; email: string } | null;
  action: string;
  entityType: string;
  entityId: string;
  metadata: string | null;
  ipAddress: string | null;
  createdAt: Date | string;
};

const ACTION_COLORS: Record<string, string> = {
  "admin.org.create": "bg-primary/10 text-primary border-primary/30",
  "admin.org.update": "bg-primary/10 text-primary border-primary/30",
  "admin.user.create": "bg-cyan-500/10 text-cyan-400 border-cyan-500/30",
  "admin.user.update": "bg-cyan-500/10 text-cyan-400 border-cyan-500/30",
  "admin.impersonation.start": "bg-amber-500/10 text-amber-400 border-amber-500/30",
  "admin.impersonation.stop": "bg-amber-500/10 text-amber-400 border-amber-500/30",
};

export default function AdminAudit() {
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [entityFilter, setEntityFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const pageSize = 50;

  const { data, isLoading } = trpc.admin.listAuditLogs.useQuery({ take: 200 });

  const logs = useMemo(() => {
    if (!data) return [];
    let filtered = data as AuditLogEntry[];

    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter(
        (log) =>
          log.entityId.toLowerCase().includes(q) ||
          log.action.toLowerCase().includes(q) ||
          log.user?.name?.toLowerCase().includes(q) ||
          log.user?.email?.toLowerCase().includes(q) ||
          log.entityType.toLowerCase().includes(q)
      );
    }

    if (actionFilter) {
      filtered = filtered.filter((log) => log.action === actionFilter);
    }

    if (entityFilter) {
      filtered = filtered.filter((log) => log.entityType === entityFilter);
    }

    if (dateFrom) {
      const from = new Date(dateFrom);
      filtered = filtered.filter((log) => new Date(log.createdAt) >= from);
    }

    if (dateTo) {
      const to = new Date(dateTo);
      to.setHours(23, 59, 59, 999);
      filtered = filtered.filter((log) => new Date(log.createdAt) <= to);
    }

    return filtered;
  }, [data, search, actionFilter, entityFilter, dateFrom, dateTo]);

  const paginatedLogs = useMemo(() => {
    const start = page * pageSize;
    return logs.slice(start, start + pageSize);
  }, [logs, page]);

  const totalPages = Math.ceil(logs.length / pageSize);

  const uniqueActions = useMemo(() => {
    if (!data) return [];
    const actions = new Set((data as AuditLogEntry[]).map((l) => l.action));
    return Array.from(actions).sort();
  }, [data]);

  const uniqueEntityTypes = useMemo(() => {
    if (!data) return [];
    const types = new Set((data as AuditLogEntry[]).map((l) => l.entityType));
    return Array.from(types).sort();
  }, [data]);

  function parseMetadata(metadata: string | null): Record<string, any> | null {
    if (!metadata) return null;
    try {
      return JSON.parse(metadata);
    } catch {
      return null;
    }
  }

  function getActionColor(action: string): string {
    return ACTION_COLORS[action] ?? "bg-muted/40 text-muted-foreground border-border/60";
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Audit Trail</h1>
        <p className="text-sm text-muted-foreground">Comprehensive platform audit log with filtering and search.</p>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px] max-w-xs">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by entity ID, action, user..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(0); }}
                className="pl-8 h-8 text-xs"
              />
            </div>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setPage(0); }}
              className="h-8 rounded border border-border bg-card px-2 text-xs"
              placeholder="From"
            />
            <input
              type="date"
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setPage(0); }}
              className="h-8 rounded border border-border bg-card px-2 text-xs"
              placeholder="To"
            />
            <select
              value={actionFilter}
              onChange={(e) => { setActionFilter(e.target.value); setPage(0); }}
              className="h-8 rounded border border-border bg-card px-2 text-xs font-mono"
            >
              <option value="">All actions</option>
              {uniqueActions.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
            <select
              value={entityFilter}
              onChange={(e) => { setEntityFilter(e.target.value); setPage(0); }}
              className="h-8 rounded border border-border bg-card px-2 text-xs font-mono"
            >
              <option value="">All entities</option>
              {uniqueEntityTypes.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={() => {
                const csv = [
                  ["Timestamp", "User", "Email", "Action", "Entity Type", "Entity ID", "IP Address", "Metadata"].join(","),
                  ...logs.map((log) => [
                    new Date(log.createdAt).toISOString(),
                    log.user?.name ?? "system",
                    log.user?.email ?? "",
                    log.action,
                    log.entityType,
                    log.entityId,
                    log.ipAddress ?? "",
                    log.metadata ? `"${log.metadata.replace(/"/g, '""')}"` : "",
                  ].join(",")),
                ].join("\n");
                const blob = new Blob([csv], { type: "text/csv" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
                a.click();
                URL.revokeObjectURL(url);
              }}
            >
              Export CSV
            </Button>
            {(search || actionFilter || entityFilter || dateFrom || dateTo) && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs text-muted-foreground"
                onClick={() => { setSearch(""); setActionFilter(""); setEntityFilter(""); setDateFrom(""); setDateTo(""); setPage(0); }}
              >
                <X className="h-3 w-3 mr-1" /> Clear
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-primary" />
              <span className="text-xs text-muted-foreground">Total Logs</span>
            </div>
            <p className="text-lg font-bold text-foreground mt-1">{logs.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-cyan-400" />
              <span className="text-xs text-muted-foreground">Unique Users</span>
            </div>
            <p className="text-lg font-bold text-foreground mt-1">
              {data ? new Set((data as AuditLogEntry[]).filter((l) => l.user).map((l) => l.userId)).size : 0}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-amber-400" />
              <span className="text-xs text-muted-foreground">Action Types</span>
            </div>
            <p className="text-lg font-bold text-foreground mt-1">{uniqueActions.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-purple-400" />
              <span className="text-xs text-muted-foreground">Entity Types</span>
            </div>
            <p className="text-lg font-bold text-foreground mt-1">{uniqueEntityTypes.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Audit Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>
          ) : paginatedLogs.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">No audit entries found.</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs w-8"></TableHead>
                    <TableHead className="text-xs">Timestamp</TableHead>
                    <TableHead className="text-xs">User</TableHead>
                    <TableHead className="text-xs">Action</TableHead>
                    <TableHead className="text-xs">Entity Type</TableHead>
                    <TableHead className="text-xs">Entity ID</TableHead>
                    <TableHead className="text-xs">IP Address</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedLogs.map((log) => {
                    const isExpanded = expandedId === log.id;
                    const meta = parseMetadata(log.metadata);
                    return (
                      <Fragment key={log.id}>
                        <TableRow
                          className="cursor-pointer hover:bg-primary/5"
                          onClick={() => setExpandedId(isExpanded ? null : log.id)}
                        >
                          <TableCell className="w-8 py-1.5 px-1 text-center text-muted-foreground">
                            <button
                              type="button"
                              className="inline-flex items-center justify-center h-4 w-4 rounded hover:bg-muted text-primary"
                              onClick={(e) => { e.stopPropagation(); setExpandedId(isExpanded ? null : log.id); }}
                            >
                              {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                            </button>
                          </TableCell>
                          <TableCell className="text-[10px] text-muted-foreground whitespace-nowrap">
                            {format(new Date(log.createdAt), "dd MMM yy HH:mm:ss")}
                          </TableCell>
                          <TableCell className="text-xs">
                            <div className="flex flex-col">
                              <span className="font-medium">{log.user?.name ?? "system"}</span>
                              {log.user?.email && (
                                <span className="text-[10px] text-muted-foreground">{log.user.email}</span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-xs">
                            <Badge variant="outline" className={cn("text-[9px]", getActionColor(log.action))}>
                              {log.action}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">{log.entityType}</TableCell>
                          <TableCell className="text-xs text-muted-foreground font-mono">
                            {log.entityId.slice(0, 12)}…
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground font-mono">
                            {log.ipAddress ?? "—"}
                          </TableCell>
                        </TableRow>
                        {isExpanded && (
                          <TableRow key={`${log.id}-expanded`}>
                            <TableCell colSpan={7} className="p-0">
                              <div className="bg-muted/30 border-t border-border/40 p-3 space-y-2">
                                <div className="text-[11px] font-bold text-primary uppercase tracking-wide">
                                  Full Details
                                </div>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px]">
                                  <div>
                                    <span className="text-muted-foreground">Log ID:</span>
                                    <span className="ml-1 font-mono">{log.id}</span>
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground">User ID:</span>
                                    <span className="ml-1 font-mono">{log.userId ?? "—"}</span>
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground">Entity ID:</span>
                                    <span className="ml-1 font-mono">{log.entityId}</span>
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground">Created:</span>
                                    <span className="ml-1 font-mono">{format(new Date(log.createdAt), "yyyy-MM-dd HH:mm:ss")}</span>
                                  </div>
                                </div>
                                {meta && (
                                  <div className="mt-2">
                                    <span className="text-[11px] text-muted-foreground font-bold">Metadata:</span>
                                    <pre className="mt-1 p-2 rounded bg-card border border-border/60 text-[10px] font-mono overflow-x-auto max-h-40">
                                      {JSON.stringify(meta, null, 2)}
                                    </pre>
                                  </div>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            Showing {page * pageSize + 1}–{Math.min((page + 1) * pageSize, logs.length)} of {logs.length}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              className="h-7 w-7 p-0 border-border/80"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <span className="text-xs text-muted-foreground px-2">
              Page {page + 1} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-7 w-7 p-0 border-border/80"
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
