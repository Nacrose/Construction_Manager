import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ok, unauthorized } from "@/lib/api";

/**
 * GET /api/push/vapid-public-key
 *
 * Returns the VAPID public key for client-side push subscription.
 * Returns 404 if push is not configured (no VAPID keys in env).
 */
export async function GET() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  if (!publicKey) {
    return NextResponse.json({ configured: false }, { status: 404 });
  }
  return ok({ configured: true, publicKey });
}
