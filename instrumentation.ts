/**
 * Server runtime instrumentation for Sentry (Next.js 15.3+ / 16).
 *
 * Loaded by Next.js automatically BEFORE the app boots. When SENTRY_DSN is
 * unset the SDK stays inert (init with no DSN is a no-op), so this file is
 * safe to ship to environments without telemetry.
 *
 * Docs: docs/plans/sentry-integration.md
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const Sentry = await import("@sentry/nextjs");
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
      release: process.env.SENTRY_RELEASE ?? undefined,
      // Error tracking only for now — no tracing/replay (cost + privacy
      // discipline; see plan §2). Flip tracesSampleRate up if latency
      // telemetry is ever needed.
      tracesSampleRate: 0,
      sendDefaultPii: false,
      beforeSend(event) {
        // Never ship request bodies — financial mutations (payroll, JE
        // posting) must not leak amounts or counterparty names into
        // telemetry.
        if (event.request) delete event.request.data;
        return event;
      },
    });

    // Background worker: transactional-outbox dispatch + maintenance
    // sweeps (bank-guarantee expiry, session cleanup). Idempotent per
    // process; every job failure is caught and logged, never thrown into
    // the server boot path. Delayed 5s so boot (and the DB pool) settle
    // before the first tick.
    if (process.env.DISABLE_BACKGROUND_WORKER !== "1") {
      const { startBackgroundJobs } = await import("@/server/utils/background-jobs");
      startBackgroundJobs({ initialDelayMs: 5_000 });
    }
  }
}

/**
 * Captures errors thrown inside nested React Server Components
 * (not reachable via route handler try/catch).
 */
export const onRequestError = async (...args: unknown[]) => {
  const Sentry = await import("@sentry/nextjs");
  // @ts-expect-error — Sentry's signature types this properly; our spread
  // is intentionally loose because this file predates the SDK types.
  return Sentry.captureRequestError(...args);
};
