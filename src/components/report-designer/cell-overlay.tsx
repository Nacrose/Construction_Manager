"use client";

import { useState, useRef, useEffect } from "react";
import { Copy, Trash2, Lock } from "lucide-react";
import { type Cell } from "@/lib/report-tokens";
import { cn } from "@/lib/utils";

const MM_TO_PX = 3.7795;
const SNAP_MM = 1;

export function CellOverlay({
  cell,
  zoom,
  selected,
  isEditing,
  otherCells,
  onSelect,
  onMove,
  onResize,
  onDelete,
  onDuplicate,
  onContextMenu,
  onDoubleClick,
  onEditCommit,
  onEditCancel,
  onGuidesChange,
}: {
  cell: Cell;
  zoom: number;
  selected: boolean;
  isEditing: boolean;
  otherCells: Cell[];
  onSelect: (shiftKey: boolean) => void;
  onMove: (x: number, y: number) => void;
  onResize: (w: number, h: number) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onDoubleClick: () => void;
  onEditCommit: (text: string) => void;
  onEditCancel: () => void;
  onGuidesChange: (guides: { v: number[]; h: number[] }) => void;
}) {
  const dragRef = useRef<{ startX: number; startY: number; cellX: number; cellY: number } | null>(
    null
  );
  const resizeRef = useRef<{ startX: number; startY: number; cellW: number; cellH: number } | null>(
    null
  );
  const [editText, setEditText] = useState("");

  const px = (mm: number) => mm * MM_TO_PX * zoom;
  const fromPx = (pixels: number) => pixels / (MM_TO_PX * zoom);
  const snap = (n: number) => Math.round(n / SNAP_MM) * SNAP_MM;

  // Compute alignment guides: when dragging, check if edges align with other cells
  const computeGuides = (newX: number, newY: number): { v: number[]; h: number[] } => {
    const THRESHOLD = 2; // mm
    const v: number[] = [];
    const h: number[] = [];
    const myEdges = {
      left: newX,
      right: newX + cell.w,
      centerX: newX + cell.w / 2,
      top: newY,
      bottom: newY + cell.h,
      centerY: newY + cell.h / 2,
    };
    for (const other of otherCells) {
      const oLeft = other.x;
      const oRight = other.x + other.w;
      const oCenterX = other.x + other.w / 2;
      const oTop = other.y;
      const oBottom = other.y + other.h;
      const oCenterY = other.y + other.h / 2;
      // Vertical guides (x alignment)
      if (Math.abs(myEdges.left - oLeft) < THRESHOLD) v.push(oLeft);
      if (Math.abs(myEdges.right - oRight) < THRESHOLD) v.push(oRight);
      if (Math.abs(myEdges.centerX - oCenterX) < THRESHOLD) v.push(oCenterX);
      // Horizontal guides (y alignment)
      if (Math.abs(myEdges.top - oTop) < THRESHOLD) h.push(oTop);
      if (Math.abs(myEdges.bottom - oBottom) < THRESHOLD) h.push(oBottom);
      if (Math.abs(myEdges.centerY - oCenterY) < THRESHOLD) h.push(oCenterY);
    }
    return { v: [...new Set(v)], h: [...new Set(h)] };
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (isEditing) return; // don't start drag while editing
    e.stopPropagation();
    e.preventDefault();
    if (cell.locked) {
      onSelect(e.shiftKey);
      return;
    }
    onSelect(e.shiftKey);
    dragRef.current = { startX: e.clientX, startY: e.clientY, cellX: cell.x, cellY: cell.y };

    const handleMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const dx = fromPx(ev.clientX - dragRef.current.startX);
      const dy = fromPx(ev.clientY - dragRef.current.startY);
      let newX = snap(dragRef.current.cellX + dx);
      let newY = snap(dragRef.current.cellY + dy);
      // Smart snap to other cells' edges
      const guides = computeGuides(newX, newY);
      const THRESHOLD = 2;
      // Snap to nearest vertical guide
      if (guides.v.length > 0) {
        const myLeft = newX;
        const myRight = newX + cell.w;
        const myCenterX = newX + cell.w / 2;
        for (const gv of guides.v) {
          if (Math.abs(myLeft - gv) < THRESHOLD) {
            newX = gv;
            break;
          }
          if (Math.abs(myRight - gv) < THRESHOLD) {
            newX = gv - cell.w;
            break;
          }
          if (Math.abs(myCenterX - gv) < THRESHOLD) {
            newX = gv - cell.w / 2;
            break;
          }
        }
      }
      if (guides.h.length > 0) {
        const myTop = newY;
        const myBottom = newY + cell.h;
        const myCenterY = newY + cell.h / 2;
        for (const gh of guides.h) {
          if (Math.abs(myTop - gh) < THRESHOLD) {
            newY = gh;
            break;
          }
          if (Math.abs(myBottom - gh) < THRESHOLD) {
            newY = gh - cell.h;
            break;
          }
          if (Math.abs(myCenterY - gh) < THRESHOLD) {
            newY = gh - cell.h / 2;
            break;
          }
        }
      }
      onMove(Math.max(0, newX), Math.max(0, newY));
      // Recompute guides after snap for display
      onGuidesChange(computeGuides(newX, newY));
    };
    const handleUp = () => {
      dragRef.current = null;
      onGuidesChange({ v: [], h: [] });
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
  };

  const handleResizeStart = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (cell.locked) return;
    resizeRef.current = { startX: e.clientX, startY: e.clientY, cellW: cell.w, cellH: cell.h };

    const handleMove = (ev: MouseEvent) => {
      if (!resizeRef.current) return;
      const dw = fromPx(ev.clientX - resizeRef.current.startX);
      const dh = fromPx(ev.clientY - resizeRef.current.startY);
      onResize(
        Math.max(5, snap(resizeRef.current.cellW + dw)),
        Math.max(3, snap(resizeRef.current.cellH + dh))
      );
    };
    const handleUp = () => {
      resizeRef.current = null;
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
  };

  // Start editing: capture current text
  useEffect(() => {
    if (isEditing && cell.content.type === "text") {
      setEditText((cell.content as any).text || "");
    }
  }, [isEditing, cell.id, cell.content]);

  return (
    <div
      onMouseDown={handleMouseDown}
      onContextMenu={onContextMenu}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onDoubleClick();
      }}
      className={cn(
        "absolute group",
        cell.locked ? "cursor-default" : "cursor-move",
        selected
          ? "ring-2 ring-primary ring-offset-1"
          : "ring-1 ring-transparent hover:ring-blue-400 hover:ring-1",
        cell.locked && "ring-amber-400/50"
      )}
      style={{
        left: px(cell.x),
        top: px(cell.y),
        width: px(cell.w),
        height: px(cell.h),
        zIndex: selected ? 100 : (cell.zIndex ?? 0) + 1,
      }}
    >
      {/* Lock badge */}
      {cell.locked && (
        <div className="absolute -top-4 left-0 text-[9px] text-amber-600 font-medium flex items-center gap-0.5 bg-amber-50 dark:bg-amber-950 px-1 rounded">
          <Lock className="h-2.5 w-2.5" /> locked
        </div>
      )}

      {/* Inline text editor */}
      {isEditing && cell.content.type === "text" ? (
        <textarea
          autoFocus
          value={editText}
          onChange={(e) => setEditText(e.target.value)}
          onBlur={() => onEditCommit(editText)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              onEditCancel();
            }
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              onEditCommit(editText);
            }
          }}
          onFocus={(e) => e.target.select()}
          className="w-full h-full p-0 m-0 border-2 border-primary bg-white/95 outline-none resize-none text-inherit font-inherit"
          style={{
            fontSize: cell.style.fontSize ? `${cell.style.fontSize * zoom}pt` : "10pt",
            fontFamily: cell.style.fontFamily || "inherit",
            fontWeight: cell.style.bold ? 700 : 400,
            fontStyle: cell.style.italic ? "italic" : "normal",
            textAlign: cell.style.align || "left",
            color: cell.style.color || "#111827",
            background: cell.style.bg || "white",
            padding: cell.style.padding ? `${cell.style.padding * zoom}pt` : "2px",
          }}
        />
      ) : null}

      {/* Resize handle */}
      {selected && !cell.locked && (
        <div
          onMouseDown={handleResizeStart}
          className="absolute -bottom-1 -right-1 h-3 w-3 cursor-nwse-resize rounded-sm border border-primary bg-card"
        />
      )}

      {/* Cell label badge */}
      {selected && (
        <div className="absolute -top-5 left-0 flex items-center gap-1 text-[10px] text-primary font-mono bg-card px-1 rounded shadow-sm">
          {cell.type}
          {cell.locked ? " 🔒" : ""} · {cell.w}×{cell.h}mm · ({cell.x},{cell.y})
        </div>
      )}

      {/* Action buttons — only show for single selection */}
      {selected && !cell.locked && (
        <div className="absolute -top-5 right-0 flex items-center gap-0.5">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDuplicate();
            }}
            className="h-5 w-5 rounded border bg-card flex items-center justify-center hover:bg-muted"
            title="Duplicate (Ctrl+D)"
          >
            <Copy className="h-3 w-3" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="h-5 w-5 rounded border bg-card flex items-center justify-center hover:bg-destructive hover:text-destructive-foreground"
            title="Delete (Del)"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      )}
    </div>
  );
}
