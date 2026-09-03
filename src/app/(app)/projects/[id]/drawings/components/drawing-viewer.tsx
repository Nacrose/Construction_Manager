"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { trpc } from "@/lib/trpc-client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent,
} from "@/components/ui/dialog";
import {
  ZoomIn, ZoomOut, Maximize2, FileImage, GitBranch, CheckCircle2, FileQuestion,
  MapPin, Columns2, Trash2, Crosshair, Pencil, List, Sparkles, SplitSquareVertical,
  History, Clock, UserCheck, Eye, Layers, Upload,
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
import { DrawingDiffOverlay, type DiffMode } from "@/components/drawings/drawing-diff-overlay";
import { MarkupToolbar, type MarkupTool } from "@/components/drawings/markup-toolbar";
import { MarkupOverlay } from "@/components/drawings/markup-overlay";
import { MarkupListPanel } from "@/components/drawings/markup-list-panel";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
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

export function DrawingViewer({
  drawingId,
  projectId,
  onClose,
  onChanged,
}: {
  drawingId: string;
  projectId?: string;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.document.getDrawing.useQuery({ drawingId });
  const drawing = data?.drawing;
  const activeProjectId = projectId || drawing?.projectId || "";

  const deleteMut = trpc.document.deleteDrawing.useMutation({
    onSuccess: () => {
      toast.success("Drawing deleted");
      onClose();
      onChanged?.();
    },
    onError: (e) => toast.error(e.message),
  });

  const [selectedRevId, setSelectedRevId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [showRevDialog, setShowRevDialog] = useState(false);
  const [showApproveDialog, setShowApproveDialog] = useState(false);
  const [showRfiDialog, setShowRfiDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Bluebeam Diff Engine state
  const [isDiffActive, setIsDiffActive] = useState(false);
  const [diffMode, setDiffMode] = useState<DiffMode>("overlay");
  const [baseRevId, setBaseRevId] = useState<string>("");
  const [compareRevId, setCompareRevId] = useState<string>("");

  // Interactive tools: Pinning, Markup, and Split Comparator
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

  // All revisions list (including master current row)
  const allRevisionsList = useMemo(() => {
    if (!drawing) return [];
    const pastRevs = drawing.revisions ?? [];
    return [
      {
        id: drawing.id,
        revision: drawing.revision,
        issuedDate: drawing.issuedDate || drawing.createdAt,
        issuedBy: "Current IFC Sheet",
        description: "Master Current Sheet (Issued for Construction)",
        approvalStatus: drawing.approvalStatus,
        fileName: drawing.fileName,
        fileType: drawing.fileType,
        isCurrent: true,
      },
      ...pastRevs.map((r) => ({
        ...r,
        isCurrent: false,
      })),
    ];
  }, [drawing]);

  // Initialize base and compare revisions for diff engine
  useEffect(() => {
    if (drawing && allRevisionsList.length >= 2 && !baseRevId) {
      setCompareRevId(drawing.id);
      const olderRev = allRevisionsList.find((r) => r.id !== drawing.id);
      if (olderRev) {
        setBaseRevId(olderRev.id);
      }
    }
  }, [drawing, allRevisionsList, baseRevId]);

  // Fetch currently selected single file
  const { data: revFileData } = trpc.document.getRevisionFile.useQuery(
    { revisionId: selectedRevId ?? "" },
    { enabled: !!selectedRevId && selectedRevId !== drawing?.id }
  );

  const currentFile = selectedRevId === drawing?.id
    ? { fileData: drawing?.fileData, fileType: drawing?.fileType, fileName: drawing?.fileName }
    : revFileData;

  // Fetch Diff files
  const { data: baseRevFileData } = trpc.document.getRevisionFile.useQuery(
    { revisionId: baseRevId },
    { enabled: isDiffActive && !!baseRevId && baseRevId !== drawing?.id }
  );
  const baseFile = baseRevId === drawing?.id
    ? { fileData: drawing?.fileData, fileType: drawing?.fileType, fileName: drawing?.fileName }
    : baseRevFileData;

  const { data: compareRevFileData } = trpc.document.getRevisionFile.useQuery(
    { revisionId: compareRevId },
    { enabled: isDiffActive && !!compareRevId && compareRevId !== drawing?.id }
  );
  const compareFile = compareRevId === drawing?.id
    ? { fileData: drawing?.fileData, fileType: drawing?.fileType, fileName: drawing?.fileName }
    : compareRevFileData;

  const baseRevisionTag = allRevisionsList.find((r) => r.id === baseRevId)?.revision || "A";
  const compareRevisionTag = allRevisionsList.find((r) => r.id === compareRevId)?.revision || "B";

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

  const startDiffWithRevision = (targetRevId: string) => {
    setBaseRevId(targetRevId);
    setCompareRevId(drawing?.id ?? "");
    setIsDiffActive(true);
    toast.info(`Diffing Rev ${allRevisionsList.find(r => r.id === targetRevId)?.revision} against Current`);
  };

  return (
    <Dialog open={true} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className={cn("max-h-[95vh] p-0 overflow-hidden transition-all bg-[#0a0d13] border border-[var(--border)] text-foreground rounded-2xl shadow-2xl", splitComparator ? "sm:max-w-7xl" : "sm:max-w-6xl")}>
        <div className="flex h-[90vh]">
          {/* Left Metadata & Revision Changelog Sidebar */}
          <div className="w-72 shrink-0 border-r border-[var(--border)] overflow-y-auto p-3.5 space-y-4 bg-white/95 flex flex-col">
            <div className="space-y-1 pb-3 border-b border-[var(--border)]">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold text-success/80 bg-success/10 px-2 py-0.5 rounded border border-success/20">
                  {drawing?.number ?? "Loading..."}
                </span>
                <span className="text-[10px] uppercase font-mono text-muted-foreground">
                  {drawing?.discipline || "General"}
                </span>
              </div>
              <h3 className="text-sm font-semibold text-foreground truncate" title={drawing?.title}>
                {drawing?.title}
              </h3>
            </div>

            {/* Revision Audit History */}
            <div className="flex-1 space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <History className="h-3.5 w-3.5 text-[var(--primary)]" />
                  <span>Revision History ({allRevisionsList.length})</span>
                </Label>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setShowRevDialog(true)}
                  className="h-6 text-[10px] font-mono text-[var(--primary)] hover:text-info hover:bg-cyan-500/10 px-1.5"
                >
                  <GitBranch className="h-3 w-3 mr-1" /> + Stack Rev
                </Button>
              </div>

              <div className="space-y-2 max-h-[42vh] overflow-y-auto pr-1">
                {allRevisionsList.map((rev) => {
                  const isSelected = selectedRevId === rev.id;
                  return (
                    <div
                      key={rev.id}
                      className={cn(
                        "rounded-xl border p-2.5 text-xs transition-all space-y-1.5",
                        isSelected
                          ? "border-success/40 bg-success/10 text-foreground shadow-sm"
                          : "border-[var(--border)] bg-[#f8fbfe]/70 text-foreground/80 hover:bg-white/5 hover:border-[var(--primary)]"
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedRevId(rev.id);
                            if (isDiffActive) setIsDiffActive(false);
                          }}
                          className="flex items-center gap-2 font-mono font-bold text-left flex-1"
                        >
                          <span className={cn("text-xs", rev.isCurrent ? "text-success/80" : "text-foreground/80")}>
                            Rev {rev.revision}
                          </span>
                          {rev.isCurrent ? (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-success/20 text-success/80 font-bold border border-success/30">
                              CURRENT · IFC
                            </span>
                          ) : (
                            <span className="text-[9px] px-1 py-0.2 rounded bg-white/10 text-muted-foreground font-mono">
                              SUPERSEDED
                            </span>
                          )}
                        </button>

                        {allRevisionsList.length > 1 && !rev.isCurrent && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => startDiffWithRevision(rev.id)}
                            className="h-5 text-[9px] px-1.5 text-[var(--primary)] hover:text-info hover:bg-cyan-500/10"
                            title="Compare this revision against Current"
                          >
                            <Sparkles className="h-2.5 w-2.5 mr-0.5" /> Diff
                          </Button>
                        )}
                      </div>

                      {rev.description && (
                        <p className="text-[10px] text-muted-foreground line-clamp-2 leading-relaxed italic bg-black/30 p-1.5 rounded-lg border border-[var(--input)]">
                          "{rev.description}"
                        </p>
                      )}

                      <div className="flex items-center justify-between text-[9px] text-muted-foreground pt-0.5">
                        <span className="flex items-center gap-1 font-mono">
                          <Clock className="h-2.5 w-2.5 text-muted-foreground" />
                          {rev.issuedDate ? format(new Date(rev.issuedDate), "dd MMM yyyy") : "—"}
                        </span>
                        {rev.approvalStatus && rev.approvalStatus !== "pending" && (
                          <span className="text-[9px] text-info/80 font-medium">
                            {APPROVAL_CONFIG[rev.approvalStatus]?.label ?? rev.approvalStatus}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Pins List */}
            {pins.length > 0 && (
              <div className="space-y-1.5 pt-2 border-t border-[var(--border)]">
                <Label className="text-[10px] font-semibold uppercase text-muted-foreground flex items-center justify-between">
                  <span>Site Observation Pins ({pins.length})</span>
                </Label>
                <div className="space-y-1 max-h-28 overflow-y-auto">
                  {pins.map((pin, i) => (
                    <div key={pin.id} className="flex items-center justify-between p-1.5 rounded-lg border border-[var(--border)] bg-[#f8fbfe] text-[10px] font-mono text-foreground/80">
                      <div className="truncate flex-1 mr-1">
                        <span className="font-bold text-success/80 mr-1.5">#{i + 1}</span>
                        <span>{pin.note}</span>
                      </div>
                      <button
                        onClick={() => setPins(pins.filter(p => p.id !== pin.id))}
                        className="text-red-400 hover:text-red-300 p-0.5"
                        title="Remove pin"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Quick Actions Footer */}
            <div className="space-y-1.5 pt-3 border-t border-[var(--border)]">
              <Button size="sm" variant="outline" className="w-full h-8 text-xs gap-1.5 border-[var(--border)] bg-[#f8fbfe] text-foreground hover:bg-white/10" onClick={() => setShowRevDialog(true)}>
                <GitBranch className="h-3.5 w-3.5 text-[var(--primary)]" /> Stack New Revision
              </Button>
              <Button size="sm" variant="outline" className="w-full h-8 text-xs gap-1.5 border-[var(--border)] bg-[#f8fbfe] text-foreground hover:bg-white/10" onClick={() => setShowApproveDialog(true)}>
                <CheckCircle2 className="h-3.5 w-3.5 text-success/80" /> Approve / Reject Sheet
              </Button>
              <Button size="sm" variant="outline" className="w-full h-8 text-xs gap-1.5 border-[var(--border)] bg-[#f8fbfe] text-foreground hover:bg-white/10" onClick={() => setShowRfiDialog(true)}>
                <FileQuestion className="h-3.5 w-3.5 text-amber-400" /> Raise Linked RFI
              </Button>
              <Button size="sm" variant="outline" className="w-full h-8 text-xs gap-1.5 border-[var(--border)] bg-[#f8fbfe] text-foreground hover:bg-white/10" onClick={() => setShowEditDialog(true)}>
                <Pencil className="h-3.5 w-3.5 text-info/80" /> Edit Metadata & Scale
              </Button>
              <Button size="sm" variant="outline" className="w-full h-8 text-xs gap-1.5 border-red-500/20 text-red-400 hover:bg-red-500/10 hover:text-red-300" onClick={() => setShowDeleteConfirm(true)}>
                <Trash2 className="h-3.5 w-3.5" /> Delete Sheet
              </Button>
            </div>
          </div>

          {/* Center Drawing Canvas & Diff Area */}
          <div className="flex-1 flex flex-col min-w-0 bg-[#eef5fc]">
            {/* Top Toolbar */}
            <div className="shrink-0 border-b border-[var(--border)] px-3 py-2 flex items-center justify-between bg-white/95 font-mono text-xs z-10 backdrop-blur-md">
              <div className="flex items-center gap-1.5">
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-foreground/80 hover:text-foreground" onClick={() => setZoom(z => Math.max(0.25, z - 0.25))} title="Zoom out">
                  <ZoomOut className="h-4 w-4" />
                </Button>
                <span className="text-xs font-mono w-12 text-center text-success/80 font-bold">{Math.round(zoom * 100)}%</span>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-foreground/80 hover:text-foreground" onClick={() => setZoom(z => Math.min(4, z + 0.25))} title="Zoom in">
                  <ZoomIn className="h-4 w-4" />
                </Button>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-foreground/80 hover:text-foreground" onClick={() => setZoom(1)} title="Reset zoom">
                  <Maximize2 className="h-4 w-4" />
                </Button>

                {/* Bluebeam Visual Diff Toggle Button */}
                {allRevisionsList.length > 1 && (
                  <Button
                    size="sm"
                    variant={isDiffActive ? "default" : "outline"}
                    className={cn(
                      "h-7 text-xs gap-1.5 ml-2 font-mono font-bold transition-all",
                      isDiffActive
                        ? "bg-cyan-500/20 text-info border border-info/40 shadow-[0_0_10px_#22d3ee40]"
                        : "border-[var(--border)] bg-[#f8fbfe] text-foreground/80 hover:text-foreground"
                    )}
                    onClick={() => setIsDiffActive(!isDiffActive)}
                    title="Toggle Bluebeam Red/Green Revision Difference Engine"
                  >
                    <Sparkles className="h-3.5 w-3.5 text-[var(--primary)]" />
                    {isDiffActive ? "Exit Diff Mode" : "Bluebeam Diff Engine"}
                  </Button>
                )}

                {/* Caliper Pinning Toggle */}
                {!isDiffActive && (
                  <Button
                    size="sm"
                    variant={pinningMode ? "default" : "outline"}
                    className={cn(
                      "h-7 text-xs gap-1 ml-1.5 font-mono",
                      pinningMode ? "bg-success/20 text-success/80 border border-success/40" : "border-[var(--border)] bg-[#f8fbfe] text-foreground/80 hover:text-foreground"
                    )}
                    onClick={() => setPinningMode(!pinningMode)}
                    title="Drop a coordinate observation pin onto the sheet"
                  >
                    <Crosshair className="h-3.5 w-3.5" />
                    {pinningMode ? "Click on Drawing..." : "Pin Observation"}
                  </Button>
                )}

                {/* Split Comparator Toggle */}
                <Button
                  size="sm"
                  variant={splitComparator ? "default" : "outline"}
                  className={cn(
                    "h-7 text-xs gap-1 ml-1 font-mono",
                    splitComparator ? "bg-info/20 text-info/80 border border-info/40" : "border-[var(--border)] bg-[#f8fbfe] text-foreground/80 hover:text-foreground"
                  )}
                  onClick={() => setSplitComparator(!splitComparator)}
                  title="Split screen to compare drawing with BOQ Takeoffs / RFIs"
                >
                  <Columns2 className="h-3.5 w-3.5" />
                  BOQ Takeoff Split
                </Button>
              </div>

              {/* Active Revision Selectors in Diff Mode OR Markup Toolbar */}
              {isDiffActive ? (
                <div className="flex items-center gap-2 bg-[#f8fbfe] px-3 py-1 rounded-xl border border-[var(--border)] text-xs">
                  <span className="text-red-400 font-bold">Base (Older):</span>
                  <Select value={baseRevId} onValueChange={setBaseRevId}>
                    <SelectTrigger className="h-7 w-28 text-xs bg-card border-[var(--border)] text-foreground font-mono">
                      <SelectValue placeholder="Base Rev" />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-[var(--border)] text-foreground text-xs">
                      {allRevisionsList.map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          Rev {r.revision} {r.isCurrent ? "(Current)" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <span className="text-[var(--primary)] font-bold ml-2">Compare (New):</span>
                  <Select value={compareRevId} onValueChange={setCompareRevId}>
                    <SelectTrigger className="h-7 w-28 text-xs bg-card border-[var(--border)] text-foreground font-mono">
                      <SelectValue placeholder="Compare Rev" />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-[var(--border)] text-foreground text-xs">
                      {allRevisionsList.map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          Rev {r.revision} {r.isCurrent ? "(Current)" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div className="flex items-center gap-2">
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
                    className={cn(
                      "h-7 text-xs gap-1 font-mono",
                      showMarkupList ? "bg-success/20 text-success/80 border-success/40" : "border-[var(--border)] bg-[#f8fbfe] text-foreground/80"
                    )}
                    onClick={() => setShowMarkupList(!showMarkupList)}
                    title="Toggle markup list panel"
                  >
                    <List className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </div>

            {/* Main Center Area: Diff Engine vs Standard Markup Canvas */}
            <div className="flex-1 overflow-hidden relative flex">
              {isDiffActive ? (
                <DrawingDiffOverlay
                  baseFileData={baseFile?.fileData}
                  baseFileType={baseFile?.fileType}
                  baseRevisionTag={baseRevisionTag}
                  compareFileData={compareFile?.fileData}
                  compareFileType={compareFile?.fileType}
                  compareRevisionTag={compareRevisionTag}
                  zoom={zoom}
                  diffMode={diffMode}
                  onDiffModeChange={setDiffMode}
                />
              ) : (
                <div className="flex-1 overflow-auto bg-[#eef5fc] flex items-center justify-center p-4 relative select-none">
                  {isLoading ? (
                    <Skeleton className="h-96 w-96 rounded-2xl bg-white/5" />
                  ) : currentFile?.fileData ? (
                    currentFile.fileType?.startsWith("image/") ? (
                      <div
                        ref={imageContainerRef}
                        onClick={handleImageClick}
                        style={{ transform: `scale(${zoom})`, transition: "transform 0.15s ease-out" }}
                        className={cn(
                          "relative inline-block max-w-full max-h-full shadow-2xl rounded-xl border border-[var(--primary)] bg-card",
                          pinningMode && "cursor-crosshair"
                        )}
                      >
                        <img
                          src={`data:${currentFile.fileType};base64,${currentFile.fileData}`}
                          alt={currentFile.fileName ?? "drawing"}
                          className="max-w-full max-h-full object-contain pointer-events-none"
                        />

                        {/* Markup Overlay */}
                        <MarkupOverlay
                          drawingId={drawingId}
                          revisionId={selectedRevId !== drawing?.id ? selectedRevId ?? undefined : undefined}
                          activeTool={activeMarkupTool}
                          activeColor={activeMarkupColor}
                          onMarkupCreated={() => {}}
                          onMarkupDeleted={() => {}}
                          onSelectionChange={setSelectedMarkupId}
                          onHistoryChange={(u, r) => { setCanUndo(u); setCanRedo(r); }}
                          scaleValue={drawing?.scaleValue ? Number(drawing.scaleValue) : 100}
                          scaleUnit={drawing?.scaleUnit || "m"}
                        />

                        {/* Coordinate Pins Overlay */}
                        {pins.map((pin, i) => (
                          <div
                            key={pin.id}
                            style={{ left: `${pin.xPct}%`, top: `${pin.yPct}%` }}
                            className="absolute -translate-x-1/2 -translate-y-1/2 group cursor-pointer z-30"
                            title={pin.note}
                          >
                            <div className="relative flex items-center justify-center">
                              <span className="h-4 w-4 rounded-full bg-success/40 animate-ping absolute" />
                              <span className="h-3.5 w-3.5 rounded-full bg-success/60 border-2 border-black shadow-[0_0_8px_#00ff66] flex items-center justify-center text-[8px] font-bold text-black">
                                {i + 1}
                              </span>
                            </div>
                            <div className="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2.5 py-1 bg-black/95 border border-success text-[10px] font-mono text-success/80 whitespace-nowrap rounded-lg shadow-xl z-40">
                              {pin.note}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : currentFile.fileType?.startsWith("application/pdf") ? (
                      <iframe
                        src={`data:${currentFile.fileType};base64,${currentFile.fileData}`}
                        className="w-full h-full border-0 rounded-xl"
                        style={{ transform: `scale(${zoom})`, transformOrigin: "top left" }}
                        title="PDF viewer"
                      />
                    ) : (
                      <div className="text-center text-sm text-muted-foreground font-mono">
                        <FileImage className="h-12 w-12 mx-auto mb-2 opacity-30 text-muted-foreground" />
                        <p>File type not previewable: {currentFile.fileType}</p>
                      </div>
                    )
                  ) : (
                    <div className="text-center text-sm text-muted-foreground font-mono">
                      <FileImage className="h-12 w-12 mx-auto mb-2 opacity-30 text-muted-foreground" />
                      <p>No drawing blueprint file attached for this revision.</p>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setShowRevDialog(true)}
                        className="mt-3 text-xs border-info/40 text-[var(--primary)] hover:bg-cyan-500/10"
                      >
                        <Upload className="h-3.5 w-3.5 mr-1" /> Upload File for this Revision
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {/* Right Side-by-Side BOQ Takeoff Pane */}
              {splitComparator && (
                <div className="w-80 shrink-0 h-full">
                  <DrawingComparatorPane projectId={activeProjectId} />
                </div>
              )}

              {/* Right Markup List Panel */}
              {showMarkupList && !isDiffActive && (
                <MarkupListPanel
                  drawingId={drawingId}
                  revisionId={selectedRevId !== drawing?.id ? selectedRevId ?? undefined : undefined}
                  selectedMarkupId={selectedMarkupId}
                  onSelectMarkup={setSelectedMarkupId}
                  onDeleteMarkup={() => (globalThis as any).__markupDelete?.()}
                  onClose={() => setShowMarkupList(false)}
                />
              )}
            </div>
          </div>
        </div>
      </DialogContent>

      {showRevDialog && drawing && (
        <AddRevisionDialog
          drawingId={drawing.id}
          drawingNumber={drawing.number}
          currentRevision={drawing.revision}
          projectId={activeProjectId}
          onClose={() => setShowRevDialog(false)}
          onDone={() => {
            setShowRevDialog(false);
            utils.document.getDrawing.invalidate({ drawingId });
            onChanged?.();
          }}
        />
      )}

      {showApproveDialog && drawing && (
        <ApproveDrawingDialog
          drawingId={drawing.id}
          drawingNumber={drawing.number}
          projectId={activeProjectId}
          onClose={() => setShowApproveDialog(false)}
          onDone={() => {
            setShowApproveDialog(false);
            utils.document.getDrawing.invalidate({ drawingId });
            onChanged?.();
          }}
        />
      )}

      {showRfiDialog && drawing && (
        <CreateRfiFromDrawingDialog
          drawingId={drawing.id}
          drawingNumber={drawing.number}
          projectId={activeProjectId}
          pinX={lastPin?.x}
          pinY={lastPin?.y}
          onClose={() => setShowRfiDialog(false)}
          onDone={() => {
            setShowRfiDialog(false);
            utils.document.getDrawing.invalidate({ drawingId });
            onChanged?.();
          }}
        />
      )}

      {showEditDialog && drawing && (
        <EditDrawingDialog
          drawing={{
            id: drawing.id,
            title: drawing.title,
            discipline: drawing.discipline,
            status: drawing.status,
            scaleValue: drawing.scaleValue ? Number(drawing.scaleValue) : null,
            scaleUnit: drawing.scaleUnit,
          }}
          projectId={activeProjectId}
          onClose={() => setShowEditDialog(false)}
          onDone={() => {
            setShowEditDialog(false);
            utils.document.getDrawing.invalidate({ drawingId });
            onChanged?.();
          }}
        />
      )}

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent className="bg-card border border-[var(--border)] text-foreground rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-red-400">Delete Master Drawing Sheet</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground text-xs">
              Are you sure you want to permanently delete <strong>{drawing?.number}</strong>? All historical revisions, diff files, and markups will be removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-[var(--border)] text-foreground/80 hover:bg-white/5">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMut.mutate({ itemId: drawingId })}
              className="bg-red-600 hover:bg-red-500 text-foreground font-bold"
            >
              Delete Sheet
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
