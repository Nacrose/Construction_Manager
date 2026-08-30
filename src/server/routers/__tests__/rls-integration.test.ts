/**
 * RLS Phase 4: live-database integration gate
 * (docs/plans/rls-rollout.md §4 Phase 4, item 2).
 *
 * Skipped unless TEST_DATABASE_URL is set — in CI a scratch Postgres
 * service provides it (see .github/workflows/ci.yml job `rls`). The
 * database must be EMPTY: this file applies the full prisma migration
 * chain itself (npx prisma migrate deploy), then asserts the tenant
 * isolation contract against the REAL schema:
 *
 *   1. migrations apply cleanly (SQL validity, end to end);
 *   2. RLS + FORCE present on every covered table;
 *   3. same-org CRUD works as the table owner (the Prisma case);
 *   4. cross-org SELECT sees 0 rows;
 *   5. cross-org INSERT is denied;
 *   6. cross-org UPDATE/DELETE affect 0 rows;
 *   7. missing context fails CLOSED;
 *   8. superadmin bypasses everything;
 *   9. Project itself is FORCEd and org-scoped (phase 4);
 *  10. AuditLog is append-only (UPDATE/DELETE denied even to superadmin);
 *  11. legacy NULL-org visibility on Project is retired (fail closed).
 *
 * The assertions run through PrismaClient itself ($executeRawUnsafe for
 * the GUCs / $queryRaw for checks) — the same connection mode the app
 * uses in production (table owner + FORCE).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { provisionOwnerAndDeploy } from "./live-db";

const ROOT = path.resolve(__dirname, "../../../..");
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

// A representative column-bearing insert shape per table: every scoped
// table has projectId; these picks exercise one table from each batch
// plus the composite tables.
const ORG_A = "test-org-a";
const ORG_B = "test-org-b";
const P_A = "test-project-a"; // org A
const P_B = "test-project-b"; // org B

interface Client {
  $queryRawUnsafe(q: string, ...p: unknown[]): Promise<unknown>;
  $executeRawUnsafe(q: string, ...p: unknown[]): Promise<number>;
  $transaction<T>(fn: (tx: Client) => Promise<T>): Promise<T>;
  $disconnect(): Promise<void>;
}

// Plain single-quoted SQL string literal. The two previous attempts both
// never ran against a live database and were broken in different ways:
//  1. JSON.stringify → to_jsonb("x"::text): double quotes are IDENTIFIERS
//     in PostgreSQL → 42703 "column does not exist".
//  2. to_jsonb('x'::text): the jsonb value coerces to '"x"' (WITH JSON
//     quotes) on assignment to text columns, so ids seeded via D() never
//     matched ids seeded as plain literals → FK violations.
const D = (s: string) => `'${s.replace(/'/g, "''")}'`;

describe.skipIf(!TEST_DATABASE_URL)("RLS integration gate (live database)", () => {
  let db: Client;

  beforeAll(async () => {
    // 1. Provision a NON-SUPERUSER owner role and apply the FULL migration
    //    chain AS that owner. CRITICAL: superusers bypass RLS entirely, so
    //    connecting as the docker/initdb superuser would make every deny
    //    assertion below vacuous. The owner+FORCE mode is exactly what
    //    production runs (the app's Prisma user owns the tables).
    const url = await provisionOwnerAndDeploy(TEST_DATABASE_URL!);

    // 2. Fresh PrismaClient bound to the test database as the owner.
    //    (generated client already exists from `npm ci` + build step)
    const { PrismaClient } = await import("@prisma/client");
    db = new PrismaClient({
      datasources: { db: { url } },
    }) as unknown as Client;

    // 3. Seed tenant fixture data with the superadmin GUC armed (the
    //    policies' bypass branch — the role itself is a non-superuser).
    //    All seeding runs in ONE interactive transaction with a
    //    TRANSACTION-scoped GUC: session-level GUCs on the pooled client
    //    are best-effort (pool rotation can drop them mid-seed).
    await db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SELECT set_config('app.is_superadmin','true', true)");
    // Fixture shapes match schema.prisma NOT NULL columns (verified in
    // docs/rls-evidence/phase3-abc-verification.md — the same inserts run
    // there against the real migration chain).
    await tx.$executeRawUnsafe(
      // NOTE: "updatedAt" is NOT NULL with NO database default (Prisma
      // manages it client-side) — raw inserts MUST supply it. This test
      // failed with 23502 until that was noticed; keep the column list
      // explicit so new schema columns can't silently break the seed.
      `INSERT INTO "Organization" ("id","name","code","updatedAt") VALUES
       (${D(ORG_A)},'Org A','ORG-A',NOW()), (${D(ORG_B)},'Org B','ORG-B',NOW())
       ON CONFLICT DO NOTHING`,
    );
    await tx.$executeRawUnsafe(
      `INSERT INTO "User" ("id","email","name","passwordHash","organizationId","isSuperAdmin","updatedAt") VALUES
       ('u-a','a@test.local','A','x',${D(ORG_A)},false,NOW()),
       ('u-b','b@test.local','B','x',${D(ORG_B)},false,NOW()),
       ('u-s','s@test.local','S','x',NULL,true,NOW())
       ON CONFLICT DO NOTHING`,
    );
    await tx.$executeRawUnsafe(
      `INSERT INTO "Project" ("id","organizationId","name","code","createdById","updatedAt")
       VALUES (${D(P_A)},${D(ORG_A)},'A','PA','u-a',NOW()), (${D(P_B)},${D(ORG_B)},'B','PB','u-b',NOW())
       ON CONFLICT DO NOTHING`,
    );
    // one row per representative table, per org
    for (const [pfx, pid] of [["a", P_A], ["b", P_B]] as const) {
      await tx.$executeRawUnsafe(
        `INSERT INTO "Payment" ("id","projectId","payeeType","payeeName","amount")
         VALUES (${D(`pay-${pfx}`)},${D(pid)},'vendor','V',1) ON CONFLICT DO NOTHING`,
      );
      await tx.$executeRawUnsafe(
        `INSERT INTO "Material" ("id","projectId","name","unit","updatedAt")
         VALUES (${D(`mat-${pfx}`)},${D(pid)},'m','kg',NOW()) ON CONFLICT DO NOTHING`,
      );
      await tx.$executeRawUnsafe(
        `INSERT INTO "Staff" ("id","projectId","name","updatedAt")
         VALUES (${D(`staff-${pfx}`)},${D(pid)},'s',NOW()) ON CONFLICT DO NOTHING`,
      );
      await tx.$executeRawUnsafe(
        `INSERT INTO "Rfi" ("id","projectId","number","createdById","subject","description","updatedAt")
         VALUES (${D(`rfi-${pfx}`)},${D(pid)},${D(`R-${pfx}`)},${D(`u-${pfx}`)},'s','d',NOW())
         ON CONFLICT DO NOTHING`,
      );
      await tx.$executeRawUnsafe(
        `INSERT INTO "Notification" ("id","userId","projectId","type","title","message")
         VALUES (${D(`notif-${pfx}`)},${D(`u-${pfx}`)},${D(pid)},'t','t','m') ON CONFLICT DO NOTHING`,
      );
      await tx.$executeRawUnsafe(
        `INSERT INTO "AuditLog" ("id","userId","projectId","action","entityType","entityId")
         VALUES (${D(`aud-${pfx}`)},${D(`u-${pfx}`)},${D(pid)},'x','x','x') ON CONFLICT DO NOTHING`,
      );
    }
    }); // end seed transaction
  }, 240_000);

  const asOrg = async (org: string | null, superadmin = false) => {
    await db.$executeRawUnsafe(
      "SELECT set_config('app.organization_id',$1,false), set_config('app.is_superadmin',$2,false)",
      org ?? "",
      superadmin ? "true" : "false",
    );
  };
  const count = async (sql: string) => {
    const r = (await db.$queryRawUnsafe(sql)) as { count: bigint }[];
    return Number(r[0]?.count ?? 0);
  };

  afterAll(async () => {
    // teardown: superadmin context, then wipe fixture rows (reverse-insert order)
    if (db) {
      try {
        // One interactive transaction with a tx-scoped superadmin GUC —
        // session-level GUCs could be lost to pool rotation, silently
        // deleting 0 rows and tripping FK constraints downstream.
        await db.$transaction(async (tx) => {
          await tx.$executeRawUnsafe(
            "SELECT set_config('app.is_superadmin','true', true)",
          );
          for (const t of [
            "AuditLog", "Notification", "Rfi", "Staff", "Material", "Payment",
            "Project", "User", "Organization",
          ]) {
            await tx.$executeRawUnsafe(
              `DELETE FROM "${t}" WHERE "id" LIKE 'test-%' OR "id" LIKE 'cm_test_%' OR "id" IN ('pay-a','pay-b','mat-a','mat-b','staff-a','staff-b','rfi-a','rfi-b','notif-a','notif-b','aud-a','aud-b','u-a','u-b','u-s')`,
            );
          }
        });
      } finally {
        await db.$disconnect();
      }
    }
  });

  it("migrations applied and every covered table has RLS + FORCE + policies", async () => {
    const tracker = JSON.parse(
      fs.readFileSync(path.join(ROOT, "prisma/rls-tracker.json"), "utf8"),
    ) as { covered: string[] };
    expect(tracker.covered.length).toBeGreaterThan(70);
    // The tracker stores MODEL names; physical tables may differ via
    // Prisma @@map (model RateBook -> table "RateCatalog"). Translate.
    const SCHEMA = fs.readFileSync(
      path.join(ROOT, "prisma/schema.prisma"),
      "utf8",
    );
    const TABLE_OF: Record<string, string> = {};
    {
      const blockRe = /^model (\w+) \{([\s\S]*?)^\}/gm;
      let m: RegExpExecArray | null;
      while ((m = blockRe.exec(SCHEMA)) !== null) {
        const mapMatch = m[2].match(/@@map\("(\w+)"\)/);
        TABLE_OF[m[1]] = mapMatch ? mapMatch[1] : m[1];
      }
    }
    const physicalTables = tracker.covered.map((c) => TABLE_OF[c] ?? c);
    const rows = (await db.$queryRawUnsafe(`
      SELECT c.relname AS t,
             c.relrowsecurity AS rls,
             c.relforcerowsecurity AS forced,
             (SELECT count(*) FROM pg_policies p WHERE p.tablename = c.relname) AS policies
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname = ANY($1)
    `, physicalTables)) as { t: string; rls: boolean; forced: boolean; policies: bigint }[];
    const bad = rows.filter((r) => !r.rls || !r.forced || Number(r.policies) === 0);
    expect(
      rows.length,
      `covered tables missing from the database: ${tracker.covered.filter((c) => !rows.some((r) => r.t === (TABLE_OF[c] ?? c))).join(", ")}`,
    ).toBe(physicalTables.length);
    expect(
      bad.map((r) => r.t),
      "covered tables lacking RLS/FORCE/policies",
    ).toEqual([]);
  });

  it("same-org CRUD works (owner + FORCE — the Prisma production case)", async () => {
    await asOrg(ORG_A);
    expect(await count(`SELECT count(*) FROM "Payment" WHERE "projectId" = ${D(P_A)}`)).toBe(1);
    await db.$executeRawUnsafe(
      `INSERT INTO "Payment" ("id","projectId","payeeType","payeeName","amount")
       VALUES ('pay-a-2',${D(P_A)},'vendor','V',2)`,
    );
    await db.$executeRawUnsafe(`UPDATE "Payment" SET amount = 3 WHERE id = 'pay-a-2'`);
    await db.$executeRawUnsafe(`DELETE FROM "Payment" WHERE id = 'pay-a-2'`);
  });

  it("cross-org SELECT sees zero rows", async () => {
    await asOrg(ORG_A);
    expect(await count(`SELECT count(*) FROM "Payment" WHERE "projectId" = ${D(P_B)}`)).toBe(0);
    expect(await count(`SELECT count(*) FROM "Material" WHERE "projectId" = ${D(P_B)}`)).toBe(0);
    expect(await count(`SELECT count(*) FROM "Staff" WHERE "projectId" = ${D(P_B)}`)).toBe(0);
    expect(await count(`SELECT count(*) FROM "Rfi" WHERE "projectId" = ${D(P_B)}`)).toBe(0);
    expect(await count(`SELECT count(*) FROM "Notification" WHERE "userId" = 'u-b'`)).toBe(0);
    expect(await count(`SELECT count(*) FROM "AuditLog" WHERE "projectId" = ${D(P_B)}`)).toBe(0);
    expect(await count(`SELECT count(*) FROM "Project" WHERE id = ${D(P_B)}`)).toBe(0);
  });

  it("cross-org INSERT is denied", async () => {
    await asOrg(ORG_A);
    // per-table minimal column shapes (schema NOT NULLs — valid inserts
    // whose projectId targets the OTHER org; RLS must deny them all)
    const inserts: Record<string, string> = {
      Payment: `("id","projectId","payeeType","payeeName","amount") VALUES ('x-Payment',${D(P_B)},'vendor','V',1)`,
      Material: `("id","projectId","name","unit") VALUES ('x-Material',${D(P_B)},'m','kg')`,
      Staff: `("id","projectId","name") VALUES ('x-Staff',${D(P_B)},'s')`,
      Rfi: `("id","projectId","number","createdById","subject","description") VALUES ('x-Rfi',${D(P_B)},'R-x','u-a','s','d')`,
    };
    for (const [t, sql] of Object.entries(inserts)) {
      await expect(
        db.$executeRawUnsafe(`INSERT INTO "${t}" ${sql}`),
        `${t}: expected RLS denial`,
      ).rejects.toThrow(/row-level security/i);
    }
    await expect(
      db.$executeRawUnsafe(`INSERT INTO "Project" ("id","organizationId") VALUES ('x-p',${D(ORG_B)})`),
    ).rejects.toThrow(/row-level security/i);
  });

  it("cross-org UPDATE/DELETE affect zero rows", async () => {
    await asOrg(ORG_A);
    const u = await db.$executeRawUnsafe(`UPDATE "Payment" SET amount = 99 WHERE "projectId" = ${D(P_B)}`);
    const d = await db.$executeRawUnsafe(`DELETE FROM "Rfi" WHERE "projectId" = ${D(P_B)}`);
    expect(u).toBe(0);
    expect(d).toBe(0);
  });

  it("missing context fails CLOSED", async () => {
    await asOrg(null);
    expect(await count(`SELECT count(*) FROM "Payment"`)).toBe(0);
    expect(await count(`SELECT count(*) FROM "Project"`)).toBe(0);
    expect(await count(`SELECT count(*) FROM "Notification"`)).toBe(0);
  });

  it("superadmin bypasses everything", async () => {
    await asOrg(null, true);
    expect(await count(`SELECT count(*) FROM "Payment"`)).toBe(2);
    expect(await count(`SELECT count(*) FROM "Project"`)).toBe(2);
    expect(await count(`SELECT count(*) FROM "Notification"`)).toBe(2);
  });

  it("Project is FORCEd and legacy NULL-org visibility is retired (phase 4)", async () => {
    // a NULL-org project (seeded as superadmin) is invisible to org users
    await asOrg(null, true);
    await db.$executeRawUnsafe(
      `INSERT INTO "Project" ("id","organizationId","name","code","createdById","updatedAt")
       VALUES ('test-null-org',NULL,'N','N','u-s',NOW())`,
    );
    await asOrg(ORG_A);
    expect(await count(`SELECT count(*) FROM "Project" WHERE id = 'test-null-org'`)).toBe(0);
    await asOrg(null, true);
    expect(await count(`SELECT count(*) FROM "Project" WHERE id = 'test-null-org'`)).toBe(1);
    await db.$executeRawUnsafe(`DELETE FROM "Project" WHERE id = 'test-null-org'`);
  });

  it("AuditLog is append-only (tamper-proof even for superadmin)", async () => {
    await asOrg(ORG_A);
    await db.$executeRawUnsafe(
      `INSERT INTO "AuditLog" ("id","action","entityType","entityId") VALUES ('aud-tmp','x','x','x')`,
    );
    const u = await db.$executeRawUnsafe(`UPDATE "AuditLog" SET action = 'hacked' WHERE id = 'aud-tmp'`);
    const d = await db.$executeRawUnsafe(`DELETE FROM "AuditLog" WHERE id = 'aud-tmp'`);
    expect(u).toBe(0);
    expect(d).toBe(0);
    await asOrg(null, true);
    // No UPDATE policy exists for AuditLog — even a superadmin update is a
    // SILENT 0-row deny (PostgreSQL semantics for FOR ALL-less command
    // coverage), not an error. Tamper-evidence = the rowcount, not a throw.
    const superU = await db.$executeRawUnsafe(`UPDATE "AuditLog" SET action = 'hacked' WHERE id = 'aud-a'`);
    expect(superU).toBe(0);
  });
});
