"use client";

import { use, useState, useMemo } from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc-client";
import { toast } from "sonner";
import { format, subDays, addDays } from "date-fns";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Check,
  MapPin,
  Inbox,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AnimatedPage } from "@/components/ui/animated-page";
import { MatrixPanel } from "@/components/matrix/matrix-panel";
import { getUser } from "@/lib/client-auth";

type ProgramTask = {
  id: string;
  taskName: string;
  boqCode?: string | null;
  location?: string | null;
  assignedTo?: string | null;
  plannedQty: number;
  actualQty?: number | null;
  unit?: string | null;
  executionStatus: string;
};

type Program = {
  id: string;
  programDate: Date | string;
  status: string;
  tasks: ProgramTask[];
};

const execStatusColors: Record<string, string> = {
  planned: "bg-muted/40 text-muted-foreground border-border/80",
  done: "bg-primary/10 text-primary border-primary/40",
  partially_completed: "bg-amber-500/10 text-amber-400 border-amber-500/40",
  uncompleted: "bg-destructive/10 text-destructive border-destructive/40",
};

export default function MyTasksPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const user = getUser();
  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editStatus, setEditStatus] = useState<string>("planned");
  const [editQty, setEditQty] = useState<string>("");

  const { data: projectInfo } = trpc.project.get.useQuery({ id }, { staleTime: 300_000 });
  const { data, isLoading } = trpc.workflow.dailyProgram.listPrograms.useQuery({ projectId: id });
  const utils = trpc.useUtils();

  const allPrograms = (data?.programs as unknown as Program[]) || [];

  const currentProgram = useMemo(() => {
    return allPrograms.find((p) => {
      const pd = new Date(p.programDate);
      return (
        pd.getFullYear() === selectedDate.getFullYear() &&
        pd.getMonth() === selectedDate.getMonth() &&
        pd.getDate() === selectedDate.getDate()
      );
    });
  }, [allPrograms, selectedDate]);

  const myTasks = useMemo(() => {
    if (!currentProgram?.tasks || !user?.name) return [];
    return currentProgram.tasks.filter(
      (t) => t.assignedTo?.toLowerCase() === user.name.toLowerCase()
    );
  }, [currentProgram, user]);

  const completedCount = myTasks.filter(
    (t) => t.executionStatus === "done"
  ).length;
  const progressPercent = myTasks.length > 0 ? (completedCount / myTasks.length) * 100 : 0;

  const updateMutation = trpc.workflow.dailyProgram.updateTaskExecution.useMutation({
    onSuccess: () => {
      utils.workflow.dailyProgram.listPrograms.invalidate({ projectId: id });
      toast.success("Task updated");
      setEditingTaskId(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const handlePrevDay = () => setSelectedDate((d) => subDays(d, 1));
  const handleNextDay = () => setSelectedDate((d) => addDays(d, 1));
  const handleToday = () => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    setSelectedDate(d);
  };

  function startEditing(task: ProgramTask) {
    setEditingTaskId(task.id);
    setEditStatus(task.executionStatus);
    setEditQty(task.actualQty?.toString() ?? "");
  }

  function saveEdit(task: ProgramTask) {
    const qty = editQty ? parseFloat(editQty) : undefined;
    updateMutation.mutate({
      taskId: task.id,
      executionStatus: editStatus as any,
      actualQty: qty,
      projectId: id,
    });
  }

  return (
    <AnimatedPage className="space-y-3 pb-8 font-mono">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b border-border/60 pb-3">
        <div className="flex items-center gap-2 min-w-0">
          <Link
            href={`/projects/${id}/workflow/program`}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-border/80 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            title="Back to program"
          >
            <ChevronLeft className="h-4 w-4" />
          </Link>
          <div className="flex items-center gap-1.5 text-xs min-w-0">
            <Link href={`/projects/${id}`} className="text-muted-foreground hover:text-foreground truncate">
              {projectInfo?.project.code ?? "Project"}
            </Link>
            <span className="text-muted-foreground/40">/</span>
            <span className="font-bold text-primary uppercase tracking-wider">My Tasks</span>
          </div>
        </div>
      </div>

      {/* Date Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-border/80 bg-card p-2">
        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="sm" className="h-8 w-8 p-0 border-border/80" onClick={handlePrevDay}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" className="h-8 text-xs font-mono border-border/80 px-2.5 font-bold" onClick={handleToday}>
            Today
          </Button>
          <Button variant="outline" size="sm" className="h-8 w-8 p-0 border-border/80" onClick={handleNextDay}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2 px-2 py-1 rounded bg-muted/30 border border-border/60">
            <CalendarIcon className="h-3.5 w-3.5 text-primary" />
            <input
              type="date"
              value={format(selectedDate, "yyyy-MM-dd")}
              onChange={(e) => {
                if (e.target.value) {
                  const [y, m, d] = e.target.value.split("-").map(Number);
                  setSelectedDate(new Date(y, m - 1, d));
                }
              }}
              className="bg-transparent text-xs font-mono font-bold text-foreground focus:outline-none cursor-pointer"
            />
          </div>
          <span className="text-xs text-muted-foreground hidden md:inline">
            ({format(selectedDate, "EEEE, dd MMM yyyy")})
          </span>
        </div>
      </div>

      {/* Progress Summary */}
      {myTasks.length > 0 && (
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-primary uppercase tracking-wide">
                Progress: {completedCount} of {myTasks.length} tasks completed
              </span>
              <span className="text-xs text-muted-foreground">{Math.round(progressPercent)}%</span>
            </div>
            <Progress value={progressPercent} className="h-2" />
          </CardContent>
        </Card>
      )}

      {/* Tasks List */}
      {isLoading ? (
        <Skeleton className="h-72 w-full" />
      ) : myTasks.length > 0 ? (
        <MatrixPanel title={`My Tasks — ${format(selectedDate, "dd MMM yyyy")} (${myTasks.length} items)`}>
          <div className="overflow-x-auto no-scrollbar font-mono text-xs">
            <table className="w-full table-auto tabular-nums">
              <thead className="sticky top-0 z-20 bg-muted/90 backdrop-blur-md border-b border-border/80">
                <tr className="text-left uppercase font-bold text-[10px] tracking-wide text-primary">
                  <th className="w-7 py-2 px-1 text-center">#</th>
                  <th className="py-2 px-3 min-w-[200px]">Task Name</th>
                  <th className="w-28 py-2 px-2">Location</th>
                  <th className="w-20 py-2 px-2">BOQ Code</th>
                  <th className="w-20 py-2 px-2 text-right">Planned</th>
                  <th className="w-20 py-2 px-2 text-right">Actual</th>
                  <th className="w-12 py-2 px-1 text-center">Unit</th>
                  <th className="w-24 py-2 px-2 text-center">Status</th>
                  <th className="w-16 py-2 px-2 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {myTasks.map((task, i) => {
                  const isEditing = editingTaskId === task.id;
                  return (
                    <tr
                      key={task.id}
                      className={cn(
                        "hover:bg-primary/5 transition-colors",
                        i % 2 === 1 ? "bg-muted/15" : "bg-card",
                        isEditing && "bg-primary/10"
                      )}
                    >
                      <td className="py-1.5 px-1 text-center text-muted-foreground">
                        <span className="text-[10px]">{i + 1}</span>
                      </td>
                      <td className="py-1.5 px-3">
                        <span className="font-medium text-foreground leading-snug">{task.taskName}</span>
                      </td>
                      <td className="py-1.5 px-2 text-muted-foreground">
                        {task.location ? (
                          <span className="flex items-center gap-1 text-[11px] truncate">
                            <MapPin className="h-2.5 w-2.5 shrink-0 text-muted-foreground/60" />
                            {task.location}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/40">—</span>
                        )}
                      </td>
                      <td className="py-1.5 px-2 text-muted-foreground text-[11px]">
                        {task.boqCode || "—"}
                      </td>
                      <td className="py-1.5 px-2 text-right font-bold text-foreground tabular-nums">
                        {task.plannedQty}
                      </td>
                      <td className="py-1.5 px-2 text-right font-bold text-primary tabular-nums">
                        {isEditing ? (
                          <input
                            type="number"
                            value={editQty}
                            onChange={(e) => setEditQty(e.target.value)}
                            className="w-16 h-6 rounded border border-border bg-background px-1 text-right text-xs font-mono"
                          />
                        ) : (
                          task.actualQty ?? "—"
                        )}
                      </td>
                      <td className="py-1.5 px-1 text-center text-muted-foreground text-[10px]">
                        {task.unit || "—"}
                      </td>
                      <td className="py-1.5 px-2 text-center">
                        {isEditing ? (
                          <select
                            value={editStatus}
                            onChange={(e) => setEditStatus(e.target.value)}
                            className="h-6 rounded border border-border bg-background px-1 text-[10px] font-mono uppercase"
                          >
                            <option value="planned">Planned</option>
                            <option value="done">Done</option>
                            <option value="partially_completed">Partially Completed</option>
                            <option value="uncompleted">Uncompleted</option>
                          </select>
                        ) : (
                          <span className={cn("px-1.5 py-0.5 rounded border text-[9px] uppercase font-bold", execStatusColors[task.executionStatus] || execStatusColors.planned)}>
                            {task.executionStatus?.replace(/_/g, " ")}
                          </span>
                        )}
                      </td>
                      <td className="py-1.5 px-2 text-center">
                        {isEditing ? (
                          <div className="flex items-center gap-1">
                            <Button
                              size="sm"
                              className="h-6 w-6 p-0 bg-primary text-primary-foreground"
                              onClick={() => saveEdit(task)}
                              disabled={updateMutation.isPending}
                            >
                              {updateMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 w-6 p-0 text-muted-foreground"
                              onClick={() => setEditingTaskId(null)}
                            >
                              ✕
                            </Button>
                          </div>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 text-[10px] text-muted-foreground hover:text-foreground"
                            onClick={() => startEditing(task)}
                          >
                            Edit
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </MatrixPanel>
      ) : (
        <div className="rounded border border-border/80 bg-card p-12 text-center flex flex-col items-center gap-3">
          <Inbox className="h-10 w-10 text-muted-foreground/40" />
          <div>
            <p className="font-bold text-sm">No tasks assigned to you for {format(selectedDate, "dd MMM yyyy")}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Check with your project manager for task assignments.
            </p>
          </div>
        </div>
      )}
    </AnimatedPage>
  );
}
