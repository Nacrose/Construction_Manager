/**
 * Live-database test harness: provision a NON-SUPERUSER table owner.
 *
 * Why: PostgreSQL SUPERUSERS bypass row-level security entirely — FORCE only
 * binds the table OWNER. Every scratch test database provisioned so far
 * (docker postgres:16 POSTGRES_USER, embedded initdb -U postgres) connected
 * Prisma as a superuser, which made every "cross-org deny" assertion either
 * vacuous or wrong. This file implements the production-faithful mode:
 *
 *   1. admin client (TEST_DATABASE_URL, superuser) creates a
 *      NOSUPERUSER LOGIN role `cm_test_owner`;
 *   2. grants it CREATE on the public schema (PG15+ revokes that by default);
 *   3. `prisma migrate deploy` runs AS the owner role, so every table it
 *      creates is owned by a non-superuser — exactly the production shape
 *      (the app's Prisma user owns the tables, FORCE binds it).
 *
 * Tests then connect via `ownerUrl()` — same host/db, role cm_test_owner.
 */
import { execSync } from "node:child_process";

export const OWNER_ROLE = "cm_test_owner";
export const OWNER_PASSWORD = "cm_test_owner";

/** Rewrite a database URL to connect as the non-superuser owner role. */
export function ownerUrl(adminUrl: string): string {
  const m = adminUrl.match(/^(postgres(?:ql)?:\/\/)(?:[^@/]+@)?(.+)$/);
  if (!m) throw new Error(`Cannot parse TEST_DATABASE_URL: ${adminUrl}`);
  return `${m[1]}${OWNER_ROLE}:${OWNER_PASSWORD}@${m[2]}`;
}

/**
 * Idempotently provision the owner role + schema grants on the database
 * reachable via `adminUrl`, then apply the FULL migration chain as that
 * owner (tables end up owned by a non-superuser).
 *
 * Must run against an EMPTY database (CI scratch service / fresh cluster):
 * if tables were already deployed by a different user, ownership stays with
 * that user and the owner client would get permission errors.
 */
export async function provisionOwnerAndDeploy(adminUrl: string): Promise<string> {
  // Dynamic import keeps this module importable without a live DB.
  const { PrismaClient } = await import("@prisma/client");
  const admin = new PrismaClient({ datasources: { db: { url: adminUrl } } });
  try {
    await admin.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${OWNER_ROLE}') THEN
          CREATE ROLE ${OWNER_ROLE} LOGIN PASSWORD '${OWNER_PASSWORD}' NOSUPERUSER;
        END IF;
      END
      $$`);
    // PG15+ revokes CREATE on public from PUBLIC by default.
    await admin.$executeRawUnsafe(`GRANT USAGE, CREATE ON SCHEMA public TO ${OWNER_ROLE}`);
    // 0_init opens with `CREATE SCHEMA IF NOT EXISTS "public"` — PG checks
    // DATABASE-level CREATE permission before noticing the schema exists.
    // (Production providers grant this on the app's own database.)
    const dbNameRows = (await admin.$queryRawUnsafe("SELECT current_database() AS db")) as {
      db: string;
    }[];
    await admin.$executeRawUnsafe(
      `GRANT CREATE ON DATABASE "${dbNameRows[0].db}" TO ${OWNER_ROLE}`,
    );
  } finally {
    await admin.$disconnect();
  }

  const url = ownerUrl(adminUrl);
  execSync("npx prisma migrate deploy", {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: url },
    stdio: "pipe",
  });
  return url;
}
