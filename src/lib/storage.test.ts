import { describe, expect, it } from "vitest";
import { STORAGE_KEY_PATTERN } from "./storage";

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
