/**
 * Canonical Edge-Safe Authentication Configuration
 * Shared by Next.js Edge Middleware (proxy.ts) and Node runtime auth (auth.ts).
 */

export const COOKIE_NAME = "cf_session";

export function getAuthSecret(): Uint8Array {
  const secretValue = process.env.AUTH_SECRET;
  if (!secretValue) {
    // Treat any non-local-dev environment as production: Vercel preview,
    // staging, and any environment where VERCEL_ENV is set.
    const isProdLike =
      process.env.NODE_ENV === "production" ||
      process.env.VERCEL_ENV === "preview" ||
      process.env.VERCEL_ENV === "production" ||
      Boolean(process.env.VERCEL_ENV);

    if (isProdLike) {
      // In production/staging/preview environments, fail closed:
      // use a non-verifying secret placeholder so tokens cannot verify
      // against a known dev secret.
      return new TextEncoder().encode("__missing_auth_secret__");
    }

    // Development fallback (insecure — only for local dev)
    return new TextEncoder().encode(
      "dev-only-insecure-secret-please-set-AUTH_SECRET-in-production-32bytes-min"
    );
  }

  return new TextEncoder().encode(secretValue);
}
