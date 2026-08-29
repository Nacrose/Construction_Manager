/**
 * Thin wrapper around the Sentry SDK.
 *
 * The rest of the codebase routes telemetry through here instead of
 * importing @sentry/nextjs directly — one place to filter noise, redact
 * PII, or swap the provider (e.g. GlitchTip) later.
 *
 * All functions are fail-soft: telemetry must never break a request, and
 * when no DSN is configured the SDK is inert.
 */
import * as Sentry from "@sentry/nextjs";

/** tRPC error codes that are EXPECTED business outcomes, not defects. */
const EXPECTED_TRPC_CODES = new Set([
  "BAD_REQUEST", // zod validation failures / user input errors
  "UNAUTHORIZED", // not logged in
  "FORBIDDEN", // authz denials (role checks)
  "NOT_FOUND", // missing or cross-tenant ids
  "CONFLICT", // duplicate-key business conflicts
  "PRECONDITION_FAILED", // fiscal-lock and state-machine guards
]);

/**
 * Capture a server-side error with optional tags. `trpcCode` (when
 * provided) suppresses expected business errors so the error budget is
 * spent on real faults — a user fat-fingering a form is not a bug.
 */
export function captureServerError(
  err: unknown,
  opts: {
    tags?: Record<string, string | undefined>;
    userId?: string | undefined;
    trpcCode?: string | undefined;
  } = {},
): void {
  if (opts.trpcCode && EXPECTED_TRPC_CODES.has(opts.trpcCode)) return;
  try {
    Sentry.withScope((scope) => {
      for (const [key, value] of Object.entries(opts.tags ?? {})) {
        if (value != null) scope.setTag(key, value);
      }
      // Opaque ids only — never names/emails/phones (sendDefaultPii: false
      // at init, and we keep it that way here).
      if (opts.userId) scope.setUser({ id: opts.userId });
      Sentry.captureException(err);
    });
  } catch {
    // Telemetry must never take the request down with it.
  }
}
