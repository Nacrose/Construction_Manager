"use client";

import { useState } from "react";
import { format } from "date-fns";
import { adToBs } from "@/lib/nepali-calendar";
import { NepaliDatePicker } from "@/components/ui/nepali-date-picker";
import { useUserPreferences } from "@/components/user-preferences-provider";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export function InlineDate({
  value,
  onSave,
  className,
}: {
  value: string;
  onSave: (v: string) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const { getPref } = useUserPreferences();
  const calendarType = getPref<string>("calendarType", "BS");

  const formattedDisplay = (() => {
    if (!value) return null;
    try {
      const d = new Date(value);
      if (calendarType === "BS") {
        const bs = adToBs(d);
        return `${bs.monthName} ${bs.day}`;
      } else if (calendarType === "DUAL") {
        const bs = adToBs(d);
        return `${bs.day} ${bs.monthName.slice(0, 3)} (${format(d, "dd MMM")})`;
      }
      return format(d, "dd MMM");
    } catch {
      return value;
    }
  })();

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`cursor-pointer rounded px-1.5 py-0.5 text-[10px] font-mono hover:bg-muted/80 transition-colors text-left truncate ${
            className ?? ""
          }`}
          title="Click to edit date (Nepali BS & Gregorian AD)"
        >
          {formattedDisplay ? (
            <span>{formattedDisplay}</span>
          ) : (
            <span className="text-muted-foreground/50 italic">Set date</span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0 border-none shadow-2xl z-50" align="start">
        <NepaliDatePicker
          value={value ? new Date(value) : new Date()}
          onChange={(_, dateStr) => {
            if (dateStr && dateStr !== value) {
              onSave(dateStr);
            }
            setOpen(false);
          }}
          showDual={true}
        />
      </PopoverContent>
    </Popover>
  );
}
