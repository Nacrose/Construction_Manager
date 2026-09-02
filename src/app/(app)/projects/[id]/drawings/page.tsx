"use client";

import { trpc } from "@/lib/trpc-client";
import { use, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Plus, Search, Inbox, FileImage, GitBranch, FileQuestion, MoreVertical, Pencil, Trash2, FolderPlus, FolderOpen,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { ModuleTabs } from "@/components/module-tabs";
import { DISCIPLINE_COLORS, APPROVAL_CONFIG } from "./components/constants";
import { DrawingViewer } from "./components/drawing-viewer";
import { UploadDrawingDialog } from "./dialogs/upload-drawing-dialog";
import { EditDrawingDialog } from "./dialogs/edit-drawing-dialog";
import { CreateSetDialog } from "./dialogs/create-set-dialog";
import { toast } from "sonner";

const DOCS_TABS = [
  { label: "Drawings", href: "/drawings" },
  { label: "Photo Progress", href: "/drawings/progress" },
  { label: "Submittals", href: "/submittals" },
  { label: "Doc Center", href: "/document-center" },
];

export default function DrawingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const utils = trpc.useUtils();

  const [search, setSearch] = useState("");
  const [discipline, setDiscipline] = useState("all");
  const [setId, setSetId] = useState("all");
  const [addOpen, setAddOpen] = useState(false);
  const [createSetOpen, setCreateSetOpen] = useState(false);
  const [viewerDrawingId, setViewerDrawingId] = useState<string | null>(null);
  const [editDrawing, setEditDrawing] = useState<{ id: string; title: string; discipline: string | null; status: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; number: string } | null>(null);
  const [assignToSet, setAssignToSet] = useState<{ drawingId: string; currentSetId: string | null } | null>(null);

  const deleteMut = trpc.document.deleteDrawing.useMutation({
    onSuccess: () => { toast.success("Drawing deleted"); utils.document.listDrawings.invalidate({ projectId: id }); },
    onError: (e) => toast.error(e.message),
  });
  const assignToSetMut = trpc.document.assignToSet.useMutation({
    onSuccess: () => { toast.success("Drawing set updated"); setAssignToSet(null); utils.document.listDrawings.invalidate({ projectId: id }); utils.document.listSets.invalidate({ projectId: id }); },
    onError: (e) => toast.error(e.message),
  });

  const drawingsQuery = trpc.document.listDrawings.useInfiniteQuery(
    {
      projectId: id,
      discipline: discipline === "all" ? null : discipline,
      q: search || null,
      setId: setId === "all" ? null : setId,
    },
    { getNextPageParam: (last) => (last.hasMore ? last.nextCursor : undefined) }
  );
  const { data: ganttData } = trpc.gantt.list.useQuery({ projectId: id });
  const { data: setsData } = trpc.document.listSets.useQuery({ projectId: id, limit: 500 });
  const drawings = drawingsQuery.data ? drawingsQuery.data.pages.flatMap((p) => p.drawings) : [];
  const sets = setsData?.sets ?? [];

  return (
    <>
      <ModuleTabs projectId={id} tabs={DOCS_TABS} />
      <div className="space-y-4 pb-8">
        {/* Single-Row Action & Filter Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-2xl border border-[#c7d8e8] bg-white">
          <div className="flex items-center gap-2 flex-1 flex-wrap">
            <div className="relative flex-1 min-w-[180px] max-w-xs">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input placeholder="Search drawing number or title..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-9 text-xs bg-[#f8fbfe] border-[#c7d8e8] text-slate-900 rounded-xl" />
            </div>
            <Select value={discipline} onValueChange={setDiscipline}>
              <SelectTrigger className="h-9 w-36 text-xs bg-[#f8fbfe] border-[#c7d8e8] text-slate-900 rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-white border-[#c7d8e8] text-slate-900 text-xs">
                <SelectItem value="all">All disciplines</SelectItem>
                <SelectItem value="civil">Civil</SelectItem>
                <SelectItem value="structural">Structural</SelectItem>
                <SelectItem value="electrical">Electrical</SelectItem>
                <SelectItem value="mechanical">Mechanical</SelectItem>
                <SelectItem value="architectural">Architectural</SelectItem>
              </SelectContent>
            </Select>
            <Select value={setId} onValueChange={setSetId}>
              <SelectTrigger className="h-9 w-40 text-xs bg-[#f8fbfe] border-[#c7d8e8] text-slate-900 rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-white border-[#c7d8e8] text-slate-900 text-xs">
                <SelectItem value="all">All sets</SelectItem>
                {sets.map((s) => <SelectItem key={s.id} value={s.id}>{s.name} ({s._count.drawings})</SelectItem>)}
                <SelectItem value="none">Unassigned</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" className="h-9 px-3 text-xs bg-[#f8fbfe] border-[#c7d8e8] text-slate-700 hover:text-slate-900 rounded-xl" onClick={() => setCreateSetOpen(true)}>
              <FolderPlus className="h-3.5 w-3.5 mr-1" /> New Set
            </Button>
          </div>

          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="h-9 px-4 text-xs font-bold amber-cta-btn rounded-xl shadow-[0_0_20px_rgba(0,255,102,0.3)] transition gap-1.5 shrink-0 font-sans">
                <Plus className="h-3.5 w-3.5" /> + Upload Drawing
              </Button>
            </DialogTrigger>
            <UploadDrawingDialog projectId={id} ganttTasks={ganttData?.tasks ?? []} onDone={() => { setAddOpen(false); utils.document.listDrawings.invalidate({ projectId: id }); }} />
          </Dialog>
        </div>

      {/* Drawings grid */}
      {drawingsQuery.isLoading ? (
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
                  <div className="flex items-start justify-between">
                    <div className="aspect-video rounded-md bg-muted/50 flex items-center justify-center overflow-hidden flex-1">
                      {d.fileType?.startsWith("image/") ? (
                        <img src={`/api/drawings/${d.id}/file`} alt={d.title} className="h-full w-full object-contain" loading="lazy" />
                      ) : <FileImage className="h-8 w-8 text-muted-foreground/40" />}
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 shrink-0 ml-1">
                          <MoreVertical className="h-3.5 w-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setEditDrawing({ id: d.id, title: d.title, discipline: d.discipline, status: d.status }); }}>
                          <Pencil className="h-3.5 w-3.5 mr-2" /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setAssignToSet({ drawingId: d.id, currentSetId: d.drawingSetId }); }}>
                          <FolderOpen className="h-3.5 w-3.5 mr-2" /> {d.drawingSetId ? "Change Set" : "Assign to Set"}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setDeleteTarget({ id: d.id, number: d.number }); }} className="text-destructive">
                          <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-sm font-semibold">{d.number}</span>
                      <Badge variant="outline" className="text-[9px]">Rev {d.revision}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-1">{d.title}</p>
                    <div className="flex items-center gap-1 flex-wrap">
                      {d.drawingSet && <span className="rounded px-1.5 py-0.5 text-[9px] font-medium bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-400">{d.drawingSet.name}</span>}
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
          {drawingsQuery.hasNextPage && (
            <div className="sm:col-span-2 lg:col-span-3 flex justify-center py-1">
              <Button variant="outline" size="sm" className="h-9 text-xs rounded-xl" onClick={() => drawingsQuery.fetchNextPage()} disabled={drawingsQuery.isFetchingNextPage}>
                {drawingsQuery.isFetchingNextPage ? "Loading…" : "Load more drawings"}
              </Button>
            </div>
          )}
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

      {/* Edit Drawing Dialog */}
      {editDrawing && (
        <EditDrawingDialog
          drawing={editDrawing}
          projectId={id}
          onClose={() => setEditDrawing(null)}
          onDone={() => { setEditDrawing(null); utils.document.listDrawings.invalidate({ projectId: id }); }}
        />
      )}

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Drawing</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{deleteTarget?.number}</strong>? This will also delete all revisions and markups. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (deleteTarget) deleteMut.mutate({ itemId: deleteTarget.id }); setDeleteTarget(null); }} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Create Set Dialog */}
      {createSetOpen && (
        <CreateSetDialog
          projectId={id}
          onClose={() => setCreateSetOpen(false)}
          onDone={() => { setCreateSetOpen(false); utils.document.listSets.invalidate({ projectId: id }); }}
        />
      )}

      {/* Assign to Set Dialog */}
      <Dialog open={!!assignToSet} onOpenChange={(o) => { if (!o) setAssignToSet(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><FolderOpen className="h-4 w-4" /> Assign to Set</DialogTitle></DialogHeader>
          <div className="space-y-2 py-2">
            {sets.map((s) => (
              <button
                key={s.id}
                onClick={() => assignToSetMut.mutate({ drawingId: assignToSet!.drawingId, setId: s.id })}
                className={cn(
                  "w-full text-left rounded border p-2.5 text-sm transition-colors",
                  assignToSet?.currentSetId === s.id ? "border-primary bg-primary/10" : "hover:bg-muted/40"
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">{s.name}</span>
                  <span className="text-xs text-muted-foreground">{s._count.drawings} drawings</span>
                </div>
              </button>
            ))}
            <button
              onClick={() => assignToSetMut.mutate({ drawingId: assignToSet!.drawingId, setId: null })}
              className="w-full text-left rounded border p-2.5 text-sm text-muted-foreground hover:bg-muted/40 transition-colors"
            >
              Remove from set
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
    </>
  );
}


