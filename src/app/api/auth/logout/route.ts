import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, clearSessionCookie, getSessionJti } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * POST /api/auth/logout
 *
 * Revokes the current session in the database (so the bearer token stops
 * working) and clears the session cookie. Reads the JWT from either the
 * Authorization header or the cookie.
 */
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");

  // Validate the user via the bearer token (or cookie) so that we only
  // attempt to revoke a real, authenticated session.
  await getCurrentUser(authHeader);

  // Extract the JWT's JTI (session token) from the Authorization header
  // (or cookie) and delete the matching session record from the database.
  // Without this, the bearer token would remain valid after logout.
  const jti = await getSessionJti(authHeader);
  if (jti) {
    await db.session.deleteMany({ where: { token: jti } }).catch(() => {});
  }

  // Clear the session cookie as well.
  await clearSessionCookie(authHeader);

  return NextResponse.json({ ok: true });
}
