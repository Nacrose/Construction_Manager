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
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Loader2, Inbox, Calendar, Users, CheckSquare } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { ModuleTabs } from "@/components/module-tabs";

const WF_TABS = [
  { label: "RFIs", href: "/workflow/rfi" },
  { label: "Daily Program", href: "/workflow/program" },
  { label: "Daily Reports", href: "/workflow/reports" },
  { label: "Correspondence", href: "/correspondence" },
  { label: "Meetings", href: "/meetings" },
];

import { getLocalDateString } from "@/lib/nepali-calendar";

export default function MeetingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const utils = trpc.useUtils();
  const [addOpen, setAddOpen] = useState(false);
  const [title, setTitle] = useState(""); const [type, setType] = useState("site_coordination");
  const [date, setDate] = useState(() => getLocalDateString()); const [location, setLocation] = useState("");
  const [attendees, setAttendees] = useState(""); const [agenda, setAgenda] = useState("");
  const [detailId, setDetailId] = useState<string | null>(null);
  const { data, isLoading } = trpc.projectOps.meeting.list.useQuery({ projectId: id });
  const meetings = data?.meetings ?? [];
  const createMut = trpc.projectOps.meeting.create.useMutation({ onSuccess: () => { utils.projectOps.meeting.list.invalidate({ projectId: id }); setAddOpen(false); setTitle(""); setLocation(""); setAttendees(""); setAgenda(""); toast.success("Meeting scheduled"); }, onError: (e) => toast.error(e.message) });

  return (
    <>
      <ModuleTabs projectId={id} tabs={WF_TABS} />
      <div className="space-y-4 pb-8">
        {/* Single-Row Action Strip */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl border border-[var(--border)] bg-[var(--background)]">
          <div className="flex items-center gap-2 text-xs font-mono text-foreground/80">
            <span className="font-bold">Meeting Minutes ({meetings.length} meetings)</span>
          </div>

          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="amber-cta-btn h-8 px-3.5 text-xs font-bold text-white rounded-lg shadow-sm gap-1.5 shrink-0 font-sans">
                <Plus className="h-3.5 w-3.5" /> + Schedule Meeting (बैठक तय)
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[560px] w-full p-0 gap-0 bg-card border border-[var(--border)] text-foreground rounded-2xl shadow-2xl overflow-hidden font-sans">
              <div className="px-6 py-4 border-b border-[var(--input)] bg-[#f8fbfe] flex items-center justify-between">
                <DialogTitle className="text-base font-bold text-foreground">Schedule Project Meeting (बैठक तय गर्नुहोस्)</DialogTitle>
              </div>
              <div className="p-6 space-y-3.5 text-xs bg-card">
                <div className="space-y-1.5"><Label className="text-[11px] font-semibold text-foreground/80">Title *</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Weekly site coordination" className="h-9 text-xs bg-card border-[var(--border)] text-foreground focus:border-[var(--primary)]" /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5"><Label className="text-[11px] font-semibold text-foreground/80">Type</Label>
                    <Select value={type} onValueChange={setType}>
                      <SelectTrigger className="h-9 text-xs bg-card border-[var(--border)] text-foreground focus:border-[var(--primary)]"><SelectValue /></SelectTrigger>
                      <SelectContent className="bg-card border-[var(--border)] text-foreground text-xs shadow-xl rounded-xl">
                        <SelectItem value="site_coordination">Site Coordination</SelectItem>
                        <SelectItem value="progress_review">Progress Review</SelectItem>
                        <SelectItem value="design_coordination">Design Coordination</SelectItem>
                        <SelectItem value="safety">Safety</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5"><Label className="text-[11px] font-semibold text-foreground/80">Date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-9 text-xs font-mono bg-card border-[var(--border)] text-foreground focus:border-[var(--primary)]" /></div>
                </div>
                <div className="space-y-1.5"><Label className="text-[11px] font-semibold text-foreground/80">Location</Label><Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Site office" className="h-9 text-xs bg-card border-[var(--border)] text-foreground focus:border-[var(--primary)]" /></div>
                <div className="space-y-1.5"><Label className="text-[11px] font-semibold text-foreground/80">Attendees (comma-separated)</Label><Input value={attendees} onChange={(e) => setAttendees(e.target.value)} placeholder="Er. Ram, Er. Sita, Mr. Sharma" className="h-9 text-xs bg-card border-[var(--border)] text-foreground focus:border-[var(--primary)]" /></div>
                <div className="space-y-1.5"><Label className="text-[11px] font-semibold text-foreground/80">Agenda</Label><Textarea value={agenda} onChange={(e) => setAgenda(e.target.value)} rows={2} className="text-xs bg-card border-[var(--border)] text-foreground focus:border-[var(--primary)]" /></div>

                <div className="flex justify-end gap-2.5 pt-3 border-t border-[var(--input)]">
                  <Button variant="outline" size="sm" onClick={() => setAddOpen(false)} className="h-8 text-xs border-[var(--border)] text-muted-foreground hover:bg-muted">Cancel</Button>
                  <Button size="sm" onClick={() => createMut.mutate({ projectId: id, title, type: type as any, date: new Date(date).toISOString(), location: location || undefined, attendees: attendees || undefined, agenda: agenda || undefined })} disabled={createMut.isPending || !title} className="amber-cta-btn h-8 text-xs font-bold text-white shadow-sm">
                    {createMut.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />} Schedule Meeting (तय गर्नुहोस्)
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      {isLoading ? <Skeleton className="h-64 rounded-xl bg-muted" /> : meetings.length === 0 ? <Card className="bg-card border-[var(--border)] shadow-xs rounded-xl"><CardContent className="flex flex-col items-center justify-center py-16 text-center"><Calendar className="h-12 w-12 text-muted-foreground/80 mb-3" /><p className="text-sm text-muted-foreground">No meetings scheduled.</p></CardContent></Card> : (
        <div className="space-y-2">{meetings.map(m => (
          <Card key={m.id} className="bg-card border-[var(--border)] shadow-xs hover:border-[var(--primary)] transition-all cursor-pointer rounded-xl" onClick={() => setDetailId(m.id)}><CardContent className="p-3 flex items-start gap-3">
            <div className="shrink-0 h-8 w-8 rounded-full bg-info/10 flex items-center justify-center border border-[#bae6fd]"><Calendar className="h-4 w-4 text-[var(--primary)]" /></div>
            <div className="flex-1 min-w-0"><div className="flex items-center gap-2"><span className="text-sm font-semibold text-foreground">{m.title}</span><span className="rounded bg-muted text-foreground/80 px-1.5 py-0.5 text-[9px] capitalize font-medium">{m.type.replace(/_/g, " ")}</span><span className={cn("rounded px-1.5 py-0.5 text-[9px] font-bold", m.status === "completed" ? "bg-success/10 text-success border border-success/30" : m.status === "cancelled" ? "bg-red-50 text-red-700 border border-red-200" : "bg-amber-50 text-amber-700 border border-amber-200")}>{m.status}</span></div><div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground font-matrix"><span>📅 {format(new Date(m.date), "dd MMM yyyy, HH:mm")}</span>{m.location && <span>📍 {m.location}</span>}<span className="flex items-center gap-0.5"><CheckSquare className="h-2.5 w-2.5" /> {m._count?.actionItems ?? 0} action items</span></div></div>
          </CardContent></Card>
        ))}</div>
      )}
      {detailId && <MeetingDetailDialog meetingId={detailId} projectId={id} onClose={() => setDetailId(null)} />}
      </div>
    </>
  );
}

