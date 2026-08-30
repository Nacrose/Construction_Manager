/**
 * Seed-script RLS helper.
 *
 * Since RLS phases 1–2 (prisma/migrations/2026083001…/2026083002…), the
 * catalog/preset/rate tables are FORCE ROW LEVEL SECURITY — policies now
 * bind the connection role seeds run as, so a seed that inserts
 * CatalogMaterial / GlobalPresetAnalysis / RateBook / RateProfile /
 * ReportSnapshot / JournalEntry / … rows would fail (or silently write
 * nothing) without org context.
 *
 * Seeds legitimately write cross-org data in one trusted process, so the
 * correct context is the superadmin bypass that the policies expose via
 * the `app.is_superadmin` GUC (same mechanism as the app's
 * superAdminProcedure).
 *
 * Usage (top of each seed file):
 *
 *   import { createSeedDb, enableSeedRlsBypass } from "./seed-rls";
 *   const db = createSeedDb();
 *   async function main() {
 *     await enableSeedRlsBypass(db);
 *     // … existing seed body unchanged …
 *   }
 *
 * `createSeedDb` pins the pool to a single physical connection
 * (connection_limit=1), which is what makes the session-level GUC reliable:
 * every subsequent query in the seed runs on the same connection where the
 * superadmin flag was set. Do NOT use this helper in application code —
 * it exists for trusted offline scripts only.
 */
import { PrismaClient } from "@prisma/client";

export function createSeedDb(): PrismaClient {
  const url = process.env.DATABASE_URL;
  if (!url) {
    // No DATABASE_URL — let Prisma surface its usual error.
    return new PrismaClient();
  }
  try {
    const parsed = new URL(url);
    parsed.searchParams.set("connection_limit", "1");
    parsed.searchParams.set("pgbouncer", "false");
    return new PrismaClient({
      datasources: { db: { url: parsed.toString() } },
    });
  } catch {
    // Non-URL datasource (shouldn't happen for this PG project) — fall back.
    return new PrismaClient();
  }
}

/** Sets the superadmin RLS bypass on the (single) seed connection. */
export async function enableSeedRlsBypass(db: PrismaClient): Promise<void> {
  await db.$executeRawUnsafe(
    `SELECT set_config('app.is_superadmin', 'true', false)`,
  );
}
