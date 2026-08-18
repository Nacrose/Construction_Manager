import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { createSession } from "@/lib/auth";

/**
 * POST /api/auth/signup
 *
 * Creates a new Organization + Org Admin user.
 * SECURITY: Only allowed when there are zero users (first bootstrap)
 * or when an authenticated super admin is creating accounts.
 */
export async function POST(req: NextRequest) {
  try {
    // Signup is only allowed for the first user (org bootstrap).
    // After that, existing members invite friends via the Team page.
    const userCount = await db.user.count();
    if (userCount > 0) {
      return NextResponse.json(
        { error: "Signup is closed. Ask an existing member to invite you." },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { orgName, name, email, password } = body;

    // Validate
    if (!orgName || !name || !email || !password) {
      return NextResponse.json(
        { error: "All fields are required (orgName, name, email, password)" },
        { status: 400 }
      );
    }
    const normalizedEmail = email.toLowerCase().trim();
    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) {
      return NextResponse.json(
        { error: "Please enter a valid email address." },
        { status: 400 }
      );
    }
    if (password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters" },
        { status: 400 }
      );
    }

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

    // Create session + JWT
    const token = await createSession(result.user.id);

    return NextResponse.json({
      token,
      user: {
        id: result.user.id,
        email: result.user.email,
        name: result.user.name,
        role: result.user.role,
        organizationId: result.org.id,
        orgRole: "org_admin",
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
