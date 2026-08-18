"use client";

import { useState, useEffect, useRef, useCallback, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Plus, Pin, PinOff } from "lucide-react";
import { useUserPreferences } from "@/components/user-preferences-provider";

export type FabAction = {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  destructive?: boolean;
};

type FloatingActionBarProps = {
  actions: FabAction[];
};

const STORAGE_KEY = "cf-fab-mode";

export function FloatingActionBar({ actions }: FloatingActionBarProps) {
  const { getPref, setPref } = useUserPreferences();
  const [mode, setMode] = useState<"sticky" | "auto-hide">(() => {
    const saved = getPref("fabMode", null);
    if (saved === "sticky" || saved === "auto-hide") return saved;
    if (typeof window !== "undefined") {
      const local = localStorage.getItem(STORAGE_KEY);
      if (local === "sticky" || local === "auto-hide") return local;
    }
    return "sticky";
  });
  const [expanded, setExpanded] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toggleMode = useCallback(() => {
    setMode((prev) => {
      const next = prev === "sticky" ? "auto-hide" : "sticky";
      setPref("fabMode", next);
      return next;
    });
  }, [setPref]);

  const handleMouseEnter = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setExpanded(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    timeoutRef.current = setTimeout(() => setExpanded(false), 300);
  }, []);

  const isAutoHide = mode === "auto-hide";
  const showBar = !isAutoHide || expanded;

  return (
    <div
      className="fixed right-6 top-1/2 -translate-y-1/2 z-[35]"
      onMouseEnter={isAutoHide ? handleMouseEnter : undefined}
      onMouseLeave={isAutoHide ? handleMouseLeave : undefined}
    >
      {isAutoHide && !showBar ? (
        <button
          onClick={() => setExpanded(true)}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-white shadow-lg hover:bg-primary/90 transition-all"
          title="Open actions"
        >
          <Plus className="h-5 w-5" />
        </button>
      ) : (
        <div className="flex flex-col items-center gap-1.5 rounded-xl border border-border/40 bg-background/95 px-2 py-2 shadow-lg backdrop-blur-md">
          {actions.map((action, i) => (
            <button
              key={i}
              onClick={action.onClick}
              disabled={action.disabled}
              title={action.label}
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors",
                action.destructive
                  ? "text-destructive hover:bg-destructive/10"
                  : "text-foreground hover:bg-muted",
                action.disabled && "cursor-not-allowed opacity-40",
              )}
            >
              {action.icon}
            </button>
          ))}

          <div className="mt-1 h-px w-6 bg-border/30" />

          <button
            onClick={toggleMode}
            title={isAutoHide ? "Pin (sticky mode)" : "Auto-hide mode"}
            className="flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground hover:bg-muted transition-colors"
          >
            {isAutoHide ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
          </button>
        </div>
      )}
    </div>
  );
}
