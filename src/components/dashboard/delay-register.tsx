"use client";

import { trpc } from "@/lib/trpc-client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, Clock, CloudRain, Wrench, Users, FileX } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

type Props = { projectId: string };

const STATUS_CONFIG = {
  partially_completed: { label: "Partial", color: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400" },
  uncompleted: { label: "Not Done", color: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400" },
  postponed: { label: "Postponed", color: "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-400" },
};

const REASON_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  weather: CloudRain, material: FileX, equipment: Wrench, labor: Users, client: Clock, other: AlertTriangle,
};

export function DelayRegister({ projectId }: Props) {
  const { data, isLoading } = trpc.dashboard.delayRegister.useQuery({ projectId });

  if (isLoading) return <Card><CardContent><Skeleton className="h-48" /></CardContent></Card>;
  if (!data || data.delays.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> Delay Register</CardTitle></CardHeader>
        <CardContent><div className="text-center py-6 text-xs text-muted-foreground"><AlertTriangle className="h-8 w-8 mx-auto mb-2 opacity-30" /><p>No delayed tasks. All on track!</p></div></CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> Delay Register</CardTitle>
        <CardDescription className="text-xs">
          {data.stats.total} delayed tasks · {data.stats.eotCandidates} EOT candidates
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        <div className="flex flex-wrap gap-2 text-xs">
          {Object.entries(data.stats.byStatus).map(([status, count]) => (
            <span key={status} className={cn("rounded px-2 py-0.5 font-medium", STATUS_CONFIG[status as keyof typeof STATUS_CONFIG]?.color)}>
              {STATUS_CONFIG[status as keyof typeof STATUS_CONFIG]?.label}: {count}
            </span>
          ))}
          {Object.entries(data.stats.byReason).map(([reason, count]) => {
            const Icon = REASON_ICONS[reason] ?? AlertTriangle;
            return <span key={reason} className="rounded bg-muted dark:bg-[var(--navy-mid)] px-2 py-0.5 text-xs capitalize"><Icon className="inline h-2.5 w-2.5 mr-0.5" />{reason}: {count}</span>;
          })}
        </div>
        <div className="space-y-1 max-h-64 overflow-y-auto">
          {data.delays.map(d => (
            <div key={d.id} className="rounded border p-2 text-xs hover:bg-muted/30">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium truncate">{d.taskName}</span>
                <span className={cn("rounded px-1 text-[9px] uppercase shrink-0", STATUS_CONFIG[d.executionStatus as keyof typeof STATUS_CONFIG]?.color)}>
                  {STATUS_CONFIG[d.executionStatus as keyof typeof STATUS_CONFIG]?.label}
                </span>
              </div>
              <div className="text-[10px] text-muted-foreground flex items-center gap-2 mt-0.5">
                <span>{d.date ? format(new Date(d.date), "dd MMM") : "—"}</span>
                {d.boqCode && <span>· {d.boqCode}</span>}
                <span>· Plan: {d.plannedQty} / Actual: {d.actualQty} {d.unit || ""}</span>
                {d.remainingQty > 0 && <span className="text-red-600">· {d.remainingQty} {d.unit || ""} remaining</span>}
              </div>
              {d.delayNotes && <div className="text-[10px] text-amber-700 dark:text-amber-400 mt-0.5 italic">"{d.delayNotes}"</div>}
              {d.isEotCandidate && <span className="inline-block mt-1 rounded bg-red-100 text-red-700 px-1 text-[8px] font-bold uppercase">EOT Candidate</span>}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
