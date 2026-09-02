"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Upload, FileText, Loader2, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc-client";
import { CATEGORIES, PARTIES } from "./constants";

export function LogLetterDialog({ projectId, onDone }: { projectId?: string; onDone: () => void }) {
  const utils = trpc.useUtils();
  const [selectedProjectId, setSelectedProjectId] = useState(projectId || "");
  const [direction, setDirection] = useState<"incoming" | "outgoing">("incoming");
  const [theirRef, setTheirRef] = useState("");
  const [fromParty, setFromParty] = useState("Client");
  const [fromName, setFromName] = useState("");
  const [toParty, setToParty] = useState("Contractor");
  const [toName, setToName] = useState("");
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState("other");
  const [letterType, setLetterType] = useState<"informative" | "actionable">("informative");
  const [actionAssignedTo, setActionAssignedTo] = useState("");
  const [replyDraftedBy, setReplyDraftedBy] = useState("");
  const [replyDueDate, setReplyDueDate] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: projectsData } = trpc.project.list.useQuery(undefined, {
    enabled: !projectId,
  });
  const projects = projectsData?.projects || [];

  const createMut = trpc.correspondence.create.useMutation({
    onSuccess: () => {
      toast.success("Letter logged successfully");
      utils.correspondence.list.invalidate();
      onDone();
    },
    onError: (e) => toast.error(e.message),
  });

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) { toast.error("File too large (max 10MB)"); return; }
    setFile(f);
  };

  const targetProjectId = projectId || selectedProjectId;

  const handleSubmit = async () => {
    if (!targetProjectId) { toast.error("Please select a project"); return; }
    if (!subject) { toast.error("Subject required"); return; }
    let fileData: string | undefined, fileName: string | undefined, fileType: string | undefined;
    if (file) {
      const reader = new FileReader();
      fileData = await new Promise<string>((resolve) => {
        reader.onloadend = () => resolve((reader.result as string).split(",")[1] ?? "");
        reader.readAsDataURL(file!);
      });
      fileName = file.name;
      fileType = file.type;
    }
    createMut.mutate({
      projectId: targetProjectId, direction, theirRef: theirRef || undefined, subject,
      category: category as any, letterType,
      fromParty, fromName: fromName || undefined, toParty, toName: toName || undefined,
      actionAssignedTo: letterType === "actionable" ? (actionAssignedTo || undefined) : undefined,
      replyDraftedBy: letterType === "actionable" ? (replyDraftedBy || undefined) : undefined,
      replyDueDate: letterType === "actionable" && replyDueDate ? new Date(replyDueDate).toISOString() : undefined,
      fileData, fileName, fileType,
    });
  };

  return (
    <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Log Letter (दर्ता / चलानी)</DialogTitle>
        <DialogDescription>Log a formal incoming/outgoing site letter with full audit tracking.</DialogDescription>
      </DialogHeader>
      <div className="space-y-3 py-2">
        {!projectId && (
          <div className="space-y-1.5 p-2.5 rounded-xl bg-info/10 border border-info/20">
            <Label className="text-xs font-semibold text-info/80">Target Project (आयोजना) *</Label>
            <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
              <SelectTrigger className="h-9 text-xs bg-[#f8fbfe] border-[var(--border)] text-foreground">
                <SelectValue placeholder="Select target project..." />
              </SelectTrigger>
              <SelectContent className="bg-card border-[var(--border)] text-foreground text-xs">
                {projects.map((p: any) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} ({p.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Direction</Label>
            <Select value={direction} onValueChange={(v: any) => setDirection(v)}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="incoming"><ArrowDownLeft className="inline h-3 w-3 mr-1" /> Incoming</SelectItem>
                <SelectItem value="outgoing"><ArrowUpRight className="inline h-3 w-3 mr-1" /> Outgoing</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Their Ref (letter no.)</Label>
            <Input value={theirRef} onChange={(e) => setTheirRef(e.target.value)} placeholder="e.g. CL/2026/045" className="h-9 text-sm font-mono" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Subject</Label>
          <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Approval of revised concrete mix design" className="h-9 text-sm" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">From (Party)</Label>
            <Select value={fromParty} onValueChange={setFromParty}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>{PARTIES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
            </Select>
            <Input value={fromName} onChange={(e) => setFromName(e.target.value)} placeholder="Person name" className="h-8 text-xs" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">To (Party)</Label>
            <Select value={toParty} onValueChange={setToParty}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>{PARTIES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
            </Select>
            <Input value={toName} onChange={(e) => setToName(e.target.value)} placeholder="Person name" className="h-8 text-xs" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>{CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Letter Type</Label>
            <Select value={letterType} onValueChange={(v: any) => setLetterType(v)}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="informative">ℹ Informative</SelectItem>
                <SelectItem value="actionable">⚡ Actionable</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {letterType === "actionable" && (
          <div className="rounded-md border border-amber-200 dark:border-amber-900 bg-amber-50/30 dark:bg-amber-950/10 p-3 space-y-3">
            <p className="text-[10px] font-medium text-amber-700 dark:text-amber-400 uppercase">Action Required</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Action Assigned To</Label>
                <Input value={actionAssignedTo} onChange={(e) => setActionAssignedTo(e.target.value)} placeholder="e.g. Er. Ram Sharma" className="h-9 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Reply Drafted By</Label>
                <Input value={replyDraftedBy} onChange={(e) => setReplyDraftedBy(e.target.value)} placeholder="e.g. Er. Sita Thapa" className="h-9 text-sm" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Reply Due Date</Label>
              <Input type="date" value={replyDueDate} onChange={(e) => setReplyDueDate(e.target.value)} className="h-9 text-sm" />
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          <Label className="text-xs">Letter Scan (optional, max 10MB)</Label>
          {!file ? (
            <label className="flex items-center justify-center gap-2 rounded-md border border-dashed h-14 cursor-pointer hover:bg-muted/30 text-xs text-muted-foreground">
              <Upload className="h-3.5 w-3.5" /> Select file
              <input ref={fileInputRef} type="file" accept="image/*,application/pdf" onChange={handleFile} className="hidden" />
            </label>
          ) : (
            <div className="flex items-center gap-2 rounded-md border p-2 text-xs">
              <FileText className="h-4 w-4 text-primary" />
              <span className="flex-1 truncate">{file.name}</span>
              <button onClick={() => setFile(null)} className="text-muted-foreground hover:text-destructive">✕</button>
            </div>
          )}
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onDone}>Cancel</Button>
        <Button onClick={handleSubmit} disabled={createMut.isPending}>
          {createMut.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />} Log Letter
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
