"use client";

import { trpc } from "@/lib/trpc-client";
import { use, useState } from "react";
import { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/ui/data-table";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogTrigger } from "@/components/ui/dialog";
import { DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Check, X, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { AnimatedPage } from "@/components/ui/animated-page";
import { cn } from "@/lib/utils";

const LEAVE_TYPES = ["casual", "sick", "paid", "unpaid", "emergency", "maternity"];

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  approved: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  rejected: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
};

type LeaveRequest = {
  id: string;
  leaveType: string;
  startDate: Date;
  endDate: Date;
  totalDays: number;
  reason: string | null;
  status: string;
  rejectionReason: string | null;
  createdAt: Date;
  staff: { name: string; designation: string | null; category: string | null };
  approvedBy: { name: string } | null;
};

type LeaveBalance = {
  id: string;
  leaveType: string;
  totalAllowed: number;
  taken: number;
  remaining: number;
};

export default function LeavesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [addOpen, setAddOpen] = useState(false);
  const [balanceOpen, setBalanceOpen] = useState(false);
  const [balanceStaffId, setBalanceStaffId] = useState("");
  const utils = trpc.useUtils();

  const { data: projectInfo } = trpc.project.get.useQuery({ id }, { staleTime: 300_000 });
  const isPM = projectInfo?.myRole === "project_manager" || projectInfo?.myRole === "coordinator";

  const { data: staffData } = trpc.hr.list.useQuery({ projectId: id, tab: "staff" });
  const { data, isLoading } = trpc.leave.list.useQuery({
    projectId: id,
    status: statusFilter === "all" ? undefined : (statusFilter as "pending" | "approved" | "rejected"),
  });

  const leaves = data?.leaves || [];
  const pendingCount = leaves.filter((l) => l.status === "pending").length;
  const approvedCount = leaves.filter((l) => l.status === "approved").length;
  const rejectedCount = leaves.filter((l) => l.status === "rejected").length;

  const approveMutation = trpc.leave.approve.useMutation({
    onSuccess: () => {
      utils.leave.list.invalidate({ projectId: id });
      toast.success("Leave approved");
    },
    onError: (e) => toast.error(e.message),
  });

  const rejectMutation = trpc.leave.reject.useMutation({
    onSuccess: () => {
      utils.leave.list.invalidate({ projectId: id });
      toast.success("Leave rejected");
    },
    onError: (e) => toast.error(e.message),
  });

  const columns: ColumnDef<LeaveRequest>[] = [
    {
      accessorKey: "staff.name",
      header: "Staff Name",
      cell: ({ row }) => <span className="font-medium">{row.original.staff.name}</span>,
    },
    {
      accessorKey: "leaveType",
      header: "Leave Type",
      cell: ({ row }) => (
        <Badge variant="secondary" className="capitalize">{row.original.leaveType}</Badge>
      ),
    },
    {
      accessorKey: "startDate",
      header: "Start Date",
      cell: ({ row }) => format(new Date(row.original.startDate), "dd MMM yyyy"),
    },
    {
      accessorKey: "endDate",
      header: "End Date",
      cell: ({ row }) => format(new Date(row.original.endDate), "dd MMM yyyy"),
    },
    {
      accessorKey: "totalDays",
      header: "Days",
      cell: ({ row }) => <span className="font-medium">{row.original.totalDays}</span>,
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => (
        <Badge variant="secondary" className={`capitalize ${STATUS_COLORS[row.original.status] ?? ""}`}>
          {row.original.status}
        </Badge>
      ),
    },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => {
        if (!isPM || row.original.status !== "pending") return null;
        return (
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
              onClick={() => approveMutation.mutate({ id: row.original.id })}
              disabled={approveMutation.isPending}
            >
              <Check className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-red-600 hover:text-red-700 hover:bg-red-50"
              onClick={() => rejectMutation.mutate({ id: row.original.id })}
              disabled={rejectMutation.isPending}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        );
      },
    },
  ];

  return (
    <AnimatedPage className="space-y-5 pb-8">
      {/* Stats Row */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Pending</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-amber-600">{pendingCount}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Approved</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-emerald-600">{approvedCount}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Rejected</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-red-600">{rejectedCount}</div></CardContent>
        </Card>
      </div>

      {/* Actions */}
      <div className="flex justify-between items-center">
        <div className="flex gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40"><SelectValue placeholder="Filter by status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setBalanceOpen(true)}>Leave Balances</Button>
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="mr-1.5 h-3.5 w-3.5" />New Leave Request</Button>
            </DialogTrigger>
            <NewLeaveDialog projectId={id} staffList={staffData?.staff || []} onDone={() => setAddOpen(false)} />
          </Dialog>
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <Skeleton className="h-64" />
      ) : (
        <DataTable tableId="leaves-table" columns={columns} data={leaves} searchPlaceholder="Search leaves..." searchColumn="staff_name" />
      )}

      {/* Balance Dialog */}
      <Dialog open={balanceOpen} onOpenChange={setBalanceOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Leave Balances</DialogTitle></DialogHeader>
          <LeaveBalanceSection projectId={id} staffList={staffData?.staff || []} />
        </DialogContent>
      </Dialog>
    </AnimatedPage>
  );
}

