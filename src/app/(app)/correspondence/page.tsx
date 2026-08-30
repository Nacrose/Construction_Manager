"use client";

import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc-client";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Plus, Mail, AlertTriangle, ArrowDownLeft, ArrowUpRight, Clock,
  FileText, Building2,
} from "lucide-react";
import { format } from "date-fns";
import { LogLetterDialog } from "@/app/(app)/projects/[id]/correspondence/components/log-letter-dialog";
import { LetterDetailDialog } from "@/app/(app)/projects/[id]/correspondence/components/letter-detail-dialog";
import { ConstructionTable, ConstructionTableColumn } from "@/components/ui/construction-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type CorrespondenceLetter = {
  id: string;
  projectId: string;
  direction: string;
  ourRef?: string | null;
  theirRef?: string | null;
  subject: string;
  fromName?: string | null;
  toName?: string | null;
  fromParty?: string | null;
  toParty?: string | null;
  category: string;
  letterType: string;
  replyStatus: string;
  replyDueDate?: string | null;
  date: Date | string;
  project?: {
    id: string;
    name: string;
    code: string;
  };
};

export default function OrgCorrespondencePage() {
  const [selectedProjectId, setSelectedProjectId] = useState<string>("all");
  const [directionFilter, setDirectionFilter] = useState<string>("all");
  const [letterTypeFilter, setLetterTypeFilter] = useState<string>("all");
  const [logOpen, setLogOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  const { data: projectsData } = trpc.project.list.useQuery();
  const projects = projectsData?.projects || [];

  const { data, isLoading } = trpc.correspondence.list.useQuery({
    projectId: selectedProjectId === "all" ? undefined : selectedProjectId,
    direction: directionFilter === "all" ? undefined : directionFilter,
    letterType: letterTypeFilter === "all" ? undefined : letterTypeFilter,
  });

  const { data: statsData } = trpc.correspondence.stats.useQuery({
    projectId: selectedProjectId === "all" ? undefined : selectedProjectId,
  });

  const letters = useMemo(() => (data?.letters ?? []) as CorrespondenceLetter[], [data?.letters]);

  // KPI Metrics from backend stats
  const totalCount = statsData?.total ?? letters.length;
  const actionablePending = statsData?.pendingReply ?? 0;
  const overdueCount = statsData?.overdue ?? 0;
  const eotClaimsCount = useMemo(() => letters.filter((l) => l.letterType === "eot_claim").length, [letters]);

  const columns: ConstructionTableColumn<CorrespondenceLetter>[] = useMemo(
    () => [
      {
        key: "direction",
        header: "Dir",
        width: "50px",
        align: "center",
        render: (val) =>
          val === "incoming" ? (
            <span className="inline-flex items-center text-blue-400 font-mono text-xs" title="Incoming (दर्ता)">
              <ArrowDownLeft className="h-4 w-4" />
            </span>
          ) : (
            <span className="inline-flex items-center text-emerald-400 font-mono text-xs" title="Outgoing (चलानी)">
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
            <span className="font-mono font-bold text-emerald-400 text-xs">{val || r.theirRef || "—"}</span>
            {val && r.theirRef && (
              <span className="block text-[10px] text-gray-400 font-mono">
                Ext: {r.theirRef}
              </span>
            )}
          </div>
        ),
      },
      {
        key: "project",
        header: "Project",
        width: "140px",
        sortable: true,
        render: (val, r) => (
          <div className="text-xs">
            <div className="font-medium text-white truncate max-w-[130px]">
              {r.project?.name || "Project Site"}
            </div>
            <div className="text-[10px] font-mono text-gray-400">{r.project?.code}</div>
          </div>
        ),
      },
      {
        key: "subject",
        header: "Subject & Summary",
        sortable: true,
        searchable: true,
        render: (val) => <span className="font-medium text-white text-xs">{val}</span>,
      },
      {
        key: "fromName",
        header: "From / To Party",
        width: "160px",
        render: (_val, r) => (
          <div className="text-xs">
            <div className="font-medium text-white truncate max-w-[150px]">
              {r.direction === "incoming" ? r.fromParty || "External" : r.toParty || "Recipient"}
            </div>
            <div className="text-[10px] text-gray-400 truncate max-w-[150px]">
              {r.direction === "incoming" ? r.fromName || "—" : r.toName || "—"}
            </div>
          </div>
        ),
      },
      {
        key: "letterType",
        header: "Type",
        width: "100px",
        render: (val) => {
          if (val === "actionable") {
            return (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/30">
                Actionable
              </span>
            );
          }
          if (val === "eot_claim") {
            return (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/30">
                EOT Claim
              </span>
            );
          }
          return <span className="text-[10px] text-gray-400 font-mono">Informative</span>;
        },
      },
      {
        key: "replyStatus",
        header: "Status",
        width: "110px",
        render: (val) => <StatusBadge status={val} />,
      },
      {
        key: "replyDueDate",
        header: "Reply Due",
        width: "100px",
        render: (val, r) => {
          if (r.replyStatus === "sent" || r.replyStatus === "closed") {
            return <span className="text-[10px] text-gray-500 font-mono">Closed</span>;
          }
          if (!val) return <span className="text-[10px] text-gray-500 font-mono">—</span>;
          const dueDate = new Date(val);
          return (
            <span className="text-xs font-mono font-semibold text-gray-300">
              {format(dueDate, "dd MMM yyyy")}
            </span>
          );
        },
      },
      {
        key: "date",
        header: "Date",
        width: "90px",
        sortable: true,
        render: (val) => (
          <span className="text-xs font-mono text-gray-400">
            {val ? format(new Date(val), "dd MMM yy") : "—"}
          </span>
        ),
      },
      {
        key: "actions",
        header: "Detail",
        width: "80px",
        align: "right",
        render: (_val, r) => (
          <Button
            size="sm"
            variant="ghost"
            onClick={(e) => {
              e.stopPropagation();
              setDetailId(r.id);
            }}
            className="h-6 px-2 text-[11px] font-mono text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10"
          >
            View
          </Button>
        ),
      },
    ],
    []
  );

  return (
    <div className="space-y-4 pb-8">
      {/* Header Bar with KPI Metrics & Action */}
      <div className="p-4 rounded-2xl border border-white/10 bg-[#0c1015] flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-emerald-400" />
            <h1 className="text-lg font-bold text-white tracking-tight">
              Enterprise Correspondence Register
            </h1>
            <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
              सम्पूर्ण आयोजना पत्र दर्ता / चलानी
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            Centralized formal letter tracking, client/consultant notices, EOT claims, and reply deadlines across all site projects.
          </p>
        </div>

        {/* Quick KPI summary chips */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#121820] border border-white/10 text-xs">
            <span className="text-gray-400">Total:</span>
            <span className="font-bold text-white font-mono">{totalCount}</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs">
            <Clock className="h-3.5 w-3.5 text-amber-400" />
            <span className="text-amber-300">Pending Reply:</span>
            <span className="font-bold text-amber-400 font-mono">{actionablePending}</span>
          </div>
          {overdueCount > 0 && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs">
              <AlertTriangle className="h-3.5 w-3.5 text-rose-400" />
              <span className="text-rose-300">Overdue:</span>
              <span className="font-bold text-rose-400 font-mono">{overdueCount}</span>
            </div>
          )}
          {eotClaimsCount > 0 && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-xs">
              <span className="text-cyan-300">EOT Claims:</span>
              <span className="font-bold text-cyan-400 font-mono">{eotClaimsCount}</span>
            </div>
          )}

          <Button
            size="sm"
            onClick={() => setLogOpen(true)}
            className="h-8 px-3 text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-bold gap-1.5 rounded-xl shadow-md"
          >
            <Plus className="h-3.5 w-3.5" />
            + Log Letter (दर्ता / चलानी)
          </Button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl border border-white/10 bg-[#0c1015]">
        <div className="flex items-center gap-2 flex-wrap flex-1">
          {/* Project Scoper */}
          <div className="flex items-center gap-1.5">
            <Building2 className="h-3.5 w-3.5 text-gray-400" />
            <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
              <SelectTrigger className="h-8 text-xs bg-[#121820] border-white/10 text-white min-w-[170px] rounded-lg">
                <SelectValue placeholder="All Projects" />
              </SelectTrigger>
              <SelectContent className="bg-[#0f141c] border-white/10 text-white text-xs">
                <SelectItem value="all">🏢 All Projects (सम्पूर्ण आयोजना)</SelectItem>
                {projects.map((p: any) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} ({p.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Direction Filter */}
          <Select value={directionFilter} onValueChange={setDirectionFilter}>
            <SelectTrigger className="h-8 text-xs bg-[#121820] border-white/10 text-white w-32 rounded-lg">
              <SelectValue placeholder="Direction" />
            </SelectTrigger>
            <SelectContent className="bg-[#0f141c] border-white/10 text-white text-xs">
              <SelectItem value="all">All Directions</SelectItem>
              <SelectItem value="incoming">📥 Incoming (दर्ता)</SelectItem>
              <SelectItem value="outgoing">📤 Outgoing (चलानी)</SelectItem>
            </SelectContent>
          </Select>

          {/* Letter Type */}
          <Select value={letterTypeFilter} onValueChange={setLetterTypeFilter}>
            <SelectTrigger className="h-8 text-xs bg-[#121820] border-white/10 text-white w-36 rounded-lg">
              <SelectValue placeholder="Letter Type" />
            </SelectTrigger>
            <SelectContent className="bg-[#0f141c] border-white/10 text-white text-xs">
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="actionable">Actionable (जवाफ आवश्यक)</SelectItem>
              <SelectItem value="informative">Informative (जानकारी मात्र)</SelectItem>
              <SelectItem value="eot_claim">EOT Claim (म्याद थप)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Unified Table */}
      <ConstructionTable<CorrespondenceLetter>
        data={letters}
        columns={columns}
        isLoading={isLoading}
        searchPlaceholder="Search ref #, subject, sender, project..."
        exportExcel={{
          filename: `Company_Correspondence_Register_${format(new Date(), "yyyy-MM-dd")}`,
          sheetName: "Correspondence",
        }}
        emptyState={{
          icon: FileText,
          title: "No Correspondence Logged",
          description: "Log incoming client notices or outgoing contractor letters across projects.",
        }}
        onRowClick={(row) => setDetailId(row.id)}
      />

      {/* Log Letter Dialog */}
      <Dialog open={logOpen} onOpenChange={setLogOpen}>
        {logOpen && (
          <LogLetterDialog
            projectId={selectedProjectId === "all" ? undefined : selectedProjectId}
            onDone={() => setLogOpen(false)}
          />
        )}
      </Dialog>

      {/* Letter Detail Dialog */}
      <Dialog open={!!detailId} onOpenChange={(o) => !o && setDetailId(null)}>
        {detailId && (
          <LetterDetailDialog
            letterId={detailId}
            onClose={() => setDetailId(null)}
          />
        )}
      </Dialog>
    </div>
  );
}
