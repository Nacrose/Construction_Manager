import { PrismaClient } from '@prisma/client'
import { createRequire } from 'node:module'
import { decimalBoundary } from './decimal-extension'

const nativeRequire = createRequire(import.meta.url)

const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof createDb> | undefined
  freshPrisma?: ReturnType<typeof createDb> | undefined
}

/**
 * PrismaClient with the DECIMAL boundary extension applied.
 *
 * The database stores exact DECIMAL(15,2)/(15,4) columns; this extension
 * converts Prisma Decimal objects → plain JS numbers at the client
 * boundary (model fields via result extensions, aggregates via a deep
 * result walker) so all application code and the tRPC superjson
 * transformer keep working with numbers. Writes accept numbers natively.
 */
function createDb() {
  return new PrismaClient(prismaClientOptions).$extends(decimalBoundary)
}

// During development, the dev server's HMR can hold onto a stale PrismaClient
// singleton after Prisma schema changes (e.g. when new models or fields are added while
// the dev server is running). Detect stale clients by checking for recently-added model
// fields and discard them so a fresh one is created below.
function isClientFresh(client: unknown): boolean {
  const c = client as { boqItem?: unknown; catalogMaterial?: unknown };
  // Must know about boqItem
  if (typeof c.boqItem === 'undefined') return false;
  // Must know about catalogMaterial
  if (typeof c.catalogMaterial === 'undefined') return false;
  return true;
}

if (
  process.env.NODE_ENV !== 'production' &&
  globalForPrisma.prisma &&
  !isClientFresh(globalForPrisma.prisma)
) {
  void globalForPrisma.prisma.$disconnect().catch(() => {})
  globalForPrisma.prisma = undefined
}


/**
 * PrismaClient configured for Neon Postgres on Vercel serverless.
 *
 * Neon's free tier auto-suspends the database after ~5 min of inactivity.
 * When a Vercel serverless function cold-starts and tries to connect, it
 * can time out before Neon wakes up. The settings below mitigate this:
 *
 * - log: only errors in production (query logging is expensive on serverless)
 * - datasources: explicit url (lets Prisma pick up the pgbouncer param from
 *   DATABASE_URL if present — Neon's pooled connection string ends with
 *   `?pgbouncer=true&connect_timeout=15`)
 *
 * If you still see "Can't reach database server" errors:
 * 1. Verify DATABASE_URL in Vercel env vars uses the POOLED connection
 *    string (host has `-pooler` in it, e.g. ep-xxx-pooler.aws.neon.tech)
 * 2. Append `?pgbouncer=true&connect_timeout=15&pool_timeout=30` if missing
 * 3. In Neon dashboard → Settings → Suspend → set to "Scale to zero after
 *    5 min" (default) — first request after sleep may take ~3s, that's normal
 */
type LogLevel = 'query' | 'error' | 'warn' | 'info';

const prismaClientOptions: { log: LogLevel[] } = {
  log: process.env.NODE_ENV === 'production'
    ? ['error', 'warn']
    : ['query', 'error', 'warn'],
}

export const db =
  globalForPrisma.prisma ??
  createDb()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db

/**
 * Returns a PrismaClient that knows about every model in the current schema
 * (with the decimal boundary extension applied — see createDb).
 *
 * In production this is just `db` (the singleton). In development, when
 * models are added while the dev server is running, the cached
 * `@prisma/client` module can be stale — its `PrismaClient` class doesn't
 * know about the new models. To work around this we read the class fresh
 * from disk via Node's native `require` (bypassing the Next.js/Turbopack
 * module cache) and instantiate it. The result is cached on `globalThis`
 * so we don't re-instantiate on every request.
 *
 * Use this in route handlers that touch models added after the dev server
 * started. Routes that only touch the original models (User, Session,
 * Project, Rfi, AuditLog, …) can use the regular `db` singleton.
 */
export function getFreshDb(): ReturnType<typeof createDb> {
  if (process.env.NODE_ENV === 'production') return db
  // Reuse a previously-built fresh client if we have one.
  if (globalForPrisma.freshPrisma && isClientFresh(globalForPrisma.freshPrisma)) {
    return globalForPrisma.freshPrisma
  }
  if (isClientFresh(db)) return db

  // Stale — bypass the bundler's require cache and read the PrismaClient
  // class fresh from disk via Node's native require (createRequire).
  const prismaIndex = typeof nativeRequire.resolve.paths === 'function'
    ? nativeRequire.resolve('@prisma/client', {
        paths: [process.cwd() + '/node_modules'],
      })
    : `${process.cwd()}/node_modules/@prisma/client/index.js`
  try {
    for (const key of Object.keys(nativeRequire.cache)) {
      if (
        key.includes('@prisma/client') ||
        key.includes('.prisma/client') ||
        key.includes('prisma/client/runtime')
      ) {
        delete nativeRequire.cache[key]
      }
    }
  } catch {
    // ignore
  }
  const { PrismaClient: FreshPrismaClient } = nativeRequire(prismaIndex) as {
    PrismaClient: new (opts?: typeof prismaClientOptions) => PrismaClient
  }
  const fresh = new FreshPrismaClient(prismaClientOptions).$extends(decimalBoundary)
  globalForPrisma.freshPrisma = fresh
  return fresh
}

/**
 * The extended client type (decimal boundary applied).
 * `db` itself satisfies this; interactive-transaction `tx` clients satisfy
 * DbTxClient below.
 */
export type DbClient = ReturnType<typeof createDb>

/**
 * A type that BOTH the full `db` client AND the `tx` passed to
 * `db.$transaction(async (tx) => …)` are assignable to. The omitted keys are
 * a superset of Prisma's internal ITxClientDenyList, so passing the full
 * client is also fine (structural subtyping). Use this for helper functions
 * that may run either standalone or inside a transaction.
 */
export type DbTxClient = Omit<
  DbClient,
  | "$accelerateInfo" | "$batch" | "$extends" | "$injectableDmmf" | "$metrics"
  | "$on" | "$transaction" | "$use" | "$disconnect" | "$connect" | "$pipeline"
>
