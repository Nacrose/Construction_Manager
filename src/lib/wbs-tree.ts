/**
 * WBS outline derivation (derived value — ADR-0006 §2).
 *
 * A BOQ item's `code` is a dot-separated WBS number (e.g. "1", "1.1", "1.1.1").
 * The tree DEPTH and the connector-line PREFIX are computed here — never
 * stored. `computeWbsOutline` renders the classic outline glyphs (│ ├ └ ─) so
 * the hierarchy is visible as lines, matching the reference WBS style.
 */

export type WbsOutline = { depth: number; prefix: string };
export type WbsOutlineItem = { id: string; code: string };

/** WBS depth = number of dot-separated segments minus 1 (clamped to 0). */
export function deriveWbsDepth(code: string | null | undefined): number {
  const segs = (code || "").split(".").filter(Boolean);
  return Math.max(0, segs.length - 1);
}

/**
 * Compute { depth, prefix } for each item in a flat, code-ordered list.
 * Prefix is empty for root (depth 0) items and uses the outline connectors
 * (│ / ├ / └ / ─) for deeper items. Assumes codes form a nested tree.
 */
export function computeWbsOutline(items: WbsOutlineItem[]): Map<string, WbsOutline> {
  const nodes = items.map((it) => ({
    id: it.id,
    segs: (it.code || "").split(".").filter(Boolean),
  }));
  const map = new Map<string, WbsOutline>();
  for (let i = 0; i < nodes.length; i++) {
    const cur = nodes[i];
    const depth = Math.max(0, cur.segs.length - 1);
    let prefix = "";
    // Trunk lines for ANCESTOR levels (0..depth-2) that stay open below.
    for (let d = 0; d < depth - 1; d++) {
      const anc = cur.segs.slice(0, d + 1).join(".");
      const open = nodes.slice(i + 1).some((n) => n.segs.slice(0, d + 1).join(".") === anc);
      prefix += open ? "│  " : "   ";
    }
    // Connector at the item's OWN level (only if it is not a root).
    if (depth > 0) {
      const ownAnc = cur.segs.slice(0, depth).join(".");
      const isLast = !nodes
        .slice(i + 1)
        .some((n) => n.segs.slice(0, depth).join(".") === ownAnc && n.segs.length - 1 === depth);
      prefix += isLast ? "└─ " : "├─ ";
    }
    map.set(cur.id, { depth, prefix });
  }
  return map;
}
