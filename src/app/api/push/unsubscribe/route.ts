import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { removePushSubscription } from "@/server/utils/push";
import { ok, unauthorized, badRequest } from "@/lib/api";
import { assertSameOrigin } from "@/lib/csrf";

/**
 * POST /api/push/unsubscribe
 *
 * Remove a push subscription (when user disables notifications).
 * Body: { endpoint: string }
 */
export async function POST(req: NextRequest) {
  const denied = assertSameOrigin(req);
  if (denied) return denied;

  const user = await getCurrentUser(req.headers.get("authorization"));
  if (!user) return unauthorized();

  const body = await req.json().catch(() => null);
  if (!body?.endpoint) {
    return badRequest("Missing endpoint");
  }

  await removePushSubscription(body.endpoint, user.id);
  return ok({ success: true });
}
