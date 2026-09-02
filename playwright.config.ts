import { defineConfig } from "@playwright/test";

/**
 * Browser E2E smoke suite.
 *
 * The server is NOT managed by Playwright's webServer — scripts/e2e-run.py
 * orchestrates everything (Postgres boot → migrations → seed → next build →
 * next start → playwright test → teardown) so local runs and the CI `e2e`
 * job execute the exact same path. Playwright only drives the browser.
 *
 * Two projects:
 *   setup — performs the real UI login ONCE and persists storageState
 *           (cookie + localStorage). Keeps total login POSTs at 2 per run:
 *           the login route's L1 burst limiter allows only 5 attempts per
 *           email per minute (counting successes), so per-test logins would
 *           trip it — the suite itself must respect the app's rate limits.
 *   smoke  — the authenticated flow tests, reusing that session.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0, // smoke suite: flakes should be investigated, not retried away
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report", open: "never" }],
  ],
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://127.0.0.1:3100",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    actionTimeout: 15_000,
  },
  outputDir: "test-results",
  projects: [
    {
      name: "setup",
      testMatch: /setup\.spec\.ts/,
    },
    {
      name: "smoke",
      testMatch: /(smoke|admin|money-path)\.spec\.ts/,
      dependencies: ["setup"],
      use: {
        storageState: "test-results/.auth/e2e.json",
      },
    },
  ],
});
