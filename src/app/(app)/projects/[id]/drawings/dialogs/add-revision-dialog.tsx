"use client";

import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc-client";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Upload, FileImage, GitBranch } from "lucide-react";
import { toast } from "sonner";

export function AddRevisionDialog({ drawingId, drawingNumber, currentRevision, projectId, onClose, onDone }: {
  drawingId: string; drawingNumber: string; currentRevision: string; projectId: string; onClose: () => void; onDone: () => void;
}) {
  const suggestedRev = (() => {
    if (/^[A-Z]$/.test(currentRevision.toUpperCase())) {
      return String.fromCharCode(currentRevision.toUpperCase().charCodeAt(0) + 1);
    }
    const num = parseInt(currentRevision);
    return isNaN(num) ? "B" : String(num + 1).padStart(2, "0");
  })();

  const [revision, setRevision] = useState(suggestedRev);
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const mut = trpc.document.addRevision.useMutation({
    onSuccess: () => { toast.success(`Revision ${revision} added to ${drawingNumber}`); onDone(); },
    onError: (e) => toast.error(e.message),
  });

  const handleSubmit = async () => {
    let fileData: string | undefined, fileName: string | undefined, fileType: string | undefined;
    if (file) {
      const reader = new FileReader();
      fileData = await new Promise<string>((resolve) => {
        reader.onloadend = () => resolve((reader.result as string).split(",")[1] ?? "");
        reader.readAsDataURL(file!);
      });
      fileName = file.name; fileType = file.type;
    }
    mut.mutate({ drawingId, revision, description: description || undefined, fileData, fileName, fileType });
  };

  return (
    <Dialog open={true} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><GitBranch className="h-4 w-4" /> Add Revision to {drawingNumber}</DialogTitle>
        <DialogDescription>Current: Rev {currentRevision} → New: Rev {revision}. Previous revision is preserved in history.</DialogDescription></DialogHeader>
        <div className="space-y-3 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label className="text-xs">New Revision</Label><Input value={revision} onChange={(e) => setRevision(e.target.value)} className="h-9 text-sm font-mono" /><p className="text-[9px] text-muted-foreground">Auto-suggested — override if needed</p></div>
            <div className="space-y-1.5"><Label className="text-xs">Previous Revision</Label><div className="h-9 flex items-center px-3 rounded border text-sm font-mono text-muted-foreground">{currentRevision}</div></div>
          </div>
          <div className="space-y-1.5"><Label className="text-xs">Description (what changed?)</Label><Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="e.g. Updated reinforcement layout per consultant comment" className="text-sm" /></div>
          <div className="space-y-1.5"><Label className="text-xs">New File (image or PDF)</Label>
            {!file ? (
              <label className="flex items-center justify-center gap-2 rounded-md border border-dashed h-14 cursor-pointer hover:bg-muted/30 text-xs text-muted-foreground"><Upload className="h-3.5 w-3.5" /> Select file
                <input ref={fileInputRef} type="file" accept="image/*,application/pdf" onChange={(e) => { const f = e.target.files?.[0]; if (f) setFile(f); }} className="hidden" />
              </label>
            ) : (
              <div className="flex items-center gap-2 rounded-md border p-2 text-xs"><FileImage className="h-4 w-4 text-primary" /><span className="flex-1 truncate">{file.name}</span><button onClick={() => setFile(null)} className="text-muted-foreground hover:text-destructive">✕</button></div>
            )}
          </div>
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={handleSubmit} disabled={mut.isPending}>{mut.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />} Add Revision</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
