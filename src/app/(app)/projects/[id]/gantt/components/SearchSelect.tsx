"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem,
} from "@/components/ui/command";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Check, ChevronDown } from "lucide-react";

export type SearchItem = { value: string; label: string; search: string };

export function SearchSelect({
  items, placeholder, selected, onSelect, disabled, className,
}: {
  items: SearchItem[];
  placeholder: string;
  selected: string;
  onSelect: (value: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const selectedLabel = items.find(i => i.value === selected)?.label ?? "";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          disabled={disabled}
          className={cn(
            "flex h-7 items-center justify-between rounded border bg-background px-2 text-xs min-w-0 w-full",
            !selected && "text-muted-foreground",
            className,
          )}
        >
          <span className="truncate">{selected ? selectedLabel : placeholder}</span>
          <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground ml-1" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0" align="start">
        <Command>
          <CommandInput placeholder={placeholder} className="h-8 text-xs" />
          <CommandList>
            <CommandEmpty className="text-xs py-4">No results.</CommandEmpty>
            <CommandGroup>
              {items.map((item) => (
                <CommandItem
                  key={item.value}
                  value={item.search}
                  onSelect={() => { onSelect(item.value); setOpen(false); }}
                  className="text-xs py-1.5"
                >
                  <Check className={cn("h-3 w-3 mr-2", selected === item.value ? "opacity-100" : "opacity-0")} />
                  {item.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
