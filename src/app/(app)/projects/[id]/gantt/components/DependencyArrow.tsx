"use client";

const TYPE_LABELS: Record<string, string> = {
  FS: "Finish-to-Start",
  SS: "Start-to-Start",
  FF: "Finish-to-Finish",
  SF: "Start-to-Finish",
};

const ARROW_COLOR = "hsl(210 80% 55%)";

export function DependencyArrow({
  x1, y1, x2, y2, type = "FS", offset = 0,
}: {
  x1: number; y1: number; x2: number; y2: number;
  type?: string; offset?: number;
}) {
  const arrowSize = 5;

  // Compute orthogonal (right-angle) path segments
  let path = "";
  const midY = (y1 + y2) / 2;

  if (type === "SS") {
    // Start-to-Start: left-to-left
    const minX = Math.min(x1, x2) - 12;
    path = `M ${x1} ${y1} L ${minX} ${y1} L ${minX} ${y2} L ${x2} ${y2}`;
  } else if (type === "FF") {
    // Finish-to-Finish: right-to-right
    const maxX = Math.max(x1, x2) + 12;
    path = `M ${x1} ${y1} L ${maxX} ${y1} L ${maxX} ${y2} L ${x2} ${y2}`;
  } else if (type === "SF") {
    // Start-to-Finish: left-to-right
    if (x2 + 10 <= x1 - 10) {
      const midX = (x1 + x2) / 2;
      path = `M ${x1} ${y1} L ${midX} ${y1} L ${midX} ${y2} L ${x2} ${y2}`;
    } else {
      path = `M ${x1} ${y1} L ${x1 - 10} ${y1} L ${x1 - 10} ${midY} L ${x2 + 10} ${midY} L ${x2 + 10} ${y2} L ${x2} ${y2}`;
    }
  } else {
    // Default/Finish-to-Start (FS): right-to-left
    if (x2 >= x1 + 20) {
      const midX = (x1 + x2) / 2;
      path = `M ${x1} ${y1} L ${midX} ${y1} L ${midX} ${y2} L ${x2} ${y2}`;
    } else {
      path = `M ${x1} ${y1} L ${x1 + 10} ${y1} L ${x1 + 10} ${midY} L ${x2 - 10} ${midY} L ${x2 - 10} ${y2} L ${x2} ${y2}`;
    }
  }

  // Arrow points right if entering left of successor bar (FS/SS), points left if entering right (FF/SF)
  const entersLeft = type === "FS" || type === "SS";
  const arrowPoints = entersLeft
    ? `${x2},${y2} ${x2 - arrowSize},${y2 - arrowSize} ${x2 - arrowSize},${y2 + arrowSize}`
    : `${x2},${y2} ${x2 + arrowSize},${y2 - arrowSize} ${x2 + arrowSize},${y2 + arrowSize}`;

  const tooltip = `${TYPE_LABELS[type] || type}${offset ? ` (offset: ${offset}d)` : ""}`;

  return (
    <g className="group transition-opacity duration-150">
      <path
        d={path}
        fill="none"
        stroke={ARROW_COLOR}
        strokeWidth={1.2}
        className="opacity-70 group-hover:opacity-100 group-hover:stroke-emerald-500 transition-all duration-150"
      >
        <title>{tooltip}</title>
      </path>
      <polygon
        points={arrowPoints}
        fill={ARROW_COLOR}
        className="opacity-75 group-hover:opacity-100 group-hover:fill-emerald-500 transition-all duration-150"
      >
        <title>{tooltip}</title>
      </polygon>
    </g>
  );
}
