import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { createAdminSession } from "@/lib/auth";

/**
 * POST /api/setup — bootstrap the platform superadmin.
 *
 * Requires the x-setup-secret header (SETUP_SECRET env var). Idempotent:
 * if a superadmin already exists, it returns a message instead of
 * creating a duplicate.
 *
 * SCHEMA NOTE (v1.2): this route no longer applies DDL. The runtime
 * ensure-schema system was retired — Prisma migrations are the single
 * source of truth. Bootstrap a database with:
 *
 *     npx prisma migrate deploy
 *
 * If the User table is missing (schema never applied), this endpoint
 * fails loudly with the instruction instead of silently patching the
 * schema at runtime.
 */

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

// Prisma error surfaced when the schema was never applied (no User table).
const SCHEMA_INSTRUCTION =
  "Database schema is not applied. Run `npx prisma migrate deploy` against this database (see DEPLOY.md), then retry.";

export async function POST(req: NextRequest) {
  if (!checkSetupAuth(req)) {
    return NextResponse.json(
      { error: "Setup requires SETUP_SECRET. Pass x-setup-secret header." },
      { status: 403 },
    );
  }

  try {
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

    const token = await createAdminSession(superadmin.id);
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
        sessionKind: "admin",
      },
    });
  } catch (err) {
    // Fail loudly with actionable guidance when the schema is missing
    // (P2021: table does not exist; P2022: column does not exist) —
    // previously this endpoint "fixed" such DBs with unversioned runtime
    // DDL, which is the drift machine that broke fresh environments.
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      (err.code === "P2021" || err.code === "P2022")
    ) {
      return NextResponse.json({ error: SCHEMA_INSTRUCTION }, { status: 503 });
    }
    console.error("Setup failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Setup failed" },
      { status: 500 },
    );
  }
}
