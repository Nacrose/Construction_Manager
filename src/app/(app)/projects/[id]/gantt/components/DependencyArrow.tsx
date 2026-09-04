"use client";

const TYPE_LABELS: Record<string, string> = {
  FS: "Finish-to-Start",
  SS: "Start-to-Start",
  FF: "Finish-to-Finish",
  SF: "Start-to-Finish",
};

// Muted steel-blue, OmniPlan-style dependency colour. Reads on the cream
// paper without competing with the task-bar signals.
const ARROW_COLOR = "#6486a8";
const R = 5; // corner rounding radius (px)

function roundedPath(points: [number, number][], r: number): string {
  if (points.length < 2) return "";
  let d = `M ${points[0][0]} ${points[0][1]}`;
  for (let i = 1; i < points.length - 1; i++) {
    const [x0, y0] = points[i - 1];
    const [x1, y1] = points[i];
    const [x2, y2] = points[i + 1];
    const v1: [number, number] = [Math.sign(x1 - x0), Math.sign(y1 - y0)];
    const v2: [number, number] = [Math.sign(x2 - x1), Math.sign(y2 - y1)];
    const rr = Math.min(r, Math.abs(x1 - x0) / 2, Math.abs(y1 - y0) / 2, 2);
    const p1: [number, number] = [x1 - v1[0] * rr, y1 - v1[1] * rr];
    const p2: [number, number] = [x1 + v2[0] * rr, y1 + v2[1] * rr];
    // avoid degenerate/collinear corners
    if (v1[0] !== 0 && v2[0] !== 0 && v1[0] === v2[0]) {
      d += ` L ${p2[0]} ${p2[1]}`;
    } else if (v1[1] !== 0 && v2[1] !== 0 && v1[1] === v2[1]) {
      d += ` L ${p2[0]} ${p2[1]}`;
    } else {
      d += ` L ${p1[0]} ${p1[1]} Q ${x1} ${y1} ${p2[0]} ${p2[1]}`;
    }
  }
  const last = points[points.length - 1];
  d += ` L ${last[0]} ${last[1]}`;
  return d;
}

export function DependencyArrow({
  x1, y1, x2, y2, type = "FS", offset = 0, lane = 0, dimmed = false,
}: {
  x1: number; y1: number; x2: number; y2: number;
  type?: string; offset?: number; lane?: number; dimmed?: boolean;
}) {
  const arrowSize = 5;
  const midY = (y1 + y2) / 2;

  let points: [number, number][];
  if (type === "SS") {
    const minX = Math.min(x1, x2) - 12 + lane;
    points = [[x1, y1], [minX, y1], [minX, y2], [x2, y2]];
  } else if (type === "FF") {
    const maxX = Math.max(x1, x2) + 12 + lane;
    points = [[x1, y1], [maxX, y1], [maxX, y2], [x2, y2]];
  } else if (type === "SF") {
    if (x2 + 10 <= x1 - 10) {
      const midX = (x1 + x2) / 2 + lane;
      points = [[x1, y1], [midX, y1], [midX, y2], [x2, y2]];
    } else {
      points = [[x1, y1], [x1 - 10 + lane, y1], [x1 - 10 + lane, midY], [x2 + 10 + lane, midY], [x2 + 10 + lane, y2], [x2, y2]];
    }
  } else {
    // FS (default): right edge of predecessor → left edge of successor
    if (x2 >= x1 + 20) {
      const midX = (x1 + x2) / 2 + lane;
      points = [[x1, y1], [midX, y1], [midX, y2], [x2, y2]];
    } else {
      points = [[x1, y1], [x1 + 10 + lane, y1], [x1 + 10 + lane, midY], [x2 - 10 + lane, midY], [x2 - 10 + lane, y2], [x2, y2]];
    }
  }

  const path = roundedPath(points, R);
  const opacity = dimmed ? 0.15 : 0.8;

  const entersLeft = type === "FS" || type === "SS";
  const arrowPoints = entersLeft
    ? `${x2},${y2} ${x2 - arrowSize},${y2 - arrowSize} ${x2 - arrowSize},${y2 + arrowSize}`
    : `${x2},${y2} ${x2 + arrowSize},${y2 - arrowSize} ${x2 + arrowSize},${y2 + arrowSize}`;

  const tooltip = `${TYPE_LABELS[type] || type}${offset ? ` (offset: ${offset}d)` : ""}`;

  return (
    <g className="group">
      <path
        d={path}
        fill="none"
        stroke={ARROW_COLOR}
        strokeWidth={1.4}
        opacity={opacity}
        style={{ transition: "opacity .15s" }}
      >
        <title>{tooltip}</title>
      </path>
      <polygon
        points={arrowPoints}
        fill={ARROW_COLOR}
        opacity={dimmed ? 0.2 : 0.9}
        style={{ transition: "opacity .15s" }}
      >
        <title>{tooltip}</title>
      </polygon>
    </g>
  );
}