function NewLeaveDialog({ projectId, staffList, onDone }: { projectId: string; staffList: Array<{ id: string; name: string }>; onDone: () => void }) {
  const utils = trpc.useUtils();
  const [staffId, setStaffId] = useState("");
  const [leaveType, setLeaveType] = useState("casual");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");

  const mutation = trpc.leave.create.useMutation({
    onSuccess: () => {
      utils.leave.list.invalidate({ projectId });
      toast.success("Leave request created");
      onDone();
    },
    onError: (e) => toast.error(e.message),
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate({ projectId, staffId, leaveType, startDate, endDate, reason: reason || undefined });
  };

  return (
    <DialogContent className="max-w-md">
      <DialogHeader><DialogTitle>New Leave Request</DialogTitle></DialogHeader>
      <form onSubmit={onSubmit} className="space-y-3">
        <div className="space-y-1.5">
          <Label>Staff *</Label>
          <Select value={staffId} onValueChange={setStaffId} required>
            <SelectTrigger><SelectValue placeholder="Select staff" /></SelectTrigger>
            <SelectContent>
              {staffList.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Leave Type</Label>
          <Select value={leaveType} onValueChange={setLeaveType}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {LEAVE_TYPES.map((t) => (
                <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Start Date *</Label>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label>End Date *</Label>
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Reason</Label>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Optional reason" />
        </div>
        <DialogFooter>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Submit
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

function LeaveBalanceSection({ projectId, staffList }: { projectId: string; staffList: Array<{ id: string; name: string }> }) {
  const [selectedStaff, setSelectedStaff] = useState(staffList[0]?.id || "");
  const currentYear = new Date().getFullYear();

  const { data: balanceData } = trpc.leave.getBalances.useQuery({
    projectId,
    staffId: selectedStaff,
    year: currentYear,
  });

  const balances = balanceData?.balances || [];

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label>Staff Member</Label>
        <Select value={selectedStaff} onValueChange={setSelectedStaff}>
          <SelectTrigger><SelectValue placeholder="Select staff" /></SelectTrigger>
          <SelectContent>
            {staffList.map((s) => (
              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {balances.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">No balance records found for {currentYear}.</p>
      ) : (
        <div className="space-y-2">
          {balances.map((b: LeaveBalance) => (
            <div key={b.id} className="flex items-center justify-between p-3 border rounded-lg">
              <div>
                <p className="font-medium capitalize">{b.leaveType}</p>
                <p className="text-xs text-muted-foreground">Year {currentYear}</p>
              </div>
              <div className="flex gap-4 text-sm">
                <div className="text-center">
                  <p className="text-muted-foreground text-xs">Allowed</p>
                  <p className="font-medium">{b.totalAllowed}</p>
                </div>
                <div className="text-center">
                  <p className="text-muted-foreground text-xs">Taken</p>
                  <p className="font-medium text-amber-600">{b.taken}</p>
                </div>
                <div className="text-center">
                  <p className="text-muted-foreground text-xs">Remaining</p>
                  <p className={cn("font-medium", b.remaining < 0 ? "text-red-600" : "text-emerald-600")}>{b.remaining}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
