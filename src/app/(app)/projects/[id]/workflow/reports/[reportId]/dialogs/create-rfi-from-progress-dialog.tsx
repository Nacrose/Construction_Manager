"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc-client";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, FileQuestion } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

const DISCIPLINES = [
  { id: "civil", label: "Civil" },
  { id: "structural", label: "Structural" },
  { id: "electrical", label: "Electrical" },
  { id: "mechanical", label: "Mechanical" },
  { id: "architectural", label: "Architectural" },
] as const;

export function CreateRfiFromProgressDialog({
  projectId,
  progress,
  onClose,
  onRfiCreated,
}: {
  projectId: string;
  progress: {
    boqCode?: string;
    boqDesc?: string;
    location?: string;
    taskDescription?: string;
    rfiId?: string | null;
    rfiNumber?: string | null;
  };
  onClose: () => void;
  onRfiCreated: (rfiId: string, rfiNumber: string) => void;
}) {
  const [subject, setSubject] = useState(progress.boqDesc || "");
  const [description, setDescription] = useState(progress.taskDescription || "");
  const [location, setLocation] = useState(progress.location || "");
  const [priority, setPriority] = useState<"low" | "normal" | "high" | "urgent">("normal");
  const [discipline, setDiscipline] = useState<string>("none");

  const utils = trpc.useUtils();

  const dateStr = format(new Date(), "yyyyMMdd");
  const { data: countData } = trpc.workflow.rfi.countAll.useQuery({ projectId, dateStr });
  const dailyCount = countData?.count ?? 0;
  const nextNumber = `RFI-${dateStr}-${String(dailyCount + 1).padStart(3, "0")}`;

  const mutation = trpc.workflow.rfi.create.useMutation({
    onSuccess: (res) => {
      toast.success("RFI created successfully");
      utils.workflow.rfi.list.invalidate({ projectId });
      utils.workflow.rfi.countAll.invalidate({ projectId });
      onRfiCreated(res.rfi.id, res.rfi.number);
    },
    onError: (err) => {
      toast.error(err.message || "Failed to create RFI");
    },
  });

  const handleSubmit = () => {
    if (!subject.trim()) {
      toast.error("Subject is required");
      return;
    }
    mutation.mutate({
      projectId,
      number: nextNumber,
      subject: subject.trim(),
      description: description.trim() || undefined,
      location: location.trim() || undefined,
      priority,
      discipline: discipline !== "none" ? (discipline as any) : undefined,
    });
  };

  return (
    <Dialog open={true} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileQuestion className="h-4 w-4" />
            Create RFI from Daily Log
          </DialogTitle>
          <DialogDescription>
            RFI will be pre-filled with data from the progress row.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs">RFI Number</Label>
            <Input value={nextNumber} disabled className="h-9 text-sm font-mono bg-muted" />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Subject *</Label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g. Clarify reinforcement spacing in grid A-3"
              className="h-9 text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Describe the question or issue..."
              className="text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Location</Label>
            <Input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. Km 0+500"
              className="h-9 text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Priority</Label>
              <Select value={priority} onValueChange={(v: any) => setPriority(v)}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Discipline</Label>
              <Select value={discipline} onValueChange={setDiscipline}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">General</SelectItem>
                  {DISCIPLINES.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={mutation.isPending || !subject.trim()}
          >
            {mutation.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
            Create RFI
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
