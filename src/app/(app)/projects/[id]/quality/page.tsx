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
import {
  Plus, Loader2, Inbox, CheckCircle2, XCircle, AlertCircle,
  ListChecks, Trash2, ChevronDown, ChevronRight, ClipboardList,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { ModuleTabs } from "@/components/module-tabs";

const QS_TABS = [
  { label: "Quality", href: "/quality" },
  { label: "Punch List", href: "/punch-list" },
  { label: "Safety", href: "/safety" },
];

// Checklist templates by inspection type
const CHECKLIST_TEMPLATES: Record<string, Array<{ item: string; passed: boolean | null; notes: string }>> = {
  work_inspection: [
    { item: "Materials as per approved drawings", passed: null, notes: "" },
    { item: "Workmanship meets specification", passed: null, notes: "" },
    { item: "Dimensions within tolerance", passed: null, notes: "" },
    { item: "Surface finish acceptable", passed: null, notes: "" },
    { item: "Reinforcement properly placed", passed: null, notes: "" },
    { item: "Cover blocks in position", passed: null, notes: "" },
  ],
  material_test: [
    { item: "Material grade verified", passed: null, notes: "" },
    { item: "Test certificate available", passed: null, notes: "" },
    { item: "Sample taken for lab test", passed: null, notes: "" },
    { item: "Quantity as per order", passed: null, notes: "" },
    { item: "Packaging intact", passed: null, notes: "" },
  ],
  site_audit: [
    { item: "Safety signs displayed", passed: null, notes: "" },
    { item: "PPE compliance by workers", passed: null, notes: "" },
    { item: "Housekeeping satisfactory", passed: null, notes: "" },
    { item: "Fire safety equipment in place", passed: null, notes: "" },
    { item: "First aid kit available", passed: null, notes: "" },
    { item: "Electrical safety compliance", passed: null, notes: "" },
  ],
  ncr: [
    { item: "Non-conformance identified", passed: null, notes: "" },
    { item: "Root cause analyzed", passed: null, notes: "" },
    { item: "Corrective action proposed", passed: null, notes: "" },
    { item: "Rectification work identified", passed: null, notes: "" },
  ],
};

type ChecklistItem = { item: string; passed: boolean | null; notes: string };

export default function QualityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const utils = trpc.useUtils();
  const [addOpen, setAddOpen] = useState(false);
  const [number, setNumber] = useState(""); const [title, setTitle] = useState("");
  const [inspectionType, setInspectionType] = useState("work_inspection"); const [location, setLocation] = useState("");
  const [result, setResult] = useState("pass"); const [remarks, setRemarks] = useState("");
  const [inspectedBy, setInspectedBy] = useState(""); const [ncrNumber, setNcrNumber] = useState("");
  const [completeId, setCompleteId] = useState<string | null>(null);
  const [completeType, setCompleteType] = useState("work_inspection");
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [viewChecklist, setViewChecklist] = useState<string | null>(null);
  const [showChecklistBuilder, setShowChecklistBuilder] = useState(false);

  const { data, isLoading } = trpc.projectOps.quality.list.useQuery({ projectId: id });
  const { data: stats } = trpc.projectOps.quality.stats.useQuery({ projectId: id });
  const inspections = data?.inspections ?? [];
  const createMut = trpc.projectOps.quality.create.useMutation({
    onSuccess: () => {
      utils.projectOps.quality.list.invalidate({ projectId: id });
      utils.projectOps.quality.stats.invalidate({ projectId: id });
      setAddOpen(false); setNumber(""); setTitle(""); setLocation("");
      toast.success("Inspection requested");
    },
    onError: (e) => toast.error(e.message),
  });
  const completeMut = trpc.projectOps.quality.complete.useMutation({
    onSuccess: () => {
      utils.projectOps.quality.list.invalidate({ projectId: id });
      utils.projectOps.quality.stats.invalidate({ projectId: id });
      setCompleteId(null);
      setResult("pass"); setRemarks(""); setInspectedBy(""); setNcrNumber("");
      setChecklist([]); setShowChecklistBuilder(false);
      toast.success("Inspection completed");
    },
    onError: (e) => toast.error(e.message),
  });

  function openCompleteDialog(qi: any) {
    setCompleteId(qi.id);
    setCompleteType(qi.inspectionType);
    // Load checklist template for this inspection type
    setChecklist(CHECKLIST_TEMPLATES[qi.inspectionType]?.map(c => ({ ...c })) ?? []);
    setShowChecklistBuilder(true);
  }

  function updateChecklistItem(index: number, field: "passed" | "notes" | "item", value: any) {
    setChecklist(prev => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  }

  function addChecklistItem() {
    setChecklist(prev => [...prev, { item: "", passed: null, notes: "" }]);
  }

  function removeChecklistItem(index: number) {
    setChecklist(prev => prev.filter((_, i) => i !== index));
  }

  // Compute auto-result from checklist
  function computeResult(): "pass" | "fail" | "conditional_pass" {
    const checked = checklist.filter(c => c.passed !== null);
    if (checked.length === 0) return "pass";
    const allPassed = checked.every(c => c.passed === true);
    const anyFailed = checked.some(c => c.passed === false);
    if (allPassed) return "pass";
    if (anyFailed) return "fail";
    return "conditional_pass";
  }

  return (
    <>
      <ModuleTabs projectId={id} tabs={QS_TABS} />
      <div className="space-y-4 pb-8">
        {stats && (
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            <Card className="p-3 text-center bg-[#0c1015] border-white/10 rounded-xl"><div className="text-lg font-bold font-mono text-slate-400">{stats.total}</div><div className="text-[10px] text-muted-foreground uppercase font-mono">Total</div></Card>
            <Card className="p-3 text-center bg-[#0c1015] border-white/10 rounded-xl"><div className="text-lg font-bold font-mono text-amber-400">{stats.pending}</div><div className="text-[10px] text-muted-foreground uppercase font-mono">Pending</div></Card>
            <Card className="p-3 text-center bg-[#0c1015] border-white/10 rounded-xl"><div className="text-lg font-bold font-mono text-emerald-400">{stats.passed}</div><div className="text-[10px] text-muted-foreground uppercase font-mono">Passed</div></Card>
            <Card className="p-3 text-center bg-[#0c1015] border-white/10 rounded-xl"><div className="text-lg font-bold font-mono text-red-400">{stats.failed}</div><div className="text-[10px] text-muted-foreground uppercase font-mono">Failed</div></Card>
            <Card className="p-3 text-center bg-[#0c1015] border-white/10 rounded-xl"><div className="text-lg font-bold font-mono text-orange-400">{stats.ncr}</div><div className="text-[10px] text-muted-foreground uppercase font-mono">NCR</div></Card>
            <Card className="p-3 text-center bg-[#0c1015] border-white/10 rounded-xl"><div className="text-lg font-bold font-mono text-blue-400">{stats.completed}</div><div className="text-[10px] text-muted-foreground uppercase font-mono">Completed</div></Card>
          </div>
        )}

        {/* Single-Row Action Strip */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-2xl border border-white/10 bg-[#0c1015]">
          <div className="flex items-center gap-2 text-xs font-mono text-gray-400">
            <span>Quality Register ({inspections.length} inspections)</span>
          </div>

          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="h-9 px-4 text-xs font-bold bg-[#00ff66] text-black hover:bg-[#00e65c] rounded-xl shadow-[0_0_20px_rgba(0,255,102,0.3)] transition gap-1.5 shrink-0 font-sans">
                <Plus className="h-3.5 w-3.5" /> + Request Inspection
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md bg-[#0c1015] border-white/10 text-white backdrop-blur-md">
              <DialogHeader><DialogTitle className="text-base font-bold text-white">Request Inspection</DialogTitle></DialogHeader>
              <div className="space-y-3 py-2 text-xs">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Number</Label>
                    <Input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="QI-001" className="h-9 text-xs font-mono bg-[#121820] border-white/10 text-white" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Type</Label>
                    <Select value={inspectionType} onValueChange={setInspectionType}>
                      <SelectTrigger className="h-9 text-xs bg-[#121820] border-white/10 text-white"><SelectValue /></SelectTrigger>
                      <SelectContent className="bg-[#0f141c] border-white/10 text-white text-xs">
                        <SelectItem value="work_inspection">Work Inspection</SelectItem>
                        <SelectItem value="material_test">Material Test</SelectItem>
                        <SelectItem value="ncr">NCR</SelectItem>
                        <SelectItem value="site_audit">Site Audit</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Title</Label>
                  <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Rebar inspection at Grid A-3" className="h-9 text-xs bg-[#121820] border-white/10 text-white" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Location</Label>
                  <Input value={location} onChange={(e) => setLocation(e.target.value)} className="h-9 text-xs bg-[#121820] border-white/10 text-white" />
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" size="sm" onClick={() => setAddOpen(false)} className="text-xs text-gray-400">Cancel</Button>
                <Button size="sm" onClick={() => createMut.mutate({ projectId: id, number, title, inspectionType: inspectionType as any, location: location || undefined })} disabled={createMut.isPending || !number || !title} className="text-xs bg-emerald-500 hover:bg-emerald-600 text-black font-bold">
                  {createMut.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />} Create
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

      {isLoading ? <Skeleton className="h-64" /> : inspections.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <CheckCircle2 className="h-12 w-12 text-emerald-500/40 mb-3" />
          <p className="text-sm text-muted-foreground">No inspection records.</p>
        </CardContent></Card>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/30">
              <tr>
                <th className="p-2 text-left font-medium text-muted-foreground">Number</th>
                <th className="p-2 text-left font-medium text-muted-foreground">Title</th>
                <th className="p-2 text-left font-medium text-muted-foreground">Type</th>
                <th className="p-2 text-left font-medium text-muted-foreground">Status</th>
                <th className="p-2 text-left font-medium text-muted-foreground">Result</th>
                <th className="p-2 text-left font-medium text-muted-foreground">Date</th>
                <th className="p-2 text-center font-medium text-muted-foreground">Checklist</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {inspections.map(qi => (
                <tr key={qi.id} className="border-t hover:bg-muted/20">
                  <td className="p-2 font-mono font-medium">{qi.number}</td>
                  <td className="p-2 max-w-48 truncate">{qi.title}</td>
                  <td className="p-2 text-muted-foreground capitalize">{qi.inspectionType.replace(/_/g, " ")}</td>
                  <td className="p-2">
                    <span className={cn("rounded px-1 text-[9px] font-medium", qi.status === "completed" ? "bg-emerald-100 text-emerald-700" : qi.status === "ncr_raised" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700")}>
                      {qi.status.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="p-2">
                    {qi.result === "pass" ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> :
                     qi.result === "fail" ? <XCircle className="h-3.5 w-3.5 text-red-600" /> :
                     qi.result === "conditional_pass" ? <AlertCircle className="h-3.5 w-3.5 text-amber-600" /> : "—"}
                  </td>
                  <td className="p-2 text-[10px] text-muted-foreground">{format(new Date(qi.requestedDate), "dd MMM yy")}</td>
                  <td className="p-2 text-center">
                    {qi.checklist ? (
                      <button onClick={() => setViewChecklist(qi.id)} className="text-blue-600 hover:underline" title="View checklist">
                        <ClipboardList className="h-3.5 w-3.5 inline" />
                      </button>
                    ) : "—"}
                  </td>
                  <td className="p-2">
                    {(qi.status === "requested" || qi.status === "scheduled") && (
                      <button onClick={() => openCompleteDialog(qi)} className="text-[9px] text-blue-600 hover:underline">Complete</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Complete dialog with checklist builder */}
      {completeId && (
        <Dialog open={true} onOpenChange={(o) => { if (!o) { setCompleteId(null); setShowChecklistBuilder(false); } }}>
          <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Complete Inspection</DialogTitle></DialogHeader>
            <div className="space-y-4 py-2">
              {/* Checklist builder */}
              {showChecklistBuilder && checklist.length > 0 && (
                <div className="space-y-2 border rounded-md p-3 bg-muted/20">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold uppercase text-muted-foreground">
                      Inspection Checklist
                    </Label>
                    <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={addChecklistItem}>
                      <Plus className="h-3 w-3 mr-1" /> Add Item
                    </Button>
                  </div>
                  <div className="space-y-1.5">
                    {checklist.map((c, i) => (
                      <div key={i} className="flex items-start gap-2 rounded border bg-background p-2">
                        <div className="flex gap-1 shrink-0 pt-0.5">
                          <button
                            onClick={() => updateChecklistItem(i, "passed", true)}
                            className={cn("rounded p-1 transition", c.passed === true ? "bg-emerald-500 text-white" : "bg-muted hover:bg-emerald-100")}
                            title="Pass"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => updateChecklistItem(i, "passed", false)}
                            className={cn("rounded p-1 transition", c.passed === false ? "bg-red-500 text-white" : "bg-muted hover:bg-red-100")}
                            title="Fail"
                          >
                            <XCircle className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <Input
                          value={c.item}
                          onChange={(e) => updateChecklistItem(i, "item", e.target.value)}
                          placeholder="Checklist item description"
                          className="h-7 text-xs flex-1"
                        />
                        <Input
                          value={c.notes}
                          onChange={(e) => updateChecklistItem(i, "notes", e.target.value)}
                          placeholder="Notes (optional)"
                          className="h-7 text-xs flex-1"
                        />
                        <button
                          onClick={() => removeChecklistItem(i)}
                          className="rounded p-1 text-muted-foreground hover:bg-red-100 hover:text-red-600 shrink-0"
                          title="Remove"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    Result auto-suggests: {computeResult() === "pass" ? "✓ Pass" : computeResult() === "fail" ? "✕ Fail" : "⚠ Conditional"}
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Result</Label>
                  <Select value={result} onValueChange={setResult}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pass">✓ Pass</SelectItem>
                      <SelectItem value="fail">✕ Fail (NCR)</SelectItem>
                      <SelectItem value="conditional_pass">⚠ Conditional Pass</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Inspected By</Label>
                  <Input value={inspectedBy} onChange={(e) => setInspectedBy(e.target.value)} className="h-9 text-sm" />
                </div>
              </div>
              {result === "fail" && (
                <div className="space-y-1.5">
                  <Label className="text-xs">NCR Number</Label>
                  <Input value={ncrNumber} onChange={(e) => setNcrNumber(e.target.value)} placeholder="NCR-001" className="h-9 text-sm font-mono" />
                </div>
              )}
              <div className="space-y-1.5">
                <Label className="text-xs">Remarks</Label>
                <Textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={3} className="text-sm" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setCompleteId(null); setShowChecklistBuilder(false); }}>Cancel</Button>
              <Button
                onClick={() => {
                  const finalResult = (result as any) || computeResult();
                  completeMut.mutate({
                    id: completeId,
                    result: finalResult,
                    remarks: remarks || undefined,
                    inspectedBy: inspectedBy || undefined,
                    ncrNumber: ncrNumber || undefined,
                    checklist: checklist.length > 0 ? JSON.stringify(checklist) : undefined,
                  });
                }}
                disabled={completeMut.isPending}
              >
                {completeMut.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />} Complete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* View checklist dialog */}
      {viewChecklist && (() => {
        const qi = inspections.find(q => q.id === viewChecklist);
        if (!qi?.checklist) return null;
        let items: ChecklistItem[] = [];
        try { items = JSON.parse(qi.checklist); } catch {}
        return (
          <Dialog open={true} onOpenChange={(o) => { if (!o) setViewChecklist(null); }}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader><DialogTitle>Checklist — {qi.number}</DialogTitle></DialogHeader>
              <div className="space-y-1.5 py-2">
                {items.map((c, i) => (
                  <div key={i} className="flex items-start gap-2 rounded border p-2 text-xs">
                    {c.passed === true ? <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" /> :
                     c.passed === false ? <XCircle className="h-4 w-4 text-red-600 shrink-0" /> :
                     <AlertCircle className="h-4 w-4 text-muted-foreground shrink-0" />}
                    <div className="flex-1">
                      <p className="font-medium">{c.item}</p>
                      {c.notes && <p className="text-muted-foreground mt-0.5">{c.notes}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </DialogContent>
          </Dialog>
        );
      })()}
    </div>
    </>
  );
}
