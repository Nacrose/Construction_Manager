"use client";

import { useState, useMemo } from "react";
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
  Edit2,
  Trash2,
  RefreshCw,
  ArrowLeftRight,
  History,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { formatNpr } from "@/lib/currency";
import { StatusBadge } from "@/components/ui/status-badge";
import { ConstructionTable, ConstructionTableColumn } from "@/components/ui/construction-table";
import { AddWorkerDialog } from "../dialogs/add-worker-dialog";
import { TransferWorkerDialog } from "../dialogs/transfer-worker-dialog";
import { PersonHistoryDialog } from "../dialogs/person-history-dialog";

export function StaffDirectoryTab({
  projectId,
  canWrite = false,
}: {
  projectId: string;
  canWrite?: boolean;
}) {
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [employmentFilter, setEmploymentFilter] = useState<string>("all");
  const [gangFilter, setGangFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("active");

  const [addOpen, setAddOpen] = useState(false);
  const [editingWorker, setEditingWorker] = useState<any | null>(null);
  // Transfer / re-hire and read-only history are mounted per worker.
  const [transferWorker, setTransferWorker] = useState<any | null>(null);
  const [historyWorker, setHistoryWorker] = useState<any | null>(null);

  const utils = trpc.useUtils();

  const { data, isLoading, refetch, isFetching } = trpc.hr.list.useQuery({
    projectId,
    tab: "staff",
    status: statusFilter as any,
    gangName: gangFilter === "all" ? undefined : gangFilter,
    category: categoryFilter === "all" ? undefined : categoryFilter,
    employmentType: employmentFilter === "all" ? undefined : employmentFilter,
  });

  const staffList = data?.staff || [];
  const gangs = data?.gangs || [];

  const deleteMut = trpc.hr.delete.useMutation({
    onSuccess: () => {
      toast.success("Worker removed from roster");
      utils.hr.list.invalidate({ projectId });
    },
    onError: (e) => toast.error(e.message),
  });

  // Metrics
  const skilledCount = staffList.filter((s) => s.category === "skilled").length;
  const unskilledCount = staffList.filter((s) => s.category === "unskilled").length;
  const operatorCount = staffList.filter((s) => s.category === "operator").length;
  const monthlyCount = staffList.filter((s) => s.employmentType === "monthly").length;

  const columns: ConstructionTableColumn<any>[] = [
    {
      key: "name",
      header: "Worker Name",
      render: (_, worker) => (
        <div>
          <span className="font-sans font-medium text-foreground">{worker.name}</span>
          {worker.designation && (
            <span className="block text-[10px] text-muted-foreground font-normal">
              {worker.designation}
            </span>
          )}
        </div>
      ),
    },
    {
      key: "gangName",
      header: "Gang / Team",
      render: (_, worker) => (
        <span className="text-[11px] font-sans text-muted-foreground">{worker.gangName || "—"}</span>
      ),
    },
    {
      key: "category",
      header: "Category",
      align: "center",
      render: (_, worker) => (
        <Badge
          variant="secondary"
          className={cn("text-[9px] px-1.5 py-0 capitalize", {
            "bg-success/15 text-success dark:bg-success dark:text-success/80":
              worker.category === "skilled",
            "bg-muted text-foreground/80 dark:bg-[var(--navy-mid)]": worker.category === "unskilled",
            "bg-amber-100 text-amber-800 dark:bg-amber-950": worker.category === "supervisor",
            "bg-info/15 text-info dark:bg-[var(--navy-deep)]": worker.category === "staff",
            "bg-purple-100 text-purple-800 dark:bg-purple-950": worker.category === "operator",
          })}
        >
          {worker.category || "Labor"}
        </Badge>
      ),
    },
    {
      key: "employmentType",
      header: "Track",
      align: "center",
      render: (_, worker) => (
        <span className="text-[10px] capitalize text-muted-foreground font-sans">
          {worker.employmentType === "monthly" ? "Monthly" : "Daily"}
        </span>
      ),
    },
    {
      key: "rate",
      header: "Base Rate",
      align: "right",
      render: (_, worker) => (
        <span className="font-bold font-mono text-foreground text-xs">
          {worker.employmentType === "monthly"
            ? formatNpr(worker.monthlySalary || 0)
            : formatNpr(worker.dailyWage || 0)}
        </span>
      ),
    },
    {
      key: "phone",
      header: "Contact",
      render: (_, worker) => (
        <span className="text-muted-foreground font-mono text-[11px]">{worker.phone || "—"}</span>
      ),
    },
    {
      key: "bankPAN",
      header: "Bank / PAN",
      render: (_, worker) => (
        <span className="text-muted-foreground text-[10px]">
          {worker.bankAccountNo ? (
            <span>
              {worker.bankName ? `${worker.bankName} - ` : ""}
              <span className="font-mono">{worker.bankAccountNo}</span>
            </span>
          ) : worker.pan ? (
            <span className="font-mono">PAN: {worker.pan}</span>
          ) : (
            "—"
          )}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      align: "center",
      render: (_, worker) => <StatusBadge status={worker.status} />,
    },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      render: (_, worker) => {
        return (
          <div className="flex items-center justify-end gap-1">
            {/* Org-wide person history — a member-level read (Phase D). */}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setHistoryWorker(worker)}
              className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
              title="History"
            >
              <History className="h-3 w-3" />
            </Button>
            {canWrite && (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setTransferWorker(worker)}
                  className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                  title="Transfer / Re-hire"
                >
                  <ArrowLeftRight className="h-3 w-3" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setEditingWorker(worker);
                    setAddOpen(true);
                  }}
                  className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                  title="Edit"
                >
                  <Edit2 className="h-3 w-3" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => deleteMut.mutate({ itemId: worker.id })}
                  disabled={deleteMut.isPending}
                  className="h-6 w-6 p-0 text-red-500 hover:bg-red-50 dark:hover:bg-red-950"
                  title="Remove"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-3">
      {/* Dense Controls Ribbon */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-2 bg-muted/30 rounded-md border text-xs">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="h-7 w-28 text-xs">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Skills</SelectItem>
              <SelectItem value="skilled">Skilled</SelectItem>
              <SelectItem value="unskilled">Unskilled</SelectItem>
              <SelectItem value="supervisor">Supervisor</SelectItem>
              <SelectItem value="staff">Staff</SelectItem>
              <SelectItem value="operator">Operator</SelectItem>
            </SelectContent>
          </Select>

          <Select value={employmentFilter} onValueChange={setEmploymentFilter}>
            <SelectTrigger className="h-7 w-28 text-xs">
              <SelectValue placeholder="Employment" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Tracks</SelectItem>
              <SelectItem value="daily">Daily Wage</SelectItem>
              <SelectItem value="monthly">Monthly Salary</SelectItem>
            </SelectContent>
          </Select>

          {gangs.length > 0 && (
            <Select value={gangFilter} onValueChange={setGangFilter}>
              <SelectTrigger className="h-7 w-28 text-xs">
                <SelectValue placeholder="Gang" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Gangs</SelectItem>
                {gangs.map((g: string) => (
                  <SelectItem key={g} value={g}>
                    {g}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-7 w-24 text-xs">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>

          <Button
            size="sm"
            variant="ghost"
            onClick={() => refetch()}
            className="h-7 w-7 p-0"
            title="Refresh"
          >
            <RefreshCw className={cn("h-3 w-3", isFetching && "animate-spin")} />
          </Button>
        </div>

        {canWrite && (
          <Button
            size="sm"
            onClick={() => {
              setEditingWorker(null);
              setAddOpen(true);
            }}
            className="h-7 text-xs gap-1"
          >
            <Plus className="h-3 w-3" />
            Add Worker
          </Button>
        )}
      </div>

      {/* Workforce Metric Strip */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-2 py-1 bg-muted/20 rounded border text-[11px] font-mono">
        <div className="flex items-center gap-3">
          <span className="text-muted-foreground font-semibold">Total: {staffList.length}</span>
          <span className="text-muted-foreground/40">│</span>
          <span className="text-success dark:text-success/80">Skilled: {skilledCount}</span>
          <span className="text-muted-foreground/40">│</span>
          <span className="text-muted-foreground dark:text-muted-foreground/80">Unskilled: {unskilledCount}</span>
          <span className="text-muted-foreground/40">│</span>
          <span className="text-purple-600 dark:text-purple-400">Operators: {operatorCount}</span>
          <span className="text-muted-foreground/40">│</span>
          <span className="text-info dark:text-info/80">Salaried: {monthlyCount}</span>
        </div>

        <div>
          <span className="text-muted-foreground font-medium">Active Gangs: {gangs.length}</span>
        </div>
      </div>

      {/* Central Table Engine */}
      <ConstructionTable
        data={staffList}
        columns={columns}
        isLoading={isLoading}
        searchPlaceholder="Search workers by name, designation, gang, phone..."
        searchFilterKeys={["name", "designation", "gangName", "phone", "pan", "category"]}
      />

      <AddWorkerDialog
        projectId={projectId}
        open={addOpen}
        onOpenChange={setAddOpen}
        existingWorker={editingWorker}
        gangs={gangs}
        onSuccess={() => {
          utils.hr.list.invalidate({ projectId });
          setEditingWorker(null);
        }}
      />

      {transferWorker && (
        <TransferWorkerDialog
          projectId={projectId}
          worker={transferWorker}
          onClose={() => setTransferWorker(null)}
          onSuccess={() => utils.hr.list.invalidate({ projectId })}
        />
      )}

      {historyWorker && (
        <PersonHistoryDialog
          projectId={projectId}
          personId={historyWorker.personId}
          personName={historyWorker.name}
          onClose={() => setHistoryWorker(null)}
        />
      )}
    </div>
  );
}
