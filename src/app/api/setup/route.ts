import { NextRequest, NextResponse } from "next/server";
import { ensureSchema } from "@/lib/ensure-schema";
import { db } from "@/lib/db";

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

// POST also requires the same auth
export async function POST(req: NextRequest) {
  return GET(req);
}
