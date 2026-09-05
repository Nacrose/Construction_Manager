"use client";

import { use, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  CloudSun,
  Loader2,
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
import { format } from "date-fns";
import { toast } from "sonner";
import { AnimatedPage } from "@/components/ui/animated-page";
import { ConstructionTable, ConstructionTableColumn } from "@/components/ui/construction-table";
import { StatusBadge } from "@/components/ui/status-badge";

type DailyReportItem = {
  id: string;
  number: string;
  reportDate: Date | string;
  dayOfWeek: string | null;
  status: string;
  weatherMorning: string | null;
  weatherAfternoon: string | null;
  weatherEvening: string | null;
  maxTempC: number | null;
  rainfallMm: number | null;
  problems: string | null;
  workforce?: string | null;
  workProgress?: string | null;
  safetyNotes?: string | null;
  remarks?: string | null;
  createdAt: Date | string;
  createdBy: { id: string; name: string };
};

export default function DailyReportsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState("all");
  const [filterDate, setFilterDate] = useState("");

  const { data: projectInfo } = trpc.project.get.useQuery({ id }, { staleTime: 300_000 });

  const reportsQuery = trpc.workflow.dailyReport.listReports.useInfiniteQuery(
    {
      projectId: id,
      status: statusFilter !== "all" ? statusFilter : undefined,
    },
    { getNextPageParam: (last) => (last.hasMore ? last.nextCursor : undefined) }
  );
  const data = reportsQuery.data;
  const allReports = (data ? data.pages.flatMap((p) => p.reports) : []) as DailyReportItem[];

  const utils = trpc.useUtils();

  const myRole = projectInfo?.myRole;
  const canWrite = !!myRole;

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
        const existing = allReports.filter((r) => r.number.startsWith(`DSR-${dateStr}`));
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
  const filteredReports = useMemo(() => {
    return allReports.filter((r) => {
      if (filterDate) {
        const rd = new Date(r.reportDate);
        const fd = new Date(filterDate);
        if (
          rd.getFullYear() !== fd.getFullYear() ||
          rd.getMonth() !== fd.getMonth() ||
          rd.getDate() !== fd.getDate()
        )
          return false;
      }
      return true;
    });
  }, [allReports, filterDate]);

  const columns: ConstructionTableColumn<DailyReportItem>[] = useMemo(
    () => [
      {
        key: "number",
        header: "Report No.",
        width: "140px",
        sortable: true,
        render: (val) => (
          <span className="font-mono font-bold text-primary text-xs">{val}</span>
        ),
      },
      {
        key: "reportDate",
        header: "Date",
        width: "130px",
        sortable: true,
        render: (val, r) => (
          <div className="text-xs font-mono">
            <span className="font-medium text-foreground">{format(new Date(val), "dd MMM yyyy")}</span>
            {r.dayOfWeek && <span className="block text-[10px] text-muted-foreground">{r.dayOfWeek}</span>}
          </div>
        ),
      },
      {
        key: "status",
        header: "Status",
        width: "110px",
        render: (val) => <StatusBadge status={val} />,
      },
      {
        key: "weatherMorning",
        header: "Weather",
        width: "130px",
        render: (val, r) => (
          <div className="text-xs text-muted-foreground font-mono">
            {val ? (
              <span className="flex items-center gap-1">
                <CloudSun className="h-3.5 w-3.5 text-amber-400" />
                <span className="capitalize">{val}</span>
                {r.maxTempC != null && ` ${r.maxTempC}°C`}
              </span>
            ) : (
              "—"
            )}
            {r.rainfallMm != null && r.rainfallMm > 0 && (
              <span className="block text-[10px] text-info">{r.rainfallMm}mm rain</span>
            )}
          </div>
        ),
      },
      {
        key: "problems",
        header: "Problems / Site Notes",
        render: (val) => (
          <span className="text-xs text-muted-foreground truncate block max-w-[320px]">
            {val || "No issues recorded."}
          </span>
        ),
      },
      {
        key: "createdBy",
        header: "Created By",
        width: "140px",
        render: (val) => (
          <span className="text-xs text-muted-foreground">{val?.name ?? "—"}</span>
        ),
      },
      ...(canWrite
        ? [
            {
              key: "actions",
              header: "",
              width: "48px",
              align: "right" as const,
              render: (_: any, r: DailyReportItem) => (
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
              ),
            },
          ]
        : []),
    ],
    [canWrite]
  );

  return (
    <AnimatedPage className="space-y-3 pb-8 font-mono">
      {/* ConstructionTable Integration (Zero Redundant Section Header) */}
      <ConstructionTable<DailyReportItem>
        data={filteredReports}
        columns={columns}
        isLoading={reportsQuery.isLoading}
        searchPlaceholder="Search report number, problems..."
        searchFilterKeys={["number", "problems"]}
        onRowClick={(row) => router.push(`/projects/${id}/workflow/reports/${row.id}`)}
        headerActions={
          <div className="flex items-center gap-2">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-8 text-xs w-[120px] font-mono bg-card border-border">
                <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent className="font-mono text-xs">
                {["all", "draft", "submitted", "approved", "archived"].map((s) => (
                  <SelectItem key={s} value={s} className="capitalize">
                    {s === "all" ? "All Status" : s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Input
              type="date"
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
              className="h-8 text-xs w-[130px] font-mono bg-card border-border"
              title="Filter by date"
            />

            {canWrite && (
              <Button
                size="sm"
                className="h-8 text-xs font-mono font-bold bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5 shadow-sm"
                disabled={createMutation.isPending}
                onClick={() => {
                  const today = new Date();
                  const dateStr = format(today, "yyyyMMdd");
                  const num = `DSR-${dateStr}`;
                  createMutation.mutate({
                    projectId: id,
                    number: num,
                    reportDate: today.toISOString(),
                  });
                }}
              >
                {createMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Plus className="h-3.5 w-3.5" />
                )}
                New Report
              </Button>
            )}
          </div>
        }
        loadMore={
          reportsQuery.hasNextPage
            ? {
                onLoadMore: () => reportsQuery.fetchNextPage(),
                isLoadingMore: reportsQuery.isFetchingNextPage,
                label: "Load more reports",
              }
            : undefined
        }
        exportExcel={{
          filename: `Daily_Reports_${format(new Date(), "yyyy-MM-dd")}`,
          sheetName: "Daily Reports",
        }}
        emptyState={{
          title: "No Daily Reports Yet",
          description:
            "Create your first daily site report to track daily site progress, workforce, and weather.",
        }}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => {
          if (!o) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent className="font-mono bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-sm font-bold text-foreground">
              Delete Daily Report?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-muted-foreground">
              Are you sure you want to delete{" "}
              <span className="font-bold text-primary">{deleteTarget?.number}</span>? This will
              permanently remove the report and its logged progress.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={deleteMutation.isPending}
              className="text-xs font-mono"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 text-xs font-mono font-bold"
              disabled={deleteMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (deleteTarget) {
                  deleteMutation.mutate({ reportId: deleteTarget.id });
                }
              }}
            >
              {deleteMutation.isPending && (
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              )}
              Delete Report
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AnimatedPage>
  );
}