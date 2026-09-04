"use client";

export type BarStatus = "not_started" | "on_track" | "ahead" | "lagging" | "complete";
export type BarTheme = "omniplan" | "emerald" | "slate" | "amber";
export type BarRadiusMode = "rounded" | "sharp" | "pill";

export function TaskBar({
  x, y, w, h, pct, isMilestone, isCritical, isSummary, isGhost, status, drag, resourceLabel, taskType,
  theme = "omniplan",
  barRadius = "rounded",
  showCriticalHighlight = true,
  showBaselineStripes = true,
}: {
  x: number; y: number; w: number; h: number; pct: number;
  isMilestone: boolean; isCritical: boolean; isSummary: boolean; isGhost: boolean;
  status?: BarStatus;
  drag?: number;
  resourceLabel?: string;
  taskType?: string | null;
  theme?: BarTheme;
  barRadius?: BarRadiusMode;
  showCriticalHighlight?: boolean;
  showBaselineStripes?: boolean;
}) {
  const rxVal = barRadius === "sharp" ? 0 : barRadius === "pill" ? Math.floor(h / 2) : 3;

  // Theme color definitions
  const THEME_COLORS = {
    omniplan: {
      standard: "#2563eb",
      standardStroke: "#1d4ed8",
      critical: "#dc2626",
      criticalStroke: "#b91c1c",
      lagging: "#d97706",
      laggingStroke: "#b45309",
      ahead: "#0284c7",
      aheadStroke: "#0369a1",
      complete: "#10b981",
      completeStroke: "#059669",
      summary: "#2563eb",
      milestone: "#f59e0b",
      milestoneStroke: "#d97706",
    },
    emerald: {
      standard: "#059669",
      standardStroke: "#047857",
      critical: "#dc2626",
      criticalStroke: "#b91c1c",
      lagging: "#f59e0b",
      laggingStroke: "#d97706",
      ahead: "#0d9488",
      aheadStroke: "#0f766e",
      complete: "#16a34a",
      completeStroke: "#15803d",
      summary: "#059669",
      milestone: "#eab308",
      milestoneStroke: "#ca8a04",
    },
    slate: {
      standard: "#475569",
      standardStroke: "#334155",
      critical: "#e11d48",
      criticalStroke: "#be123c",
      lagging: "#ea580c",
      laggingStroke: "#c2410c",
      ahead: "#0d9488",
      aheadStroke: "#0f766e",
      complete: "#059669",
      completeStroke: "#047857",
      summary: "#475569",
      milestone: "#f97316",
      milestoneStroke: "#ea580c",
    },
    amber: {
      standard: "#d97706",
      standardStroke: "#b45309",
      critical: "#b91c1c",
      criticalStroke: "#991b1b",
      lagging: "#ea580c",
      laggingStroke: "#c2410c",
      ahead: "#059669",
      aheadStroke: "#047857",
      complete: "#16a34a",
      completeStroke: "#15803d",
      summary: "#d97706",
      milestone: "#ea580c",
      milestoneStroke: "#c2410c",
    },
  }[theme] || {
    standard: "#2563eb",
    standardStroke: "#1d4ed8",
    critical: "#dc2626",
    criticalStroke: "#b91c1c",
    lagging: "#d97706",
    laggingStroke: "#b45309",
    ahead: "#0284c7",
    aheadStroke: "#0369a1",
    complete: "#10b981",
    completeStroke: "#059669",
    summary: "#2563eb",
    milestone: "#f59e0b",
    milestoneStroke: "#d97706",
  };

  // ── Baseline ghost bar ─────────────────────────────────────────────────────
  if (isGhost) {
    return (
      <g>
        {showBaselineStripes && (
          <defs>
            <pattern id={`base-pat-${x}-${y}`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="6" stroke="hsl(var(--muted-foreground))" strokeWidth="1.5" opacity="0.35" />
            </pattern>
          </defs>
        )}
        <rect
          x={x}
          y={y}
          width={w}
          height={h}
          rx={rxVal}
          ry={rxVal}
          fill={showBaselineStripes ? `url(#base-pat-${x}-${y})` : "none"}
          stroke="hsl(var(--muted-foreground))"
          strokeWidth={1.5}
          strokeDasharray={showBaselineStripes ? undefined : "4 2"}
          opacity={0.6}
        />
      </g>
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
          rx={rxVal}
          ry={rxVal}
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
    const size = Math.max(12, h + 3);
    const cx = x + w / 2;
    const cy = y + h / 2;
    const pts = `${cx},${cy - size / 2} ${cx + size / 2},${cy} ${cx},${cy + size / 2} ${cx - size / 2},${cy}`;
    return (
      <g>
        <polygon
          points={pts}
          fill={THEME_COLORS.milestone}
          stroke={THEME_COLORS.milestoneStroke}
          strokeWidth={1.5}
          className="filter drop-shadow-[0_0_6px_rgba(245,158,11,0.6)]"
        />
        <circle cx={cx} cy={cy} r={2} fill="#ffffff" />
      </g>
    );
  }

  // ── Summary bracket bar (OmniPlan classic bracket) ──────────────────────────
  if (isSummary) {
    const summaryColor = isCritical ? THEME_COLORS.critical : THEME_COLORS.summary;
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
            className="filter drop-shadow-[0_0_4px_rgba(37,99,235,0.4)]"
          />
        )}
        {/* Spine bar */}
        <rect x={x} y={sy} width={w} height={spineH} fill={summaryColor} opacity={0.5} rx={rxVal} />
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
            fill={THEME_COLORS.critical}
            fontWeight="bold"
            className="font-mono"
          >
            drag: {drag}d
          </text>
        )}
      </g>
    );
  }

  // ── Leaf task bar with dynamic theme & corner radius ────────────────────────
  let barFill = THEME_COLORS.standard;
  let barStroke = THEME_COLORS.standardStroke;
  let glowClass = showCriticalHighlight ? "drop-shadow-[0_0_4px_rgba(37,99,235,0.25)]" : "";

  if (isCritical) {
    barFill = THEME_COLORS.critical;
    barStroke = THEME_COLORS.criticalStroke;
    glowClass = showCriticalHighlight ? "drop-shadow-[0_0_8px_rgba(220,38,38,0.7)]" : "";
  } else if (status === "lagging") {
    barFill = THEME_COLORS.lagging;
    barStroke = THEME_COLORS.laggingStroke;
    glowClass = showCriticalHighlight ? "drop-shadow-[0_0_5px_rgba(217,119,6,0.5)]" : "";
  } else if (status === "ahead") {
    barFill = THEME_COLORS.ahead;
    barStroke = THEME_COLORS.aheadStroke;
    glowClass = showCriticalHighlight ? "drop-shadow-[0_0_5px_rgba(2,132,199,0.5)]" : "";
  } else if (status === "not_started" && pct === 0) {
    barFill = "rgba(100, 116, 139, 0.4)";
    barStroke = "rgba(148, 163, 184, 0.4)";
    glowClass = "";
  } else if (pct >= 100 || status === "complete") {
    barFill = THEME_COLORS.complete;
    barStroke = THEME_COLORS.completeStroke;
    glowClass = "";
  }

  return (
    <g className={glowClass}>
      {/* Background track */}
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={rxVal}
        ry={rxVal}
        fill={barFill}
        opacity={0.25}
      />
      {/* Progress fill */}
      {pct > 0 && (
        <rect
          x={x}
          y={y}
          width={(w * Math.min(pct, 100)) / 100}
          height={h}
          rx={rxVal}
          ry={rxVal}
          fill={barFill}
          opacity={0.92}
        />
      )}
      {/* Border */}
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={rxVal}
        ry={rxVal}
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
          fill={THEME_COLORS.critical}
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
