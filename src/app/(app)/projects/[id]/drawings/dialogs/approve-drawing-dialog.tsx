"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc-client";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

export function ApproveDrawingDialog({ drawingId, drawingNumber, projectId, onClose, onDone }: {
  drawingId: string; drawingNumber: string; projectId: string; onClose: () => void; onDone: () => void;
}) {
  const [status, setStatus] = useState<"approved_internal" | "approved_consultant" | "approved_client" | "rejected">("approved_internal");
  const [notes, setNotes] = useState("");
  const mut = trpc.document.approveDrawing.useMutation({
    onSuccess: () => { toast.success("Drawing approval updated"); onDone(); },
    onError: (e) => toast.error(e.message),
  });
  return (
    <Dialog open={true} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4" /> Approve {drawingNumber}</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5"><Label className="text-xs">Approval Type</Label>
            <Select value={status} onValueChange={(v: any) => setStatus(v)}><SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger><SelectContent>
              <SelectItem value="approved_internal">✓ Approved (Internal)</SelectItem><SelectItem value="approved_consultant">✓ Approved (Consultant)</SelectItem>
              <SelectItem value="approved_client">✓ Approved (Client)</SelectItem><SelectItem value="rejected">✕ Rejected</SelectItem>
            </SelectContent></Select>
          </div>
          <div className="space-y-1.5"><Label className="text-xs">Notes</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Approval comments or rejection reason..." className="text-sm" /></div>
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={() => mut.mutate({ drawingId, approvalStatus: status, notes: notes || undefined })} disabled={mut.isPending}>{mut.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />} Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
