"use client";

import { trpc } from "@/lib/trpc-client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { History, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { formatNpr } from "@/lib/currency";
import { cn } from "@/lib/utils";

/**
 * Read-only cross-project person history (Phase D / ADR-0005): the
 * assignment chain, advances ledger, payroll records and leave requests —
 * everything that survives an engagement ending. Mounted conditionally
 * per person so the query only runs while the dialog is shown.
 */
export function PersonHistoryDialog({
  projectId,
  personId,
  personName,
  onClose,
}: {
  projectId: string;
  personId: string;
  personName: string;
  onClose: () => void;
}) {
  // projectId is required by the projectProcedure middleware (raw input);
  // the org-scoped read itself is the record-level authorization.
  const historyInput = { projectId, personId };
  const { data, isLoading } = trpc.hr.getPersonHistory.useQuery(historyInput);

  const statusTone = (status: string) =>
    cn("text-[9px] px-1.5 py-0 capitalize", {
      "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300":
        status === "active" || status === "approved" || status === "disbursed" || status === "paid",
      "bg-amber-100 text-amber-800 dark:bg-amber-950":
        status === "pending" || status === "draft" || status === "partial",
      "bg-red-100 text-red-800 dark:bg-red-950": status === "rejected" || status === "unpaid",
      "bg-muted text-foreground/80 dark:bg-[var(--navy-mid)]": status === "ended",
    });

  const fmtDate = (d: Date | string | null | undefined) =>
    d ? format(new Date(d), "yyyy-MM-dd") : "—";

  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <History className="h-5 w-5 text-primary" />
            Workforce History — {personName}
          </DialogTitle>
          <DialogDescription className="text-xs">
            Org-wide record across all projects: engagement chain, advances, payroll and leave.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-xs text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading history…
          </div>
        ) : !data ? (
          <p className="text-[11px] text-muted-foreground italic">No history data available.</p>
        ) : (
          <div className="space-y-4 py-2">
            {/* Engagements */}
            <div className="space-y-1.5">
              <h4 className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                Engagements (Assignments)
              </h4>
              {data.assignments.length === 0 ? (
                <p className="text-[11px] text-muted-foreground italic">No assignments recorded.</p>
              ) : (
                <div className="rounded-md border divide-y">
                  {data.assignments.map((a) => (
                    <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-2.5 py-1.5 text-xs">
                      <div>
                        <span className="font-medium text-foreground">{a.project?.name || a.projectId}</span>
                        {a.designation && <span className="text-muted-foreground"> · {a.designation}</span>}
                        <span className="block text-[10px] font-mono text-muted-foreground">
                          {fmtDate(a.fromDate)} → {a.toDate ? fmtDate(a.toDate) : "current"}
                        </span>
                      </div>
                      <Badge variant="secondary" className={statusTone(a.status)}>
                        {a.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Advances */}
            <div className="space-y-1.5">
              <h4 className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                Advances (Outstanding: {formatNpr(data.advances.outstandingTotal)})
              </h4>
              {data.advances.rows.length === 0 ? (
                <p className="text-[11px] text-muted-foreground italic">No advances recorded.</p>
              ) : (
                <div className="rounded-md border divide-y">
                  {data.advances.rows.map((adv) => (
                    <div key={adv.id} className="flex flex-wrap items-center justify-between gap-2 px-2.5 py-1.5 text-xs">
                      <div>
                        <span className="font-medium text-foreground capitalize">{adv.type}</span>
                        <span className="text-muted-foreground"> · {adv.project?.name || adv.projectId}</span>
                        <span className="block text-[10px] font-mono text-muted-foreground">{fmtDate(adv.date)}</span>
                      </div>
                      <div className="text-right font-mono text-[11px]">
                        <span className="font-bold text-foreground">{formatNpr(adv.amount)}</span>
                        <span className="block text-muted-foreground">
                          Recovered: {formatNpr(adv.recoveredAmount)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Payroll records */}
            <div className="space-y-1.5">
              <h4 className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                Payroll Records
              </h4>
              {data.payrollRecords.length === 0 ? (
                <p className="text-[11px] text-muted-foreground italic">No payroll records.</p>
              ) : (
                <div className="rounded-md border divide-y">
                  {data.payrollRecords.map((rec) => (
                    <div key={rec.id} className="flex flex-wrap items-center justify-between gap-2 px-2.5 py-1.5 text-xs">
                      <div>
                        <span className="font-medium font-mono text-foreground">
                          {rec.payrollRun?.period || "—"}
                        </span>
                        <span className="block text-[10px] text-muted-foreground">
                          Run status: {rec.payrollRun?.status || "—"}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-foreground text-xs">
                          {formatNpr(rec.netPayable)}
                        </span>
                        <Badge variant="secondary" className={statusTone(rec.paymentStatus)}>
                          {rec.paymentStatus}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Leave requests */}
            <div className="space-y-1.5">
              <h4 className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                Leave Requests
              </h4>
              {data.leaveRequests.length === 0 ? (
                <p className="text-[11px] text-muted-foreground italic">No leave requests.</p>
              ) : (
                <div className="rounded-md border divide-y">
                  {data.leaveRequests.map((lv) => (
                    <div key={lv.id} className="flex flex-wrap items-center justify-between gap-2 px-2.5 py-1.5 text-xs">
                      <div>
                        <span className="font-medium text-foreground capitalize">{lv.leaveType}</span>
                        <span className="text-muted-foreground"> · {lv.project?.name || lv.projectId}</span>
                        <span className="block text-[10px] font-mono text-muted-foreground">
                          {fmtDate(lv.startDate)} → {fmtDate(lv.endDate)}
                        </span>
                      </div>
                      <Badge variant="secondary" className={statusTone(lv.status)}>
                        {lv.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
