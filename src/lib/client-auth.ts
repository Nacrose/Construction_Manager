"use client";

// Client-side auth helpers.
//
// v2.0 server-auth decision: there is NO token in client storage. The
// httpOnly `cf_session` cookie — set by the server at login/signup/
// admin-login — is the credential. The browser attaches it automatically to
// every same-origin request (fetch, tRPC, <img src>, <a href>), and it is
// invisible to JavaScript, so an XSS payload can no longer exfiltrate a
// reusable session credential. What remains here is the non-sensitive
// `cf_user` profile cache (instant UI paint + identity-only branching) and
// small shared fetch helpers.
//
// Server truth always wins: /api/auth/me validates the session on every app
// mount (see AppGuard), sessions stay revocable by jti in the DB, and
// src/lib/csrf.ts covers the cross-site mutation risk that cookie auth
// introduces.

const USER_KEY = "cf_user";
// Legacy key from the pre-v2.0 "Bearer in localStorage" era. Browsers that
// logged in before the migration still have one lying around — it is wiped
// on the next setAuthUser/clearAuth (and its server-side session revocable
// via /api/auth/logout or expiry).
const LEGACY_TOKEN_KEY = "cf_token";

export type ClientUser = {
  id: string;
  email: string;
  name: string;
  role: string;
  organizationId?: string | null;
  orgRole?: string;
  isSuperAdmin?: boolean;
  organization?: { id: string; name: string; code: string } | null;
  // Session / impersonation metadata
  sessionKind?: "user" | "admin";
  impersonating?: boolean;
  impersonatedOrgId?: string | null;
  impersonatedOrg?: { id: string; name: string; code: string } | null;
  impersonatedReason?: string | null;
};

function wipeLegacyToken(): void {
  try {
    localStorage.removeItem(LEGACY_TOKEN_KEY);
  } catch {
    /* storage unavailable */
  }
}

export function getUser(): ClientUser | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function notifyAuthChange() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("cf:auth-change"));
  }
}

/**
 * Cache the (non-sensitive) user profile after a successful login, signup,
 * admin login, or impersonation transition. The credential itself is the
 * httpOnly cookie the server has already set — nothing secret is stored.
 */
export function setAuthUser(user: ClientUser): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  // Belt-and-braces: scrub any pre-v2.0 Bearer token left in localStorage.
  wipeLegacyToken();
  notifyAuthChange();
}

export function clearAuth(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(USER_KEY);
  wipeLegacyToken();
  // Clear service worker caches. NOTE: the SW no longer caches tRPC GET
  // responses or /api/* bytes (both are network pass-through in sw.js), so
  // there should be no authenticated data in SW storage — this is now a
  // belt-and-braces wipe for the app-shell/image caches and for any stale
  // caches left by OLDER versions of the service worker. Without it, a
  // subsequent user on the same shared browser could still read data
  // cached by an old SW version. Best-effort — failures are silently ignored.
  if (typeof caches !== "undefined") {
    try {
      caches.keys().then((keys) => {
        for (const k of keys) {
          caches.delete(k).catch(() => {});
        }
      }).catch(() => {});
    } catch {
      /* caches API not available */
    }
  }
  // Clear the IndexedDB offline mutation queue. Queued mutations from
  // the previous user must NOT be replayed under a new session — they
  // could create phantom records in another user's projects or leak
  // data via error messages. Best-effort — failures are silently
  // ignored (the queue might already be empty).
  try {
    void import("@/lib/offline-queue").then(({ clearQueue }) => clearQueue()).catch(() => {});
  } catch {
    /* offline-queue module unavailable */
  }
  notifyAuthChange();
}

// Same-origin fetch wrapper for non-tRPC requests (/api/auth, /api/search,
// /api/dashboard, file uploads, ...). The httpOnly cookie rides
// automatically — the wrapper exists so call sites have a single documented
// place for "authed fetch" and so future cross-cutting concerns (retry,
// timeout, 401 interception) have one seam. It does NOT queue offline —
// for tRPC mutations use the offline-aware fetch in `offline-fetch.ts`.
export async function fetchWithAuth(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  return fetch(input, init);
}
