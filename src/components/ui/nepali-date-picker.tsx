"use client";

import * as React from "react";
import { Calendar as CalendarIcon, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { NepaliCalendar } from "@/components/ui/nepali-calendar";
import { adToBs, type NepaliDate } from "@/lib/nepali-calendar";

export interface NepaliDatePickerProps {
  value?: Date | string | null;
  onChange?: (date: Date | null, dateString: string) => void;
  placeholder?: string;
  showDual?: boolean;
  useDevanagari?: boolean;
  disabled?: boolean;
  className?: string;
}

export function NepaliDatePicker({
  value,
  onChange,
  placeholder = "Select Nepali date",
  showDual = true,
  useDevanagari = false,
  disabled = false,
  className,
}: NepaliDatePickerProps) {
  const [open, setOpen] = React.useState(false);

  const selectedBs = React.useMemo(() => {
    if (!value) return null;
    try {
      return adToBs(value);
    } catch {
      return null;
    }
  }, [value]);

  const handleDateSelect = (date: Date, bsDate: NepaliDate) => {
    onChange?.(date, date.toISOString().slice(0, 10));
    setOpen(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange?.(null, "");
  };

  const displayText = React.useMemo(() => {
    if (!selectedBs) return null;
    if (useDevanagari) {
      return showDual
        ? `${selectedBs.displayNp} (${selectedBs.adDate.toISOString().slice(0, 10)})`
        : selectedBs.displayNp;
    }
    return showDual
      ? `${selectedBs.display} (${selectedBs.adDate.toISOString().slice(0, 10)})`
      : selectedBs.display;
  }, [selectedBs, useDevanagari, showDual]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn(
            "w-full justify-between text-left font-normal h-9 px-3 text-xs bg-background border-input hover:bg-accent/50",
            !value && "text-muted-foreground",
            className
          )}
        >
          <div className="flex items-center gap-2 truncate">
            <CalendarIcon className="h-3.5 w-3.5 text-primary shrink-0" />
            <span className="truncate">{displayText || placeholder}</span>
          </div>

          {value && !disabled && (
            <span
              role="button"
              onClick={handleClear}
              className="p-0.5 rounded-sm hover:bg-muted text-muted-foreground hover:text-foreground shrink-0 transition-colors"
              title="Clear date"
            >
              <X className="h-3 w-3" />
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0 border-none shadow-xl" align="start">
        <NepaliCalendar
          value={value}
          onChange={handleDateSelect}
          showDualAdDate={showDual}
          useDevanagari={useDevanagari}
        />
      </PopoverContent>
    </Popover>
  );
}
