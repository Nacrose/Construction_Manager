"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, Calculator, Lock, Unlock } from "lucide-react";
import type { BoqItem } from "../types";

type RowActionBarProps = {
  item: BoqItem;
  anchorEl: HTMLElement;
  onClose: () => void;
  canWrite: boolean;
  isLocked: boolean;
  sections: string[];
  onMoveSection: (section: string | undefined) => void;
  onToggleAnalysis: () => void;
  onToggleLock: () => void;
};

const BAR_HEIGHT = 38;

export function RowActionBar({
  item, anchorEl, onClose, canWrite, isLocked, sections,
  onMoveSection, onToggleAnalysis, onToggleLock,
}: RowActionBarProps) {
  const barRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, right: 0, above: true });

  useEffect(() => {
    const updatePosition = () => {
      const rect = anchorEl.getBoundingClientRect();
      const above = rect.top >= BAR_HEIGHT + 10;
      setPos({
        top: above ? rect.top - BAR_HEIGHT - 6 : rect.bottom + 6,
        right: window.innerWidth - rect.right + 4,
        above,
      });
    };
    updatePosition();

    const onScroll = () => onClose();
    const onEscape = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    const onClickOutside = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) onClose();
    };

    window.addEventListener("scroll", onScroll, true);
    document.addEventListener("keydown", onEscape);
    setTimeout(() => document.addEventListener("mousedown", onClickOutside), 0);

    return () => {
      window.removeEventListener("scroll", onScroll, true);
      document.removeEventListener("keydown", onEscape);
      document.removeEventListener("mousedown", onClickOutside);
    };
  }, [anchorEl, onClose]);

  return createPortal(
    <div
      ref={barRef}
      className="fixed z-[36] flex items-center gap-1 rounded-lg border border-border/40 bg-background/95 px-2 py-1 shadow-lg backdrop-blur-md"
      style={{ top: pos.top, right: pos.right }}
    >
      {/* Lock/unlock */}
      {canWrite && !isLocked && (
        <button
          onClick={onToggleLock}
          title={item.locked ? "Unlock item" : "Lock item"}
          className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950"
        >
          {item.locked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
        </button>
      )}

      {/* Move to section */}
      {canWrite && !isLocked && (
        <select
          value=""
          onChange={(e) => {
            if (!e.target.value) return;
            onMoveSection(e.target.value === "__none__" ? undefined : e.target.value);
          }}
          className="h-7 rounded border bg-background px-1.5 text-[10px]"
          title="Move to section"
        >
          <option value="">Move…</option>
          <option value="__none__">— No section —</option>
          {sections.filter((s) => s !== item.section).map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      )}

      {/* Rate analysis */}
      <button
        onClick={onToggleAnalysis}
        className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-muted"
        title="View rate analysis"
      >
        <Calculator className="h-3.5 w-3.5" />
      </button>

      <div className="h-5 w-px bg-border/30 mx-0.5" />

      {/* Close */}
      <button
        onClick={onClose}
        className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-muted"
        title="Close"
      >
        <X className="h-3.5 w-3.5" />
      </button>

      {/* Arrow pointing to row */}
      <div
        className="absolute left-1/2 -translate-x-1/2 w-2 h-2 rotate-45 border-border/40 bg-background"
        style={{
          top: pos.above ? "100%" : "-5px",
          marginTop: pos.above ? -1 : 0,
          borderWidth: pos.above ? "0 1px 1px 0" : "1px 0 0 1px",
        }}
      />
    </div>,
    document.body,
  );
}
