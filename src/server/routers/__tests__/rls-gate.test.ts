/**
 * RLS Transaction Context Gate — static analysis CI guard.
 *
 * Scans every router file (excluding __tests__/) for interactive
 * `db.$transaction(async` calls and asserts that the transaction body
 * opens with `withOrgContext` or `withTenantTx` as its first statement.
 *
 * Why this exists:
 *   The most common failure mode in this codebase is building a correct
 *   security primitive and then not wiring it into every call site.
 *   This test makes that invisible mistake visible in CI immediately —
 *   a new bare transaction cannot merge without this test going red.
 *
 * No database connection required. Pure file-system + string analysis.
 *
 * Rule: every interactive $transaction(async (tx) => { ... }) MUST have
 *   `withOrgContext(tx, ...)` or `withTenantTx(...)` as the first awaited
 *   statement inside the callback. Array-form $transaction([...]) is exempt
 *   (Prisma operations only, cannot run set_config).
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const ROUTERS_DIR = path.resolve(__dirname, "..");

/** All router .ts files, excluding __tests__/ itself */
function getRouterFiles(): string[] {
  return fs
    .readdirSync(ROUTERS_DIR)
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
    .map((f) => path.join(ROUTERS_DIR, f));
}

type BareTransaction = {
  file: string;
  line: number;
  snippet: string;
};

/**
 * For each file, find every `.$transaction(async` occurrence and check
 * that one of the RLS context helpers appears within the next 3 lines.
 */
function findBareTransactions(filePath: string): BareTransaction[] {
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n");
  const bare: BareTransaction[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Match interactive-form only: .$transaction(async
    // Array-form .$transaction([) is exempt — it cannot run set_config.
    if (!line.includes(".$transaction(async")) continue;

    // Look ahead up to 3 lines for the RLS context call.
    const lookahead = lines.slice(i + 1, i + 4).join("\n");
    const hasContext =
      lookahead.includes("withOrgContext(") ||
      lookahead.includes("withTenantTx(");

    if (!hasContext) {
      bare.push({
        file: path.relative(ROUTERS_DIR, filePath),
        line: i + 1, // 1-indexed
        snippet: line.trim(),
      });
    }
  }

  return bare;
}

describe("RLS Transaction Context Gate", () => {
  it("every interactive $transaction must open with withOrgContext or withTenantTx", () => {
    const files = getRouterFiles();
    expect(files.length).toBeGreaterThan(0); // sanity: glob found something

    const allBare: BareTransaction[] = [];

    for (const file of files) {
      const bare = findBareTransactions(file);
      allBare.push(...bare);
    }

    if (allBare.length > 0) {
      const report = allBare
        .map(
          (b) =>
            `  ✗ ${b.file}:${b.line}\n    ${b.snippet}\n    → Missing withOrgContext(tx, ...) or withTenantTx(...) as first statement`
        )
        .join("\n\n");

      throw new Error(
        `\n\n${allBare.length} bare transaction(s) found without RLS context:\n\n${report}\n\n` +
          `Fix: add \`await withOrgContext(tx, ctx.user.organizationId, !!ctx.user.isSuperAdmin);\` ` +
          `as the FIRST line inside each flagged transaction callback.\n` +
          `See src/lib/rls.ts for the API.\n`
      );
    }

    expect(allBare).toHaveLength(0);
  });
});
