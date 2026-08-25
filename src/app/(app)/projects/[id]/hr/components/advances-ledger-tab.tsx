"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Banknote,
  CheckCircle2,
  Trash2,
  Loader2,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { format } from "date-fns";

export function AdvancesLedgerTab({
  projectId,
  staffList = [],
}: {
  projectId: string;
  staffList: Array<{ id: string; name: string; designation: string | null; category: string | null }>;
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
    staffId: selectedStaffFilter === "all" ? undefined : selectedStaffFilter,
    isRecovered: recoveredFilter === "all" ? undefined : recoveredFilter === "recovered",
  });

  const advances = data?.advances || [];
  const totalPending = data?.totalPendingAdvances || 0;
  const totalRecovered = advances
    .filter((a) => a.isRecovered)
    .reduce((s, a) => s + a.amount, 0);

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
      staffId: targetStaffId,
      date: advanceDate,
      amount: Number(amount),
      type: advanceType,
      remarks: remarks || undefined,
    });
  };

  const typeColor = (type: string) => {
    switch (type) {
      case "cash_advance":
        return "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300";
      case "mess_deduction":
        return "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300";
      case "safety_gear":
        return "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300";
      default:
        return "bg-slate-100 text-slate-700 dark:bg-slate-800";
    }
  };

  return (
    <div className="space-y-2.5">
      {/* Dense Controls & Action Ribbon */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-2 bg-muted/30 rounded-md border text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={selectedStaffFilter} onValueChange={setSelectedStaffFilter}>
            <SelectTrigger className="h-7 w-44 text-xs bg-card">
              <SelectValue placeholder="All Workers" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Workers</SelectItem>
              {staffList.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={recoveredFilter} onValueChange={setRecoveredFilter}>
            <SelectTrigger className="h-7 w-32 text-xs bg-card">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Records</SelectItem>
              <SelectItem value="unrecovered">Pending Only</SelectItem>
              <SelectItem value="recovered">Recovered</SelectItem>
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

          <Button
            size="sm"
            onClick={() => setAddOpen(true)}
            className="h-7 text-xs bg-amber-600 hover:bg-amber-700 text-white font-semibold gap-1 px-3 shadow-xs"
          >
            <Plus className="h-3 w-3" />
            Issue Advance
          </Button>
        </div>
      </div>

      {/* Slim 28px High-Density Inline Metrics Ribbon */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-3 py-1.5 bg-muted/40 rounded border text-[11px] font-mono tabular-nums">
        <div className="flex items-center gap-3">
          <span>
            <strong className="text-foreground">Total Slips:</strong> {advances.length}
          </span>
          <span className="text-muted-foreground/40">│</span>
          <span className="text-amber-600 dark:text-amber-400 font-bold">
            Pending Auto-Recovery: NPR {totalPending.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
          </span>
          <span className="text-muted-foreground/40">│</span>
          <span className="text-emerald-600 dark:text-emerald-400 font-medium">
            Settled in Payroll: NPR {totalRecovered.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
          </span>
        </div>
      </div>

      {/* Full-Bleed Advance Ledger Table */}
      <div className="overflow-x-auto rounded border border-border/80 max-h-[calc(100vh-210px)]">
        <table className="w-full text-xs font-mono tabular-nums border-collapse">
          <thead className="sticky top-0 z-10 bg-muted/90 backdrop-blur-xs border-b text-[10px] text-muted-foreground uppercase">
            <tr>
              <th className="py-2 px-3 text-left w-24">Date</th>
              <th className="py-2 px-3 text-left font-semibold min-w-[160px]">Worker Name</th>
              <th className="py-2 px-2 text-center w-28">Type</th>
              <th className="py-2 px-3 text-right w-28 font-bold text-foreground">Amount (NPR)</th>
              <th className="py-2 px-3 text-left min-w-[180px]">Remarks / Purpose</th>
              <th className="py-2 px-2 text-center w-28">Status</th>
              <th className="py-2 px-2 text-right w-16">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {isLoading ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin mx-auto mb-1.5 text-primary" />
                  Loading advance ledger...
                </td>
              </tr>
            ) : advances.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-muted-foreground">
                  No site advances or mess deductions recorded.
                </td>
              </tr>
            ) : (
              advances.map((item) => (
                <tr key={item.id} className="hover:bg-muted/20 transition-colors">
                  <td className="py-1.5 px-3 text-muted-foreground">
                    {format(new Date(item.date), "dd MMM yyyy")}
                  </td>

                  <td className="py-1.5 px-3 font-sans font-medium text-foreground">
                    {item.staff.name}
                    {item.staff.designation && (
                      <span className="block text-[10px] text-muted-foreground font-normal">
                        {item.staff.designation}
                      </span>
                    )}
                  </td>

                  <td className="py-1.5 px-2 text-center">
                    <Badge variant="secondary" className={cn("text-[9px] px-1.5 py-0 capitalize", typeColor(item.type))}>
                      {item.type.replace("_", " ")}
                    </Badge>
                  </td>

                  <td className="py-1.5 px-3 text-right font-bold font-mono text-amber-700 dark:text-amber-300">
                    NPR {item.amount.toLocaleString()}
                  </td>

                  <td className="py-1.5 px-3 text-muted-foreground font-sans text-[11px] truncate max-w-[200px]" title={item.remarks || ""}>
                    {item.remarks || "—"}
                  </td>

                  <td className="py-1.5 px-2 text-center">
                    {item.isRecovered ? (
                      <Badge variant="secondary" className="text-[9px] px-1.5 py-0 bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-bold gap-1">
                        <CheckCircle2 className="h-2.5 w-2.5" /> Recovered
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[9px] px-1.5 py-0 text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-800 font-bold gap-1">
                        <ShieldAlert className="h-2.5 w-2.5" /> Pending
                      </Badge>
                    )}
                  </td>

                  <td className="py-1.5 px-2 text-right">
                    {!item.isRecovered && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => deleteMut.mutate({ advanceId: item.id, projectId })}
                        disabled={deleteMut.isPending}
                        className="h-6 w-6 p-0 text-red-500 hover:bg-red-50 dark:hover:bg-red-950"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Add Advance / Deduction Modal */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Banknote className="h-5 w-5 text-amber-600" />
              Issue Site Cash Advance / Log Deduction
            </DialogTitle>
            <DialogDescription className="text-xs">
              Record cash handouts or canteen charges that will be deducted from the worker&apos;s monthly wage envelope.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreate} className="space-y-3.5 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Select Worker *</Label>
              <Select value={targetStaffId} onValueChange={setTargetStaffId} required>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Choose personnel..." />
                </SelectTrigger>
                <SelectContent>
                  {staffList.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name} ({s.designation || s.category || "Labor"})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Advance Date *</Label>
                <Input
                  type="date"
                  value={advanceDate}
                  onChange={(e) => setAdvanceDate(e.target.value)}
                  className="h-8 text-xs font-mono"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Deduction Type</Label>
                <Select value={advanceType} onValueChange={(val: any) => setAdvanceType(val)}>
                  <SelectTrigger className="h-8 text-xs">
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
              <Label className="text-xs">Amount (NPR) *</Label>
              <Input
                type="number"
                min="50"
                step="50"
                value={amount}
                onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
                className="h-8 text-xs font-mono font-bold"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Voucher Ref / Remarks</Label>
              <Input
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder="e.g. Festival advance, Canteen Slip #104"
                className="h-8 text-xs"
              />
            </div>

            <DialogFooter className="border-t pt-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setAddOpen(false)}
                disabled={createMut.isPending}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={createMut.isPending} className="bg-amber-600 hover:bg-amber-700 text-white font-semibold">
                {createMut.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
                Record Advance (NPR {amount.toLocaleString()})
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
