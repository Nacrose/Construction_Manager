/**
 * Durable, database-backed login rate limiting.
 *
 * Replaces the in-memory Map limiter that (a) reset on every serverless
 * cold start and (b) never shared state across instances — a distributed
 * attacker rotating IPs could simply out-warm the limiter.
 *
 * Design:
 *  - Every attempt (success AND failure) is recorded in LoginAttempt.
 *  - Before verifying credentials we count FAILED attempts in the window:
 *      ≥ MAX_EMAIL_FAILURES for the email  → block (429)
 *      ≥ MAX_IP_FAILURES   for the IP      → block (429)
 *  - Successful logins clear the failure pressure for that email (a legit
 *    user who finally types the right password shouldn't stay blocked).
 *  - Rows older than RETENTION_MS are pruned opportunistically (~1% of
 *    calls) so the table stays bounded without a cron job.
 *
 * Availability stance: if the DB is unreachable the limiter FAILS OPEN
 * (allows the attempt) and logs loudly — login availability beats a
 * defense-in-depth limiter, and brute-force protection degrades to the
 * per-instance in-memory layer that callers may keep as L1.
 */
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";

export const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
export const MAX_EMAIL_FAILURES = 5; // failed attempts per email per window
export const MAX_IP_FAILURES = 20; // failed attempts per IP per window
const RETENTION_MS = 24 * 60 * 60 * 1000; // prune rows older than 24h
const PRUNE_PROBABILITY = 0.01;

export type LoginRateVerdict = {
  allowed: boolean;
  /** Human-readable reason when blocked (safe to return to the client). */
  reason?: string;
  /** Seconds until the window resets (Retry-After hint). */
  retryAfterSec?: number;
};

export function clientIpFromHeaders(headers: Headers): string {
  return (
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    headers.get("x-real-ip") ??
    "unknown"
  );
}

/**
 * Check whether a login attempt from (email, ip) is currently allowed.
 * Counts FAILED attempts only — successes don't count against the actor.
 */
export async function checkLoginRate(
  email: string,
  ip: string
): Promise<LoginRateVerdict> {
  try {
    const since = new Date(Date.now() - WINDOW_MS);
    const [emailFails, ipFails] = await Promise.all([
      db.loginAttempt.count({
        where: { email, success: false, createdAt: { gte: since } },
      }),
      db.loginAttempt.count({
        where: { ip, success: false, createdAt: { gte: since } },
      }),
    ]);

    if (emailFails >= MAX_EMAIL_FAILURES) {
      return {
        allowed: false,
        reason: "Too many failed attempts for this account. Please wait before retrying.",
        retryAfterSec: Math.ceil(WINDOW_MS / 1000),
      };
    }
    if (ipFails >= MAX_IP_FAILURES) {
      return {
        allowed: false,
        reason: "Too many attempts from this network. Please wait before retrying.",
        retryAfterSec: Math.ceil(WINDOW_MS / 1000),
      };
    }
    return { allowed: true };
  } catch (err) {
    // Fail-open: never take login down because the limiter table is
    // unreachable (e.g. pre-migration rollout ordering).
    logger().warn("loginRateLimit.check.failed", { error: err, emailDomain: email.split("@")[1] });
    return { allowed: true };
  }
}

/**
 * Record a login attempt outcome. Never throws — telemetry must not break
 * the login flow. Also opportunistically prunes old rows.
 */
export async function recordLoginAttempt(
  email: string,
  ip: string,
  success: boolean
): Promise<void> {
  try {
    await db.loginAttempt.create({ data: { email, ip, success } });
    if (success) {
      // A successful login clears the failure pressure for this email:
      // the legitimate user recovered; keep the IP history (that's the
      // stuffing-rotation signal).
      await db.loginAttempt.deleteMany({
        where: { email, success: false, createdAt: { gte: new Date(Date.now() - WINDOW_MS) } },
      });
    }
    if (Math.random() < PRUNE_PROBABILITY) {
      await db.loginAttempt.deleteMany({
        where: { createdAt: { lt: new Date(Date.now() - RETENTION_MS) } },
      });
    }
  } catch (err) {
    logger().warn("loginRateLimit.record.failed", { error: err });
  }
}
