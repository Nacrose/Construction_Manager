"use client";

import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  Search,
  Edit2,
  Trash2,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { AddWorkerDialog } from "../dialogs/add-worker-dialog";

export function StaffDirectoryTab({
  projectId,
  canWrite = false,
}: {
  projectId: string;
  canWrite?: boolean;
}) {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [employmentFilter, setEmploymentFilter] = useState<string>("all");
  const [gangFilter, setGangFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("active");

  const [addOpen, setAddOpen] = useState(false);
  const [editingWorker, setEditingWorker] = useState<any | null>(null);

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

  const filteredStaff = useMemo(() => {
    return staffList.filter((s) => {
      if (search) {
        const q = search.toLowerCase();
        const matchesName = s.name.toLowerCase().includes(q);
        const matchesDesig = s.designation?.toLowerCase().includes(q) || false;
        const matchesGang = s.gangName?.toLowerCase().includes(q) || false;
        if (!matchesName && !matchesDesig && !matchesGang) return false;
      }
      return true;
    });
  }, [staffList, search]);

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

  return (
    <div className="space-y-2.5">
      {/* Dense Search & Controls Ribbon */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-2 bg-muted/30 rounded-md border text-xs">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <div className="relative min-w-[160px] max-w-xs flex-1">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
            <Input
              placeholder="Search worker or gang..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-7 text-xs pl-7"
            />
          </div>

          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="h-7 w-28 text-xs">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Trades</SelectItem>
              <SelectItem value="skilled">Skilled</SelectItem>
              <SelectItem value="unskilled">Unskilled</SelectItem>
              <SelectItem value="operator">Operator</SelectItem>
              <SelectItem value="supervisor">Supervisor</SelectItem>
              <SelectItem value="staff">Staff</SelectItem>
            </SelectContent>
          </Select>

          <Select value={employmentFilter} onValueChange={setEmploymentFilter}>
            <SelectTrigger className="h-7 w-28 text-xs">
              <SelectValue placeholder="Track" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Tracks</SelectItem>
              <SelectItem value="daily">Daily Wage</SelectItem>
              <SelectItem value="monthly">Monthly</SelectItem>
              <SelectItem value="piece_rate">Piece Rate</SelectItem>
            </SelectContent>
          </Select>

          {gangs.length > 0 && (
            <Select value={gangFilter} onValueChange={setGangFilter}>
              <SelectTrigger className="h-7 w-32 text-xs">
                <SelectValue placeholder="All Gangs" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Gangs</SelectItem>
                {gangs.map((g) => (
                  <SelectItem key={g} value={g}>
                    {g}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-7 w-24 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => refetch()}
            disabled={isFetching}
            className="h-7 text-xs gap-1 px-2"
          >
            <RefreshCw className={cn("h-3 w-3", isFetching && "animate-spin")} />
          </Button>

          {canWrite && (
            <Button
              size="sm"
              onClick={() => {
                setEditingWorker(null);
                setAddOpen(true);
              }}
              className="h-7 text-xs bg-primary hover:bg-primary/90 text-primary-foreground font-semibold gap-1 px-3"
            >
              <Plus className="h-3 w-3" />
              Add Worker
            </Button>
          )}
        </div>
      </div>

      {/* Slim 28px High-Density Inline Metrics Ribbon */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-3 py-1.5 bg-muted/40 rounded border text-[11px] font-mono tabular-nums">
        <div className="flex items-center gap-3">
          <span>
            <strong className="text-foreground">Total Roster:</strong> {staffList.length}
          </span>
          <span className="text-muted-foreground/40">│</span>
          <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
            Skilled: {skilledCount}
          </span>
          <span className="text-muted-foreground/40">│</span>
          <span className="text-slate-600 dark:text-slate-400">
            Unskilled: {unskilledCount}
          </span>
          <span className="text-muted-foreground/40">│</span>
          <span className="text-purple-600 dark:text-purple-400">
            Operators: {operatorCount}
          </span>
          <span className="text-muted-foreground/40">│</span>
          <span className="text-sky-600 dark:text-sky-400">
            Salaried: {monthlyCount}
          </span>
        </div>

        <div>
          <span className="text-muted-foreground font-medium">
            Active Gangs: {gangs.length}
          </span>
        </div>
      </div>

      {/* Full-Bleed Staff Roster Table */}
      <div className="overflow-x-auto rounded border border-border/80 max-h-[calc(100vh-210px)]">
        <table className="w-full text-xs font-mono tabular-nums border-collapse">
          <thead className="sticky top-0 z-10 bg-muted/90 backdrop-blur-xs border-b text-[10px] text-muted-foreground uppercase">
            <tr>
              <th className="py-2 px-3 text-left min-w-[160px] font-semibold text-foreground">Worker Name</th>
              <th className="py-2 px-2 text-left w-24">Gang / Team</th>
              <th className="py-2 px-2 text-center w-20">Category</th>
              <th className="py-2 px-2 text-center w-20">Track</th>
              <th className="py-2 px-3 text-right w-24">Base Rate</th>
              <th className="py-2 px-3 text-left w-28">Contact</th>
              <th className="py-2 px-3 text-left min-w-[140px]">Bank / PAN</th>
              <th className="py-2 px-2 text-center w-20">Status</th>
              <th className="py-2 px-2 text-right w-16">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {isLoading ? (
              <tr>
                <td colSpan={9} className="p-8 text-center text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin mx-auto mb-1.5 text-primary" />
                  Loading workforce directory...
                </td>
              </tr>
            ) : filteredStaff.length === 0 ? (
              <tr>
                <td colSpan={9} className="p-8 text-center text-muted-foreground">
                  No workers found matching your filter criteria.
                </td>
              </tr>
            ) : (
              filteredStaff.map((worker) => (
                <tr key={worker.id} className="hover:bg-muted/20 transition-colors">
                  <td className="py-1.5 px-3 font-sans font-medium text-foreground">
                    {worker.name}
                    {worker.designation && (
                      <span className="block text-[10px] text-muted-foreground font-normal">
                        {worker.designation}
                      </span>
                    )}
                  </td>

                  <td className="py-1.5 px-2 text-[11px] font-sans text-muted-foreground">
                    {worker.gangName || "—"}
                  </td>

                  <td className="py-1.5 px-2 text-center">
                    <Badge
                      variant="secondary"
                      className={cn("text-[9px] px-1.5 py-0 capitalize", {
                        "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300":
                          worker.category === "skilled",
                        "bg-slate-100 text-slate-700 dark:bg-slate-800": worker.category === "unskilled",
                        "bg-amber-100 text-amber-800 dark:bg-amber-950": worker.category === "supervisor",
                        "bg-sky-100 text-sky-800 dark:bg-sky-950": worker.category === "staff",
                        "bg-purple-100 text-purple-800 dark:bg-purple-950": worker.category === "operator",
                      })}
                    >
                      {worker.category || "Labor"}
                    </Badge>
                  </td>

                  <td className="py-1.5 px-2 text-center text-[10px] capitalize text-muted-foreground font-sans">
                    {worker.employmentType === "monthly" ? "Monthly" : "Daily"}
                  </td>

                  <td className="py-1.5 px-3 text-right font-bold font-mono text-foreground">
                    {worker.employmentType === "monthly"
                      ? `NPR ${worker.monthlySalary.toLocaleString()}`
                      : `NPR ${worker.dailyWage.toLocaleString()}`}
                  </td>

                  <td className="py-1.5 px-3 text-muted-foreground font-mono text-[11px]">
                    {worker.phone || "—"}
                  </td>

                  <td className="py-1.5 px-3 text-muted-foreground text-[10px]">
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
                  </td>

                  <td className="py-1.5 px-2 text-center">
                    <Badge
                      variant={worker.status === "active" ? "secondary" : "outline"}
                      className={cn("text-[9px] px-1.5 py-0 capitalize", {
                        "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300":
                          worker.status === "active",
                        "text-muted-foreground": worker.status !== "active",
                      })}
                    >
                      {worker.status}
                    </Badge>
                  </td>

                  <td className="py-1.5 px-2 text-right">
                    {canWrite && (
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setEditingWorker(worker);
                            setAddOpen(true);
                          }}
                          className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                        >
                          <Edit2 className="h-3 w-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => deleteMut.mutate({ itemId: worker.id })}
                          disabled={deleteMut.isPending}
                          className="h-6 w-6 p-0 text-red-500 hover:bg-red-50 dark:hover:bg-red-950"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

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
    </div>
  );
}
