"use client";

import { useMemo, useState, useRef } from "react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import {
  Share2, AlertCircle, CheckCircle2, ZoomIn, ZoomOut, RotateCcw,
  Clock, Flag
} from "lucide-react";
import type { Task } from "../types";
import { getDeps } from "../utils";

export type NetworkPertViewProps = {
  tasks: Task[];
  criticalTaskIds?: Set<string>;
  floatMap?: Map<string, number>;
  selectedTaskId?: string | null;
  onSelectTask?: (taskId: string) => void;
};

type NodePosition = {
  task: Task;
  x: number;
  y: number;
  tier: number;
  row: number;
};

type DependencyLink = {
  id: string;
  fromId: string;
  toId: string;
  type: string;
  offset: number;
  isCritical: boolean;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

const NODE_WIDTH = 210;
const NODE_HEIGHT = 86;
const COL_GAP = 70;
const ROW_GAP = 26;
const PADDING_X = 48;
const PADDING_Y = 48;

export function NetworkPertView({
  tasks,
  criticalTaskIds = new Set(),
  floatMap = new Map(),
  selectedTaskId,
  onSelectTask,
}: NetworkPertViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState<"all" | "critical">("all");
  const [nodeType, setNodeType] = useState<"leaf" | "all">("all");
  const [zoomScale, setZoomScale] = useState<number>(1);
  const [hoveredTaskId, setHoveredTaskId] = useState<string | null>(null);

  // 1. Filter tasks according to options
  const displayTasks = useMemo(() => {
    let list = tasks;
    if (nodeType === "leaf") {
      const parentIds = new Set(tasks.map((t) => t.parentId).filter(Boolean));
      list = list.filter((t) => !parentIds.has(t.id));
    }
    if (filter === "critical") {
      list = list.filter((t) => criticalTaskIds.has(t.id));
    }
    return list;
  }, [tasks, nodeType, filter, criticalTaskIds]);

  // 2. Build DAG & Topological Tiering
  const { nodePositions, links, canvasWidth, canvasHeight } = useMemo(() => {
    const taskMap = new Map<string, Task>(displayTasks.map((t) => [t.id, t]));
    const predMap = new Map<string, string[]>();
    const succMap = new Map<string, string[]>();

    for (const t of displayTasks) {
      const deps = getDeps(t);
      const validPreds = deps.map((d) => d.taskId).filter((pid) => taskMap.has(pid));
      predMap.set(t.id, validPreds);
      for (const pid of validPreds) {
        if (!succMap.has(pid)) succMap.set(pid, []);
        succMap.get(pid)!.push(t.id);
      }
    }

    // Topological tier assignment (level = max(pred.level) + 1)
    const tiers = new Map<string, number>();
    for (const t of displayTasks) {
      if ((predMap.get(t.id) || []).length === 0) {
        tiers.set(t.id, 0);
      }
    }

    // Iterate up to N times to resolve tiers without hanging on circular refs
    const maxPasses = Math.min(displayTasks.length + 2, 40);
    for (let pass = 0; pass < maxPasses; pass++) {
      let changed = false;
      for (const t of displayTasks) {
        const preds = predMap.get(t.id) || [];
        if (preds.length === 0) {
          if (!tiers.has(t.id)) {
            tiers.set(t.id, 0);
            changed = true;
          }
        } else {
          let maxPredTier = 0;
          for (const pid of preds) {
            maxPredTier = Math.max(maxPredTier, tiers.get(pid) ?? 0);
          }
          const nextTier = maxPredTier + 1;
          if (tiers.get(t.id) !== nextTier) {
            tiers.set(t.id, nextTier);
            changed = true;
          }
        }
      }
      if (!changed) break;
    }

    // Group tasks by tier
    const tierGroups = new Map<number, Task[]>();
    let maxTier = 0;
    for (const t of displayTasks) {
      const tr = tiers.get(t.id) ?? 0;
      maxTier = Math.max(maxTier, tr);
      if (!tierGroups.has(tr)) tierGroups.set(tr, []);
      tierGroups.get(tr)!.push(t);
    }

    // Calculate layout coordinates
    const positions = new Map<string, NodePosition>();
    let maxRows = 1;

    for (let col = 0; col <= maxTier; col++) {
      const colTasks = tierGroups.get(col) || [];
      maxRows = Math.max(maxRows, colTasks.length);
      colTasks.forEach((task, row) => {
        const x = PADDING_X + col * (NODE_WIDTH + COL_GAP);
        const y = PADDING_Y + row * (NODE_HEIGHT + ROW_GAP);
        positions.set(task.id, { task, x, y, tier: col, row });
      });
    }

    // Compute SVG link connections
    const depLinks: DependencyLink[] = [];
    for (const t of displayTasks) {
      const toPos = positions.get(t.id);
      if (!toPos) continue;

      const deps = getDeps(t);
      for (const d of deps) {
        const fromPos = positions.get(d.taskId);
        if (!fromPos) continue;

        const isCrit = criticalTaskIds.has(d.taskId) && criticalTaskIds.has(t.id);
        const x1 = fromPos.x + NODE_WIDTH;
        const y1 = fromPos.y + NODE_HEIGHT / 2;
        const x2 = toPos.x;
        const y2 = toPos.y + NODE_HEIGHT / 2;

        depLinks.push({
          id: `${d.taskId}->${t.id}`,
          fromId: d.taskId,
          toId: t.id,
          type: d.type,
          offset: d.offset,
          isCritical: isCrit,
          x1,
          y1,
          x2,
          y2,
        });
      }
    }

    const cWidth = Math.max(1200, PADDING_X * 2 + (maxTier + 1) * (NODE_WIDTH + COL_GAP));
    const cHeight = Math.max(700, PADDING_Y * 2 + maxRows * (NODE_HEIGHT + ROW_GAP));

    return {
      nodePositions: positions,
      links: depLinks,
      canvasWidth: cWidth,
      canvasHeight: cHeight,
    };
  }, [displayTasks, criticalTaskIds]);

  const handleZoomIn = () => setZoomScale((prev) => Math.min(2.0, Number((prev + 0.15).toFixed(2))));
  const handleZoomOut = () => setZoomScale((prev) => Math.max(0.4, Number((prev - 0.15).toFixed(2))));
  const handleResetZoom = () => setZoomScale(1);

  return (
    <div className="flex h-full flex-col bg-background font-sans select-none overflow-hidden">
      {/* Network View Top Toolbar */}
      <div className="flex h-8 shrink-0 items-center justify-between border-b border-border bg-card px-3 text-[11px]">
        <div className="flex items-center gap-2.5">
          <span className="flex items-center gap-1.5 font-bold text-foreground">
            <Share2 className="h-3.5 w-3.5 text-emerald-600" /> Network Logic Flow (PERT / PDM)
          </span>

          <div className="h-3.5 w-px bg-border mx-1" />

          {/* Filter: All vs Critical */}
          <div className="flex items-center rounded border border-border bg-muted/40 p-0.5 text-[10px]">
            <button
              type="button"
              onClick={() => setFilter("all")}
              className={cn(
                "px-2 py-0.5 rounded font-medium cursor-pointer transition-colors",
                filter === "all" ? "bg-card text-primary shadow-xs font-bold" : "text-muted-foreground hover:text-foreground"
              )}
            >
              All Activities ({tasks.length})
            </button>
            <button
              type="button"
              onClick={() => setFilter("critical")}
              className={cn(
                "px-2 py-0.5 rounded font-medium cursor-pointer transition-colors",
                filter === "critical" ? "bg-card text-destructive shadow-xs font-bold" : "text-muted-foreground hover:text-foreground"
              )}
            >
              Critical Path ({criticalTaskIds.size})
            </button>
          </div>

          {/* Scope: All vs Leaf Only */}
          <div className="flex items-center rounded border border-border bg-muted/40 p-0.5 text-[10px]">
            <button
              type="button"
              onClick={() => setNodeType("all")}
              className={cn(
                "px-2 py-0.5 rounded font-medium cursor-pointer transition-colors",
                nodeType === "all" ? "bg-card text-primary shadow-xs font-bold" : "text-muted-foreground hover:text-foreground"
              )}
            >
              All Tasks
            </button>
            <button
              type="button"
              onClick={() => setNodeType("leaf")}
              className={cn(
                "px-2 py-0.5 rounded font-medium cursor-pointer transition-colors",
                nodeType === "leaf" ? "bg-card text-primary shadow-xs font-bold" : "text-muted-foreground hover:text-foreground"
              )}
            >
              Leaf Activities Only
            </button>
          </div>
        </div>

        {/* Right side: Legend & Zoom Controls */}
        <div className="flex items-center gap-3">
          {/* Legend */}
          <div className="hidden lg:flex items-center gap-3 text-[10px] font-medium text-muted-foreground">
            <div className="flex items-center gap-1">
              <span className="h-2 w-4 rounded-xs bg-destructive inline-block" />
              <span>Critical Path (0 Slack)</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="h-1.5 w-4 rounded-xs bg-slate-400 inline-block" />
              <span>Dependency Link</span>
            </div>
          </div>

          <div className="h-3.5 w-px bg-border" />

          {/* Zoom Buttons */}
          <div className="flex items-center rounded border border-border bg-card p-0.5 text-[10px]">
            <button
              type="button"
              onClick={handleZoomOut}
              className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer"
              title="Zoom out"
            >
              <ZoomOut className="h-3 w-3" />
            </button>
            <span className="w-9 text-center font-mono font-semibold text-foreground">
              {Math.round(zoomScale * 100)}%
            </span>
            <button
              type="button"
              onClick={handleZoomIn}
              className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer"
              title="Zoom in"
            >
              <ZoomIn className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={handleResetZoom}
              className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer ml-0.5"
              title="Reset Zoom (100%)"
            >
              <RotateCcw className="h-3 w-3" />
            </button>
          </div>
        </div>
      </div>

      {/* Network Canvas Flow Area */}
      <div
        ref={containerRef}
        className="flex-1 overflow-auto bg-[var(--timeline-canvas,#f7f1e8)] relative matrix-scrollbar"
      >
        <div
          style={{
            width: `${canvasWidth * zoomScale}px`,
            height: `${canvasHeight * zoomScale}px`,
            transformOrigin: "top left",
          }}
          className="relative"
        >
          <svg
            width={canvasWidth}
            height={canvasHeight}
            style={{
              transform: `scale(${zoomScale})`,
              transformOrigin: "top left",
            }}
            className="absolute inset-0 block"
          >
            {/* SVG Markers for Directional Arrowheads */}
            <defs>
              <marker
                id="pert-arrow-normal"
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#64748b" />
              </marker>
              <marker
                id="pert-arrow-critical"
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#dc2626" />
              </marker>
              <marker
                id="pert-arrow-highlight"
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#2563eb" />
              </marker>
            </defs>

            {/* Background Grid Dots */}
            <pattern id="pert-grid" width="24" height="24" patternUnits="userSpaceOnUse">
              <circle cx="2" cy="2" r="0.8" fill="rgba(116, 105, 94, 0.2)" />
            </pattern>
            <rect width="100%" height="100%" fill="url(#pert-grid)" />

            {/* Dependency Connecting Curves */}
            {links.map((link) => {
              const isHighlighted =
                hoveredTaskId === link.fromId ||
                hoveredTaskId === link.toId ||
                selectedTaskId === link.fromId ||
                selectedTaskId === link.toId;

              // Smooth orthogonal cubic bezier
              const dx = link.x2 - link.x1;
              let pathData = "";

              if (dx > 20) {
                const cp1x = link.x1 + dx * 0.45;
                const cp2x = link.x2 - dx * 0.45;
                pathData = `M ${link.x1} ${link.y1} C ${cp1x} ${link.y1}, ${cp2x} ${link.y2}, ${link.x2} ${link.y2}`;
              } else {
                // Loop around if predecessor is to the right or vertically aligned
                const loopOffset = 36;
                pathData = `M ${link.x1} ${link.y1} C ${link.x1 + loopOffset} ${link.y1}, ${link.x1 + loopOffset} ${(link.y1 + link.y2) / 2}, ${(link.x1 + link.x2) / 2} ${(link.y1 + link.y2) / 2} S ${link.x2 - loopOffset} ${link.y2}, ${link.x2} ${link.y2}`;
              }

              const strokeColor = isHighlighted
                ? "#2563eb"
                : link.isCritical
                ? "#dc2626"
                : "rgba(100, 116, 139, 0.6)";

              const strokeWidth = isHighlighted ? 2.5 : link.isCritical ? 2 : 1.25;

              const markerId = isHighlighted
                ? "url(#pert-arrow-highlight)"
                : link.isCritical
                ? "url(#pert-arrow-critical)"
                : "url(#pert-arrow-normal)";

              return (
                <path
                  key={link.id}
                  d={pathData}
                  fill="none"
                  stroke={strokeColor}
                  strokeWidth={strokeWidth}
                  strokeDasharray={link.type === "SS" ? "4 3" : undefined}
                  markerEnd={markerId}
                  className="transition-all duration-150"
                />
              );
            })}

            {/* Activity Card Nodes */}
            {Array.from(nodePositions.values()).map(({ task, x, y }) => {
              const isCritical = criticalTaskIds.has(task.id);
              const isSelected = selectedTaskId === task.id;
              const isHovered = hoveredTaskId === task.id;
              const floatDays = floatMap.get(task.id) ?? (isCritical ? 0 : 4);
              const isDone = task.progress >= 100;

              return (
                <foreignObject
                  key={`node-${task.id}`}
                  x={x}
                  y={y}
                  width={NODE_WIDTH}
                  height={NODE_HEIGHT}
                  className="overflow-visible"
                >
                  <div
                    onClick={() => onSelectTask?.(task.id)}
                    onMouseEnter={() => setHoveredTaskId(task.id)}
                    onMouseLeave={() => setHoveredTaskId(null)}
                    style={{ width: `${NODE_WIDTH}px`, height: `${NODE_HEIGHT}px` }}
                    className={cn(
                      "flex flex-col justify-between rounded-md border bg-card p-2 text-left cursor-pointer transition-all shadow-xs relative select-none",
                      isSelected
                        ? "border-primary ring-2 ring-primary/40 shadow-md bg-card scale-[1.02] z-20"
                        : isHovered
                        ? "border-primary/80 shadow-sm bg-accent/40 z-10"
                        : isCritical
                        ? "border-destructive/90 bg-card hover:border-destructive"
                        : "border-border hover:border-primary/50"
                    )}
                  >
                    {/* Top Header: Code, Duration, Status */}
                    <div className="flex items-center justify-between border-b border-border/50 pb-1 text-[9.5px]">
                      <span className="font-mono font-bold text-primary truncate max-w-[100px]">
                        {task.code || `WBS-${task.id.slice(0, 4)}`}
                      </span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {task.isMilestone ? (
                          <span className="flex items-center gap-0.5 text-amber-600 font-bold text-[8.5px]">
                            <Flag className="h-2.5 w-2.5" /> MS
                          </span>
                        ) : (
                          <span className="font-mono font-semibold text-foreground text-[9px]">
                            {task.duration}d
                          </span>
                        )}

                        {isDone ? (
                          <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                        ) : isCritical ? (
                          <span className="flex items-center gap-0.5 text-[8.5px] font-bold text-destructive bg-destructive/10 px-1 py-0.2 rounded">
                            <AlertCircle className="h-2.5 w-2.5" /> Crit
                          </span>
                        ) : null}
                      </div>
                    </div>

                    {/* Middle: Activity Title */}
                    <div
                      className="font-semibold text-foreground text-[10.5px] leading-tight line-clamp-2 my-0.5"
                      title={task.name}
                    >
                      {task.name}
                    </div>

                    {/* Bottom Metadata: Start | Slack | Finish */}
                    <div className="flex items-center justify-between text-[8.5px] font-mono text-muted-foreground pt-0.5">
                      <span>{format(new Date(task.startDate), "dd MMM")}</span>
                      <span className={cn("font-medium", isCritical ? "text-destructive font-bold" : "text-muted-foreground")}>
                        {isCritical ? "0d Slack" : `${floatDays}d Float`}
                      </span>
                      <span>{format(new Date(task.endDate), "dd MMM")}</span>
                    </div>

                    {/* Progress Bar Line */}
                    <div className="absolute bottom-0 inset-x-0 h-1 bg-muted rounded-b-md overflow-hidden">
                      <div
                        style={{ width: `${task.progress}%` }}
                        className={cn(
                          "h-full transition-all",
                          isDone ? "bg-emerald-600" : isCritical ? "bg-destructive" : "bg-primary"
                        )}
                      />
                    </div>
                  </div>
                </foreignObject>
              );
            })}
          </svg>
        </div>
      </div>
    </div>
  );
}
