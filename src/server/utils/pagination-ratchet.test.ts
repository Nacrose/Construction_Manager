import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * PAGINATION RATCHET — unbounded findMany counts (pagination sweep).
 *
 * Every user-facing list/register must be bounded: either cursor-paginated
 * via src/lib/pagination.ts (pageArgs/pageResult + paginationInput) or
 * hard-capped with an explicit `take`. The sweep (2026-09) bounded every
 * findMany in QUERY procedures across all routers; mutation-internal
 * lookups keep their explicit caps where added.
 *
 * Counting rule: a findMany whose argument block contains no `take:` and
 * no `cursor:` counts as unbounded. The baseline below is the post-sweep
 * residue (mutation-internal lookups + deliberate analytics residue).
 * May only SHRINK — new list endpoints must ride pagination.ts.
 */

const ROUTERS_DIR = join(process.cwd(), "src/server/routers");
const FACTORY = join(process.cwd(), "src/server/utils/domain-router-factory.ts");

const BASELINE = {
  /** Unbounded findMany calls in router files — post-sweep residue:
   *  mutation-internal lookups (create/reorder paths that fetch a handful
   *  of scoped rows) and project-scoped analytics scans. Each one here is
   *  an opportunity, not an allowance: shrink by riding pagination.ts or
   *  a DB aggregate. */
  ROUTER_UNBOUNDED: 79,
  /** The factory's list must stay cursor-paginated forever. */
  FACTORY_UNBOUNDED: 0,
};

function listSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "__tests__" || entry.name === "node_modules") continue;
      listSourceFiles(full, out);
    } else if (/\.ts$/.test(entry.name) && !/\.test\.ts$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

function countUnbounded(text: string): number {
  let count = 0;
  const re = /\.findMany\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const openIdx = text.indexOf("(", m.index);
    let depth = 0;
    let closeIdx = -1;
    for (let i = openIdx; i < text.length; i++) {
      const c = text[i];
      if (c === "(") depth++;
      else if (c === ")") {
        depth--;
        if (depth === 0) {
          closeIdx = i;
          break;
        }
      }
    }
    const args = text.slice(openIdx + 1, closeIdx).replace(/\/\/.*$/gm, "");
    if (/\btake\s*:/.test(args) || /\bcursor\s*:/.test(args)) continue;
    // ignore matches inside line comments
    const lineStart = text.lastIndexOf("\n", m.index) + 1;
    if (text.slice(lineStart, m.index).includes("//")) continue;
    count++;
  }
  return count;
}

describe("Pagination ratchet — every list must be bounded (shrink-only)", () => {
  it("factory list stays cursor-paginated", () => {
    const text = readFileSync(FACTORY, "utf8");
    expect(countUnbounded(text)).toBeLessThanOrEqual(BASELINE.FACTORY_UNBOUNDED);
  });

  it("unbounded findMany in routers never grows past the baseline", () => {
    const files = listSourceFiles(ROUTERS_DIR);
    let count = 0;
    const offenders: string[] = [];
    for (const f of files) {
      const text = readFileSync(f, "utf8");
      const c = countUnbounded(text);
      if (c > 0) offenders.push(`${f.replace(ROUTERS_DIR + "/", "")}: ${c}`);
      count += c;
    }
    expect(
      count,
      `Unbounded findMany grew (${count} > ${BASELINE.ROUTER_UNBOUNDED}). ` +
        "New list endpoints must use paginationInput/pageArgs/pageResult from src/lib/pagination.ts. " +
        "Residue: " +
        offenders.join(", ")
    ).toBeLessThanOrEqual(BASELINE.ROUTER_UNBOUNDED);
  });
});
