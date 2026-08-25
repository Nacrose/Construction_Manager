"use client";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Cloud, ArrowUpRight, Type, Highlighter, Ruler, MapPin, Trash2, MousePointer,
  Pencil, MessageSquare, Stamp, Square, Undo2, Redo2, CheckCircle2,
} from "lucide-react";

export type MarkupTool = "select" | "cloud" | "arrow" | "text" | "highlight" | "measurement" | "pin" | "freehand" | "callout" | "stamp" | "area" | "staged";

const TOOLS: { tool: MarkupTool; icon: typeof MousePointer; label: string; shortcut?: string }[] = [
  { tool: "select", icon: MousePointer, label: "Select", shortcut: "V" },
  { tool: "cloud", icon: Cloud, label: "Cloud", shortcut: "C" },
  { tool: "arrow", icon: ArrowUpRight, label: "Arrow", shortcut: "A" },
  { tool: "callout", icon: MessageSquare, label: "Callout", shortcut: "L" },
  { tool: "text", icon: Type, label: "Text", shortcut: "T" },
  { tool: "highlight", icon: Highlighter, label: "Highlight", shortcut: "H" },
  { tool: "freehand", icon: Pencil, label: "Pencil", shortcut: "P" },
  { tool: "measurement", icon: Ruler, label: "Distance", shortcut: "M" },
  { tool: "area", icon: Square, label: "Area", shortcut: "U" },
  { tool: "pin", icon: MapPin, label: "Pin", shortcut: "I" },
  { tool: "stamp", icon: Stamp, label: "Stamp", shortcut: "S" },
  { tool: "staged", icon: CheckCircle2, label: "Work Staged", shortcut: "G" },
];

const COLORS = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#3b82f6", "#a855f7", "#ec4899", "#ffffff"];

export function MarkupToolbar({
  activeTool, onToolChange, activeColor, onColorChange, onDeleteSelected, selectedMarkupId,
  onUndo, onRedo, canUndo, canRedo,
}: {
  activeTool: MarkupTool;
  onToolChange: (tool: MarkupTool) => void;
  activeColor: string;
  onColorChange: (color: string) => void;
  onDeleteSelected: () => void;
  selectedMarkupId: string | null;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}) {
  return (
    <div className="flex items-center gap-0.5 bg-card/95 backdrop-blur-md border border-border rounded-lg px-1.5 py-1 shadow-lg flex-wrap">
      {TOOLS.map(({ tool, icon: Icon, label, shortcut }) => (
        <Button
          key={tool}
          size="sm"
          variant={activeTool === tool ? "default" : "ghost"}
          className="h-7 w-7 p-0"
          onClick={() => onToolChange(tool)}
          title={`${label}${shortcut ? ` (${shortcut})` : ""}`}
        >
          <Icon className="h-3.5 w-3.5" />
        </Button>
      ))}

      <div className="w-px h-5 bg-border mx-0.5" />

      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={onUndo} disabled={!canUndo} title="Undo (Ctrl+Z)">
        <Undo2 className="h-3.5 w-3.5" />
      </Button>
      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={onRedo} disabled={!canRedo} title="Redo (Ctrl+Y)">
        <Redo2 className="h-3.5 w-3.5" />
      </Button>

      <div className="w-px h-5 bg-border mx-0.5" />

      {COLORS.map((c) => (
        <button
          key={c}
          onClick={() => onColorChange(c)}
          className={cn(
            "h-3.5 w-3.5 rounded-full border-2 transition-transform shrink-0",
            activeColor === c ? "border-foreground scale-125" : "border-transparent hover:scale-110"
          )}
          style={{ backgroundColor: c }}
          title={c}
        />
      ))}

      {selectedMarkupId && (
        <>
          <div className="w-px h-5 bg-border mx-0.5" />
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={onDeleteSelected} title="Delete selected (Del)">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </>
      )}
    </div>
  );
}
