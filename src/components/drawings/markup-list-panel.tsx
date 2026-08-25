"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, Trash2, Cloud, ArrowUpRight, Type, Highlighter, Ruler, MapPin, Pencil, MessageSquare, Stamp, Square, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

const TYPE_ICONS: Record<string, typeof MapPin> = {
  cloud: Cloud, arrow: ArrowUpRight, text: Type, highlight: Highlighter, measurement: Ruler,
  pin: MapPin, freehand: Pencil, callout: MessageSquare, stamp: Stamp, area: Square,
};

const TYPE_LABELS: Record<string, string> = {
  cloud: "Cloud", arrow: "Arrow", text: "Text", highlight: "Highlight", measurement: "Distance",
  pin: "Pin", freehand: "Pencil", callout: "Callout", stamp: "Stamp", area: "Area",
};

export function MarkupListPanel({
  drawingId,
  revisionId,
  selectedMarkupId,
  onSelectMarkup,
  onDeleteMarkup,
  onClose,
}: {
  drawingId: string;
  revisionId: string | undefined;
  selectedMarkupId: string | null;
  onSelectMarkup: (id: string) => void;
  onDeleteMarkup: (id: string) => void;
  onClose: () => void;
}) {
  const [filter, setFilter] = useState("");
  const { data } = trpc.document.listMarkups.useQuery({ drawingId, revisionId });
  const markups = data?.markups ?? [];

  const filtered = markups.filter((m) => {
    if (!filter) return true;
    const f = filter.toLowerCase();
    return (m.type?.toLowerCase().includes(f)) || (m.text?.toLowerCase().includes(f));
  });

  return (
    <div className="w-64 shrink-0 border-l border-border bg-card/60 flex flex-col h-full">
      <div className="p-2 border-b border-border flex items-center justify-between">
        <span className="text-xs font-semibold uppercase text-muted-foreground">Markups ({markups.length})</span>
        <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={onClose}><X className="h-3.5 w-3.5" /></Button>
      </div>
      <div className="p-2">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input placeholder="Filter..." value={filter} onChange={(e) => setFilter(e.target.value)} className="pl-7 h-7 text-xs" />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="p-1.5 space-y-0.5">
          {filtered.length === 0 ? (
            <p className="text-[10px] text-muted-foreground text-center py-4">No markups yet</p>
          ) : filtered.map((m) => {
            const Icon = TYPE_ICONS[m.type] ?? MapPin;
            return (
              <button
                key={m.id}
                onClick={() => onSelectMarkup(m.id)}
                className={cn(
                  "w-full text-left rounded p-1.5 text-xs flex items-center gap-2 transition-colors group",
                  selectedMarkupId === m.id ? "bg-primary/10 border border-primary/30" : "hover:bg-muted/40 border border-transparent"
                )}
              >
                <div className="h-5 w-5 rounded flex items-center justify-center shrink-0" style={{ backgroundColor: m.color }}>
                  <Icon className="h-3 w-3 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1">
                    <span className="font-medium truncate">{TYPE_LABELS[m.type] ?? m.type}</span>
                    {m.text && <span className="text-muted-foreground truncate">— {m.text}</span>}
                  </div>
                  <span className="text-[9px] text-muted-foreground">{format(new Date(m.createdAt), "dd MMM HH:mm")}</span>
                </div>
                <Button
                  size="sm" variant="ghost"
                  className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100 text-destructive shrink-0"
                  onClick={(e) => { e.stopPropagation(); onDeleteMarkup(m.id); }}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
