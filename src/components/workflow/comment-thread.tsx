"use client";

import { useState, useEffect, useRef } from "react";
import { useForm, useWatch } from "react-hook-form";
import { trpc } from "@/lib/trpc-client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, CheckCircle2, MessageSquare, MapPin } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";

export function CommentThread({ comment, depth, onReply, onDelete, currentUser }: { comment: { id: string; content: string; parentId: string | null; createdAt: string | Date; author: { id: string; name: string } }; depth: number; onReply: (parentId: string) => void; onDelete: (id: string) => void; currentUser: { id: string; name: string } | null }) {
  const [showReply, setShowReply] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [replying, setReplying] = useState(false);
  const utils = trpc.useUtils();
  const addComment = trpc.workflow.rfi.addComment.useMutation({
    onSuccess: () => {
      utils.workflow.rfi.get.invalidate({ id: comment.parentId ? comment.parentId : "" });
      setReplyText("");
      setShowReply(false);
    },
  });
  const _deleteComment = trpc.workflow.rfi.deleteComment.useMutation({
    onSuccess: () => utils.workflow.rfi.get.invalidate({ id: "" }),
  });

  const handleReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim()) return;
    setReplying(true);
    await addComment.mutateAsync({ rfiId: comment.parentId ? comment.parentId : comment.id, content: replyText, parentId: comment.id });
    setReplying(false);
  };

  const isOwn = currentUser && comment.author.id === currentUser.id;

  return (
    <div style={{ marginLeft: depth * 24 }} className="space-y-2">
      <div className="bg-muted/60 dark:bg-[var(--navy-mid)]/50 p-3 rounded-md border border-border">
        <div className="flex items-start justify-between gap-2 mb-1">
          <div>
            <span className="font-medium text-xs">{comment.author.name}</span>
            <span className="text-[10px] text-muted-foreground ml-2">{formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}</span>
          </div>
          {isOwn && (
            <button type="button" onClick={() => onDelete(comment.id)} className="text-[10px] text-muted-foreground hover:text-destructive">
              Delete
            </button>
          )}
        </div>
        <p className="text-[11px] whitespace-pre-wrap">{comment.content}</p>
        <button type="button" onClick={() => { setShowReply(!showReply); onReply(comment.id); }} className="text-[10px] text-primary hover:underline mt-1 inline-block">
          Reply
        </button>
      </div>
      {showReply && (
        <form onSubmit={handleReply} className="flex gap-1">
          <input type="text" value={replyText} onChange={(e) => setReplyText(e.target.value)} placeholder="Write a reply..." className="flex-1 text-xs px-2 py-1 border border-input rounded bg-background" />
          <button type="submit" disabled={replying || !replyText.trim()} className="text-xs px-2 py-1 bg-primary text-primary-foreground rounded disabled:opacity-50">
            {replying ? "..." : "Send"}
          </button>
        </form>
      )}
    </div>
  );
}
