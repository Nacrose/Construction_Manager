"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { trpc } from "@/lib/trpc-client";
import { toast } from "sonner";
import type { MarkupTool } from "./markup-toolbar";

interface Markup {
  id: string;
  type: string;
  x: number;
  y: number;
  w: number | null;
  h: number | null;
  x2: number | null;
  y2: number | null;
  rotation: number | null;
  color: string;
  strokeWidth: number | null;
  opacity: number | null;
  text: string | null;
  points: string | null;
  stampType: string | null;
}

const STAMPS: Record<string, { text: string; bg: string; fg: string }> = {
  approved: { text: "APPROVED", bg: "#22c55e", fg: "#ffffff" },
  rejected: { text: "REJECTED", bg: "#ef4444", fg: "#ffffff" },
  revision: { text: "REVISION", bg: "#f97316", fg: "#ffffff" },
  draft: { text: "DRAFT", bg: "#eab308", fg: "#000000" },
  final: { text: "FINAL", bg: "#3b82f6", fg: "#ffffff" },
  caution: { text: "CAUTION", bg: "#ef4444", fg: "#ffffff" },
};

function parsePoints(pts: string | null): { x: number; y: number }[] {
  if (!pts) return [];
  return pts.split(";").map((p) => {
    const [x, y] = p.split(",").map(Number);
    return { x, y };
  });
}

