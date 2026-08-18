// Server-side auth: bcrypt password hashing + JWT (jose).
// Supports TWO auth methods:
// 1. HttpOnly cookie (cf_session) — for page navigation via the proxy
// 2. Authorization: Bearer <token> header — for API calls from the client
//    (this is the reliable method through the TLS-terminating gateway)
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { db } from "@/lib/db";

const COOKIE_NAME = "cf_session";
const SESSION_DAYS = 7;

// ── AUTH_SECRET validation ────────────────────────────────────
// In production, AUTH_SECRET MUST be set. If missing, the app will
// throw on first auth call — rather than silently using an insecure
// default that could be exploited.
function getAuthSecret(): Uint8Array {
  const secretValue = process.env.AUTH_SECRET;
  if (!secretValue) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "FATAL: AUTH_SECRET environment variable is not set. " +
        "Generate one with: openssl rand -base64 32 " +
        "Then add AUTH_SECRET=xxx to your .env file."
      );
    }
    // Development fallback (insecure — only for local dev)
    console.warn(
      "⚠️  AUTH_SECRET not set — using insecure dev-only secret. " +
      "Set AUTH_SECRET in production with: openssl rand -base64 32"
    );
    return new TextEncoder().encode(
      "dev-only-insecure-secret-please-set-AUTH_SECRET-in-production-32bytes-min"
    );
  }
  if (secretValue.length < 32) {
    throw new Error(
      "FATAL: AUTH_SECRET must be at least 32 characters. " +
      "Generate a stronger one with: openssl rand -base64 32"
    );
  }
  return new TextEncoder().encode(secretValue);
}

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
  organization?: { id: string; name: string; code: string } | null;
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
export async function createSession(userId: string): Promise<string> {
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  const jti = crypto.randomUUID();

  await db.session.create({
    data: { id: jti, userId, token: jti, expiresAt },
  });

  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setJti(jti)
    .setExpirationTime(expiresAt)
    .setIssuedAt()
    .sign(secret());

  return token;
}

// Legacy: set cookie (may not work through all gateways, but kept as fallback)
export async function setSessionCookie(userId: string): Promise<string> {
  const token = await createSession(userId);
  try {
    const store = await cookies();
    store.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: true,
      sameSite: "none",
      path: "/",
      maxAge: SESSION_DAYS * 24 * 60 * 60,
    });
  } catch {
    // cookies() not available in some contexts — that's OK, the token is returned
  }
  return token;
}

export async function clearSessionCookie(authHeader?: string | null): Promise<void> {
  // Extract the JWT from the Authorization header (preferred) OR the cookie.
  // Without this, a client using only a Bearer token would have its session
  // remain valid after logout.
  let token: string | null = null;
  if (authHeader?.startsWith("Bearer ")) {
    token = authHeader.slice(7);
  }
  if (!token) {
    try {
      const store = await cookies();
      token = store.get(COOKIE_NAME)?.value ?? null;
      store.delete(COOKIE_NAME);
    } catch {
      /* cookies() not available */
    }
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
      select: { expiresAt: true, userId: true },
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
        organization: { select: { id: true, name: true, code: true } },
      },
    });
    if (!user) return null;

    // Refresh lastActiveAt (presence indicator for DMs).
    // This is non-critical — wrapped in a separate try/catch so that
    // if the lastActiveAt column doesn't exist yet (before /api/setup
    // is run), authentication still succeeds.
    // We use $executeRaw to avoid Prisma's generated query referencing
    // the column in a way that breaks findUnique.
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

    return user;
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
