"use client";

import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc-client";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Plus, Compass, FileImage, GitBranch, Search, Building2,
  Download, Eye, CheckCircle2, Layers,
} from "lucide-react";
import { format } from "date-fns";
import { ConstructionTable, ConstructionTableColumn } from "@/components/ui/construction-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DrawingViewer } from "@/app/(app)/projects/[id]/drawings/components/drawing-viewer";
import { UploadDrawingDialog } from "@/app/(app)/projects/[id]/drawings/dialogs/upload-drawing-dialog";
import { DISCIPLINE_COLORS } from "@/app/(app)/projects/[id]/drawings/components/constants";

type DrawingItem = {
  id: string;
  number: string;
  title: string;
  discipline?: string | null;
  status: string;
  revision: string;
  issuedDate?: Date | string | null;
  fileName?: string | null;
  fileType?: string | null;
  approvalStatus?: string | null;
  createdAt: Date | string;
  project?: { id: string; name: string; code: string } | null;
  drawingSet?: { id: string; name: string } | null;
  _count: { revisions: number; rfis: number };
};

export default function OrgDrawingsPage() {
  const [selectedProjectId, setSelectedProjectId] = useState<string>("all");
  const [discipline, setDiscipline] = useState<string>("all");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [viewerDrawingId, setViewerDrawingId] = useState<string | null>(null);

  const { data: projectsData } = trpc.project.list.useQuery();
  const projects = projectsData?.projects || [];

  const drawingsQuery = trpc.document.listDrawings.useInfiniteQuery(
    {
      projectId: selectedProjectId === "all" ? null : selectedProjectId,
      discipline: discipline === "all" ? null : discipline,
    },
    { getNextPageParam: (last) => (last.hasMore ? last.nextCursor : undefined) }
  );

  const drawings = (drawingsQuery.data
    ? drawingsQuery.data.pages.flatMap((p) => p.drawings)
    : []) as DrawingItem[];

  // Metric summaries
  const totalDrawings = drawings.length;
  const civilCount = drawings.filter((d) => d.discipline === "civil").length;
  const structuralCount = drawings.filter((d) => d.discipline === "structural").length;
  const architecturalCount = drawings.filter((d) => d.discipline === "architectural").length;

  const columns: ConstructionTableColumn<DrawingItem>[] = useMemo(
    () => [
      {
        key: "number",
        header: "Drawing #",
        width: "140px",
        sortable: true,
        searchable: true,
        render: (val, r) => (
          <div className="flex items-center gap-2">
            <Compass className="h-4 w-4 text-success/80 shrink-0" />
            <div>
              <span className="font-mono font-bold text-success/80 text-xs">{val}</span>
              <span className="ml-1.5 px-1.5 py-0.2 rounded text-[10px] font-mono bg-white/10 text-muted-foreground/80">
                Rev {r.revision || "A"}
              </span>
            </div>
          </div>
        ),
      },
      {
        key: "project",
        header: "Project Site",
        width: "150px",
        sortable: true,
        render: (_val, r) => (
          <div className="text-xs">
            <div className="font-medium text-white truncate max-w-[140px]">
              {r.project?.name || "Site"}
            </div>
            <div className="text-[10px] font-mono text-muted-foreground/80">{r.project?.code}</div>
          </div>
        ),
      },
      {
        key: "title",
        header: "Drawing Title & Specification",
        sortable: true,
        searchable: true,
        render: (val, r) => (
          <div className="text-xs">
            <span className="font-medium text-white">{val}</span>
            {r.fileName && (
              <span className="block text-[10px] text-muted-foreground/80 font-mono truncate max-w-[280px]">
                📁 {r.fileName}
              </span>
            )}
          </div>
        ),
      },
      {
        key: "discipline",
        header: "Discipline",
        width: "120px",
        sortable: true,
        render: (val) => {
          if (!val) return <span className="text-[10px] text-muted-foreground font-mono">—</span>;
          const colorClass = DISCIPLINE_COLORS[val.toLowerCase()] || "bg-white/10 text-muted-foreground/80";
          return (
            <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${colorClass}`}>
              {val}
            </span>
          );
        },
      },
      {
        key: "issuedDate",
        header: "Issued Date",
        width: "100px",
        sortable: true,
        render: (val) => (
          <span className="text-xs font-mono text-muted-foreground/80">
            {val ? format(new Date(val), "dd MMM yyyy") : "—"}
          </span>
        ),
      },
      {
        key: "history",
        header: "Revisions",
        width: "90px",
        align: "center",
        render: (_val, r) => (
          <span className="inline-flex items-center gap-1 text-[11px] font-mono text-muted-foreground/80">
            <GitBranch className="h-3 w-3 text-muted-foreground/80" />
            {r._count?.revisions || 1}
          </span>
        ),
      },
      {
        key: "status",
        header: "Status",
        width: "110px",
        render: (val) => <StatusBadge status={val || "active"} />,
      },
      {
        key: "actions",
        header: "Viewer",
        width: "80px",
        align: "right",
        render: (_val, r) => (
          <Button
            size="sm"
            variant="ghost"
            onClick={(e) => {
              e.stopPropagation();
              setViewerDrawingId(r.id);
            }}
            className="h-6 px-2 text-[11px] font-mono text-success/80 hover:text-success/80 hover:bg-success/10 gap-1"
          >
            <Eye className="h-3 w-3" />
            View
          </Button>
        ),
      },
    ],
    []
  );

  return (
    <div className="space-y-4 pb-8">
      {/* Header Bar */}
      <div className="p-4 rounded-2xl border border-[var(--border)] bg-card shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Compass className="h-5 w-5 text-[var(--primary)]" />
            <h1 className="text-lg font-bold text-foreground tracking-tight">
              Master Blueprints &amp; Drawings Vault
            </h1>
            <span className="text-[10px] font-mono text-[var(--primary)] bg-info/10 px-2 py-0.5 rounded-full border border-[#bae6fd] font-bold">
              सम्पूर्ण आयोजना नक्सा भण्डार
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Centralized blueprint library, discipline categorizations, revision histories, and direct downloads across all projects.
          </p>
        </div>

        {/* Quick KPI summary chips & Action */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-muted/60 border border-[var(--border)] text-xs">
            <span className="text-muted-foreground">Total Drawings:</span>
            <span className="font-bold text-foreground font-mono">{totalDrawings}</span>
          </div>
          {structuralCount > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800">
              <span>Structural:</span>
              <span className="font-bold font-mono">{structuralCount}</span>
            </div>
          )}
          {architecturalCount > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-indigo-50 border border-indigo-200 text-xs text-indigo-800">
              <span>Architectural:</span>
              <span className="font-bold font-mono">{architecturalCount}</span>
            </div>
          )}
          {civilCount > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-success/10 border border-success/30 text-xs text-success">
              <span>Civil:</span>
              <span className="font-bold font-mono">{civilCount}</span>
            </div>
          )}

          <Button
            size="sm"
            onClick={() => setUploadOpen(true)}
            className="amber-cta-btn h-8 px-3.5 text-xs font-bold text-white gap-1.5 rounded-lg shadow-sm"
          >
            <Plus className="h-3.5 w-3.5" />
            + Upload Drawing (नक्सा दर्ता)
          </Button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl border border-[var(--border)] bg-[var(--background)]">
        <div className="flex items-center gap-2 flex-wrap flex-1">
          {/* Project Scoper */}
          <div className="flex items-center gap-1.5">
            <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
            <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
              <SelectTrigger className="h-8 text-xs bg-card border-[var(--border)] text-foreground min-w-[170px] rounded-lg focus:border-[var(--primary)]">
                <SelectValue placeholder="All Projects" />
              </SelectTrigger>
              <SelectContent className="bg-card border-[var(--border)] text-foreground text-xs shadow-xl rounded-xl">
                <SelectItem value="all">🏢 All Projects (सम्पूर्ण आयोजना)</SelectItem>
                {projects.map((p: any) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} ({p.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Discipline Filter */}
          <Select value={discipline} onValueChange={setDiscipline}>
            <SelectTrigger className="h-8 text-xs bg-card border-[var(--border)] text-foreground w-36 rounded-lg focus:border-[var(--primary)]">
              <SelectValue placeholder="Discipline" />
            </SelectTrigger>
            <SelectContent className="bg-card border-[var(--border)] text-foreground text-xs shadow-xl rounded-xl">
              <SelectItem value="all">All Disciplines</SelectItem>
              <SelectItem value="civil">Civil (सिभिल)</SelectItem>
              <SelectItem value="structural">Structural (स्ट्रक्चरल)</SelectItem>
              <SelectItem value="architectural">Architectural (आर्किटेक्चरल)</SelectItem>
              <SelectItem value="electrical">Electrical (विद्युत)</SelectItem>
              <SelectItem value="mechanical">Mechanical (मेकानिकल)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Table */}
      <ConstructionTable<DrawingItem>
        data={drawings}
        loadMore={
          drawingsQuery.hasNextPage
            ? {
                onLoadMore: () => drawingsQuery.fetchNextPage(),
                isLoadingMore: drawingsQuery.isFetchingNextPage,
              }
            : undefined
        }
        columns={columns}
        isLoading={drawingsQuery.isLoading}
        searchPlaceholder="Search drawing #, title, project, file..."
        exportExcel={{
          filename: `Company_Drawings_Vault_${format(new Date(), "yyyy-MM-dd")}`,
          sheetName: "Drawings",
        }}
        emptyState={{
          icon: FileImage,
          title: "No Drawings in Vault",
          description: "Upload CAD blueprints, architectural drawings, and revisions across your projects.",
        }}
        onRowClick={(row) => setViewerDrawingId(row.id)}
      />

      {/* Upload Drawing Dialog */}
      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        {uploadOpen && (
          <UploadDrawingDialog
            projectId={selectedProjectId === "all" ? undefined : selectedProjectId}
            onDone={() => setUploadOpen(false)}
          />
        )}
      </Dialog>

      {/* Drawing Viewer Dialog */}
      {viewerDrawingId && (
        <DrawingViewer
          drawingId={viewerDrawingId}
          onClose={() => setViewerDrawingId(null)}
        />
      )}
    </div>
  );
}
