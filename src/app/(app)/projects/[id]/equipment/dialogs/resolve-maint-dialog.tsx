"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc-client";

export function ResolveMaintDialog({ projectId, maintenanceId, onDone }: { projectId: string; maintenanceId: string; onDone: () => void }) {
  const utils = trpc.useUtils();
  const [resolvedNotes, setResolvedNotes] = useState("");
  const [cost, setCost] = useState("");

  const mutation = trpc.equipment.resolveMaintenance.useMutation({
    onSuccess: () => {
      utils.equipment.listMaintenance.invalidate({ projectId });
      utils.equipment.list.invalidate({ projectId });
      toast.success("Breakdown resolved successfully");
      onDone();
    },
    onError: (e) => toast.error(e.message),
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate({
      projectId,
      maintId: maintenanceId,
      resolvedNotes,
      cost: parseFloat(cost) || 0,
    });
  };

  return (
    <DialogContent className="max-w-md" onClick={(e) => e.stopPropagation()}>
      <DialogHeader><DialogTitle>Resolve Breakdown Ticket</DialogTitle></DialogHeader>
      <form onSubmit={onSubmit} className="space-y-3">
        <div className="space-y-1.5"><Label>Actual Repair Cost (NPR) *</Label><Input value={cost} onChange={(e) => setCost(e.target.value)} type="number" required /></div>
        <div className="space-y-1.5"><Label>Resolution Notes / Spares Replaced *</Label><Input value={resolvedNotes} onChange={(e) => setResolvedNotes(e.target.value)} required placeholder="Replaced hydraulic hose, refilled hydraulic fluid." /></div>
        <DialogFooter><Button type="submit" disabled={mutation.isPending}>{mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Complete Repair</Button></DialogFooter>
      </form>
    </DialogContent>
  );
}
