"use client";

import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { cyberAudio } from "@/lib/cyber-audio";
import { useFXStore } from "@/lib/fx-store";

/**
 * InlineEdit — click-to-edit text/number input.
 *
 * Renders as plain text; clicking switches to an input that auto-saves
 * on blur or Enter, cancels on Escape. Used throughout the BOQ table
 * for in-place editing of code, description, qty, rate, etc.
 *
 * The `wrap` prop controls how long text is displayed when NOT editing:
 * - wrap=false (default): truncate with ellipsis (single line)
 * - wrap=true: wrap to multiple lines within the parent's width
 *
 * This is used by the description column to toggle between collapsed
 * (1 line, truncated) and expanded (full text, wrapped) states.
 */
export function InlineEdit({
  value,
  onSave,
  type = "text",
  disabled,
  className,
  wrap = false,
}: {
  value: string;
  onSave: (v: string) => void;
  type?: string;
  disabled?: boolean;
  className?: string;
  wrap?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  const soundEnabled = useFXStore((s) => s.soundEnabled);
  const keyClicksEnabled = useFXStore((s) => s.keyClicksEnabled);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  function save() {
    setEditing(false);
    if (draft !== value) {
      if (soundEnabled && keyClicksEnabled) {
        cyberAudio.playCellSave(0.3);
      }
      onSave(draft);
    }
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
        className={`h-7 ${className} ${isNumeric ? "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-inner-spin-button]:m-0 [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-outer-spin-button]:m-0" : ""}`}
        disabled={disabled}
      />
    );
  }

  return (
    <span
      onClick={() => { if (!disabled) setEditing(true); }}
      className={`block w-full ${!disabled ? "cursor-text" : ""} rounded px-1 py-0.5 ${!disabled ? "hover:bg-muted" : ""} ${wrap ? "whitespace-normal break-words" : "truncate"} ${className}`}
      title={disabled ? "Locked" : "Click to edit"}
    >
      {value || <span className="text-muted-foreground italic">empty</span>}
    </span>
  );
}
