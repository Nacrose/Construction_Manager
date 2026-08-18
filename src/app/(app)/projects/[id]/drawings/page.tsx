"use client";

import { trpc } from "@/lib/trpc-client";
import { use, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogTrigger } from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Plus, Search, Inbox, FileImage, GitBranch, FileQuestion,
} from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { ModuleTabs } from "@/components/module-tabs";
import { DISCIPLINE_COLORS, APPROVAL_CONFIG } from "./components/constants";
import { DrawingViewer } from "./components/drawing-viewer";
import { UploadDrawingDialog } from "./dialogs/upload-drawing-dialog";

const DOCS_TABS = [
  { label: "Drawings", href: "/drawings" },
  { label: "Submittals", href: "/submittals" },
  { label: "Doc Center", href: "/document-center" },
];

export default function DrawingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const utils = trpc.useUtils();

  const [search, setSearch] = useState("");
  const [discipline, setDiscipline] = useState("all");
  const [addOpen, setAddOpen] = useState(false);
  const [viewerDrawingId, setViewerDrawingId] = useState<string | null>(null);

  const { data, isLoading } = trpc.document.listDrawings.useQuery({
    projectId: id,
    discipline: discipline === "all" ? null : discipline,
    q: search || null,
  });
  const { data: ganttData } = trpc.gantt.list.useQuery({ projectId: id });
  const drawings = data?.drawings ?? [];

  return (
    <>
      <ModuleTabs projectId={id} tabs={DOCS_TABS} />
      <div className="space-y-6 pb-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Link href={`/projects/${id}`} className="hover:text-foreground">Project</Link>
            <span>/</span><span>Drawings</span>
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Drawings</h1>
          <p className="text-sm text-muted-foreground">Upload, view, revise, approve, and raise RFIs from drawings.</p>
        </div>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" /> Upload Drawing</Button></DialogTrigger>
          <UploadDrawingDialog projectId={id} ganttTasks={ganttData?.tasks ?? []} onDone={() => { setAddOpen(false); utils.document.listDrawings.invalidate({ projectId: id }); }} />
        </Dialog>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search by number or title..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-9" />
        </div>
        <Select value={discipline} onValueChange={setDiscipline}>
          <SelectTrigger className="h-9 w-40 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All disciplines</SelectItem>
            <SelectItem value="civil">Civil</SelectItem>
            <SelectItem value="structural">Structural</SelectItem>
            <SelectItem value="electrical">Electrical</SelectItem>
            <SelectItem value="mechanical">Mechanical</SelectItem>
            <SelectItem value="architectural">Architectural</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Drawings grid */}
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-48" />)}</div>
      ) : drawings.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <Inbox className="h-12 w-12 text-muted-foreground/40 mb-3" />
          <p className="text-sm font-medium text-muted-foreground">No drawings uploaded yet</p>
          <p className="text-xs text-muted-foreground/70 mt-1">Click "Upload Drawing" to get started.</p>
        </CardContent></Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {drawings.map((d) => {
            const approval = APPROVAL_CONFIG[d.approvalStatus] ?? APPROVAL_CONFIG.pending;
            return (
              <Card key={d.id} className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => setViewerDrawingId(d.id)}>
                <CardContent className="p-4 space-y-3">
                  <div className="aspect-video rounded-md bg-muted/50 flex items-center justify-center overflow-hidden">
                    {d.fileType?.startsWith("image/") ? (
                      <img src={`/api/drawings/${d.id}/file`} alt={d.title} className="h-full w-full object-contain" loading="lazy" />
                    ) : <FileImage className="h-8 w-8 text-muted-foreground/40" />}
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-sm font-semibold">{d.number}</span>
                      <Badge variant="outline" className="text-[9px]">Rev {d.revision}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-1">{d.title}</p>
                    <div className="flex items-center gap-1 flex-wrap">
                      {d.discipline && <span className={cn("rounded px-1.5 py-0.5 text-[9px] font-medium capitalize", DISCIPLINE_COLORS[d.discipline])}>{d.discipline}</span>}
                      <span className={cn("rounded px-1.5 py-0.5 text-[9px] font-medium", approval.bg, approval.color)}>{approval.label}</span>
                      {d._count.revisions > 0 && <span className="inline-flex items-center gap-0.5 rounded bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-[9px]"><GitBranch className="h-2.5 w-2.5" /> {d._count.revisions} rev</span>}
                      {d._count.rfis > 0 && <span className="inline-flex items-center gap-0.5 rounded bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-400 px-1.5 py-0.5 text-[9px]"><FileQuestion className="h-2.5 w-2.5" /> {d._count.rfis}</span>}
                    </div>
                    {d.ganttTask && <p className="text-[10px] text-muted-foreground">📋 <span className="font-mono">{d.ganttTask.code}</span> {d.ganttTask.name}</p>}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Drawing Viewer */}
      {viewerDrawingId && (
        <DrawingViewer
          drawingId={viewerDrawingId}
          projectId={id}
          onClose={() => setViewerDrawingId(null)}
          onChanged={() => utils.document.listDrawings.invalidate({ projectId: id })}
        />
      )}
    </div>
    </>
  );
}


