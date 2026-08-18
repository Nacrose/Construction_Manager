"use client";

export type BarStatus = "not_started" | "on_track" | "ahead" | "lagging" | "complete";

export function TaskBar({ x, y, w, h, pct, isMilestone, isCritical, isSummary, isGhost, status, drag, resourceLabel, taskType }: {
  x: number; y: number; w: number; h: number; pct: number;
  isMilestone: boolean; isCritical: boolean; isSummary: boolean; isGhost: boolean;
  status?: BarStatus;
  drag?: number;
  resourceLabel?: string;
  taskType?: string | null;
}) {
  if (isGhost) {
    return (
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={3}
        ry={3}
        fill="none"
        stroke="hsl(var(--muted-foreground))"
        strokeWidth={1.5}
        strokeDasharray="4 2"
        opacity={0.4}
      />
    );
  }

  // ── Geotechnical / Risk Buffer Bar (Hatched Orange Reserve) ─────────────────
  if (taskType === "buffer") {
    return (
      <g className="drop-shadow-[0_0_6px_rgba(245,158,11,0.5)]">
        <defs>
          <pattern id={`buf-pat-${x}-${y}`} width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="8" stroke="#f59e0b" strokeWidth="2.5" opacity="0.6" />
          </pattern>
        </defs>
        <rect
          x={x}
          y={y}
          width={w}
          height={h}
          rx={3}
          ry={3}
          fill={`url(#buf-pat-${x}-${y})`}
          stroke="#fbbf24"
          strokeWidth={1.5}
          strokeDasharray="4 2"
        />
        {w > 45 && (
          <text
            x={x + w / 2}
            y={y + h / 2 + 3}
            textAnchor="middle"
            fontSize={7.5}
            fill="#fef08a"
            fontWeight={700}
            className="font-mono select-none tracking-wider"
          >
            ░░ BUFFER ░░
          </text>
        )}
      </g>
    );
  }

  if (isMilestone) {
    const size = 15;
    const cx = x + w / 2;
    const cy = y + h / 2;
    const pts = `${cx},${cy - size / 2} ${cx + size / 2},${cy} ${cx},${cy + size / 2} ${cx - size / 2},${cy}`;
    return (
      <g>
        <polygon
          points={pts}
          fill="#f59e0b"
          stroke="#fbbf24"
          strokeWidth={1.5}
          className="filter drop-shadow-[0_0_6px_rgba(245,158,11,0.6)]"
        />
        <circle cx={cx} cy={cy} r={2} fill="#ffffff" />
      </g>
    );
  }

  // ── Summary bracket bar (Cyan/Emerald Matrix Bracket) ───────────────────────
  if (isSummary) {
    const summaryColor = isCritical ? "#ef4444" : "#06b6d4";
    const spineH = 4;
    const capH = 8;
    const capW = 6;
    const sy = y + Math.floor((h - spineH - capH) / 2);

    return (
      <g>
        {/* Progress fill */}
        {pct > 0 && (
          <rect
            x={x}
            y={sy}
            width={Math.max(capW, (w * Math.min(pct, 100)) / 100)}
            height={spineH}
            fill={summaryColor}
            opacity={0.8}
            className="filter drop-shadow-[0_0_4px_rgba(6,182,212,0.5)]"
          />
        )}
        {/* Spine bar */}
        <rect x={x} y={sy} width={w} height={spineH} fill={summaryColor} opacity={0.5} rx={1} />
        {/* Left end-cap */}
        <polygon
          points={`${x},${sy} ${x + capW},${sy} ${x},${sy + spineH + capH}`}
          fill={summaryColor}
        />
        {/* Right end-cap */}
        <polygon
          points={`${x + w},${sy} ${x + w - capW},${sy} ${x + w},${sy + spineH + capH}`}
          fill={summaryColor}
        />
        {/* Critical drag label */}
        {isCritical && drag !== undefined && drag > 0 && w > 30 && (
          <text
            x={x + w / 2}
            y={sy - 4}
            textAnchor="middle"
            fontSize={8}
            fill="#ef4444"
            fontWeight="bold"
            className="font-mono"
          >
            drag: {drag}d
          </text>
        )}
      </g>
    );
  }

  // ── Leaf task bar (Matrix Emerald & Neon Crimson) ───────────────────────────
  let barFill = "#10b981";
  let barStroke = "#059669";
  let glowClass = "drop-shadow-[0_0_4px_rgba(16,185,129,0.4)]";

  if (isCritical) {
    barFill = "#ef4444";
    barStroke = "#f87171";
    glowClass = "drop-shadow-[0_0_8px_rgba(239,68,68,0.7)]";
  } else if (status === "lagging") {
    barFill = "#f59e0b";
    barStroke = "#fbbf24";
    glowClass = "drop-shadow-[0_0_5px_rgba(245,158,11,0.5)]";
  } else if (status === "ahead") {
    barFill = "#06b6d4";
    barStroke = "#38bdf8";
    glowClass = "drop-shadow-[0_0_5px_rgba(6,182,212,0.5)]";
  } else if (status === "not_started" && pct === 0) {
    barFill = "rgba(100, 116, 139, 0.5)";
    barStroke = "rgba(148, 163, 184, 0.4)";
    glowClass = "";
  } else if (pct >= 100 || status === "complete") {
    barFill = "#059669";
    barStroke = "#10b981";
  }

  return (
    <g className={glowClass}>
      {/* Background track */}
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={3}
        ry={3}
        fill={barFill}
        opacity={0.2}
      />
      {/* Progress fill */}
      {pct > 0 && (
        <rect
          x={x}
          y={y}
          width={(w * Math.min(pct, 100)) / 100}
          height={h}
          rx={3}
          ry={3}
          fill={barFill}
          opacity={0.9}
        />
      )}
      {/* Border */}
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={3}
        ry={3}
        fill="none"
        stroke={barStroke}
        strokeWidth={1.2}
      />
      {/* Critical path drag text */}
      {isCritical && drag !== undefined && drag > 0 && w > 30 && (
        <text
          x={x + w / 2}
          y={y - 4}
          textAnchor="middle"
          fontSize={8}
          fill="#ef4444"
          fontWeight="bold"
          className="font-mono tracking-tight"
        >
          drag: {drag}d
        </text>
      )}
      {/* Resource label & 24/7 Shift pill beside bar */}
      {(resourceLabel || taskType === "24_7_shift") && (
        <text
          x={x + w + 8}
          y={y + h / 2 + 3.5}
          fontSize={8.5}
          fill={taskType === "24_7_shift" ? "#38bdf8" : "rgba(148, 163, 184, 0.9)"}
          fontWeight={600}
          className="font-mono pointer-events-none select-none"
        >
          {taskType === "24_7_shift" ? `[24/7] ${resourceLabel ?? ""}` : resourceLabel}
        </text>
      )}
    </g>
  );
}
