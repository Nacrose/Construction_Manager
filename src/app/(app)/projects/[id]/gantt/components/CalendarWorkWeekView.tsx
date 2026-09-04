"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Calendar, Clock, Check, Plus } from "lucide-react";

export type CalendarWorkWeekViewProps = {
  projectId: string;
};

type ShiftDay = {
  dayName: string;
  isWorkDay: boolean;
  hoursPerDay: number;
  start: string;
  end: string;
};

const DEFAULT_WORK_WEEK: ShiftDay[] = [
  { dayName: "Sunday", isWorkDay: true, hoursPerDay: 8, start: "08:00", end: "17:00" },
  { dayName: "Monday", isWorkDay: true, hoursPerDay: 8, start: "08:00", end: "17:00" },
  { dayName: "Tuesday", isWorkDay: true, hoursPerDay: 8, start: "08:00", end: "17:00" },
  { dayName: "Wednesday", isWorkDay: true, hoursPerDay: 8, start: "08:00", end: "17:00" },
  { dayName: "Thursday", isWorkDay: true, hoursPerDay: 8, start: "08:00", end: "17:00" },
  { dayName: "Friday", isWorkDay: true, hoursPerDay: 8, start: "08:00", end: "17:00" },
  { dayName: "Saturday", isWorkDay: false, hoursPerDay: 0, start: "—", end: "—" },
];

export function CalendarWorkWeekView({ projectId: _projectId }: CalendarWorkWeekViewProps) {
  const [subTab, setSubTab] = useState<"normal" | "exceptions">("normal");
  const [schedule, setSchedule] = useState<ShiftDay[]>(DEFAULT_WORK_WEEK);

  const toggleDay = (idx: number) => {
    setSchedule((prev) => {
      const next = [...prev];
      const item = { ...next[idx] };
      item.isWorkDay = !item.isWorkDay;
      item.hoursPerDay = item.isWorkDay ? 8 : 0;
      item.start = item.isWorkDay ? "08:00" : "—";
      item.end = item.isWorkDay ? "17:00" : "—";
      next[idx] = item;
      return next;
    });
  };

  const totalWeeklyHours = schedule.reduce((sum, d) => sum + d.hoursPerDay, 0);

  return (
    <div className="flex h-full flex-col bg-background font-sans select-none overflow-hidden">
      {/* Calendar Sub-tabs */}
      <div className="flex h-8 shrink-0 items-center justify-between border-b border-border bg-card px-3 text-[11px]">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setSubTab("normal")}
            className={cn(
              "h-6 rounded-[3px] px-2.5 font-medium transition-colors",
              subTab === "normal" ? "bg-primary text-primary-foreground font-semibold shadow-2xs" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <span className="flex items-center gap-1.5"><Clock className="h-3 w-3" /> Normal Working Hours</span>
          </button>
          <button
            type="button"
            onClick={() => setSubTab("exceptions")}
            className={cn(
              "h-6 rounded-[3px] px-2.5 font-medium transition-colors",
              subTab === "exceptions" ? "bg-primary text-primary-foreground font-semibold shadow-2xs" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <span className="flex items-center gap-1.5"><Calendar className="h-3 w-3" /> Extra Work & Off Days</span>
          </button>
        </div>
        <div className="text-[10px] font-mono text-muted-foreground">
          Standard Construction Work Week: {totalWeeklyHours} Hours / 6 Days
        </div>
      </div>

      {subTab === "normal" ? (
        <div className="flex-1 overflow-auto p-6 max-w-3xl mx-auto w-full">
          <div className="mb-4">
            <h2 className="text-sm font-bold text-foreground">Standard Working Shifts</h2>
            <p className="text-xs text-muted-foreground">
              Define the default hours for scheduling calculations, lead/lag forward pass, and resource capacity.
            </p>
          </div>

          <div className="rounded-lg border border-border bg-card divide-y divide-border/60 overflow-hidden shadow-2xs">
            {schedule.map((day, idx) => (
              <div key={day.dayName} className="flex items-center justify-between px-4 py-3 text-xs">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={day.isWorkDay}
                    onChange={() => toggleDay(idx)}
                    className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                  />
                  <div>
                    <span className={cn("font-medium", !day.isWorkDay && "text-muted-foreground line-through")}>
                      {day.dayName}
                    </span>
                    <span className="ml-2 text-[10px] font-mono text-muted-foreground">
                      {day.isWorkDay ? `${day.hoursPerDay} hrs` : "Rest / Off-day"}
                    </span>
                  </div>
                </div>

                {day.isWorkDay ? (
                  <div className="flex items-center gap-2 font-mono text-[11px] text-foreground">
                    <span className="rounded border bg-background px-2 py-1">{day.start}</span>
                    <span className="text-muted-foreground">→</span>
                    <span className="rounded border bg-background px-2 py-1">{day.end}</span>
                  </div>
                ) : (
                  <span className="text-[11px] font-mono text-muted-foreground italic">Non-working Day</span>
                )}
              </div>
            ))}
          </div>

          <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground rounded-md bg-muted/30 p-3 border border-border/40">
            <div className="flex items-center gap-2">
              <Check className="h-4 w-4 text-emerald-600" />
              <span>Forward-pass CPM scheduling automatically skips Saturdays.</span>
            </div>
            <span className="font-mono text-[10px] font-bold text-foreground">Bikram Sambat Standard</span>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-auto p-6 max-w-3xl mx-auto w-full">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-bold text-foreground">Holiday & Exception Days</h2>
              <p className="text-xs text-muted-foreground">
                Specific dates that deviate from normal hours (e.g. monsoon halts, festival holidays).
              </p>
            </div>
            <button
              type="button"
              className="flex items-center gap-1 rounded bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground shadow-2xs hover:bg-primary/90"
            >
              <Plus className="h-3 w-3" /> Add Exception Date
            </button>
          </div>

          <div className="rounded-lg border border-border bg-card p-4 space-y-3 shadow-2xs text-xs">
            <div className="flex items-center justify-between p-2 rounded bg-muted/30 border border-border/40">
              <div>
                <span className="font-semibold text-foreground">Dashain Festival Recess</span>
                <p className="text-[10px] font-mono text-muted-foreground">Kartik 4 – Kartik 9 (All crews off)</p>
              </div>
              <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-600 border border-amber-500/30 text-[10px] font-bold">
                Project-Wide Off
              </span>
            </div>

            <div className="flex items-center justify-between p-2 rounded bg-muted/30 border border-border/40">
              <div>
                <span className="font-semibold text-foreground">Foundation Concrete Night Shift</span>
                <p className="text-[10px] font-mono text-muted-foreground">Bhadra 18 (24-hour continuous pour)</p>
              </div>
              <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 border border-emerald-500/30 text-[10px] font-bold">
                24h Overtime
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
