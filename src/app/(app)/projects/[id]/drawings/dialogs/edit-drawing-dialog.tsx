"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc-client";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Pencil } from "lucide-react";
import { toast } from "sonner";

export function EditDrawingDialog({ drawing, projectId, onClose, onDone }: {
  drawing: { id: string; title: string; discipline: string | null; status: string; scaleValue?: number | null; scaleUnit?: string | null };
  projectId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [title, setTitle] = useState(drawing.title);
  const [discipline, setDiscipline] = useState(drawing.discipline ?? "none");
  const [status, setStatus] = useState(drawing.status);
  const [scaleValue, setScaleValue] = useState(drawing.scaleValue?.toString() ?? "");
  const [scaleUnit, setScaleUnit] = useState(drawing.scaleUnit ?? "m");

  const utils = trpc.useUtils();
  const mut = trpc.document.updateDrawing.useMutation({
    onSuccess: () => { toast.success("Drawing updated"); onDone(); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open={true} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Pencil className="h-4 w-4" /> Edit Drawing</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} className="h-9 text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Discipline</Label>
            <Select value={discipline} onValueChange={setDiscipline}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                <SelectItem value="civil">Civil</SelectItem>
                <SelectItem value="structural">Structural</SelectItem>
                <SelectItem value="electrical">Electrical</SelectItem>
                <SelectItem value="mechanical">Mechanical</SelectItem>
                <SelectItem value="architectural">Architectural</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="superseded">Superseded</SelectItem>
                <SelectItem value="void">Void</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Drawing Scale (for measurements)</Label>
            <div className="flex gap-2">
              <Input
                type="number"
                value={scaleValue}
                onChange={(e) => setScaleValue(e.target.value)}
                placeholder="e.g. 100"
                className="h-9 text-sm flex-1"
              />
              <Select value={scaleUnit} onValueChange={setScaleUnit}>
                <SelectTrigger className="h-9 w-20 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="m">m</SelectItem>
                  <SelectItem value="mm">mm</SelectItem>
                  <SelectItem value="ft">ft</SelectItem>
                  <SelectItem value="in">in</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className="text-[9px] text-muted-foreground">e.g. 100 for 1:100 scale. Measurements will display in real units.</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => mut.mutate({
              itemId: drawing.id, title,
              discipline: discipline === "none" ? null : discipline,
              status,
              scaleValue: scaleValue ? Number(scaleValue) : null,
              scaleUnit,
            })}
            disabled={mut.isPending || !title}
          >
            {mut.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />} Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
