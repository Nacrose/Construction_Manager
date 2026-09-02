/**
 * Unit tests for the distributed rate limiter (src/lib/rate-limit.ts).
 *
 * Pins (memory backend — REDIS_URL is unset in tests):
 *   - allow up to max within a window, block beyond it
 *   - fixed-window reset: pressure clears when the window rolls over
 *   - key isolation: one noisy key never consumes another's budget
 *   - Redis backend: INCR counter + deny beyond max (ioredis mocked)
 *   - fail-soft: a throwing Redis client degrades to the memory limiter
 *     instead of failing requests
 */
import { describe, expect, it, beforeEach, vi } from "vitest";

const redisState = { store: new Map<string, number>() };

const incrMock = vi.fn(async (k: string) => {
  const next = (redisState.store.get(k) ?? 0) + 1;
  redisState.store.set(k, next);
  return next;
});
const pexpireMock = vi.fn(async () => 1);

vi.mock("ioredis", () => {
  return {
    default: class FakeRedis {
      incr = incrMock;
      pexpire = pexpireMock;
      on() {
        /* no-op */
      }
    },
  };
});

import {
  checkRateLimit,
  __resetRateLimitRedisForTests,
} from "../rate-limit";

const OPTS = { windowMs: 60_000, max: 3 };

beforeEach(() => {
  redisState.store.clear();
  incrMock.mockClear();
  pexpireMock.mockClear();
  delete process.env.REDIS_URL;
  __resetRateLimitRedisForTests();
});

describe("rate-limit — memory backend (no REDIS_URL)", () => {
  it("allows up to max hits in a window, then blocks with retry hint", async () => {
    const v1 = await checkRateLimit("u1:reporting", OPTS);
    const v2 = await checkRateLimit("u1:reporting", OPTS);
    const v3 = await checkRateLimit("u1:reporting", OPTS);
    const v4 = await checkRateLimit("u1:reporting", OPTS);

    expect(v1.allowed).toBe(true);
    expect(v2.allowed).toBe(true);
    expect(v3.allowed).toBe(true);
    expect(v4.allowed).toBe(false);
    expect(v4.count).toBe(4);
    expect(v4.retryAfterSec).toBeGreaterThan(0);
    expect(v4.retryAfterSec).toBeLessThanOrEqual(60);
  });

  it("resets pressure when the window rolls over", async () => {
    vi.useFakeTimers();
    const start = 1_700_000_000_000;
    vi.setSystemTime(start);
    for (let i = 0; i < OPTS.max; i++) {
      expect((await checkRateLimit("u2:reporting", OPTS)).allowed).toBe(true);
    }
    expect((await checkRateLimit("u2:reporting", OPTS)).allowed).toBe(false);

    vi.setSystemTime(start + OPTS.windowMs + 1);
    const fresh = await checkRateLimit("u2:reporting", OPTS);
    expect(fresh.allowed).toBe(true);
    expect(fresh.count).toBe(1);
    vi.useRealTimers();
  });

  it("keys are isolated — a noisy key cannot exhaust another's budget", async () => {
    for (let i = 0; i < OPTS.max; i++) {
      await checkRateLimit("u3:reporting", OPTS);
    }
    expect((await checkRateLimit("u3:reporting", OPTS)).allowed).toBe(false);
    const other = await checkRateLimit("u4:reporting", OPTS);
    expect(other.allowed).toBe(true);
    expect(other.count).toBe(1);
  });
});

describe("rate-limit — redis backend", () => {
  it("uses the shared INCR counter and denies beyond max", async () => {
    process.env.REDIS_URL = "redis://localhost:6379";
    __resetRateLimitRedisForTests();

    const v1 = await checkRateLimit("u5:reporting", OPTS);
    const v2 = await checkRateLimit("u5:reporting", OPTS);
    const v3 = await checkRateLimit("u5:reporting", OPTS);
    const v4 = await checkRateLimit("u5:reporting", OPTS);

    expect(incrMock).toHaveBeenCalledTimes(4);
    expect(pexpireMock).toHaveBeenCalledTimes(4);
    expect(v1.allowed && v2.allowed && v3.allowed).toBe(true);
    expect(v4.allowed).toBe(false);
    expect(v4.count).toBe(4);
  });

  it("fail-soft: a throwing Redis degrades to the memory limiter", async () => {
    process.env.REDIS_URL = "redis://localhost:6379";
    __resetRateLimitRedisForTests();
    incrMock.mockRejectedValueOnce(new Error("connection refused"));

    // Hit 1: Redis command throws → memory path records the verdict.
    const degraded = await checkRateLimit("u6:reporting", OPTS);
    expect(degraded.allowed).toBe(true);
    expect(degraded.count).toBe(1);

    // Hit 2: Redis recovers (the error poisoned only that command) — the
    // shared counter is authoritative again. Degraded hits are best-effort
    // and do not backfill the Redis window.
    const recovered = await checkRateLimit("u6:reporting", OPTS);
    expect(recovered.allowed).toBe(true);
    expect(recovered.count).toBe(1); // Redis saw hit 1 never; its counter starts at 1 now
    expect(incrMock).toHaveBeenCalledTimes(2);
  });
});
