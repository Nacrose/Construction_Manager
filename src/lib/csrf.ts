/**
 * CSRF defense: strict Origin/Referer validation for state-changing requests.
 *
 * Context (v2.0 server-auth decision): authentication moved to the httpOnly
 * `cf_session` cookie as the single credential. Cookie-authenticated
 * mutations make CSRF a real attack surface — Bearer-header auth was
 * inherently immune, cookies are not. `SameSite=Lax` on the cookie already
 * blocks most cross-site POSTs in modern browsers, but it is a client-side
 * hint with known edge cases (legacy browsers, same-site subdomain
 * confusion, top-level navigations). This module makes the defense
 * explicit, server-enforced, and testable.
 *
 * Policy for unsafe methods (POST / PUT / PATCH / DELETE):
 *   1. If an `Origin` header is present, it must match the request's
 *      client-visible host (X-Forwarded-Host, else Host) and — when the
 *      deployment scheme is known (X-Forwarded-Proto) — its scheme.
 *   2. Else if `Referer` is present, its origin must match the same way.
 *   3. If NEITHER header is present, allow: CSRF requires a browser context,
 *      and non-browser clients (curl, cron, server-to-service) legitimately
 *      omit both. Such requests still need a valid credential to do anything.
 *
 * Safe methods (GET/HEAD/OPTIONS) always pass.
 */
import { NextResponse } from "next/server";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** Client-visible hosts this request was addressed to, most authoritative first. */
function expectedHosts(req: Request): string[] {
  const hosts: string[] = [];
  // Behind a reverse proxy the original Host is forwarded here — trust it first.
  const forwarded = req.headers.get("x-forwarded-host");
  if (forwarded) {
    // X-Forwarded-Host can be a comma-separated proxy chain; the first entry
    // is what the client's browser actually addressed.
    const first = forwarded.split(",")[0]?.trim();
    if (first) hosts.push(first);
  }
  const host = req.headers.get("host");
  if (host?.trim()) hosts.push(host.trim());
  return hosts;
}

/** Deployment scheme when known (behind a TLS-terminating proxy), else null. */
function expectedProtos(req: Request): string[] | null {
  const forwarded = req.headers.get("x-forwarded-proto");
  if (!forwarded) return null;
  const first = forwarded.split(",")[0]?.trim().toLowerCase();
  return first ? [first] : null;
}

/** True when `origin` (a URL string) matches the request's host + scheme. */
export function originMatches(req: Request, origin: string): boolean {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    // Includes the literal "null" origin (sandboxed iframes, some redirects).
    return false;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;

  const hosts = expectedHosts(req);
  if (hosts.length === 0) return false;
  if (!hosts.includes(url.host)) return false;

  // When we know the public scheme, require an exact match — an `http://`
  // origin for an `https://` deployment is itself an attack signal.
  const protos = expectedProtos(req);
  if (protos && !protos.includes(url.protocol.replace(":", ""))) return false;

  return true;
}

/**
 * Returns a 403 response when a state-changing request fails the origin
 * check, or null when the request may proceed. Wire at the top of every
 * mutation route handler:
 *
 *   const denied = assertSameOrigin(req);
 *   if (denied) return denied;
 */
export function assertSameOrigin(req: Request): NextResponse | null {
  if (SAFE_METHODS.has(req.method)) return null;

  const origin = req.headers.get("origin");
  if (origin !== null) {
    return originMatches(req, origin)
      ? null
      : csrfRejected();
  }

  // Modern browsers send Origin on every cross-origin and same-origin POST;
  // some older/edge setups only send Referer. Fall back to it when present.
  const referer = req.headers.get("referer");
  if (referer !== null) {
    let refererOrigin: string;
    try {
      refererOrigin = new URL(referer).origin;
    } catch {
      return csrfRejected();
    }
    return originMatches(req, refererOrigin) ? null : csrfRejected();
  }

  // No Origin and no Referer — not a browser flow (curl / cron / inter-service).
  return null;
}

function csrfRejected(): NextResponse {
  return NextResponse.json(
    { error: "Cross-origin request blocked." },
    { status: 403 },
  );
}
