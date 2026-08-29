import { describe, it, expect } from "vitest";
import { validateNepalPan, formatPan } from "./pan-vat";

describe("Nepal PAN / VAT Validator & Formatter", () => {
  it("validates 9-digit corporate PAN (starting with 6)", () => {
    const res = validateNepalPan("601234567");
    expect(res.isValid).toBe(true);
    expect(res.cleanPan).toBe("601234567");
    expect(res.formattedPan).toBe("601-234-567");
    expect(res.entityType).toBe("corporate");
  });

  it("validates 9-digit proprietorship PAN (starting with 3)", () => {
    const res = validateNepalPan("301987654");
    expect(res.isValid).toBe(true);
    expect(res.formattedPan).toBe("301-987-654");
    expect(res.entityType).toBe("proprietorship");
  });

  it("strips whitespace, hyphens, and non-digits", () => {
    const res = validateNepalPan(" 601-234-567 ");
    expect(res.isValid).toBe(true);
    expect(res.cleanPan).toBe("601234567");
  });

  it("fails on invalid length", () => {
    const resShort = validateNepalPan("12345");
    expect(resShort.isValid).toBe(false);
    expect(resShort.error).toContain("must be exactly 9 digits");

    const resLong = validateNepalPan("1234567890");
    expect(resLong.isValid).toBe(false);
  });

  it("formatPan helper returns formatted string or fallback", () => {
    expect(formatPan("601234567")).toBe("601-234-567");
    expect(formatPan(null)).toBe("—");
  });
});
