import { NextRequest } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { setSessionCookie } from "@/lib/auth";
import { ok, handleError, badRequest, forbidden } from "@/lib/api";
import { assertSameOrigin } from "@/lib/csrf";
import {
  checkLoginRate,
  recordLoginAttempt,
  clientIpFromHeaders,
} from "@/lib/login-rate-limit";

const LoginSchema = z.object({
  email: z.string().min(3).toLowerCase().trim(),
  password: z.string().min(1),
});

// ── Rate limiting ───────────────────────────────────────────────────────────
// Layer 1 (in-memory, per-instance): cheap burst protection — survives a
//   DB outage and absorbs hammering before any query runs.
// Layer 2 (LoginAttempt table, shared): the source of truth — works across
//   cold starts and every serverless instance. See lib/login-rate-limit.ts.
const attempts = new Map<string, { count: number; firstAt: number }>();
const WINDOW_MS = 60_000;
const MAX_ATTEMPTS_IP = 10;   // max 10 attempts per IP per minute (L1)
const MAX_ATTEMPTS_EMAIL = 5; // max 5 attempts per email per minute (L1)

function checkRateLimit(key: string, maxAttempts: number): boolean {
  const now = Date.now();
  const bucket = attempts.get(key);
  if (bucket && now - bucket.firstAt < WINDOW_MS) {
    if (bucket.count >= maxAttempts) {
      return false; // rate limited
    }
    bucket.count += 1;
  } else {
    attempts.set(key, { count: 1, firstAt: now });
  }
  return true;
}

export async function POST(req: NextRequest) {
  try {
    const denied = assertSameOrigin(req);
    if (denied) return denied;

    const ip = clientIpFromHeaders(req.headers);

    // Pre-parse the body to extract email for per-email rate limiting.
    const body = await req.json();
    const email = typeof body?.email === "string" ? body.email.toLowerCase().trim() : "";
    const emailKey = `email:${email}`;
    const ipKey = `ip:${ip}`;

    // L1: per-instance burst guard (free, no DB round-trip).
    if (!checkRateLimit(ipKey, MAX_ATTEMPTS_IP) || !checkRateLimit(emailKey, MAX_ATTEMPTS_EMAIL)) {
      return badRequest("Too many attempts. Please wait a minute.");
    }

    // L2: durable, cross-instance limiter (LoginAttempt table).
    const verdict = await checkLoginRate(email, ip);
    if (!verdict.allowed) {
      return badRequest(verdict.reason ?? "Too many attempts. Please wait before retrying.");
    }

    const data = LoginSchema.parse(body);

    const user = await db.user.findUnique({
      where: { email: data.email },
    });
    const passwordOk =
      user && (await bcrypt.compare(data.password, user.passwordHash));

    // Record the attempt outcome for the durable limiter (never throws).
    await recordLoginAttempt(data.email, ip, !!passwordOk);

    if (!user || !passwordOk) {
      return badRequest("Invalid email or password.");
    }

    // Check if user is deactivated (field might not exist in older DBs)
    if ((user as any).deactivatedAt) {
      return badRequest("Your account has been deactivated. Contact your administrator.");
    }

    // Platform superadmins have a separate identity plane — they must use
    // the dedicated admin login, not the customer-facing one.
    //
    // SECURITY: return the SAME error message as the "user not found /
    // wrong password" case so an attacker can't enumerate which emails
    // belong to superadmin accounts. Previously this returned a distinct
    // "Platform administrators must sign in at /admin/login" message,
    // which leaked that the email is a superadmin account.
    if (user.isSuperAdmin) {
      return badRequest("Invalid email or password.");
    }

    // Create the session; the httpOnly cookie IS the credential (v2.0).
    // No token in the response body — it would sit in localStorage forever
    // and be exfiltratable by any XSS payload.
    await setSessionCookie(user.id);

    return ok({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        organizationId: user.organizationId,
        orgRole: user.orgRole,
        isSuperAdmin: user.isSuperAdmin,
      },
    });
  } catch (err) {
    return handleError(err);
  }
}
