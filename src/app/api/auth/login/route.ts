import { NextRequest } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { setSessionCookie } from "@/lib/auth";
import { ok, handleError, badRequest } from "@/lib/api";

const LoginSchema = z.object({
  email: z.string().email().toLowerCase(),
  password: z.string().min(1),
});

// Rate-limit by IP in memory.
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
      },
      token,
    });
  } catch (err) {
    return handleError(err);
  }
}
