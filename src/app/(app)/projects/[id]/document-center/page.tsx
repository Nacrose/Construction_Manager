"use client";

import { use, useState } from "react";
import { trpc } from "@/lib/trpc-client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  FileText,
  FileCheck,
  Receipt,
  Compass,
  Mail,
  Shield,
  Inbox,
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { ModuleTabs } from "@/components/module-tabs";
import { StatusBadge } from "@/components/ui/status-badge";
import { ConstructionTable, ConstructionTableColumn } from "@/components/ui/construction-table";

const DOCS_TABS = [
  { label: "Drawings", href: "/drawings" },
  { label: "Submittals", href: "/submittals" },
  { label: "Doc Center", href: "/document-center" },
];

const TYPE_CONFIG: Record<
  string,
  { icon: React.ComponentType<{ className?: string }>; color: string; label: string }
> = {
  daily_report: { icon: FileText, color: "text-success", label: "Daily Report" },
  rfi: { icon: FileCheck, color: "text-info", label: "RFI" },
  ipc: { icon: Receipt, color: "text-amber-600", label: "IPC" },
  drawing: { icon: Compass, color: "text-purple-600", label: "Drawing" },
  correspondence: { icon: Mail, color: "text-muted-foreground", label: "Letter" },
  signed_doc: { icon: Shield, color: "text-success", label: "Signed Doc" },
  submittal: { icon: FileCheck, color: "text-info", label: "Submittal" },
};

