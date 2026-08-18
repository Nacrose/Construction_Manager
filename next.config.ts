import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Re-enabled: type errors must fail the build so regressions are caught
  // at CI time, not in production.
  // NOTE: Next.js 16 removed the `eslint` config key from next.config.ts.
  // Lint is now run separately via `npm run lint` (see package.json).
  typescript: {
    ignoreBuildErrors: false,
  },
  reactStrictMode: true,
  // Allow the preview gateway (and any preview-chat-*.space-z.ai subdomain)
  // to access the dev server's HMR and _next resources without being blocked
  // as cross-origin.
  allowedDevOrigins: [
    "*.space-z.ai",
    "preview-chat-*.space-z.ai",
    "localhost",
    "127.0.0.1",
  ],
};

export default nextConfig;
