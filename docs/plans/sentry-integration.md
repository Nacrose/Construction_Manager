# Error Tracking Integration Plan — Sentry

**Status:** WIRED (2026-08-30) — SDK installed and inert-by-default; **activation requires setting `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` (+ optional CSP ingest + CI secrets) in the deployment environment**. Deploy inert-first, then flip the DSN on (plan §4 step 7).
**Scope:** App-wide error tracking (server + client + tRPC), release tracking, source maps, for a Next.js 16 App Router deployment.
**Author:** repo governance agent · **Date:** 2026-08-30

> **As-built note (§3.5):** tRPC v11's `initTRPC.create()` does NOT accept an `onError` option (unlike some adapters) — the funnel therefore lives in the fetch adapter handler at `src/app/api/trpc/[trpc]/route.ts` (`fetchRequestHandler({ onError })`), not in `src/server/trpc.ts`. Filtering of expected error codes (zod/authz/lock guards) happens in `src/lib/error-tracking.ts` (`captureServerError`), which is the single import point for the SDK outside the instrumentation files.

---

## 1. Recommendation

Adopt **Sentry SaaS (sentry.io) with `@sentry/nextjs`** now; it is free up to 5k errors/month — comfortably above the volume a Nepali-SME contractor SaaS at early scale will produce. If cost or data-residency becomes a concern later, the SDK is wire-compatible with **GlitchTip** (self-hosted, same DSN protocol), so switching later is a config change, not a code change. Self-hosting full Sentry is **not** recommended (it is a heavy multi-service deployment, disproportionate for this team size).

Why error tracking matters for *this* product specifically: the app is **office-critical** (payroll, VAT, JE posting) and **online-only** — when an office clerk hits a 500 mid-payroll-run today there is no offline fallback, and without telemetry we only learn about it if the customer complains. Budget math and trial-balance integrity regressions found in phases 1–5 were all silent-wrong-number bugs; runtime equivalents (a thrown posting error, a failed transaction) are exactly what this catches.

## 2. What we will NOT enable (cost/privacy discipline)

- **Session Replay** — off initially (recording DOM of financial screens is a privacy liability; revisit only if users request support replay).
- **Performance tracing / profiling** — `tracesSampleRate: 0` initially. The GL posting path already has its own atomicity guarantees; APM can come later if latency complaints appear.
- **`sendDefaultPii`** — stays `false`. We tag events with `userId` + `organizationId` only (both opaque ids), never names/emails/phones.

## 3. Wiring plan (copy-paste ready)

### 3.1 Install

```bash
npm i @sentry/nextjs
```

### 3.2 `instrumentation.ts` (repo root — server runtime; file does not exist yet)

```ts
import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,            // unset → SDK is a no-op; safe to deploy inert
      environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
      release: process.env.SENTRY_RELEASE,     // git SHA, set in CI/build
      tracesSampleRate: 0,
      sendDefaultPii: false,
      beforeSend(event) {
        // Never ship request bodies of financial mutations
        if (event.request) delete event.request.data;
        return event;
      },
    });
  }
}

// Captures errors in nested React Server Components (Next.js 15+)
export const onRequestError = Sentry.captureRequestError;
```

### 3.3 `instrumentation-client.ts` (repo root — browser runtime)

```ts
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? "development",
  release: process.env.NEXT_PUBLIC_SENTRY_RELEASE,
  tracesSampleRate: 0,
  sendDefaultPii: false,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,
});
```

### 3.4 CSP change in `next.config.ts` — **required, easy to miss**

The current CSP has `connect-src 'self'` (see `next.config.ts`). The browser SDK POSTs events to `https://<key>.ingest.sentry.io` → **it will be silently blocked** unless the ingest host is allowlisted. Change:

```ts
const sentryIngest = process.env.NEXT_PUBLIC_SENTRY_CSP_INGEST; // e.g. "https://abc123.ingest.sentry.io"
const csp = [
  // …unchanged directives…
  `connect-src 'self'${sentryIngest ? ` ${sentryIngest}` : ""}${isDev ? " ws: wss: http://localhost:*" : ""}`,
].join("; ");
```

Keeping it env-driven means dev/CI (no Sentry) keep the strictest possible CSP, and only the Sentry-enabled deployment widens it. If a custom subdomain tunnel is ever used for the browser SDK (to dodge ad-blockers), its host must be added the same way.

### 3.5 tRPC error funnel (`src/server/trpc.ts`)

Route handlers and React errors are covered automatically by the instrumentation files above; **tRPC procedure errors are not** (they are returned as normal JSON responses). Add a capture in the `onError` of the tRPC init:

