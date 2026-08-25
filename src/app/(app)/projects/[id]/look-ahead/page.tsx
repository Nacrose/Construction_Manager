"use client";
import { use, useState } from "react";
import { trpc } from "@/lib/trpc-client";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Calendar, ChevronLeft, ChevronRight, Package, AlertTriangle,
  Loader2, Zap, Users, Wrench,
} from "lucide-react";
import { format, addDays, startOfWeek } from "date-fns";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { ModuleTabs } from "@/components/module-tabs";

const PLANNING_TABS = [
  { label: "BOQ", href: "/boq" },
  { label: "Look-Ahead", href: "/look-ahead" },
];

export default function LookAheadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [startDate, setStartDate] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [weeks, setWeeks] = useState(2);
  const [tab, setTab] = useState<"schedule" | "materials" | "conflicts">("schedule");

  const endDate = addDays(startDate, weeks * 7 - 1);
  const days = Array.from({ length: weeks * 7 }, (_, i) => addDays(startDate, i));

  return (
    <>
      <ModuleTabs projectId={id} tabs={PLANNING_TABS} />
      <div className="space-y-6 pb-8">
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link href={`/projects/${id}`} className="hover:text-foreground">Project</Link>
          <span>/</span>
          <span>Look-Ahead</span>
        </div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Look-Ahead Schedule</h1>
        <p className="text-sm text-muted-foreground">
          {weeks}-week look-ahead with material requirements and resource conflicts.
        </p>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => setStartDate(addDays(startDate, -7))}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm font-medium">
          {format(startDate, "dd MMM")} — {format(endDate, "dd MMM yyyy")}
        </span>
        <Button size="sm" variant="outline" onClick={() => setStartDate(addDays(startDate, 7))}>
          <ChevronRight className="h-4 w-4" />
        </Button>
        <div className="flex-1" />
        <Select value={String(weeks)} onValueChange={(v) => setWeeks(parseInt(v))}>
          <SelectTrigger className="h-8 w-24 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="1">1 week</SelectItem>
            <SelectItem value="2">2 weeks</SelectItem>
            <SelectItem value="4">4 weeks</SelectItem>
          </SelectContent>
        </Select>
        <Button size="sm" variant="outline" onClick={() => setStartDate(startOfWeek(new Date(), { weekStartsOn: 1 }))}>
          Today
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b">
        <button
          onClick={() => setTab("schedule")}
          className={cn(
            "px-4 py-2 text-sm font-medium border-b-2 transition",
            tab === "schedule" ? "border-amber-500 text-amber-700 dark:text-amber-400" : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          <Calendar className="inline h-3.5 w-3.5 mr-1" />
          Schedule
        </button>
        <button
          onClick={() => setTab("materials")}
          className={cn(
            "px-4 py-2 text-sm font-medium border-b-2 transition",
            tab === "materials" ? "border-amber-500 text-amber-700 dark:text-amber-400" : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          <Package className="inline h-3.5 w-3.5 mr-1" />
          Materials
        </button>
        <button
          onClick={() => setTab("conflicts")}
          className={cn(
            "px-4 py-2 text-sm font-medium border-b-2 transition",
            tab === "conflicts" ? "border-amber-500 text-amber-700 dark:text-amber-400" : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          <AlertTriangle className="inline h-3.5 w-3.5 mr-1" />
          Resource Conflicts
        </button>
      </div>

      {tab === "schedule" && (
        <ScheduleTab projectId={id} days={days} startDate={startDate} />
      )}
      {tab === "materials" && (
        <MaterialsTab projectId={id} startDate={startDate} endDate={endDate} />
      )}
      {tab === "conflicts" && (
        <ConflictsTab projectId={id} startDate={startDate} endDate={endDate} />
      )}
    </div>
    </>
  );
}

// ─── Schedule Tab (existing calendar view) ─────────────────
function ScheduleTab({ projectId, days }: { projectId: string; days: Date[]; startDate: Date }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-7 gap-2">
      {days.map((day, i) => {
        const isWeekend = day.getDay() === 0 || day.getDay() === 6;
        const isToday = format(day, "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd");
        return (
          <Card key={i} className={cn("min-h-32", isWeekend && "bg-muted/30", isToday && "border-primary border-2")}>
            <CardContent className="p-2">
              <div className={cn("text-xs font-medium mb-1", isToday ? "text-primary" : "text-muted-foreground")}>
                {format(day, "EEE dd MMM")}
              </div>
              <DayPrograms projectId={projectId} date={day} />
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function DayPrograms({ projectId, date }: { projectId: string; date: Date }) {
  const { data, isLoading } = trpc.workflow.dailyProgram.getApprovedDailyProgramByDate.useQuery(
    { projectId, programDate: date.toISOString() }
  );

  if (isLoading) return <div className="text-[10px] text-muted-foreground">Loading...</div>;
  if (!data || !data.tasks || data.tasks.length === 0) return <div className="text-[10px] text-muted-foreground/50 italic">No program</div>;

  return (
    <div className="space-y-0.5">
      {data.tasks.slice(0, 5).map((t: any) => (
        <div key={t.id} className="text-[10px] rounded bg-primary/5 px-1 py-0.5">
          <div className="font-medium truncate">{t.taskName}</div>
          {t.boqCode && <div className="text-[8px] text-muted-foreground font-mono">{t.boqCode}</div>}
        </div>
      ))}
      {data.tasks.length > 5 && <div className="text-[9px] text-muted-foreground">+{data.tasks.length - 5} more</div>}
    </div>
  );
}

// ─── Materials Tab ─────────────────────────────────────────
function MaterialsTab({ projectId, startDate, endDate }: { projectId: string; startDate: Date; endDate: Date }) {
  const { data, isLoading } = trpc.execution.materialRequirements.useQuery({
    projectId,
    fromDate: startDate.toISOString(),
    toDate: endDate.toISOString(),
  });

  if (isLoading) {
    return <div className="flex h-40 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  if (!data || data.materials.length === 0) {
    return (
      <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">
        <Package className="mx-auto h-10 w-10 mb-2 opacity-50" />
        No material requirements found for this period.
        <p className="text-xs mt-1">Link BOQ items to Gantt tasks and add ingredients to BOQ items to see requirements.</p>
      </CardContent></Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <Card className="p-3 text-center">
          <div className="text-lg font-bold text-amber-600">{data.materials.length}</div>
          <div className="text-[9px] text-muted-foreground uppercase">Material Types</div>
        </Card>
        <Card className="p-3 text-center">
          <div className="text-lg font-bold text-blue-600">
            NPR {data.totals.totalCost.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
          </div>
          <div className="text-[9px] text-muted-foreground uppercase">Total Cost</div>
        </Card>
        <Card className="p-3 text-center">
          <div className="text-lg font-bold text-slate-600">
            {Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))} days
          </div>
          <div className="text-[9px] text-muted-foreground uppercase">Look-Ahead Period</div>
        </Card>
      </div>

      {/* Material requirements table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Material Requirements</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Material</TableHead>
                <TableHead>Unit</TableHead>
                <TableHead className="text-right">Total Qty</TableHead>
                <TableHead className="text-right">Rate</TableHead>
                <TableHead className="text-right">Total Cost</TableHead>
                <TableHead className="text-center">Tasks</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.materials.map((m, i) => (
                <TableRow key={i}>
                  <TableCell className="font-medium">{m.materialName}</TableCell>
                  <TableCell className="text-xs">{m.unit}</TableCell>
                  <TableCell className="text-right font-mono font-semibold">
                    {m.totalQty.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs">
                    NPR {m.rate.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                  </TableCell>
                  <TableCell className="text-right font-mono font-semibold text-amber-600">
                    NPR {m.totalCost.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant="outline" className="text-xs">{m.tasks.length}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Daily cost chart */}
      {data.byDate.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Daily Material Cost</CardTitle>
          </CardHeader>
          <CardContent>
            <DailyCostChart byDate={data.byDate} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function DailyCostChart({ byDate }: { byDate: Array<{ date: string; cost: number }> }) {
  const maxCost = Math.max(...byDate.map((d) => d.cost), 1);
  return (
    <div>
      <div className="flex items-end gap-0.5 h-32 border-b border-l">
        {byDate.map((d, i) => (
          <div
            key={i}
            className="flex-1 bg-amber-500 rounded-t hover:bg-amber-600 transition-colors group relative"
            style={{ height: `${(d.cost / maxCost) * 100}%`, minHeight: d.cost > 0 ? "2px" : "0" }}
            title={`${d.date}: NPR ${d.cost.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`}
          />
        ))}
      </div>
      <div className="flex gap-0.5 mt-1">
        {byDate.map((d, i) => (
          <div key={i} className="flex-1 text-center text-[8px] text-muted-foreground">
            {i % 7 === 0 ? format(new Date(d.date), "dd") : ""}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Conflicts Tab ─────────────────────────────────────────
function ConflictsTab({ projectId, startDate, endDate }: { projectId: string; startDate: Date; endDate: Date }) {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.execution.resourceConflicts.useQuery({
    projectId,
    fromDate: startDate.toISOString(),
    toDate: endDate.toISOString(),
  });

  const autoGenMut = trpc.execution.autoGenerateProgram.useMutation({
    onSuccess: (data) => {
      utils.workflow.dailyProgram.listPrograms.invalidate({ projectId });
      toast.success(`Generated ${data.tasksAdded} tasks for today's program`);
    },
    onError: (e) => toast.error(e.message),
  });

  if (isLoading) {
    return <div className="flex h-40 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  const conflicts = data?.conflicts ?? [];
  const stats = data?.stats;

  return (
    <div className="space-y-4">
      {/* Quick action: auto-generate today's program */}
      <Card className="border-amber-300/50 bg-amber-50/30 dark:bg-amber-950/10">
        <CardContent className="py-3 flex items-center gap-3">
          <Zap className="h-5 w-5 text-amber-600 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium">Auto-generate today's daily program from Gantt</p>
            <p className="text-xs text-muted-foreground">
              Creates daily program tasks from Gantt tasks scheduled for today.
            </p>
          </div>
          <Button
            size="sm"
            onClick={() => autoGenMut.mutate({ projectId, date: new Date().toISOString() })}
            disabled={autoGenMut.isPending}
          >
            {autoGenMut.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Zap className="h-3.5 w-3.5 mr-1" />}
            Generate
          </Button>
        </CardContent>
      </Card>

      {/* Conflict summary */}
      {stats && (
        <div className="grid grid-cols-3 gap-2">
          <Card className="p-3 text-center">
            <div className={cn("text-lg font-bold", stats.total > 0 ? "text-red-600" : "text-emerald-600")}>
              {stats.total}
            </div>
            <div className="text-[9px] text-muted-foreground uppercase">Total Conflicts</div>
          </Card>
          <Card className="p-3 text-center">
            <div className="text-lg font-bold text-blue-600">{stats.byType.staff ?? 0}</div>
            <div className="text-[9px] text-muted-foreground uppercase">Staff</div>
          </Card>
          <Card className="p-3 text-center">
            <div className="text-lg font-bold text-purple-600">{stats.byType.equipment ?? 0}</div>
            <div className="text-[9px] text-muted-foreground uppercase">Equipment</div>
          </Card>
        </div>
      )}

      {/* Conflicts list */}
      {conflicts.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">
          <Users className="mx-auto h-10 w-10 mb-2 text-emerald-500/40" />
          No resource conflicts in this period.
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {conflicts.map((c, i) => (
            <Card key={i} className="border-red-200 dark:border-red-900">
              <CardContent className="py-3">
                <div className="flex items-start gap-3">
                  <div className={cn(
                    "shrink-0 h-8 w-8 rounded-full flex items-center justify-center",
                    c.resourceType === "staff" ? "bg-blue-100 dark:bg-blue-950" :
                    c.resourceType === "equipment" ? "bg-purple-100 dark:bg-purple-950" :
                    "bg-amber-100 dark:bg-amber-950"
                  )}>
                    {c.resourceType === "staff" ? <Users className="h-4 w-4 text-blue-600" /> :
                     c.resourceType === "equipment" ? <Wrench className="h-4 w-4 text-purple-600" /> :
                     <Users className="h-4 w-4 text-amber-600" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">{c.resourceName}</span>
                      <Badge variant="outline" className="text-[9px] capitalize">{c.resourceType}</Badge>
                      <Badge variant="outline" className="text-[9px] text-red-600">
                        {c.overlapDays} day overlap
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Assigned to <strong>{c.task1Name}</strong> and <strong>{c.task2Name}</strong> simultaneously
                      ({format(new Date(c.overlapStart), "dd MMM")} — {format(new Date(c.overlapEnd), "dd MMM")})
                    </p>
                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                      💡 {c.suggestion}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
