import { describe, expect, it } from "vitest";
import { isSafeUrl, safeUrlSchema, sanitizeUrl } from "./safe-url";

describe("isSafeUrl (allowlist)", () => {
  it.each([
    "https://example.com/scan.pdf",
    "http://example.com/a?b=1",
    "/uploads/1234567890-abcdef.png",
    "/projects/1/ipc",
    "#",
    "data:application/pdf;base64,JVBERi0xLjQK",
    "data:image/png;base64,iVBORw0KGgo=",
    "data:image/jpeg;base64,/9j/4AAQ=",
    "data:image/webp;base64,UklGRho=",
    "  https://example.com/trimmed.pdf  ",
  ])("accepts %s", (url) => {
    expect(isSafeUrl(url)).toBe(true);
  });

  it.each([
    // Stored-XSS vectors
    "javascript:alert(1)",
    "JAVASCRIPT:alert(1)",
    "java\tscript:alert(1)",
    "java\nscript:alert(1)",
    " javascript:alert(1)",
    "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==",
    "data:text/html,<script>alert(1)</script>",
    "data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9ImphdmFzY3JpcHQ6YWxlcnQoMSkiLz4=",
    "vbscript:msgbox(1)",
    "file:///etc/passwd",
    "blob:https://example.com/123",
    // Open-redirect-ish / scheme smuggling
    "//evil.com/scan.pdf",
    "\\\\evil.com\\scan.pdf",
    "\\evil.com",
    "https:javascript:alert(1)",
    "data:application/pdf;base64,not!base64!!",
    "",
    "   ",
  ])("rejects %s", (url) => {
    expect(isSafeUrl(url)).toBe(false);
  });

  it("rejects non-strings", () => {
    expect(isSafeUrl(null)).toBe(false);
    expect(isSafeUrl(undefined)).toBe(false);
    // @ts-expect-error runtime robustness
    expect(isSafeUrl(12345)).toBe(false);
  });
});

describe("sanitizeUrl", () => {
  it("trims and returns safe URLs", () => {
    expect(sanitizeUrl("  /uploads/a.png  ")).toBe("/uploads/a.png");
    expect(sanitizeUrl("https://example.com")).toBe("https://example.com");
  });

  it("returns null for unsafe URLs (render sinks fall back to #)", () => {
    expect(sanitizeUrl("javascript:alert(1)")).toBeNull();
    expect(sanitizeUrl("data:text/html;base64,PHNjcmlwdD4=")).toBeNull();
    expect(sanitizeUrl(null)).toBeNull();
    expect(sanitizeUrl(undefined)).toBeNull();
  });
});

describe("safeUrlSchema (tRPC input validation)", () => {
  it("accepts safe URLs", () => {
    expect(safeUrlSchema.parse("https://bank.example.com/bg.pdf")).toBe(
      "https://bank.example.com/bg.pdf",
    );
    expect(safeUrlSchema.parse("data:application/pdf;base64,JVBERi0=")).toBe(
      "data:application/pdf;base64,JVBERi0=",
    );
  });

  it("accepts trailing .optional()/.nullable() composition", () => {
    const optional = safeUrlSchema.optional().nullable();
    expect(optional.parse(undefined)).toBeUndefined();
    expect(optional.parse(null)).toBeNull();
    expect(optional.parse("/uploads/x.png")).toBe("/uploads/x.png");
  });

  it("rejects javascript: payloads at the write boundary", () => {
    expect(() => safeUrlSchema.parse("javascript:alert(1)")).toThrow();
    expect(() => safeUrlSchema.parse("data:text/html,<b>x</b>")).toThrow();
    expect(() => safeUrlSchema.parse("")).toThrow(); // replaces z.string().min(1)
    expect(() => safeUrlSchema.parse("//evil.com")).toThrow();
  });
});
