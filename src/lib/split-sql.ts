/**
 * Split a multi-statement SQL dump into individual statements.
 *
 * Splits on semicolons that are at the end of a statement, ignoring
 * semicolons inside:
 *   - String literals ('...' and "...")
 *   - Dollar-quoted blocks ($tag$ ... $tag$) — used by Postgres functions
 *   - Line comments (-- ...)
 *   - Block comments (slash-star ... star-slash)
 *
 * Used by src/lib/ensure-schema.ts to apply the baseline Prisma migration.
 */
export function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = "";
  let inString = false;
  let stringChar = "";
  let inDollarQuote = false;
  let dollarTag = "";

  let i = 0;
  while (i < sql.length) {
    const ch = sql[i];
    const next = sql[i + 1];

    // Handle line comments (-- ...)
    if (!inString && !inDollarQuote && ch === "-" && next === "-") {
      const endOfLine = sql.indexOf("\n", i);
      if (endOfLine === -1) break;
      i = endOfLine + 1;
      continue;
    }

    // Handle block comments (/* ... */)
    if (!inString && !inDollarQuote && ch === "/" && next === "*") {
      const endComment = sql.indexOf("*/", i + 2);
      if (endComment === -1) break;
      i = endComment + 2;
      continue;
    }

    // Handle dollar-quoted blocks ($tag$ ... $tag$)
    if (!inString && ch === "$") {
      const tagMatch = /^\$[a-zA-Z0-9_]*\$/.exec(sql.slice(i));
      if (tagMatch) {
        const tag = tagMatch[0];
        if (inDollarQuote && tag === dollarTag) {
          inDollarQuote = false;
          dollarTag = "";
        } else if (!inDollarQuote) {
          inDollarQuote = true;
          dollarTag = tag;
        }
        current += tag;
        i += tag.length;
        continue;
      }
    }

    // Handle string literals ('...' and "..." for identifiers)
    if (
      !inDollarQuote &&
      (ch === "'" || ch === '"') &&
      (!inString || ch === stringChar)
    ) {
      inString = !inString;
      stringChar = inString ? ch : "";
      current += ch;
      i++;
      continue;
    }

    // Doubled quotes inside a string = escaped quote
    if (inString && ch === stringChar && next === stringChar) {
      current += ch + next;
      i += 2;
      continue;
    }

    // Statement terminator
    if (!inString && !inDollarQuote && ch === ";") {
      current += ch;
      const trimmed = current.trim();
      if (trimmed && !trimmed.startsWith("--")) {
        statements.push(trimmed);
      }
      current = "";
      i++;
      continue;
    }

    current += ch;
    i++;
  }

  // Append any trailing content (rare — usually empty after final ;)
  const tail = current.trim();
  if (tail && !tail.startsWith("--")) {
    statements.push(tail);
  }

  return statements;
}
