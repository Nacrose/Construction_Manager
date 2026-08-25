import { NextRequest } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { createAdminSession } from "@/lib/auth";
import { ok, handleError, badRequest, forbidden } from "@/lib/api";

const LoginSchema = z.object({
  email: z.string().email().toLowerCase(),
  password: z.string().min(1),
});

// In-memory rate limit by IP (mirrors /api/auth/login).
const attempts = new Map<string, { count: number; firstAt: number }>();
const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 10;

export async function POST(req: NextRequest) {
  try {
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
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

    let user = await db.user.findUnique({
      where: { email: data.email },
    });

    // Vercel / Environment Auto-Provisioning:
    // If user doesn't exist but matches SUPERADMIN_EMAIL and SUPERADMIN_PASSWORD from Vercel environment vars,
    // automatically provision the superadmin JIT (Just-In-Time) securely.
    const envSuperEmail = process.env.SUPERADMIN_EMAIL?.toLowerCase().trim();
    const envSuperPassword = process.env.SUPERADMIN_PASSWORD;
    const envSuperName = process.env.SUPERADMIN_NAME || "Platform Administrator";

    if (!user && envSuperEmail && envSuperPassword && data.email === envSuperEmail && data.password === envSuperPassword) {
      const passwordHash = await bcrypt.hash(envSuperPassword, 12);
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
      console.log(`[admin-login] JIT provisioned superadmin from Vercel env: ${user.email}`);
    }

    if (!user || !(await bcrypt.compare(data.password, user.passwordHash))) {
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
