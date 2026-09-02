// Server-side auth: bcrypt password hashing + DB-backed JWT sessions (jose).
//
// v2.0 server-auth decision: the httpOnly `cf_session` cookie IS the
// credential. It is set by the login/signup/admin-login route handlers and
// verified on every request; the JWT it carries is a DB session pointer
// (jti), so sessions stay revocable server-side. The Authorization: Bearer
// header is still accepted as a fallback (see extractToken) for machine
// flows and the transition window, but no client code stores or sends a
// token anymore — see src/lib/client-auth.ts and src/lib/csrf.ts.
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { COOKIE_NAME, getAuthSecret } from "@/lib/auth-config";

const SESSION_DAYS = 7;
// Admin sessions are deliberately short-lived (platform-tier access).
const ADMIN_SESSION_MINS = Math.max(
  1,
  Number(process.env.ADMIN_SESSION_MINS ?? "60") || 60,
);

// Lazy initialization — only compute the secret when first needed,
// not at module load time (which would break the build in production
// if AUTH_SECRET isn't set during the build step).
let _secret: Uint8Array | null = null;
function secret(): Uint8Array {
  if (!_secret) {
    _secret = getAuthSecret();
  }
  return _secret;
}

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: string;
  avatarUrl?: string | null;
  organizationId?: string | null;
  orgRole?: string;
  // `isSuperAdmin` is the EFFECTIVE flag used by tenant procedures and RLS:
  // it is forced to false while a superadmin is impersonating a tenant org
  // (so god-view branches + RLS scope to that org). `isPlatformAdmin` always
  // reflects the real superadmin status (used by the admin console + audit).
  isSuperAdmin?: boolean;
  isPlatformAdmin?: boolean;
  organization?: { id: string; name: string; code: string } | null;
  // Session / impersonation metadata
  sessionKind?: "user" | "admin";
  sessionId?: string; // JWT jti — server-only, never returned to the client
  impersonating?: boolean;
  impersonatedOrgId?: string | null;
  impersonatedOrg?: { id: string; name: string; code: string } | null;
  impersonatedReason?: string | null;
};

// ─── password helpers ──────────────────────────────────────────
export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12);
}

export async function verifyPassword(
  plain: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

// ─── JWT + session ─────────────────────────────────────────────
export async function createSession(
  userId: string,
  opts?: { kind?: "user" | "admin"; expiresInMins?: number },
): Promise<string> {
  const kind = opts?.kind ?? "user";
  const expiresInMins =
    opts?.expiresInMins ?? SESSION_DAYS * 24 * 60;
  const expiresAt = new Date(Date.now() + expiresInMins * 60 * 1000);
  const jti = crypto.randomUUID();

  await db.session.create({
    data: { id: jti, userId, token: jti, kind, expiresAt },
  });

  const token = await new SignJWT({ kind })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setJti(jti)
    .setExpirationTime(expiresAt)
    .setIssuedAt()
    .sign(secret());

  return token;
}

// Platform-admin session: short-lived, kind-tagged, used only for /admin.
export async function createAdminSession(userId: string): Promise<string> {
  return createSession(userId, { kind: "admin", expiresInMins: ADMIN_SESSION_MINS });
}

/**
 * Set or clear the impersonation target on a session (by JWT jti).
 * When `null`, impersonation is cleared.
 */
export async function setImpersonation(
  jti: string,
  impersonation: { organizationId: string; reason: string } | null,
): Promise<void> {
  await db.session.update({
    where: { token: jti },
    data: impersonation
      ? {
          impersonatedOrgId: impersonation.organizationId,
          impersonatedAt: new Date(),
          impersonatedReason: impersonation.reason,
        }
      : {
          impersonatedOrgId: null,
          impersonatedAt: null,
          impersonatedReason: null,
        },
  });
}

// Strip server-only fields (e.g. sessionId / jti) before returning a user
// object to the client.
export function sanitizeAuthUser(u: AuthUser): Omit<AuthUser, "sessionId"> {
  const { sessionId: _sessionId, ...rest } = u;
  return rest;
}

// Legacy: set cookie (may not work through all gateways, but kept as fallback)
export async function setSessionCookie(userId: string): Promise<string> {
  const token = await createSession(userId);
  try {
    const store = await cookies();
    store.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: true,
      // Lax is the safe default — blocks cross-site POST/PUT but allows
      // top-level navigations. SameSite=None widens CSRF surface and is
      // only needed if the app is embedded in cross-site iframes. Cross-site
      // POST risk is additionally covered server-side by src/lib/csrf.ts.
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_DAYS * 24 * 60 * 60,
    });
  } catch {
    // cookies() not available in some contexts — that's OK, the token is returned
  }
  return token;
}

