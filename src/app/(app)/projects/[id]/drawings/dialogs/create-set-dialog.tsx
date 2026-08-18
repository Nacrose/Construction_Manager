"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc-client";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, FolderPlus } from "lucide-react";
import { toast } from "sonner";

export function CreateSetDialog({ projectId, onClose, onDone }: {
  projectId: string; onClose: () => void; onDone: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const mut = trpc.document.createSet.useMutation({
    onSuccess: () => { toast.success("Drawing set created"); onDone(); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open={true} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><FolderPlus className="h-4 w-4" /> New Drawing Set</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Set Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Architectural, Structural" className="h-9 text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Description (optional)</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="text-sm" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mut.mutate({ projectId, name, description: description || undefined })} disabled={mut.isPending || !name}>
            {mut.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />} Create Set
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
