"use client";

import { useState } from "react";
import { z } from "zod";
import { trpc } from "@/lib/trpc-client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  CheckCircle2,
  XCircle,
  Calendar,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { FormDialogEngine } from "@/components/engine/form-dialog-engine";
import { FormDateField, FormSelectField, FormTextField } from "@/components/engine/form-fields";
import { useRegister } from "@/hooks/use-register";
import { useAction } from "@/hooks/use-action";

const LEAVE_TYPES = ["casual", "sick", "paid", "unpaid", "emergency", "maternity"];

/** Client-side validation for the Apply Leave dialog (server re-validates). */
const applyLeaveSchema = z
  .object({
    staffId: z.string().min(1, "Please select a worker"),
    leaveType: z.string(),
    startDate: z.string().min(1, "Start date is required"),
    endDate: z.string().min(1, "End date is required"),
    reason: z.string(),
  })
  .refine((v) => v.endDate >= v.startDate, {
    message: "End date must be on or after start date",
    path: ["endDate"],
  });

export function LeavesTab({
  projectId,
  staffList = [],
  isAdmin = false,
  canWrite = false,
}: {
  projectId: string;
  staffList: Array<{ id: string; name: string; designation: string | null; category: string | null }>;
  isAdmin?: boolean;
  canWrite?: boolean;
}) {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [addOpen, setAddOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{
    open: boolean;
    type: "approve" | "reject";
    id: string;
    employeeName: string;
    dates: string;
  } | null>(null);

  // List side: register engine (typed data + pick + refresh).
  const status = statusFilter === "pending" || statusFilter === "approved" || statusFilter === "rejected" ? statusFilter : undefined;
  const listQuery = trpc.leave.list.useQuery({ projectId, status });
  const register = useRegister({
    data: listQuery.data,
    isLoading: listQuery.isLoading,
    isFetching: listQuery.isFetching,
    refresh: listQuery.refetch,
    pick: (d) => d?.leaves ?? [],
  });
  const { items: leaves } = register;

  const pendingCount = leaves.filter((l) => l.status === "pending").length;
  const approvedCount = leaves.filter((l) => l.status === "approved").length;
  const rejectedCount = leaves.filter((l) => l.status === "rejected").length;

  // Transition actions: useAction owns toast + invalidate + error protocol.
  const approveMut = useAction(trpc.leave.approve, {
    successMessage: "Leave approved",
    invalidate: (u) => u.leave.list.invalidate({ projectId }),
    onSuccess: () => setConfirmAction(null),
  });

  const rejectMut = useAction(trpc.leave.reject, {
    successMessage: "Leave rejected",
    invalidate: (u) => u.leave.list.invalidate({ projectId }),
    onSuccess: () => setConfirmAction(null),
  });

  return (
    <div className="space-y-2.5">
      {/* Action Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-2 bg-muted/30 rounded-md border text-xs">
        <div className="flex items-center gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-7 w-36 text-xs bg-card font-mono">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="font-mono text-xs">
              <SelectItem value="all">All Requests</SelectItem>
              <SelectItem value="pending">Pending Approval</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => register.refresh()}
            disabled={register.isFetching}
            className="h-7 text-xs gap-1 px-2 font-mono"
          >
            <RefreshCw className={cn("h-3 w-3", register.isFetching && "animate-spin")} />
          </Button>

          {canWrite && (
            <Button
              size="sm"
              onClick={() => setAddOpen(true)}
              className="h-7 text-xs bg-primary hover:bg-primary/90 text-primary-foreground font-semibold gap-1 px-3 shadow-xs font-mono"
            >
              <Plus className="h-3 w-3" />
              Apply Leave
            </Button>
          )}
        </div>
      </div>

      {/* Inline KPI Ribbon */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-3 py-1.5 bg-muted/40 rounded border text-[11px] font-mono tabular-nums">
        <div className="flex items-center gap-3">
          <span>
            <strong className="text-foreground">Total Requests:</strong> {leaves.length}
          </span>
          <span className="text-muted-foreground/40">│</span>
          <span className="text-amber-600 dark:text-amber-400 font-semibold">
            ⏳ Pending: {pendingCount}
          </span>
          <span className="text-muted-foreground/40">│</span>
          <span className="text-emerald-600 dark:text-[#0284c7] font-semibold">
            ✓ Approved: {approvedCount}
          </span>
          {rejectedCount > 0 && (
            <>
              <span className="text-muted-foreground/40">│</span>
              <span className="text-red-600 dark:text-red-400 font-medium">
                ✗ Rejected: {rejectedCount}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Full-Bleed Table */}
      <div className="overflow-x-auto rounded border border-border/80 max-h-[calc(100vh-210px)]">
        <table className="w-full text-xs font-mono tabular-nums border-collapse">
          <thead className="sticky top-0 z-10 bg-muted/90 backdrop-blur-xs border-b text-[10px] text-muted-foreground uppercase">
            <tr>
              <th className="py-2 px-3 text-left font-semibold min-w-[160px]">Worker Name</th>
              <th className="py-2 px-2 text-center w-24">Type</th>
              <th className="py-2 px-3 text-left w-24">Start Date</th>
              <th className="py-2 px-3 text-left w-24">End Date</th>
              <th className="py-2 px-3 text-left min-w-[180px]">Reason / Notes</th>
              <th className="py-2 px-2 text-center w-24">Status</th>
              <th className="py-2 px-2 text-right w-28">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {register.isLoading ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin mx-auto mb-1.5 text-primary" />
                  Loading leave records...
                </td>
              </tr>
            ) : leaves.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-muted-foreground font-mono">
                  No leave requests found.
                </td>
              </tr>
            ) : (
              leaves.map((leave) => (
                <tr key={leave.id} className="hover:bg-muted/20 transition-colors">
                  <td className="py-1.5 px-3 font-sans font-medium text-foreground">
                    {leave.staff.name}
                    {leave.staff.designation && (
                      <span className="block text-[10px] text-muted-foreground font-normal font-mono">
                        {leave.staff.designation}
                      </span>
                    )}
                  </td>

                  <td className="py-1.5 px-2 text-center">
                    <Badge variant="outline" className="text-[9px] px-1.5 py-0 capitalize font-mono">
                      {leave.leaveType}
                    </Badge>
                  </td>

                  <td className="py-1.5 px-3 text-muted-foreground">
                    {format(new Date(leave.startDate), "dd MMM yyyy")}
                  </td>

                  <td className="py-1.5 px-3 text-muted-foreground">
                    {format(new Date(leave.endDate), "dd MMM yyyy")}
                  </td>

                  <td className="py-1.5 px-3 text-muted-foreground font-sans text-[11px] truncate max-w-[200px]" title={leave.reason || ""}>
                    {leave.reason || "—"}
                  </td>

                  <td className="py-1.5 px-2 text-center font-mono">
                    {leave.status === "approved" ? (
                      <Badge variant="secondary" className="text-[9px] px-1.5 py-0 bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-bold gap-1">
                        <CheckCircle2 className="h-2.5 w-2.5" /> Approved
                      </Badge>
                    ) : leave.status === "rejected" ? (
                      <Badge variant="destructive" className="text-[9px] px-1.5 py-0 font-bold gap-1">
                        <XCircle className="h-2.5 w-2.5" /> Rejected
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[9px] px-1.5 py-0 text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-800 font-bold">
                        Pending
                      </Badge>
                    )}
                  </td>

                  <td className="py-1.5 px-2 text-right">
                    {isAdmin && leave.status === "pending" ? (
                      <div className="flex items-center justify-end gap-1 font-mono">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setConfirmAction({
                              open: true,
                              type: "approve",
                              id: leave.id,
                              employeeName: leave.staff.name,
                              dates: `${format(new Date(leave.startDate), "dd MMM")} – ${format(new Date(leave.endDate), "dd MMM yyyy")}`,
                            })
                          }
                          disabled={approveMut.isPending}
                          className="h-5 text-[9px] text-[#0284c7] border-emerald-500/30 gap-1 bg-emerald-500/10 px-1.5 hover:bg-emerald-500/20"
                        >
                          <CheckCircle2 className="h-2.5 w-2.5" /> Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setConfirmAction({
                              open: true,
                              type: "reject",
                              id: leave.id,
                              employeeName: leave.staff.name,
                              dates: `${format(new Date(leave.startDate), "dd MMM")} – ${format(new Date(leave.endDate), "dd MMM yyyy")}`,
                            })
                          }
                          disabled={rejectMut.isPending}
                          className="h-5 text-[9px] text-rose-400 border-rose-500/30 px-1.5 hover:bg-rose-500/20"
                        >
                          <XCircle className="h-2.5 w-2.5" /> Reject
                        </Button>
                      </div>
                    ) : (
                      <span className="text-[10px] text-muted-foreground font-mono">
                        {leave.approvedBy ? `By ${leave.approvedBy.name}` : "—"}
                      </span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Apply Leave — FormDialogEngine (Tier 2): owns framing, state, validation,
          toast, invalidation, close/reset. No per-field useState, no Dialog wiring. */}
      {canWrite && (
        <FormDialogEngine
          open={addOpen}
          onOpenChange={setAddOpen}
          title="Apply for Leave"
          description="Submit a site leave request for Project Manager review and attendance linking."
          icon={Calendar}
          size="md"
          initialValues={{
            staffId: "",
            leaveType: "casual",
            startDate: format(new Date(), "yyyy-MM-dd"),
            endDate: format(new Date(), "yyyy-MM-dd"),
            reason: "",
          }}
          schema={applyLeaveSchema}
          mutation={trpc.leave.create}
          buildInput={(v) => ({
            projectId,
            staffId: v.staffId,
            leaveType: v.leaveType,
            startDate: v.startDate,
            endDate: v.endDate,
            reason: v.reason || undefined,
          })}
          invalidate={(u) => u.leave.list.invalidate({ projectId })}
          successMessage="Leave request submitted"
          submitLabel="Submit Leave"
        >
          <FormSelectField
            name="staffId"
            label="Select Worker"
            required
            placeholder="Choose personnel..."
            options={staffList.map((s) => ({
              value: s.id,
              label: `${s.name} (${s.designation || s.category || "Staff"})`,
            }))}
          />
          <FormSelectField
            name="leaveType"
            label="Leave Type"
            options={LEAVE_TYPES.map((lt) => ({ value: lt, label: `${lt.charAt(0).toUpperCase()}${lt.slice(1)} Leave` }))}
          />
          <FormDateField name="startDate" label="Start Date" required />
          <FormDateField name="endDate" label="End Date" required />
          <FormTextField
            name="reason"
            label="Reason / Handover Notes"
            placeholder="e.g. Medical emergency, Family wedding"
            colSpan="full"
          />
        </FormDialogEngine>
      )}

      {/* Confirmation Dialog for Leave Approval / Rejection */}
      {confirmAction && (
        <ConfirmDialog
          open={confirmAction.open}
          onOpenChange={(open) => {
            if (!open) setConfirmAction(null);
          }}
          title={confirmAction.type === "approve" ? "Approve Leave Request?" : "Reject Leave Request?"}
          description={
            confirmAction.type === "approve"
              ? `Approve leave request (${confirmAction.dates}) for ${confirmAction.employeeName}?`
              : `Reject leave request (${confirmAction.dates}) for ${confirmAction.employeeName}?`
          }
          variant={confirmAction.type === "approve" ? "success" : "destructive"}
          confirmLabel={confirmAction.type === "approve" ? "Approve Leave" : "Reject Leave"}
          isLoading={approveMut.isPending || rejectMut.isPending}
          onConfirm={async () => {
            if (confirmAction.type === "approve") {
              await approveMut.mutateAsync({ id: confirmAction.id });
            } else {
              await rejectMut.mutateAsync({ id: confirmAction.id, rejectionReason: "Rejected by PM" });
            }
          }}
        />
      )}
    </div>
  );
}
