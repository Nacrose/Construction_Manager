/**
 * Client/server module boundary guard.
 *
 * WHY THIS TEST EXISTS
 * ────────────────────
 * CI once failed with an opaque Turbopack panic:
 *
 *   TurbopackInternalError: Failed to write app endpoint /(app)/projects/[id]/boq/page
 *   Caused by: the chunking context (unknown) does not support external
 *   modules (request: node:module)
 *
 * Root cause: a client component (the Gantt chart) imported a server util
 * (`nepal-calendar`) that had a statically analyzable `await import("@/lib/db")`.
 * Turbopack follows dynamic imports at build time, so `db.ts` — which imports
 * `node:module` (createRequire) — landed in the BrowserChunkingContext, where
 * Node builtins cannot exist.
 *
 * This test walks the VALUE-import graph of every `"use client"` module and
 * fails with a readable, chain-including message BEFORE the build ever runs,
 * for the whole class of violations:
 *
 *   1. no client graph may reach `src/lib/db.ts` (the server boundary carrier)
 *   2. no client graph may import `node:*` specifiers (browser chunks cannot
 *      contain Node builtins)
 *   3. no client graph may reach anything under `src/server/**` (server code)
 *      — with one audited exception: `src/server/utils/nepal-calendar.ts`, a
 *      pure module shared with the client for timeline holiday labels. Rules
 *      1 and 2 still apply THROUGH it, so adding a db import there fails here.
 *
 * `import type` / `export type` statements are stripped before analysis —
 * they compile away and create no graph edges.
 */

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../..");
const SRC = path.join(ROOT, "src");

/** The one audited exception to rule 3 (see header). Must stay pure. */
const SERVER_MODULE_ALLOWLIST = new Set([
  "src/server/utils/nepal-calendar.ts",
]);

/** Hard sinks: any client graph reaching these is a server-boundary leak. */
const FORBIDDEN_SINKS = new Set(["src/lib/db.ts"]);

const SCRIPT_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];
const ASSET_EXTENSIONS = [".css", ".scss", ".png", ".jpg", ".jpeg", ".svg", ".gif", ".ico", ".webp", ".woff", ".woff2", ".ttf", ".json"];

function listFiles(dir: string, exts: string[], out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry === "node_modules" || entry === ".next" || entry === "__tests__") continue;
      listFiles(full, exts, out);
    } else if (exts.some((e) => entry.endsWith(e))) {
      out.push(full);
    }
  }
  return out;
}

function stripComments(src: string): string {
  // Linear-time single pass: mask string/char/template literals, then strip
  // comments, preserving literal contents (a URL like https://x contains //
  // but lives inside a string).
  //
  // WHY NOT A REGEX: the original `(["'`])(?:\\.|(?!\1)[\s\S])*?\1` matcher
  // backtracked catastrophically (O(n²)) on files containing a quote-like
  // character that never terminates on its line (apostrophes in comments,
  // quote chars inside regex literals) — one such file turned the whole
  // source scan from ~600ms into ~60s. This scanner is strictly O(n) and
  // keeps the same masking semantics (quote-to-quote, honoring backslash
  // escapes; `${...}` inside templates is treated as literal content).
  const out: string[] = [];
  const strings: string[] = [];
  let token = "";
  let i = 0;
  const n = src.length;
  const flush = () => {
    if (token) {
      out.push(token);
      token = "";
    }
  };
  while (i < n) {
    const c = src[i];
    const next = i + 1 < n ? src[i + 1] : "";
    if (c === "/" && next === "/") {
      flush();
      while (i < n && src[i] !== "\n") i++;
      out.push(" ");
      continue;
    }
    if (c === "/" && next === "*") {
      flush();
      i += 2;
      while (i < n && !(src[i] === "*" && src[i + 1] === "/")) i++;
      i = Math.min(i + 2, n);
      out.push(" ");
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      let j = i + 1;
      while (j < n) {
        if (src[j] === "\\") {
          j += 2;
          continue;
        }
        if (src[j] === c) break;
        j++;
      }
      strings.push(src.slice(i, Math.min(j + 1, n)));
      out.push(`\u0000${strings.length - 1}\u0000`);
      i = j + 1;
      continue;
    }
    token += c;
    i++;
  }
  flush();
  // Restore literal contents after comment-stripping (the original regex
  // implementation did the same): import specifiers and "use client" must
  // come back intact for downstream analysis.
  return out.join("").replace(/\u0000(\d+)\u0000/g, (_, idx) => strings[Number(idx)]);
}

function isClientDirectiveFile(absPath: string): boolean {
  const raw = readFileSync(absPath, "utf8");
  // The directive must appear before any import/statement (comments allowed).
  const prologue = stripComments(raw).slice(0, 200);
  return /^\s*(['"])use client\1\s*;?/.test(prologue);
}

/** Specifiers imported (value imports only — type imports are stripped). */
function importedSpecifiers(absPath: string): string[] {
  let src = stripComments(readFileSync(absPath, "utf8"));
  // Erase type-only statements: `import type … from "x"`, `export type {…} from "x"`.
  src = src.replace(/import\s+type\s+[^;]*?from\s*(['"][^'"]+['"])\s*;?/g, " ");
  src = src.replace(/export\s+type\s+[^;]*?from\s*(['"][^'"]+['"])\s*;?/g, " ");
  const specifiers = new Set<string>();
  // Static imports / re-exports: `import … from "x"`, `export … from "x"`.
  for (const m of src.matchAll(/(?:^|[;\s)])?(?:import|export)\s[^;]*?from\s*(['"][^'"]+['"])/g)) {
    specifiers.add(m[1].slice(1, -1));
  }
  // Side-effect imports: `import "x"`.
  for (const m of src.matchAll(/(?:^|[;\s)])import\s*(['"][^'"]+['"])\s*;?/g)) {
    specifiers.add(m[1].slice(1, -1));
  }
  // Dynamic imports (statically followed by Turbopack!): `import("x")`.
  for (const m of src.matchAll(/import\(\s*(['"][^'"]+['"])\s*\)/g)) {
    specifiers.add(m[1].slice(1, -1));
  }
  return [...specifiers];
}

