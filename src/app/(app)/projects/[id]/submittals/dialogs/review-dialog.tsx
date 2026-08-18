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
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Review {item.number}</DialogTitle><DialogDescription>{item.title}</DialogDescription></DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5"><Label className="text-xs">Decision</Label>
            <Select value={status} onValueChange={(v: any) => setStatus(v)}><SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger><SelectContent>
              <SelectItem value="approved">✓ Approved</SelectItem><SelectItem value="rejected">✕ Rejected</SelectItem><SelectItem value="revise_resubmit">↻ Revise & Resubmit</SelectItem>
            </SelectContent></Select>
          </div>
          <div className="space-y-1.5"><Label className="text-xs">Review Comments</Label><Textarea value={comments} onChange={(e) => setComments(e.target.value)} rows={3} placeholder="Approval notes or rejection reasons..." className="text-sm" /></div>
          <div className="space-y-1.5"><Label className="text-xs">Reviewed By</Label><Input value={reviewedBy} onChange={(e) => setReviewedBy(e.target.value)} placeholder="Reviewer name" className="h-9 text-sm" /></div>
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={() => reviewMut.mutate({ id: item.id, status, reviewComments: comments || undefined, reviewedBy: reviewedBy || undefined })} disabled={reviewMut.isPending}>{reviewMut.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />} Save Review</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
