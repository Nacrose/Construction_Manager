import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import { setSessionCookie } from "@/lib/auth";

/**
 * POST /api/auth/signup
 *
 * Creates a new Organization + Org Admin user.
 * SECURITY: Only allowed when there are zero users (first bootstrap)
 * or when an authenticated super admin is creating accounts.
 */

import { passwordSchema } from "@/lib/password-policy";
import { assertSameOrigin } from "@/lib/csrf";

// Single source of truth for signup input validation.
const SignupSchema = z.object({
  orgName: z.string().min(1).max(200),
  name: z.string().min(1).max(200),
  email: z.string().email().toLowerCase().trim(),
  password: passwordSchema,
});

export async function POST(req: NextRequest) {
  try {
    const denied = assertSameOrigin(req);
    if (denied) return denied;

    // Signup is only allowed for the first user (org bootstrap).
    // After that, existing members invite friends via the Team page.
    const userCount = await db.user.count();
    if (userCount > 0) {
      return NextResponse.json(
        { error: "Signup is closed. Ask an existing member to invite you." },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => null);
    const parsed = SignupSchema.safeParse(body);
    if (!parsed.success) {
      const firstErr = parsed.error.issues[0];
      return NextResponse.json(
        { error: firstErr?.message ?? "Invalid input." },
        { status: 400 }
      );
    }
    const { orgName, name, email: normalizedEmail, password } = parsed.data;

    // Check if email already exists
    const existingUser = await db.user.findUnique({ where: { email: normalizedEmail } });
    if (existingUser) {
      return NextResponse.json(
        { error: "An account with this email already exists. Try logging in instead." },
        { status: 409 }
      );
    }

    // Generate org code from org name
    const orgCode = orgName
      .toUpperCase()
      .replace(/[^A-Z0-9 ]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 30);

    // Check if org code already exists, append number if needed
    let finalCode = orgCode;
    let suffix = 1;
    while (await db.organization.findUnique({ where: { code: finalCode } })) {
      finalCode = `${orgCode}-${suffix++}`;
    }

    // Create organization + user in a transaction
    const result = await db.$transaction(async (tx) => {
      // Create organization
      const org = await tx.organization.create({
      data: {
        name: orgName,
        code: finalCode,
        status: "active",
      },
      });

      // Create user as org admin
      const user = await tx.user.create({
        data: {
          email: normalizedEmail,
          name,
          passwordHash: await bcrypt.hash(password, 12),
          role: "project_manager",
          organizationId: org.id,
          orgRole: "org_admin",
        },
      });

      return { org, user };
    });

    // Create session and set the httpOnly cookie — post-v2.0 the cookie IS
    // the credential, so the freshly-bootstrapped org admin gets a working
    // session with no token in the response body.
    await setSessionCookie(result.user.id);

    return NextResponse.json({
      user: {
        id: result.user.id,
        email: result.user.email,
        name: result.user.name,
        role: result.user.role,
        organizationId: result.org.id,
        orgRole: "org_admin",
        isSuperAdmin: false,
        organization: { id: result.org.id, name: result.org.name, code: result.org.code },
      },
    });
  } catch (err) {
    console.error("Signup failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Signup failed" },
      { status: 500 }
    );
  }
}
