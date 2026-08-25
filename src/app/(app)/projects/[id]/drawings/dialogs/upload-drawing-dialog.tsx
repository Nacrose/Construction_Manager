"use client";

import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc-client";
import { DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, Upload, FileImage } from "lucide-react";
import { toast } from "sonner";

export function UploadDrawingDialog({ projectId, ganttTasks, onDone }: { projectId: string; ganttTasks: any[]; onDone: () => void }) {
  const [number, setNumber] = useState("");
  const [title, setTitle] = useState("");
  const [discipline, setDiscipline] = useState("");
  const [revision, setRevision] = useState("A");
  const [ganttTaskId, setGanttTaskId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const createMut = trpc.document.createDrawing.useMutation({
    onSuccess: () => { toast.success("Drawing uploaded"); onDone(); },
    onError: (e) => toast.error(e.message),
  });

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) { toast.error("File too large (max 10MB)"); return; }
    setFile(f);
  };

  const handleSubmit = async () => {
    if (!number || !title) { toast.error("Number and title required"); return; }
    let fileData: string | undefined, fileName: string | undefined, fileType: string | undefined;
    if (file) {
      const reader = new FileReader();
      fileData = await new Promise<string>((resolve) => {
        reader.onloadend = () => resolve((reader.result as string).split(",")[1] ?? "");
        reader.readAsDataURL(file!);
      });
      fileName = file.name; fileType = file.type;
    }
    createMut.mutate({ projectId, number, title, discipline: discipline || undefined, revision, ganttTaskId: ganttTaskId === "none" ? undefined : ganttTaskId, fileData, fileName, fileType });
  };

  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader><DialogTitle>Upload Drawing</DialogTitle><DialogDescription>Upload a new drawing with revision tracking and task reference.</DialogDescription></DialogHeader>
      <div className="space-y-3 py-2">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5"><Label className="text-xs">Drawing Number</Label><Input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="DWG-C-001" className="h-9 text-sm font-mono" /></div>
          <div className="space-y-1.5"><Label className="text-xs">Revision</Label><Input value={revision} onChange={(e) => setRevision(e.target.value)} placeholder="A" className="h-9 text-sm font-mono" /></div>
        </div>
        <div className="space-y-1.5"><Label className="text-xs">Title</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Site plan, foundation detail..." className="h-9 text-sm" /></div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5"><Label className="text-xs">Discipline</Label>
            <Select value={discipline} onValueChange={setDiscipline}><SelectTrigger className="h-9 text-sm"><SelectValue placeholder="—" /></SelectTrigger><SelectContent>
              <SelectItem value="civil">Civil</SelectItem><SelectItem value="structural">Structural</SelectItem>
              <SelectItem value="electrical">Electrical</SelectItem><SelectItem value="mechanical">Mechanical</SelectItem>
              <SelectItem value="architectural">Architectural</SelectItem>
            </SelectContent></Select>
          </div>
          <div className="space-y-1.5"><Label className="text-xs">Linked Gantt Task</Label>
            <Select value={ganttTaskId} onValueChange={setGanttTaskId}><SelectTrigger className="h-9 text-sm"><SelectValue placeholder="— None —" /></SelectTrigger><SelectContent>
              <SelectItem value="none">— None —</SelectItem>
              {ganttTasks.slice(0, 50).map(t => <SelectItem key={t.id} value={t.id}>{t.code ?? "?"} · {t.name.slice(0, 30)}</SelectItem>)}
            </SelectContent></Select>
          </div>
        </div>
        <div className="space-y-1.5"><Label className="text-xs">Drawing File (image or PDF, max 10MB)</Label>
          {!file ? (
            <label className="flex items-center justify-center gap-2 rounded-md border border-dashed h-16 cursor-pointer hover:bg-muted/30 text-xs text-muted-foreground">
              <Upload className="h-3.5 w-3.5" /><span>Click to select file</span>
              <input ref={fileInputRef} type="file" accept="image/*,application/pdf" onChange={handleFile} className="hidden" />
            </label>
          ) : (
            <div className="flex items-center gap-2 rounded-md border p-2 text-xs"><FileImage className="h-4 w-4 text-primary shrink-0" /><span className="flex-1 truncate">{file.name}</span><span className="text-muted-foreground">{(file.size / 1024).toFixed(0)} KB</span><button onClick={() => setFile(null)} className="text-muted-foreground hover:text-destructive">✕</button></div>
          )}
        </div>
      </div>
      <DialogFooter><Button variant="outline" onClick={onDone}>Cancel</Button><Button onClick={handleSubmit} disabled={createMut.isPending}>{createMut.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />} Upload</Button></DialogFooter>
    </DialogContent>
  );
}
