"use client";

import { use, useState } from "react";
import { trpc } from "@/lib/trpc-client";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogTrigger } from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Search, Inbox, CheckCircle2, XCircle, RotateCcw, Clock } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { ModuleTabs } from "@/components/module-tabs";
import { CreateSubmittalDialog } from "./dialogs/create-submittal-dialog";
import { ReviewDialog } from "./dialogs/review-dialog";
import { SubmitButton } from "./components/submit-button";

const DOCS_TABS = [
  { label: "Drawings", href: "/drawings" },
  { label: "Submittals", href: "/submittals" },
  { label: "Doc Center", href: "/document-center" },
];

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: React.ComponentType<{ className?: string }> }> = {
  draft: { label: "Draft", color: "text-slate-500", bg: "bg-slate-100 dark:bg-slate-800", icon: Clock },
  submitted: { label: "Submitted", color: "text-amber-600", bg: "bg-amber-100 dark:bg-amber-950", icon: Clock },
  approved: { label: "Approved", color: "text-emerald-600", bg: "bg-emerald-100 dark:bg-emerald-950", icon: CheckCircle2 },
  rejected: { label: "Rejected", color: "text-red-600", bg: "bg-red-100 dark:bg-red-950", icon: XCircle },
  revise_resubmit: { label: "Revise & Resubmit", color: "text-orange-600", bg: "bg-orange-100 dark:bg-orange-950", icon: RotateCcw },
};

const TYPE_LABELS: Record<string, string> = {
  shop_drawing: "Shop Drawing", material_sample: "Material Sample", product_data: "Product Data", technical_spec: "Technical Spec", other: "Other",
};

export default function SubmittalsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const utils = trpc.useUtils();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [addOpen, setAddOpen] = useState(false);
  const [reviewItem, setReviewItem] = useState<{ id: string; number: string; title: string } | null>(null);

  const { data, isLoading } = trpc.submittal.list.useQuery({
    projectId: id, status: statusFilter === "all" ? undefined : statusFilter, q: search || undefined,
  });
  const { data: stats } = trpc.submittal.stats.useQuery({ projectId: id });
  const submittals = data?.submittals ?? [];

  return (
    <>
      <ModuleTabs projectId={id} tabs={DOCS_TABS} />
      <div className="space-y-6 pb-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Link href={`/projects/${id}`} className="hover:text-foreground">Project</Link><span>/</span><span>Submittals</span>
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Submittals</h1>
          <p className="text-sm text-muted-foreground">Shop drawings, material samples, and product data submitted for approval.</p>
        </div>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" /> New Submittal</Button></DialogTrigger>
          <CreateSubmittalDialog projectId={id} onDone={() => { setAddOpen(false); utils.submittal.list.invalidate({ projectId: id }); utils.submittal.stats.invalidate({ projectId: id }); }} />
        </Dialog>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          {[
            { label: "Total", value: stats.total, color: "text-slate-600" },
            { label: "Draft", value: stats.draft, color: "text-slate-500" },
            { label: "Submitted", value: stats.submitted, color: "text-amber-600" },
            { label: "Approved", value: stats.approved, color: "text-emerald-600" },
            { label: "Rejected", value: stats.rejected, color: "text-red-600" },
            { label: "Revise", value: stats.revise, color: "text-orange-600" },
          ].map(s => (
            <Card key={s.label} className="p-3 text-center"><div className={cn("text-lg font-bold", s.color)}>{s.value}</div><div className="text-[9px] text-muted-foreground uppercase">{s.label}</div></Card>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-9 w-36 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="submitted">Submitted</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
            <SelectItem value="revise_resubmit">Revise</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* List */}
      {isLoading ? <Skeleton className="h-64" /> : submittals.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <Inbox className="h-12 w-12 text-muted-foreground/40 mb-3" />
          <p className="text-sm font-medium text-muted-foreground">No submittals yet</p>
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
                <th className="p-2 text-left font-medium text-muted-foreground">Submitted</th>
                <th className="p-2 text-left font-medium text-muted-foreground">Reviewed</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {submittals.map(s => {
                const cfg = STATUS_CONFIG[s.status] ?? STATUS_CONFIG.draft;
                const Icon = cfg.icon;
                return (
                  <tr key={s.id} className="border-t hover:bg-muted/20">
                    <td className="p-2 font-mono font-medium">{s.number}</td>
                    <td className="p-2 max-w-48 truncate">{s.title}</td>
                    <td className="p-2 text-muted-foreground">{TYPE_LABELS[s.type] ?? s.type}</td>
                    <td className="p-2"><span className={cn("inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[9px] font-medium", cfg.bg, cfg.color)}><Icon className="h-2.5 w-2.5" />{cfg.label}</span></td>
                    <td className="p-2 text-[10px] text-muted-foreground">{s.submittedDate ? format(new Date(s.submittedDate), "dd MMM yy") : "—"}</td>
                    <td className="p-2 text-[10px] text-muted-foreground">{s.reviewedDate ? format(new Date(s.reviewedDate), "dd MMM yy") : "—"}</td>
                    <td className="p-2">
                      {s.status === "draft" && <SubmitButton submittalId={s.id} projectId={id} />}
                      {s.status === "submitted" && <button onClick={() => setReviewItem({ id: s.id, number: s.number, title: s.title })} className="text-[9px] text-amber-600 hover:underline">Review</button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {reviewItem && (
        <ReviewDialog item={reviewItem} projectId={id} onClose={() => setReviewItem(null)} onDone={() => { setReviewItem(null); utils.submittal.list.invalidate({ projectId: id }); utils.submittal.stats.invalidate({ projectId: id }); }} />
      )}
    </div>
    </>
  );
}


