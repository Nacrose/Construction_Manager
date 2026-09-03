"use client";

import { useState, useEffect } from "react";
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
  Save,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  AlertCircle,
  Clock,
  Banknote,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { format, addDays, subDays } from "date-fns";
import { formatNpr } from "@/lib/currency";
import { ConstructionTable, ConstructionTableColumn } from "@/components/ui/construction-table";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

type AttendanceItem = {
  assignmentId: string;
  personId: string;
  name: string;
  designation: string | null;
  category: string | null;
  employmentType: string;
  gangName: string | null;
  dailyWage: number;
  status: "present" | "absent" | "half_day" | "leave" | "overtime";
  hours: number;
  overtime: number;
  remarks: string;
  isLogged: boolean;
};

// Matches the bulkLogAttendance wire input (z.input) — kept local so the
// capacity-override retry can re-submit the exact payload that was rejected.
type BulkLogInput = {
  projectId: string;
  date: string;
  records: Array<{
    assignmentId: string;
    status: "present" | "absent" | "half_day" | "leave" | "overtime";
    hours?: number;
    overtime?: number;
    remarks?: string | null;
  }>;
  overrideReason?: string | null;
};

export function DailyAttendanceTab({ projectId }: { projectId: string }) {
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    return format(new Date(), "yyyy-MM-dd");
  });
  const [gangFilter, setGangFilter] = useState<string>("all");
  const [items, setItems] = useState<AttendanceItem[]>([]);
  const [isDirty, setIsDirty] = useState(false);
  // A rejected batch waiting for the user to confirm an audited override.
  const [pendingOverride, setPendingOverride] = useState<{
    message: string;
    input: BulkLogInput;
  } | null>(null);

  const { data, isLoading, refetch, isFetching } =
    trpc.hr.getAttendanceByDate.useQuery({
      projectId,
      date: selectedDate,
    });

  useEffect(() => {
    if (data?.items) {
      setItems(data.items as unknown as AttendanceItem[]);
      setIsDirty(false);
    }
  }, [data]);

  const bulkLogMut = trpc.hr.bulkLogAttendance.useMutation({
    onSuccess: (res) => {
      toast.success(`Saved attendance for ${res.count} workers on ${selectedDate}`);
      setIsDirty(false);
      refetch();
    },
    onError: (e, vars) => {
      // Cross-project daily-capacity guard (ADR-0005): offer a ONE-shot
      // audited override instead of a dead end. A retry that still carries
      // an overrideReason (or fails for any other reason) falls through to
      // the plain toast — never loops.
      if (e.message.includes("Daily capacity exceeded") && !vars.overrideReason) {
        setPendingOverride({ message: e.message, input: vars });
        return;
      }
      toast.error(e.message);
    },
  });

  const handleOverrideConfirm = () => {
    if (!pendingOverride) return;
    const reasonExcerpt = pendingOverride.message
      .replace(/^Daily capacity exceeded:\s*/, "")
      .slice(0, 180);
    bulkLogMut.mutate({
      ...pendingOverride.input,
      overrideReason: `Manual override: ${reasonExcerpt}`,
    });
    setPendingOverride(null);
  };

  const handleDateShift = (days: number) => {
    const current = new Date(`${selectedDate}T00:00:00.000Z`);
    const shifted = days > 0 ? addDays(current, days) : subDays(current, Math.abs(days));
    setSelectedDate(format(shifted, "yyyy-MM-dd"));
  };

  const updateItemByAssignmentId = (assignmentId: string, updates: Partial<AttendanceItem>) => {
    setItems((prev) =>
      prev.map((item) => (item.assignmentId === assignmentId ? { ...item, ...updates } : item))
    );
    setIsDirty(true);
  };

  const handleMarkAll = (status: "present" | "absent") => {
    setItems((prev) =>
      prev.map((item) => {
        if (gangFilter !== "all" && item.gangName !== gangFilter) return item;
        return {
          ...item,
          status,
          hours: status === "present" ? 8 : 0,
          overtime: status === "present" ? item.overtime : 0,
        };
      })
    );
    setIsDirty(true);
  };

  const handleSave = () => {
    const payload = items.map((i) => ({
      assignmentId: i.assignmentId,
      status: i.status,
      hours: i.hours,
      overtime: i.overtime,
      remarks: i.remarks || undefined,
    }));

    bulkLogMut.mutate({
      projectId,
      date: selectedDate,
      records: payload,
    });

  };

  const filteredItems = items.filter((i) => {
    if (gangFilter !== "all" && i.gangName !== gangFilter) return false;
    return true;
  });

  // Metrics for selected date
  const presentCount = filteredItems.filter((i) => i.status === "present" || i.status === "overtime").length;
  const halfDayCount = filteredItems.filter((i) => i.status === "half_day").length;
  const absentCount = filteredItems.filter((i) => i.status === "absent").length;
  const leaveCount = filteredItems.filter((i) => i.status === "leave").length;
  const totalOvertime = filteredItems.reduce((acc, i) => acc + (Number(i.overtime) || 0), 0);

  const estimatedTodayCost = filteredItems.reduce((acc, i) => {
    if (i.employmentType === "monthly") return acc;
    let base = 0;
    if (i.status === "present" || i.status === "overtime") base = i.dailyWage;
    else if (i.status === "half_day") base = i.dailyWage * 0.5;
    const otCost = (Number(i.overtime) || 0) * (i.dailyWage / 8) * 1.5;
    return acc + base + otCost;
  }, 0);

  const columns: ConstructionTableColumn<AttendanceItem>[] = [
    {
      key: "name",
      header: "Worker Name",
      render: (_, item) => (
        <div>
          <span className="font-sans font-medium text-foreground">{item.name}</span>
          {item.designation && (
            <span className="block text-[10px] text-muted-foreground font-normal">
              {item.designation}
            </span>
          )}
        </div>
      ),
    },
    {
      key: "gangName",
      header: "Gang / Toli",
      render: (_, item) => (
        <span className="text-muted-foreground text-[11px] font-sans">
          {item.gangName || "—"}
        </span>
      ),
    },
    {
      key: "category",
      header: "Trade",
      align: "center",
      render: (_, item) => (
        <Badge
          variant="secondary"
          className={cn("text-[9px] px-1.5 py-0 capitalize", {
            "bg-success/15 text-success dark:bg-success dark:text-success/80":
              item.category === "skilled",
            "bg-muted text-foreground/80 dark:bg-[var(--navy-mid)]": item.category === "unskilled",
            "bg-amber-100 text-amber-800 dark:bg-amber-950": item.category === "supervisor",
            "bg-info/15 text-info dark:bg-[var(--navy-deep)]": item.category === "staff",
            "bg-purple-100 text-purple-800 dark:bg-purple-950": item.category === "operator",
          })}
        >
          {item.category || "Labor"}
        </Badge>
      ),
    },
    {
      key: "status",
      header: "Status",
      align: "center",
      render: (_, item) => (
        <div className="flex items-center justify-center gap-1">
          <button
            type="button"
            onClick={() => updateItemByAssignmentId(item.assignmentId, { status: "present", hours: 8 })}
            className={cn(
              "px-2 py-0.5 rounded text-[10px] font-bold border transition-colors",
              item.status === "present"
                ? "bg-success text-white border-success"
                : "bg-card text-muted-foreground border-border hover:bg-muted"
            )}
          >
            P
          </button>
          <button
            type="button"
            onClick={() => updateItemByAssignmentId(item.assignmentId, { status: "half_day", hours: 4 })}
            className={cn(
              "px-2 py-0.5 rounded text-[10px] font-bold border transition-colors",
              item.status === "half_day"
                ? "bg-amber-600 text-white border-amber-600"
                : "bg-card text-muted-foreground border-border hover:bg-muted"
            )}
          >
            HD
          </button>
          <button
            type="button"
            onClick={() => updateItemByAssignmentId(item.assignmentId, { status: "absent", hours: 0, overtime: 0 })}
            className={cn(
              "px-2 py-0.5 rounded text-[10px] font-bold border transition-colors",
              item.status === "absent"
                ? "bg-red-600 text-white border-red-600"
                : "bg-card text-muted-foreground border-border hover:bg-muted"
            )}
          >
            A
          </button>
          <button
            type="button"
            onClick={() => updateItemByAssignmentId(item.assignmentId, { status: "leave", hours: 0, overtime: 0 })}
            className={cn(
              "px-2 py-0.5 rounded text-[10px] font-bold border transition-colors",
              item.status === "leave"
                ? "bg-[var(--navy-mid)] text-white border-border"
                : "bg-card text-muted-foreground border-border hover:bg-muted"
            )}
          >
            L
          </button>
          <button
            type="button"
            onClick={() =>
              updateItemByAssignmentId(item.assignmentId, {
                status: "overtime",
                hours: 8,
                overtime: item.overtime > 0 ? item.overtime : 2,
              })
            }
            className={cn(
              "px-2 py-0.5 rounded text-[10px] font-bold border transition-colors",
              item.status === "overtime"
                ? "bg-info text-white border-info"
                : "bg-card text-muted-foreground border-border hover:bg-muted"
            )}
          >
            OT
          </button>
        </div>
      ),
    },
    {
      key: "hours",
      header: "Hours",
      align: "right",
      render: (_, item) => (
        <Input
          type="number"
          min="0"
          max="24"
          value={item.hours}
          onChange={(e) => updateItemByAssignmentId(item.assignmentId, { hours: parseFloat(e.target.value) || 0 })}
          className="h-6 w-14 text-xs text-right font-mono p-1"
        />
      ),
    },
    {
      key: "overtime",
      header: "OT (h)",
      align: "right",
      render: (_, item) => (
        <Input
          type="number"
          min="0"
          max="16"
          step="0.5"
          value={item.overtime}
          onChange={(e) => updateItemByAssignmentId(item.assignmentId, { overtime: parseFloat(e.target.value) || 0 })}
          className={cn(
            "h-6 w-16 text-xs text-right font-mono p-1",
            item.overtime > 0 && "font-bold text-info border-info/40"
          )}
        />
      ),
    },
    {
      key: "dailyWage",
      header: "Daily Rate",
      align: "right",
      render: (_, item) => (
        <span className="text-muted-foreground font-mono text-xs">
          {item.dailyWage > 0 ? formatNpr(item.dailyWage) : "—"}
        </span>
      ),
    },
    {
      key: "todayWage",
      header: "Today Wage",
      align: "right",
      render: (_, item) => {
        const regularRate =
          item.status === "present" || item.status === "overtime"
            ? item.dailyWage
            : item.status === "half_day"
            ? item.dailyWage * 0.5
            : 0;
        const otRate = (Number(item.overtime) || 0) * (item.dailyWage / 8) * 1.5;
        return (
          <span className="font-mono font-bold text-foreground text-xs">
            {item.employmentType === "monthly" ? "Salaried" : formatNpr(regularRate + otRate)}
          </span>
        );
      },
    },
    {
      key: "remarks",
      header: "Work Location / Remarks",
      render: (_, item) => (
        <Input
          type="text"
          value={item.remarks}
          onChange={(e) => updateItemByAssignmentId(item.assignmentId, { remarks: e.target.value })}
          placeholder="e.g. Pier 4 concrete"
          className="h-6 text-[10px] p-1.5"
        />
      ),
    },
  ];

  return (
    <div className="space-y-3">
      {/* Date Navigator & Action Controls Ribbon */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-2 bg-muted/30 rounded-md border text-xs">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 bg-background border rounded px-1">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => handleDateShift(-1)}
              className="h-7 w-7 p-0"
              title="Previous Day"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>

            <Input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="h-7 border-0 focus-visible:ring-0 text-xs font-mono w-32 px-1"
            />

            <Button
              size="sm"
              variant="ghost"
              onClick={() => handleDateShift(1)}
              className="h-7 w-7 p-0"
              title="Next Day"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <Select value={gangFilter} onValueChange={setGangFilter}>
            <SelectTrigger className="h-7 w-32 text-xs font-mono">
              <SelectValue placeholder="All Gangs" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Gangs</SelectItem>
              <SelectItem value="Civil Gang">Civil Gang</SelectItem>
              <SelectItem value="Steel Fixing Gang">Steel Fixing Gang</SelectItem>
              <SelectItem value="Formwork Gang">Formwork Gang</SelectItem>
              <SelectItem value="Masonry Gang">Masonry Gang</SelectItem>
              <SelectItem value="MEP Gang">MEP Gang</SelectItem>
            </SelectContent>
          </Select>

          <Button
            size="sm"
            variant="ghost"
            onClick={() => refetch()}
            className="h-7 w-7 p-0"
            title="Refresh Attendance"
          >
            <RefreshCw className={cn("h-3 w-3", isFetching && "animate-spin")} />
          </Button>

          <div className="flex items-center gap-1 border-l pl-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleMarkAll("present")}
              className="h-7 text-xs font-mono text-success hover:text-success hover:bg-success/10"
            >
              Mark All Present
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleMarkAll("absent")}
              className="h-7 text-xs font-mono text-red-600 hover:text-red-700 hover:bg-red-50"
            >
              Mark All Absent
            </Button>
          </div>
        </div>

        <Button
          size="sm"
          onClick={handleSave}
          disabled={bulkLogMut.isPending || !isDirty}
          className={cn(
            "h-7 text-xs gap-1.5 font-mono",
            isDirty
              ? "bg-primary text-primary-foreground animate-pulse"
              : "bg-muted text-muted-foreground"
          )}
        >
          <Save className="h-3 w-3" />
          {bulkLogMut.isPending ? "Saving..." : isDirty ? "Save Changes" : "Saved"}
        </Button>
      </div>

      {/* Aggregate Daily Stats Ribbon */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-2.5 py-1.5 bg-muted/20 rounded border text-[11px] font-mono">
        <div className="flex items-center gap-3">
          <span className="text-foreground font-semibold">
            👷 On-Roster: {filteredItems.length}
          </span>
          <span className="text-muted-foreground/40">│</span>
          <span className="text-success dark:text-success/80 font-semibold">
            Present: {presentCount}
          </span>
          <span className="text-muted-foreground/40">│</span>
          <span className="text-amber-600 dark:text-amber-400">
            Half-Day: {halfDayCount}
          </span>
          <span className="text-muted-foreground/40">│</span>
          <span className="text-red-500">
            Absent: {absentCount}
          </span>
          <span className="text-muted-foreground/40">│</span>
          <span className="text-muted-foreground">
            Leave: {leaveCount}
          </span>
          <span className="text-muted-foreground/40">│</span>
          <span className="text-info dark:text-info/80 font-semibold">
            ⏱ OT Hours: {totalOvertime}h
          </span>
        </div>

        <div>
          <span className="text-foreground font-bold">
            💰 Today Est. Cost: {formatNpr(estimatedTodayCost)}
          </span>
        </div>
      </div>

      {/* Central Table Engine */}
      <ConstructionTable
        data={filteredItems}
        columns={columns}
        isLoading={isLoading}
        searchPlaceholder="Search daily attendance by worker name, trade, gang..."
        searchFilterKeys={["name", "designation", "gangName", "category", "remarks"]}
      />

      {/* Cross-project daily-capacity override (audited, one-shot retry) */}
      {pendingOverride && (
        <ConfirmDialog
          open={Boolean(pendingOverride)}
          onOpenChange={(open) => {
            if (!open) setPendingOverride(null);
          }}
          title="Daily capacity exceeded"
          description={`${pendingOverride.message} Log anyway with an audited override?`}
          variant="warning"
          confirmLabel="Log Anyway (Audited)"
          isLoading={bulkLogMut.isPending}
          onConfirm={handleOverrideConfirm}
        />
      )}
    </div>
  );
}
