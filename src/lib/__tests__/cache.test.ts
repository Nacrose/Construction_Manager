/**
 * Unit tests for the application cache (src/lib/cache.ts).
 *
 * Pins (memory backend — REDIS_URL is unset in tests):
 *   - read-through: producer runs on miss, is NOT called on hit
 *   - TTL expiry bounds staleness
 *   - explicit delete + prefix invalidation
 *   - superjson round-trip preserves Date instances (tRPC response types
 *     must not degrade to strings when a value is served from cache)
 *   - fail-soft: a throwing producer propagates (data errors must be loud)
 */
import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  cacheGet,
  cacheSet,
  cacheDel,
  cacheDelPrefix,
  cached,
  invalidateProjectCache,
  __resetCacheForTests,
} from "../cache";

beforeEach(() => {
  __resetCacheForTests();
});

describe("cache — memory backend", () => {
  it("read-through: producer runs once on miss, served from cache on hit", async () => {
    const producer = vi.fn(async () => ({ total: 42 }));
    const first = await cached("cashflow:p-1:12", 60, producer);
    const second = await cached("cashflow:p-1:12", 60, producer);

    expect(first).toEqual({ total: 42 });
    expect(second).toEqual({ total: 42 });
    expect(producer).toHaveBeenCalledTimes(1);
  });

  it("TTL expiry bounds staleness", async () => {
    vi.useFakeTimers();
    await cacheSet("retention:p-1:summary", { held: 10 }, 1);
    expect(await cacheGet("retention:p-1:summary")).toEqual({ held: 10 });
    vi.advanceTimersByTime(2_000);
    expect(await cacheGet("retention:p-1:summary")).toBeNull();
    vi.useRealTimers();
  });

  it("cacheDel removes an explicit key", async () => {
    await cacheSet("k", 1, 60);
    expect(await cacheGet("k")).toBe(1);
    await cacheDel("k");
    expect(await cacheGet("k")).toBeNull();
  });

  it("cacheDelPrefix clears every key under the prefix", async () => {
    await cacheSet("cashflow:p-1:6", "a", 60);
    await cacheSet("cashflow:p-1:12", "b", 60);
    await cacheSet("cashflow:p-2:12", "c", 60);
    await cacheSet("retention:p-1:summary", "d", 60);

    await cacheDelPrefix("cashflow:p-1");

    expect(await cacheGet("cashflow:p-1:6")).toBeNull();
    expect(await cacheGet("cashflow:p-1:12")).toBeNull();
    expect(await cacheGet("cashflow:p-2:12")).toBe("c");
    expect(await cacheGet("retention:p-1:summary")).toBe("d");
  });

  it("invalidateProjectCache targets the given scopes only", async () => {
    await cacheSet("cashflow:p-1:12", "a", 60);
    await cacheSet("retention:p-1:summary", "b", 60);

    await invalidateProjectCache("p-1", ["retention"]);

    expect(await cacheGet("cashflow:p-1:12")).toBe("a");
    expect(await cacheGet("retention:p-1:summary")).toBeNull();
  });

  it("superjson round-trip preserves Date instances", async () => {
    const now = new Date("2026-09-02T10:00:00.000Z");
    await cacheSet("dates", { paidAt: now, rows: [now] }, 60);
    const hit = await cacheGet<{ paidAt: Date; rows: Date[] }>("dates");
    expect(hit?.paidAt instanceof Date).toBe(true);
    expect(hit?.paidAt.toISOString()).toBe("2026-09-02T10:00:00.000Z");
    expect(hit?.rows[0] instanceof Date).toBe(true);
  });

  it("producer failures propagate (cache errors are soft, data errors are loud)", async () => {
    await expect(
      cached("boom", 60, async () => {
        throw new Error("db down");
      }),
    ).rejects.toThrow("db down");
  });
});
