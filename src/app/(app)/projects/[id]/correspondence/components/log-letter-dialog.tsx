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
    <DialogContent className="sm:max-w-4xl w-[92vw] aspect-[16/10] max-h-[90vh] p-0 overflow-hidden font-mono bg-card border border-border text-foreground shadow-2xl rounded-2xl flex flex-col">
      <DialogHeader className="px-6 py-3.5 border-b border-border bg-muted/20 shrink-0">
        <DialogTitle className="text-base font-bold text-primary">Log Letter (दर्ता / चलानी)</DialogTitle>
        <DialogDescription className="text-xs text-muted-foreground">Log a formal incoming/outgoing site letter with full audit tracking.</DialogDescription>
      </DialogHeader>

      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 text-xs">
        {!projectId && (
          <div className="space-y-1.5 p-2.5 rounded-xl bg-info/10 border border-info/20">
            <Label className="text-xs font-semibold text-info/80">Target Project (आयोजना) *</Label>
            <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
              <SelectTrigger className="h-9 text-xs bg-background border-border text-foreground">
                <SelectValue placeholder="Select target project..." />
              </SelectTrigger>
              <SelectContent className="bg-card border-border text-foreground text-xs">
                {projects.map((p: any) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} ({p.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Left Column: Direction, Ref, Subject, Parties */}
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Direction</Label>
                <Select value={direction} onValueChange={(v: any) => setDirection(v)}>
                  <SelectTrigger className="h-9 text-xs bg-background border-border"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-card border-border text-xs">
                    <SelectItem value="incoming"><ArrowDownLeft className="inline h-3 w-3 mr-1" /> Incoming</SelectItem>
                    <SelectItem value="outgoing"><ArrowUpRight className="inline h-3 w-3 mr-1" /> Outgoing</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Their Ref (letter no.)</Label>
                <Input value={theirRef} onChange={(e) => setTheirRef(e.target.value)} placeholder="e.g. CL/2026/045" className="h-9 text-xs font-mono bg-background border-border" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Subject *</Label>
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Approval of revised concrete mix design" className="h-9 text-xs bg-background border-border" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">From (Party)</Label>
                <Select value={fromParty} onValueChange={setFromParty}>
                  <SelectTrigger className="h-9 text-xs bg-background border-border"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-card border-border text-xs">{PARTIES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                </Select>
                <Input value={fromName} onChange={(e) => setFromName(e.target.value)} placeholder="Sender person name" className="h-8 text-xs bg-background border-border" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">To (Party)</Label>
                <Select value={toParty} onValueChange={setToParty}>
                  <SelectTrigger className="h-9 text-xs bg-background border-border"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-card border-border text-xs">{PARTIES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                </Select>
                <Input value={toName} onChange={(e) => setToName(e.target.value)} placeholder="Recipient person name" className="h-8 text-xs bg-background border-border" />
              </div>
            </div>
          </div>

          {/* Right Column: Category, Actionable, Attachments */}
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Category</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger className="h-9 text-xs bg-background border-border"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-card border-border text-xs">{CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Letter Type</Label>
                <Select value={letterType} onValueChange={(v: any) => setLetterType(v)}>
                  <SelectTrigger className="h-9 text-xs bg-background border-border"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-card border-border text-xs">
                    <SelectItem value="informative">ℹ Informative</SelectItem>
                    <SelectItem value="actionable">⚡ Actionable</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {letterType === "actionable" && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 space-y-2.5">
                <p className="text-[10px] font-bold text-amber-500 uppercase tracking-wider">Action Required</p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-[11px]">Action Assigned To</Label>
                    <Input value={actionAssignedTo} onChange={(e) => setActionAssignedTo(e.target.value)} placeholder="e.g. Er. Ram Sharma" className="h-8 text-xs bg-background border-border" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px]">Reply Drafted By</Label>
                    <Input value={replyDraftedBy} onChange={(e) => setReplyDraftedBy(e.target.value)} placeholder="e.g. Er. Sita Thapa" className="h-8 text-xs bg-background border-border" />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">Reply Due Date</Label>
                  <Input type="date" value={replyDueDate} onChange={(e) => setReplyDueDate(e.target.value)} className="h-8 text-xs font-mono bg-background border-border" />
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs">Letter Scan / Attachment (max 10MB)</Label>
              {!file ? (
                <label className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-border h-14 cursor-pointer hover:bg-muted/40 text-xs text-muted-foreground transition-colors">
                  <Upload className="h-4 w-4 text-primary" /> Select scanned PDF / image
                  <input ref={fileInputRef} type="file" accept="image/*,application/pdf" onChange={handleFile} className="hidden" />
                </label>
              ) : (
                <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/20 p-2 text-xs">
                  <FileText className="h-4 w-4 text-primary" />
                  <span className="flex-1 truncate font-mono">{file.name}</span>
                  <button onClick={() => setFile(null)} className="text-muted-foreground hover:text-destructive">✕</button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <DialogFooter className="px-6 py-3 border-t border-border bg-muted/20 shrink-0">
        <Button variant="outline" size="sm" onClick={onDone} className="h-8 text-xs border-border">Cancel</Button>
        <Button size="sm" onClick={handleSubmit} disabled={createMut.isPending} className="h-8 text-xs font-bold font-mono bg-primary text-primary-foreground hover:bg-primary/90">
          {createMut.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />} Log Letter
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
