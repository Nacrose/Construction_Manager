import { NextRequest } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { setSessionCookie } from "@/lib/auth";
import { ok, handleError, badRequest, forbidden } from "@/lib/api";

const LoginSchema = z.object({
  email: z.string().min(3).toLowerCase().trim(),
  password: z.string().min(1),
});

// Rate-limit by IP AND by email in memory.
//
// LIMITATION: this is an in-memory rate limiter — it resets on every
// cold start (Vercel serverless) and doesn't share state across
// instances. A distributed attacker rotating IPs can bypass it. For
// production-grade protection, use a Redis-backed rate limiter (TODO).
// We track BOTH IP and email so an attacker rotating IPs but hammering
// a single email gets rate-limited on the email dimension.
const attempts = new Map<string, { count: number; firstAt: number }>();
const WINDOW_MS = 60_000;
const MAX_ATTEMPTS_IP = 10;   // max 10 attempts per IP per minute
const MAX_ATTEMPTS_EMAIL = 5; // max 5 attempts per email per minute (stricter)

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
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

    // Pre-parse the body to extract email for per-email rate limiting.
    const body = await req.json();
    const email = typeof body?.email === "string" ? body.email.toLowerCase().trim() : "";
    const emailKey = `email:${email}`;
    const ipKey = `ip:${ip}`;

    // Check BOTH IP and email rate limits. Either hitting the limit blocks.
    if (!checkRateLimit(ipKey, MAX_ATTEMPTS_IP) || !checkRateLimit(emailKey, MAX_ATTEMPTS_EMAIL)) {
      return badRequest("Too many attempts. Please wait a minute.");
    }

    const data = LoginSchema.parse(body);

    const user = await db.user.findUnique({
      where: { email: data.email },
    });
    if (!user || !(await bcrypt.compare(data.password, user.passwordHash))) {
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

    // Create session and get the token
    const token = await setSessionCookie(user.id);

    // Return the token in the response body so the client can store it
    // in localStorage and send it as a Bearer header (reliable through gateways)
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
      token,
    });
  } catch (err) {
    return handleError(err);
  }
}
