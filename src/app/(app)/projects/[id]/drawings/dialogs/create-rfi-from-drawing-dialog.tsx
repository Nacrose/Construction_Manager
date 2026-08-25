"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc-client";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, FileQuestion } from "lucide-react";
import { toast } from "sonner";

export function CreateRfiFromDrawingDialog({ drawingId, drawingNumber, projectId, pinX, pinY, onClose, onDone }: {
  drawingId: string; drawingNumber: string; projectId: string; pinX?: number; pinY?: number; onClose: () => void; onDone: () => void;
}) {
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<"low" | "normal" | "high" | "urgent">("normal");
  const mut = trpc.document.createRfiFromDrawing.useMutation({ onSuccess: () => onDone(), onError: (e) => toast.error(e.message) });
  return (
    <Dialog open={true} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><FileQuestion className="h-4 w-4" /> Create RFI from {drawingNumber}</DialogTitle><DialogDescription>The drawing will be automatically linked to this RFI.</DialogDescription></DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5"><Label className="text-xs">Subject</Label><Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Clarify reinforcement spacing in grid A-3" className="h-9 text-sm" /></div>
          <div className="space-y-1.5"><Label className="text-xs">Description</Label><Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="Describe the question or issue..." className="text-sm" /></div>
          <div className="space-y-1.5"><Label className="text-xs">Priority</Label>
            <Select value={priority} onValueChange={(v: any) => setPriority(v)}><SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger><SelectContent>
              <SelectItem value="low">Low</SelectItem><SelectItem value="normal">Normal</SelectItem><SelectItem value="high">High</SelectItem><SelectItem value="urgent">Urgent</SelectItem>
            </SelectContent></Select>
          </div>
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={() => mut.mutate({ projectId, drawingId, subject, description: description || undefined, priority, pinX: pinX ?? undefined, pinY: pinY ?? undefined })} disabled={mut.isPending || !subject}>{mut.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />} Create RFI</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
