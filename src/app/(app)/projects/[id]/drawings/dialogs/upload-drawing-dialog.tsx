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
    <DialogContent className="sm:max-w-[760px] w-full p-0 gap-0 bg-white border border-[#c7d8e8] text-slate-900 rounded-2xl shadow-2xl overflow-hidden font-sans">
      <div className="px-6 py-4 border-b border-[#e2edf7] bg-[#f8fbfe] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-sky-100 border border-sky-200 text-[#0284c7]">
            <Compass className="h-5 w-5" />
          </div>
          <div>
            <DialogTitle className="text-base font-bold text-slate-900">
              Drawing Vault &amp; Bluebeam Revision Stacker (नक्सा दर्ता)
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Register new master drawing sheets or stack versioned revisions with full audit changelog.
            </DialogDescription>
          </div>
        </div>
      </div>

      <div className="px-6 pt-3 pb-1 border-b border-[#e2edf7] bg-white">
        {/* Mode Switcher */}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => {
              setMode("new");
            }}
            className={cn(
              "flex items-center justify-center gap-2 py-2 px-3 rounded-xl border text-xs font-bold transition-all",
              mode === "new"
                ? "bg-sky-50 border-[#0284c7] text-[#0284c7] shadow-xs"
                : "bg-slate-50 border-[#c7d8e8] text-slate-600 hover:text-slate-900 hover:bg-slate-100"
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
              "flex items-center justify-center gap-2 py-2 px-3 rounded-xl border text-xs font-bold transition-all",
              mode === "revision"
                ? "bg-sky-50 border-[#0284c7] text-[#0284c7] shadow-xs"
                : "bg-slate-50 border-[#c7d8e8] text-slate-600 hover:text-slate-900 hover:bg-slate-100"
            )}
          >
            <GitBranch className="h-3.5 w-3.5" />
            Upload Revision to Sheet (संशोधन दर्ता)
          </button>
        </div>
      </div>

      <div className="p-6 space-y-3.5 text-xs bg-white">
        {/* Project Selector (for Org-Level Vault) */}
        {!projectId && (
          <div className="space-y-1.5 p-3 rounded-xl bg-sky-50 border border-sky-200">
            <Label className="text-xs font-semibold text-[#0284c7]">Target Project Site (आयोजना) *</Label>
            <Select
              value={selectedProjectId}
              onValueChange={(val) => {
                setSelectedProjectId(val);
                setSelectedDrawingId("");
              }}
            >
              <SelectTrigger className="h-9 text-xs bg-white border-[#c7d8e8] text-slate-900 rounded-xl focus:border-[#0284c7]">
                <SelectValue placeholder="Select target project site..." />
              </SelectTrigger>
              <SelectContent className="bg-white border-[#c7d8e8] text-slate-900 text-xs shadow-xl rounded-xl">
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
          <div className="space-y-3 p-3.5 rounded-xl bg-sky-50/50 border border-sky-200">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-[#0284c7] flex items-center justify-between">
                <span>Select Target Drawing Sheet to Revise *</span>
                <span className="text-[10px] font-mono text-slate-500">
                  {existingDrawings.length} sheet(s) in project
                </span>
              </Label>
              {existingDrawings.length === 0 ? (
                <div className="p-3 rounded-lg border border-dashed border-[#c7d8e8] text-xs text-slate-500 text-center">
                  No existing drawings found in this project. Switch to "New Master Sheet" first.
                </div>
              ) : (
                <Select
                  value={selectedDrawingId}
                  onValueChange={handleSelectDrawingForRevision}
                >
                  <SelectTrigger className="h-10 text-xs bg-white border-[#c7d8e8] text-slate-900 font-mono rounded-xl focus:border-[#0284c7]">
                    <SelectValue placeholder="Select drawing number..." />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-[#c7d8e8] text-slate-900 text-xs max-h-64 shadow-xl rounded-xl">
                    {existingDrawings.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        <span className="font-bold text-[#0284c7] mr-2 font-matrix">{d.number}</span>
                        <span className="text-slate-700 truncate mr-2">· {d.title}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 font-mono text-slate-700">
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
                  <Label className="text-[11px] text-slate-600">Current Revision</Label>
                  <div className="h-9 px-3 rounded-xl bg-slate-100 border border-[#c7d8e8] flex items-center text-xs font-mono font-bold text-slate-700">
                    Rev {selectedExistingDrawing.revision}
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] text-[#0284c7] font-semibold">New Revision Tag *</Label>
                  <Input
                    value={revision}
                    onChange={(e) => setRevision(e.target.value)}
                    placeholder="B"
                    className="h-9 text-xs font-mono font-bold bg-white border-[#0284c7] text-[#0284c7] rounded-xl focus:border-[#0284c7]"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] text-slate-600">Discipline</Label>
                  <div className="h-9 px-3 rounded-xl bg-slate-100 border border-[#c7d8e8] flex items-center text-xs font-mono text-slate-700 capitalize">
                    {selectedExistingDrawing.discipline || "General"}
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">
                Revision Changelog / Consultant Notes (परिमार्जन विवरण)
              </Label>
              <Textarea
                value={revisionNotes}
                onChange={(e) => setRevisionNotes(e.target.value)}
                placeholder="e.g. Footing size revised to 2.4m x 2.4m per Site Inspection Note #12 by Consultant..."
                className="text-xs bg-white border-[#c7d8e8] text-slate-900 rounded-xl min-h-[60px] focus:border-[#0284c7]"
                rows={2}
              />
            </div>
          </div>
        ) : (
          /* NEW MASTER SHEET MODE */
          <div className="space-y-3">
            {duplicateMatch && (
              <div className="flex items-center justify-between p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />
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
                  className="h-7 text-xs border-amber-300 text-amber-800 hover:bg-amber-100"
                >
                  Upload as Rev {computeNextRevision(duplicateMatch.revision)} <ArrowRight className="h-3 w-3 ml-1" />
                </Button>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700">Drawing Number (नक्सा नं.) *</Label>
                <Input
                  value={number}
                  onChange={(e) => setNumber(e.target.value)}
                  placeholder="e.g. DWG-STR-001"
                  className="h-9 text-xs font-mono font-bold bg-white border-[#c7d8e8] text-[#0284c7] rounded-xl focus:border-[#0284c7]"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700">Initial Revision</Label>
                <Input
                  value={revision}
                  onChange={(e) => setRevision(e.target.value)}
                  placeholder="A"
                  className="h-9 text-xs font-mono bg-white border-[#c7d8e8] text-slate-900 rounded-xl focus:border-[#0284c7]"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">Drawing Title &amp; Specification (शीर्षक) *</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Typical Column & Footing Layout Plan (Grid A-F)"
                className="h-9 text-xs bg-white border-[#c7d8e8] text-slate-900 rounded-xl focus:border-[#0284c7]"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700">Discipline (विधा)</Label>
                <Select value={discipline} onValueChange={setDiscipline}>
                  <SelectTrigger className="h-9 text-xs bg-white border-[#c7d8e8] text-slate-900 rounded-xl focus:border-[#0284c7]">
                    <SelectValue placeholder="Select discipline..." />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-[#c7d8e8] text-slate-900 text-xs shadow-xl rounded-xl">
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
                <Label className="text-xs font-semibold text-slate-700">Linked Gantt Activity (तालिका)</Label>
                <Select value={ganttTaskId} onValueChange={setGanttTaskId}>
                  <SelectTrigger className="h-9 text-xs bg-white border-[#c7d8e8] text-slate-900 rounded-xl focus:border-[#0284c7]">
                    <SelectValue placeholder="— None —" />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-[#c7d8e8] text-slate-900 text-xs max-h-48 shadow-xl rounded-xl">
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
          <Label className="text-xs font-semibold text-slate-700">
            Drawing Sheet File (Image or PDF · Max 10MB)
          </Label>
          {!file ? (
            <label className="flex flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-[#c7d8e8] bg-slate-50 h-20 cursor-pointer hover:bg-sky-50 hover:border-[#0284c7] transition-all text-xs text-slate-500">
              <Upload className="h-4 w-4 text-[#0284c7]" />
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
            <div className="flex items-center gap-3 rounded-xl border border-[#c7d8e8] bg-slate-50 p-2.5 text-xs">
              <div className="p-1.5 rounded-lg bg-sky-100 text-[#0284c7]">
                <FileImage className="h-4 w-4 shrink-0" />
              </div>
              <div className="flex-1 truncate">
                <div className="font-semibold text-slate-900 truncate">{file.name}</div>
                <div className="text-[10px] text-slate-500 font-mono">{(file.size / 1024).toFixed(0)} KB</div>
              </div>
              <button
                type="button"
                onClick={() => setFile(null)}
                className="p-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50"
              >
                ✕
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="px-6 py-3 border-t border-[#e2edf7] flex items-center justify-between bg-[#f8fbfe]">
        <div className="text-[10px] text-slate-500 font-mono flex items-center gap-1">
          <History className="h-3 w-3 text-slate-400" />
          <span>RLS Armed &amp; Tenant Isolated</span>
        </div>
        <div className="flex items-center gap-2.5">
          <Button variant="outline" size="sm" onClick={onDone} className="h-8 text-xs border-[#c7d8e8] text-slate-600 hover:bg-slate-100 font-mono">
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            size="sm"
            disabled={isPending}
            className="amber-cta-btn h-8 text-xs font-bold text-white shadow-sm font-mono"
          >
            {isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
            {mode === "revision" ? `Stack Revision ${revision} (संशोधन)` : "Register Drawing (नक्सा दर्ता)"}
          </Button>
        </div>
      </div>
    </DialogContent>
  );
}
