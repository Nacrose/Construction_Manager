/**
 * Browser runtime instrumentation for Sentry.
 *
 * Loaded by Next.js automatically as the client-side entry. When
 * NEXT_PUBLIC_SENTRY_DSN is unset the SDK stays inert, so this is safe to
 * ship everywhere. Requires the CSP `connect-src` widening in
 * next.config.ts (NEXT_PUBLIC_SENTRY_CSP_INGEST) to actually be able to
 * send events — otherwise the browser blocks the POST silently.
 *
 * Docs: docs/plans/sentry-integration.md
 */
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? "development",
  release: process.env.NEXT_PUBLIC_SENTRY_RELEASE ?? undefined,
  tracesSampleRate: 0,
  sendDefaultPii: false,
  // Session Replay stays off — recording the DOM of financial screens
  // (payroll, trial balance) is a privacy liability for this product.
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,
});
