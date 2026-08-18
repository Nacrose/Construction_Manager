import { describe, it, expect } from "vitest";
import { splitSqlStatements } from "@/lib/split-sql";

/**
 * splitSqlStatements takes a Postgres DDL dump (potentially thousands
 * of lines) and splits it into individual executable statements.
 *
 * This is non-trivial because semicolons can appear:
 *  - Inside string literals:  'hello; world'
 *  - Inside dollar-quoted blocks:  $body$ ... ; ... $body$
 *  - Inside line comments:  -- this; is; a comment
 *  - Inside block comments (slash-star ... star-slash)
 *
 * Getting this wrong means we either:
 *  - Execute partial statements (syntax error)
 *  - Try to execute comments as SQL (syntax error)
 *  - Split inside a string literal (broken statement)
 */

describe("splitSqlStatements", () => {
  it("splits simple semicolon-terminated statements", () => {
    const sql = `CREATE TABLE "A" (id INT);
CREATE TABLE "B" (id INT);`;
    const stmts = splitSqlStatements(sql);
    expect(stmts).toHaveLength(2);
    expect(stmts[0]).toBe('CREATE TABLE "A" (id INT);');
    expect(stmts[1]).toBe('CREATE TABLE "B" (id INT);');
  });

  it("handles trailing whitespace and newlines", () => {
    const sql = `SELECT 1;

SELECT 2;

`;
    const stmts = splitSqlStatements(sql);
    expect(stmts).toHaveLength(2);
    expect(stmts[0]).toBe("SELECT 1;");
    expect(stmts[1]).toBe("SELECT 2;");
  });

  it("ignores line comments (-- ...)", () => {
    const sql = `-- This is a comment
SELECT 1;
-- Another comment
SELECT 2;`;
    const stmts = splitSqlStatements(sql);
    expect(stmts).toHaveLength(2);
    expect(stmts[0]).toBe("SELECT 1;");
    expect(stmts[1]).toBe("SELECT 2;");
  });

  it("ignores block comments (/* ... */)", () => {
    const sql = `/* This is
a multi-line
comment ; with semicolons inside */
SELECT 1;`;
    const stmts = splitSqlStatements(sql);
    expect(stmts).toHaveLength(1);
    expect(stmts[0]).toBe("SELECT 1;");
  });

  it("does not split on semicolons inside single-quoted strings", () => {
    const sql = `INSERT INTO t VALUES ('hello; world');
INSERT INTO t VALUES ('foo; bar');`;
    const stmts = splitSqlStatements(sql);
    expect(stmts).toHaveLength(2);
    expect(stmts[0]).toBe(`INSERT INTO t VALUES ('hello; world');`);
    expect(stmts[1]).toBe(`INSERT INTO t VALUES ('foo; bar');`);
  });

  it("handles escaped single quotes inside strings ('')", () => {
    // SQL escapes a literal single quote by doubling it: 'it''s'
    const sql = `INSERT INTO t VALUES ('it''s; here');`;
    const stmts = splitSqlStatements(sql);
    expect(stmts).toHaveLength(1);
    expect(stmts[0]).toBe(`INSERT INTO t VALUES ('it''s; here');`);
  });

  it("does not split on semicolons inside double-quoted identifiers", () => {
    const sql = `CREATE TABLE "weird;name" (id INT);`;
    const stmts = splitSqlStatements(sql);
    expect(stmts).toHaveLength(1);
    expect(stmts[0]).toBe(`CREATE TABLE "weird;name" (id INT);`);
  });

  it("does not split inside dollar-quoted function bodies", () => {
    // This is the most important case — Postgres functions use $body$ ... $body$
    // to allow arbitrary characters including semicolons inside function definitions.
    const sql = `CREATE FUNCTION foo() RETURNS void AS $body$
BEGIN
  RAISE NOTICE 'hello; world';
  PERFORM 1;
END;
$body$ LANGUAGE plpgsql;

CREATE TABLE t (id INT);`;
    const stmts = splitSqlStatements(sql);
    expect(stmts).toHaveLength(2);
    expect(stmts[0]).toContain("CREATE FUNCTION");
    expect(stmts[0]).toContain("$body$");
    expect(stmts[0]).toContain("RAISE NOTICE");
    expect(stmts[1]).toBe("CREATE TABLE t (id INT);");
  });

  it("handles named dollar-quote tags ($func$ ... $func$)", () => {
    const sql = `CREATE FUNCTION bar() RETURNS void AS $func$
BEGIN
  RAISE NOTICE 'inside; function';
END;
$func$ LANGUAGE plpgsql;`;
    const stmts = splitSqlStatements(sql);
    expect(stmts).toHaveLength(1);
    expect(stmts[0]).toContain("CREATE FUNCTION");
  });

  it("handles empty input", () => {
    expect(splitSqlStatements("")).toEqual([]);
    expect(splitSqlStatements("   ")).toEqual([]);
  });

  it("handles input with only comments", () => {
    const sql = `-- just a comment
-- another one`;
    expect(splitSqlStatements(sql)).toEqual([]);
  });

  it("handles a real CREATE TABLE statement with constraints", () => {
    const sql = `CREATE TABLE "User" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");`;
    const stmts = splitSqlStatements(sql);
    expect(stmts).toHaveLength(2);
    expect(stmts[0]).toContain('CREATE TABLE "User"');
    expect(stmts[1]).toContain('CREATE UNIQUE INDEX');
  });

  it("does not split on semicolons inside CHECK constraints with string literals", () => {
    const sql = `CREATE TABLE t (
  status TEXT CHECK (status IN ('draft;pending', 'done'))
);`;
    const stmts = splitSqlStatements(sql);
    expect(stmts).toHaveLength(1);
    expect(stmts[0]).toContain("CHECK");
  });
});
