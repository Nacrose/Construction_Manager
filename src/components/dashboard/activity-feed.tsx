"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc-client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Activity, FileText, ClipboardCheck, Wrench, Package, Users, Shield,
  DollarSign, Send, CheckCircle2, AlertTriangle, CloudSun,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

type Props = {
  projectId: string;
  limit?: number;
};

const ACTION_CONFIG: Record<string, { icon: React.ComponentType<{ className?: string }>; color: string; label: string }> = {
  "rfi.": { icon: FileText, color: "text-info", label: "RFI" },
  "daily_report.": { icon: ClipboardCheck, color: "text-success", label: "Daily Report" },
  "daily_program.": { icon: CloudSun, color: "text-purple-600", label: "Daily Program" },
  "project.": { icon: Activity, color: "text-muted-foreground", label: "Project" },
  "boq.": { icon: Package, color: "text-amber-600", label: "BOQ" },
  "gantt.": { icon: Activity, color: "text-indigo-600", label: "Schedule" },
  "material.": { icon: Package, color: "text-orange-600", label: "Material" },
  "equipment.": { icon: Wrench, color: "text-info", label: "Equipment" },
  "hr.": { icon: Users, color: "text-pink-600", label: "HR" },
  "approved_doc.": { icon: Shield, color: "text-success", label: "Document" },
  "project_cost.": { icon: DollarSign, color: "text-success", label: "Cost" },
  "report_template.": { icon: FileText, color: "text-violet-600", label: "Template" },
};

function getActionConfig(action: string) {
  for (const [prefix, cfg] of Object.entries(ACTION_CONFIG)) {
    if (action.startsWith(prefix)) return cfg;
  }
  return { icon: Activity, color: "text-muted-foreground", label: "Other" };
}

export function ActivityFeed({ projectId, limit = 50 }: Props) {
  const [filter, setFilter] = useState<string>("all");

  const { data, isLoading } = trpc.dashboard.activityFeed.useQuery({
    projectId,
    limit,
    action: filter !== "all" ? filter : undefined,
  });

  const logs = data?.logs ?? [];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm flex items-center gap-2">
              <Activity className="h-4 w-4" /> Activity Feed
            </CardTitle>
            <CardDescription className="text-xs">
              {logs.length} recent event{logs.length !== 1 ? "s" : ""}
            </CardDescription>
          </div>
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="h-7 w-36 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All activities</SelectItem>
              <SelectItem value="rfi.">RFIs</SelectItem>
              <SelectItem value="daily_report.">Daily Reports</SelectItem>
              <SelectItem value="daily_program.">Daily Programs</SelectItem>
              <SelectItem value="project_cost.">Costs</SelectItem>
              <SelectItem value="approved_doc.">Documents</SelectItem>
              <SelectItem value="boq.">BOQ</SelectItem>
              <SelectItem value="gantt.">Schedule</SelectItem>
              <SelectItem value="material.">Materials</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {isLoading ? (
          <Skeleton className="h-48" />
        ) : logs.length === 0 ? (
          <div className="text-center py-8 text-xs text-muted-foreground">
            <Activity className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p>No activity yet.</p>
          </div>
        ) : (
          <div className="space-y-1 max-h-96 overflow-y-auto">
            {logs.map((log) => {
              const cfg = getActionConfig(log.action);
              const Icon = cfg.icon;
              const actionLabel = log.action
                .replace(/^[a-z_]+\./, "")
                .replace(/_/g, " ");

              return (
                <div key={log.id} className="flex items-start gap-2 rounded border p-2 text-xs hover:bg-muted/30">
                  <div className={cn("shrink-0 h-7 w-7 rounded-full flex items-center justify-center bg-muted/50", cfg.color)}>
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{log.user?.name ?? "System"}</span>
                      <span className="text-muted-foreground">{actionLabel}</span>
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {cfg.label} · {formatDistanceToNow(new Date(log.createdAt), { addSuffix: true })}
                    </div>
                    {log.metadata && (
                      <div className="text-[9px] text-muted-foreground/70 mt-0.5 truncate">
                        {(() => {
                          try {
                            const m = JSON.parse(log.metadata);
                            return Object.entries(m)
                              .filter(([k]) => !["changes", "ipAddress"].includes(k))
                              .map(([k, v]) => `${k}: ${String(v).slice(0, 50)}`)
                              .join(" · ");
                          } catch { return null; }
                        })()}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
