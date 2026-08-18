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
 */
export async function GET() {
  try {
    const userCount = await db.user.count();
    return NextResponse.json({ isFirstUser: userCount === 0 });
  } catch (err) {
    // If the User table doesn't exist yet, treat as first user
    return NextResponse.json({ isFirstUser: true });
  }
}
