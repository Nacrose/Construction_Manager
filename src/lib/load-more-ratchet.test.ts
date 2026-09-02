import { describe, expect, it } from "vitest";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";

/**
 * UI load-more ratchet (grow-only).
 *
 * The server-side pagination sweep bounded every list endpoint and returns
 * hasMore/nextCursor — but that only helps users if the client actually
 * pages. This test pins the number of client files wired to
 * `useInfiniteQuery` (keyset load-more) plus the max-page picker call sites,
 * so the wiring can only grow, never silently regress back to
 * "fetch page 1 and drop the rest".
 *
 * To raise the floor: wire another register page with useInfiniteQuery (or a
 * picker with an explicit `limit: 500`) and bump the number here.
 */
const SRC = path.join(__dirname, "..");

function clientFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === "__tests__") continue;
        walk(full);
      } else if (/\.(tsx|ts)$/.test(entry.name) && !/\.test\.(ts|tsx)$/.test(entry.name)) {
        out.push(full);
      }
    }
  };
  walk(SRC);
  return out.filter((f) => !f.includes(`${path.sep}server${path.sep}`));
}

const INFINITE_QUERY_BASELINE = 18; // client files using useInfiniteQuery (grow-only)
const MAX_PAGE_BASELINE = 24; // files passing an explicit limit: 500 max-page picker input (grow-only)

describe("load-more ratchet (client pagination wiring)", () => {
  const files = clientFiles();

  it("never drops below the pinned useInfiniteQuery adoption floor", () => {
    const wired = files.filter((f) => fs.readFileSync(f, "utf8").includes("useInfiniteQuery"));
    expect(wired.length).toBeGreaterThanOrEqual(INFINITE_QUERY_BASELINE);
  });

  it("never drops below the pinned max-page picker floor", () => {
    const maxed = files.filter((f) => /\blimit:\s*500\b/.test(fs.readFileSync(f, "utf8")));
    expect(maxed.length).toBeGreaterThanOrEqual(MAX_PAGE_BASELINE);
  });
});
