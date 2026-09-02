"use client";

import { use, useState, useMemo } from "react";
import { trpc } from "@/lib/trpc-client";
import { Dialog, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Plus, Mail, FileText, AlertTriangle, ArrowDownLeft, ArrowUpRight,
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { ModuleTabs } from "@/components/module-tabs";
import { CATEGORIES, CATEGORY_COLORS } from "./components/constants";
import { StatCard } from "./components/stat-card";
import { LogLetterDialog } from "./components/log-letter-dialog";
import { LetterDetailDialog } from "./components/letter-detail-dialog";
import { ConstructionTable, ConstructionTableColumn } from "@/components/ui/construction-table";
import { StatusBadge } from "@/components/ui/status-badge";

const WF_TABS = [
  { label: "RFIs", href: "/workflow/rfi" },
  { label: "Daily Program", href: "/workflow/program" },
  { label: "Daily Reports", href: "/workflow/reports" },
  { label: "Correspondence", href: "/correspondence" },
  { label: "Meetings", href: "/meetings" },
];

type CorrespondenceLetter = {
  id: string;
  direction: string;
  ourRef?: string | null;
  theirRef?: string | null;
  subject: string;
  fromName?: string | null;
  fromParty?: string | null;
  category: string;
  letterType: string;
  replyStatus: string;
  replyDueDate?: Date | string | null;
  date: Date | string;
};

export default function CorrespondencePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const utils = trpc.useUtils();

  const [logOpen, setLogOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  const { data, isLoading } = trpc.correspondence.list.useQuery({
    projectId: id,
  });

  const { data: statsData } = trpc.correspondence.stats.useQuery({ projectId: id });
  const letters = (data?.letters ?? []) as CorrespondenceLetter[];

  const columns: ConstructionTableColumn<CorrespondenceLetter>[] = useMemo(
    () => [
      {
        key: "direction",
        header: "Dir",
        width: "50px",
        align: "center",
        render: (val) =>
          val === "incoming" ? (
            <span className="inline-flex items-center text-info/80 font-mono text-xs" title="Incoming">
              <ArrowDownLeft className="h-4 w-4" />
            </span>
          ) : (
            <span className="inline-flex items-center text-[var(--primary)] font-mono text-xs" title="Outgoing">
              <ArrowUpRight className="h-4 w-4" />
            </span>
          ),
      },
      {
        key: "ourRef",
        header: "Ref No.",
        width: "130px",
        sortable: true,
        render: (val, r) => (
          <div>
            <span className="font-mono font-bold text-primary text-xs">{val || r.theirRef || "—"}</span>
            {val && r.theirRef && (
              <span className="block text-[10px] text-muted-foreground font-mono">
                Ext: {r.theirRef}
              </span>
            )}
          </div>
        ),
      },
      {
        key: "subject",
        header: "Subject",
        sortable: true,
        render: (val) => <span className="font-medium text-foreground text-xs">{val}</span>,
      },
      {
        key: "fromName",
        header: "From / To Party",
        width: "160px",
        render: (val, r) => (
          <span className="text-muted-foreground text-xs">
            {val || r.fromParty || "—"}
          </span>
        ),
      },
      {
        key: "category",
        header: "Category",
        width: "110px",
        render: (val) => (
          <span className={cn("rounded px-1.5 py-0.5 text-[9px] font-bold uppercase font-mono", CATEGORY_COLORS[String(val)] ?? "bg-[var(--navy-mid)] text-muted-foreground")}>
            {CATEGORIES.find((c) => c.value === val)?.label ?? val}
          </span>
        ),
      },
      {
        key: "replyStatus",
        header: "Reply Status",
        width: "130px",
        render: (val) => <StatusBadge status={val} />,
      },
      {
        key: "replyDueDate",
        header: "Due Date",
        width: "110px",
        render: (val, r) => {
          if (!val) return <span className="text-muted-foreground font-mono text-xs">—</span>;
          const isOverdue = new Date(val) < new Date() && (r.replyStatus === "not_started" || r.replyStatus === "in_progress");
          return (
            <span className={cn("font-mono text-xs", isOverdue ? "text-red-400 font-bold" : "text-muted-foreground")}>
              {format(new Date(val), "dd MMM yyyy")} {isOverdue && "⚠️"}
            </span>
          );
        },
      },
      {
        key: "date",
        header: "Letter Date",
        width: "120px",
        render: (val) => (
          <span className="text-muted-foreground font-mono text-xs">
            {format(new Date(val), "dd MMM yyyy")}
          </span>
        ),
      },
    ],
    []
  );

  return (
    <>
      <ModuleTabs projectId={id} tabs={WF_TABS} />
      <div className="space-y-4 pb-8 font-sans">
        {/* Stats bar */}
        {statsData && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            <StatCard label="Total" value={statsData.total} icon={Mail} color="text-muted-foreground/80" />
            <StatCard label="Incoming" value={statsData.incoming} icon={ArrowDownLeft} color="text-info/80" />
            <StatCard label="Outgoing" value={statsData.outgoing} icon={ArrowUpRight} color="text-[var(--primary)]" />
            <StatCard label="Actionable" value={statsData.actionable} icon={FileText} color="text-amber-400" />
            <StatCard label="Overdue" value={statsData.overdue} icon={AlertTriangle} color="text-red-400" urgent={statsData.overdue > 0} />
          </div>
        )}

        {/* Action Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-2xl border border-[var(--border)] bg-card">
          <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
            <Mail className="h-4 w-4 text-[var(--primary)]" />
            <span>Official Site Correspondence &amp; Notices</span>
          </div>

          <Dialog open={logOpen} onOpenChange={setLogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="h-9 px-4 text-xs font-bold amber-cta-btn rounded-xl shadow-[0_0_20px_rgba(245,158,11,0.3)] transition gap-1.5 shrink-0 font-mono">
                <Plus className="h-3.5 w-3.5" /> Log Letter
              </Button>
            </DialogTrigger>
            <LogLetterDialog
              projectId={id}
              onDone={() => {
                setLogOpen(false);
                utils.correspondence.list.invalidate({ projectId: id });
                utils.correspondence.stats.invalidate({ projectId: id });
              }}
            />
          </Dialog>
        </div>

        {/* ConstructionTable Integration */}
        <ConstructionTable<CorrespondenceLetter>
          data={letters}
          columns={columns}
          isLoading={isLoading}
          searchPlaceholder="Search ref number, subject, party..."
          searchFilterKeys={["ourRef", "theirRef", "subject", "fromName", "fromParty", "category"]}
          onRowClick={(row) => setDetailId(row.id)}
          exportExcel={{
            filename: `Correspondence_Register_${format(new Date(), "yyyy-MM-dd")}`,
            sheetName: "Correspondence",
          }}
          emptyState={{
            title: "No Correspondence Logged",
            description: "Log official incoming and outgoing contractual letters, notices, and client communications.",
          }}
        />

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
