/**
 * BOQ keyline + highlight derivation (derived value — ADR-0006 §2).
 *
 * Only `keyTerms` (a curated JSON array, stored on the BoqItem) is data. The
 * collapsed one-line summary and the highlighted segmentation are COMPUTED
 * here and never stored — the same "derived, not duplicated" rule as
 * `derivePaymentStatus` / `formatNpr`. The UI renders from these helpers;
 * no ad-hoc string logic in components.
 */

/** Parse the stored key-terms JSON array (with a comma-string fallback),
 *  trim, drop empties, and de-duplicate case-insensitively (keep first casing). */
export function parseKeyTerms(raw: string | null | undefined): string[] {
  if (!raw) return [];
  let arr: unknown;
  try {
    arr = JSON.parse(raw);
  } catch {
    arr = String(raw).split(",");
  }
  if (!Array.isArray(arr)) return [];
  return arr
    .map((t) => String(t).trim())
    .filter((t) => t.length > 0)
    .reduce<string[]>((acc, t) => {
      if (acc.some((x) => x.toLowerCase() === t.toLowerCase())) return acc;
      return [...acc, t];
    }, []);
}

/** Collapsed one-line summary: the curated key terms joined by " · ".
 *  Falls back to a word-boundary-truncated description (then "—"). */
export function deriveBoqKeyline(keyTerms: string | null | undefined, description: string): string {
  const terms = parseKeyTerms(keyTerms);
  if (terms.length > 0) return terms.join(" · ");
  const d = (description || "").trim();
  if (!d) return "—";
  const MAX = 48;
  if (d.length <= MAX) return d;
  const cut = d.slice(0, MAX);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 0 ? cut.slice(0, lastSpace) : cut) + "…";
}

/** Split a description into plain / highlighted segments based on the key
 *  terms (case-insensitive substring match), so the expanded view can render
 *  the highlights with the blueprint `amber-mark` sweep. */
export function segmentDescription(
  description: string,
  keyTerms: string | null | undefined
): { text: string; highlighted: boolean }[] {
  const src = description || "";
  const terms = parseKeyTerms(keyTerms);
  if (terms.length === 0) return [{ text: src, highlighted: false }];

  const escaped = terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  let re: RegExp;
  try {
    re = new RegExp(`(${escaped.join("|")})`, "gi");
  } catch {
    return [{ text: src, highlighted: false }];
  }

  const segments: { text: string; highlighted: boolean }[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    if (m.index > last) segments.push({ text: src.slice(last, m.index), highlighted: false });
    segments.push({ text: m[0], highlighted: true });
    last = m.index + m[0].length;
    if (m[0].length === 0) re.lastIndex++;
  }
  if (last < src.length) segments.push({ text: src.slice(last), highlighted: false });
  return segments;
}
