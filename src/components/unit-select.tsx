"use client";

import React, { useState, useEffect } from "react";
import { STANDARD_UNITS, UNIT_CATEGORIES } from "@/lib/constants/units";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface UnitSelectProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  id?: string;
}

export function UnitSelect({
  value,
  onChange,
  className,
  required,
  disabled,
  placeholder = "Select Unit *",
  id,
}: UnitSelectProps) {
  const isKnownStandard = STANDARD_UNITS.some((u) => u.value.toLowerCase() === (value || "").toLowerCase());
  const [isCustomMode, setIsCustomMode] = useState(!isKnownStandard && !!value);
  const [customVal, setCustomVal] = useState(!isKnownStandard ? value : "");

  useEffect(() => {
    const isKnown = STANDARD_UNITS.some((u) => u.value.toLowerCase() === (value || "").toLowerCase());
    if (isKnown) {
      setIsCustomMode(false);
    } else if (value) {
      setIsCustomMode(true);
      setCustomVal(value);
    }
  }, [value]);

  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selected = e.target.value;
    if (selected === "__custom__") {
      setIsCustomMode(true);
      onChange(customVal || "");
    } else {
      setIsCustomMode(false);
      onChange(selected);
    }
  };

  const handleCustomChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setCustomVal(val);
    onChange(val);
  };

  return (
    <div className="space-y-1.5 w-full">
      <select
        id={id}
        value={isCustomMode ? "__custom__" : (value || "")}
        onChange={handleSelectChange}
        disabled={disabled}
        required={required && !isCustomMode}
        className={cn(
          "flex h-8 w-full rounded border border-input bg-background px-2.5 text-xs shadow-2xs font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
      >
        <option value="" disabled>
          {placeholder}
        </option>
        {UNIT_CATEGORIES.map((cat) => {
          const catUnits = STANDARD_UNITS.filter((u) => u.category === cat);
          return (
            <optgroup key={cat} label={`── ${cat} ──`}>
              {catUnits.map((u) => (
                <option key={u.value} value={u.value}>
                  {u.label}
                </option>
              ))}
            </optgroup>
          );
        })}
        <optgroup label="── Custom ──">
          <option value="__custom__">✏️ + Custom Unit...</option>
        </optgroup>
      </select>

      {isCustomMode && (
        <Input
          type="text"
          value={customVal}
          onChange={handleCustomChange}
          placeholder="Type custom unit (e.g. quintal, crate, coil)..."
          className="h-7 text-xs font-mono"
          required={required}
          autoFocus
        />
      )}
    </div>
  );
}
