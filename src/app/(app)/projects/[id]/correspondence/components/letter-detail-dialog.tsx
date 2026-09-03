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
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {letter?.direction === "incoming" ? <ArrowDownLeft className="h-4 w-4 text-info" /> : <ArrowUpRight className="h-4 w-4 text-success" />}
            {letter?.ourRef ?? "Loading..."}
          </DialogTitle>
          {letter && <DialogDescription>{letter.subject}</DialogDescription>}
        </DialogHeader>

        {isLoading ? (
          <Skeleton className="h-64" />
        ) : letter ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div><span className="text-muted-foreground">Their Ref:</span> <span className="font-mono">{letter.theirRef ?? "—"}</span></div>
              <div><span className="text-muted-foreground">Date:</span> {format(new Date(letter.date), "dd MMM yyyy")}</div>
              <div><span className="text-muted-foreground">From:</span> {letter.fromName ?? ""} ({letter.fromParty ?? "—"})</div>
              <div><span className="text-muted-foreground">To:</span> {letter.toName ?? ""} ({letter.toParty ?? "—"})</div>
              <div><span className="text-muted-foreground">Category:</span>
                <span className={cn("ml-1 rounded px-1 text-[9px] uppercase", CATEGORY_COLORS[letter.category])}>
                  {CATEGORIES.find(c => c.value === letter.category)?.label ?? letter.category}
                </span>
              </div>
              <div><span className="text-muted-foreground">Type:</span>
                {letter.letterType === "actionable" ? <span className="text-amber-600 font-medium">⚡ Actionable</span> : <span className="text-muted-foreground/80">ℹ Informative</span>}
              </div>
            </div>

            {letter.letterType === "actionable" && (
              <div className="rounded-md border p-3 space-y-2 text-xs">
                <div className="grid grid-cols-2 gap-2">
                  <div><span className="text-muted-foreground">Action by:</span> <strong>{letter.actionAssignedTo ?? "—"}</strong></div>
                  <div><span className="text-muted-foreground">Reply by:</span> <strong>{letter.replyDraftedBy ?? "—"}</strong></div>
                  <div>
                    <span className="text-muted-foreground">Due date:</span>{" "}
                    {letter.replyDueDate ? (
                      <span className={cn("font-bold", isOverdue ? "text-red-600" : "")}>
                        {format(new Date(letter.replyDueDate), "dd MMM yyyy")}
                        {isOverdue && " ⚠ OVERDUE"}
                      </span>
                    ) : "—"}
                  </div>
                  <div><span className="text-muted-foreground">Sent date:</span> {letter.replySentDate ? format(new Date(letter.replySentDate), "dd MMM yyyy") : "—"}</div>
                </div>
              </div>
            )}

            {letter.letterType === "actionable" && (
              <div className="rounded-md border border-info/30 dark:border-info/30 bg-info/30 dark:bg-[var(--navy-deep)]/10 p-3 space-y-3">
                <p className="text-xs font-semibold text-info dark:text-info/80">Reply Management</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Reply Status</Label>
                    <Select value={replyStatus} onValueChange={setReplyStatus}>
                      <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
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
                    <Input value={replyOurRef} onChange={(e) => setReplyOurRef(e.target.value)} placeholder="e.g. COR-2026-0045-R1" className="h-9 text-sm font-mono" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Reply Notes</Label>
                  <Textarea value={replyNotes} onChange={(e) => setReplyNotes(e.target.value)} rows={2} placeholder="Summary of reply or action taken..." className="text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Reply Letter Scan (optional)</Label>
                  {!replyFile ? (
                    <label className="flex items-center justify-center gap-2 rounded-md border border-dashed h-12 cursor-pointer hover:bg-muted/30 text-xs text-muted-foreground">
                      <Upload className="h-3 w-3" /> Upload reply letter scan
                      <input type="file" accept="image/*,application/pdf" onChange={handleReplyFile} className="hidden" />
                    </label>
                  ) : (
                    <div className="flex items-center gap-2 rounded-md border p-2 text-xs">
                      <FileText className="h-4 w-4 text-primary" />
                      <span className="flex-1 truncate">{replyFile.name}</span>
                      <button onClick={() => setReplyFile(null)} className="text-muted-foreground hover:text-destructive">✕</button>
                    </div>
                  )}
                </div>
                <Button size="sm" onClick={handleSaveReply} disabled={updateMut.isPending} className="w-full">
                  {updateMut.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />} Save Reply Status
                </Button>
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
        ) : (
          <p className="text-center text-sm text-muted-foreground py-8">Letter not found.</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
