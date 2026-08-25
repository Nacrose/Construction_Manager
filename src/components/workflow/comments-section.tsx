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
import { CommentThread } from "./comment-thread";

export function CommentsSection({ rfiId, projectId: _projectId, comments, currentUser }: { rfiId: string; projectId: string; comments: Array<{ id: string; content: string; parentId: string | null; createdAt: string | Date; author: { id: string; name: string } }>; currentUser: { id: string; name: string } | null }) {
  const [newComment, setNewComment] = useState("");
  const [adding, setAdding] = useState(false);
  const utils = trpc.useUtils();
  const addComment = trpc.workflow.rfi.addComment.useMutation({
    onSuccess: () => {
      utils.workflow.rfi.get.invalidate({ id: rfiId });
      setNewComment("");
    },
  });
  const deleteComment = trpc.workflow.rfi.deleteComment.useMutation({
    onSuccess: () => utils.workflow.rfi.get.invalidate({ id: rfiId }),
  });

  const topLevel = comments.filter(c => !c.parentId);
  const _replies = comments.filter(c => c.parentId);

  return (
    <div className="bg-card border border-border rounded-lg p-5">
      <div className="text-[0.95rem] font-semibold text-foreground mb-3 pb-2 border-b border-border flex items-center gap-2">
        <MessageSquare className="h-4 w-4 text-muted-foreground" /> Discussion
      </div>
      <div className="space-y-3">
        {topLevel.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No comments yet. Start the discussion.</p>
        ) : (
          topLevel.map((c) => (
            <CommentThread key={c.id} comment={c} depth={0} onReply={() => {}} onDelete={(id) => deleteComment.mutate({ id })} currentUser={currentUser} />
          ))
        )}
      </div>
      {currentUser && (
        <form onSubmit={async (e) => { e.preventDefault(); if (!newComment.trim()) return; setAdding(true); await addComment.mutateAsync({ rfiId, content: newComment }); setAdding(false); }} className="mt-4 flex gap-2">
          <input type="text" value={newComment} onChange={(e) => setNewComment(e.target.value)} placeholder="Add a comment..." className="flex-1 text-sm px-3 py-2 border border-input rounded bg-background" />
          <Button type="submit" disabled={adding || !newComment.trim()} className="bg-primary text-primary-foreground">
            {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : "Post"}
          </Button>
        </form>
      )}
    </div>
  );
}

