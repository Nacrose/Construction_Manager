import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { savePushSubscription } from "@/server/utils/push";
import { ok, unauthorized, badRequest } from "@/lib/api";
import { assertSameOrigin } from "@/lib/csrf";

/**
 * POST /api/push/subscribe
 *
 * Save a push subscription for the current user.
 * Body: { endpoint: string, keys: { p256dh: string, auth: string } }
 */
export async function POST(req: NextRequest) {
  const denied = assertSameOrigin(req);
  if (denied) return denied;

  const user = await getCurrentUser(req.headers.get("authorization"));
  if (!user) return unauthorized();

  const body = await req.json().catch(() => null);
  if (!body?.endpoint || !body?.keys?.p256dh || !body?.keys?.auth) {
    return badRequest("Missing endpoint or keys");
  }

  const userAgent = req.headers.get("user-agent") ?? undefined;
  await savePushSubscription(user.id, {
    endpoint: body.endpoint,
    keys: { p256dh: body.keys.p256dh, auth: body.keys.auth },
  }, userAgent);

  return ok({ success: true });
}
