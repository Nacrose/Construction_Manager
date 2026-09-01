"use client";

import { use, useState, useMemo } from "react";
import { trpc } from "@/lib/trpc-client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Plus, Loader2, CheckCircle2, XCircle, AlertCircle,
  Trash2, ClipboardList, ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { ModuleTabs } from "@/components/module-tabs";
import { ConstructionTable, ConstructionTableColumn } from "@/components/ui/construction-table";
import { StatusBadge } from "@/components/ui/status-badge";


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

type QualityInspection = {
  id: string;
  number: string;
  title: string;
  inspectionType: string;
  status: string;
  result: string | null;
  requestedDate: Date | string;
  checklist?: string | null;
  location?: string | null;
};

export default function QualityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const utils = trpc.useUtils();
  const [addOpen, setAddOpen] = useState(false);
  const [number, setNumber] = useState("");
  const [title, setTitle] = useState("");
  const [inspectionType, setInspectionType] = useState("work_inspection");
  const [location, setLocation] = useState("");
  const [result, setResult] = useState("pass");
  const [remarks, setRemarks] = useState("");
  const [inspectedBy, setInspectedBy] = useState("");
  const [ncrNumber, setNcrNumber] = useState("");
  const [completeId, setCompleteId] = useState<string | null>(null);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [viewChecklist, setViewChecklist] = useState<string | null>(null);
  const [showChecklistBuilder, setShowChecklistBuilder] = useState(false);

  const { data, isLoading } = trpc.projectOps.quality.list.useQuery({ projectId: id });
  const { data: stats } = trpc.projectOps.quality.stats.useQuery({ projectId: id });
  const inspections = (data?.inspections ?? []) as QualityInspection[];

  const createMut = trpc.projectOps.quality.create.useMutation({
    onSuccess: () => {
      utils.projectOps.quality.list.invalidate({ projectId: id });
      utils.projectOps.quality.stats.invalidate({ projectId: id });
      setAddOpen(false);
      setNumber("");
      setTitle("");
      setLocation("");
      toast.success("Inspection requested successfully");
    },
    onError: (e) => toast.error(e.message),
  });

  const completeMut = trpc.projectOps.quality.complete.useMutation({
    onSuccess: () => {
      utils.projectOps.quality.list.invalidate({ projectId: id });
      utils.projectOps.quality.stats.invalidate({ projectId: id });
      setCompleteId(null);
      setResult("pass");
      setRemarks("");
      setInspectedBy("");
      setNcrNumber("");
      setChecklist([]);
      setShowChecklistBuilder(false);
      toast.success("Inspection completed");
    },
    onError: (e) => toast.error(e.message),
  });

  function openCompleteDialog(qi: any) {
    setCompleteId(qi.id);
    setChecklist(CHECKLIST_TEMPLATES[qi.inspectionType]?.map((c) => ({ ...c })) ?? []);
    setShowChecklistBuilder(true);
  }

  function updateChecklistItem(index: number, field: "passed" | "notes" | "item", value: any) {
    setChecklist((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  }

  function addChecklistItem() {
    setChecklist((prev) => [...prev, { item: "", passed: null, notes: "" }]);
  }

  function removeChecklistItem(index: number) {
    setChecklist((prev) => prev.filter((_, i) => i !== index));
  }

  function computeResult(): "pass" | "fail" | "conditional_pass" {
    const checked = checklist.filter((c) => c.passed !== null);
    if (checked.length === 0) return "pass";
    const allPassed = checked.every((c) => c.passed === true);
    const anyFailed = checked.some((c) => c.passed === false);
    if (allPassed) return "pass";
    if (anyFailed) return "fail";
    return "conditional_pass";
  }

  const columns: ConstructionTableColumn<QualityInspection>[] = useMemo(
    () => [
      {
        key: "number",
        header: "QI Number",
        width: "120px",
        sortable: true,
        render: (val) => <span className="font-mono font-bold text-primary">{val}</span>,
      },
      {
        key: "title",
        header: "Inspection Title",
        sortable: true,
        render: (val, r) => (
          <div>
            <span className="font-medium text-foreground text-xs">{val}</span>
            {r.location && (
              <span className="block text-[10px] text-muted-foreground font-mono">
                📍 {r.location}
              </span>
            )}
          </div>
        ),
      },
      {
        key: "inspectionType",
        header: "Type",
        width: "140px",
        render: (val) => (
          <span className="capitalize text-muted-foreground text-xs font-mono">
            {String(val).replace(/_/g, " ")}
          </span>
        ),
      },
      {
        key: "status",
        header: "Status",
        width: "130px",
        render: (val) => <StatusBadge status={val} />,
      },
      {
        key: "result",
        header: "Result",
        width: "100px",
        render: (val) => {
          if (val === "pass") return <span className="text-emerald-500 flex items-center gap-1 font-mono text-xs"><CheckCircle2 className="h-3.5 w-3.5" /> Pass</span>;
          if (val === "fail") return <span className="text-red-500 flex items-center gap-1 font-mono text-xs"><XCircle className="h-3.5 w-3.5" /> Fail</span>;
          if (val === "conditional_pass") return <span className="text-amber-500 flex items-center gap-1 font-mono text-xs"><AlertCircle className="h-3.5 w-3.5" /> Cond.</span>;
          return <span className="text-muted-foreground">—</span>;
        },
      },
      {
        key: "requestedDate",
        header: "Requested Date",
        width: "120px",
        render: (val) => (
          <span className="text-muted-foreground font-mono text-xs">
            {format(new Date(val), "dd MMM yyyy")}
          </span>
        ),
      },
      {
        key: "checklist",
        header: "Checklist",
        width: "90px",
        align: "center",
        render: (_, r) =>
          r.checklist ? (
            <button
              onClick={() => setViewChecklist(r.id)}
              className="text-blue-500 hover:text-blue-400 p-1"
              title="View Checklist"
            >
              <ClipboardList className="h-4 w-4" />
            </button>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        key: "actions",
        header: "Actions",
        width: "110px",
        align: "right",
        render: (_, r) =>
          r.status === "requested" || r.status === "scheduled" ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => openCompleteDialog(r)}
              className="h-6 text-[10px] font-mono border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
            >
              Complete
            </Button>
          ) : null,
      },
    ],
    []
  );

  return (
    <>
      <ModuleTabs projectId={id} cluster="quality-safety" />
      <div className="space-y-4 pb-8 font-sans">
        {/* KPI Header */}
        {stats && (
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 font-mono">
            <Card className="p-3 text-center bg-white border-[#c7d8e8] shadow-xs rounded-xl"><div className="text-lg font-bold text-slate-700">{stats.total}</div><div className="text-[10px] text-slate-500 uppercase">Total</div></Card>
            <Card className="p-3 text-center bg-white border-[#c7d8e8] shadow-xs rounded-xl"><div className="text-lg font-bold text-amber-700">{stats.pending}</div><div className="text-[10px] text-slate-500 uppercase">Pending</div></Card>
            <Card className="p-3 text-center bg-white border-[#c7d8e8] shadow-xs rounded-xl"><div className="text-lg font-bold text-emerald-700">{stats.passed}</div><div className="text-[10px] text-slate-500 uppercase">Passed</div></Card>
            <Card className="p-3 text-center bg-white border-[#c7d8e8] shadow-xs rounded-xl"><div className="text-lg font-bold text-rose-700">{stats.failed}</div><div className="text-[10px] text-slate-500 uppercase">Failed</div></Card>
            <Card className="p-3 text-center bg-white border-[#c7d8e8] shadow-xs rounded-xl"><div className="text-lg font-bold text-orange-700">{stats.ncr}</div><div className="text-[10px] text-slate-500 uppercase">NCR</div></Card>
            <Card className="p-3 text-center bg-white border-[#c7d8e8] shadow-xs rounded-xl"><div className="text-lg font-bold text-[#0284c7]">{stats.completed}</div><div className="text-[10px] text-slate-500 uppercase">Completed</div></Card>
          </div>
        )}

        {/* Action Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl border border-[#c7d8e8] bg-[#e5eef7]">
          <div className="flex items-center gap-2 text-xs font-mono text-slate-700">
            <ShieldCheck className="h-4 w-4 text-[#0284c7]" />
            <span className="font-bold">Quality Inspection &amp; Non-Conformance Register</span>
          </div>

          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="amber-cta-btn h-8 px-3.5 text-xs font-bold text-white rounded-lg shadow-sm gap-1.5 shrink-0 font-mono">
                <Plus className="h-3.5 w-3.5" /> Request Inspection (जाँच अनुरोध)
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[560px] w-full p-0 gap-0 bg-white border border-[#c7d8e8] text-slate-900 rounded-2xl shadow-2xl overflow-hidden font-sans">
              <div className="px-6 py-4 border-b border-[#e2edf7] bg-[#f8fbfe] flex items-center justify-between">
                <DialogTitle className="text-base font-bold text-slate-900">Request Inspection (गुणस्तर जाँच अनुरोध)</DialogTitle>
              </div>
              <div className="p-6 space-y-3.5 text-xs bg-white">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-semibold text-slate-700">QI Number *</Label>
                    <Input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="QI-001" className="h-9 text-xs font-mono bg-white border-[#c7d8e8] text-slate-900 focus:border-[#0284c7]" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-semibold text-slate-700">Inspection Type</Label>
                    <Select value={inspectionType} onValueChange={setInspectionType}>
                      <SelectTrigger className="h-9 text-xs bg-white border-[#c7d8e8] text-slate-900 font-mono focus:border-[#0284c7]"><SelectValue /></SelectTrigger>
                      <SelectContent className="bg-white border-[#c7d8e8] text-slate-900 text-xs font-mono shadow-xl rounded-xl">
                        <SelectItem value="work_inspection">Work Inspection</SelectItem>
                        <SelectItem value="material_test">Material Test</SelectItem>
                        <SelectItem value="ncr">Non-Conformance (NCR)</SelectItem>
                        <SelectItem value="site_audit">Site Audit</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-semibold text-slate-700">Title / Work Scope *</Label>
                  <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Rebar inspection at Grid A-3" className="h-9 text-xs bg-white border-[#c7d8e8] text-slate-900 focus:border-[#0284c7]" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-semibold text-slate-700">Site Location (Optional)</Label>
                  <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Block B, 2nd Floor" className="h-9 text-xs bg-white border-[#c7d8e8] text-slate-900 focus:border-[#0284c7]" />
                </div>

                <div className="flex justify-end gap-2.5 pt-3 border-t border-[#e2edf7]">
                  <Button variant="outline" size="sm" onClick={() => setAddOpen(false)} className="h-8 text-xs border-[#c7d8e8] text-slate-600 hover:bg-slate-100 font-mono">Cancel</Button>
                  <Button size="sm" onClick={() => createMut.mutate({ projectId: id, number, title, inspectionType: inspectionType as any, location: location || undefined })} disabled={createMut.isPending || !number || !title} className="amber-cta-btn h-8 text-xs font-bold text-white shadow-sm font-mono">
                    {createMut.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />} Create Request (अनुरोध सुरक्षित)
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* ConstructionTable Integration */}
        <ConstructionTable<QualityInspection>
          data={inspections}
          columns={columns}
          isLoading={isLoading}
          searchPlaceholder="Search QI number, title, location..."
          searchFilterKeys={["number", "title", "location", "inspectionType"]}
          exportExcel={{
            filename: `Quality_Register_${format(new Date(), "yyyy-MM-dd")}`,
            sheetName: "QualityInspections",
          }}
          emptyState={{
            title: "No Quality Inspection Records",
            description: "Request work inspections, material tests, and log non-conformance reports.",
          }}
        />

        {/* Complete Dialog with Checklist Builder */}
        {completeId && (
          <Dialog open={true} onOpenChange={(o) => { if (!o) { setCompleteId(null); setShowChecklistBuilder(false); } }}>
            <DialogContent className="sm:max-w-[650px] w-full p-0 gap-0 bg-white border border-[#c7d8e8] text-slate-900 rounded-2xl shadow-2xl overflow-hidden font-sans">
              <div className="px-6 py-4 border-b border-[#e2edf7] bg-[#f8fbfe] flex items-center justify-between">
                <DialogTitle className="text-base font-bold text-slate-900">Complete Quality Inspection</DialogTitle>
              </div>
              <div className="p-6 space-y-4 text-xs bg-white max-h-[80vh] overflow-y-auto">
                {showChecklistBuilder && checklist.length > 0 && (
                  <div className="space-y-2 border border-[#c7d8e8] rounded-xl p-3 bg-slate-50 font-mono">
                    <div className="space-y-1.5">
                      {checklist.map((c, i) => (
                        <div key={i} className="flex items-start gap-2 rounded-lg border border-[#c7d8e8] bg-white p-2">
                          <div className="flex gap-1 shrink-0 pt-0.5">
                            <button
                              type="button"
                              onClick={() => updateChecklistItem(i, "passed", true)}
                              className={cn("rounded p-1 transition", c.passed === true ? "bg-emerald-600 text-white" : "bg-slate-100 hover:bg-emerald-500/20 text-slate-600")}
                              title="Pass"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => updateChecklistItem(i, "passed", false)}
                              className={cn("rounded p-1 transition", c.passed === false ? "bg-red-600 text-white" : "bg-slate-100 hover:bg-red-500/20 text-slate-600")}
                              title="Fail"
                            >
                              <XCircle className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          <Input
                            value={c.item}
                            onChange={(e) => updateChecklistItem(i, "item", e.target.value)}
                            placeholder="Checklist item description"
                            className="h-7 text-xs flex-1 bg-white border-[#c7d8e8]"
                          />
                          <Input
                            value={c.notes}
                            onChange={(e) => updateChecklistItem(i, "notes", e.target.value)}
                            placeholder="Notes (optional)"
                            className="h-7 text-xs flex-1 bg-white border-[#c7d8e8]"
                          />
                          <button
                            type="button"
                            onClick={() => removeChecklistItem(i)}
                            className="rounded p-1 text-slate-400 hover:bg-red-500/10 hover:text-red-600 shrink-0"
                            title="Remove"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                    <p className="text-[10px] text-slate-500">
                      Auto-suggested Result: {computeResult() === "pass" ? "✓ Pass" : computeResult() === "fail" ? "✕ Fail" : "⚠ Conditional"}
                    </p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-semibold text-slate-700">Final Result</Label>
                    <Select value={result} onValueChange={setResult}>
                      <SelectTrigger className="h-9 text-xs bg-white border-[#c7d8e8] text-slate-900 font-mono focus:border-[#0284c7]"><SelectValue /></SelectTrigger>
                      <SelectContent className="bg-white border-[#c7d8e8] text-slate-900 text-xs font-mono shadow-xl rounded-xl">
                        <SelectItem value="pass">✓ Pass</SelectItem>
                        <SelectItem value="fail">✕ Fail (NCR)</SelectItem>
                        <SelectItem value="conditional_pass">⚠ Conditional Pass</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-semibold text-slate-700">Inspected By</Label>
                    <Input value={inspectedBy} onChange={(e) => setInspectedBy(e.target.value)} placeholder="Engineer Name" className="h-9 text-xs bg-white border-[#c7d8e8] text-slate-900 font-mono focus:border-[#0284c7]" />
                  </div>
                </div>
                {result === "fail" && (
                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-semibold text-slate-700">NCR Number</Label>
                    <Input value={ncrNumber} onChange={(e) => setNcrNumber(e.target.value)} placeholder="NCR-001" className="h-9 text-xs font-mono bg-white border-[#c7d8e8] text-slate-900 focus:border-[#0284c7]" />
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-semibold text-slate-700">Remarks</Label>
                  <Textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={3} className="text-xs bg-white border-[#c7d8e8] text-slate-900 focus:border-[#0284c7]" />
                </div>

                <div className="flex justify-end gap-2.5 pt-3 border-t border-[#e2edf7]">
                  <Button variant="outline" onClick={() => { setCompleteId(null); setShowChecklistBuilder(false); }} className="h-8 text-xs font-mono border-[#c7d8e8] text-slate-600 hover:bg-slate-100">Cancel</Button>
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
                    className="amber-cta-btn h-8 text-xs font-mono font-bold text-white shadow-sm"
                  >
                    {completeMut.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />} Complete Inspection (सम्पन्न)
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        )}

        {/* View Checklist Dialog */}
        {viewChecklist && (() => {
          const qi = inspections.find((q) => q.id === viewChecklist);
          if (!qi?.checklist) return null;
          let items: ChecklistItem[] = [];
          try { items = JSON.parse(qi.checklist); } catch {}
          return (
            <Dialog open={true} onOpenChange={(o) => { if (!o) setViewChecklist(null); }}>
              <DialogContent className="sm:max-w-[560px] w-full p-0 gap-0 bg-white border border-[#c7d8e8] text-slate-900 rounded-2xl shadow-2xl overflow-hidden font-sans">
                <div className="px-6 py-4 border-b border-[#e2edf7] bg-[#f8fbfe] flex items-center justify-between">
                  <DialogTitle className="text-base font-bold text-slate-900 font-mono">Checklist — {qi.number}</DialogTitle>
                </div>
                <div className="p-6 space-y-2 text-xs font-mono bg-white">
                  {items.map((c, i) => (
                    <div key={i} className="flex items-start gap-2 rounded-lg border border-[#c7d8e8] bg-slate-50 p-2.5 text-xs font-mono">
                      {c.passed === true ? <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" /> :
                       c.passed === false ? <XCircle className="h-4 w-4 text-rose-600 shrink-0" /> :
                       <AlertCircle className="h-4 w-4 text-slate-400 shrink-0" />}
                      <div className="flex-1">
                        <p className="font-semibold text-slate-900">{c.item}</p>
                        {c.notes && <p className="text-slate-500 mt-0.5">{c.notes}</p>}
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
