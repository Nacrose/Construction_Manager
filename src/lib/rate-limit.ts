/**
 * Distributed rate limiting — Redis-backed with in-memory fallback.
 *
 * Replaces the trpc.ts in-memory Map limiter as the shared counter for
 * multi-instance deployments: on Vercel each warm instance had its own
 * buckets, so N instances multiplied the effective `max` and a deploy
 * reset all pressure. The interface is unchanged — callers pass a key and
 * a window, and get an allow/deny verdict.
 *
 * Design:
 *  - Fixed-window counters in Redis: INCR on
 *      `cm:ratelimit:{key}:{bucketIndex}`
 *    with a TTL slightly longer than the window (self-expiring; no GC).
 *    Simple, O(1), and accurate enough for abuse protection (not billing).
 *  - Fail-soft DOWN, not open: if Redis errors or REDIS_URL is unset, the
 *    caller degrades to the per-instance in-memory limiter (still a real
 *    bound, just not shared). Hard-failing every request because a
 *    defense-in-depth limiter lost its backend would be backwards — this
 *    matches the availability stance of login-rate-limit.ts.
 *  - Serverless-friendly: the Redis client is created lazily on first use,
 *    one connection per warm instance; without REDIS_URL nothing is
 *    imported (builds and unit tests never touch it).
 */
const PREFIX = "cm:ratelimit";

export type RateLimitVerdict = {
  allowed: boolean;
  /** Count of requests recorded in the current window (including this one). */
  count: number;
  /** Seconds until the current window resets (Retry-After hint). */
  retryAfterSec: number;
};

export type RateLimitOptions = {
  windowMs: number;
  max: number;
};

// ── In-memory fallback (per-instance) ────────────────────────────────

type MemoryBucket = { count: number; windowStart: number };
const memoryBuckets = new Map<string, MemoryBucket>();
const MEMORY_MAX_KEYS = 10_000;

function memoryCheck(key: string, opts: RateLimitOptions, now: number): RateLimitVerdict {
  const bucket = memoryBuckets.get(key);
  if (!bucket || now - bucket.windowStart >= opts.windowMs) {
    // Occasional GC so idle keys do not accumulate forever.
    if (memoryBuckets.size > MEMORY_MAX_KEYS) {
      for (const [k, v] of memoryBuckets) {
        if (now - v.windowStart >= opts.windowMs) memoryBuckets.delete(k);
      }
    }
    memoryBuckets.set(key, { count: 1, windowStart: now });
    return { allowed: true, count: 1, retryAfterSec: 0 };
  }
  bucket.count += 1;
  const retryAfterSec = Math.max(1, Math.ceil((bucket.windowStart + opts.windowMs - now) / 1000));
  return {
    allowed: bucket.count <= opts.max,
    count: bucket.count,
    retryAfterSec,
  };
}

// ── Redis shared counter (lazy singleton, same shape as cache.ts) ────

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
      // drop; commands fail soft (caller degrades to memory), never hang.
      connectTimeout: 5_000,
      commandTimeout: 2_000,
    });
    client.on("error", () => {
      /* fail-soft — verdicts degrade to the in-memory limiter */
    });
    redisClient = client;
  } catch {
    redisClient = null;
  }
  return redisClient;
}

/** Test hook: reset the lazy singleton so each test gets a fresh client. */
export function __resetRateLimitRedisForTests(): void {
  redisClient = undefined;
}

/**
 * Record one hit for `key` and return whether it is within the budget.
 * Never throws — worst case it behaves like the old per-instance limiter.
 */
export async function checkRateLimit(
  key: string,
  opts: RateLimitOptions
): Promise<RateLimitVerdict> {
  const now = Date.now();
  try {
    const redis = (await getRedis()) as {
      incr(k: string): Promise<number>;
      pexpire(k: string, ms: number): Promise<number>;
    } | null;

    if (redis) {
      const windowMs = opts.windowMs;
      const bucketIndex = Math.floor(now / windowMs);
      const redisKey = `${PREFIX}:${key}:${bucketIndex}`;
      const count = await redis.incr(redisKey);
      // Refresh TTL on every hit — the key must outlive the window so the
      // counter is readable for the whole bucket it represents.
      await redis.pexpire(redisKey, windowMs * 2 + 1_000);
      const windowRemainingMs = (bucketIndex + 1) * windowMs - now;
      return {
        allowed: count <= opts.max,
        count,
        retryAfterSec: Math.max(1, Math.ceil(windowRemainingMs / 1000)),
      };
    }
  } catch {
    // Degrade to the per-instance limiter below.
  }
  return memoryCheck(key, opts, now);
}
