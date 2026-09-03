import { describe, it, expect } from "vitest";
import { deriveWbsDepth, computeWbsOutline } from "./wbs-tree";

describe("deriveWbsDepth", () => {
  it("maps dot-separated WBS codes to depth", () => {
    expect(deriveWbsDepth("1")).toBe(0);
    expect(deriveWbsDepth("1.1")).toBe(1);
    expect(deriveWbsDepth("1.1.1")).toBe(2);
    expect(deriveWbsDepth("")).toBe(0);
    expect(deriveWbsDepth(null)).toBe(0);
  });
});

describe("computeWbsOutline", () => {
  const items = [
    { id: "a", code: "1" },
    { id: "b", code: "1.1" },
    { id: "c", code: "1.1.1" },
    { id: "d", code: "1.1.2" },
    { id: "e", code: "1.2" },
    { id: "f", code: "2" },
    { id: "g", code: "2.1" },
  ];

  it("drives depth from the code", () => {
    const out = computeWbsOutline(items);
    expect(out.get("a")!.depth).toBe(0);
    expect(out.get("b")!.depth).toBe(1);
    expect(out.get("c")!.depth).toBe(2);
  });

  it("uses outline connectors for deeper levels and nothing for roots", () => {
    const out = computeWbsOutline(items);
    expect(out.get("a")!.prefix).toBe(""); // root
    expect(out.get("b")!.prefix).toBe("├─ "); // last child → actually not last (1.2 follows) → ├─
    expect(out.get("e")!.prefix).toBe("└─ "); // last child of 1 → └─
    expect(out.get("f")!.prefix).toBe(""); // root
  });

  it("carries the vertical trunk through deeper descendants", () => {
    const out = computeWbsOutline(items);
    // 1.1.1 is to the right of 1.1; 1 is not the last root (2 follows) so trunk continues
    expect(out.get("c")!.prefix).toContain("│");
  });
});
