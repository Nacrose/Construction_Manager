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
  Calendar as CalendarIcon,
  Save,
  Loader2,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  AlertCircle,
  Clock,
  Banknote,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { format, addDays, subDays } from "date-fns";

type AttendanceItem = {
  staffId: string;
  staffName: string;
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

export function DailyAttendanceTab({ projectId }: { projectId: string }) {
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    return format(new Date(), "yyyy-MM-dd");
  });
  const [gangFilter, setGangFilter] = useState<string>("all");
  const [items, setItems] = useState<AttendanceItem[]>([]);
  const [isDirty, setIsDirty] = useState(false);

  const { data, isLoading, refetch, isFetching } =
    trpc.hr.getAttendanceByDate.useQuery({
      projectId,
      date: selectedDate,
    });

  useEffect(() => {
    if (data?.items) {
      setItems(data.items as AttendanceItem[]);
      setIsDirty(false);
    }
  }, [data]);

  const bulkLogMut = trpc.hr.bulkLogAttendance.useMutation({
    onSuccess: (res) => {
      toast.success(`Saved attendance for ${res.count} workers on ${selectedDate}`);
      setIsDirty(false);
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const handleDateShift = (days: number) => {
    const current = new Date(`${selectedDate}T00:00:00.000Z`);
    const shifted = days > 0 ? addDays(current, days) : subDays(current, Math.abs(days));
    setSelectedDate(format(shifted, "yyyy-MM-dd"));
  };

  const updateItem = (index: number, updates: Partial<AttendanceItem>) => {
    const next = [...items];
    next[index] = { ...next[index], ...updates };
    setItems(next);
    setIsDirty(true);
  };

  const handleMarkAll = (status: "present" | "absent") => {
    const next = items.map((item) => {
      if (gangFilter !== "all" && item.gangName !== gangFilter) return item;
      return {
        ...item,
        status,
        hours: status === "present" ? 8 : 0,
        overtime: status === "present" ? item.overtime : 0,
      };
    });
    setItems(next);
    setIsDirty(true);
  };

  const handleSave = () => {
    bulkLogMut.mutate({
      projectId,
      date: selectedDate,
      records: items.map((i) => ({
        staffId: i.staffId,
        status: i.status,
        hours: i.hours,
        overtime: i.overtime,
        remarks: i.remarks || undefined,
      })),
    });
  };

  // Metrics
  const presentCount = items.filter((i) => i.status === "present" || i.status === "overtime").length;
  const halfDayCount = items.filter((i) => i.status === "half_day").length;
  const absentCount = items.filter((i) => i.status === "absent").length;
  const leaveCount = items.filter((i) => i.status === "leave").length;
  const totalOtHours = items.reduce((sum, i) => sum + (Number(i.overtime) || 0), 0);

  const estimatedTodayCost = items.reduce((sum, i) => {
    if (i.employmentType === "monthly") return sum;
    const regularRate =
      i.status === "present" || i.status === "overtime"
        ? i.dailyWage
        : i.status === "half_day"
        ? i.dailyWage * 0.5
        : 0;
    const otRate = (Number(i.overtime) || 0) * (i.dailyWage / 8) * 1.5;
    return sum + regularRate + otRate;
  }, 0);

  const gangs = Array.from(new Set(items.map((i) => i.gangName).filter(Boolean))) as string[];

  const filteredItems = items.filter((item) => {
    if (gangFilter !== "all" && item.gangName !== gangFilter) return false;
    return true;
  });

  return (
    <div className="space-y-2.5">
      {/* Dense Single-Line Controls & Action Ribbon */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-2 bg-muted/30 rounded-md border text-xs">
        {/* Date Selector */}
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleDateShift(-1)}
            className="h-7 w-7 p-0"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>

          <div className="relative">
            <Input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="h-7 text-xs font-mono font-bold w-32 pl-7"
            />
            <CalendarIcon className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
          </div>

          <Button
            size="sm"
            variant="outline"
            onClick={() => handleDateShift(1)}
            className="h-7 w-7 p-0"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>

          <Button
            size="sm"
            variant="ghost"
            onClick={() => setSelectedDate(format(new Date(), "yyyy-MM-dd"))}
            className="h-7 text-xs text-muted-foreground px-2"
          >
            Today
          </Button>
        </div>

        {/* Quick Batch Buttons & Save */}
        <div className="flex items-center gap-2">
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

          <Button
            size="sm"
            variant="outline"
            onClick={() => handleMarkAll("present")}
            className="h-7 text-xs text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20 px-2.5"
          >
            Mark All Present (8h)
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={() => handleMarkAll("absent")}
            className="h-7 text-xs text-red-600 dark:text-red-400 px-2"
          >
            Mark All Absent
          </Button>

          <Button
            size="sm"
            onClick={handleSave}
            disabled={bulkLogMut.isPending || !isDirty}
            className="h-7 text-xs bg-primary hover:bg-primary/90 text-primary-foreground font-semibold gap-1.5 px-3"
          >
            {bulkLogMut.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Save className="h-3 w-3" />
            )}
            Save Muster
          </Button>
        </div>
      </div>

      {/* Slim 28px High-Density Inline Metric Ribbon */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-3 py-1.5 bg-muted/40 rounded border text-[11px] font-mono tabular-nums">
        <div className="flex items-center gap-3">
          <span>
            <strong className="text-foreground">Roster:</strong> {items.length} workers
          </span>
          <span className="text-muted-foreground/40">│</span>
          <span className="text-emerald-600 dark:text-emerald-400 font-bold">
            🟢 Present: {presentCount}
          </span>
          <span className="text-muted-foreground/40">│</span>
          <span className="text-amber-600 dark:text-amber-400 font-medium">
            🟡 Half Day: {halfDayCount}
          </span>
          <span className="text-muted-foreground/40">│</span>
          <span className="text-red-600 dark:text-red-400 font-medium">
            🔴 Absent: {absentCount}
          </span>
          {leaveCount > 0 && (
            <>
              <span className="text-muted-foreground/40">│</span>
              <span className="text-slate-600 dark:text-slate-400 font-medium">
                ⚪ Leave: {leaveCount}
              </span>
            </>
          )}
        </div>

        <div className="flex items-center gap-3">
          <span className="text-blue-600 dark:text-blue-400 font-semibold">
            ⏱ Overtime: {totalOtHours} hrs
          </span>
          <span className="text-muted-foreground/40">│</span>
          <span className="text-foreground font-bold">
            💰 Today Est. Cost: NPR {estimatedTodayCost.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
          </span>
        </div>
      </div>

      {/* Full-Bleed Daily Attendance Table */}
      <div className="overflow-x-auto rounded border border-border/80 max-h-[calc(100vh-230px)]">
        <table className="w-full text-xs font-mono tabular-nums border-collapse">
          <thead className="sticky top-0 z-10 bg-muted/90 backdrop-blur-xs border-b text-[10px] text-muted-foreground uppercase">
            <tr>
              <th className="py-2 px-2 text-left w-10">#</th>
              <th className="py-2 px-3 text-left min-w-[160px] font-semibold text-foreground">Worker Name</th>
              <th className="py-2 px-2 text-left w-24">Gang / Toli</th>
              <th className="py-2 px-2 text-center w-20">Trade</th>
              <th className="py-2 px-2 text-center w-56">Status</th>
              <th className="py-2 px-2 text-right w-16">Hours</th>
              <th className="py-2 px-2 text-right w-20">OT (h)</th>
              <th className="py-2 px-2 text-right w-20">Daily Rate</th>
              <th className="py-2 px-3 text-right w-24 font-bold text-foreground">Today Wage</th>
              <th className="py-2 px-3 text-left min-w-[140px]">Work Location / Remarks</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {isLoading ? (
              <tr>
                <td colSpan={10} className="p-8 text-center text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin mx-auto mb-1.5 text-primary" />
                  Loading daily roster...
                </td>
              </tr>
            ) : filteredItems.length === 0 ? (
              <tr>
                <td colSpan={10} className="p-8 text-center text-muted-foreground">
                  No active workers found.
                </td>
              </tr>
            ) : (
              filteredItems.map((item, idx) => {
                const regularRate =
                  item.status === "present" || item.status === "overtime"
                    ? item.dailyWage
                    : item.status === "half_day"
                    ? item.dailyWage * 0.5
                    : 0;
                const otRate = (Number(item.overtime) || 0) * (item.dailyWage / 8) * 1.5;
                const totalWage =
                  item.employmentType === "monthly"
                    ? "Salaried"
                    : `NPR ${(regularRate + otRate).toLocaleString()}`;

                return (
                  <tr
                    key={item.staffId}
                    className={cn(
                      "hover:bg-muted/20 transition-colors",
                      item.status === "absent" && "bg-red-50/20 dark:bg-red-950/10",
                      item.status === "leave" && "bg-slate-50/40 dark:bg-slate-900/30"
                    )}
                  >
                    <td className="py-1.5 px-2 text-muted-foreground text-[10px]">{idx + 1}</td>

                    <td className="py-1.5 px-3 font-sans font-medium text-foreground">
                      {item.staffName}
                      {item.designation && (
                        <span className="block text-[10px] text-muted-foreground font-normal">
                          {item.designation}
                        </span>
                      )}
                    </td>

                    <td className="py-1.5 px-2 text-muted-foreground text-[11px] font-sans">
                      {item.gangName || "—"}
                    </td>

                    <td className="py-1.5 px-2 text-center">
                      <Badge
                        variant="secondary"
                        className={cn("text-[9px] px-1.5 py-0 capitalize", {
                          "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300":
                            item.category === "skilled",
                          "bg-slate-100 text-slate-700 dark:bg-slate-800": item.category === "unskilled",
                          "bg-amber-100 text-amber-800 dark:bg-amber-950": item.category === "supervisor",
                          "bg-sky-100 text-sky-800 dark:bg-sky-950": item.category === "staff",
                          "bg-purple-100 text-purple-800 dark:bg-purple-950": item.category === "operator",
                        })}
                      >
                        {item.category || "Labor"}
                      </Badge>
                    </td>

                    <td className="py-1.5 px-2">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          type="button"
                          onClick={() => updateItem(idx, { status: "present", hours: 8 })}
                          className={cn(
                            "px-2 py-0.5 rounded text-[10px] font-bold border transition-colors",
                            item.status === "present"
                              ? "bg-emerald-600 text-white border-emerald-600"
                              : "bg-card text-muted-foreground border-border hover:bg-muted"
                          )}
                        >
                          P
                        </button>
                        <button
                          type="button"
                          onClick={() => updateItem(idx, { status: "half_day", hours: 4 })}
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
                          onClick={() => updateItem(idx, { status: "absent", hours: 0, overtime: 0 })}
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
                          onClick={() => updateItem(idx, { status: "leave", hours: 0, overtime: 0 })}
                          className={cn(
                            "px-2 py-0.5 rounded text-[10px] font-bold border transition-colors",
                            item.status === "leave"
                              ? "bg-slate-600 text-white border-slate-600"
                              : "bg-card text-muted-foreground border-border hover:bg-muted"
                          )}
                        >
                          L
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            updateItem(idx, {
                              status: "overtime",
                              hours: 8,
                              overtime: item.overtime > 0 ? item.overtime : 2,
                            })
                          }
                          className={cn(
                            "px-2 py-0.5 rounded text-[10px] font-bold border transition-colors",
                            item.status === "overtime"
                              ? "bg-blue-600 text-white border-blue-600"
                              : "bg-card text-muted-foreground border-border hover:bg-muted"
                          )}
                        >
                          OT
                        </button>
                      </div>
                    </td>

                    <td className="py-1.5 px-2 text-right">
                      <Input
                        type="number"
                        min="0"
                        max="24"
                        value={item.hours}
                        onChange={(e) => updateItem(idx, { hours: parseFloat(e.target.value) || 0 })}
                        className="h-6 w-14 text-xs text-right font-mono p-1"
                      />
                    </td>

                    <td className="py-1.5 px-2 text-right">
                      <Input
                        type="number"
                        min="0"
                        max="16"
                        step="0.5"
                        value={item.overtime}
                        onChange={(e) => updateItem(idx, { overtime: parseFloat(e.target.value) || 0 })}
                        className={cn(
                          "h-6 w-16 text-xs text-right font-mono p-1",
                          item.overtime > 0 && "font-bold text-blue-600 border-blue-300"
                        )}
                      />
                    </td>

                    <td className="py-1.5 px-2 text-right text-muted-foreground font-mono">
                      {item.dailyWage.toLocaleString()}
                    </td>

                    <td className="py-1.5 px-3 text-right font-mono font-bold text-foreground">
                      {totalWage}
                    </td>

                    <td className="py-1.5 px-3">
                      <Input
                        type="text"
                        value={item.remarks}
                        onChange={(e) => updateItem(idx, { remarks: e.target.value })}
                        placeholder="e.g. Pier 4 concrete"
                        className="h-6 text-[10px] p-1.5"
                      />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
