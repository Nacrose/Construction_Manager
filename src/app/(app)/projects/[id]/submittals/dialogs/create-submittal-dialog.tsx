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
import { Loader2, Upload, FileText } from "lucide-react";
import { toast } from "sonner";

export function CreateSubmittalDialog({ projectId, onDone }: { projectId: string; onDone: () => void }) {
  const [number, setNumber] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState("shop_drawing");
  const [category, setCategory] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const createMut = trpc.submittal.create.useMutation({ onSuccess: () => { toast.success("Submittal created"); onDone(); }, onError: (e) => toast.error(e.message) });

  const handleSubmit = async () => {
    if (!number || !title) { toast.error("Number and title required"); return; }
    let fileData: string | undefined, fileName: string | undefined, fileType: string | undefined;
    if (file) {
      const r = new FileReader();
      fileData = await new Promise<string>(res => { r.onloadend = () => res((r.result as string).split(",")[1] ?? ""); r.readAsDataURL(file!); });
      fileName = file.name; fileType = file.type;
    }
    createMut.mutate({ projectId, number, title, description: description || undefined, type: type as any, category: category || undefined, fileData, fileName, fileType });
  };

  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader><DialogTitle>New Submittal</DialogTitle><DialogDescription>Submit shop drawings, material samples, or product data for consultant approval.</DialogDescription></DialogHeader>
      <div className="space-y-3 py-2">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5"><Label className="text-xs">Number</Label><Input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="SUB-001" className="h-9 text-sm font-mono" /></div>
          <div className="space-y-1.5"><Label className="text-xs">Type</Label>
            <Select value={type} onValueChange={setType}><SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger><SelectContent>
              <SelectItem value="shop_drawing">Shop Drawing</SelectItem><SelectItem value="material_sample">Material Sample</SelectItem>
              <SelectItem value="product_data">Product Data</SelectItem><SelectItem value="technical_spec">Technical Spec</SelectItem><SelectItem value="other">Other</SelectItem>
            </SelectContent></Select>
          </div>
        </div>
        <div className="space-y-1.5"><Label className="text-xs">Title</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Reinforcement shop drawing for footing" className="h-9 text-sm" /></div>
        <div className="space-y-1.5"><Label className="text-xs">Description</Label><Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="text-sm" /></div>
        <div className="space-y-1.5"><Label className="text-xs">Category</Label>
          <Select value={category} onValueChange={setCategory}><SelectTrigger className="h-9 text-sm"><SelectValue placeholder="—" /></SelectTrigger><SelectContent>
            <SelectItem value="civil">Civil</SelectItem><SelectItem value="structural">Structural</SelectItem>
            <SelectItem value="electrical">Electrical</SelectItem><SelectItem value="mechanical">Mechanical</SelectItem><SelectItem value="architectural">Architectural</SelectItem>
          </SelectContent></Select>
        </div>
        <div className="space-y-1.5"><Label className="text-xs">File (optional)</Label>
          {!file ? (<label className="flex items-center justify-center gap-2 rounded-md border border-dashed h-14 cursor-pointer hover:bg-muted/30 text-xs text-muted-foreground"><Upload className="h-3.5 w-3.5" /> Select file<input ref={fileRef} type="file" accept="image/*,application/pdf" onChange={(e) => { const f = e.target.files?.[0]; if (f) setFile(f); }} className="hidden" /></label>)
          : (<div className="flex items-center gap-2 rounded-md border p-2 text-xs"><FileText className="h-4 w-4 text-primary" /><span className="flex-1 truncate">{file.name}</span><button onClick={() => setFile(null)} className="text-muted-foreground hover:text-destructive">✕</button></div>)}
        </div>
      </div>
      <DialogFooter><Button variant="outline" onClick={onDone}>Cancel</Button><Button onClick={handleSubmit} disabled={createMut.isPending}>{createMut.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />} Create</Button></DialogFooter>
    </DialogContent>
  );
}
