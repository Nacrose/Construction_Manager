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
import {
  Plus, Search, Mail, Clock, Send, AlertTriangle, CheckCircle2,
  Loader2, FileText, Inbox, ArrowDownLeft, ArrowUpRight,
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { ModuleTabs } from "@/components/module-tabs";
import { CATEGORIES, CATEGORY_COLORS } from "./components/constants";
import { StatCard } from "./components/stat-card";
import { LogLetterDialog } from "./components/log-letter-dialog";
import { LetterDetailDialog } from "./components/letter-detail-dialog";

const WF_TABS = [
  { label: "RFIs", href: "/workflow/rfi" },
  { label: "Daily Program", href: "/workflow/program" },
  { label: "Daily Reports", href: "/workflow/reports" },
  { label: "Correspondence", href: "/correspondence" },
  { label: "Meetings", href: "/meetings" },
];

const REPLY_STATUS_CONFIG = {
  not_started: { label: "Not Started", icon: Clock, color: "text-slate-500", bg: "bg-slate-100 dark:bg-slate-800" },
  in_progress: { label: "In Progress", icon: Loader2, color: "text-blue-600", bg: "bg-blue-100 dark:bg-blue-950" },
  drafted: { label: "Drafted", icon: FileText, color: "text-amber-600", bg: "bg-amber-100 dark:bg-amber-950" },
  sent: { label: "Sent", icon: Send, color: "text-emerald-600", bg: "bg-emerald-100 dark:bg-emerald-950" },
  closed: { label: "Closed", icon: CheckCircle2, color: "text-slate-400", bg: "bg-slate-100 dark:bg-slate-800" },
};

export default function CorrespondencePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const utils = trpc.useUtils();

  const [search, setSearch] = useState("");
  const [filterDirection, setFilterDirection] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterOverdue, setFilterOverdue] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  const { data, isLoading } = trpc.correspondence.list.useQuery({
    projectId: id,
    direction: filterDirection === "all" ? undefined : filterDirection,
    replyStatus: filterStatus === "all" ? undefined : filterStatus,
    q: search || undefined,
    overdue: filterOverdue || undefined,
  });

  const { data: statsData } = trpc.correspondence.stats.useQuery({ projectId: id });
  const letters = data?.letters ?? [];

  return (
    <>
      <ModuleTabs projectId={id} tabs={WF_TABS} />
      <div className="space-y-6 pb-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Link href={`/projects/${id}`} className="hover:text-foreground">Project</Link>
            <span>/</span><span>Correspondence</span>
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Correspondence Register</h1>
          <p className="text-sm text-muted-foreground">Formal letter tracking with full traceability and accountability.</p>
        </div>
        <Dialog open={logOpen} onOpenChange={setLogOpen}>
          <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" /> Log Letter</Button></DialogTrigger>
          <LogLetterDialog projectId={id} onDone={() => { setLogOpen(false); utils.correspondence.list.invalidate({ projectId: id }); utils.correspondence.stats.invalidate({ projectId: id }); }} />
        </Dialog>
      </div>

      {/* Stats bar */}
      {statsData && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          <StatCard label="Total" value={statsData.total} icon={Mail} color="text-slate-600" />
          <StatCard label="Incoming" value={statsData.incoming} icon={ArrowDownLeft} color="text-blue-600" />
          <StatCard label="Outgoing" value={statsData.outgoing} icon={ArrowUpRight} color="text-emerald-600" />
          <StatCard label="Actionable" value={statsData.actionable} icon={FileText} color="text-amber-600" />
          <StatCard label="Overdue" value={statsData.overdue} icon={AlertTriangle} color="text-red-600" urgent={statsData.overdue > 0} />
        </div>
      )}

      {/* Overdue alert */}
      {statsData && statsData.overdue > 0 && (
        <Card className="border-red-200 dark:border-red-900 bg-red-50/50 dark:bg-red-950/20">
          <CardContent className="flex items-center gap-3 p-3">
            <AlertTriangle className="h-4 w-4 text-red-600 shrink-0" />
            <div className="flex-1 text-xs">
              <span className="font-medium text-red-700 dark:text-red-400">{statsData.overdue} letter(s) overdue for reply!</span>
              <span className="text-red-600/70 dark:text-red-400/70 ml-2">Click "Overdue" filter to see them.</span>
            </div>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setFilterOverdue(!filterOverdue)}>
              {filterOverdue ? "Show All" : "Show Overdue"}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search subject, ref, from..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-9" />
        </div>
        <Select value={filterDirection} onValueChange={setFilterDirection}>
          <SelectTrigger className="h-9 w-32 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="incoming">Incoming</SelectItem>
            <SelectItem value="outgoing">Outgoing</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="h-9 w-36 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="not_started">Not Started</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="drafted">Drafted</SelectItem>
            <SelectItem value="sent">Sent</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Letter list */}
      {isLoading ? (
        <Skeleton className="h-96" />
      ) : letters.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Inbox className="h-12 w-12 text-muted-foreground/40 mb-3" />
            <p className="text-sm font-medium text-muted-foreground">No letters logged</p>
            <p className="text-xs text-muted-foreground/70 mt-1">Click "Log Letter" to start tracking correspondence.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/30">
              <tr>
                <th className="p-2 text-left font-medium text-muted-foreground">Dir</th>
                <th className="p-2 text-left font-medium text-muted-foreground">Our Ref</th>
                <th className="p-2 text-left font-medium text-muted-foreground">Their Ref</th>
                <th className="p-2 text-left font-medium text-muted-foreground">Subject</th>
                <th className="p-2 text-left font-medium text-muted-foreground">From</th>
                <th className="p-2 text-left font-medium text-muted-foreground">Category</th>
                <th className="p-2 text-left font-medium text-muted-foreground">Type</th>
                <th className="p-2 text-left font-medium text-muted-foreground">Reply Status</th>
                <th className="p-2 text-left font-medium text-muted-foreground">Due</th>
                <th className="p-2 text-left font-medium text-muted-foreground">Date</th>
              </tr>
            </thead>
            <tbody>
              {letters.map((l) => {
                const isOverdue = l.replyDueDate && new Date(l.replyDueDate) < new Date() && (l.replyStatus === "not_started" || l.replyStatus === "in_progress");
                const replyCfg = REPLY_STATUS_CONFIG[l.replyStatus as keyof typeof REPLY_STATUS_CONFIG] ?? REPLY_STATUS_CONFIG.not_started;
                const ReplyIcon = replyCfg.icon;
                return (
                  <tr key={l.id} className="border-t hover:bg-muted/20 cursor-pointer" onClick={() => setDetailId(l.id)}>
                    <td className="p-2">
                      {l.direction === "incoming" ? (
                        <ArrowDownLeft className="h-3.5 w-3.5 text-blue-600" />
                      ) : (
                        <ArrowUpRight className="h-3.5 w-3.5 text-emerald-600" />
                      )}
                    </td>
                    <td className="p-2 font-mono text-[10px]">{l.ourRef ?? "—"}</td>
                    <td className="p-2 font-mono text-[10px] text-muted-foreground">{l.theirRef ?? "—"}</td>
                    <td className="p-2 max-w-48 truncate font-medium">{l.subject}</td>
                    <td className="p-2 text-muted-foreground">{l.fromName ?? l.fromParty ?? "—"}</td>
                    <td className="p-2">
                      <span className={cn("rounded px-1 text-[9px] font-medium uppercase", CATEGORY_COLORS[l.category])}>
                        {CATEGORIES.find(c => c.value === l.category)?.label ?? l.category}
                      </span>
                    </td>
                    <td className="p-2">
                      {l.letterType === "actionable" ? (
                        <span className="text-amber-600 font-medium text-[9px]">⚡ Action</span>
                      ) : (
                        <span className="text-slate-400 text-[9px]">ℹ Info</span>
                      )}
                    </td>
                    <td className="p-2">
                      <span className={cn("inline-flex items-center gap-0.5 rounded px-1 text-[9px] font-medium", replyCfg.bg, replyCfg.color)}>
                        <ReplyIcon className="h-2 w-2" /> {replyCfg.label}
                      </span>
                    </td>
                    <td className="p-2">
                      {l.replyDueDate ? (
                        <span className={cn("text-[10px]", isOverdue ? "text-red-600 font-bold" : "text-muted-foreground")}>
                          {format(new Date(l.replyDueDate), "dd MMM")}
                          {isOverdue && " ⚠"}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="p-2 text-[10px] text-muted-foreground">{format(new Date(l.date), "dd MMM yy")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail dialog */}
      {detailId && (
        <LetterDetailDialog
          letterId={detailId}
          projectId={id}
          onClose={() => setDetailId(null)}
          onUpdated={() => {
            utils.correspondence.list.invalidate({ projectId: id });
            utils.correspondence.stats.invalidate({ projectId: id });
          }}
        />
      )}
      </div>
    </>
  );
}


