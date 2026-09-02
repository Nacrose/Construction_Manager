"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc-client";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

export function ReviewDialog({ item, projectId, onClose, onDone }: { item: { id: string; number: string; title: string }; projectId: string; onClose: () => void; onDone: () => void }) {
  const [status, setStatus] = useState<"approved" | "rejected" | "revise_resubmit">("approved");
  const [comments, setComments] = useState("");
  const [reviewedBy, setReviewedBy] = useState("");
  const reviewMut = trpc.submittal.review.useMutation({ onSuccess: () => { toast.success("Review saved"); onDone(); }, onError: (e) => toast.error(e.message) });

  return (
    <Dialog open={true} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-[500px] w-full p-0 gap-0 bg-card border border-[var(--border)] text-foreground rounded-2xl shadow-2xl overflow-hidden font-sans">
        <div className="px-6 py-4 border-b border-[var(--input)] bg-[#f8fbfe] flex items-center justify-between">
          <div>
            <DialogTitle className="text-base font-bold text-foreground font-mono">Review Submittal — {item.number}</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground mt-0.5">{item.title}</DialogDescription>
          </div>
        </div>
        <div className="p-6 space-y-3.5 text-xs bg-card">
          <div className="space-y-1.5"><Label className="text-[11px] font-semibold text-foreground/80">Decision *</Label>
            <Select value={status} onValueChange={(v: any) => setStatus(v)}><SelectTrigger className="h-9 text-xs bg-card border-[var(--border)] text-foreground focus:border-[var(--primary)]"><SelectValue /></SelectTrigger><SelectContent className="bg-card border-[var(--border)] text-foreground text-xs shadow-xl rounded-xl">
              <SelectItem value="approved">✓ Approved</SelectItem><SelectItem value="rejected">✕ Rejected</SelectItem><SelectItem value="revise_resubmit">↻ Revise & Resubmit</SelectItem>
            </SelectContent></Select>
          </div>
          <div className="space-y-1.5"><Label className="text-[11px] font-semibold text-foreground/80">Review Comments</Label><Textarea value={comments} onChange={(e) => setComments(e.target.value)} rows={3} placeholder="Approval notes or rejection reasons..." className="text-xs bg-card border-[var(--border)] text-foreground focus:border-[var(--primary)]" /></div>
          <div className="space-y-1.5"><Label className="text-[11px] font-semibold text-foreground/80">Reviewed By</Label><Input value={reviewedBy} onChange={(e) => setReviewedBy(e.target.value)} placeholder="Reviewer name" className="h-9 text-xs bg-card border-[var(--border)] text-foreground font-mono focus:border-[var(--primary)]" /></div>

          <div className="flex justify-end gap-2.5 pt-3 border-t border-[var(--input)]">
            <Button variant="outline" size="sm" onClick={onClose} className="h-8 text-xs border-[var(--border)] text-muted-foreground hover:bg-muted font-mono">Cancel</Button>
            <Button size="sm" onClick={() => reviewMut.mutate({ id: item.id, status, reviewComments: comments || undefined, reviewedBy: reviewedBy || undefined })} disabled={reviewMut.isPending} className="amber-cta-btn h-8 text-xs font-bold text-white shadow-sm font-mono">
              {reviewMut.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />} Save Review (स्वीकृति सुरक्षित)
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