export default function DocumentCenterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [typeFilter, setTypeFilter] = useState("all");

  // Fetch approved documents from multiple sources (paginated sources use infinite queries)
  const reportsQuery = trpc.workflow.dailyReport.listReports.useInfiniteQuery(
    { projectId: id },
    { getNextPageParam: (last) => (last.hasMore ? last.nextCursor : undefined) }
  );
  const rfiQuery = trpc.workflow.rfi.list.useInfiniteQuery(
    { projectId: id },
    { getNextPageParam: (last) => (last.hasMore ? last.nextCursor : undefined) }
  );
  const drawingsQuery = trpc.document.listDrawings.useInfiniteQuery(
    { projectId: id },
    { getNextPageParam: (last) => (last.hasMore ? last.nextCursor : undefined) }
  );
  const { data: ipcData, isLoading: isIpcLoading } = trpc.ipc.list.useQuery({ projectId: id });
  const { data: corrData, isLoading: isCorrLoading } = trpc.correspondence.list.useQuery({ projectId: id });
  const { data: approvedDocs, isLoading: isAppLoading } = trpc.approvedDocument.list.useQuery({ entityType: "daily_report", entityId: id, projectId: id });
  const { data: submittalData, isLoading: isSubLoading } = trpc.submittal.list.useQuery({ projectId: id });

  const isLoading = reportsQuery.isLoading || rfiQuery.isLoading || isIpcLoading || drawingsQuery.isLoading || isCorrLoading || isAppLoading || isSubLoading;

  // Aggregate all documents
  const allDocs: Array<{ id: string; type: string; number: string; title: string; status: string; date: string; href: string }> = [];

  // Daily reports (approved/archived)
  (reportsQuery.data ? reportsQuery.data.pages.flatMap((p) => p.reports) : []).filter((r: any) => r.status === "approved" || r.status === "archived").forEach((r: any) => {
    allDocs.push({ id: r.id, type: "daily_report", number: r.number, title: `Daily Report — ${format(new Date(r.reportDate), "dd MMM yyyy")}`, status: r.status, date: r.reportDate, href: `/projects/${id}/workflow/reports/${r.id}` });
  });

  // RFIs (approved/closed)
  (rfiQuery.data ? rfiQuery.data.pages.flatMap((p) => p.rfis) : []).filter((r: any) => r.status === "approved" || r.status === "closed").forEach((r: any) => {
    allDocs.push({ id: r.id, type: "rfi", number: r.number, title: r.subject, status: r.status, date: r.createdAt, href: `/projects/${id}/workflow/rfi` });
  });

  // IPCs (certified/approved/paid)
  (ipcData?.ipcs ?? []).filter((i: any) => ["certified", "approved", "paid"].includes(i.status)).forEach((i: any) => {
    allDocs.push({ id: i.id, type: "ipc", number: i.number, title: `IPC — ${i.period ?? ""}`, status: i.status, date: i.issueDate ?? i.createdAt, href: `/projects/${id}/ipc/${i.id}` });
  });

  // Drawings (approved)
  (drawingsQuery.data ? drawingsQuery.data.pages.flatMap((p) => p.drawings) : []).filter((d: any) => d.approvalStatus?.startsWith("approved")).forEach((d: any) => {
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

  const filtered = allDocs.filter((d) => {
    if (typeFilter !== "all" && d.type !== typeFilter) return false;
    return true;
  });

  const columns: ConstructionTableColumn<any>[] = [
    {
      key: "type",
      header: "Type",
      render: (_, d) => {
        const cfg = TYPE_CONFIG[d.type] ?? TYPE_CONFIG.signed_doc;
        const Icon = cfg.icon;
        return (
          <div className="flex items-center gap-1.5 font-mono text-xs">
            <Icon className={cn("h-3.5 w-3.5", cfg.color)} />
            <span className="text-muted-foreground">{cfg.label}</span>
          </div>
        );
      },
    },
    {
      key: "number",
      header: "Number",
      render: (_, d) => <span className="font-mono font-medium text-xs text-foreground">{d.number}</span>,
    },
    {
      key: "title",
      header: "Title",
      render: (_, d) => (
        <span className="truncate max-w-xs block text-xs text-foreground font-sans" title={d.title}>
          {d.title}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (_, d) => <StatusBadge status={d.status} />,
    },
    {
      key: "date",
      header: "Date",
      render: (_, d) => (
        <span className="text-xs font-mono text-muted-foreground">
          {format(new Date(d.date), "dd MMM yyyy")}
        </span>
      ),
    },
  ];

  return (
    <>
      <ModuleTabs projectId={id} tabs={DOCS_TABS} />
      <div className="space-y-4 p-4">
        {/* Type Filter Controls */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-muted/20 p-2.5 rounded-lg border">
          <div className="flex items-center gap-2">
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="h-8 w-44 text-xs font-mono">
                <SelectValue placeholder="All Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="daily_report">Daily Reports</SelectItem>
                <SelectItem value="rfi">RFIs</SelectItem>
                <SelectItem value="ipc">IPCs</SelectItem>
                <SelectItem value="drawing">Drawings</SelectItem>
                <SelectItem value="correspondence">Letters</SelectItem>
                <SelectItem value="signed_doc">Signed Docs</SelectItem>
                <SelectItem value="submittal">Submittals</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="text-xs font-mono text-muted-foreground">
            <span>
              Total: <span className="font-bold text-foreground">{filtered.length}</span> Documents
            </span>
          </div>
        </div>

        {/* Central Table Engine */}
        <ConstructionTable
          data={filtered}
          columns={columns}
          isLoading={isLoading}
          onRowClick={(row) => router.push(row.href)}
          searchPlaceholder="Search approved documents by number, title, type..."
          searchFilterKeys={["number", "title", "type", "status"]}
          loadMore={
            reportsQuery.hasNextPage || rfiQuery.hasNextPage || drawingsQuery.hasNextPage
              ? {
                  onLoadMore: () => {
                    if (reportsQuery.hasNextPage) reportsQuery.fetchNextPage();
                    if (rfiQuery.hasNextPage) rfiQuery.fetchNextPage();
                    if (drawingsQuery.hasNextPage) drawingsQuery.fetchNextPage();
                  },
                  isLoadingMore:
                    reportsQuery.isFetchingNextPage || rfiQuery.isFetchingNextPage || drawingsQuery.isFetchingNextPage,
                  label: "Load more documents",
                }
              : undefined
          }
        />
      </div>
    </>
  );
}
