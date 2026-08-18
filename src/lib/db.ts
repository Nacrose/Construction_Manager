import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
  freshPrisma?: PrismaClient | undefined
}

// During development, the dev server's HMR can hold onto a stale PrismaClient
// singleton after Prisma schema changes (e.g. when new models or fields are added while
// the dev server is running). Detect stale clients by checking for recently-added model
// fields and discard them so a fresh one is created below.
function isClientFresh(client: unknown): boolean {
  const c = client as { boqItem?: unknown; materialCatalog?: unknown };
  // Must know about boqItem (added in a prior migration)
  if (typeof c.boqItem === 'undefined') return false;
  // Must know about materialCatalog (added later — includes subCategory field)
  if (typeof c.materialCatalog === 'undefined') return false;
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
  new PrismaClient(prismaClientOptions)

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db

/**
 * Returns a PrismaClient that knows about every model in the current schema.
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
export function getFreshDb(): PrismaClient {
  if (process.env.NODE_ENV === 'production') return db
  // Reuse a previously-built fresh client if we have one.
  if (globalForPrisma.freshPrisma && isClientFresh(globalForPrisma.freshPrisma)) {
    return globalForPrisma.freshPrisma
  }
  if (isClientFresh(db)) return db

  // Stale — bypass the bundler's require cache and read the PrismaClient
  // class fresh from disk via Node's native require.
  const nativeRequire = eval('require') as NodeRequire
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
  const fresh = new FreshPrismaClient(prismaClientOptions)
  globalForPrisma.freshPrisma = fresh
  return fresh
}
