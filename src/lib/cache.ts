/**
 * Application cache — Redis-backed in production, in-memory fallback
 * elsewhere (dev, tests, REDIS_URL not configured).
 *
 * CONTRACT
 * - Fail-soft: a cache error NEVER fails a request. Every path catches and
 *   degrades (miss → producer recompute; failed set → value still returned).
 * - Serverless-friendly: the Redis client is created lazily on first use,
 *   one connection per warm instance; without REDIS_URL nothing is imported
 *   (builds and unit tests never touch it).
 * - superjson-serialized values: Dates / Decimal-backed strings / BigInt
 *   survive the cache round-trip exactly as tRPC would send them (a plain
 *   JSON round-trip would turn Dates into strings and corrupt client types).
 * - Invalidation is explicit + paired with short TTLs as a safety net:
 *   `invalidateProjectCache(projectId, scopes)` from the mutation sites
 *   that affect a scope; the TTL bounds staleness if a site is missed.
 *
 * SCOPE CONVENTION
 *   cashflow:{projectId}:{months}  — finance.cashFlow forecast
 *   retention:{projectId}:summary  — projectOps.payment.retentionSummary
 *
 * Writers call `invalidateProjectCache(projectId, ["cashflow", ...])`.
 */
import superjson from "superjson";

const PREFIX = "cm:cache";
const MEMORY_MAX_ENTRIES = 1000;

type MemoryEntry = { payload: string; expiresAt: number };
const memory = new Map<string, MemoryEntry>();

/**
 * undefined = not yet resolved; null = unavailable (no REDIS_URL or client
 * construction failed). One lazy singleton per warm instance.
 */
let redisClient: unknown | null | undefined;

async function getRedis(): Promise<unknown | null> {
  if (redisClient !== undefined) return redisClient;
  const url = process.env.REDIS_URL;
  if (!url) {
    redisClient = null;
    return null;
  }
  try {
    const { default: Redis } = await import("ioredis");
    const client = new Redis(url, {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      // Serverless instances can be frozen long enough for the socket to
      // drop; commands fail soft (caller catches), never hang for minutes.
      connectTimeout: 5_000,
      commandTimeout: 2_000,
    });
    client.on("error", () => {
      /* fail-soft — logged nowhere, cache misses degrade to producer */
    });
    redisClient = client;
  } catch {
    redisClient = null;
  }
  return redisClient;
}

function fullKey(key: string): string {
  return `${PREFIX}:${key}`;
}

/** Read a cached value; null on miss, expiry, or any error. */
export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const k = fullKey(key);
    const redis = (await getRedis()) as { get(k: string): Promise<string | null> } | null;
    if (redis) {
      const raw = await redis.get(k);
      if (raw === null) return null;
      return superjson.parse<T>(raw);
    }
    const entry = memory.get(k);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      memory.delete(k);
      return null;
    }
    return superjson.parse<T>(entry.payload);
  } catch {
    return null;
  }
}

/** Write a value with a TTL. Errors are swallowed — callers never await success. */
export async function cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  try {
    const payload = superjson.stringify(value);
    const k = fullKey(key);
    const redis = (await getRedis()) as
      | { set(k: string, v: string, mode: "EX", ttl: number): Promise<unknown> }
      | null;
    if (redis) {
      await redis.set(k, payload, "EX", Math.max(1, Math.floor(ttlSeconds)));
      return;
    }
    // Simple size guard: evict the OLDEST entries when over capacity.
    if (memory.size >= MEMORY_MAX_ENTRIES) {
      const excess = memory.size - MEMORY_MAX_ENTRIES + 1;
      let evicted = 0;
      for (const oldest of memory.keys()) {
        memory.delete(oldest);
        if (++evicted >= excess) break;
      }
    }
    memory.set(k, { payload, expiresAt: Date.now() + ttlSeconds * 1000 });
  } catch {
    /* fail-soft */
  }
}

/** Delete explicit keys (prefix-relative, same form used for get/set). */
export async function cacheDel(...keys: string[]): Promise<void> {
  try {
    const redis = (await getRedis()) as
      | { del(...keys: string[]): Promise<unknown> }
      | null;
    const full = keys.map(fullKey);
    if (redis) {
      if (full.length > 0) await redis.del(...full);
      return;
    }
    for (const k of full) memory.delete(k);
  } catch {
    /* fail-soft */
  }
}

/** Delete every key under a prefix (e.g. all `cashflow:p-1:*`). */
export async function cacheDelPrefix(prefix: string): Promise<void> {
  try {
    const redis = (await getRedis()) as
      | { scan(...args: unknown[]): Promise<[string, string[]]>; del(...keys: string[]): Promise<unknown> }
      | null;
    const pattern = `${fullKey(prefix)}*`;
    if (redis) {
      // SCAN (non-blocking) with a modest COUNT — key spaces per project are small.
      let cursor = "0";
      do {
        const [next, keys] = await redis.scan(cursor, "MATCH", pattern, "COUNT", 100);
        cursor = next;
        if (keys.length > 0) await redis.del(...keys);
      } while (cursor !== "0");
      return;
    }
    for (const k of [...memory.keys()]) {
      if (k.startsWith(fullKey(prefix))) memory.delete(k);
    }
  } catch {
    /* fail-soft */
  }
}

/**
 * Read-through wrapper: return the cached value or run the producer and
 * cache it. The producer failing is NOT swallowed (data errors must
 * propagate); only cache-layer errors degrade to a miss.
 */
export async function cached<T>(key: string, ttlSeconds: number, producer: () => Promise<T>): Promise<T> {
  const hit = await cacheGet<T>(key);
  if (hit !== null) return hit;
  const value = await producer();
  await cacheSet(key, value, ttlSeconds);
  return value;
}

/**
 * Invalidate cached scopes for a project. Call from mutation sites that
 * change what a cached read would return.
 */
export async function invalidateProjectCache(projectId: string, scopes: string[]): Promise<void> {
  await Promise.all(scopes.map((s) => cacheDelPrefix(`${s}:${projectId}`)));
}

/** Test seam: drop the in-memory store and forget any Redis client. */
export function __resetCacheForTests(): void {
  memory.clear();
  redisClient = undefined;
}
