"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  adToBs,
  bsToAd,
  getCurrentBsDate,
  getDaysInBsMonth,
  toDevanagariDigits,
  NEPALI_MONTHS,
  NEPALI_WEEKDAYS,
  type NepaliDate,
} from "@/lib/nepali-calendar";

export interface NepaliCalendarProps {
  value?: Date | string | null;
  onChange?: (date: Date, bsDate: NepaliDate) => void;
  minYear?: number;
  maxYear?: number;
  showDualAdDate?: boolean;
  useDevanagari?: boolean;
  className?: string;
}

export function NepaliCalendar({
  value,
  onChange,
  minYear = 2070,
  maxYear = 2095,
  showDualAdDate = true,
  useDevanagari = false,
  className,
}: NepaliCalendarProps) {
  const initialBs = React.useMemo(() => {
    if (value) {
      try {
        return adToBs(value);
      } catch {
        return getCurrentBsDate();
      }
    }
    return getCurrentBsDate();
  }, [value]);

  const [currentYear, setCurrentYear] = React.useState<number>(initialBs.year);
  const [currentMonth, setCurrentMonth] = React.useState<number>(initialBs.month);
  const [devanagariMode, setDevanagariMode] = React.useState<boolean>(useDevanagari);

  // Sync state if external value changes
  React.useEffect(() => {
    if (value) {
      try {
        const bs = adToBs(value);
        setCurrentYear(bs.year);
        setCurrentMonth(bs.month);
      } catch {
        // ignore
      }
    }
  }, [value]);

  const selectedBs = React.useMemo(() => {
    if (!value) return null;
    try {
      return adToBs(value);
    } catch {
      return null;
    }
  }, [value]);

  const todayBs = React.useMemo(() => getCurrentBsDate(), []);

  // Compute first day of the month weekday index (0=Sunday, 6=Saturday)
  const firstDayWeekday = React.useMemo(() => {
    try {
      const firstAd = bsToAd(currentYear, currentMonth, 1);
      return firstAd.getDay();
    } catch {
      return 0;
    }
  }, [currentYear, currentMonth]);

  const daysInMonth = React.useMemo(() => {
    return getDaysInBsMonth(currentYear, currentMonth);
  }, [currentYear, currentMonth]);

  // Navigate months
  const handlePrevMonth = () => {
    if (currentMonth === 1) {
      if (currentYear > minYear) {
        setCurrentYear(currentYear - 1);
        setCurrentMonth(12);
      }
    } else {
      setCurrentMonth(currentMonth - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 12) {
      if (currentYear < maxYear) {
        setCurrentYear(currentYear + 1);
        setCurrentMonth(1);
      }
    } else {
      setCurrentMonth(currentMonth + 1);
    }
  };

  const handleTodayClick = () => {
    setCurrentYear(todayBs.year);
    setCurrentMonth(todayBs.month);
    onChange?.(todayBs.adDate, todayBs);
  };

  const handleDateClick = (day: number) => {
    try {
      const ad = bsToAd(currentYear, currentMonth, day);
      const bs = adToBs(ad);
      onChange?.(ad, bs);
    } catch {
      // ignore
    }
  };

  // Generate Year options
  const years = React.useMemo(() => {
    const arr: number[] = [];
    for (let y = minYear; y <= maxYear; y++) {
      arr.push(y);
    }
    return arr;
  }, [minYear, maxYear]);

  return (
    <div className={cn("p-3 bg-card text-card-foreground rounded-xl border border-border/80 shadow-md w-[320px] select-none", className)}>
      {/* Header Controls */}
      <div className="flex items-center justify-between gap-1 pb-3 mb-2 border-b border-border/60">
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          {/* Month Selector */}
          <select
            value={currentMonth}
            onChange={(e) => setCurrentMonth(Number(e.target.value))}
            className="h-8 px-2 py-1 text-xs font-semibold bg-secondary text-secondary-foreground rounded-md border border-border/80 focus:outline-hidden focus:ring-1 focus:ring-primary cursor-pointer"
          >
            {NEPALI_MONTHS.map((m) => (
              <option key={m.index} value={m.index}>
                {devanagariMode ? m.nameNp : m.name}
              </option>
            ))}
          </select>

          {/* Year Selector */}
          <select
            value={currentYear}
            onChange={(e) => setCurrentYear(Number(e.target.value))}
            className="h-8 px-2 py-1 text-xs font-semibold bg-secondary text-secondary-foreground rounded-md border border-border/80 focus:outline-hidden focus:ring-1 focus:ring-primary cursor-pointer"
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {devanagariMode ? toDevanagariDigits(y) : y}
              </option>
            ))}
          </select>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-0.5 shrink-0">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-xs font-semibold"
            title="Toggle Devanagari / English numerals"
            onClick={() => setDevanagariMode((prev) => !prev)}
          >
            {devanagariMode ? "EN" : "ने"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={handlePrevMonth}
            disabled={currentYear === minYear && currentMonth === 1}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={handleNextMonth}
            disabled={currentYear === maxYear && currentMonth === 12}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Weekday Labels (Sun to Sat) */}
      <div className="grid grid-cols-7 gap-1 text-center mb-1">
        {NEPALI_WEEKDAYS.map((w) => (
          <div
            key={w.index}
            className={cn(
              "text-[11px] font-semibold py-1 rounded",
              w.isWeekend ? "text-red-500 dark:text-red-400 font-bold" : "text-muted-foreground"
            )}
          >
            {devanagariMode ? w.shortNameNp : w.shortName}
          </div>
        ))}
      </div>

      {/* Days Grid */}
      <div className="grid grid-cols-7 gap-1">
        {/* Leading empty cells for month offset */}
        {Array.from({ length: firstDayWeekday }).map((_, idx) => (
          <div key={`empty-${idx}`} className="h-9" />
        ))}

        {/* Days of Month */}
        {Array.from({ length: daysInMonth }).map((_, idx) => {
          const day = idx + 1;
          const isSelected =
            selectedBs?.year === currentYear &&
            selectedBs?.month === currentMonth &&
            selectedBs?.day === day;

          const isToday =
            todayBs.year === currentYear &&
            todayBs.month === currentMonth &&
            todayBs.day === day;

          const weekdayIdx = (firstDayWeekday + idx) % 7;
          const isSaturday = weekdayIdx === 6;

          // Resolve corresponding AD day number for dual subtext
          let adDayNum: number | null = null;
          if (showDualAdDate) {
            try {
              const ad = bsToAd(currentYear, currentMonth, day);
              adDayNum = ad.getDate();
            } catch {
              // ignore
            }
          }

          return (
            <button
              key={`day-${day}`}
              type="button"
              onClick={() => handleDateClick(day)}
              className={cn(
                "h-9 rounded-lg flex flex-col items-center justify-center relative transition-all duration-150 text-xs font-medium cursor-pointer",
                "hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-hidden",
                isSelected
                  ? "bg-primary text-primary-foreground font-bold shadow-xs hover:bg-primary/90"
                  : isToday
                  ? "border border-primary/60 bg-primary/10 text-primary font-bold"
                  : isSaturday
                  ? "text-red-500 dark:text-red-400 font-medium"
                  : "text-foreground"
              )}
            >
              <span className={cn("leading-none", showDualAdDate ? "text-xs" : "text-sm")}>
                {devanagariMode ? toDevanagariDigits(day) : day}
              </span>
              {showDualAdDate && adDayNum !== null && (
                <span
                  className={cn(
                    "text-[9px] leading-tight font-normal opacity-70",
                    isSelected ? "text-primary-foreground/90" : "text-muted-foreground"
                  )}
                >
                  {adDayNum}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Footer / Today Quick Action */}
      <div className="flex items-center justify-between pt-2.5 mt-2 border-t border-border/60 text-xs">
        <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <CalendarIcon className="h-3.5 w-3.5 text-primary" />
          <span>
            {devanagariMode ? "आज: " + todayBs.displayNp : "Today: " + todayBs.display}
          </span>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleTodayClick}
          className="h-6 px-2 text-[11px] rounded-md"
        >
          <Sparkles className="h-3 w-3 mr-1 text-amber-500" />
          {devanagariMode ? "आज" : "Today"}
        </Button>
      </div>
    </div>
  );
}
