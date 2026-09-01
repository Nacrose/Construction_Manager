"use client";

import { use, useState } from "react";
import { trpc } from "@/lib/trpc-client";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  FileText, FileCheck, Receipt, Compass, Mail, Shield, Search, Inbox,
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { ModuleTabs } from "@/components/module-tabs";


const TYPE_CONFIG: Record<string, { icon: React.ComponentType<{ className?: string }>; color: string; label: string }> = {
  daily_report: { icon: FileText, color: "text-emerald-600", label: "Daily Report" },
  rfi: { icon: FileCheck, color: "text-blue-600", label: "RFI" },
  ipc: { icon: Receipt, color: "text-amber-600", label: "IPC" },
  drawing: { icon: Compass, color: "text-purple-600", label: "Drawing" },
  correspondence: { icon: Mail, color: "text-slate-600", label: "Letter" },
  signed_doc: { icon: Shield, color: "text-teal-600", label: "Signed Doc" },
  submittal: { icon: FileCheck, color: "text-cyan-600", label: "Submittal" },
};

export default function DocumentCenterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");

  // Fetch approved documents from multiple sources
  const { data: reports } = trpc.workflow.dailyReport.listReports.useQuery({ projectId: id });
  const { data: rfiData } = trpc.workflow.rfi.list.useQuery({ projectId: id });
  const { data: ipcData } = trpc.ipc.list.useQuery({ projectId: id });
  const { data: drawingData } = trpc.document.listDrawings.useQuery({ projectId: id });
  const { data: corrData } = trpc.correspondence.list.useQuery({ projectId: id });
  const { data: approvedDocs } = trpc.approvedDocument.list.useQuery({ entityType: "daily_report", entityId: id, projectId: id });
  const { data: submittalData } = trpc.submittal.list.useQuery({ projectId: id });

  // Aggregate all documents
  const allDocs: Array<{ id: string; type: string; number: string; title: string; status: string; date: string; href: string }> = [];

  // Daily reports (approved/archived)
  (reports?.reports ?? []).filter((r: any) => r.status === "approved" || r.status === "archived").forEach((r: any) => {
    allDocs.push({ id: r.id, type: "daily_report", number: r.number, title: `Daily Report — ${format(new Date(r.reportDate), "dd MMM yyyy")}`, status: r.status, date: r.reportDate, href: `/projects/${id}/workflow/reports/${r.id}` });
  });

  // RFIs (approved/closed)
  (rfiData?.rfis ?? []).filter((r: any) => r.status === "approved" || r.status === "closed").forEach((r: any) => {
    allDocs.push({ id: r.id, type: "rfi", number: r.number, title: r.subject, status: r.status, date: r.createdAt, href: `/projects/${id}/workflow/rfi` });
  });

  // IPCs (certified/approved/paid)
  (ipcData?.ipcs ?? []).filter((i: any) => ["certified", "approved", "paid"].includes(i.status)).forEach((i: any) => {
    allDocs.push({ id: i.id, type: "ipc", number: i.number, title: `IPC — ${i.period ?? ""}`, status: i.status, date: i.issueDate ?? i.createdAt, href: `/projects/${id}/ipc/${i.id}` });
  });

  // Drawings (approved)
  (drawingData?.drawings ?? []).filter((d: any) => d.approvalStatus?.startsWith("approved")).forEach((d: any) => {
    allDocs.push({ id: d.id, type: "drawing", number: d.number, title: `${d.title} — Rev ${d.revision}`, status: d.approvalStatus, date: d.approvedAt ?? d.updatedAt, href: `/projects/${id}/drawings` });
  });

  // Correspondence (sent/closed)
  (corrData?.letters ?? []).filter((l: any) => ["sent", "closed"].includes(l.replyStatus)).forEach((l: any) => {
    allDocs.push({ id: l.id, type: "correspondence", number: l.ourRef ?? "—", title: l.subject, status: l.replyStatus, date: l.replySentDate ?? l.date, href: `/projects/${id}/correspondence` });
  });

  // Submittals (approved)
  (submittalData?.submittals ?? []).filter((s: any) => s.status === "approved").forEach((s: any) => {
    allDocs.push({ id: s.id, type: "submittal", number: s.number, title: s.title, status: s.status, date: s.reviewedDate ?? s.createdAt, href: `/projects/${id}/submittals` });
  });

  // Approved documents (signed hardcopies)
  (approvedDocs?.documents ?? []).forEach((d: any) => {
    allDocs.push({ id: d.id, type: "signed_doc", number: d.fileName, title: `${d.documentType} — ${d.fileName}`, status: d.documentType, date: d.uploadedAt, href: `/projects/${id}/workflow/reports` });
  });

  // Sort by date descending
  allDocs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // Filter
  const filtered = allDocs.filter(d => {
    if (typeFilter !== "all" && d.type !== typeFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return d.number?.toLowerCase().includes(q) || d.title?.toLowerCase().includes(q);
    }
    return true;
  });

  const isLoading = !reports && !rfiData && !ipcData;

  return (
    <>
      <ModuleTabs projectId={id} cluster="documents" />
      <div className="space-y-4 pb-8">
        {/* Stats */}
        <div className="grid grid-cols-3 sm:grid-cols-7 gap-2">
          {Object.entries(TYPE_CONFIG).map(([key, cfg]) => {
            const count = allDocs.filter(d => d.type === key).length;
            const Icon = cfg.icon;
            return (
              <Card key={key} className="p-3 text-center bg-white border-[#c7d8e8] rounded-xl">
                <Icon className={cn("h-4 w-4 mx-auto mb-1", cfg.color)} />
                <div className={cn("text-lg font-bold font-mono", cfg.color)}>{count}</div>
                <div className="text-[9px] text-muted-foreground uppercase font-mono">{cfg.label}</div>
              </Card>
            );
          })}
        </div>

        {/* Single-Row Action & Filter Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-2xl border border-[#c7d8e8] bg-white">
          <div className="flex items-center gap-2 flex-1 max-w-md">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input placeholder="Search document number, title..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-9 text-xs bg-[#f8fbfe] border-[#c7d8e8] text-slate-900 rounded-xl" />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="h-9 w-40 text-xs bg-[#f8fbfe] border-[#c7d8e8] text-slate-900 rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-white border-[#c7d8e8] text-slate-900 text-xs">
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="daily_report">Daily Reports</SelectItem>
                <SelectItem value="rfi">RFIs</SelectItem>
                <SelectItem value="ipc">IPCs</SelectItem>
                <SelectItem value="drawing">Drawings</SelectItem>
                <SelectItem value="correspondence">Letters</SelectItem>
                <SelectItem value="signed_doc">Signed Docs</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="text-xs font-mono text-slate-500">
            <span>Total: <span className="font-bold text-slate-900">{filtered.length}</span> Documents</span>
          </div>
        </div>

      {/* Document list */}
      {isLoading ? (
        <Skeleton className="h-64" />
      ) : filtered.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <Inbox className="h-12 w-12 text-muted-foreground/40 mb-3" />
          <p className="text-sm font-medium text-muted-foreground">No approved documents found</p>
          <p className="text-xs text-muted-foreground/70 mt-1">Approve documents in their respective modules to see them here.</p>
        </CardContent></Card>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/30">
              <tr>
                <th className="p-2 text-left font-medium text-muted-foreground">Type</th>
                <th className="p-2 text-left font-medium text-muted-foreground">Number</th>
                <th className="p-2 text-left font-medium text-muted-foreground">Title</th>
                <th className="p-2 text-left font-medium text-muted-foreground">Status</th>
                <th className="p-2 text-left font-medium text-muted-foreground">Date</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((d, i) => {
                const cfg = TYPE_CONFIG[d.type] ?? TYPE_CONFIG.signed_doc;
                const Icon = cfg.icon;
                return (
                  <tr key={`${d.type}-${d.id}-${i}`} className="border-t hover:bg-muted/20 cursor-pointer" onClick={() => window.location.href = d.href}>
                    <td className="p-2"><Icon className={cn("h-3.5 w-3.5", cfg.color)} /></td>
                    <td className="p-2 font-mono font-medium">{d.number}</td>
                    <td className="p-2 max-w-64 truncate">{d.title}</td>
                    <td className="p-2"><span className="rounded bg-muted px-1.5 py-0.5 text-[9px] capitalize">{d.status?.replace(/_/g, " ")}</span></td>
                    <td className="p-2 text-[10px] text-muted-foreground">{format(new Date(d.date), "dd MMM yyyy")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
    </>
  );
}
