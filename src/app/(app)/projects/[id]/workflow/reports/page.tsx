"use client";

import { use, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc-client";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Plus,
  Search,
  CloudSun,
  Loader2,
  Inbox,
  FileText,
  CheckCircle2,
  Users,
  Wrench,
  Users2,
  FileSpreadsheet,
  ListChecks,
  RefreshCw,
  AlertCircle,
  ChevronLeft,
  X,
  Package,
  Download,
  Trash2,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {format} from "date-fns";
import { exportDailyReportsToXlsx } from "@/lib/export-excel";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

type _Report = {
  id: string;
  number: string;
  reportDate: Date;
  dayOfWeek: string | null;
  status: string;
  weatherMorning: string | null;
  weatherAfternoon: string | null;
  maxTempC: number | null;
  rainfallMm: number | null;
  problems: string | null;
  createdAt: Date;
  createdBy: { id: string; name: string };
};

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  submitted: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  approved: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  archived: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
};

const WEATHER_OPTIONS = ["clear", "cloudy", "overcast", "rain", "fog", "storm"];

const CreateSchema = z.object({
  number: z.string().min(1),
  reportDate: z.string(),
  weatherMorning: z.string().optional(),
  weatherAfternoon: z.string().optional(),
  weatherEvening: z.string().optional(),
  maxTempC: z.string().optional(),
  minTempC: z.string().optional(),
  rainfallMm: z.string().optional(),
  problems: z.string().optional(),
  safetyNotes: z.string().optional(),
  remarks: z.string().optional(),
});
type CreateValues = z.infer<typeof CreateSchema>;

import { AnimatedPage } from "@/components/ui/animated-page";

