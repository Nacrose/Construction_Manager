import { NextRequest } from "next/server";
import { getCurrentUser, sanitizeAuthUser } from "@/lib/auth";
import { ok, unauthorized } from "@/lib/api";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req.headers.get("authorization"));
  if (!user) return unauthorized();
  return ok({ user: sanitizeAuthUser(user) });
}
