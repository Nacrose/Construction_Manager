"use client";

import {
  type Cell,
  type CellType,
  getTokensForEntity,
} from "@/lib/report-tokens";
import { Input } from "@/components/ui/input";
import {
  Type,
  Table as TableIcon,
  Gauge,
  Image as ImageIcon,
  Minus,
  PenTool,
  Layers,
} from "lucide-react";
import { useMemo } from "react";

export const BLOCK_TYPES: {
  type: CellType;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}[] = [
  { type: "text", label: "Text", icon: Type, color: "#3b82f6" },
  { type: "table", label: "Table", icon: TableIcon, color: "#f59e0b" },
  { type: "kpi", label: "KPI Card", icon: Gauge, color: "#4a8b57" },
  { type: "image", label: "Image / Logo", icon: ImageIcon, color: "#8b5cf6" },
  { type: "divider", label: "Divider", icon: Minus, color: "#6b7280" },
  { type: "signature", label: "Signature", icon: PenTool, color: "#ec4899" },
];

export function DesignerSidebar({
  entityType,
  selectedCell,
  tokenSearch,
  setTokenSearch,
  onAddCell,
  onInsertToken,
}: {
  entityType: string;
  selectedCell: Cell | null;
  tokenSearch: string;
  setTokenSearch: (val: string) => void;
  onAddCell: (type: CellType) => void;
  onInsertToken: (token: string) => void;
}) {
  const allTokens = useMemo(() => getTokensForEntity(entityType), [entityType]);
  const tokensByGroup = useMemo(() => {
    const q = tokenSearch.toLowerCase().trim();
    const filtered = q
      ? allTokens.filter(
          (t) =>
            t.token.toLowerCase().includes(q) ||
            t.label.toLowerCase().includes(q) ||
            t.group.toLowerCase().includes(q)
        )
      : allTokens;
    const groups: Record<string, typeof allTokens> = {};
    for (const t of filtered) {
      if (!groups[t.group]) groups[t.group] = [];
      groups[t.group].push(t);
    }
    return groups;
  }, [allTokens, tokenSearch]);

  return (
    <aside className="w-56 shrink-0 border-r bg-muted/20 overflow-y-auto">
      <div className="p-3 space-y-4">
        {/* Blocks */}
        <div>
          <h3 className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1">
            <Layers className="h-3 w-3" /> Add Block
          </h3>
          <p className="text-[9px] text-muted-foreground/70 mb-2">
            Click to add, or drag onto the canvas.
          </p>
          <div className="grid grid-cols-2 gap-1.5">
            {BLOCK_TYPES.map((b) => (
              <button
                key={b.type}
                onClick={() => onAddCell(b.type)}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData("application/x-block-type", b.type);
                  e.dataTransfer.effectAllowed = "copy";
                }}
                className="rounded-md border border-border bg-card p-2 text-left hover:border-primary/50 hover:bg-primary/5 transition-colors cursor-grab active:cursor-grabbing"
              >
                <span style={{ color: b.color }}>
                  <b.icon className="h-3.5 w-3.5 mb-1" />
                </span>
                <div className="text-[10px] font-medium">{b.label}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Tokens */}
        <div>
          <h3 className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
            Data Tokens
          </h3>
          <p className="text-[9px] text-muted-foreground/70 mb-2">
            Placeholders replaced with live data when the PDF is generated. Click to insert into
            the selected text cell.
          </p>
          <Input
            value={tokenSearch}
            onChange={(e) => setTokenSearch(e.target.value)}
            placeholder="Search tokens..."
            className="h-7 text-[11px] mb-2"
          />
          {Object.keys(tokensByGroup).length === 0 ? (
            <p className="text-[10px] text-muted-foreground italic">
              No tokens match &quot;{tokenSearch}&quot;.
            </p>
          ) : (
            <div className="space-y-2">
              {Object.entries(tokensByGroup).map(([group, toks]) => (
                <div key={group}>
                  <div className="text-[10px] font-medium text-foreground/70 mb-1 sticky top-0 bg-muted/20 backdrop-blur-sm px-1 -mx-1 py-0.5">
                    {group}
                  </div>
                  <div className="space-y-0.5">
                    {toks.map((t) => (
                      <button
                        key={t.token}
                        onClick={() => onInsertToken(t.token)}
                        disabled={!selectedCell || selectedCell.type !== "text"}
                        className="block w-full text-left rounded px-1.5 py-1 hover:bg-primary/10 hover:text-primary disabled:opacity-40 disabled:cursor-not-allowed transition-colors group"
                        title={t.description || t.label}
                      >
                        <div className="font-mono text-[10px] text-muted-foreground group-hover:text-primary">
                          {`{{${t.token}}}`}
                        </div>
                        <div className="text-[9px] text-muted-foreground/70 group-hover:text-primary/80">
                          {t.label}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
