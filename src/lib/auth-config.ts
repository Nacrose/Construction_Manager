/**
 * Canonical Edge-Safe Authentication Configuration
 * Shared by Next.js Edge Middleware (proxy.ts) and Node runtime auth (auth.ts).
 */

export const COOKIE_NAME = "cf_session";

export function getAuthSecret(): Uint8Array {
  const secretValue = process.env.AUTH_SECRET;

  const isProdLike =
    process.env.NODE_ENV === "production" ||
    process.env.VERCEL_ENV === "preview" ||
    process.env.VERCEL_ENV === "production" ||
    Boolean(process.env.VERCEL_ENV);

  if (!secretValue) {
    if (isProdLike) {
      // If during Next.js static build phase, return a dummy placeholder so build passes.
      // But at runtime, refuse to operate and fail loudly!
      if (process.env.NEXT_PHASE === "phase-production-build") {
        return new TextEncoder().encode("__build_placeholder_secret_min_32_bytes__");
      }

      throw new Error(
        "[FATAL] AUTH_SECRET environment variable is missing in production. A secure secret of at least 32 characters is mandatory."
      );
    }

    // Development fallback (insecure — only for local dev)
    return new TextEncoder().encode(
      "dev-only-insecure-secret-please-set-AUTH_SECRET-in-production-32bytes-min"
    );
  }

  if (isProdLike && secretValue.length < 32) {
    if (process.env.NEXT_PHASE !== "phase-production-build") {
      throw new Error(
        `[FATAL] AUTH_SECRET in production is too short (${secretValue.length} chars). Minimum 32 characters required for cryptographic security.`
      );
    }
  }

  return new TextEncoder().encode(secretValue);
}
