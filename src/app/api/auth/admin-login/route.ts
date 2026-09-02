import { NextRequest } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { createAdminSession } from "@/lib/auth";
import { ok, handleError, badRequest, forbidden } from "@/lib/api";
import { assertSameOrigin } from "@/lib/csrf";
import {
  checkLoginRate,
  recordLoginAttempt,
  clientIpFromHeaders,
} from "@/lib/login-rate-limit";

const LoginSchema = z.object({
  email: z.string().email().toLowerCase(),
  password: z.string().min(1),
});

// L1: in-memory burst guard per instance (mirrors /api/auth/login).
// L2: durable LoginAttempt-table limiter — shared across instances and
// cold starts (see lib/login-rate-limit.ts).
const attempts = new Map<string, { count: number; firstAt: number }>();
const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 10;

export async function POST(req: NextRequest) {
  try {
    const denied = assertSameOrigin(req);
    if (denied) return denied;

    const ip = clientIpFromHeaders(req.headers);
    const now = Date.now();
    const bucket = attempts.get(ip);
    if (bucket && now - bucket.firstAt < WINDOW_MS) {
      if (bucket.count >= MAX_ATTEMPTS) {
        return badRequest("Too many attempts. Please wait a minute.");
      }
      bucket.count += 1;
    } else {
      attempts.set(ip, { count: 1, firstAt: now });
    }

    const body = await req.json();
    const data = LoginSchema.parse(body);

    // L2: durable limiter (admin plane gets the same brute-force wall).
    const verdict = await checkLoginRate(data.email, ip);
    if (!verdict.allowed) {
      return badRequest(verdict.reason ?? "Too many attempts. Please wait before retrying.");
    }

    let user = await db.user.findUnique({
      where: { email: data.email },
    });

    // Initial Platform Bootstrap (Only if zero superadmins exist in the database):
    // Once any superadmin exists in the system, environment auto-provisioning is permanently disabled.
    if (!user) {
      const existingSuperadminCount = await db.user.count({
        where: { isSuperAdmin: true },
      });

      const envSuperEmail = process.env.SUPERADMIN_EMAIL?.toLowerCase().trim();
      const envSuperPassword = process.env.SUPERADMIN_PASSWORD;
      const envSuperName = process.env.SUPERADMIN_NAME || "Platform Administrator";

      if (
        existingSuperadminCount === 0 &&
        envSuperEmail &&
        envSuperPassword &&
        data.email === envSuperEmail
      ) {
        const passwordHash = await bcrypt.hash(envSuperPassword, 12);
        const isMatch = await bcrypt.compare(data.password, passwordHash);
        if (isMatch) {
          user = await db.user.create({
            data: {
              email: envSuperEmail,
              name: envSuperName,
              passwordHash,
              role: "project_manager",
              isSuperAdmin: true,
              orgRole: "org_admin",
            },
          });
          console.log(`[admin-login] Initial superadmin bootstrapped from environment: ${user.email}`);
        }
      }
    }

    if (!user || !(await bcrypt.compare(data.password, user.passwordHash))) {
      await recordLoginAttempt(data.email, ip, false);
      return badRequest("Invalid email or password.");
    }

    if ((user as { deactivatedAt?: Date | null }).deactivatedAt) {
      return badRequest("Your account has been deactivated. Contact your administrator.");
    }

    // Platform admin login is a separate identity plane: only superadmins may
    // use it. Everyone else must use the standard /api/auth/login.
    //
    // SECURITY: return the SAME error message as the "user not found /
    // wrong password" case so an attacker can't enumerate which emails
    // belong to non-superadmin accounts via the admin login endpoint.
    // Previously this returned a distinct "This login is for platform
    // administrators only" message, which leaked that the email exists
    // but is not a superadmin.
    if (!user.isSuperAdmin) {
      return badRequest("Invalid email or password.");
    }

    // Short-lived, kind-tagged admin session.
    const token = await createAdminSession(user.id);
    await recordLoginAttempt(data.email, ip, true);

    // Set cookie for proxy/middleware navigation
    try {
      const { cookies } = await import("next/headers");
      const store = await cookies();
      store.set("cf_session", token, {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60, // 1 hour
      });
    } catch {
      // cookies() not available in some contexts
    }

    return ok({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        organizationId: user.organizationId,
        orgRole: user.orgRole,
        isSuperAdmin: true,
        sessionKind: "admin",
      },
      token,
    });
  } catch (err) {
    return handleError(err);
  }
}
