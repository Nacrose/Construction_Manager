"use client";

import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc-client";
import { DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, Upload } from "lucide-react";
import { toast } from "sonner";

export function CreatePunchDialog({ projectId, onDone }: { projectId: string; onDone: () => void }) {
  const [number, setNumber] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [category, setCategory] = useState("");
  const [severity, setSeverity] = useState("minor");
  const [assignedTo, setAssignedTo] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const createMut = trpc.punchList.create.useMutation({ onSuccess: () => { toast.success("Punch item created"); onDone(); }, onError: (e) => toast.error(e.message) });

  const handleSubmit = async () => {
    if (!number || !title || !description) { toast.error("Number, title, and description required"); return; }
    let photoData: string | undefined, photoName: string | undefined, photoType: string | undefined;
    if (file) {
      const r = new FileReader();
      photoData = await new Promise<string>(res => { r.onloadend = () => res((r.result as string).split(",")[1] ?? ""); r.readAsDataURL(file!); });
      photoName = file.name; photoType = file.type;
    }
    createMut.mutate({ projectId, number, title, description, location: location || undefined, category: category || undefined, severity: severity as any, assignedTo: assignedTo || undefined, photoData, photoName, photoType });
  };

  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader><DialogTitle>Add Punch Item</DialogTitle><DialogDescription>Log a defect or snag item for resolution.</DialogDescription></DialogHeader>
      <div className="space-y-3 py-2">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5"><Label className="text-xs">Number</Label><Input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="PL-001" className="h-9 text-sm font-mono" /></div>
          <div className="space-y-1.5"><Label className="text-xs">Severity</Label>
            <Select value={severity} onValueChange={setSeverity}><SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger><SelectContent>
              <SelectItem value="minor">Minor</SelectItem><SelectItem value="major">Major</SelectItem><SelectItem value="critical">Critical</SelectItem>
            </SelectContent></Select>
          </div>
        </div>
        <div className="space-y-1.5"><Label className="text-xs">Title</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Crack in column at Grid A-3" className="h-9 text-sm" /></div>
        <div className="space-y-1.5"><Label className="text-xs">Description</Label><Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="text-sm" /></div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5"><Label className="text-xs">Location</Label><Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Grid A-3, 0+250" className="h-9 text-sm" /></div>
          <div className="space-y-1.5"><Label className="text-xs">Assigned To</Label><Input value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} placeholder="Er. Ram" className="h-9 text-sm" /></div>
        </div>
        <div className="space-y-1.5"><Label className="text-xs">Photo Evidence (optional)</Label>
          {!file ? (<label className="flex items-center justify-center gap-2 rounded-md border border-dashed h-12 cursor-pointer hover:bg-muted/30 text-xs text-muted-foreground"><Upload className="h-3.5 w-3.5" /> Select photo<input ref={fileRef} type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) setFile(f); }} className="hidden" /></label>)
          : (<div className="flex items-center gap-2 rounded-md border p-2 text-xs"><span className="flex-1 truncate">{file.name}</span><button onClick={() => setFile(null)} className="text-muted-foreground hover:text-destructive">✕</button></div>)}
        </div>
      </div>
      <DialogFooter><Button variant="outline" onClick={onDone}>Cancel</Button><Button onClick={handleSubmit} disabled={createMut.isPending}>{createMut.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />} Create</Button></DialogFooter>
    </DialogContent>
  );
}
