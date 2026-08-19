"use client";

import { use, useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc-client";
import { toast } from "sonner";
import { format, addDays, subDays } from "date-fns";
import { TaskTable } from "./components/task-table";
import { AddProgramDialog } from "./components/add-program-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogTrigger } from "@/components/ui/dialog";
import {
  Plus,
  Inbox,
  Loader2,
  Package,
  X,
  Check,
  AlertTriangle,
  ArrowRight,
  RefreshCw,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Users,
  Wrench,
  Search,
  Calendar as CalendarIcon,
  Layers,
  FileSpreadsheet
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AnimatedPage } from "@/components/ui/animated-page";
import { MatrixPanel } from "@/components/matrix/matrix-panel";

type Program = {
  id: string;
  programDate: Date | string;
  status: string;
  notes: string | null;
  tasks: any[];
  _count?: { tasks: number };
};

export default function DailyProgramPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [addOpen, setAddOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [filterDate, setFilterDate] = useState("");
  
  // Date selector — defaults to Today
  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });

  const { data: projectInfo } = trpc.project.get.useQuery({ id }, { staleTime: 300_000 });
  const { data, isLoading } = trpc.workflow.dailyProgram.listPrograms.useQuery({ projectId: id });
  const utils = trpc.useUtils();

  const canWrite = !!(
    projectInfo?.myRole &&
    projectInfo.myRole !== "client" &&
    projectInfo.myRole !== "inspector"
  );
  const isPm = projectInfo?.myRole === "project_manager" || projectInfo?.myRole === "coordinator";

  const { data: backlogData } = trpc.workflow.dailyProgram.listBacklog.useQuery(
    { projectId: id },
    { enabled: !!data?.programs.length }
  );

  const [selectedBacklogIds, setSelectedBacklogIds] = useState<Set<string>>(new Set());
  const [backlogTargetId, setBacklogTargetId] = useState<string>("");
  const [cancelTaskId, setCancelTaskId] = useState<string | null>(null);

  const addBacklogMutation = trpc.workflow.dailyProgram.addBacklogToProgram.useMutation({
    onSuccess: () => {
      utils.workflow.dailyProgram.listPrograms.invalidate({ projectId: id });
      utils.workflow.dailyProgram.listBacklog.invalidate({ projectId: id });
      toast.success("Backlog items added to program");
      setSelectedBacklogIds(new Set());
    },
    onError: (e) => toast.error(e.message),
  });

  const resyncMutation = trpc.workflow.dailyProgram.resyncProgram.useMutation({
    onSuccess: (r) => {
      utils.workflow.dailyProgram.listPrograms.invalidate({ projectId: id });
      const parts: string[] = [];
      if (r.created?.length) parts.push(`${r.created.length} created`);
      if (r.updated?.length) parts.push(`${r.updated.length} updated`);
      if (r.removed?.length) parts.push(`${r.removed.length} removed`);
      toast.success(`Resync complete — ${parts.length ? parts.join(", ") : "no changes"}`);
    },
    onError: (e) => toast.error(e.message),
  });

  const approveProgramMutation = trpc.workflow.dailyProgram.approveProgram.useMutation({
    onSuccess: () => {
      utils.workflow.dailyProgram.listPrograms.invalidate({ projectId: id });
      toast.success("Daily program approved");
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteProgramMutation = trpc.workflow.dailyProgram.deleteProgram.useMutation({
    onSuccess: () => {
      utils.workflow.dailyProgram.listPrograms.invalidate({ projectId: id });
      toast.success("Daily program deleted");
    },
    onError: (e) => toast.error(e.message),
  });

  const allPrograms = (data?.programs as unknown as Program[]) || [];
  const backlogTasks = backlogData?.backlogTasks || [];

  // Find program matching selectedDate
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

  // Future programs for backlog targeting
  const futurePrograms = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return allPrograms.filter((p) => new Date(p.programDate) >= today);
  }, [allPrograms]);

  // Ingredients calculation for selected program
  const programMaterials = useMemo(() => {
    if (!currentProgram) return [];
    const map = new Map<string, { name: string; type: string; unit: string; qty: number; cost: number }>();
    for (const task of currentProgram.tasks || []) {
      if (!task.boqItem?.ingredients) continue;
      for (const ing of task.boqItem.ingredients) {
        const qty = (task.plannedQty || 0) * ing.quantity;
        const cost = ing.amount * (task.plannedQty || 0);
        const key = `${ing.name}|${ing.unit}`;
        const existing = map.get(key);
        if (existing) {
          existing.qty += qty;
          existing.cost += cost;
        } else {
          map.set(key, {
            name: ing.name,
            type: ing.type,
            unit: ing.unit,
            qty,
            cost,
          });
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => b.cost - a.cost);
  }, [currentProgram]);

  const materialsList = programMaterials.filter((m) => m.type === "material");
  const laborList = programMaterials.filter((m) => m.type === "labor");
  const equipmentList = programMaterials.filter((m) => m.type === "equipment");

  const toggleBacklogItem = (taskId: string) => {
    setSelectedBacklogIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  };

  const handlePrevDay = () => setSelectedDate((d) => subDays(d, 1));
  const handleNextDay = () => setSelectedDate((d) => addDays(d, 1));
  const handleToday = () => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    setSelectedDate(d);
  };

  return (
    <AnimatedPage className="space-y-3 pb-8 font-mono">
      {/* ───────── Top Breadcrumbs & Matrix Toolbar ───────── */}
      <div className="flex items-center justify-between gap-3 border-b border-border/60 pb-3">
        <div className="flex items-center gap-2 min-w-0">
          <Link
            href={`/projects/${id}`}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-border/80 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            title="Back to project"
          >
            <ChevronLeft className="h-4 w-4" />
          </Link>
          <div className="flex items-center gap-1.5 text-xs min-w-0">
            <Link href={`/projects/${id}`} className="text-muted-foreground hover:text-foreground truncate">
              {projectInfo?.project.code ?? "Project"}
            </Link>
            <span className="text-muted-foreground/40">/</span>
            <span className="font-bold text-primary uppercase tracking-wider">Daily Site Program</span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {canWrite && (
            <Dialog open={addOpen} onOpenChange={setAddOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="h-8 text-xs font-mono font-bold bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5 shadow-sm">
                  <Plus className="h-3.5 w-3.5" /> New Daily Program
                </Button>
              </DialogTrigger>
              <AddProgramDialog
                projectId={id}
                defaultDate={selectedDate}
                onDone={() => setAddOpen(false)}
              />
            </Dialog>
          )}
        </div>
      </div>

      {/* ───────── Day Navigation & Status Bar ───────── */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-border/80 bg-card p-2">
        {/* Date Hopping Controls */}
        <div className="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            className="h-8 w-8 p-0 border-border/80"
            onClick={handlePrevDay}
            title="Previous Day"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>

          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs font-mono border-border/80 px-2.5 font-bold"
            onClick={handleToday}
          >
            Today
          </Button>

          <Button
            variant="outline"
            size="sm"
            className="h-8 w-8 p-0 border-border/80"
            onClick={handleNextDay}
            title="Next Day"
          >
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

        {/* Program Status & Action Controls */}
        <div className="flex items-center gap-2">
          {currentProgram ? (
            <>
              <span
                className={cn(
                  "px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase border",
                  currentProgram.status === "approved"
                    ? "bg-primary/10 text-primary border-primary/40"
                    : "bg-amber-500/10 text-amber-400 border-amber-500/40"
                )}
              >
                {currentProgram.status}
              </span>

              {isPm && currentProgram.status === "draft" && (
                <Button
                  size="sm"
                  className="h-7 text-xs font-mono font-bold bg-primary text-primary-foreground hover:bg-primary/90"
                  onClick={() => approveProgramMutation.mutate({ programId: currentProgram.id, projectId: id })}
                  disabled={approveProgramMutation.isPending}
                >
                  {approveProgramMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Check className="h-3 w-3 mr-1" />}
                  Approve Program
                </Button>
              )}

              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs font-mono border-border/80 text-muted-foreground hover:text-foreground"
                onClick={() => resyncMutation.mutate({ programId: currentProgram.id, projectId: id })}
                disabled={resyncMutation.isPending}
                title="Resync with latest approved RFIs"
              >
                <RefreshCw className={cn("h-3 w-3 mr-1", resyncMutation.isPending && "animate-spin")} />
                Resync
              </Button>

              {isPm && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive hover:bg-destructive/10"
                  onClick={() => {
                    if (confirm("Delete this daily program?")) {
                      deleteProgramMutation.mutate({ programId: currentProgram.id, projectId: id });
                    }
                  }}
                  title="Delete program"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </>
          ) : (
            <span className="text-xs text-muted-foreground">
              No program scheduled for this date
            </span>
          )}
        </div>
      </div>

      {/* ───────── Main Daily Program Execution Matrix ───────── */}
      {isLoading ? (
        <Skeleton className="h-72 w-full" />
      ) : currentProgram ? (
        <div className="space-y-3">
          <MatrixPanel
            title={`Program Tasks — ${format(selectedDate, "dd MMM yyyy")} (${currentProgram.tasks?.length || 0} items)`}
          >
            {currentProgram.tasks && currentProgram.tasks.length > 0 ? (
              <TaskTable tasks={currentProgram.tasks} projectId={id} />
            ) : (
              <div className="p-8 text-center text-xs text-muted-foreground">
                No tasks assigned to this daily program yet.
              </div>
            )}
          </MatrixPanel>

          {/* Daily Resource Breakdown Ledgers (Labor, Equipment, Materials) */}
          {(laborList.length > 0 || equipmentList.length > 0 || materialsList.length > 0) && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* Labor Deployment */}
              <MatrixPanel title={`Manpower Required (${laborList.length})`}>
                <div className="overflow-x-auto no-scrollbar p-2">
                  <table className="w-full text-xs tabular-nums font-mono">
                    <thead>
                      <tr className="border-b border-border/60 text-left text-muted-foreground text-[10px] uppercase">
                        <th className="py-1">Trade</th>
                        <th className="py-1 text-right">Required</th>
                        <th className="py-1 text-right">Est. Cost</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/30">
                      {laborList.map((l, i) => (
                        <tr key={i} className="hover:bg-muted/20">
                          <td className="py-1 font-medium text-foreground">{l.name}</td>
                          <td className="py-1 text-right font-bold text-primary">{l.qty.toFixed(1)} {l.unit}</td>
                          <td className="py-1 text-right text-muted-foreground">NPR {l.cost.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </MatrixPanel>

              {/* Equipment Deployment */}
              <MatrixPanel title={`Equipment Required (${equipmentList.length})`}>
                <div className="overflow-x-auto no-scrollbar p-2">
                  <table className="w-full text-xs tabular-nums font-mono">
                    <thead>
                      <tr className="border-b border-border/60 text-left text-muted-foreground text-[10px] uppercase">
                        <th className="py-1">Machine</th>
                        <th className="py-1 text-right">Hours</th>
                        <th className="py-1 text-right">Est. Cost</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/30">
                      {equipmentList.map((eq, i) => (
                        <tr key={i} className="hover:bg-muted/20">
                          <td className="py-1 font-medium text-foreground">{eq.name}</td>
                          <td className="py-1 text-right font-bold text-amber-400">{eq.qty.toFixed(1)} {eq.unit}</td>
                          <td className="py-1 text-right text-muted-foreground">NPR {eq.cost.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </MatrixPanel>

              {/* Material Consumption */}
              <MatrixPanel title={`Estimated Materials (${materialsList.length})`}>
                <div className="overflow-x-auto no-scrollbar p-2">
                  <table className="w-full text-xs tabular-nums font-mono">
                    <thead>
                      <tr className="border-b border-border/60 text-left text-muted-foreground text-[10px] uppercase">
                        <th className="py-1">Material</th>
                        <th className="py-1 text-right">Quantity</th>
                        <th className="py-1 text-right">Est. Cost</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/30">
                      {materialsList.map((m, i) => (
                        <tr key={i} className="hover:bg-muted/20">
                          <td className="py-1 font-medium text-foreground truncate max-w-[120px]" title={m.name}>{m.name}</td>
                          <td className="py-1 text-right font-bold text-foreground">{m.qty.toFixed(2)} {m.unit}</td>
                          <td className="py-1 text-right text-muted-foreground">NPR {m.cost.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </MatrixPanel>
            </div>
          )}
        </div>
      ) : (
        /* Empty State for Selected Date */
        <div className="rounded border border-border/80 bg-card p-12 text-center flex flex-col items-center gap-3">
          <Inbox className="h-10 w-10 text-muted-foreground/40" />
          <div>
            <p className="font-bold text-sm">No Daily Program for {format(selectedDate, "dd MMM yyyy")}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Plan site execution by pulling tasks from Approved RFIs and Gantt Look-Ahead.
            </p>
          </div>
          {canWrite && (
            <Dialog open={addOpen} onOpenChange={setAddOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="mt-2 text-xs font-mono font-bold bg-primary text-primary-foreground hover:bg-primary/90">
                  <Plus className="h-3.5 w-3.5 mr-1" /> Create Program for {format(selectedDate, "dd MMM")}
                </Button>
              </DialogTrigger>
              <AddProgramDialog
                projectId={id}
                defaultDate={selectedDate}
                onDone={() => setAddOpen(false)}
              />
            </Dialog>
          )}
        </div>
      )}

      {/* ───────── Backlog Carry-Over Panel ───────── */}
      {backlogTasks.length > 0 && (
        <MatrixPanel title={`Uncompleted Backlog (${backlogTasks.length} items)`}>
          <div className="p-2 space-y-2">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="text-muted-foreground text-[11px]">
                Tasks from previous days with remaining quantities that need rescheduling:
              </span>
              {canWrite && selectedBacklogIds.size > 0 && (
                <div className="flex items-center gap-2 shrink-0">
                  <select
                    value={backlogTargetId}
                    onChange={(e) => setBacklogTargetId(e.target.value)}
                    className="h-7 rounded border border-border bg-background px-2 text-xs font-mono"
                  >
                    <option value="">Select target program...</option>
                    {futurePrograms.map((p) => (
                      <option key={p.id} value={p.id}>
                        {format(new Date(p.programDate), "dd MMM yyyy")} ({p.status})
                      </option>
                    ))}
                  </select>
                  <Button
                    size="sm"
                    className="h-7 text-xs font-mono font-bold bg-primary text-primary-foreground hover:bg-primary/90"
                    disabled={!backlogTargetId || addBacklogMutation.isPending}
                    onClick={() => {
                      addBacklogMutation.mutate({
                        projectId: id,
                        programId: backlogTargetId,
                        taskIds: [...selectedBacklogIds],
                      });
                    }}
                  >
                    {addBacklogMutation.isPending ? (
                      <Loader2 className="h-3 w-3 animate-spin mr-1" />
                    ) : (
                      <ArrowRight className="h-3 w-3 mr-1" />
                    )}
                    Carry {selectedBacklogIds.size} Forward
                  </Button>
                </div>
              )}
            </div>

            <div className="overflow-x-auto no-scrollbar">
              <table className="w-full text-xs tabular-nums font-mono">
                <thead>
                  <tr className="border-b border-border/60 text-left text-muted-foreground text-[10px] uppercase">
                    <th className="w-8 py-1 px-1 text-center">
                      <input
                        type="checkbox"
                        checked={selectedBacklogIds.size === backlogTasks.length && backlogTasks.length > 0}
                        onChange={() => {
                          if (selectedBacklogIds.size === backlogTasks.length) {
                            setSelectedBacklogIds(new Set());
                          } else {
                            setSelectedBacklogIds(new Set(backlogTasks.map((t) => t.id)));
                          }
                        }}
                        className="h-3.5 w-3.5 rounded border-border"
                      />
                    </th>
                    <th className="py-1 px-2">Task / RFI</th>
                    <th className="py-1 px-2">Original Date</th>
                    <th className="py-1 px-2">Location</th>
                    <th className="py-1 px-2 text-right">Remaining Qty</th>
                    <th className="py-1 px-2 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {backlogTasks.map((task) => {
                    const isSelected = selectedBacklogIds.has(task.id);
                    const remainingQty = Math.max(0, (task.plannedQty || 0) - (task.actualQty || 0));

                    return (
                      <tr key={task.id} className={cn("hover:bg-primary/5", isSelected && "bg-primary/10")}>
                        <td className="py-1.5 px-1 text-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleBacklogItem(task.id)}
                            className="h-3.5 w-3.5 rounded border-border"
                          />
                        </td>
                        <td className="py-1.5 px-2">
                          <div className="flex flex-col">
                            <span className="font-medium text-foreground">{task.taskName}</span>
                            {task.rfi && (
                              <span className="text-[10px] text-muted-foreground font-mono">RFI: {task.rfi.number}</span>
                            )}
                          </div>
                        </td>
                        <td className="py-1.5 px-2 text-muted-foreground">
                          {task.program ? format(new Date(task.program.programDate), "dd MMM yyyy") : "—"}
                        </td>
                        <td className="py-1.5 px-2 text-muted-foreground">
                          {task.location || "—"}
                        </td>
                        <td className="py-1.5 px-2 text-right font-bold text-amber-400">
                          {remainingQty} {task.unit || ""}
                        </td>
                        <td className="py-1.5 px-2 text-center">
                          <span className="px-1.5 py-0.5 rounded border border-amber-500/40 text-[9px] uppercase font-bold text-amber-400 bg-amber-500/10">
                            {task.executionStatus?.replace(/_/g, " ")}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </MatrixPanel>
      )}
    </AnimatedPage>
  );
}
