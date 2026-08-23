import { NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * GET /api/auth/check-first-user
 *
 * Returns whether there are any users in the database.
 * If isFirstUser is true, the signup page shows the super admin
 * setup flow (no organization required).
 *
 * This endpoint is public (no auth required) so it can be called
 * from the signup page before the user has logged in.
 *
 * SECURITY: if the database is unreachable, we return 503 — NOT
 * `isFirstUser: true`. The previous behavior would have let anyone
 * sign up as the initial superadmin during a transient DB outage.
 */
export async function GET() {
  try {
    const userCount = await db.user.count();
    return NextResponse.json({ isFirstUser: userCount === 0 });
  } catch (err) {
    console.error("[check-first-user] DB error:", err);
    return NextResponse.json(
      { error: "Database unavailable. Please try again later." },
      { status: 503 },
    );
  }
}
