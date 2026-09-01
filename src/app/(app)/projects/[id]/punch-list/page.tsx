"use client";

import { use, useState } from "react";
import { trpc } from "@/lib/trpc-client";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogTrigger } from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Search, Inbox, AlertTriangle, CheckCircle2, Wrench } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { ModuleTabs } from "@/components/module-tabs";
import { CreatePunchDialog } from "./dialogs/create-punch-dialog";
import { PunchStatusActions } from "./components/punch-status-actions";


const SEVERITY_CONFIG: Record<string, { color: string; bg: string }> = {
  critical: { color: "text-red-600", bg: "bg-red-100 dark:bg-red-950" },
  major: { color: "text-amber-600", bg: "bg-amber-100 dark:bg-amber-950" },
  minor: { color: "text-slate-500", bg: "bg-slate-100 dark:bg-slate-800" },
};

const STATUS_FLOW: Record<string, string> = {
  open: "Open", in_progress: "In Progress", resolved: "Resolved", verified: "Verified", closed: "Closed",
};

export default function PunchListPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const utils = trpc.useUtils();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [addOpen, setAddOpen] = useState(false);

  const { data, isLoading } = trpc.punchList.list.useQuery({
    projectId: id, status: statusFilter === "all" ? undefined : statusFilter, severity: severityFilter === "all" ? undefined : severityFilter, q: search || undefined,
  });
  const { data: stats } = trpc.punchList.stats.useQuery({ projectId: id });
  const items = data?.items ?? [];

  return (
    <>
      <ModuleTabs projectId={id} cluster="quality-safety" />
      <div className="space-y-4 pb-8">
        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
            {[
              { label: "Total", value: stats.total, color: "text-slate-700" },
              { label: "Open", value: stats.open, color: "text-rose-700" },
              { label: "In Progress", value: stats.inProgress, color: "text-amber-700" },
              { label: "Resolved", value: stats.resolved, color: "text-emerald-700" },
              { label: "Verified", value: stats.verified, color: "text-[#0284c7]" },
            ].map(s => (
              <Card key={s.label} className="p-3 text-center bg-white border-[#c7d8e8] shadow-xs rounded-xl">
                <div className={cn("text-lg font-bold font-mono", s.color)}>{s.value}</div>
                <div className="text-[10px] text-slate-500 uppercase font-mono">{s.label}</div>
              </Card>
            ))}
          </div>
        )}

        {/* Single-Row Action & Filter Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl border border-[#c7d8e8] bg-[#e5eef7]">
          <div className="flex items-center gap-2 flex-1 flex-wrap">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <Input placeholder="Search snag/punch item..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-8 text-xs bg-white border-[#c7d8e8] text-slate-900 rounded-lg focus:border-[#0284c7]" />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-8 w-32 text-xs bg-white border-[#c7d8e8] text-slate-900 rounded-lg focus:border-[#0284c7]"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-white border-[#c7d8e8] text-slate-900 text-xs shadow-xl rounded-xl"><SelectItem value="all">All Status</SelectItem><SelectItem value="open">Open</SelectItem><SelectItem value="in_progress">In Progress</SelectItem><SelectItem value="resolved">Resolved</SelectItem><SelectItem value="verified">Verified</SelectItem><SelectItem value="closed">Closed</SelectItem></SelectContent>
            </Select>
            <Select value={severityFilter} onValueChange={setSeverityFilter}>
              <SelectTrigger className="h-8 w-32 text-xs bg-white border-[#c7d8e8] text-slate-900 rounded-lg focus:border-[#0284c7]"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-white border-[#c7d8e8] text-slate-900 text-xs shadow-xl rounded-xl"><SelectItem value="all">All Severity</SelectItem><SelectItem value="critical">Critical</SelectItem><SelectItem value="major">Major</SelectItem><SelectItem value="minor">Minor</SelectItem></SelectContent>
            </Select>
          </div>

          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="amber-cta-btn h-8 px-3.5 text-xs font-bold text-white rounded-lg shadow-sm gap-1.5 shrink-0">
                <Plus className="h-3.5 w-3.5" /> + Add Item (टिप्पणी थप्नुहोस्)
              </Button>
            </DialogTrigger>
            <CreatePunchDialog projectId={id} onDone={() => { setAddOpen(false); utils.punchList.list.invalidate({ projectId: id }); utils.punchList.stats.invalidate({ projectId: id }); }} />
          </Dialog>
        </div>

      {/* List */}
      {isLoading ? <Skeleton className="h-64 rounded-xl bg-slate-100" /> : items.length === 0 ? (
        <Card className="bg-white border-[#c7d8e8] shadow-xs rounded-xl"><CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <Inbox className="h-12 w-12 text-slate-400 mb-3" />
          <p className="text-sm font-medium text-slate-600">No punch items</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {items.map(item => {
            const sev = SEVERITY_CONFIG[item.severity] ?? SEVERITY_CONFIG.minor;
            return (
              <Card key={item.id} className="bg-white border-[#c7d8e8] shadow-xs hover:border-[#0284c7] transition-all rounded-xl">
                <CardContent className="p-3 flex items-start gap-3">
                  <div className={cn("shrink-0 h-8 w-8 rounded-full flex items-center justify-center", sev.bg)}>
                    {item.severity === "critical" ? <AlertTriangle className={cn("h-4 w-4", sev.color)} /> : item.status === "resolved" || item.status === "verified" ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Wrench className={cn("h-4 w-4", sev.color)} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-medium text-slate-500">{item.number}</span>
                      <span className="text-sm font-semibold text-slate-900 truncate">{item.title}</span>
                      <span className={cn("rounded px-1.5 py-0.5 text-[9px] font-bold uppercase", sev.bg, sev.color)}>{item.severity}</span>
                      <span className={cn("rounded px-1.5 py-0.5 text-[9px] font-bold",
                        item.status === "open" ? "bg-red-50 text-red-700 border border-red-200" :
                        item.status === "in_progress" ? "bg-amber-50 text-amber-700 border border-amber-200" :
                        item.status === "resolved" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" :
                        item.status === "verified" ? "bg-sky-50 text-sky-700 border border-sky-200" :
                        "bg-slate-100 text-slate-600 border border-slate-200"
                      )}>{STATUS_FLOW[item.status] ?? item.status}</span>
                    </div>
                    <p className="text-xs text-slate-600 mt-0.5 line-clamp-1">{item.description}</p>
                    <div className="flex items-center gap-3 mt-1 text-[10px] text-slate-500">
                      {item.location && <span>📍 {item.location}</span>}
                      {item.assignedTo && <span>👤 {item.assignedTo}</span>}
                      {item.dueDate && <span>📅 {format(new Date(item.dueDate), "dd MMM")}</span>}
                      <span>Created {format(new Date(item.createdAt), "dd MMM")}</span>
                    </div>
                  </div>
                  <PunchStatusActions item={item} projectId={id} onDone={() => { utils.punchList.list.invalidate({ projectId: id }); utils.punchList.stats.invalidate({ projectId: id }); }} />
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
    </>
  );
}


