import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const isDev = process.env.NODE_ENV === "development";

/**
 * Content-Security-Policy (audit hardening item).
 *
 * Notes on the chosen directives:
 * - script-src includes 'unsafe-inline' because Next.js's bootstrap and
 *   hydration payloads are inline <script> tags (a strict nonce-based CSP
 *   requires middleware nonce injection — tracked as future work).
 * - 'unsafe-eval' is ONLY added in development (React Refresh needs it);
 *   production code contains no eval / new Function.
 * - img-src / frame-src allow data: + https: + http: because scanned-bill
 *   URLs may be inline base64 scans OR absolute web links (see
 *   src/lib/safe-url.ts allowlist).
 * - connect-src is 'self' — the app talks to its own API only; dev adds
 *   ws/wss for HMR. When Sentry is enabled, the deployment also sets
 *   NEXT_PUBLIC_SENTRY_CSP_INGEST (e.g. https://abc123.ingest.sentry.io)
 *   so the browser SDK can POST events — env-driven on purpose so
 *   Sentry-less builds keep the strictest possible CSP.
 */
const sentryIngest = process.env.NEXT_PUBLIC_SENTRY_CSP_INGEST;
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'", // Tailwind + inline style props
  "img-src 'self' data: blob: https: http:",
  "font-src 'self' data:",
  "frame-src 'self' data: blob:", // inline PDF scan iframes
  "media-src 'self' blob:", // voice recorder / site media
  `connect-src 'self'${sentryIngest ? ` ${sentryIngest}` : ""}${isDev ? " ws: wss: http://localhost:*" : ""}`,
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
].join("; ");

const securityHeaders = [
  {
    key: "X-DNS-Prefetch-Control",
    value: "on",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "X-Frame-Options",
    value: "SAMEORIGIN",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    // microphone (voice recorder in chat) and geolocation (geo-tagged
    // report photos) are USED by the app — allow for same-origin only.
    // camera is not used anywhere and stays disabled.
    key: "Permissions-Policy",
    value: "camera=(), microphone=(self), geolocation=(self)",
  },
  {
    key: "Content-Security-Policy",
    value: csp,
  },
];

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: false,
  },
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
  allowedDevOrigins: [
    "*.space-z.ai",
    "preview-chat-*.space-z.ai",
    "localhost",
    "127.0.0.1",
  ],
};

/**
 * Sentry wrapper — inert unless a DSN is configured at runtime. Source
 * maps are built by Next in production and uploaded at build time only
 * when SENTRY_AUTH_TOKEN is present (local + CI-without-secrets stay
 * quiet). See docs/plans/sentry-integration.md §3.7.
 */
export default withSentryConfig(nextConfig, {
  silent: true,
  sourcemaps: {
    disable: !process.env.SENTRY_AUTH_TOKEN,
  },
});