/** Resolve a specifier to an absolute file path, or null if unresolvable. */
function resolveSpecifier(fromFile: string, spec: string): string | null {
  if (spec.startsWith("node:")) return null; // handled by the node:* rule
  if (ASSET_EXTENSIONS.some((e) => spec.endsWith(e))) return null;
  let base: string;
  if (spec.startsWith("@/")) {
    base = path.join(SRC, spec.slice(2));
  } else if (spec.startsWith("./") || spec.startsWith("../")) {
    base = path.resolve(path.dirname(fromFile), spec);
  } else {
    return null; // bare package (react, @tanstack/…, …) — not our graph
  }
  const candidates = [base, ...SCRIPT_EXTENSIONS.map((e) => base + e)];
  for (const e of SCRIPT_EXTENSIONS) candidates.push(path.join(base, "index" + e));
  for (const c of candidates) if (existsSync(c) && statSync(c).isFile()) return c;
  return null; // e.g. `.css` module typing or generated client-only shims
}

type Violation = { chain: string[]; rule: string };

function walkClientGraphs(): Violation[] {
  const violations: Violation[] = [];
  const allFiles = listFiles(SRC, [".ts", ".tsx"]);
  const clientRoots = allFiles.filter(isClientDirectiveFile);

  for (const root of clientRoots) {
    const rel = (p: string) => path.relative(ROOT, p).split(path.sep).join("/");
    const parents = new Map<string, string>();
    const seen = new Set<string>([root]);
    const queue: string[] = [root];

    while (queue.length > 0) {
      const file = queue.shift()!;
      for (const spec of importedSpecifiers(file)) {
        const chainOf = (f: string): string[] => {
          const chain: string[] = [];
          let cur: string | undefined = f;
          while (cur && cur !== root) {
            chain.unshift(rel(cur));
            cur = parents.get(cur);
          }
          chain.unshift(`${rel(root)} ("use client")`);
          return chain;
        };

        if (spec.startsWith("node:")) {
          violations.push({ chain: [...chainOf(file), `${spec}  ← Node builtin in client graph`], rule: `client graph imports Node builtin \`${spec}\` (browser chunks cannot contain node:* modules)` });
          continue;
        }
        const resolved = resolveSpecifier(file, spec);
        if (!resolved || seen.has(resolved)) continue;
        seen.add(resolved);
        parents.set(resolved, file);
        const resolvedRel = rel(resolved);
        if (FORBIDDEN_SINKS.has(resolvedRel)) {
          violations.push({ chain: [...chainOf(resolved), `${resolvedRel}  ← FORBIDDEN server module`], rule: `client graph reaches \`${resolvedRel}\` — the server/DB boundary must never enter a browser chunk` });
          continue; // don't descend further; the sink is the report
        }
        if (resolvedRel.startsWith("src/server/") && !SERVER_MODULE_ALLOWLIST.has(resolvedRel)) {
          violations.push({ chain: [...chainOf(resolved), `${resolvedRel}  ← server module in client graph`], rule: `client graph reaches server module \`${resolvedRel}\` — server utils belong to the server bundle (see src/server/utils/holiday-db.ts for the db-cache split pattern)` });
          continue;
        }
        queue.push(resolved);
      }
    }
  }
  return violations;
}

describe("client/server module boundary", () => {
  it("every \"use client\" module exists (sanity: the scanner sees client files)", () => {
    const allFiles = listFiles(SRC, [".ts", ".tsx"]);
    const clientRoots = allFiles.filter(isClientDirectiveFile);
    // The app is heavily client-side; if this drops to ~0 the scanner broke.
    expect(clientRoots.length).toBeGreaterThan(20);
  });

  it("no client graph reaches the DB layer, Node builtins, or server code", () => {
    const violations = walkClientGraphs();
    const formatted = violations.map(
      (v) => `  ${v.rule}\n    ${v.chain.join("\n    → ")}`
    );
    expect(
      violations,
      `${violations.length} client-graph boundary violation(s):\n${formatted.join("\n\n")}\n\n` +
        "How to fix: split the server-only part into its own module under src/server/ " +
        "(see src/server/utils/holiday-db.ts for the pattern) or move shared pure code " +
        "into src/lib/ with no db/server imports."
    ).toEqual([]);
  });

  it("the nepal-calendar allowlist entry is still justified (Gantt client uses it)", () => {
    // If the Gantt client ever stops importing nepal-calendar, remove the
    // allowlist entry — exceptions must not outlive their reason.
    const gantt = path.join(SRC, "app/(app)/projects/[id]/gantt/GanttChart.tsx");
    const src = readFileSync(gantt, "utf8");
    expect(src).toMatch(/from\s+["']@\/server\/utils\/nepal-calendar["']/);
    // And the allowlisted module itself must never import db (belt & braces —
    // rule 1 already covers this transitively, but a direct check keeps the
    // failure message obvious when someone edits that file).
    const cal = readFileSync(path.join(SRC, "server/utils/nepal-calendar.ts"), "utf8");
    expect(stripComments(cal)).not.toMatch(/["']@\/lib\/db["']/);
  });
});
