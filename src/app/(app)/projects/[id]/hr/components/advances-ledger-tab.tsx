"use client";

import { useState } from "react";
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
  Trash2,
  Loader2,
  RefreshCw,
  CheckCircle2,
  ShieldAlert,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { format } from "date-fns";
import { formatNpr } from "@/lib/currency";
import { ConstructionTable, ConstructionTableColumn } from "@/components/ui/construction-table";
import { FormDialogEngine } from "@/components/ui/form-dialog-engine";

export function AdvancesLedgerTab({
  projectId,
  staffList = [],
}: {
  projectId: string;
  staffList: Array<{ id: string; personId: string; name: string; designation: string | null; category: string | null }>;
}) {
  const [selectedStaffFilter, setSelectedStaffFilter] = useState<string>("all");
  const [recoveredFilter, setRecoveredFilter] = useState<string>("all");
  const [addOpen, setAddOpen] = useState(false);

  // Form states
  const [targetStaffId, setTargetStaffId] = useState("");
  const [amount, setAmount] = useState<number>(1000);
  const [advanceDate, setAdvanceDate] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [advanceType, setAdvanceType] = useState<"cash_advance" | "mess_deduction" | "safety_gear" | "other">("cash_advance");
  const [remarks, setRemarks] = useState("");

  const utils = trpc.useUtils();

  const { data, isLoading, refetch, isFetching } = trpc.hr.getStaffAdvances.useQuery({
    projectId,
    personId: selectedStaffFilter === "all" ? undefined : selectedStaffFilter,
    isRecovered: recoveredFilter === "all" ? undefined : recoveredFilter === "recovered",
  });

  const advances = data?.advances || [];
  const totalPending = data?.totalPendingAdvances || 0;
  const totalRecovered = advances
    .filter((a) => a.recoveredAmount >= a.amount)
    .reduce((s, a) => s + a.recoveredAmount, 0);

  const createMut = trpc.hr.createStaffAdvance.useMutation({
    onSuccess: () => {
      toast.success("Advance / Deduction recorded");
      utils.hr.getStaffAdvances.invalidate({ projectId });
      setAddOpen(false);
      setRemarks("");
      setAmount(1000);
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMut = trpc.hr.deleteStaffAdvance.useMutation({
    onSuccess: () => {
      toast.success("Advance deleted");
      utils.hr.getStaffAdvances.invalidate({ projectId });
    },
    onError: (e) => toast.error(e.message),
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetStaffId) {
      toast.error("Please select a worker");
      return;
    }
    if (amount <= 0) {
      toast.error("Amount must be greater than 0");
      return;
    }

    createMut.mutate({
      projectId,
      personId: targetStaffId,  // advances belong to the person (ADR-0007)
      amount,
      date: advanceDate,
      type: advanceType,
      remarks: remarks || undefined,
    });
  };

  const typeColor = (t: string) => {
    switch (t) {
      case "cash_advance":
        return "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300";
      case "mess_deduction":
        return "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300";
      case "safety_gear":
        return "bg-info/15 text-info dark:bg-[var(--navy-deep)] dark:text-info/80";
      default:
        return "bg-muted text-foreground/80 dark:bg-[var(--navy-mid)]";
    }
  };

  const columns: ConstructionTableColumn<any>[] = [
    {
      key: "date",
      header: "Date",
      render: (_, item) => (
        <span className="text-muted-foreground font-mono text-xs">
          {format(new Date(item.date), "dd MMM yyyy")}
        </span>
      ),
    },
    {
      key: "staffName",
      header: "Worker Name",
      render: (_, item) => (
        <div>
          <span className="font-sans font-medium text-foreground">{item.person.displayName}</span>
          {item.person.category && (
            <span className="block text-[10px] text-muted-foreground font-normal font-mono capitalize">
              {item.person.category}
            </span>
          )}
        </div>
      ),
    },
    {
      key: "type",
      header: "Type",
      align: "center",
      render: (_, item) => (
        <Badge variant="secondary" className={cn("text-[9px] px-1.5 py-0 capitalize font-mono", typeColor(item.type))}>
          {item.type.replace("_", " ")}
        </Badge>
      ),
    },
    {
      key: "amount",
      header: "Amount",
      align: "right",
      render: (_, item) => (
        <span className="font-bold font-mono text-amber-700 dark:text-amber-300 text-xs">
          {formatNpr(item.amount)}
        </span>
      ),
    },
    {
      key: "remarks",
      header: "Remarks / Purpose",
      render: (_, item) => (
        <span className="text-muted-foreground font-sans text-xs truncate max-w-[200px] block" title={item.remarks || ""}>
          {item.remarks || "—"}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      align: "center",
      render: (_, item) =>
        item.recoveredAmount >= item.amount ? (
          <Badge variant="secondary" className="text-[9px] px-1.5 py-0 bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-bold gap-1 font-mono">
            <CheckCircle2 className="h-2.5 w-2.5" /> Recovered
          </Badge>
        ) : (
          <Badge variant="outline" className="text-[9px] px-1.5 py-0 text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-800 font-bold gap-1 font-mono">
            <ShieldAlert className="h-2.5 w-2.5" /> Pending
          </Badge>
        ),
    },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      render: (_, item) => {
        if (item.recoveredAmount >= item.amount) return null;
        return (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => deleteMut.mutate({ advanceId: item.id, projectId })}
            disabled={deleteMut.isPending}
            className="h-6 w-6 p-0 text-red-500 hover:bg-red-50 dark:hover:bg-red-950"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        );
      },
    },
  ];

  return (
    <div className="space-y-3">
      {/* Controls Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-2 bg-muted/30 rounded-md border text-xs">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <Select value={selectedStaffFilter} onValueChange={setSelectedStaffFilter}>
            <SelectTrigger className="h-7 w-48 text-xs font-mono">
              <SelectValue placeholder="All Personnel" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Personnel</SelectItem>
              {staffList.map((s) => (
                <SelectItem key={s.personId} value={s.personId}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={recoveredFilter} onValueChange={setRecoveredFilter}>
            <SelectTrigger className="h-7 w-32 text-xs font-mono">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Slips</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="recovered">Recovered</SelectItem>
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

        <Button
          size="sm"
          onClick={() => setAddOpen(true)}
          className="h-7 text-xs gap-1 font-mono bg-amber-600 hover:bg-amber-700 text-white"
        >
          <Plus className="h-3 w-3" />
          Issue Cash Advance
        </Button>
      </div>

      {/* Advance Metrics Ribbon */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-2.5 py-1.5 bg-muted/20 rounded border text-[11px] font-mono">
        <div className="flex items-center gap-3">
          <span className="text-muted-foreground font-semibold">
            <strong className="text-foreground">Total Slips:</strong> {advances.length}
          </span>
          <span className="text-muted-foreground/40">│</span>
          <span className="text-amber-600 dark:text-amber-400 font-bold">
            Pending Auto-Recovery: {formatNpr(totalPending)}
          </span>
          <span className="text-muted-foreground/40">│</span>
          <span className="text-emerald-600 dark:text-[var(--primary)] font-medium">
            Settled in Payroll: {formatNpr(totalRecovered)}
          </span>
        </div>
      </div>

      {/* Central Table Engine */}
      <ConstructionTable
        data={advances}
        columns={columns}
        isLoading={isLoading}
        searchPlaceholder="Search advances by worker, remarks, voucher..."
        searchFilterKeys={["staff.name", "remarks", "type"]}
      />

      {/* Standard Form Dialog Engine */}
      <FormDialogEngine
        open={addOpen}
        onOpenChange={setAddOpen}
        title="Issue Site Cash Advance / Log Deduction"
        description="Record cash handouts or canteen charges that will be deducted from the worker's monthly wage envelope."
      >
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Select Worker *</Label>
            <Select value={targetStaffId} onValueChange={setTargetStaffId} required>
              <SelectTrigger className="h-8 text-xs bg-white/5 border-white/10 text-white font-mono">
                <SelectValue placeholder="Choose personnel..." />
              </SelectTrigger>
              <SelectContent>
                {staffList.map((s) => (
                  <SelectItem key={s.personId} value={s.personId}>
                    {s.name} ({s.designation || s.category || "Labor"})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Advance Date *</Label>
              <Input
                type="date"
                value={advanceDate}
                onChange={(e) => setAdvanceDate(e.target.value)}
                className="h-8 text-xs font-mono bg-white/5 border-white/10 text-white"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Deduction Type</Label>
              <Select value={advanceType} onValueChange={(val: any) => setAdvanceType(val)}>
                <SelectTrigger className="h-8 text-xs bg-white/5 border-white/10 text-white font-mono">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash_advance">Cash Advance</SelectItem>
                  <SelectItem value="mess_deduction">Canteen / Mess Charge</SelectItem>
                  <SelectItem value="safety_gear">PPE / Boots Charge</SelectItem>
                  <SelectItem value="other">Other Site Deduction</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Amount (NPR) *</Label>
            <Input
              type="number"
              min="50"
              step="50"
              value={amount}
              onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
              className="h-8 text-xs font-mono font-bold bg-white/5 border-white/10 text-white"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Voucher Ref / Remarks</Label>
            <Input
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="e.g. Festival advance, Canteen Slip #104"
              className="h-8 text-xs bg-white/5 border-white/10 text-white"
            />
          </div>

          <div className="flex justify-end pt-2">
            <Button
              type="submit"
              size="sm"
              disabled={createMut.isPending}
              className="h-8 text-xs font-mono bg-amber-600 hover:bg-amber-700 text-white font-semibold"
            >
              {createMut.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
              Record Advance ({formatNpr(amount)})
            </Button>
          </div>
        </form>
      </FormDialogEngine>
    </div>
  );
}
