import { describe, it, expect } from "vitest";
import { parseKeyTerms, deriveBoqKeyline, segmentDescription } from "./boq-keyline";

describe("parseKeyTerms", () => {
  it("parses a stored JSON array and trims/empties", () => {
    expect(parseKeyTerms(JSON.stringify([" clearance", "grubbing ", "", "sealed"]))).toEqual([
      "clearance",
      "grubbing",
      "sealed",
    ]);
  });
  it("falls back to a comma-separated string", () => {
    expect(parseKeyTerms("clearance, grubbing,sealed")).toEqual(["clearance", "grubbing", "sealed"]);
  });
  it("de-duplicates case-insensitively, keeping first casing", () => {
    expect(parseKeyTerms(JSON.stringify(["clearance", "CLEARANCE", "Grubbing"]))).toEqual([
      "clearance",
      "Grubbing",
    ]);
  });
  it("handles empty/null", () => {
    expect(parseKeyTerms(null)).toEqual([]);
    expect(parseKeyTerms("")).toEqual([]);
    expect(parseKeyTerms(JSON.stringify([]))).toEqual([]);
  });
});

describe("deriveBoqKeyline", () => {
  it("joins key terms with the middot separator", () => {
    expect(deriveBoqKeyline(JSON.stringify(["clearance", "grubbing"]), "Site clearance and grubbing")).toBe(
      "clearance · grubbing"
    );
  });
  it("falls back to a word-boundary-truncated description", () => {
    const long = "Roadway excavation in ordinary soil including haul to designated spoil area";
    const out = deriveBoqKeyline(null, long);
    expect(out.length).toBeLessThanOrEqual(49);
    expect(out.endsWith("…")).toBe(true);
  });
  it("returns the full description when short and no key terms", () => {
    expect(deriveBoqKeyline(null, "short")).toBe("short");
  });
  it("returns an em dash for empty", () => {
    expect(deriveBoqKeyline(null, "")).toBe("—");
  });
});

describe("segmentDescription", () => {
  it("highlights key terms (case-insensitive) and keeps the rest plain", () => {
    const segs = segmentDescription("Site clearance and grubbing", JSON.stringify(["clearance", "grubbing"]));
    expect(segs).toEqual([
      { text: "Site ", highlighted: false },
      { text: "clearance", highlighted: true },
      { text: " and ", highlighted: false },
      { text: "grubbing", highlighted: true },
    ]);
  });
  it("returns one plain segment when there are no key terms", () => {
    expect(segmentDescription("plain text", null)).toEqual([{ text: "plain text", highlighted: false }]);
  });
  it("handles a missing term gracefully", () => {
    const segs = segmentDescription("nothing here", JSON.stringify(["missing"]));
    expect(segs).toEqual([{ text: "nothing here", highlighted: false }]);
  });
});
