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
const SEVERITY_COLORS: Record<string, string> = { minor: "bg-muted text-muted-foreground dark:bg-[var(--navy-mid)]", moderate: "bg-amber-100 text-amber-700 dark:bg-amber-950", serious: "bg-red-100 text-red-700 dark:bg-red-950", fatal: "bg-red-600 text-white" };

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
      <div className="space-y-4 pb-8">
        {/* Metric Cards */}
        {stats && (
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            <Card className="p-3 text-center bg-card border-[var(--border)] shadow-xs rounded-xl"><div className="text-lg font-bold font-mono text-foreground/80">{stats.total}</div><div className="text-[10px] text-muted-foreground uppercase font-mono">Total</div></Card>
            <Card className="p-3 text-center bg-card border-[var(--border)] shadow-xs rounded-xl"><div className="text-lg font-bold font-mono text-rose-700">{stats.incidents}</div><div className="text-[10px] text-muted-foreground uppercase font-mono">Incidents</div></Card>
            <Card className="p-3 text-center bg-card border-[var(--border)] shadow-xs rounded-xl"><div className="text-lg font-bold font-mono text-amber-700">{stats.nearMiss}</div><div className="text-[10px] text-muted-foreground uppercase font-mono">Near Miss</div></Card>
            <Card className="p-3 text-center bg-card border-[var(--border)] shadow-xs rounded-xl"><div className="text-lg font-bold font-mono text-[var(--primary)]">{stats.toolbox}</div><div className="text-[10px] text-muted-foreground uppercase font-mono">Toolbox</div></Card>
            <Card className="p-3 text-center bg-card border-[var(--border)] shadow-xs rounded-xl"><div className="text-lg font-bold font-mono text-orange-700">{stats.open}</div><div className="text-[10px] text-muted-foreground uppercase font-mono">Open</div></Card>
            <Card className="p-3 text-center bg-card border-[var(--border)] shadow-xs rounded-xl"><div className="text-lg font-bold font-mono text-success">{stats.resolved}</div><div className="text-[10px] text-muted-foreground uppercase font-mono">Resolved</div></Card>
          </div>
        )}

        {/* Single-Row Action Strip */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl border border-[var(--border)] bg-[var(--background)]">
          <div className="flex items-center gap-2 text-xs font-mono text-foreground/80">
            <span className="font-bold">Safety Log ({incidents.length} records)</span>
          </div>

          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="amber-cta-btn h-8 px-3.5 text-xs font-bold text-white rounded-lg shadow-sm gap-1.5 shrink-0 font-sans">
                <Plus className="h-3.5 w-3.5" /> + New Safety Record (सुरक्षा अभिलेख)
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[560px] w-full p-0 gap-0 bg-card border border-[var(--border)] text-foreground rounded-2xl shadow-2xl overflow-hidden font-sans">
              <div className="px-6 py-4 border-b border-[var(--input)] bg-[#f8fbfe] flex items-center justify-between">
                <div>
                  <DialogTitle className="text-base font-bold text-foreground">Log Safety Record (सुरक्षा अभिलेख दर्ता)</DialogTitle>
                  <DialogDescription className="text-xs text-muted-foreground mt-0.5">Report an incident, near-miss, toolbox talk, or site observation.</DialogDescription>
                </div>
              </div>
              <div className="p-6 space-y-3.5 text-xs bg-card">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-semibold text-foreground/80">Type</Label>
                    <Select value={type} onValueChange={setType}>
                      <SelectTrigger className="h-9 text-xs bg-card border-[var(--border)] text-foreground focus:border-[var(--primary)]"><SelectValue /></SelectTrigger>
                      <SelectContent className="bg-card border-[var(--border)] text-foreground text-xs shadow-xl rounded-xl"><SelectItem value="incident">Incident</SelectItem><SelectItem value="near_miss">Near Miss</SelectItem><SelectItem value="toolbox_talk">Toolbox Talk</SelectItem><SelectItem value="observation">Observation</SelectItem></SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-semibold text-foreground/80">Severity</Label>
                    <Select value={severity} onValueChange={setSeverity}>
                      <SelectTrigger className="h-9 text-xs bg-card border-[var(--border)] text-foreground focus:border-[var(--primary)]"><SelectValue /></SelectTrigger>
                      <SelectContent className="bg-card border-[var(--border)] text-foreground text-xs shadow-xl rounded-xl"><SelectItem value="minor">Minor</SelectItem><SelectItem value="moderate">Moderate</SelectItem><SelectItem value="serious">Serious</SelectItem><SelectItem value="fatal">Fatal</SelectItem></SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1.5"><Label className="text-[11px] font-semibold text-foreground/80">Title *</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Worker cut hand on rebar" className="h-9 text-xs bg-card border-[var(--border)] text-foreground focus:border-[var(--primary)]" /></div>
                <div className="space-y-1.5"><Label className="text-[11px] font-semibold text-foreground/80">Description *</Label><Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="text-xs bg-card border-[var(--border)] text-foreground focus:border-[var(--primary)]" /></div>
                <div className="grid grid-cols-2 gap-3"><div className="space-y-1.5"><Label className="text-[11px] font-semibold text-foreground/80">Location</Label><Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="0+250, Grid A-3" className="h-9 text-xs bg-card border-[var(--border)] text-foreground focus:border-[var(--primary)]" /></div><div className="space-y-1.5"><Label className="text-[11px] font-semibold text-foreground/80">Reported By</Label><Input value={reportedBy} onChange={(e) => setReportedBy(e.target.value)} className="h-9 text-xs bg-card border-[var(--border)] text-foreground focus:border-[var(--primary)]" /></div></div>
                <div className="space-y-1.5"><Label className="text-[11px] font-semibold text-foreground/80">Action Taken</Label><Textarea value={actionTaken} onChange={(e) => setActionTaken(e.target.value)} rows={2} className="text-xs bg-card border-[var(--border)] text-foreground focus:border-[var(--primary)]" /></div>
                {type === "toolbox_talk" && <div className="space-y-1.5"><Label className="text-[11px] font-semibold text-foreground/80">Toolbox Topic</Label><Input value={toolboxTopic} onChange={(e) => setToolboxTopic(e.target.value)} placeholder="PPE compliance" className="h-9 text-xs bg-card border-[var(--border)] text-foreground focus:border-[var(--primary)]" /></div>}

                <div className="flex justify-end gap-2.5 pt-3 border-t border-[var(--input)]">
                  <Button variant="outline" size="sm" onClick={() => setAddOpen(false)} className="h-8 text-xs border-[var(--border)] text-muted-foreground hover:bg-muted">Cancel</Button>
                  <Button size="sm" onClick={() => createMut.mutate({ projectId: id, type: type as any, severity: severity as any, title, description, location: location || undefined, reportedBy: reportedBy || undefined, actionTaken: actionTaken || undefined, toolboxTopic: toolboxTopic || undefined })} disabled={createMut.isPending || !title || !description} className="amber-cta-btn h-8 text-xs font-bold text-white shadow-sm">
                    {createMut.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />} Create Record (दर्ता गर्नुहोस्)
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      {isLoading ? <Skeleton className="h-64 rounded-xl bg-muted" /> : incidents.length === 0 ? <Card className="bg-card border-[var(--border)] shadow-xs rounded-xl"><CardContent className="flex flex-col items-center justify-center py-16 text-center"><ShieldCheck className="h-12 w-12 text-[var(--primary)] mb-3" /><p className="text-sm text-muted-foreground">No safety records. Stay safe!</p></CardContent></Card> : (
        <div className="space-y-2">{incidents.map(inc => { const Icon = TYPE_ICONS[inc.type] ?? AlertTriangle; return (
          <Card key={inc.id} className="bg-card border-[var(--border)] shadow-xs hover:border-[var(--primary)] transition-all rounded-xl"><CardContent className="p-3 flex items-start gap-3">
            <div className={cn("shrink-0 h-8 w-8 rounded-full flex items-center justify-center", inc.severity === "serious" || inc.severity === "fatal" ? "bg-rose-50 border border-rose-200" : "bg-muted")}><Icon className={cn("h-4 w-4", inc.severity === "serious" || inc.severity === "fatal" ? "text-rose-600" : "text-muted-foreground")} /></div>
            <div className="flex-1 min-w-0"><div className="flex items-center gap-2"><span className="text-sm font-semibold text-foreground">{inc.title}</span><span className={cn("rounded px-1.5 py-0.5 text-[9px] font-bold uppercase", SEVERITY_COLORS[inc.severity])}>{inc.severity}</span><span className="rounded bg-muted text-foreground/80 px-1.5 py-0.5 text-[9px] capitalize font-medium">{inc.type.replace(/_/g, " ")}</span></div><p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{inc.description}</p><div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground">{inc.location && <span>📍 {inc.location}</span>}{inc.reportedBy && <span>👤 {inc.reportedBy}</span>}<span>📅 {format(new Date(inc.date), "dd MMM yy")}</span></div></div>
            <div className="shrink-0"><span className={cn("rounded px-1.5 py-0.5 text-[9px] font-bold", inc.status === "closed" || inc.status === "resolved" ? "bg-success/10 text-success border border-success/30" : "bg-amber-50 text-amber-700 border border-amber-200")}>{inc.status}</span>{inc.status !== "closed" && inc.status !== "resolved" && <button onClick={() => statusMut.mutate({ id: inc.id, status: "resolved" })} className="block text-[9px] text-[var(--primary)] font-bold hover:underline mt-1">Resolve</button>}</div>
          </CardContent></Card>
        ); })}</div>
      )}
    </div>
    </>
  );
}
