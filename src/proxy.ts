/**
 * Server-side middleware gate for the (app) and admin route groups.
 *
 * The existing client-side AppGuard is kept as an optimistic UX layer, but
 * relying on it alone meant the static HTML of protected pages (including
 * the /admin shell and nav structure) was served to anyone — even before
 * the client redirect kicked in. This middleware enforces auth at the
 * edge so unauthenticated requests never reach the route handlers or
 * server components under the protected paths.
 *
 * Auth is accepted via EITHER:
 *   - Authorization: Bearer <jwt> header (the gateway-reliable method), OR
 *   - cf_session cookie (legacy fallback)
 *
 * We do a lightweight JWT verify (jose) without hitting the DB — the
 * full session check still happens per-request in tRPC/route handlers.
 * This middleware only decides whether the request is allowed to proceed
 * to the protected subtree at all.
 */
import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

const COOKIE_NAME = "cf_session";

// Paths that require authentication. We match by prefix so nested
// routes are covered automatically.
const PROTECTED_PREFIXES = ["/dashboard", "/projects", "/admin", "/finance", "/sync", "/team", "/presets", "/activity", "/rate-catalogs"];

function getAuthSecret(): Uint8Array | null {
  const v = process.env.AUTH_SECRET;
  if (!v) {
    // In production, AUTH_SECRET is required for the rest of the auth
    // stack to function — if missing, fail open so the app doesn't get
    // locked out entirely (the rest of auth will fail loudly anyway).
    if (process.env.NODE_ENV === "production" && process.env.VERCEL_ENV !== "development") {
      // Use a placeholder that won't verify any real token — every
      // request will fail the jwtVerify and be redirected to /login.
      // This is the safest behavior when AUTH_SECRET is missing.
      return new TextEncoder().encode("__missing_auth_secret__");
    }
    return new TextEncoder().encode("dev-only-insecure-secret-please-set-AUTH_SECRET-in-production-32bytes-min");
  }
  return new TextEncoder().encode(v);
}

async function isAuthed(req: NextRequest): Promise<boolean> {
  const authHeader = req.headers.get("authorization");
  let token: string | null = null;
  if (authHeader?.startsWith("Bearer ")) {
    token = authHeader.slice(7);
  } else {
    token = req.cookies.get(COOKIE_NAME)?.value ?? null;
  }
  if (!token) return false;

  const secret = getAuthSecret();
  if (!secret) return false;

  try {
    await jwtVerify(token, secret);
    return true;
  } catch {
    return false;
  }
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // The /admin/login page must remain reachable when unauthenticated.
  if (pathname === "/admin/login") {
    return NextResponse.next();
  }

  const isProtected = PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
  if (!isProtected) {
    return NextResponse.next();
  }

  if (await isAuthed(req)) {
    return NextResponse.next();
  }

  // Redirect to login, preserving the originally requested path.
  const loginUrl = req.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.search = "";
  loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // Match all paths under the protected prefixes (including their
  // nested routes), but skip Next.js internals and static assets.
  matcher: [
    "/dashboard/:path*",
    "/dashboard",
    "/projects/:path*",
    "/projects",
    "/admin/:path*",
    "/admin",
    "/finance/:path*",
    "/finance",
    "/sync/:path*",
    "/sync",
    "/team/:path*",
    "/team",
    "/presets/:path*",
    "/presets",
    "/activity/:path*",
    "/activity",
    "/rate-catalogs/:path*",
    "/rate-catalogs",
  ],
};
