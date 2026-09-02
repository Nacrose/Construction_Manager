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
    <DialogContent className="sm:max-w-[560px] w-full p-0 gap-0 bg-card border border-[var(--border)] text-foreground rounded-2xl shadow-2xl overflow-hidden font-sans">
      <div className="px-6 py-4 border-b border-[var(--input)] bg-[#f8fbfe] flex items-center justify-between">
        <div>
          <DialogTitle className="text-base font-bold text-foreground">New Technical Submittal (नयाँ पेश्की दर्ता)</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground mt-0.5">Submit shop drawings, material samples, or product data for approval.</DialogDescription>
        </div>
      </div>
      <div className="p-6 space-y-3.5 text-xs bg-card">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5"><Label className="text-[11px] font-semibold text-foreground/80">Submittal Number *</Label><Input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="SUB-001" className="h-9 text-xs font-mono bg-card border-[var(--border)] text-foreground focus:border-[var(--primary)]" /></div>
          <div className="space-y-1.5"><Label className="text-[11px] font-semibold text-foreground/80">Type *</Label>
            <Select value={type} onValueChange={setType}><SelectTrigger className="h-9 text-xs bg-card border-[var(--border)] text-foreground focus:border-[var(--primary)]"><SelectValue /></SelectTrigger><SelectContent className="bg-card border-[var(--border)] text-foreground text-xs shadow-xl rounded-xl">
              <SelectItem value="shop_drawing">Shop Drawing</SelectItem><SelectItem value="material_sample">Material Sample</SelectItem>
              <SelectItem value="product_data">Product Data</SelectItem><SelectItem value="technical_spec">Technical Spec</SelectItem><SelectItem value="other">Other</SelectItem>
            </SelectContent></Select>
          </div>
        </div>
        <div className="space-y-1.5"><Label className="text-[11px] font-semibold text-foreground/80">Title *</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Reinforcement shop drawing for footing" className="h-9 text-xs bg-card border-[var(--border)] text-foreground focus:border-[var(--primary)]" /></div>
        <div className="space-y-1.5"><Label className="text-[11px] font-semibold text-foreground/80">Description</Label><Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="text-xs bg-card border-[var(--border)] text-foreground focus:border-[var(--primary)]" /></div>
        <div className="space-y-1.5"><Label className="text-[11px] font-semibold text-foreground/80">Category</Label>
          <Select value={category} onValueChange={setCategory}><SelectTrigger className="h-9 text-xs bg-card border-[var(--border)] text-foreground focus:border-[var(--primary)]"><SelectValue placeholder="Select Category" /></SelectTrigger><SelectContent className="bg-card border-[var(--border)] text-foreground text-xs shadow-xl rounded-xl">
            <SelectItem value="civil">Civil</SelectItem><SelectItem value="structural">Structural</SelectItem>
            <SelectItem value="electrical">Electrical</SelectItem><SelectItem value="mechanical">Mechanical</SelectItem><SelectItem value="architectural">Architectural</SelectItem>
          </SelectContent></Select>
        </div>
        <div className="space-y-1.5"><Label className="text-[11px] font-semibold text-foreground/80">File Attachment (Optional)</Label>
          {!file ? (<label className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--border)] bg-muted/60 h-14 cursor-pointer hover:bg-info/10 text-xs text-muted-foreground"><Upload className="h-3.5 w-3.5 text-[var(--primary)]" /> Select attachment document<input ref={fileRef} type="file" accept="image/*,application/pdf" onChange={(e) => { const f = e.target.files?.[0]; if (f) setFile(f); }} className="hidden" /></label>)
          : (<div className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-muted/60 p-2 text-xs"><FileText className="h-4 w-4 text-[var(--primary)]" /><span className="flex-1 truncate text-foreground font-medium">{file.name}</span><button onClick={() => setFile(null)} className="text-muted-foreground/80 hover:text-rose-600">✕</button></div>)}
        </div>

        <div className="flex justify-end gap-2.5 pt-3 border-t border-[var(--input)]">
          <Button variant="outline" size="sm" onClick={onDone} className="h-8 text-xs border-[var(--border)] text-muted-foreground hover:bg-muted font-mono">Cancel</Button>
          <Button size="sm" onClick={handleSubmit} disabled={createMut.isPending} className="amber-cta-btn h-8 text-xs font-bold text-white shadow-sm font-mono">
            {createMut.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />} Create Submittal (दर्ता गर्नुहोस्)
          </Button>
        </div>
      </div>
    </DialogContent>
  );
}
