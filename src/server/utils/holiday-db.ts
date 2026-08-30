/**
 * DB-backed holiday cache refresh (SERVER-ONLY).
 *
 * This module owns everything about the admin-editable `Holiday` table that
 * the working-day calendar needs: the TTL cache, the in-flight refresh
 * promise, and the lazy Prisma read. It exists SEPARATELY from
 * `./nepal-calendar` on purpose:
 *
 *   `nepal-calendar` is imported by CLIENT components (the Gantt timeline
 *   renders holiday labels via `getHolidayName`). A statically analyzable
 *   `import("@/lib/db")` in that module pulled `db.ts` — which imports
 *   `node:module` (createRequire) — into the browser chunking context and
 *   panicked Turbopack ("the chunking context does not support external
 *   modules"). The DB machinery therefore lives HERE, where no client
 *   module can reach it. `src/lib/client-graph-boundary.test.ts` enforces
 *   this split at test time.
 *
 * Semantics (unchanged from when this lived in nepal-calendar):
 * - DB rows are AUTHORITATIVE per year — when the Holiday table has ANY
 *   rows for a year, those rows replace the compiled constant for that
 *   year (wrong constant dates can be corrected, not just supplemented).
 * - 5-minute TTL so a fresh process picks up admin edits within one
 *   window; `refreshHolidayCache(0)` forces a re-read.
 * - Fail-soft: on any error (table missing pre-migration, DB hiccup) the
 *   compiled constant remains the source of truth.
 */

import { __replaceDbHolidayCache, type HolidayRow } from "./nepal-calendar";

const DB_CACHE_TTL_MS = 5 * 60 * 1000;

let dbCacheLoadedAt = 0;
let dbCachePromise: Promise<void> | null = null;

/**
 * Refresh the DB holiday cache. Cheap no-op when the TTL hasn't elapsed.
 * Called by every DB-aware scheduling path (CPM recalculation, EVM,
 * holiday admin mutations) so a fresh process picks up admin edits within
 * one TTL window.
 */
export async function refreshHolidayCache(
  ttlMs = DB_CACHE_TTL_MS,
  client?: { holiday: { findMany(args: unknown): Promise<HolidayRow[]> } }
): Promise<void> {
  if (Date.now() - dbCacheLoadedAt < ttlMs) return;
  if (dbCachePromise) return dbCachePromise;
  dbCachePromise = (async () => {
    try {
      // Prefer an explicitly-passed client: callers inside an interactive
      // transaction MUST read on that transaction's connection (a pooled
      // read can deadlock on a size-1 pool, and sees a different snapshot).
      // Otherwise lazy dynamic import: keeps this module importable
      // without a DATABASE_URL (pure unit tests) and avoids load-time cycles.
      const reader =
        client ??
        (await import("@/lib/db")).db as unknown as { holiday: { findMany(args: unknown): Promise<HolidayRow[]> } };
      const rows: HolidayRow[] = await reader.holiday.findMany({
        select: { date: true, name: true },
      });
      __replaceDbHolidayCache(rows);
    } catch {
      // Fail-soft: keep whatever cache (likely empty) we already have.
    } finally {
      dbCacheLoadedAt = Date.now();
      dbCachePromise = null;
    }
  })();
  return dbCachePromise;
}

/** Test seam: inject/override the DB-backed cache without a database. */
export function __setHolidayCacheForTests(rows: HolidayRow[] | null): void {
  __replaceDbHolidayCache(rows);
  dbCacheLoadedAt = rows ? Date.now() : 0;
}
