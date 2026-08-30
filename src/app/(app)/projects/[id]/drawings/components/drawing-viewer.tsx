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
      <DialogContent className={cn("max-h-[95vh] p-0 overflow-hidden transition-all bg-[#0a0d13] border border-white/10 text-white rounded-2xl shadow-2xl", splitComparator ? "sm:max-w-7xl" : "sm:max-w-6xl")}>
        <div className="flex h-[90vh]">
          {/* Left Metadata & Revision Changelog Sidebar */}
          <div className="w-72 shrink-0 border-r border-white/10 overflow-y-auto p-3.5 space-y-4 bg-[#0c1015]/95 flex flex-col">
            <div className="space-y-1 pb-3 border-b border-white/10">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                  {drawing?.number ?? "Loading..."}
                </span>
                <span className="text-[10px] uppercase font-mono text-gray-400">
                  {drawing?.discipline || "General"}
                </span>
              </div>
              <h3 className="text-sm font-semibold text-white truncate" title={drawing?.title}>
                {drawing?.title}
              </h3>
            </div>

            {/* Revision Audit History */}
            <div className="flex-1 space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-[11px] font-bold uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
                  <History className="h-3.5 w-3.5 text-cyan-400" />
                  <span>Revision History ({allRevisionsList.length})</span>
                </Label>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setShowRevDialog(true)}
                  className="h-6 text-[10px] font-mono text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/10 px-1.5"
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
                          ? "border-emerald-500/40 bg-emerald-500/10 text-white shadow-sm"
                          : "border-white/10 bg-[#121820]/70 text-gray-300 hover:bg-white/5 hover:border-white/20"
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
                          <span className={cn("text-xs", rev.isCurrent ? "text-emerald-400" : "text-gray-300")}>
                            Rev {rev.revision}
                          </span>
                          {rev.isCurrent ? (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30">
                              CURRENT · IFC
                            </span>
                          ) : (
                            <span className="text-[9px] px-1 py-0.2 rounded bg-white/10 text-gray-400 font-mono">
                              SUPERSEDED
                            </span>
                          )}
                        </button>

                        {allRevisionsList.length > 1 && !rev.isCurrent && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => startDiffWithRevision(rev.id)}
                            className="h-5 text-[9px] px-1.5 text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/10"
                            title="Compare this revision against Current"
                          >
                            <Sparkles className="h-2.5 w-2.5 mr-0.5" /> Diff
                          </Button>
                        )}
                      </div>

                      {rev.description && (
                        <p className="text-[10px] text-gray-400 line-clamp-2 leading-relaxed italic bg-black/30 p-1.5 rounded-lg border border-white/5">
                          "{rev.description}"
                        </p>
                      )}

                      <div className="flex items-center justify-between text-[9px] text-gray-400 pt-0.5">
                        <span className="flex items-center gap-1 font-mono">
                          <Clock className="h-2.5 w-2.5 text-gray-400" />
                          {rev.issuedDate ? format(new Date(rev.issuedDate), "dd MMM yyyy") : "—"}
                        </span>
                        {rev.approvalStatus && rev.approvalStatus !== "pending" && (
                          <span className="text-[9px] text-blue-400 font-medium">
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
              <div className="space-y-1.5 pt-2 border-t border-white/10">
                <Label className="text-[10px] font-semibold uppercase text-gray-400 flex items-center justify-between">
                  <span>Site Observation Pins ({pins.length})</span>
                </Label>
                <div className="space-y-1 max-h-28 overflow-y-auto">
                  {pins.map((pin, i) => (
                    <div key={pin.id} className="flex items-center justify-between p-1.5 rounded-lg border border-white/10 bg-[#161d26] text-[10px] font-mono text-gray-300">
                      <div className="truncate flex-1 mr-1">
                        <span className="font-bold text-emerald-400 mr-1.5">#{i + 1}</span>
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
            <div className="space-y-1.5 pt-3 border-t border-white/10">
              <Button size="sm" variant="outline" className="w-full h-8 text-xs gap-1.5 border-white/10 bg-[#161d26] text-white hover:bg-white/10" onClick={() => setShowRevDialog(true)}>
                <GitBranch className="h-3.5 w-3.5 text-cyan-400" /> Stack New Revision
              </Button>
              <Button size="sm" variant="outline" className="w-full h-8 text-xs gap-1.5 border-white/10 bg-[#161d26] text-white hover:bg-white/10" onClick={() => setShowApproveDialog(true)}>
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> Approve / Reject Sheet
              </Button>
              <Button size="sm" variant="outline" className="w-full h-8 text-xs gap-1.5 border-white/10 bg-[#161d26] text-white hover:bg-white/10" onClick={() => setShowRfiDialog(true)}>
                <FileQuestion className="h-3.5 w-3.5 text-amber-400" /> Raise Linked RFI
              </Button>
              <Button size="sm" variant="outline" className="w-full h-8 text-xs gap-1.5 border-white/10 bg-[#161d26] text-white hover:bg-white/10" onClick={() => setShowEditDialog(true)}>
                <Pencil className="h-3.5 w-3.5 text-blue-400" /> Edit Metadata & Scale
              </Button>
              <Button size="sm" variant="outline" className="w-full h-8 text-xs gap-1.5 border-red-500/20 text-red-400 hover:bg-red-500/10 hover:text-red-300" onClick={() => setShowDeleteConfirm(true)}>
                <Trash2 className="h-3.5 w-3.5" /> Delete Sheet
              </Button>
            </div>
          </div>

          {/* Center Drawing Canvas & Diff Area */}
          <div className="flex-1 flex flex-col min-w-0 bg-[#080b0f]">
            {/* Top Toolbar */}
            <div className="shrink-0 border-b border-white/10 px-3 py-2 flex items-center justify-between bg-[#0c1015]/95 font-mono text-xs z-10 backdrop-blur-md">
              <div className="flex items-center gap-1.5">
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-gray-300 hover:text-white" onClick={() => setZoom(z => Math.max(0.25, z - 0.25))} title="Zoom out">
                  <ZoomOut className="h-4 w-4" />
                </Button>
                <span className="text-xs font-mono w-12 text-center text-emerald-400 font-bold">{Math.round(zoom * 100)}%</span>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-gray-300 hover:text-white" onClick={() => setZoom(z => Math.min(4, z + 0.25))} title="Zoom in">
                  <ZoomIn className="h-4 w-4" />
                </Button>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-gray-300 hover:text-white" onClick={() => setZoom(1)} title="Reset zoom">
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
                        ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/50 shadow-[0_0_10px_#22d3ee40]"
                        : "border-white/10 bg-[#161d26] text-gray-300 hover:text-white"
                    )}
                    onClick={() => setIsDiffActive(!isDiffActive)}
                    title="Toggle Bluebeam Red/Green Revision Difference Engine"
                  >
                    <Sparkles className="h-3.5 w-3.5 text-cyan-400" />
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
                      pinningMode ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40" : "border-white/10 bg-[#161d26] text-gray-300 hover:text-white"
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
                    splitComparator ? "bg-blue-500/20 text-blue-300 border border-blue-500/40" : "border-white/10 bg-[#161d26] text-gray-300 hover:text-white"
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
                <div className="flex items-center gap-2 bg-[#161d26] px-3 py-1 rounded-xl border border-white/10 text-xs">
                  <span className="text-red-400 font-bold">Base (Older):</span>
                  <Select value={baseRevId} onValueChange={setBaseRevId}>
                    <SelectTrigger className="h-7 w-28 text-xs bg-black/40 border-white/10 text-white font-mono">
                      <SelectValue placeholder="Base Rev" />
                    </SelectTrigger>
                    <SelectContent className="bg-[#0f141c] border-white/10 text-white text-xs">
                      {allRevisionsList.map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          Rev {r.revision} {r.isCurrent ? "(Current)" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <span className="text-cyan-400 font-bold ml-2">Compare (New):</span>
                  <Select value={compareRevId} onValueChange={setCompareRevId}>
                    <SelectTrigger className="h-7 w-28 text-xs bg-black/40 border-white/10 text-white font-mono">
                      <SelectValue placeholder="Compare Rev" />
                    </SelectTrigger>
                    <SelectContent className="bg-[#0f141c] border-white/10 text-white text-xs">
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
                      showMarkupList ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40" : "border-white/10 bg-[#161d26] text-gray-300"
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
                <div className="flex-1 overflow-auto bg-[#080b0f] flex items-center justify-center p-4 relative select-none">
                  {isLoading ? (
                    <Skeleton className="h-96 w-96 rounded-2xl bg-white/5" />
                  ) : currentFile?.fileData ? (
                    currentFile.fileType?.startsWith("image/") ? (
                      <div
                        ref={imageContainerRef}
                        onClick={handleImageClick}
                        style={{ transform: `scale(${zoom})`, transition: "transform 0.15s ease-out" }}
                        className={cn(
                          "relative inline-block max-w-full max-h-full shadow-2xl rounded-xl border border-white/20 bg-white",
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
                              <span className="h-4 w-4 rounded-full bg-emerald-400/40 animate-ping absolute" />
                              <span className="h-3.5 w-3.5 rounded-full bg-emerald-400 border-2 border-black shadow-[0_0_8px_#00ff66] flex items-center justify-center text-[8px] font-bold text-black">
                                {i + 1}
                              </span>
                            </div>
                            <div className="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2.5 py-1 bg-black/95 border border-emerald-500/50 text-[10px] font-mono text-emerald-300 whitespace-nowrap rounded-lg shadow-xl z-40">
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
                      <div className="text-center text-sm text-gray-400 font-mono">
                        <FileImage className="h-12 w-12 mx-auto mb-2 opacity-30 text-gray-400" />
                        <p>File type not previewable: {currentFile.fileType}</p>
                      </div>
                    )
                  ) : (
                    <div className="text-center text-sm text-gray-400 font-mono">
                      <FileImage className="h-12 w-12 mx-auto mb-2 opacity-30 text-gray-400" />
                      <p>No drawing blueprint file attached for this revision.</p>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setShowRevDialog(true)}
                        className="mt-3 text-xs border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10"
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
        <AlertDialogContent className="bg-[#0c1015] border border-white/10 text-white rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-red-400">Delete Master Drawing Sheet</AlertDialogTitle>
            <AlertDialogDescription className="text-gray-400 text-xs">
              Are you sure you want to permanently delete <strong>{drawing?.number}</strong>? All historical revisions, diff files, and markups will be removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-white/10 text-gray-300 hover:bg-white/5">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMut.mutate({ itemId: drawingId })}
              className="bg-red-600 hover:bg-red-500 text-white font-bold"
            >
              Delete Sheet
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
