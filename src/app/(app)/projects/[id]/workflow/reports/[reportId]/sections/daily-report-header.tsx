"use client";

import Link from "next/link";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import {
  ChevronLeft,
  Send,
  CheckCircle2,
  Loader2,
  Printer,
  FileText,
  Share2,
  Trash2,
} from "lucide-react";

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-muted text-foreground/80 dark:bg-[var(--navy-mid)] dark:text-foreground/80",
  submitted: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  approved: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  archived: "bg-muted text-muted-foreground dark:bg-[var(--navy-mid)] dark:text-muted-foreground/80",
};

export function DailyReportHeader({
  id,
  reportId,
  report,
  canEdit,
  isAdmin,
  canDelete,
  saving,
  lastSaved,
  statusMutation,
  deleteMutation,
  deleteOpen,
  setDeleteOpen,
  setShareOpen,
}: {
  id: string;
  reportId: string;
  report: any;
  canEdit: boolean;
  isAdmin: boolean;
  canDelete: boolean;
  saving: boolean;
  lastSaved: { field: string; at: Date } | null;
  statusMutation: any;
  deleteMutation: any;
  deleteOpen: boolean;
  setDeleteOpen: (val: boolean) => void;
  setShareOpen: (val: boolean) => void;
}) {
  return (
    <header className="shrink-0 border-b border-border bg-card px-4 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Link
            href={`/projects/${id}/workflow/reports`}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted transition-colors"
            title="Back to daily reports"
          >
            <ChevronLeft className="h-4 w-4" />
          </Link>
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-mono text-sm font-semibold text-foreground">{report.number}</span>
            <Badge
              variant="secondary"
              className={cn("text-[10px] capitalize", STATUS_STYLES[report.status])}
            >
              {report.status}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {format(new Date(report.reportDate), "dd MMM yyyy")}
              {report.dayOfWeek && ` (${report.dayOfWeek})`}
            </span>
            {!canEdit && <span className="text-[10px] text-amber-600 font-medium">🔒 Read-only</span>}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
          {saving && (
            <span className="text-[10px] text-muted-foreground flex items-center gap-1 mr-1">
              <Loader2 className="h-3 w-3 animate-spin" /> saving...
            </span>
          )}
          {lastSaved && !saving && (
            <span className="text-[10px] text-muted-foreground mr-1">
              saved {format(lastSaved.at, "HH:mm")}
            </span>
          )}

          {/* Status transitions */}
          {canEdit && isAdmin && report.status === "draft" && (
            <Button
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={() => statusMutation.mutate({ reportId, status: "submitted" })}
              disabled={statusMutation.isPending}
            >
              <Send className="h-3 w-3" /> Submit
            </Button>
          )}

          {report.status === "submitted" && isAdmin && (
            <>
              <Button
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={() => statusMutation.mutate({ reportId, status: "approved" })}
                disabled={statusMutation.isPending}
              >
                <CheckCircle2 className="h-3 w-3" /> Approve
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => statusMutation.mutate({ reportId, status: "draft" })}
                disabled={statusMutation.isPending}
              >
                Return to Draft
              </Button>
            </>
          )}

          {report.status === "approved" && isAdmin && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => statusMutation.mutate({ reportId, status: "archived" })}
              disabled={statusMutation.isPending}
            >
              Archive
            </Button>
          )}

          {/* Quick Actions */}
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs gap-1"
            onClick={() =>
              window.open(
                `/projects/${id}/workflow/reports/${reportId}/print`,
                "_blank",
                "noopener,noreferrer"
              )
            }
            title="Quick PDF print preview"
          >
            <Printer className="h-3 w-3" /> Quick PDF
          </Button>

          <Link href={`/projects/${id}/workflow/reports/${reportId}/pdf-designer`}>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1"
              title="Customize PDF layout"
            >
              <FileText className="h-3 w-3" /> PDF Designer
            </Button>
          </Link>

          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs gap-1"
            onClick={() => setShareOpen(true)}
          >
            <Share2 className="h-3 w-3" /> Share
          </Button>

          {canDelete && (
            <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => setDeleteOpen(true)}
                title="Delete report"
              >
                <Trash2 className="h-3 w-3" />
              </Button>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete this Daily Report?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This permanently deletes {report.number} and removes its logged progress.
                    This cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    disabled={deleteMutation.isPending}
                    onClick={(e) => {
                      e.preventDefault();
                      deleteMutation.mutate({ reportId });
                    }}
                  >
                    {deleteMutation.isPending && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Delete Report
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>
    </header>
  );
}
