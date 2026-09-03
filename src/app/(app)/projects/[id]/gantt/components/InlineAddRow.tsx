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
      className="mx-2 my-1.5 rounded-lg border bg-emerald-50/80 p-3 dark:bg-emerald-950/20"
      style={{ marginLeft: `${depth * 20 + 8}px` }}
    >
      <div className="flex flex-col gap-2">
        {/* Row 1: Submit + Name */}
        <div className="flex items-center gap-2">
          <button
            onClick={submit}
            disabled={mutation.isPending || !name.trim()}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-emerald-600 text-white shadow-sm hover:bg-emerald-700 disabled:opacity-40"
            title="Add (Enter)"
          >
            {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          </button>
          <input
            ref={nameRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={parentId ? "Subtask name…" : "Task name…"}
            className="h-9 flex-1 rounded-md border bg-background px-3 text-sm shadow-sm"
          />
        </div>

        {/* Row 2: Dates + Days + Milestone + Cancel */}
        <div className="flex flex-wrap items-center gap-2 pl-2">
          <input
            type="date"
            value={startDate}
            onChange={(e) => handleStartDateChange(e.target.value)}
            onKeyDown={handleKeyDown}
            className="h-8 rounded-md border bg-background px-2 text-sm"
          />
          <span className="text-sm text-muted-foreground">→</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => handleEndDateChange(e.target.value)}
            onKeyDown={handleKeyDown}
            className="h-8 rounded-md border bg-background px-2 text-sm"
          />
          <div className="flex items-center gap-1">
            <input
              type="number"
              value={duration}
              min={1}
              onChange={(e) => handleDurationChange(e.target.value)}
              onKeyDown={handleKeyDown}
              className="h-8 w-14 rounded-md border bg-background px-2 text-center text-sm"
            />
            <span className="text-xs text-muted-foreground">days</span>
          </div>
          <label className="ml-1 flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-background/50">
            <input
              type="checkbox"
              checked={isMilestone}
              onChange={(e) => setIsMilestone(e.target.checked)}
              className="h-4 w-4"
            />
            <Flag className="h-4 w-4 text-amber-500" />
            <span>Milestone</span>
          </label>
          <div className="ml-auto flex items-center gap-1">
            <button
              onClick={() => { setShow(false); setName(""); }}
              className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-background/50 hover:text-foreground"
              title="Cancel (Esc)"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