```ts
import * as Sentry from "@sentry/nextjs";

export const t = initTRPC.context<Context>().create({
  errorFormatter({ shape, error }) { /* existing formatter stays */ },
  onError({ error, path, ctx }) {
    if (error.code !== "BAD_REQUEST" && error.code !== "NOT_FOUND" && error.code !== "FORBIDDEN" && error.code !== "UNAUTHORIZED" && error.code !== "CONFLICT") {
      Sentry.withScope((scope) => {
        scope.setTag("trpc.path", path ?? "unknown");
        if (ctx?.user?.id) scope.setUser({ id: ctx.user.id });
        Sentry.captureException(error);
      });
    }
  },
});
```

Filtering the "expected" codes (validation/authz) keeps the error budget for real faults — a user fat-fingering a form is not a defect.

### 3.6 Environment variables (`.env.example` additions)

```bash
# ── Error tracking (Sentry) — all optional; unset = SDK inert ──
SENTRY_DSN=                     # server DSN from Sentry project settings
NEXT_PUBLIC_SENTRY_DSN=         # same value, exposed to browser
SENTRY_ENVIRONMENT=production
NEXT_PUBLIC_SENTRY_ENVIRONMENT=production
SENTRY_RELEASE=                 # git SHA — set by CI/build, not by hand
NEXT_PUBLIC_SENTRY_RELEASE=
NEXT_PUBLIC_SENTRY_CSP_INGEST=  # e.g. https://abc123.ingest.sentry.io (for connect-src)
SENTRY_AUTH_TOKEN=              # CI only — source-map upload
SENTRY_ORG=
SENTRY_PROJECT=
```

### 3.7 `next.config.ts` source maps

```ts
import { withSentryConfig } from "@sentry/nextjs";

export default withSentryConfig(nextConfig, {
  silent: true,
  // Upload only when a token exists (local/CI-without-secrets stays quiet)
  sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
  widenClientWindowRequest: true,
});
```

Source maps are built by Next in production and uploaded at build time when `SENTRY_AUTH_TOKEN` is present; Sentry then shows readable stack traces (TS + JSX + minified client chunks) keyed to the `SENTRY_RELEASE` SHA.

### 3.8 CI (`.github/workflows/ci.yml`) — build job additions

```yaml
- name: Build (with optional Sentry sourcemaps)
  run: npm run build
  env:
    SENTRY_AUTH_TOKEN: ${{ secrets.SENTRY_AUTH_TOKEN }}
    SENTRY_ORG: ${{ secrets.SENTRY_ORG }}
    SENTRY_PROJECT: ${{ secrets.SENTRY_PROJECT }}
    SENTRY_RELEASE: ${{ github.sha }}
```

No new job needed — the existing build step becomes the uploader when the three secrets are configured. Verify once by checking the release appears in Sentry with committed source maps.

## 4. Verification checklist (after wiring)

1. `npm run build` with no `SENTRY_DSN` → SDK inert, build green, CSP unchanged (strictest).
2. With DSN set: `npx @sentry/wizard@latest -i nextjs` NOT required (we wired manually), but its doctor mode (`npx @sentry/wizard@latest --integration nextjs --debug`) can sanity-check the setup — optional.
3. Trigger a deliberate server error in staging (e.g. throw in a test tRPC procedure) → event appears with `trpc.path` tag, correct release + environment, no request body.
4. Trigger a client error (button that throws in a staging-only page) → event with sourcemapped stack.
5. Browser devtools network tab → POST to ingest host is 200, **not** blocked by CSP report.
6. tRPC validation errors (zod failures) do NOT generate events (filtered).
7. Deploy inert-first: merge the wiring with no DSN in prod env, confirm zero regressions over one day, then set the DSN and flip it live. Rollback = unset the DSN.

## 5. Effort & cost

- Implementation: **~2 hours** (files above + CSP + CI) + ~30 min verification in staging.
- Ongoing: free tier (5k errors/mo, 1 user). GlitchTip self-host on a $5 VPS is the escape hatch if the volume grows past free.
- No runtime overhead when disabled; when enabled, the SDK is async and does not block request paths.

## 6. Decision points (need your call)

1. **SaaS vs GlitchTip** — recommend Sentry SaaS to start; nothing to host.
2. **Tracing** — recommend off; flip on later only if needed (`tracesSampleRate`).
3. **Client error tracking** — recommended ON (minified stacks are useless otherwise); if you want server-only, skip `instrumentation-client.ts` and the CSP change entirely.