export async function clearSessionCookie(): Promise<void> {
  // ALWAYS delete the cookie — post-v2.0 it IS the credential, so leaving it
  // behind after logout on a shared machine is a session-hijack gift. (The
  // previous implementation skipped the cookie delete whenever an
  // Authorization header was present.) The DB session row the cookie points
  // at is revoked by jti, defence in depth against cookie re-use.
  let token: string | null = null;
  try {
    const store = await cookies();
    token = store.get(COOKIE_NAME)?.value ?? null;
    store.delete(COOKIE_NAME);
  } catch {
    /* cookies() not available */
  }
  if (token) {
    try {
      const { payload } = await jwtVerify(token, secret());
      if (payload.jti) {
        await db.session.deleteMany({ where: { token: payload.jti } });
      }
    } catch {
      /* token invalid — nothing to revoke */
    }
  }
}

/**
 * Extract the session JTI from the JWT in the Authorization header (or
 * cookie). Returns null if the token is missing or invalid. Exposed so
 * callers (e.g. /api/auth/logout) can revoke the session by JTI directly.
 */
export async function getSessionJti(
  authHeader?: string | null
): Promise<string | null> {
  let token: string | null = null;
  if (authHeader?.startsWith("Bearer ")) {
    token = authHeader.slice(7);
  } else {
    try {
      const store = await cookies();
      token = store.get(COOKIE_NAME)?.value ?? null;
    } catch {
      /* cookies() not available */
    }
  }
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload.jti ?? null;
  } catch {
    return null;
  }
}

// Extract token from either the Authorization header OR the cookie.
async function extractToken(authHeader?: string | null): Promise<string | null> {
  // Try Authorization header first (most reliable through gateways)
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }

  // Fall back to cookie
  try {
    const store = await cookies();
    return store.get(COOKIE_NAME)?.value ?? null;
  } catch {
    return null;
  }
}

// Returns the authenticated user, or null. Also prunes expired sessions.
export async function getCurrentUser(authHeader?: string | null): Promise<AuthUser | null> {
  const token = await extractToken(authHeader);
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, secret());
    if (!payload.sub || !payload.jti) return null;

    const session = await db.session.findUnique({
      where: { token: payload.jti },
      select: {
        expiresAt: true,
        userId: true,
        kind: true,
        impersonatedOrgId: true,
        impersonatedAt: true,
        impersonatedReason: true,
      },
    });
    if (!session) return null;
    if (session.expiresAt < new Date()) {
      await db.session.delete({ where: { token: payload.jti } }).catch(() => {});
      return null;
    }

    const user = await db.user.findUnique({
      where: { id: session.userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        avatarUrl: true,
        organizationId: true,
        orgRole: true,
        isSuperAdmin: true,
        organization: { select: { id: true, name: true, code: true } },
      },
    });
    if (!user) return null;

    // Impersonation: a superadmin temporarily acts *within* a tenant org.
    // The real admin identity (user.id) is preserved for audit attribution.
    // The effective role is downgraded to a plain `member` of that org so that
    // NO org god-view branch is ever triggered — every tenant query then
    // relies on app-level org/membership filters, which is the only reliable
    // isolation given RLS is not enforced per-request under connection
    // pooling. Project-level access within the org is granted centrally via
    // assertProjectMember (see src/lib/authz.ts), so the admin can still read
    // and act on the org's projects without ever touching another org.
    const isPlatformAdmin = !!user.isSuperAdmin;
    const impersonating = isPlatformAdmin && !!session.impersonatedOrgId;
    let impersonatedOrg: { id: string; name: string; code: string } | null = null;
    if (impersonating && session.impersonatedOrgId) {
      impersonatedOrg = await db.organization
        .findUnique({
          where: { id: session.impersonatedOrgId },
          select: { id: true, name: true, code: true },
        })
        .catch(() => null);
    }

    // Effective (tenant-facing) identity.
    const effectiveOrgId = impersonating ? session.impersonatedOrgId : user.organizationId;
    const effectiveIsSuperAdmin = impersonating ? false : isPlatformAdmin;
    const effectiveOrgRole = impersonating ? "member" : user.orgRole;

    // Refresh lastActiveAt (presence indicator for DMs).
    // This is non-critical — wrapped in a separate try/catch so that
    // if the lastActiveAt column doesn't exist yet (before /api/setup
    // is run), authentication still succeeds.
    try {
      await db.$executeRawUnsafe(
        `UPDATE "User" SET "lastActiveAt" = NOW() WHERE "id" = $1 AND EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'User' AND column_name = 'lastActiveAt'
        )`,
        user.id
      );
    } catch {
      // Non-critical — presence tracking won't work but auth succeeds
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      avatarUrl: user.avatarUrl,
      organizationId: effectiveOrgId,
      orgRole: effectiveOrgRole,
      isSuperAdmin: effectiveIsSuperAdmin,
      isPlatformAdmin,
      organization: user.organization,
      sessionKind: (session.kind as "user" | "admin") ?? "user",
      sessionId: payload.jti,
      impersonating,
      impersonatedOrgId: impersonating ? session.impersonatedOrgId : null,
      impersonatedOrg,
      impersonatedReason: session.impersonatedReason ?? null,
    };
  } catch {
    return null;
  }
}

// Throws if not authenticated. Use in Server Components / Route Handlers.
export async function requireUser(): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("UNAUTHENTICATED");
  }
  return user;
}

export const SESSION_COOKIE = COOKIE_NAME;
