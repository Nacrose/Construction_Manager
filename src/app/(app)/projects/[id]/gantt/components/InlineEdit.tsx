"use client";

import { useState, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function InlineEdit({
  value,
  onSave,
  type = "text",
  className,
}: {
  value: string;
  onSave: (v: string) => void;
  type?: string;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  function save() {
    setEditing(false);
    if (draft !== value) onSave(draft);
  }

  if (editing) {
    const isNumeric = type === "number";
    return (
      <Input
        ref={inputRef}
        type={isNumeric ? "text" : type}
        inputMode={isNumeric ? "decimal" : undefined}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") { setDraft(value); setEditing(false); }
        }}
        className={cn(
          "h-7",
          className,
          isNumeric && "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
        )}
      />
    );
  }

  return (
    <span
      onClick={() => setEditing(true)}
      className={cn(
        "inline-block cursor-text rounded px-1 py-0.5 hover:bg-muted",
        className,
      )}
      title={value ? `${value} (Click to edit)` : "Click to edit"}
    >
      {value || <span className="text-muted-foreground italic">empty</span>}
    </span>
  );
}