export default function DailyReportsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [filterDate, setFilterDate] = useState("");

  const { data: projectInfo } = trpc.project.get.useQuery({ id }, { staleTime: 300_000 });

  const { data, isLoading } = trpc.workflow.dailyReport.listReports.useQuery({
    projectId: id,
    status: statusFilter !== "all" ? statusFilter : undefined,
    q: search || undefined,
  });

  const utils = trpc.useUtils();

  const myRole = projectInfo?.myRole;
  const canWrite = myRole && myRole !== "client" && myRole !== "inspector";

  const createMutation = trpc.workflow.dailyReport.createReport.useMutation({
    onSuccess: (data) => {
      utils.workflow.dailyReport.listReports.invalidate({ projectId: id });
      if (data?.report?.id) {
        router.push(`/projects/${id}/workflow/reports/${data.report.id}`);
      }
    },
    onError: (e) => {
      // If duplicate number, try with -2 suffix
      if (e.message?.includes("already exists")) {
        const today = new Date();
        const dateStr = format(today, "yyyyMMdd");
        const existing = (data?.reports || []).filter(r => r.number.startsWith(`DSR-${dateStr}`));
        const suffix = existing.length + 1;
        createMutation.mutate({ projectId: id, number: `DSR-${dateStr}-${suffix}`, reportDate: today.toISOString() });
      } else {
        toast.error(e.message ?? "Failed to create report");
      }
    },
  });

  const [deleteTarget, setDeleteTarget] = useState<{ id: string; number: string } | null>(null);

  const deleteMutation = trpc.workflow.dailyReport.deleteReport.useMutation({
    onSuccess: () => {
      utils.workflow.dailyReport.listReports.invalidate({ projectId: id });
      toast.success("Report deleted");
      setDeleteTarget(null);
    },
    onError: (e) => toast.error(e.message),
  });

  // Client-side date filter
  const filteredReports = (data?.reports || []).filter(r => {
    if (filterDate) {
      const rd = new Date(r.reportDate);
      const fd = new Date(filterDate);
      if (rd.getFullYear() !== fd.getFullYear() || rd.getMonth() !== fd.getMonth() || rd.getDate() !== fd.getDate()) return false;
    }
    return true;
  });

  return (
    <AnimatedPage className="space-y-4 pb-8">
      {/* ───────── Header ───────── */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Link href={`/projects/${id}`} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted hover:text-foreground transition-colors" title="Back to project">
            <ChevronLeft className="h-4 w-4" />
          </Link>
          <div className="flex items-center gap-1.5 text-sm min-w-0">
            <Link href={`/projects/${id}`} className="text-muted-foreground hover:text-foreground truncate">
              {projectInfo?.project.code ?? "Project"}
            </Link>
            <span className="text-muted-foreground/50">/</span>
            <span className="font-semibold text-foreground">Daily Reports</span>
          </div>
        </div>
        {canWrite && (
          <Button size="sm" className="h-8 text-xs gap-1.5" disabled={createMutation.isPending} onClick={() => {
            const today = new Date();
            const dateStr = format(today, "yyyyMMdd");
            const num = `DSR-${dateStr}`;
            createMutation.mutate({ projectId: id, number: num, reportDate: today.toISOString() });
          }}>
            {createMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            New Report
          </Button>
        )}
        <Button
          size="sm"
          variant="outline"
          className="h-8 text-xs gap-1.5"
          disabled={!filteredReports.length}
          onClick={async () => {
            try {
              await exportDailyReportsToXlsx(
                filteredReports.map((r: any) => ({
                  number: r.number,
                  reportDate: r.reportDate,
                  status: r.status,
                  weather: r.weatherMorning ? `${r.weatherMorning}/${r.weatherAfternoon ?? ""}/${r.weatherEvening ?? ""}` : null,
                  workforce: r.workforce,
                  workProgress: r.workProgress,
                  problems: r.problems,
                  safetyNotes: r.safetyNotes,
                  remarks: r.remarks,
                })),
                projectInfo?.project?.name ?? "Project"
              );
              toast.success("Excel exported");
            } catch {
              toast.error("Export failed");
            }
          }}
        >
          <Download className="h-3.5 w-3.5" />
          Export
        </Button>
      </div>

      {/* ───────── Filter bar ───────── */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search number, problems…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 pl-7 text-xs"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-8 text-xs w-[120px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {["all", "draft", "submitted", "approved", "archived"].map((s) => (
              <SelectItem key={s} value={s} className="capitalize text-xs">
                {s === "all" ? "All Status" : s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          type="date"
          value={filterDate}
          onChange={(e) => setFilterDate(e.target.value)}
          className="h-8 text-xs w-[130px]"
        />
        {(search || filterDate || statusFilter !== "all") && (
          <Button variant="ghost" size="sm" className="h-8 text-xs px-2" onClick={() => { setSearch(""); setFilterDate(""); setStatusFilter("all"); }}>
            <X className="h-3 w-3" />
          </Button>
        )}
      </div>

      {/* ───────── Reports table ───────── */}
      {isLoading ? (
        <Skeleton className="h-64" />
      ) : !filteredReports.length ? (
        <Card className="flex flex-col items-center gap-3 p-12 text-center">
          <Inbox className="h-12 w-12 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {search || filterDate || statusFilter !== "all"
              ? "No reports match your filters."
              : "No daily reports yet. Create one to start tracking site progress."}
          </p>
        </Card>
      ) : (
        <div>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Reports ({filteredReports.length})
          </h3>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="h-8 text-xs">Number</TableHead>
                  <TableHead className="h-8 text-xs w-28">Date</TableHead>
                  <TableHead className="h-8 text-xs w-20">Status</TableHead>
                  <TableHead className="h-8 text-xs w-24">Weather</TableHead>
                  <TableHead className="h-8 text-xs">Problems / Notes</TableHead>
                  <TableHead className="h-8 text-xs w-24">Created By</TableHead>
                  {canWrite && <TableHead className="h-8 text-xs w-12 text-right">Action</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredReports.map((r) => (
                  <TableRow
                    key={r.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => router.push(`/projects/${id}/workflow/reports/${r.id}`)}
                  >
                    <TableCell className="py-1.5 font-mono text-xs font-medium">
                      {r.number}
                    </TableCell>
                    <TableCell className="py-1.5 text-xs text-muted-foreground">
                      {format(new Date(r.reportDate), "dd MMM yyyy")}
                      {r.dayOfWeek && <span className="block text-[10px]">{r.dayOfWeek}</span>}
                    </TableCell>
                    <TableCell className="py-1.5">
                      <Badge variant="secondary" className={`text-[10px] capitalize ${STATUS_STYLES[r.status] ?? STATUS_STYLES.draft}`}>
                        {r.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-1.5 text-xs text-muted-foreground">
                      {r.weatherMorning ? (
                        <span className="flex items-center gap-1">
                          <CloudSun className="h-3 w-3" />
                          {r.weatherMorning}
                          {r.maxTempC != null && ` ${r.maxTempC}°`}
                        </span>
                      ) : "—"}
                      {r.rainfallMm != null && r.rainfallMm > 0 && (
                        <span className="block text-[10px]">{r.rainfallMm}mm</span>
                      )}
                    </TableCell>
                    <TableCell className="py-1.5 text-xs text-muted-foreground truncate max-w-[250px]">
                      {r.problems || "No issues recorded."}
                    </TableCell>
                    <TableCell className="py-1.5 text-xs text-muted-foreground">
                      {r.createdBy.name}
                    </TableCell>
                    {canWrite && (
                      <TableCell className="py-1.5 text-right" onClick={(e) => e.stopPropagation()}>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                          title={`Delete ${r.number}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteTarget({ id: r.id, number: r.number });
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Daily Report?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <span className="font-mono font-semibold text-foreground">{deleteTarget?.number}</span>? This will remove the report and its logged progress.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (deleteTarget) {
                  deleteMutation.mutate({ reportId: deleteTarget.id });
                }
              }}
            >
              {deleteMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete Report
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AnimatedPage>
  );
}