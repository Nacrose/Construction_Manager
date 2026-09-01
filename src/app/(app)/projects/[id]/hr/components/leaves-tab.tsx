"use client";

import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { toast } from "sonner";
import { format } from "date-fns";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ConstructionTable, type ConstructionTableColumn } from "@/components/ui/construction-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { FormDialogEngine } from "@/components/ui/form-dialog-engine";

const LEAVE_TYPES = ["casual", "sick", "paid", "unpaid", "emergency", "maternity"];

export interface LeaveRecord {
  id: string;
  projectId: string;
  staffId: string;
  leaveType: string;
  startDate: string | Date;
  endDate: string | Date;
  totalDays: number;
  reason?: string | null;
  status: string;
  approvedById?: string | null;
  staff: {
    name: string;
    designation: string | null;
    category: string | null;
  };
  approvedBy?: {
    name: string;
  } | null;
}

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

  // Form states
  const [staffId, setStaffId] = useState("");
  const [leaveType, setLeaveType] = useState("casual");
  const [startDate, setStartDate] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [reason, setReason] = useState("");
  const [confirmAction, setConfirmAction] = useState<{
    open: boolean;
    type: "approve" | "reject";
    id: string;
    employeeName: string;
    dates: string;
  } | null>(null);

  const utils = trpc.useUtils();

  const { data, isLoading, refetch, isFetching } = trpc.leave.list.useQuery({
    projectId,
    status: statusFilter !== "all" ? (statusFilter as any) : undefined,
  });

  const leaves = (data?.leaves || []) as unknown as LeaveRecord[];
  const pendingCount = leaves.filter((l) => l.status === "pending").length;
  const approvedCount = leaves.filter((l) => l.status === "approved").length;
  const rejectedCount = leaves.filter((l) => l.status === "rejected").length;

  const createMut = trpc.leave.create.useMutation({
    onSuccess: () => {
      toast.success("Leave request submitted");
      utils.leave.list.invalidate({ projectId });
      setAddOpen(false);
      setReason("");
    },
    onError: (e) => toast.error(e.message),
  });

  const approveMut = trpc.leave.approve.useMutation({
    onSuccess: () => {
      toast.success("Leave approved");
      utils.leave.list.invalidate({ projectId });
      setConfirmAction(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const rejectMut = trpc.leave.reject.useMutation({
    onSuccess: () => {
      toast.success("Leave rejected");
      utils.leave.list.invalidate({ projectId });
      setConfirmAction(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!staffId) {
      toast.error("Please select a worker");
      return;
    }
    createMut.mutate({
      projectId,
      staffId,
      leaveType,
      startDate,
      endDate,
      reason: reason || undefined,
    });
  };

  const columns: ConstructionTableColumn<LeaveRecord>[] = useMemo(
    () => [
      {
        key: "staffName",
        header: "Worker Name",
        accessor: (row) => row.staff.name,
        sortable: true,
        render: (_, row) => (
          <div className="font-sans">
            <span className="font-semibold text-slate-900 text-xs">{row.staff.name}</span>
            {row.staff.designation && (
              <span className="block text-[10px] text-slate-500 font-mono">
                {row.staff.designation}
              </span>
            )}
          </div>
        ),
      },
      {
        key: "leaveType",
        header: "Type",
        accessor: (row) => row.leaveType,
        align: "center",
        width: "110px",
        render: (val) => (
          <Badge variant="outline" className="text-[10px] font-mono capitalize px-2 py-0.5 border-[#c7d8e8] bg-white text-slate-800">
            {val}
          </Badge>
        ),
      },
      {
        key: "startDate",
        header: "Start Date",
        accessor: (row) => row.startDate,
        width: "120px",
        render: (val) => (
          <span className="text-slate-600 font-mono text-xs">
            {val ? format(new Date(val), "dd MMM yyyy") : "—"}
          </span>
        ),
      },
      {
        key: "endDate",
        header: "End Date",
        accessor: (row) => row.endDate,
        width: "120px",
        render: (val) => (
          <span className="text-slate-600 font-mono text-xs">
            {val ? format(new Date(val), "dd MMM yyyy") : "—"}
          </span>
        ),
      },
      {
        key: "totalDays",
        header: "Days",
        accessor: (row) => row.totalDays,
        align: "center",
        width: "80px",
        render: (val) => (
          <span className="font-mono font-bold text-xs text-[#0284c7]">
            {val} {val === 1 ? "day" : "days"}
          </span>
        ),
      },
      {
        key: "reason",
        header: "Reason / Handover Notes",
        accessor: (row) => row.reason || "",
        render: (val) => (
          <span className="text-xs text-slate-600 truncate max-w-xs block" title={val || ""}>
            {val || "—"}
          </span>
        ),
      },
      {
        key: "status",
        header: "Status",
        accessor: (row) => row.status,
        align: "center",
        width: "120px",
        render: (val) => <StatusBadge status={val} />,
      },
      {
        key: "actions",
        header: "Actions",
        width: "160px",
        align: "right",
        render: (_, leave) => (
          <div className="flex items-center justify-end gap-1.5 font-mono">
            {isAdmin && leave.status === "pending" ? (
              <>
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
                  className="h-6 text-[10px] text-emerald-600 border-emerald-500/30 gap-1 bg-emerald-50 px-2 hover:bg-emerald-100 font-bold"
                >
                  <CheckCircle2 className="h-3 w-3" /> Approve
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
                  className="h-6 text-[10px] text-rose-600 border-rose-500/30 px-2 hover:bg-rose-50 font-bold"
                >
                  <XCircle className="h-3 w-3" /> Reject
                </Button>
              </>
            ) : (
              <span className="text-[10px] text-slate-500 font-mono">
                {leave.approvedBy ? `By ${leave.approvedBy.name}` : "—"}
              </span>
            )}
          </div>
        ),
      },
    ],
    [isAdmin, approveMut.isPending, rejectMut.isPending]
  );

  return (
    <div className="space-y-3 font-sans">
      {/* Action Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl border border-[#c7d8e8] bg-[#e5eef7]">
        <div className="flex items-center gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-8 w-40 text-xs bg-white border-[#c7d8e8] text-slate-900 rounded-lg font-mono">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="font-mono text-xs bg-white border-[#c7d8e8] text-slate-900 shadow-xl rounded-xl">
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
            onClick={() => refetch()}
            disabled={isFetching}
            className="h-8 text-xs gap-1.5 px-3 font-mono bg-white border-[#c7d8e8] text-slate-700 hover:bg-slate-50 rounded-lg"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />
            <span>Refresh</span>
          </Button>

          {canWrite && (
            <Button
              size="sm"
              onClick={() => setAddOpen(true)}
              className="h-8 text-xs bg-[#0284c7] hover:bg-[#0369a1] text-white font-semibold gap-1.5 px-3.5 shadow-xs font-mono rounded-lg"
            >
              <Plus className="h-3.5 w-3.5" />
              Apply Leave (बिदा अनुरोध)
            </Button>
          )}
        </div>
      </div>

      {/* KPI Ribbon */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 px-4 py-2 bg-white rounded-xl border border-[#c7d8e8] text-xs font-mono shadow-xs">
        <div className="flex items-center gap-3">
          <span>
            <strong className="text-slate-900">Total:</strong> {leaves.length}
          </span>
          <span className="text-slate-300">│</span>
          <span className="text-amber-600 font-semibold">
            ⏳ Pending: {pendingCount}
          </span>
          <span className="text-slate-300">│</span>
          <span className="text-emerald-600 font-semibold">
            ✓ Approved: {approvedCount}
          </span>
          {rejectedCount > 0 && (
            <>
              <span className="text-slate-300">│</span>
              <span className="text-rose-600 font-semibold">
                ✗ Rejected: {rejectedCount}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Standardized ConstructionTable Engine */}
      <ConstructionTable<LeaveRecord>
        data={leaves}
        columns={columns}
        isLoading={isLoading}
        searchPlaceholder="Search employee name, leave type, reason..."
        searchFilterKeys={["staffName", "leaveType", "reason", "status"]}
        exportExcel={{
          filename: `Staff_Leave_Register_${format(new Date(), "yyyy-MM-dd")}`,
          sheetName: "Leaves",
        }}
        emptyState={{
          title: "No Leave Requests",
          description: "No leave requests have been filed for this project.",
        }}
      />

      {/* Leave Application Dialog with FormDialogEngine */}
      <FormDialogEngine
        open={addOpen}
        onOpenChange={setAddOpen}
        title="Apply for Site Leave"
        description="Submit a site staff leave request for Project Manager approval and attendance deduction."
        badge={
          <Badge className="bg-[#e5eef7] text-[#0284c7] border border-[#c7d8e8] font-mono text-[10px]">
            HR Module
          </Badge>
        }
        maxWidth="lg"
        aspectRatio="auto"
      >
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-slate-800">Select Worker / Staff *</Label>
            <Select value={staffId} onValueChange={setStaffId} required>
              <SelectTrigger className="h-9 text-xs bg-white border-[#c7d8e8] text-slate-900 font-mono rounded-xl">
                <SelectValue placeholder="Choose personnel..." />
              </SelectTrigger>
              <SelectContent className="bg-white border-[#c7d8e8] text-slate-900 text-xs font-mono shadow-xl rounded-xl">
                {staffList.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name} ({s.designation || s.category || "Staff"})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-slate-800">Leave Type</Label>
            <Select value={leaveType} onValueChange={setLeaveType}>
              <SelectTrigger className="h-9 text-xs capitalize bg-white border-[#c7d8e8] text-slate-900 font-mono rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-white border-[#c7d8e8] text-slate-900 text-xs font-mono shadow-xl rounded-xl">
                {LEAVE_TYPES.map((lt) => (
                  <SelectItem key={lt} value={lt} className="capitalize">
                    {lt} Leave
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-800">Start Date *</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="h-9 text-xs font-mono bg-white border-[#c7d8e8] text-slate-900 rounded-xl"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-800">End Date *</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="h-9 text-xs font-mono bg-white border-[#c7d8e8] text-slate-900 rounded-xl"
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-slate-800">Reason / Handover Notes</Label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Medical emergency, Family festival"
              className="h-9 text-xs bg-white border-[#c7d8e8] text-slate-900 rounded-xl"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#c7d8e8]">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setAddOpen(false)}
              disabled={createMut.isPending}
              className="h-9 px-4 text-xs font-mono bg-white border-[#c7d8e8] text-slate-700 hover:bg-slate-50 rounded-xl"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={createMut.isPending}
              className="h-9 px-5 text-xs font-mono bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl"
            >
              {createMut.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
              Submit Leave Request
            </Button>
          </div>
        </form>
      </FormDialogEngine>

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