function MeetingDetailDialog({ meetingId, projectId, onClose }: { meetingId: string; projectId: string; onClose: () => void }) {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.projectOps.meeting.get.useQuery({ id: meetingId });
  const m = data?.meeting;
  const [minutes, setMinutes] = useState(""); const [actionDesc, setActionDesc] = useState(""); const [actionAssignee, setActionAssignee] = useState(""); const [actionDue, setActionDue] = useState("");
  const updateMut = trpc.projectOps.meeting.update.useMutation({ onSuccess: () => { utils.projectOps.meeting.get.invalidate({ id: meetingId }); utils.projectOps.meeting.list.invalidate({ projectId }); toast.success("Minutes saved"); }, onError: (e) => toast.error(e.message) });
  const addActionMut = trpc.projectOps.meeting.addActionItem.useMutation({ onSuccess: () => { utils.projectOps.meeting.get.invalidate({ id: meetingId }); utils.projectOps.meeting.list.invalidate({ projectId }); setActionDesc(""); setActionAssignee(""); setActionDue(""); toast.success("Action item added"); }, onError: (e) => toast.error(e.message) });
  const updateActionMut = trpc.projectOps.meeting.updateActionItem.useMutation({ onSuccess: () => { utils.projectOps.meeting.get.invalidate({ id: meetingId }); toast.success("Action item updated"); }, onError: (e) => toast.error(e.message) });
  if (m && !minutes && m.minutes) setMinutes(m.minutes);

  return (
    <Dialog open={true} onOpenChange={(o) => { if (!o) onClose(); }}><DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>{m?.title ?? "Loading..."}</DialogTitle></DialogHeader>
      {isLoading ? <Skeleton className="h-48" /> : m ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2 text-xs"><div><span className="text-muted-foreground">Date:</span> {format(new Date(m.date), "dd MMM yyyy, HH:mm")}</div><div><span className="text-muted-foreground">Type:</span> <span className="capitalize">{m.type.replace(/_/g, " ")}</span></div>{m.location && <div><span className="text-muted-foreground">Location:</span> {m.location}</div>}{m.attendees && <div className="col-span-2"><span className="text-muted-foreground">Attendees:</span> {m.attendees}</div>}{m.agenda && <div className="col-span-2"><span className="text-muted-foreground">Agenda:</span> {m.agenda}</div>}</div>
          <div className="space-y-1.5"><Label className="text-xs">Minutes</Label><Textarea value={minutes} onChange={(e) => setMinutes(e.target.value)} rows={4} className="text-sm" onBlur={() => updateMut.mutate({ id: meetingId, minutes })} placeholder="Record meeting minutes..." /></div>
          <div><p className="text-xs font-semibold uppercase text-muted-foreground mb-1">Action Items ({m.actionItems.length})</p><div className="space-y-1">{m.actionItems.map(ai => (<div key={ai.id} className="flex items-center gap-2 rounded border p-1.5 text-xs"><input type="checkbox" checked={ai.status === "completed"} onChange={() => updateActionMut.mutate({ id: ai.id, status: ai.status === "completed" ? "open" : "completed" })} className="shrink-0" /><div className="flex-1 min-w-0"><span className={cn(ai.status === "completed" && "line-through text-muted-foreground")}>{ai.description}</span><div className="text-[9px] text-muted-foreground">👤 {ai.assignedTo}{ai.dueDate && <> · 📅 {format(new Date(ai.dueDate), "dd MMM")}</>}</div></div></div>))}</div><div className="border-t pt-2 space-y-1.5"><div className="grid grid-cols-2 gap-2"><Input value={actionDesc} onChange={(e) => setActionDesc(e.target.value)} placeholder="Action item description" className="h-8 text-xs" /><Input value={actionAssignee} onChange={(e) => setActionAssignee(e.target.value)} placeholder="Assigned to" className="h-8 text-xs" /></div><div className="flex gap-2"><Input type="date" value={actionDue} onChange={(e) => setActionDue(e.target.value)} className="h-8 text-xs flex-1" /><Button size="sm" className="h-8 text-xs" onClick={() => addActionMut.mutate({ meetingId, description: actionDesc, assignedTo: actionAssignee, dueDate: actionDue ? new Date(actionDue).toISOString() : undefined })} disabled={addActionMut.isPending || !actionDesc || !actionAssignee}>Add</Button></div></div></div>
          {m.status === "scheduled" && <Button size="sm" className="w-full" onClick={() => updateMut.mutate({ id: meetingId, status: "completed" })}>Mark Meeting Completed</Button>}
        </div>
      ) : <p className="text-center text-sm text-muted-foreground py-8">Meeting not found.</p>}
    </DialogContent></Dialog>
  );
}
