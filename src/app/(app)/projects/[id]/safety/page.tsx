"use client";
import { use, useState } from "react";
import { trpc } from "@/lib/trpc-client";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Loader2, Inbox, AlertTriangle, ShieldCheck, Eye, Megaphone } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { ModuleTabs } from "@/components/module-tabs";

const QS_TABS = [
  { label: "Quality", href: "/quality" },
  { label: "Punch List", href: "/punch-list" },
  { label: "Safety", href: "/safety" },
];

const TYPE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = { incident: AlertTriangle, near_miss: Eye, toolbox_talk: Megaphone, observation: ShieldCheck };
const SEVERITY_COLORS: Record<string, string> = { minor: "bg-slate-100 text-slate-600 dark:bg-slate-800", moderate: "bg-amber-100 text-amber-700 dark:bg-amber-950", serious: "bg-red-100 text-red-700 dark:bg-red-950", fatal: "bg-red-600 text-white" };

export default function SafetyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const utils = trpc.useUtils();
  const [addOpen, setAddOpen] = useState(false);
  const [type, setType] = useState("incident"); const [severity, setSeverity] = useState("minor");
  const [title, setTitle] = useState(""); const [description, setDescription] = useState("");
  const [location, setLocation] = useState(""); const [actionTaken, setActionTaken] = useState("");
  const [reportedBy, setReportedBy] = useState(""); const [toolboxTopic, setToolboxTopic] = useState("");
  const { data, isLoading } = trpc.projectOps.safety.list.useQuery({ projectId: id });
  const { data: stats } = trpc.projectOps.safety.stats.useQuery({ projectId: id });
  const incidents = data?.incidents ?? [];
  const createMut = trpc.projectOps.safety.create.useMutation({ onSuccess: () => { utils.projectOps.safety.list.invalidate({ projectId: id }); utils.projectOps.safety.stats.invalidate({ projectId: id }); setAddOpen(false); setTitle(""); setDescription(""); setLocation(""); setActionTaken(""); setReportedBy(""); setToolboxTopic(""); toast.success("Safety record created"); }, onError: (e) => toast.error(e.message) });
  const statusMut = trpc.projectOps.safety.updateStatus.useMutation({ onSuccess: () => { utils.projectOps.safety.list.invalidate({ projectId: id }); utils.projectOps.safety.stats.invalidate({ projectId: id }); toast.success("Status updated"); }, onError: (e) => toast.error(e.message) });

  return (
    <>
      <ModuleTabs projectId={id} tabs={QS_TABS} />
      <div className="space-y-6 pb-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div><div className="flex items-center gap-2 text-sm text-muted-foreground"><Link href={`/projects/${id}`} className="hover:text-foreground">Project</Link><span>/</span><span>Safety</span></div><h1 className="mt-1 text-2xl font-semibold tracking-tight">Safety Management</h1><p className="text-sm text-muted-foreground">Incidents, near-miss reports, toolbox talks, and safety observations.</p></div>
        <Dialog open={addOpen} onOpenChange={setAddOpen}><DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" /> New Record</Button></DialogTrigger>
          <DialogContent className="sm:max-w-md"><DialogHeader><DialogTitle>Safety Record</DialogTitle><DialogDescription>Report an incident, near-miss, toolbox talk, or observation.</DialogDescription></DialogHeader>
            <div className="space-y-3 py-2">
              <div className="grid grid-cols-2 gap-3"><div className="space-y-1.5"><Label className="text-xs">Type</Label><Select value={type} onValueChange={setType}><SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="incident">Incident</SelectItem><SelectItem value="near_miss">Near Miss</SelectItem><SelectItem value="toolbox_talk">Toolbox Talk</SelectItem><SelectItem value="observation">Observation</SelectItem></SelectContent></Select></div><div className="space-y-1.5"><Label className="text-xs">Severity</Label><Select value={severity} onValueChange={setSeverity}><SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="minor">Minor</SelectItem><SelectItem value="moderate">Moderate</SelectItem><SelectItem value="serious">Serious</SelectItem><SelectItem value="fatal">Fatal</SelectItem></SelectContent></Select></div></div>
              <div className="space-y-1.5"><Label className="text-xs">Title</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Worker cut hand on rebar" className="h-9 text-sm" /></div>
              <div className="space-y-1.5"><Label className="text-xs">Description</Label><Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="text-sm" /></div>
              <div className="grid grid-cols-2 gap-3"><div className="space-y-1.5"><Label className="text-xs">Location</Label><Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="0+250, Grid A-3" className="h-9 text-sm" /></div><div className="space-y-1.5"><Label className="text-xs">Reported By</Label><Input value={reportedBy} onChange={(e) => setReportedBy(e.target.value)} className="h-9 text-sm" /></div></div>
              <div className="space-y-1.5"><Label className="text-xs">Action Taken</Label><Textarea value={actionTaken} onChange={(e) => setActionTaken(e.target.value)} rows={2} className="text-sm" /></div>
              {type === "toolbox_talk" && <div className="space-y-1.5"><Label className="text-xs">Toolbox Topic</Label><Input value={toolboxTopic} onChange={(e) => setToolboxTopic(e.target.value)} placeholder="PPE compliance" className="h-9 text-sm" /></div>}
            </div>
            <DialogFooter><Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button><Button onClick={() => createMut.mutate({ projectId: id, type: type as any, severity: severity as any, title, description, location: location || undefined, reportedBy: reportedBy || undefined, actionTaken: actionTaken || undefined, toolboxTopic: toolboxTopic || undefined })} disabled={createMut.isPending || !title || !description}>{createMut.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />} Create</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      {stats && <div className="grid grid-cols-3 sm:grid-cols-6 gap-2"><Card className="p-3 text-center"><div className="text-lg font-bold text-slate-600">{stats.total}</div><div className="text-[9px] text-muted-foreground uppercase">Total</div></Card><Card className="p-3 text-center"><div className="text-lg font-bold text-red-600">{stats.incidents}</div><div className="text-[9px] text-muted-foreground uppercase">Incidents</div></Card><Card className="p-3 text-center"><div className="text-lg font-bold text-amber-600">{stats.nearMiss}</div><div className="text-[9px] text-muted-foreground uppercase">Near Miss</div></Card><Card className="p-3 text-center"><div className="text-lg font-bold text-blue-600">{stats.toolbox}</div><div className="text-[9px] text-muted-foreground uppercase">Toolbox</div></Card><Card className="p-3 text-center"><div className="text-lg font-bold text-orange-600">{stats.open}</div><div className="text-[9px] text-muted-foreground uppercase">Open</div></Card><Card className="p-3 text-center"><div className="text-lg font-bold text-emerald-600">{stats.resolved}</div><div className="text-[9px] text-muted-foreground uppercase">Resolved</div></Card></div>}
      {isLoading ? <Skeleton className="h-64" /> : incidents.length === 0 ? <Card><CardContent className="flex flex-col items-center justify-center py-16 text-center"><ShieldCheck className="h-12 w-12 text-emerald-500/40 mb-3" /><p className="text-sm text-muted-foreground">No safety records. Stay safe!</p></CardContent></Card> : (
        <div className="space-y-2">{incidents.map(inc => { const Icon = TYPE_ICONS[inc.type] ?? AlertTriangle; return (
          <Card key={inc.id}><CardContent className="p-3 flex items-start gap-3">
            <div className={cn("shrink-0 h-8 w-8 rounded-full flex items-center justify-center", inc.severity === "serious" || inc.severity === "fatal" ? "bg-red-100 dark:bg-red-950" : "bg-muted")}><Icon className={cn("h-4 w-4", inc.severity === "serious" || inc.severity === "fatal" ? "text-red-600" : "text-muted-foreground")} /></div>
            <div className="flex-1 min-w-0"><div className="flex items-center gap-2"><span className="text-sm font-medium">{inc.title}</span><span className={cn("rounded px-1 text-[9px] font-medium uppercase", SEVERITY_COLORS[inc.severity])}>{inc.severity}</span><span className="rounded bg-muted px-1 text-[9px] capitalize">{inc.type.replace(/_/g, " ")}</span></div><p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{inc.description}</p><div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground">{inc.location && <span>📍 {inc.location}</span>}{inc.reportedBy && <span>👤 {inc.reportedBy}</span>}<span>📅 {format(new Date(inc.date), "dd MMM yy")}</span></div></div>
            <div className="shrink-0"><span className={cn("rounded px-1.5 py-0.5 text-[9px] font-medium", inc.status === "closed" || inc.status === "resolved" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950" : "bg-amber-100 text-amber-700 dark:bg-amber-950")}>{inc.status}</span>{inc.status !== "closed" && inc.status !== "resolved" && <button onClick={() => statusMut.mutate({ id: inc.id, status: "resolved" })} className="block text-[9px] text-emerald-600 hover:underline mt-1">Resolve</button>}</div>
          </CardContent></Card>
        ); })}</div>
      )}
    </div>
    </>
  );
}
