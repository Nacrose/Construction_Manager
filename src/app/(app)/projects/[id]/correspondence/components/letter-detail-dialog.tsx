"use client";

import { useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ArrowDownLeft, ArrowUpRight, Upload, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc-client";
import { CATEGORIES, CATEGORY_COLORS } from "./constants";

export function LetterDetailDialog({ letterId, projectId, onClose, onUpdated }: {
  letterId: string; projectId?: string; onClose: () => void; onUpdated?: () => void;
}) {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.correspondence.get.useQuery({ id: letterId });
  const letter = data?.letter;

  const [replyStatus, setReplyStatus] = useState<string>("");
  const [replyOurRef, setReplyOurRef] = useState("");
  const [replyNotes, setReplyNotes] = useState("");
  const [replyFile, setReplyFile] = useState<File | null>(null);

  const updateMut = trpc.correspondence.updateReply.useMutation({
    onSuccess: () => {
      toast.success("Reply status updated");
      utils.correspondence.get.invalidate({ id: letterId });
      utils.correspondence.list.invalidate();
      onUpdated?.();
    },
    onError: (e) => toast.error(e.message),
  });

  if (letter && !replyStatus) {
    setReplyStatus(letter.replyStatus);
    setReplyOurRef(letter.replyOurRef ?? "");
    setReplyNotes(letter.replyNotes ?? "");
  }

  const handleReplyFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) setReplyFile(f);
  };

  const handleSaveReply = async () => {
    let replyFileData: string | undefined, replyFileName: string | undefined, replyFileType: string | undefined;
    if (replyFile) {
      const reader = new FileReader();
      replyFileData = await new Promise<string>((resolve) => {
        reader.onloadend = () => resolve((reader.result as string).split(",")[1] ?? "");
        reader.readAsDataURL(replyFile!);
      });
      replyFileName = replyFile.name;
      replyFileType = replyFile.type;
    }
    updateMut.mutate({
      id: letterId,
      replyStatus: replyStatus as any,
      replyOurRef: replyOurRef || undefined,
      replyNotes: replyNotes || undefined,
      replyFileData, replyFileName, replyFileType,
    });
  };

  const isOverdue = letter?.replyDueDate && new Date(letter.replyDueDate) < new Date() && (letter.replyStatus === "not_started" || letter.replyStatus === "in_progress");

  let history: any[] = [];
  if (letter?.statusHistory) {
    try { history = JSON.parse(letter.statusHistory); } catch {}
  }

  return (
    <Dialog open={true} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-4xl w-[92vw] aspect-[16/10] max-h-[90vh] p-0 overflow-hidden font-mono bg-card border border-border text-foreground shadow-2xl rounded-2xl flex flex-col">
        <DialogHeader className="px-6 py-3.5 border-b border-border bg-muted/20 shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base font-bold text-primary">
            {letter?.direction === "incoming" ? <ArrowDownLeft className="h-4 w-4 text-info" /> : <ArrowUpRight className="h-4 w-4 text-success" />}
            {letter?.ourRef ?? "Loading..."}
          </DialogTitle>
          {letter && <DialogDescription className="text-xs text-muted-foreground">{letter.subject}</DialogDescription>}
        </DialogHeader>

        {isLoading ? (
          <div className="p-6"><Skeleton className="h-64" /></div>
        ) : letter ? (
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 text-xs">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Left Column: Metadata & History */}
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2 text-xs p-3 rounded-xl border border-border bg-muted/30">
                  <div><span className="text-muted-foreground">Their Ref:</span> <span className="font-mono font-bold text-primary">{letter.theirRef ?? "—"}</span></div>
                  <div><span className="text-muted-foreground">Date:</span> {format(new Date(letter.date), "dd MMM yyyy")}</div>
                  <div><span className="text-muted-foreground">From:</span> {letter.fromName ?? ""} ({letter.fromParty ?? "—"})</div>
                  <div><span className="text-muted-foreground">To:</span> {letter.toName ?? ""} ({letter.toParty ?? "—"})</div>
                  <div><span className="text-muted-foreground">Category:</span>
                    <span className={cn("ml-1 rounded px-1.5 py-0.5 text-[9px] uppercase font-bold", CATEGORY_COLORS[letter.category])}>
                      {CATEGORIES.find(c => c.value === letter.category)?.label ?? letter.category}
                    </span>
                  </div>
                  <div><span className="text-muted-foreground">Type:</span>
                    {letter.letterType === "actionable" ? <span className="text-amber-500 font-bold ml-1">⚡ Actionable</span> : <span className="text-muted-foreground ml-1">ℹ Informative</span>}
                  </div>
                </div>

                {letter.letterType === "actionable" && (
                  <div className="rounded-xl border border-border bg-muted/30 p-3 space-y-2 text-xs">
                    <div className="grid grid-cols-2 gap-2">
                      <div><span className="text-muted-foreground">Action by:</span> <strong>{letter.actionAssignedTo ?? "—"}</strong></div>
                      <div><span className="text-muted-foreground">Reply by:</span> <strong>{letter.replyDraftedBy ?? "—"}</strong></div>
                      <div>
                        <span className="text-muted-foreground">Due date:</span>{" "}
                        {letter.replyDueDate ? (
                          <span className={cn("font-bold font-mono", isOverdue ? "text-red-400" : "")}>
                            {format(new Date(letter.replyDueDate), "dd MMM yyyy")}
                            {isOverdue && " ⚠ OVERDUE"}
                          </span>
                        ) : "—"}
                      </div>
                      <div><span className="text-muted-foreground">Sent date:</span> {letter.replySentDate ? format(new Date(letter.replySentDate), "dd MMM yyyy") : "—"}</div>
                    </div>
                  </div>
                )}

                {history.length > 1 && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase mb-1">Status History</p>
                    <div className="space-y-1">
                      {history.map((h, i) => (
                        <div key={i} className="text-[10px] text-muted-foreground flex items-center gap-2">
                          <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                          <span className="font-medium capitalize">{h.status.replace(/_/g, " ")}</span>
                          <span>· {new Date(h.date).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Right Column: Reply Management */}
              <div className="space-y-3">
                {letter.letterType === "actionable" ? (
                  <div className="rounded-xl border border-border bg-muted/30 p-3.5 space-y-3">
                    <p className="text-xs font-bold text-primary uppercase tracking-wider">Reply Management</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Reply Status</Label>
                        <Select value={replyStatus} onValueChange={setReplyStatus}>
                          <SelectTrigger className="h-8 text-xs bg-background border-border"><SelectValue /></SelectTrigger>
                          <SelectContent className="bg-card border-border text-xs">
                            <SelectItem value="not_started">Not Started</SelectItem>
                            <SelectItem value="in_progress">In Progress</SelectItem>
                            <SelectItem value="drafted">Drafted</SelectItem>
                            <SelectItem value="sent">Sent</SelectItem>
                            <SelectItem value="closed">Closed</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Our Reply Ref</Label>
                        <Input value={replyOurRef} onChange={(e) => setReplyOurRef(e.target.value)} placeholder="e.g. COR-2026-0045-R1" className="h-8 text-xs font-mono bg-background border-border" />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Reply Notes</Label>
                      <Textarea value={replyNotes} onChange={(e) => setReplyNotes(e.target.value)} rows={3} placeholder="Summary of reply or action taken..." className="text-xs bg-background border-border resize-none" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Reply Letter Scan (optional)</Label>
                      {!replyFile ? (
                        <label className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-border h-12 cursor-pointer hover:bg-muted/40 text-xs text-muted-foreground transition-colors">
                          <Upload className="h-3.5 w-3.5 text-primary" /> Upload reply letter scan
                          <input type="file" accept="image/*,application/pdf" onChange={handleReplyFile} className="hidden" />
                        </label>
                      ) : (
                        <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/20 p-2 text-xs">
                          <FileText className="h-4 w-4 text-primary" />
                          <span className="flex-1 truncate font-mono">{replyFile.name}</span>
                          <button onClick={() => setReplyFile(null)} className="text-muted-foreground hover:text-destructive">✕</button>
                        </div>
                      )}
                    </div>
                    <Button size="sm" onClick={handleSaveReply} disabled={updateMut.isPending} className="w-full h-8 text-xs font-bold font-mono bg-primary text-primary-foreground hover:bg-primary/90">
                      {updateMut.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />} Save Reply Status
                    </Button>
                  </div>
                ) : (
                  <div className="p-8 rounded-xl border border-dashed border-border text-center text-xs text-muted-foreground">
                    This letter is marked as <strong>Informative</strong>. No formal contractual reply is required.
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <p className="text-center text-sm text-muted-foreground py-8">Letter not found.</p>
        )}

        <div className="px-6 py-3 border-t border-border bg-muted/20 flex justify-end shrink-0">
          <Button variant="outline" size="sm" onClick={onClose} className="h-8 text-xs border-border">Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
