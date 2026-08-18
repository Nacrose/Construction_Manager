"use client";

import { useState, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc-client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent,
} from "@/components/ui/dialog";
import {
  ZoomIn, ZoomOut, Maximize2, FileImage, GitBranch, CheckCircle2, FileQuestion,
  MapPin, Columns2, Trash2, Crosshair, Pencil, List,
} from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { APPROVAL_CONFIG } from "./constants";
import { AddRevisionDialog } from "../dialogs/add-revision-dialog";
import { ApproveDrawingDialog } from "../dialogs/approve-drawing-dialog";
import { CreateRfiFromDrawingDialog } from "../dialogs/create-rfi-from-drawing-dialog";
import { EditDrawingDialog } from "../dialogs/edit-drawing-dialog";
import { DrawingComparatorPane } from "@/components/drawings/drawing-comparator-pane";
import { MarkupToolbar, type MarkupTool } from "@/components/drawings/markup-toolbar";
import { MarkupOverlay } from "@/components/drawings/markup-overlay";
import { MarkupListPanel } from "@/components/drawings/markup-list-panel";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

interface DrawingPin {
  id: string;
  xPct: number;
  yPct: number;
  note: string;
}

export function DrawingViewer({ drawingId, projectId, onClose, onChanged }: {
  drawingId: string; projectId: string; onClose: () => void; onChanged: () => void;
}) {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.document.getDrawing.useQuery({ drawingId });
  const drawing = data?.drawing;

  const deleteMut = trpc.document.deleteDrawing.useMutation({
    onSuccess: () => { toast.success("Drawing deleted"); onClose(); onChanged(); },
    onError: (e) => toast.error(e.message),
  });

  const [selectedRevId, setSelectedRevId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [showRevDialog, setShowRevDialog] = useState(false);
  const [showApproveDialog, setShowApproveDialog] = useState(false);
  const [showRfiDialog, setShowRfiDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // New interactive tools: Pinning, Markup, and Split Comparator
  const [pinningMode, setPinningMode] = useState(false);
  const [splitComparator, setSplitComparator] = useState(false);
  const [pins, setPins] = useState<DrawingPin[]>([]);
  const [lastPin, setLastPin] = useState<{ x: number; y: number } | null>(null);
  const [activeMarkupTool, setActiveMarkupTool] = useState<MarkupTool>("select");
  const [activeMarkupColor, setActiveMarkupColor] = useState("#ef4444");
  const [selectedMarkupId, setSelectedMarkupId] = useState<string | null>(null);
  const [showMarkupList, setShowMarkupList] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const imageContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (drawing && !selectedRevId) {
      setSelectedRevId(drawing.id);
    }
  }, [drawing?.id]);

  const { data: revFileData } = trpc.document.getRevisionFile.useQuery(
    { revisionId: selectedRevId ?? "" },
    { enabled: !!selectedRevId && selectedRevId !== drawing?.id }
  );

  const currentFile = selectedRevId === drawing?.id
    ? { fileData: drawing?.fileData, fileType: drawing?.fileType, fileName: drawing?.fileName }
    : revFileData;

  const handleImageClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!pinningMode || activeMarkupTool !== "select") return;
    const rect = e.currentTarget.getBoundingClientRect();
    const xPct = ((e.clientX - rect.left) / rect.width) * 100;
    const yPct = ((e.clientY - rect.top) / rect.height) * 100;

    const note = prompt("Enter observation or issue note for this coordinate pin:");
    if (!note) return;

    const newPin: DrawingPin = {
      id: String(Date.now()),
      xPct,
      yPct,
      note,
    };

    setPins((prev) => [...prev, newPin]);
    setLastPin({ x: xPct / 100, y: yPct / 100 });
    toast.success("Coordinate pin added to drawing sheet");
    setPinningMode(false);
  };

  return (
    <Dialog open={true} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className={cn("max-h-[95vh] p-0 overflow-hidden transition-all", splitComparator ? "sm:max-w-7xl" : "sm:max-w-6xl")}>
        <div className="flex h-[90vh]">
          {/* Left Metadata Sidebar */}
          <div className="w-60 shrink-0 border-r border-border overflow-y-auto p-3 space-y-3 bg-card/60">
            <div>
              <h3 className="text-sm font-semibold font-mono text-primary">{drawing?.number ?? "Loading..."}</h3>
              <p className="text-xs text-muted-foreground">{drawing?.title}</p>
            </div>

            <div>
              <Label className="text-[10px] font-semibold uppercase text-muted-foreground mb-1.5 block">Revisions</Label>
              <div className="space-y-1">
                <button
                  onClick={() => setSelectedRevId(drawing?.id ?? null)}
                  className={cn("w-full text-left rounded border p-1.5 text-xs transition-colors",
                    selectedRevId === drawing?.id ? "border-primary bg-primary/10 text-primary font-bold" : "hover:bg-muted/40")}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-medium">Rev {drawing?.revision}</span>
                    <span className="text-[8px] text-emerald-400 font-bold">CURRENT</span>
                  </div>
                  <p className="text-[9px] text-muted-foreground">{drawing?.issuedDate ? format(new Date(drawing.issuedDate), "dd MMM yyyy") : "—"}</p>
                </button>
                {drawing?.revisions.filter(r => r.id !== drawing.id).map(rev => (
                  <button
                    key={rev.id}
                    onClick={() => setSelectedRevId(rev.id)}
                    className={cn("w-full text-left rounded border p-1.5 text-xs transition-colors",
                      selectedRevId === rev.id ? "border-primary bg-primary/10" : "hover:bg-muted/40")}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-medium">Rev {rev.revision}</span>
                      {rev.approvalStatus !== "pending" && <span className="text-[8px] text-blue-400">{APPROVAL_CONFIG[rev.approvalStatus]?.label ?? rev.approvalStatus}</span>}
                    </div>
                    <p className="text-[9px] text-muted-foreground">{format(new Date(rev.issuedDate), "dd MMM yyyy")} · {rev.issuedBy}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Pins List */}
            {pins.length > 0 && (
              <div>
                <Label className="text-[10px] font-semibold uppercase text-muted-foreground mb-1.5 block">
                  Sheet Pins ({pins.length})
                </Label>
                <div className="space-y-1">
                  {pins.map((pin, i) => (
                    <div key={pin.id} className="flex items-center justify-between p-1.5 rounded border border-border/60 bg-muted/30 text-[10px] font-mono">
                      <div className="truncate">
                        <span className="font-bold text-primary mr-1">#{i + 1}</span>
                        <span>{pin.note}</span>
                      </div>
                      <button
                        onClick={() => setPins(pins.filter(p => p.id !== pin.id))}
                        className="text-destructive hover:text-red-400 p-0.5 ml-1"
                        title="Remove pin"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-1 pt-2 border-t border-border/60">
              <Button size="sm" variant="outline" className="w-full h-7 text-xs gap-1" onClick={() => setShowRevDialog(true)}>
                <GitBranch className="h-3 w-3" /> New Revision
              </Button>
              <Button size="sm" variant="outline" className="w-full h-7 text-xs gap-1" onClick={() => setShowApproveDialog(true)}>
                <CheckCircle2 className="h-3 w-3" /> Approve / Reject
              </Button>
              <Button size="sm" variant="outline" className="w-full h-7 text-xs gap-1" onClick={() => setShowRfiDialog(true)}>
                <FileQuestion className="h-3 w-3" /> Create RFI
              </Button>
              <Button size="sm" variant="outline" className="w-full h-7 text-xs gap-1" onClick={() => setShowEditDialog(true)}>
                <Pencil className="h-3 w-3" /> Edit Drawing
              </Button>
              <Button size="sm" variant="outline" className="w-full h-7 text-xs gap-1 text-destructive hover:text-destructive" onClick={() => setShowDeleteConfirm(true)}>
                <Trash2 className="h-3 w-3" /> Delete
              </Button>
            </div>
          </div>

          {/* Center Drawing Canvas */}
          <div className="flex-1 flex flex-col min-w-0">
            <div className="shrink-0 border-b border-border px-3 py-1.5 flex items-center justify-between bg-muted/60 font-mono text-xs">
              <div className="flex items-center gap-1">
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setZoom(z => Math.max(0.25, z - 0.25))} title="Zoom out">
                  <ZoomOut className="h-4 w-4" />
                </Button>
                <span className="text-xs font-mono w-12 text-center text-primary">{Math.round(zoom * 100)}%</span>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setZoom(z => Math.min(4, z + 0.25))} title="Zoom in">
                  <ZoomIn className="h-4 w-4" />
                </Button>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setZoom(1)} title="Reset zoom">
                  <Maximize2 className="h-4 w-4" />
                </Button>

                {/* Caliper Pinning Toggle */}
                <Button
                  size="sm"
                  variant={pinningMode ? "default" : "outline"}
                  className="h-7 text-xs gap-1 ml-2 font-mono"
                  onClick={() => setPinningMode(!pinningMode)}
                  title="Drop a coordinate observation pin onto the sheet"
                >
                  <Crosshair className="h-3.5 w-3.5" />
                  {pinningMode ? "Click on Drawing..." : "Pin Observation"}
                </Button>

                {/* Split Comparator Toggle */}
                <Button
                  size="sm"
                  variant={splitComparator ? "default" : "outline"}
                  className="h-7 text-xs gap-1 ml-1 font-mono"
                  onClick={() => setSplitComparator(!splitComparator)}
                  title="Split screen to compare drawing with BOQ / RFIs"
                >
                  <Columns2 className="h-3.5 w-3.5" />
                  Split Comparator
                </Button>
              </div>

              {/* Markup Toolbar */}
              <MarkupToolbar
                activeTool={activeMarkupTool}
                onToolChange={(t) => { setActiveMarkupTool(t); setPinningMode(false); }}
                activeColor={activeMarkupColor}
                onColorChange={setActiveMarkupColor}
                onDeleteSelected={() => { (globalThis as any).__markupDelete?.(); setSelectedMarkupId(null); }}
                selectedMarkupId={selectedMarkupId}
                onUndo={() => (globalThis as any).__markupUndo?.()}
                onRedo={() => (globalThis as any).__markupRedo?.()}
                canUndo={canUndo}
                canRedo={canRedo}
              />

              <Button
                size="sm"
                variant={showMarkupList ? "default" : "outline"}
                className="h-7 text-xs gap-1 font-mono"
                onClick={() => setShowMarkupList(!showMarkupList)}
                title="Toggle markup list panel"
              >
                <List className="h-3.5 w-3.5" />
              </Button>

              <span className="text-xs text-muted-foreground truncate ml-2">
                {currentFile?.fileName ?? "No file"}
              </span>
            </div>

            <div className="flex-1 overflow-auto bg-background/50 flex items-center justify-center p-4 relative select-none">
              {isLoading ? (
                <Skeleton className="h-96 w-96" />
              ) : currentFile?.fileData ? (
                currentFile.fileType?.startsWith("image/") ? (
                  <div
                    ref={imageContainerRef}
                    onClick={handleImageClick}
                    style={{ transform: `scale(${zoom})`, transition: "transform 0.2s" }}
                    className={cn(
                      "relative inline-block max-w-full max-h-full shadow-2xl rounded border border-border/80",
                      pinningMode && "cursor-crosshair"
                    )}
                  >
                    <img
                      src={`data:${currentFile.fileType};base64,${currentFile.fileData}`}
                      alt={currentFile.fileName ?? "drawing"}
                      className="max-w-full max-h-full object-contain pointer-events-none"
                    />

                    {/* Markup Overlay — always visible for existing markups, interactive when tool is active */}
                    <MarkupOverlay
                      drawingId={drawingId}
                      revisionId={selectedRevId !== drawing?.id ? selectedRevId ?? undefined : undefined}
                      activeTool={activeMarkupTool}
                      activeColor={activeMarkupColor}
                      onMarkupCreated={() => {}}
                      onMarkupDeleted={() => {}}
                      onSelectionChange={setSelectedMarkupId}
                      onHistoryChange={(u, r) => { setCanUndo(u); setCanRedo(r); }}
                      scaleValue={drawing?.scaleValue}
                      scaleUnit={drawing?.scaleUnit}
                    />

                    {/* Coordinate Pins Overlay */}
                    {pins.map((pin, i) => (
                      <div
                        key={pin.id}
                        style={{ left: `${pin.xPct}%`, top: `${pin.yPct}%` }}
                        className="absolute -translate-x-1/2 -translate-y-1/2 group cursor-pointer"
                        title={pin.note}
                      >
                        <div className="relative flex items-center justify-center">
                          <span className="h-4 w-4 rounded-full bg-primary/40 animate-ping absolute" />
                          <span className="h-3 w-3 rounded-full bg-primary border-2 border-background shadow-[0_0_8px_#00ff66] flex items-center justify-center text-[8px] font-bold text-background">
                            {i + 1}
                          </span>
                        </div>
                        <div className="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-card/95 border border-primary/50 text-[10px] font-mono text-foreground whitespace-nowrap rounded shadow-lg z-30">
                          {pin.note}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : currentFile.fileType?.startsWith("application/pdf") ? (
                  <iframe
                    src={`data:${currentFile.fileType};base64,${currentFile.fileData}`}
                    className="w-full h-full border-0 rounded"
                    style={{ transform: `scale(${zoom})`, transformOrigin: "top left" }}
                    title="PDF viewer"
                  />
                ) : (
                  <div className="text-center text-sm text-muted-foreground">
                    <FileImage className="h-12 w-12 mx-auto mb-2 opacity-30" />
                    <p>File type not previewable: {currentFile.fileType}</p>
                  </div>
                )
              ) : (
                <div className="text-center text-sm text-muted-foreground">
                  <FileImage className="h-12 w-12 mx-auto mb-2 opacity-30" />
                  <p>No file attached for this revision.</p>
                </div>
              )}
            </div>
          </div>

          {/* Right Side-by-Side Comparator Pane */}
          {splitComparator && (
            <div className="w-80 shrink-0 h-full">
              <DrawingComparatorPane projectId={projectId} />
            </div>
          )}

          {/* Right Markup List Panel */}
          {showMarkupList && (
            <MarkupListPanel
              drawingId={drawingId}
              revisionId={selectedRevId !== drawing?.id ? selectedRevId ?? undefined : undefined}
              selectedMarkupId={selectedMarkupId}
              onSelectMarkup={setSelectedMarkupId}
              onDeleteMarkup={(id) => (globalThis as any).__markupDelete?.()}
              onClose={() => setShowMarkupList(false)}
            />
          )}
        </div>
      </DialogContent>

      {showRevDialog && drawing && (
        <AddRevisionDialog
          drawingId={drawing.id}
          drawingNumber={drawing.number}
          currentRevision={drawing.revision}
          projectId={projectId}
          onClose={() => setShowRevDialog(false)}
          onDone={() => { setShowRevDialog(false); utils.document.getDrawing.invalidate({ drawingId }); onChanged(); }}
        />
      )}

      {showApproveDialog && drawing && (
        <ApproveDrawingDialog
          drawingId={drawing.id}
          drawingNumber={drawing.number}
          projectId={projectId}
          onClose={() => setShowApproveDialog(false)}
          onDone={() => { setShowApproveDialog(false); utils.document.getDrawing.invalidate({ drawingId }); onChanged(); }}
        />
      )}

      {showRfiDialog && drawing && (
        <CreateRfiFromDrawingDialog
          drawingId={drawing.id}
          drawingNumber={drawing.number}
          projectId={projectId}
          pinX={lastPin?.x}
          pinY={lastPin?.y}
          onClose={() => setShowRfiDialog(false)}
          onDone={() => { setShowRfiDialog(false); utils.document.getDrawing.invalidate({ drawingId }); onChanged(); }}
        />
      )}

      {showEditDialog && drawing && (
        <EditDrawingDialog
          drawing={{ id: drawing.id, title: drawing.title, discipline: drawing.discipline, status: drawing.status, scaleValue: drawing.scaleValue, scaleUnit: drawing.scaleUnit }}
          projectId={projectId}
          onClose={() => setShowEditDialog(false)}
          onDone={() => { setShowEditDialog(false); utils.document.getDrawing.invalidate({ drawingId }); onChanged(); }}
        />
      )}

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Drawing</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{drawing?.number}</strong>? This will also delete all revisions and markups. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteMut.mutate({ itemId: drawingId })} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
