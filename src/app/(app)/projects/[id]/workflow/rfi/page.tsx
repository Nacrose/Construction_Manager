// @ts-nocheck
"use client";

import { use, useState, useEffect, useCallback, useRef, useMemo } from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc-client";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { CsvImportForm } from "./components/csv-import-form";
import {
  Plus,
  Inbox,
  Download,
  KanbanSquare,
  LayoutGrid,
  Upload,
  FileSpreadsheet,
  ChevronLeft,
} from "lucide-react";
import { ViewRfiDialog } from "@/components/workflow/view-rfi-dialog";
import { CreateRfiDialog } from "@/components/workflow/create-rfi-dialog";
import { KanbanBoard } from "@/components/workflow/kanban-board";
import { cn } from "@/lib/utils";
import { AnimatedPage } from "@/components/ui/animated-page";
import { useFXStore } from "@/lib/fx-store";
import { RfiToolbar } from "./components/rfi-toolbar";
import { RfiTable } from "./components/rfi-table";
import { RfiBatchBar } from "./components/rfi-batch-bar";

export default function RfiListPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [disciplineFilter, setDisciplineFilter] = useState<string>("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [viewRfiId, setViewRfiId] = useState<string | null>(null);
  const [boardView, setBoardView] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [createOpen, setCreateOpen] = useState(false);

  const tableDensity = useFXStore((s) => s.tableDensity);
  const setTableDensity = useFXStore((s) => s.setTableDensity);

  const searchInputRef = useRef<HTMLInputElement>(null);

  const toggleSelect = useCallback((itemId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }, []);

  const deselectAll = useCallback(() => setSelectedIds(new Set()), []);

  const { data: projectInfo } = trpc.project.get.useQuery({ id }, { staleTime: 300_000 });

  const { data, isLoading, error } = trpc.workflow.rfi.list.useQuery({
    projectId: id,
    status: statusFilter !== "all" ? statusFilter : undefined,
    q: search || undefined,
  });

  const myRole = projectInfo?.myRole;
  const canWrite = myRole && myRole !== "client" && myRole !== "inspector";

  // Keyboard shortcuts: n = new RFI, / = focus search, Esc = blur search
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      const isInput = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";

      if (e.key === "Escape") {
        if (isInput && searchInputRef.current) {
          searchInputRef.current.blur();
        }
        return;
      }

      if (isInput) return;

      if (e.key === "n" && canWrite) {
        e.preventDefault();
        setCreateOpen(true);
      } else if (e.key === "/") {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [canWrite]);

  // Client-side filtering for extra fields
  const filteredRfis = useMemo(() => {
    return (data?.rfis || []).filter((rfi) => {
      if (priorityFilter !== "all" && rfi.priority !== priorityFilter) return false;
      if (disciplineFilter !== "all") {
        if (disciplineFilter === "none" && rfi.discipline) return false;
        if (disciplineFilter !== "none" && rfi.discipline !== disciplineFilter) return false;
      }
      const filterDate = rfi.workDate ? new Date(rfi.workDate) : new Date(rfi.createdAt);
      if (fromDate && filterDate < new Date(fromDate)) return false;
      if (toDate) {
        const to = new Date(toDate);
        to.setHours(23, 59, 59, 999);
        if (filterDate > to) return false;
      }
      return true;
    });
  }, [data?.rfis, priorityFilter, disciplineFilter, fromDate, toDate]);

  const toggleSelectAll = useCallback(() => {
    if (selectedIds.size === filteredRfis.length && filteredRfis.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredRfis.map((r) => r.id)));
    }
  }, [selectedIds, filteredRfis]);

  const exportCsv = () => {
    const rows = filteredRfis.map((r) => ({
      "RFI #": r.number,
      Subject: r.subject,
      Status: r.status,
      Priority: r.priority,
      Discipline: r.discipline ?? "General",
      "Created Date": new Date(r.createdAt).toLocaleDateString(),
      "Created By": r.createdBy.name,
      "Linked Task": r.ganttTask ? `${r.ganttTask.code ?? ""} ${r.ganttTask.name}` : "",
      "BOQ Item": r.boqItem ? `${r.boqItem.code} ${r.boqItem.description}` : "",
      "Cost Impact": r.costImpact ? "Yes" : "No",
      "Schedule Impact": r.scheduleImpact ? "Yes" : "No",
    }));
    const headers = Object.keys(rows[0] ?? {});
    const csv = [
      headers.join(","),
      ...rows.map((r) =>
        headers.map((h) => `"${((r as any)[h] || "").replace(/"/g, '""')}"`).join(",")
      ),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rfis-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const utils = trpc.useUtils();

  const batchUpdateMutation = trpc.workflow.rfi.update.useMutation({
    onSuccess: () => {
      utils.workflow.rfi.list.invalidate({ projectId: id });
    },
    onError: (e) => toast.error(e.message),
  });
  const batchDeleteMutation = trpc.workflow.rfi.delete.useMutation({
    onSuccess: () => {
      utils.workflow.rfi.list.invalidate({ projectId: id });
    },
    onError: (e) => toast.error(e.message),
  });

  const doBatchStatus = (status: string) => {
    const targetIds = [...selectedIds];
    if (!targetIds.length) return;
    const canDelete = myRole === "project_manager" || myRole === "coordinator";
    const canDoWrite = myRole && myRole !== "client" && myRole !== "inspector";
    Promise.all(
      targetIds.map((targetId) =>
        status === "delete" && canDelete
          ? batchDeleteMutation.mutateAsync({ id: targetId })
          : status !== "delete" && canDoWrite
            ? batchUpdateMutation.mutateAsync({ id: targetId, status: status as any })
            : Promise.resolve()
      )
    )
      .then(() => {
        toast.success(`Updated ${targetIds.length} RFI(s)`);
        deselectAll();
      })
      .catch(() => toast.error("Some updates failed"));
  };

  const isCompact = tableDensity === "compact";

  return (
    <AnimatedPage className="space-y-3 pb-8 font-mono">
      {/* Top Breadcrumbs & Matrix Toolbar */}
      <div className="flex items-center justify-between gap-3 border-b border-border/60 pb-3">
        <div className="flex items-center gap-2 min-w-0">
          <Link
            href={`/projects/${id}`}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-border/80 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            title="Back to project"
          >
            <ChevronLeft className="h-4 w-4" />
          </Link>
          <div className="flex items-center gap-1.5 text-xs min-w-0">
            <Link
              href={`/projects/${id}`}
              className="text-muted-foreground hover:text-foreground truncate"
            >
              {projectInfo?.project.code ?? "Project"}
            </Link>
            <span className="text-muted-foreground/40">/</span>
            <span className="font-bold text-primary uppercase tracking-wider">RFI Tracking</span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Density Toggle */}
          <div
            className="flex items-center rounded border border-border/80 bg-muted/40 p-0.5"
            title="Row Density"
          >
            <button
              onClick={() => setTableDensity("comfortable")}
              className={cn(
                "px-2 py-1 text-[11px] rounded transition-colors",
                tableDensity === "comfortable"
                  ? "bg-primary text-primary-foreground font-bold shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Comfortable
            </button>
            <button
              onClick={() => setTableDensity("compact")}
              className={cn(
                "px-2 py-1 text-[11px] rounded transition-colors",
                tableDensity === "compact"
                  ? "bg-primary text-primary-foreground font-bold shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Compact
            </button>
          </div>

          {/* View Toggle */}
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs font-mono border-border/80 gap-1.5"
            onClick={() => setBoardView(!boardView)}
            title={boardView ? "Switch to Table view" : "Switch to Board view"}
          >
            {boardView ? (
              <LayoutGrid className="h-3.5 w-3.5 text-primary" />
            ) : (
              <KanbanSquare className="h-3.5 w-3.5 text-primary" />
            )}
            <span>{boardView ? "Table" : "Board"}</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs font-mono border-border/80 gap-1.5"
            onClick={exportCsv}
            title="Export CSV"
          >
            <Download className="h-3.5 w-3.5 text-primary" />
            <span className="hidden sm:inline">CSV</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs font-mono border-border/80 gap-1.5"
            onClick={() => setImportOpen(true)}
            title="Import CSV"
          >
            <Upload className="h-3.5 w-3.5 text-primary" />
            <span className="hidden sm:inline">Import</span>
          </Button>

          {canWrite && (
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button
                  size="sm"
                  className="h-8 text-xs font-mono font-bold bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5 shadow-sm"
                >
                  <Plus className="h-3.5 w-3.5" /> New RFI
                </Button>
              </DialogTrigger>
              <CreateRfiDialog
                projectId={id}
                existingCount={data?.rfis.length ?? 0}
                onCreated={() => setCreateOpen(false)}
                onCancel={() => setCreateOpen(false)}
              />
            </Dialog>
          )}
        </div>
      </div>

      {myRole === "client" || myRole === "inspector" ? (
        <div className="rounded border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-400 font-mono">
          Read-only mode. You can review RFI data and decisions.
        </div>
      ) : null}

      {/* Technical Filter Bar */}
      <RfiToolbar
        search={search}
        setSearch={setSearch}
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
        priorityFilter={priorityFilter}
        setPriorityFilter={setPriorityFilter}
        disciplineFilter={disciplineFilter}
        setDisciplineFilter={setDisciplineFilter}
        fromDate={fromDate}
        setFromDate={setFromDate}
        toDate={toDate}
        setToDate={setToDate}
        rfis={data?.rfis || []}
        searchInputRef={searchInputRef}
      />

      {/* Main Content Area */}
      {isLoading ? (
        <Skeleton className="h-96 w-full" />
      ) : error ? (
        <Card className="p-8 text-center text-destructive">{error.message}</Card>
      ) : filteredRfis.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 p-12 text-center border-border/80 bg-card">
          <Inbox className="h-10 w-10 text-muted-foreground/40" />
          <div>
            <p className="font-bold text-sm">No RFIs found</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {search || statusFilter !== "all" || disciplineFilter !== "all"
                ? "Try adjusting your search or active filters."
                : "Create your first RFI to track engineering clarifications."}
            </p>
          </div>
          {canWrite && (
            <Button
              onClick={() => setCreateOpen(true)}
              size="sm"
              className="mt-2 text-xs font-mono font-bold bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <Plus className="h-3.5 w-3.5 mr-1" /> New RFI
            </Button>
          )}
        </Card>
      ) : boardView ? (
        <KanbanBoard rfis={filteredRfis as any} onOpenRfi={setViewRfiId} projectId={id} />
      ) : (
        <RfiTable
          id={id}
          filteredRfis={filteredRfis}
          selectedIds={selectedIds}
          toggleSelect={toggleSelect}
          toggleSelectAll={toggleSelectAll}
          canWrite={Boolean(canWrite)}
          isCompact={isCompact}
          setViewRfiId={setViewRfiId}
        />
      )}

      {/* Batch Actions Bar */}
      <RfiBatchBar
        selectedCount={selectedIds.size}
        deselectAll={deselectAll}
        onBatchStatus={doBatchStatus}
      />

      {/* View / Respond Dialog */}
      <ViewRfiDialog
        rfiId={viewRfiId}
        projectId={id}
        open={!!viewRfiId}
        onOpenChange={(open) => !open && setViewRfiId(null)}
      />

      {/* CSV Import Dialog */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden font-mono bg-card border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm font-bold text-primary">
              <FileSpreadsheet className="h-4 w-4" />
              Import RFIs from CSV
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Upload a CSV file with RFI columns: number, subject, description, location, priority,
              discipline, workDate.
            </DialogDescription>
          </DialogHeader>
          <CsvImportForm projectId={id} onSuccess={() => setImportOpen(false)} />
        </DialogContent>
      </Dialog>
    </AnimatedPage>
  );
}
