"use client";

import { useState, useRef, useEffect } from "react";
import { format, addDays, differenceInDays } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc-client";
import { Plus, Check, Loader2, CornerDownRight, Flag, X } from "lucide-react";
import { useUndoRedo } from "../undo-redo";

export function InlineAddRow({
  projectId,
  parentId,
  existingCount: _existingCount,
  depth = 0,
  trigger = 0,
}: {
  projectId: string;
  parentId: string | null;
  existingCount: number;
  depth?: number;
  trigger?: number;
}) {
  const utils = trpc.useUtils() as any;
  const { pushAction } = useUndoRedo();
  const [show, setShow] = useState(false);
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState(format(addDays(new Date(), 7), "yyyy-MM-dd"));
  const [duration, setDuration] = useState(8); // default: today + 7 = 8 days inclusive
  const [isMilestone, setIsMilestone] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (show) nameRef.current?.focus();
  }, [show]);

  useEffect(() => {
    if (trigger > 0) {
      setShow(true);
    }
  }, [trigger]);

  // Bidirectional sync: startDate or duration change → update endDate
  function handleStartDateChange(v: string) {
    setStartDate(v);
    const newEnd = format(addDays(new Date(v), duration - 1), "yyyy-MM-dd");
    setEndDate(newEnd);
  }

  function handleEndDateChange(v: string) {
    setEndDate(v);
    const d = Math.max(1, differenceInDays(new Date(v), new Date(startDate)) + 1);
    setDuration(d);
  }

  function handleDurationChange(v: string) {
    const d = Math.max(1, parseInt(v) || 1);
    setDuration(d);
    const newEnd = format(addDays(new Date(startDate), d - 1), "yyyy-MM-dd");
    setEndDate(newEnd);
  }

  const mutation = trpc.gantt.create.useMutation({
    onSuccess: () => {
      utils.gantt.list.invalidate({ projectId });
      toast.success(parentId ? "Subtask added" : "Task added");
      setName("");
      nameRef.current?.focus();
    },
    onError: (e: any) => toast.error(e.message),
  });

  function submit() {
    if (!name.trim() || mutation.isPending) return;
    mutation.mutate({
      projectId,
      name: name.trim(),
      parentId,
      startDate: new Date(startDate).toISOString(),
      endDate: new Date(endDate).toISOString(),
      duration,
      isMilestone,
    }, {
      onSuccess: () => pushAction({
        label: parentId ? "Add subtask" : "Add task",
        undo: async () => {
          const tasks = await utils.gantt.list.fetch({ projectId });
          const created = tasks.tasks.find(t => t.name === name.trim());
          if (created) {
            await utils.gantt.delete.mutateAsync({ taskId: created.id });
            utils.gantt.list.invalidate({ projectId });
          }
        },
        redo: async () => {
          await utils.gantt.create.mutateAsync({
            projectId, name: name.trim(), parentId,
            startDate: new Date(startDate).toISOString(),
            endDate: new Date(endDate).toISOString(),
            duration,
            isMilestone,
          });
          utils.gantt.list.invalidate({ projectId });
        },
      }),
    });
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      submit();
    }
    if (e.key === "Escape") {
      setShow(false);
      setName("");
    }
  }

  if (!show) {
    return (
      <div className="flex items-center h-9 border-b border-border/70 bg-card">
        <div className="w-[52px] shrink-0 flex items-center justify-center border-r border-border/70 h-full text-primary font-bold">
          {parentId ? <CornerDownRight className="h-3.5 w-3.5 text-muted-foreground" /> : <Plus className="h-3.5 w-3.5" />}
        </div>
        <button
          type="button"
          onClick={() => setShow(true)}
          className="min-w-[190px] flex-1 flex items-center h-full px-3 text-[10px] font-mono font-medium text-primary hover:bg-accent/60 transition-colors text-left cursor-pointer border-r border-border/60"
        >
          {parentId ? "Add subtask..." : "Add task..."}
        </button>
        <div className="w-[88px] border-r border-border/60 h-full" /><div className="w-[88px] border-r border-border/60 h-full" /><div className="w-[58px] border-r border-border/60 h-full" /><div className="w-[64px] border-r border-border/60 h-full" /><div className="w-[96px] h-full" />
      </div>
    );
  }

  return (
    <div
      className="flex items-center h-8 border-b border-primary/40 bg-card ring-1 ring-inset ring-primary/30 transition-all text-xs"
    >
      {/* Col 1: Action indicator / Submit */}
      <div className="w-[52px] shrink-0 flex items-center justify-center border-r border-border/70 h-full bg-primary/10">
        <button
          type="button"
          onClick={submit}
          disabled={mutation.isPending || !name.trim()}
          className="flex h-5 w-5 items-center justify-center rounded bg-emerald-600 text-white shadow-2xs hover:bg-emerald-700 disabled:opacity-40 cursor-pointer"
          title="Save Task (Enter)"
        >
          {mutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
        </button>
      </div>

      {/* Col 2: Task Name input */}
      <div className="min-w-[190px] flex-1 h-full flex items-center border-r border-border/60 px-1 bg-background">
        <input
          ref={nameRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={parentId ? "Subtask name… (Enter to save, Esc to cancel)" : "Task name… (Enter to save, Esc to cancel)"}
          className="h-7 w-full bg-transparent px-2 text-[10.5px] font-medium text-foreground outline-none placeholder:text-muted-foreground/60"
        />
      </div>

      {/* Col 3: Start date */}
      <div className="w-[88px] shrink-0 h-full flex items-center border-r border-border/60 px-1 bg-background">
        <input
          type="date"
          value={startDate}
          onChange={(e) => handleStartDateChange(e.target.value)}
          onKeyDown={handleKeyDown}
          className="h-6 w-full bg-transparent px-1 text-[9px] text-foreground font-mono outline-none"
        />
      </div>

      {/* Col 4: Finish date */}
      <div className="w-[88px] shrink-0 h-full flex items-center border-r border-border/60 px-1 bg-background">
        <input
          type="date"
          value={endDate}
          onChange={(e) => handleEndDateChange(e.target.value)}
          onKeyDown={handleKeyDown}
          className="h-6 w-full bg-transparent px-1 text-[9px] text-foreground font-mono outline-none"
        />
      </div>

      {/* Col 5: Duration */}
      <div className="w-[58px] shrink-0 h-full flex items-center justify-center border-r border-border/60 px-1 bg-background">
        <input
          type="number"
          value={duration}
          min={1}
          onChange={(e) => handleDurationChange(e.target.value)}
          onKeyDown={handleKeyDown}
          className="h-6 w-8 text-center bg-transparent text-[9.5px] font-mono font-semibold text-foreground outline-none"
        />
        <span className="text-[9px] text-muted-foreground">d</span>
      </div>

      {/* Col 6: Milestone toggle */}
      <div className="w-[64px] shrink-0 h-full flex items-center justify-center border-r border-border/60 bg-background" title="Milestone">
        <button
          type="button"
          onClick={() => setIsMilestone(!isMilestone)}
          className={cn(
            "flex h-5 items-center gap-0.5 px-1 rounded text-[9px] font-semibold cursor-pointer",
            isMilestone ? "bg-amber-500/20 text-amber-600 font-bold border border-amber-500/40" : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Flag className="h-2.5 w-2.5" />
          <span>{isMilestone ? "MS" : "Task"}</span>
        </button>
      </div>

      {/* Col 7: Cancel action */}
      <div className="w-[96px] shrink-0 h-full flex items-center justify-end px-2 bg-background">
        <button
          type="button"
          onClick={() => { setShow(false); setName(""); }}
          className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
          title="Cancel (Esc)"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}
