import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * ANY-TYPE RATCHET — type-erosion budget for server code (shrink-only).
 *
 * Prisma + Zod + tRPC give this codebase end-to-end type safety; every
 * `: any` / `as any` is a hole in that fence. New code must not add
 * coercions. A PR that grows the count is rejected — fix the type instead.
 *
 * Legitimate residue exists (Prisma delegate reflection in the state
 * machine, third-party seams) — the goal is a shrinking budget, not zero.
 *
 * Counting rule: `: any` and `as any` occurrences across src/server and
 * src/lib, excluding test files (tests legitimately build mocks).
 */

const SERVER_DIR = join(process.cwd(), "src/server");
const LIB_DIR = join(process.cwd(), "src/lib");

function listSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "__tests__" || entry.name === "node_modules") continue;
      listSourceFiles(full, out);
    } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

const ANY_RE = /:\s*any\b|\bas\s+any\b/g;

/** Baseline pinned 2026-09 (server hardening pass). May only shrink. */
const ANY_BASELINE = 235;

describe("Any-type ratchet (shrink-only)", () => {
  it("any coercions in server code never grow past the baseline", () => {
    const files = [...listSourceFiles(SERVER_DIR), ...listSourceFiles(LIB_DIR)];
    let count = 0;
    for (const file of files) {
      count += (readFileSync(file, "utf8").match(ANY_RE) ?? []).length;
    }
    expect(
      count,
      `any-count grew (${count} > ${ANY_BASELINE}). ` +
        "Replace `: any`/`as any` with real types (Prisma payloads, z.infer, generics)."
    ).toBeLessThanOrEqual(ANY_BASELINE);
  });
});
