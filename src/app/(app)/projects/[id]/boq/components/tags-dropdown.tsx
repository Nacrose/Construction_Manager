"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown, Check, X, Plus } from "lucide-react";
import { TAG_COLORS } from "../types";

/**
 * TagsDropdown — multi-select dropdown for BOQ item tags.
 *
 * Replaces the old TagsCell which had inline add/remove. This version
 * uses a dropdown popover with checkboxes for each tag, plus a text
 * input to add new tags. Much more compact and intuitive.
 *
 * Features:
 * - Click the tag summary (or "Add tags") to open the dropdown
 * - Checkboxes to toggle existing tags on/off
 * - Text input at the bottom to add a new tag (Enter to create)
 * - Tags display as colored pills below the trigger
 * - Read-only mode (canWrite=false) shows tags without the dropdown
 */
export function TagsDropdown({
  tags,
  canWrite,
  onSave,
}: {
  tags: string | null;
  canWrite: boolean;
  onSave: (tags: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [newTag, setNewTag] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const parsed: string[] = (() => {
    if (!tags) return [];
    try { return JSON.parse(tags) as string[]; } catch { return []; }
  })();

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setNewTag("");
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  useEffect(() => {
    if (open && inputRef.current) {
      // Don't auto-focus the input — let user click checkboxes first
      // Only focus if there are no existing tags
      if (parsed.length === 0) inputRef.current.focus();
    }
  }, [open, parsed.length]);

  function toggleTag(tag: string) {
    const lower = tag.toLowerCase();
    if (parsed.includes(lower)) {
      onSave(parsed.filter((t) => t !== lower));
    } else {
      onSave([...parsed, lower]);
    }
  }

  function addTag() {
    const t = newTag.trim().toLowerCase();
    if (!t || parsed.includes(t)) {
      setNewTag("");
      return;
    }
    onSave([...parsed, t]);
    setNewTag("");
  }

  function removeTag(tag: string) {
    onSave(parsed.filter((t) => t !== tag));
  }

  return (
    <div ref={ref} className="relative">
      {/* Trigger: tag pills + dropdown button */}
      <div className="flex flex-wrap items-center gap-0.5">
        {parsed.slice(0, 3).map((tag, i) => (
          <span
            key={tag}
            className={`inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] font-medium ${TAG_COLORS[i % TAG_COLORS.length]}`}
          >
            {tag}
            {canWrite && (
              <button
                onClick={(e) => { e.stopPropagation(); removeTag(tag); }}
                className="hover:opacity-70"
                aria-label={`Remove ${tag}`}
              >
                <X className="h-2.5 w-2.5" />
              </button>
            )}
          </span>
        ))}
        {parsed.length > 3 && (
          <span className="text-[10px] text-muted-foreground">+{parsed.length - 3}</span>
        )}
        {canWrite && (
          <button
            type="button"
            onClick={() => setOpen(!open)}
            className="flex items-center gap-0.5 rounded border border-dashed border-muted-foreground/30 px-1 py-0.5 text-[10px] text-muted-foreground hover:bg-muted"
            title="Manage tags"
          >
            {parsed.length === 0 ? (
              <>
                <Plus className="h-2.5 w-2.5" /> tags
              </>
            ) : (
              <ChevronDown className="h-2.5 w-2.5" />
            )}
          </button>
        )}
      </div>

      {/* Dropdown */}
      {open && canWrite && (
        <div className="absolute left-0 top-full z-50 mt-0.5 w-44 rounded-md border border-border bg-popover shadow-lg">
          {/* Existing tags with checkboxes */}
          {parsed.length > 0 && (
            <div className="max-h-32 overflow-y-auto py-0.5">
              {parsed.map((tag, i) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleTag(tag)}
                  className="flex w-full items-center gap-1.5 px-2 py-1 text-left text-xs hover:bg-muted"
                >
                  <span className={`h-2 w-2 rounded-full ${TAG_COLORS[i % TAG_COLORS.length].split(" ")[0]}`} />
                  <span className="flex-1">{tag}</span>
                  <Check className="h-3 w-3 text-primary" />
                </button>
              ))}
            </div>
          )}

          {/* Add new tag */}
          <div className="border-t border-border/60 p-1.5">
            <div className="flex items-center gap-1">
              <input
                ref={inputRef}
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); addTag(); }
                  if (e.key === "Escape") { setOpen(false); setNewTag(""); }
                }}
                placeholder="Add tag…"
                className="flex-1 rounded border bg-background px-1.5 py-0.5 text-xs"
              />
              <button
                type="button"
                onClick={addTag}
                disabled={!newTag.trim()}
                className="flex h-5 w-5 items-center justify-center rounded bg-primary text-white disabled:opacity-30"
                title="Add tag"
              >
                <Plus className="h-3 w-3" />
              </button>
            </div>
          </div>

          {/* Hint */}
          {parsed.length === 0 && (
            <div className="px-2 py-1 text-[10px] text-muted-foreground">
              Type a tag name and press Enter
            </div>
          )}
        </div>
      )}
    </div>
  );
}