export function MarkupOverlay({
  drawingId,
  revisionId,
  activeTool,
  activeColor,
  onMarkupCreated,
  onMarkupDeleted,
  onSelectionChange,
  onHistoryChange,
  scaleValue,
  scaleUnit,
}: {
  drawingId: string;
  revisionId: string | undefined;
  activeTool: MarkupTool;
  activeColor: string;
  onMarkupCreated: () => void;
  onMarkupDeleted: () => void;
  onSelectionChange: (id: string | null) => void;
  onHistoryChange: (canUndo: boolean, canRedo: boolean) => void;
  scaleValue?: number | null;
  scaleUnit?: string | null;
}) {
  const utils = trpc.useUtils();
  const [markups, setMarkups] = useState<Markup[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [dragCurrent, setDragCurrent] = useState<{ x: number; y: number } | null>(null);
  const [freehandPts, setFreehandPts] = useState<{ x: number; y: number }[]>([]);
  const [undoStack, setUndoStack] = useState<string[]>([]);
  const [redoStack, setRedoStack] = useState<string[]>([]);
  const svgRef = useRef<SVGSVGElement>(null);

  const { data } = trpc.document.listMarkups.useQuery({ drawingId, revisionId });
  useEffect(() => {
    if (data?.markups) setMarkups(data.markups);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.markups]);

  useEffect(() => { onSelectionChange(selectedId); }, [selectedId, onSelectionChange]);
  useEffect(() => { onHistoryChange(undoStack.length > 0, redoStack.length > 0); }, [undoStack, redoStack, onHistoryChange]);

  const getCoords = useCallback((e: React.MouseEvent) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const r = svg.getBoundingClientRect();
    return { x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), y: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)) };
  }, []);

  const addMarkup = trpc.document.addMarkup.useMutation({
    onSuccess: (d) => {
      if (d.markup?.id) setUndoStack((s) => [...s, d.markup.id]);
      setRedoStack([]);
      onMarkupCreated();
      utils.document.listMarkups.invalidate({ drawingId, revisionId });
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMarkupMut = trpc.document.deleteMarkup.useMutation({
    onSuccess: () => { onMarkupDeleted(); setSelectedId(null); utils.document.listMarkups.invalidate({ drawingId, revisionId }); },
    onError: (e) => toast.error(e.message),
  });

  const handleUndo = useCallback(() => {
    setUndoStack((prev) => {
      const next = [...prev];
      const lastId = next.pop();
      if (lastId) { setRedoStack((r) => [...r, lastId]); deleteMarkupMut.mutate({ markupId: lastId }); }
      return next;
    });
  }, [deleteMarkupMut]);

  const handleRedo = useCallback(() => { setRedoStack((p) => p.slice(0, -1)); }, []);

  useEffect(() => {
    (globalThis as any).__markupUndo = handleUndo;
    (globalThis as any).__markupRedo = handleRedo;
    return () => { delete (globalThis as any).__markupUndo; delete (globalThis as any).__markupRedo; };
  }, [handleUndo, handleRedo]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Delete" && selectedId) deleteMarkupMut.mutate({ markupId: selectedId });
      if ((e.metaKey || e.ctrlKey) && e.key === "z") { e.preventDefault(); handleUndo(); }
      if ((e.metaKey || e.ctrlKey) && e.key === "y") { e.preventDefault(); handleRedo(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, deleteMarkupMut, handleUndo, handleRedo]);

  useEffect(() => {
    (globalThis as any).__markupDelete = () => { if (selectedId) deleteMarkupMut.mutate({ markupId: selectedId }); };
    return () => { delete (globalThis as any).__markupDelete; };
  }, [selectedId, deleteMarkupMut]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (activeTool === "select") { setSelectedId(null); return; }
    const c = getCoords(e);

    if (activeTool === "pin") { addMarkup.mutate({ drawingId, revisionId, type: "pin", x: c.x, y: c.y, color: activeColor }); return; }
    if (activeTool === "text") { const t = prompt("Enter text:"); if (t) addMarkup.mutate({ drawingId, revisionId, type: "text", x: c.x, y: c.y, color: activeColor, text: t }); return; }
    if (activeTool === "stamp") { const s = prompt("Stamp (approved/rejected/revision/draft/final/caution):"); if (s && STAMPS[s]) addMarkup.mutate({ drawingId, revisionId, type: "stamp", x: c.x, y: c.y, color: activeColor, stampType: s, w: 0.12, h: 0.04 }); return; }
    if (activeTool === "callout") { const t = prompt("Callout text:"); if (t) { setDragStart(c); setDragCurrent(c); } return; }
    if (activeTool === "freehand") { setFreehandPts([c]); setDragStart(c); return; }

    setDragStart(c);
    setDragCurrent(c);
  }, [activeTool, activeColor, drawingId, revisionId, getCoords, addMarkup]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (activeTool === "freehand" && dragStart) { setFreehandPts((p) => [...p, getCoords(e)]); return; }
    if (dragStart) setDragCurrent(getCoords(e));
  }, [activeTool, dragStart, getCoords]);

  const handleMouseUp = useCallback(() => {
    if (activeTool === "freehand" && freehandPts.length > 1) {
      const pts = freehandPts.map((p) => `${p.x.toFixed(4)},${p.y.toFixed(4)}`).join(";");
      addMarkup.mutate({ drawingId, revisionId, type: "freehand", x: freehandPts[0].x, y: freehandPts[0].y, color: activeColor, points: pts, strokeWidth: 2 });
      setFreehandPts([]); setDragStart(null); setDragCurrent(null); return;
    }
    if (!dragStart || !dragCurrent) return;
    const x = Math.min(dragStart.x, dragCurrent.x), y = Math.min(dragStart.y, dragCurrent.y);
    const w = Math.abs(dragCurrent.x - dragStart.x), h = Math.abs(dragCurrent.y - dragStart.y);
    if (w < 0.005 && h < 0.005) { setDragStart(null); setDragCurrent(null); return; }

    if (activeTool === "cloud" || activeTool === "highlight" || activeTool === "area") {
      addMarkup.mutate({ drawingId, revisionId, type: activeTool, x, y, w, h, color: activeColor });
    } else if (activeTool === "arrow" || activeTool === "measurement") {
      addMarkup.mutate({ drawingId, revisionId, type: activeTool, x: dragStart.x, y: dragStart.y, w: dragCurrent.x - dragStart.x, h: dragCurrent.y - dragStart.y, color: activeColor });
    } else if (activeTool === "callout") {
      const text = prompt("Callout text:");
      if (text) addMarkup.mutate({ drawingId, revisionId, type: "callout", x: dragStart.x, y: dragStart.y, x2: dragCurrent.x, y2: dragCurrent.y, color: activeColor, text });
    }
    setDragStart(null); setDragCurrent(null);
  }, [activeTool, activeColor, drawingId, revisionId, dragStart, dragCurrent, freehandPts, addMarkup]);

  const handleMarkupClick = useCallback((e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (activeTool === "select") setSelectedId(id === selectedId ? null : id);
  }, [activeTool, selectedId]);

  const sw = (m: Markup) => m.strokeWidth ?? 2;
  const op = (m: Markup) => m.opacity ?? 1;

  const renderMarkup = (m: Markup) => {
    const x1 = m.x * 1000, y1 = m.y * 1000;
    const w = (m.w ?? 0) * 1000, h = (m.h ?? 0) * 1000;
    const isSel = m.id === selectedId;

    if (m.type === "cloud") {
      return <g key={m.id} onClick={(e) => handleMarkupClick(e, m.id)} className="cursor-pointer">
        <rect x={x1} y={y1} width={w} height={h} fill={`${m.color}15`} stroke={m.color} strokeWidth={isSel ? 4 : sw(m)} strokeDasharray="8 4" rx={8} opacity={op(m)} />
        {isSel && <rect x={x1 - 3} y={y1 - 3} width={w + 6} height={h + 6} fill="none" stroke={m.color} strokeWidth={1} strokeDasharray="4 2" rx={10} />}
      </g>;
    }
    if (m.type === "highlight") {
      return <g key={m.id} onClick={(e) => handleMarkupClick(e, m.id)} className="cursor-pointer">
        <rect x={x1} y={y1} width={w} height={h} fill={`${m.color}30`} stroke={isSel ? m.color : "none"} strokeWidth={isSel ? 2 : 0} opacity={op(m)} />
      </g>;
    }
    if (m.type === "area") {
      const area = Math.round(w * h * 1000000);
      return <g key={m.id} onClick={(e) => handleMarkupClick(e, m.id)} className="cursor-pointer">
        <rect x={x1} y={y1} width={w} height={h} fill={`${m.color}10`} stroke={m.color} strokeWidth={isSel ? 4 : sw(m)} strokeDasharray="6 3" opacity={op(m)} />
        <rect x={x1 + w / 2 - 25} y={y1 + h / 2 - 8} width={50} height={16} fill={m.color} rx={3} opacity={0.9} />
        <text x={x1 + w / 2} y={y1 + h / 2 + 3} textAnchor="middle" fill="white" fontSize={10} fontWeight="bold">{area}</text>
      </g>;
    }
    if (m.type === "arrow") {
      const x2 = x1 + w, y2 = y1 + h;
      return <g key={m.id} onClick={(e) => handleMarkupClick(e, m.id)} className="cursor-pointer">
        <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={m.color} strokeWidth={isSel ? 4 : sw(m)} markerEnd="url(#arrow)" style={{ color: m.color }} opacity={op(m)} />
        {isSel && <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={m.color} strokeWidth={8} opacity={0.2} />}
      </g>;
    }
    if (m.type === "callout") {
      const cx = (m.x2 ?? m.x) * 1000, cy = (m.y2 ?? m.y) * 1000;
      return <g key={m.id} onClick={(e) => handleMarkupClick(e, m.id)} className="cursor-pointer">
        <line x1={x1} y1={y1} x2={cx} y2={cy} stroke={m.color} strokeWidth={sw(m)} opacity={op(m)} />
        <circle cx={x1} cy={y1} r={4} fill={m.color} />
        <rect x={cx + 4} y={cy - 10} width={(m.text?.length ?? 3) * 7 + 10} height={18} fill={m.color} rx={3} opacity={0.9} />
        <text x={cx + 9} y={cy + 2} fill="white" fontSize={11} fontWeight="bold">{m.text}</text>
      </g>;
    }
    if (m.type === "measurement") {
      const x2 = x1 + w, y2 = y1 + h;
      const dist = Math.round(Math.sqrt(w * w + h * h) * 1000);
      const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
      return <g key={m.id} onClick={(e) => handleMarkupClick(e, m.id)} className="cursor-pointer">
        <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={m.color} strokeWidth={isSel ? 3 : sw(m)} strokeDasharray="6 3" opacity={op(m)} />
        <circle cx={x1} cy={y1} r={4} fill={m.color} /><circle cx={x2} cy={y2} r={4} fill={m.color} />
        <rect x={mx - 22} y={my - 10} width={44} height={16} fill={m.color} rx={3} opacity={0.9} />
        <text x={mx} y={my + 2} textAnchor="middle" fill="white" fontSize={10} fontWeight="bold">{dist}</text>
      </g>;
    }
    if (m.type === "text") {
      return <g key={m.id} onClick={(e) => handleMarkupClick(e, m.id)} className="cursor-pointer">
        {isSel && <rect x={x1 - 4} y={y1 - 14} width={(m.text?.length ?? 5) * 7 + 8} height={20} fill={m.color} opacity={0.15} rx={3} />}
        <text x={x1} y={y1} fill={m.color} fontSize={14} fontWeight="bold" stroke="var(--background)" strokeWidth={3} paintOrder="stroke" opacity={op(m)}>{m.text}</text>
      </g>;
    }
    if (m.type === "pin") {
      return <g key={m.id} onClick={(e) => handleMarkupClick(e, m.id)} className="cursor-pointer">
        <circle cx={x1} cy={y1} r={isSel ? 12 : 8} fill={m.color} opacity={0.3 * op(m)} />
        <circle cx={x1} cy={y1} r={isSel ? 7 : 5} fill={m.color} opacity={op(m)} />
        {isSel && <circle cx={x1} cy={y1} r={14} fill="none" stroke={m.color} strokeWidth={2} strokeDasharray="4 2" />}
      </g>;
    }
    if (m.type === "stamp" && m.stampType) {
      const s = STAMPS[m.stampType] ?? STAMPS.approved;
      return <g key={m.id} onClick={(e) => handleMarkupClick(e, m.id)} className="cursor-pointer">
        <rect x={x1} y={y1} width={w || 120} height={h || 30} fill={s.bg} stroke={isSel ? "white" : s.bg} strokeWidth={isSel ? 3 : 1} rx={4} opacity={op(m) * 0.85} />
        <text x={x1 + (w || 120) / 2} y={y1 + (h || 30) / 2 + 4} textAnchor="middle" fill={s.fg} fontSize={13} fontWeight="bold" letterSpacing={2}>{s.text}</text>
      </g>;
    }
    if (m.type === "freehand") {
      const pts = parsePoints(m.points);
      if (pts.length < 2) return null;
      const d = pts.map((p, i) => `${i === 0 ? "M" : "L"}${(p.x * 1000).toFixed(1)},${(p.y * 1000).toFixed(1)}`).join(" ");
      return <g key={m.id} onClick={(e) => handleMarkupClick(e, m.id)} className="cursor-pointer">
        <path d={d} fill="none" stroke={m.color} strokeWidth={isSel ? 4 : sw(m)} strokeLinecap="round" strokeLinejoin="round" opacity={op(m)} />
      </g>;
    }
    return null;
  };

  const isDragTool = ["cloud", "highlight", "area", "arrow", "measurement", "callout"].includes(activeTool);
  const cursor = activeTool === "select" ? "cursor-default" : "cursor-crosshair";

  return (
    <svg
      ref={svgRef}
      className={`absolute inset-0 w-full h-full z-10 ${cursor}`}
      viewBox="0 0 1000 1000"
      preserveAspectRatio="none"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      style={{ pointerEvents: activeTool === "select" && !selectedId ? "none" : "auto" }}
    >
      <defs>
        <marker id="arrow" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
          <polygon points="0 0, 10 3.5, 0 7" fill="currentColor" />
        </marker>
      </defs>

      {markups.map(renderMarkup)}

      {/* Live freehand preview */}
      {activeTool === "freehand" && freehandPts.length > 1 && (
        <path
          d={freehandPts.map((p, i) => `${i === 0 ? "M" : "L"}${(p.x * 1000).toFixed(1)},${(p.y * 1000).toFixed(1)}`).join(" ")}
          fill="none" stroke={activeColor} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" opacity={0.7}
        />
      )}

      {/* Drag preview */}
      {dragStart && dragCurrent && isDragTool && (
        <>
          {(activeTool === "cloud" || activeTool === "highlight" || activeTool === "area") && (
            <rect
              x={Math.min(dragStart.x, dragCurrent.x) * 1000} y={Math.min(dragStart.y, dragCurrent.y) * 1000}
              width={Math.abs(dragCurrent.x - dragStart.x) * 1000} height={Math.abs(dragCurrent.y - dragStart.y) * 1000}
              fill={activeTool === "highlight" ? `${activeColor}30` : `${activeColor}15`}
              stroke={activeColor} strokeWidth={2} strokeDasharray={activeTool === "cloud" ? "8 4" : "6 3"} rx={activeTool === "cloud" ? 8 : 0}
            />
          )}
          {(activeTool === "arrow" || activeTool === "measurement" || activeTool === "callout") && (
            <line x1={dragStart.x * 1000} y1={dragStart.y * 1000} x2={dragCurrent.x * 1000} y2={dragCurrent.y * 1000} stroke={activeColor} strokeWidth={2.5} strokeDasharray="6 3" />
          )}
        </>
      )}
    </svg>
  );
}
