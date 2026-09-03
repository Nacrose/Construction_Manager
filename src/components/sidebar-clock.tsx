"use client";

import { useEffect, useState } from "react";
import { Calendar as CalendarIcon, Clock } from "lucide-react";
import { getCurrentBsDate } from "@/lib/nepali-calendar";
import { NepaliCalendar } from "@/components/ui/nepali-calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/** Compact time + BS-date strip for the sidebar footer. */
export function SidebarClock() {
  const [timeStr, setTimeStr] = useState("");
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [bsDate] = useState(() => getCurrentBsDate());

  useEffect(() => {
    const updateTime = () => {
      setTimeStr(
        new Date().toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" })
      );
    };
    updateTime();
    const i = setInterval(updateTime, 1000);
    return () => clearInterval(i);
  }, []);

  return (
    <div className="border-t border-sidebar-border px-2 pb-2 pt-2 flex items-center justify-between gap-2">
      <span className="flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground">
        <Clock className="h-3 w-3" />
        <span className="font-matrix tabular-nums">{timeStr}</span>
      </span>
      <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex items-center gap-1.5 px-2 py-0.5 rounded border border-border bg-card hover:bg-info/10 text-primary text-[10px] font-semibold transition-all cursor-pointer font-mono"
            title="Bikram Sambat Nepali Calendar"
          >
            <CalendarIcon className="h-3 w-3" />
            <span className="font-matrix">{bsDate.displayNp}</span>
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0 border border-border shadow-2xl z-50 bg-card" align="end">
          <NepaliCalendar value={new Date()} showDualAdDate={true} useDevanagari={true} />
        </PopoverContent>
      </Popover>
    </div>
  );
}
