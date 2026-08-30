"use client";

import { useState, useRef, useMemo } from "react";
import { trpc } from "@/lib/trpc-client";
import { DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, Upload, FileImage, GitBranch, Plus, ArrowRight, AlertCircle, Compass, History } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export function UploadDrawingDialog({
  projectId,
  ganttTasks = [],
  onDone,
}: {
  projectId?: string;
  ganttTasks?: any[];
  onDone: () => void;
}) {
  const utils = trpc.useUtils();
  const [selectedProjectId, setSelectedProjectId] = useState(projectId || "");
  const [mode, setMode] = useState<"new" | "revision">("new");

  // New sheet state
  const [number, setNumber] = useState("");
  const [title, setTitle] = useState("");
  const [discipline, setDiscipline] = useState("");
  const [revision, setRevision] = useState("A");
  const [ganttTaskId, setGanttTaskId] = useState("");

  // Revision state
  const [selectedDrawingId, setSelectedDrawingId] = useState<string>("");
  const [revisionNotes, setRevisionNotes] = useState("");

  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const targetProjectId = projectId || selectedProjectId;

  // Fetch project list (for org-level vault)
  const { data: projectsData } = trpc.project.list.useQuery(undefined, {
    enabled: !projectId,
  });
  const projects = projectsData?.projects || [];

  // Fetch existing drawings for the target project to enable smart revision stacking
  const { data: drawingsData } = trpc.document.listDrawings.useQuery(
    { projectId: targetProjectId || null },
    { enabled: !!targetProjectId }
  );
  const existingDrawings = useMemo(() => {
    return (drawingsData?.drawings ?? []) as any[];
  }, [drawingsData?.drawings]);

  // Selected drawing for revision mode
  const selectedExistingDrawing = useMemo(() => {
    return existingDrawings.find((d) => d.id === selectedDrawingId);
  }, [existingDrawings, selectedDrawingId]);

  // Check for duplicate drawing number in "new" mode
  const duplicateMatch = useMemo(() => {
    if (mode !== "new" || !number.trim()) return null;
    return existingDrawings.find(
      (d) => d.number.toLowerCase() === number.trim().toLowerCase()
    );
  }, [mode, number, existingDrawings]);

  // Next suggested revision helper
  const computeNextRevision = (currentRev: string) => {
    const clean = currentRev.trim().toUpperCase();
    if (/^[A-Z]$/.test(clean)) {
      return String.fromCharCode(clean.charCodeAt(0) + 1);
    }
    const num = parseInt(clean, 10);
    return isNaN(num) ? "B" : String(num + 1).padStart(2, "0");
  };

  // Handle switching to revision mode for a specific drawing
  const handleSelectDrawingForRevision = (drawingId: string) => {
    setSelectedDrawingId(drawingId);
    const dwg = existingDrawings.find((d) => d.id === drawingId);
    if (dwg) {
      setNumber(dwg.number);
      setTitle(dwg.title);
      setDiscipline(dwg.discipline || "");
      setRevision(computeNextRevision(dwg.revision || "A"));
    }
  };

  const createMut = trpc.document.createDrawing.useMutation({
    onSuccess: () => {
      toast.success("Master drawing sheet registered successfully");
      utils.document.listDrawings.invalidate();
      onDone();
    },
    onError: (e) => toast.error(e.message),
  });

  const revisionMut = trpc.document.addRevision.useMutation({
    onSuccess: () => {
      toast.success(`Revision ${revision} uploaded & stacked successfully`);
      utils.document.listDrawings.invalidate();
      onDone();
    },
    onError: (e) => toast.error(e.message),
  });

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) {
      toast.error("File too large (max 10MB)");
      return;
    }
    setFile(f);
  };

  const handleSubmit = async () => {
    if (!targetProjectId) {
      toast.error("Please select a target project site");
      return;
    }

    let fileData: string | undefined, fileName: string | undefined, fileType: string | undefined;
    if (file) {
      const reader = new FileReader();
      fileData = await new Promise<string>((resolve) => {
        reader.onloadend = () => resolve((reader.result as string).split(",")[1] ?? "");
        reader.readAsDataURL(file!);
      });
      fileName = file.name;
      fileType = file.type;
    }

    if (mode === "revision") {
      if (!selectedDrawingId) {
        toast.error("Please select which existing drawing sheet to revise");
        return;
      }
      if (!revision.trim()) {
        toast.error("Revision tag is required (e.g. Rev B or 02)");
        return;
      }
      revisionMut.mutate({
        drawingId: selectedDrawingId,
        revision: revision.trim(),
        description: revisionNotes.trim() || undefined,
        fileData,
        fileName,
        fileType,
      });
    } else {
      if (!number.trim() || !title.trim()) {
        toast.error("Drawing Number and Title are required");
        return;
      }
      if (duplicateMatch) {
        toast.error(`Drawing ${number} already exists. Switch to Revision mode or use a distinct number.`);
        return;
      }
      createMut.mutate({
        projectId: targetProjectId,
        number: number.trim(),
        title: title.trim(),
        discipline: discipline || undefined,
        revision: revision.trim() || "A",
        ganttTaskId: ganttTaskId === "none" ? undefined : ganttTaskId,
        fileData,
        fileName,
        fileType,
      });
    }
  };

  const isPending = createMut.isPending || revisionMut.isPending;

  return (
    <DialogContent className="sm:max-w-2xl bg-[#0c1015]/95 backdrop-blur-md border border-white/10 text-white p-6 rounded-2xl shadow-2xl">
      <DialogHeader className="space-y-1 pb-2 border-b border-white/10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <Compass className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold text-white tracking-wide">
                Drawing Vault & Bluebeam Revision Stacker (नक्सा दर्ता)
              </DialogTitle>
              <DialogDescription className="text-xs text-gray-400">
                Register new master drawing sheets or stack versioned revisions with full audit changelog.
              </DialogDescription>
            </div>
          </div>
        </div>

        {/* Mode Switcher */}
        <div className="grid grid-cols-2 gap-2 pt-2">
          <button
            type="button"
            onClick={() => {
              setMode("new");
            }}
            className={cn(
              "flex items-center justify-center gap-2 py-2 px-3 rounded-xl border text-xs font-semibold transition-all",
              mode === "new"
                ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-300 shadow-sm"
                : "bg-white/5 border-white/10 text-gray-400 hover:text-white hover:bg-white/10"
            )}
          >
            <Plus className="h-3.5 w-3.5" />
            New Master Sheet (नयाँ नक्सा)
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("revision");
              if (existingDrawings.length > 0 && !selectedDrawingId) {
                handleSelectDrawingForRevision(existingDrawings[0].id);
              }
            }}
            className={cn(
              "flex items-center justify-center gap-2 py-2 px-3 rounded-xl border text-xs font-semibold transition-all",
              mode === "revision"
                ? "bg-cyan-500/20 border-cyan-500/40 text-cyan-300 shadow-sm"
                : "bg-white/5 border-white/10 text-gray-400 hover:text-white hover:bg-white/10"
            )}
          >
            <GitBranch className="h-3.5 w-3.5" />
            Upload Revision to Sheet (संशोधन दर्ता)
          </button>
        </div>
      </DialogHeader>

      <div className="space-y-4 py-2">
        {/* Project Selector (for Org-Level Vault) */}
        {!projectId && (
          <div className="space-y-1.5 p-3 rounded-xl bg-blue-500/10 border border-blue-500/20">
            <Label className="text-xs font-semibold text-blue-300">Target Project Site (आयोजना) *</Label>
            <Select
              value={selectedProjectId}
              onValueChange={(val) => {
                setSelectedProjectId(val);
                setSelectedDrawingId("");
              }}
            >
              <SelectTrigger className="h-9 text-xs bg-[#161d26] border-white/10 text-white rounded-xl">
                <SelectValue placeholder="Select target project site..." />
              </SelectTrigger>
              <SelectContent className="bg-[#0f141c] border-white/10 text-white text-xs">
                {projects.map((p: any) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} ({p.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* REVISION MODE: Select Existing Drawing Sheet */}
        {mode === "revision" ? (
          <div className="space-y-3 p-3.5 rounded-xl bg-cyan-500/5 border border-cyan-500/20">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-cyan-300 flex items-center justify-between">
                <span>Select Target Drawing Sheet to Revise *</span>
                <span className="text-[10px] font-mono text-gray-400">
                  {existingDrawings.length} sheet(s) in project
                </span>
              </Label>
              {existingDrawings.length === 0 ? (
                <div className="p-3 rounded-lg border border-dashed border-white/10 text-xs text-gray-400 text-center">
                  No existing drawings found in this project. Switch to "New Master Sheet" first.
                </div>
              ) : (
                <Select
                  value={selectedDrawingId}
                  onValueChange={handleSelectDrawingForRevision}
                >
                  <SelectTrigger className="h-10 text-xs bg-[#161d26] border-white/10 text-white font-mono rounded-xl">
                    <SelectValue placeholder="Select drawing number..." />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0f141c] border-white/10 text-white text-xs max-h-64">
                    {existingDrawings.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        <span className="font-bold text-cyan-400 mr-2">{d.number}</span>
                        <span className="text-gray-300 truncate mr-2">· {d.title}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 font-mono text-gray-300">
                          Current: Rev {d.revision}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {selectedExistingDrawing && (
              <div className="grid grid-cols-3 gap-3 pt-1">
                <div className="space-y-1">
                  <Label className="text-[11px] text-gray-400">Current Revision</Label>
                  <div className="h-9 px-3 rounded-xl bg-black/40 border border-white/10 flex items-center text-xs font-mono text-gray-300">
                    Rev {selectedExistingDrawing.revision}
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] text-cyan-300 font-semibold">New Revision Tag *</Label>
                  <Input
                    value={revision}
                    onChange={(e) => setRevision(e.target.value)}
                    placeholder="B"
                    className="h-9 text-xs font-mono font-bold bg-[#161d26] border-cyan-500/40 text-cyan-300 rounded-xl"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] text-gray-400">Discipline</Label>
                  <div className="h-9 px-3 rounded-xl bg-black/40 border border-white/10 flex items-center text-xs font-mono text-gray-300 capitalize">
                    {selectedExistingDrawing.discipline || "General"}
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-gray-300">
                Revision Changelog / Consultant Notes (परिमार्जन विवरण)
              </Label>
              <Textarea
                value={revisionNotes}
                onChange={(e) => setRevisionNotes(e.target.value)}
                placeholder="e.g. Footing size revised to 2.4m x 2.4m per Site Inspection Note #12 by Consultant..."
                className="text-xs bg-[#161d26] border-white/10 text-white rounded-xl min-h-[60px]"
                rows={2}
              />
            </div>
          </div>
        ) : (
          /* NEW MASTER SHEET MODE */
          <div className="space-y-3">
            {duplicateMatch && (
              <div className="flex items-center justify-between p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>
                    <strong>{number}</strong> already exists (Current: Rev {duplicateMatch.revision}).
                  </span>
                </div>
                <Button
                  size="sm"
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setMode("revision");
                    handleSelectDrawingForRevision(duplicateMatch.id);
                  }}
                  className="h-7 text-xs border-amber-500/40 text-amber-300 hover:bg-amber-500/20"
                >
                  Upload as Rev {computeNextRevision(duplicateMatch.revision)} <ArrowRight className="h-3 w-3 ml-1" />
                </Button>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-gray-300">Drawing Number (नक्सा नं.) *</Label>
                <Input
                  value={number}
                  onChange={(e) => setNumber(e.target.value)}
                  placeholder="e.g. DWG-STR-001"
                  className="h-9 text-xs font-mono font-bold bg-[#161d26] border-white/10 text-emerald-400 rounded-xl"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-gray-300">Initial Revision</Label>
                <Input
                  value={revision}
                  onChange={(e) => setRevision(e.target.value)}
                  placeholder="A"
                  className="h-9 text-xs font-mono bg-[#161d26] border-white/10 text-white rounded-xl"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-gray-300">Drawing Title & Specification (शीर्षक) *</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Typical Column & Footing Layout Plan (Grid A-F)"
                className="h-9 text-xs bg-[#161d26] border-white/10 text-white rounded-xl"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-gray-300">Discipline (विधा)</Label>
                <Select value={discipline} onValueChange={setDiscipline}>
                  <SelectTrigger className="h-9 text-xs bg-[#161d26] border-white/10 text-white rounded-xl">
                    <SelectValue placeholder="Select discipline..." />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0f141c] border-white/10 text-white text-xs">
                    <SelectItem value="civil">Civil (सिभिल)</SelectItem>
                    <SelectItem value="structural">Structural (संरचना)</SelectItem>
                    <SelectItem value="architectural">Architectural (वास्तुकला)</SelectItem>
                    <SelectItem value="electrical">Electrical (विद्युत)</SelectItem>
                    <SelectItem value="mechanical">Mechanical (यान्त्रिक)</SelectItem>
                    <SelectItem value="sanitary">Sanitary / Plumbing (खानेपानी/ढल)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-gray-300">Linked Gantt Activity (तालिका)</Label>
                <Select value={ganttTaskId} onValueChange={setGanttTaskId}>
                  <SelectTrigger className="h-9 text-xs bg-[#161d26] border-white/10 text-white rounded-xl">
                    <SelectValue placeholder="— None —" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0f141c] border-white/10 text-white text-xs max-h-48">
                    <SelectItem value="none">— None —</SelectItem>
                    {ganttTasks.slice(0, 50).map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.code ?? "?"} · {t.name.slice(0, 30)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        )}

        {/* File Attachment Upload Box */}
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold text-gray-300">
            Drawing Sheet File (Image or PDF · Max 10MB)
          </Label>
          {!file ? (
            <label className="flex flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-white/20 h-20 cursor-pointer hover:bg-white/5 hover:border-emerald-500/50 transition-all text-xs text-gray-400">
              <Upload className="h-4 w-4 text-emerald-400" />
              <span>Click or drag drawing file here (PNG, JPG, PDF)</span>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,application/pdf"
                onChange={handleFile}
                className="hidden"
              />
            </label>
          ) : (
            <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-[#161d26] p-2.5 text-xs">
              <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400">
                <FileImage className="h-4 w-4 shrink-0" />
              </div>
              <div className="flex-1 truncate">
                <div className="font-medium text-white truncate">{file.name}</div>
                <div className="text-[10px] text-gray-400 font-mono">{(file.size / 1024).toFixed(0)} KB</div>
              </div>
              <button
                type="button"
                onClick={() => setFile(null)}
                className="p-1 rounded-md text-gray-400 hover:text-red-400 hover:bg-white/5"
              >
                ✕
              </button>
            </div>
          )}
        </div>
      </div>

      <DialogFooter className="pt-2 border-t border-white/10 flex items-center justify-between">
        <div className="text-[10px] text-gray-400 font-mono flex items-center gap-1">
          <History className="h-3 w-3 text-gray-400" />
          <span>RLS Armed & Tenant Isolated</span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={onDone} className="h-9 text-xs border-white/10 text-gray-300 hover:bg-white/5">
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isPending}
            className={cn(
              "h-9 text-xs font-semibold text-black shadow-lg",
              mode === "revision" ? "bg-cyan-400 hover:bg-cyan-300" : "bg-emerald-400 hover:bg-emerald-300"
            )}
          >
            {isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
            {mode === "revision" ? `Stack Revision ${revision}` : "Register Drawing"}
          </Button>
        </div>
      </DialogFooter>
    </DialogContent>
  );
}
