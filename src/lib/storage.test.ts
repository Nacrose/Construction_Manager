import { describe, expect, it } from "vitest";
import {
  STORAGE_KEY_PATTERN,
  validateUploadContent,
  sniffUploadKind,
  normalizeMime,
  MAX_UPLOAD_BYTES,
} from "./storage";

/**
 * The /api/files/[key] route gates EVERY download on this pattern BEFORE
 * touching the filesystem or object storage. If it accepts anything beyond
 * the exact server-generated key format, path traversal / traversal-adjacent
 * payloads become reachable.
 */
describe("STORAGE_KEY_PATTERN (authed file route gate)", () => {
  it("accepts server-generated keys", () => {
    expect(STORAGE_KEY_PATTERN.test("1735432100123-1a2b3c4d5e6f7089.pdf")).toBe(true);
    expect(STORAGE_KEY_PATTERN.test("9999999999999-ffffffffffffffff.png")).toBe(true);
    expect(STORAGE_KEY_PATTERN.test("1-0000000000000001.jpeg")).toBe(true);
    expect(STORAGE_KEY_PATTERN.test("1-abcdef0123456789.bin")).toBe(true);
  });

  it("rejects path traversal", () => {
    expect(STORAGE_KEY_PATTERN.test("../secrets.txt")).toBe(false);
    expect(STORAGE_KEY_PATTERN.test("1735432100123-1a2b3c4d5e6f7089/../../etc/passwd")).toBe(false);
    expect(STORAGE_KEY_PATTERN.test("..%2f..%2fetc")).toBe(false);
    expect(STORAGE_KEY_PATTERN.test("..\\..\\windows")).toBe(false);
  });

  it("rejects missing/malformed components", () => {
    expect(STORAGE_KEY_PATTERN.test("")).toBe(false);
    expect(STORAGE_KEY_PATTERN.test("1735432100123.pdf")).toBe(false); // no random hex
    expect(STORAGE_KEY_PATTERN.test("abc-1a2b3c4d5e6f7089.pdf")).toBe(false); // non-epoch prefix
    expect(STORAGE_KEY_PATTERN.test("1735432100123-1A2B3C4D5E6F7089.pdf")).toBe(false); // uppercase hex
    expect(STORAGE_KEY_PATTERN.test("1735432100123-1a2b3c4d5e6f7089")).toBe(false); // no extension
    expect(STORAGE_KEY_PATTERN.test("1735432100123-1a2b3c4d5e6f7089.tar.gz")).toBe(false); // single ext only
    expect(STORAGE_KEY_PATTERN.test("/uploads/1735432100123-1a2b3c4d5e6f7089.pdf")).toBe(false); // full URL, not key
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Upload CONTENT validation (audit follow-up): a string-only MIME whitelist
// is not enough — a file's DECLARED type must match its actual bytes, and
// script-bearing HTML/SVG (the stored-XSS / polyglot vector) is rejected
// regardless of what MIME the caller claims.
// ───────────────────────────────────────────────────────────────────────────
const PNG_BYTES = Buffer.from("89504e470d0a1a0a", "hex");
const JPG_BYTES = Buffer.from("ffd8ffe000104a46494600", "hex");
const PDF_BYTES = Buffer.from("%PDF-1.7\n...", "utf8");
const HTML_BYTES = Buffer.from("<!DOCTYPE html><html><script>alert(1)</script></html>", "utf8");
const SVG_BYTES = Buffer.from("<?xml version='1.0'?><svg onload='alert(1)'/>", "utf8");

describe("validateUploadContent (magic-byte, not just declared MIME)", () => {
  it("accepts a genuine image whose bytes match the declared type and returns the safe MIME", () => {
    const r = validateUploadContent(Buffer.concat([PNG_BYTES, Buffer.alloc(16)]), "image/png");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.kind).toBe("png");
      expect(r.image).toBe(true);
      expect(r.safeMime).toBe("image/png");
    }
  });

  it("rejects HTML body bytes even when declared as a permitted image (polyglot)", () => {
    const r = validateUploadContent(HTML_BYTES, "image/png");
    expect(r.ok).toBe(false);
  });

  it("rejects SVG body bytes even when declared as a permitted image (script-bearing)", () => {
    const r = validateUploadContent(SVG_BYTES, "image/png");
    expect(r.ok).toBe(false);
  });

  it("accepts a real PDF and marks it non-image", () => {
    const r = validateUploadContent(PDF_BYTES, "application/pdf");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.kind).toBe("pdf");
      expect(r.image).toBe(false);
      expect(r.safeMime).toBe("application/pdf");
    }
  });

  it("rejects a MIME/bytes mismatch (PDF declared, PNG bytes)", () => {
    const r = validateUploadContent(PNG_BYTES, "application/pdf");
    expect(r.ok).toBe(false);
  });

  it("rejects a type outside the whitelist (text/html)", () => {
    const r = validateUploadContent(HTML_BYTES, "text/html");
    expect(r.ok).toBe(false);
  });

  it("rejects text/plain that actually contains a script tag", () => {
    const r = validateUploadContent(Buffer.from("hello <script>x</script>", "utf8"), "text/plain");
    expect(r.ok).toBe(false);
  });

  it("rejects binary content with no recognized signature", () => {
    const r = validateUploadContent(Buffer.from([0x00, 0x01, 0x02, 0x03, 0x00, 0xff]), "application/zip");
    expect(r.ok).toBe(false);
  });

  it("normalizes a MIME with parameters and mixed case", () => {
    expect(normalizeMime("IMAGE/PNG; charset=utf-8")).toBe("image/png");
  });

  it("sniffs the real kind from content", () => {
    expect(sniffUploadKind(PNG_BYTES)).toBe("png");
    expect(sniffUploadKind(JPG_BYTES)).toBe("jpeg");
    expect(sniffUploadKind(PDF_BYTES)).toBe("pdf");
    expect(sniffUploadKind(HTML_BYTES)).toBe("html");
    expect(sniffUploadKind(SVG_BYTES)).toBe("svg");
  });

  it("exposes a hard size cap", () => {
    expect(MAX_UPLOAD_BYTES).toBeGreaterThan(0);
  });
});

describe("reencodeImage (sharp) — images are neutralized before storage", () => {
  it("re-encodes a valid PNG, strips metadata, and preserves dimensions", async () => {
    const { default: sharp } = await import("sharp");
    const tinyPng = await sharp({ create: { width: 8, height: 8, channels: 3, background: { r: 10, g: 20, b: 30 } } })
      .png().toBuffer();
    const { reencodeImage } = await import("./storage");
    const out = await reencodeImage(tinyPng, "png");
    expect(out.mime).toBe("image/png");
    expect(out.buffer.byteLength).toBeGreaterThan(0);
    await expect(sharp(out.buffer).metadata()).resolves.toMatchObject({ format: "png", width: 8, height: 8 });
  });
});
