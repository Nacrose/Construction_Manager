"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { Check, ChevronDown } from "lucide-react";

export type PresetOption = {
  id: string;
  name: string;
  /** Optional source/category label, e.g. "Standard" or "Custom" — shown as a small badge after the name. */
  source?: string;
  /** Optional count of ingredients inside the preset. */
  ingredientCount?: number;
};

/**
 * PresetCombobox — searchable preset picker.
 *
 * Replaces the old plain `<select>` dropdowns in the BOQ rate-analysis
 * editor and the analysis-library tab. Behaves like a shadcn Combobox:
 * click the trigger button → a Popover opens with a search input and a
 * filtered list of presets. Keyboard navigable (arrow keys + Enter),
 * filters presets by name as you type.
 *
 * The trigger button shows the currently-selected preset name (or the
 * placeholder if nothing is selected) plus a chevron.
 */
export function PresetCombobox({
  presets,
  selected,
  onSelect,
  placeholder = "Select preset…",
  disabled,
  className,
  popoverWidth = 280,
}: {
  presets: PresetOption[];
  selected: string;
  onSelect: (id: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** Width of the dropdown panel in px. */
  popoverWidth?: number;
}) {
  const [open, setOpen] = useState(false);
  const selectedPreset = presets.find((p) => p.id === selected);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            "flex h-7 items-center justify-between gap-1 rounded border bg-background px-2 text-xs",
            "min-w-0 w-full",
            !selected && "text-muted-foreground",
            disabled && "opacity-50 cursor-not-allowed",
            className,
          )}
        >
          <span className="truncate">
            {selectedPreset ? selectedPreset.name : placeholder}
          </span>
          <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="p-0"
        align="start"
        style={{ width: popoverWidth }}
      >
        <Command>
          <CommandInput
            placeholder="Search presets…"
            className="h-8 text-xs"
          />
          <CommandList>
            <CommandEmpty className="py-4 text-xs">
              No presets match.
            </CommandEmpty>
            <CommandGroup>
              {presets.map((p) => (
                <CommandItem
                  key={p.id}
                  // cmdk searches by `value` — use the preset name so
                  // typing matches the visible label.
                  value={p.name}
                  onSelect={() => {
                    onSelect(p.id);
                    setOpen(false);
                  }}
                  className="text-xs py-1.5"
                >
                  <Check
                    className={cn(
                      "h-3 w-3 mr-2 shrink-0",
                      selected === p.id ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <span className="truncate flex-1">{p.name}</span>
                  {p.source && (
                    <span className="ml-1.5 rounded bg-muted px-1 py-0.5 text-[9px] font-medium text-muted-foreground">
                      {p.source}
                    </span>
                  )}
                  {typeof p.ingredientCount === "number" && (
                    <span className="ml-1.5 text-[9px] text-muted-foreground">
                      ({p.ingredientCount})
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
