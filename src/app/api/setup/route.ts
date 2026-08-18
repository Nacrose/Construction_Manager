import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { ensureSchema } from "@/lib/ensure-schema";
import { db } from "@/lib/db";
import { createSession } from "@/lib/auth";

/**
 * GET /api/setup — applies the baseline Prisma migration to the database.
 *
 * SECURITY:
 * - In development (NODE_ENV=development): runs without authentication
 * - In production: requires SETUP_SECRET env var, passed as
 *   ?secret=xxx query param or x-setup-secret header
 *
 * Also: if no super admin exists, promotes the first user to super admin.
 */

// Re-export splitSqlStatements so the test file can import it from this module
export { splitSqlStatements } from "@/lib/split-sql";

function checkSetupAuth(req: NextRequest): boolean {
  // Always require SETUP_SECRET (no dev bypass)
  const setupSecret = process.env.SETUP_SECRET;
  if (!setupSecret) {
    return false;
  }

  // Only accept header-based secret (query params leak in server logs)
  const headerSecret = req.headers.get("x-setup-secret");
  if (headerSecret === setupSecret) {
    return true;
  }

  return false;
}

export async function GET(req: NextRequest) {
  // Auth check
  if (!checkSetupAuth(req)) {
    return NextResponse.json({
      error: "Setup requires SETUP_SECRET. Pass x-setup-secret header.",
    }, { status: 403 });
  }

  try {
    const logs: string[] = [];
    const result = await ensureSchema();

    logs.push(`✅ ${result.executed} statements executed`);
    if (result.skipped > 0) {
      logs.push(`ℹ️  ${result.skipped} skipped (already existed)`);
    }
    if (result.failed > 0) {
      logs.push(`⚠️  ${result.failed} failed — check errors below`);
    }


    logs.push("✅ Database setup complete. Visit /login to sign in.");

    return NextResponse.json({
      message: result.executed > 0
        ? "Database setup complete. New tables/columns created."
        : "Database already up to date.",
      logs,
      executed: result.executed,
      skipped: result.skipped,
      failed: result.failed,
      errors: result.errors,
    });
  } catch (err) {
    console.error("Setup failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Setup failed" },
      { status: 500 }
    );
  }
}

// POST /api/setup — bootstrap the platform superadmin.
// Requires x-setup-secret header (SETUP_SECRET). Idempotent: if a superadmin
// already exists, it returns a message instead of creating a duplicate.
export async function POST(req: NextRequest) {
  if (!checkSetupAuth(req)) {
    return NextResponse.json(
      { error: "Setup requires SETUP_SECRET. Pass x-setup-secret header." },
      { status: 403 },
    );
  }

  try {
    await ensureSchema();

    const body = (await req.json().catch(() => ({}))) as {
      email?: string;
      name?: string;
      password?: string;
    };
    const { email, name, password } = body;

    const existingSuper = await db.user.findFirst({ where: { isSuperAdmin: true } });
    if (existingSuper) {
      return NextResponse.json({
        message: "A superadmin already exists. Use the admin console to manage users.",
        superadminExists: true,
      });
    }

    if (!email || !name || !password) {
      return NextResponse.json(
        { error: "Provide email, name and password to create the initial superadmin." },
        { status: 400 },
      );
    }
    if (password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters." },
        { status: 400 },
      );
    }

    const normalizedEmail = email.toLowerCase().trim();
    const existing = await db.user.findUnique({ where: { email: normalizedEmail } });
    if (existing) {
      return NextResponse.json(
        { error: "An account with this email already exists." },
        { status: 409 },
      );
    }

    const superadmin = await db.user.create({
      data: {
        email: normalizedEmail,
        name,
        passwordHash: await bcrypt.hash(password, 12),
        role: "project_manager",
        organizationId: null,
        orgRole: "member",
        isSuperAdmin: true,
      },
    });

    const token = await createSession(superadmin.id);
    return NextResponse.json({
      message: "Superadmin created. Log in with these credentials.",
      token,
      user: {
        id: superadmin.id,
        email: superadmin.email,
        name: superadmin.name,
        role: superadmin.role,
        organizationId: null,
        orgRole: "member",
        isSuperAdmin: true,
      },
    });
  } catch (err) {
    console.error("Setup failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Setup failed" },
      { status: 500 },
    );
  }
}
