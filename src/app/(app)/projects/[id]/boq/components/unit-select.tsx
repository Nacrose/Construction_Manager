"use client";

import { useState, useRef, useEffect } from "react";
import { UNITS } from "../types";
import { ChevronDown } from "lucide-react";

/**
 * UnitSelect — compact dropdown for selecting a BOQ item's unit.
 *
 * Replaces the free-text InlineEdit for the unit column. The unit is
 * always one of UNITS (cum, sqm, no, m, kg, ton, set, lot, hrs), so a
 * dropdown is more appropriate than free text.
 *
 * Compact design: just the unit text + a tiny chevron. Click to open
 * a dropdown list. No label, no extra chrome.
 */
export function UnitSelect({
  value,
  onSave,
  disabled,
}: {
  value: string;
  onSave: (v: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => !disabled && setOpen(!open)}
        disabled={disabled}
        className="flex items-center gap-0.5 rounded px-1 py-0.5 text-xs hover:bg-muted disabled:opacity-50"
        title="Click to change unit"
      >
        <span className="font-mono">{value}</span>
        <ChevronDown className="h-3 w-3 text-muted-foreground" />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-0.5 min-w-[80px] rounded-md border border-border bg-popover py-0.5 shadow-lg">
          {UNITS.map((u) => (
            <button
              key={u}
              type="button"
              onClick={() => {
                onSave(u);
                setOpen(false);
              }}
              className={`flex w-full items-center px-2 py-1 text-left font-mono text-xs hover:bg-muted ${
                u === value ? "bg-primary/10 font-medium text-primary" : ""
              }`}
            >
              {u}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
