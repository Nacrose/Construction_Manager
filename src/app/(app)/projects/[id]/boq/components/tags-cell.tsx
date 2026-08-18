"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { TAG_COLORS } from "../types";

/**
 * TagsCell — inline tag editor for BOQ rows.
 *
 * Renders comma-separated tags from a JSON-encoded string (stored in
 * the BoqItem.tags column as '["tag1","tag2"]'). Supports adding tags
 * via a small inline input (Enter to confirm, Escape to cancel) and
 * removing tags via an X button on each pill.
 *
 * Read-only mode (canWrite=false) hides the add/remove UI.
 */
export function TagsCell({
  tags,
  canWrite,
  onSave,
}: {
  tags: string | null;
  canWrite: boolean;
  onSave: (tags: string[]) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [input, setInput] = useState("");

  const parsed: string[] = (() => {
    if (!tags) return [];
    try { return JSON.parse(tags) as string[]; } catch { return []; }
  })();

  function addTag() {
    const t = input.trim().toLowerCase();
    if (!t || parsed.includes(t)) { setInput(""); setAdding(false); return; }
    onSave([...parsed, t]);
    setInput("");
    setAdding(false);
  }

  function removeTag(tag: string) {
    onSave(parsed.filter((t) => t !== tag));
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      {parsed.map((tag, i) => (
        <span
          key={tag}
          className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium ${TAG_COLORS[i % TAG_COLORS.length]}`}
        >
          {tag}
          {canWrite && (
            <button
              onClick={() => removeTag(tag)}
              className="ml-0.5 hover:opacity-70"
              aria-label={`Remove ${tag}`}
            >
              <X className="h-2.5 w-2.5" />
            </button>
          )}
        </span>
      ))}
      {canWrite && !adding && (
        <button
          onClick={() => setAdding(true)}
          className="rounded border border-dashed border-muted-foreground/40 px-1 text-[10px] text-muted-foreground hover:bg-muted"
          title="Add tag"
        >
          <Plus className="inline h-2.5 w-2.5" /> tag
        </button>
      )}
      {canWrite && adding && (
        <input
          autoFocus
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); addTag(); }
            if (e.key === "Escape") { setInput(""); setAdding(false); }
          }}
          onBlur={addTag}
          placeholder="tag name"
          className="w-20 rounded border bg-background px-1 py-0.5 text-[10px]"
        />
      )}
    </div>
  );
}
