/**
 * E2E setup: perform the real UI login ONCE and persist the session
 * (cf_session cookie + cf_token/cf_user localStorage) to storageState for
 * the smoke project's tests.
 *
 * This test IS the "login works end-to-end" test — it asserts the full
 * form → API → redirect → dashboard-render path before saving state.
 */
import { test as setup, expect } from "@playwright/test";

const EMAIL = process.env.E2E_LOGIN_EMAIL || "pm@e2e.test";
const PASSWORD = process.env.E2E_LOGIN_PASSWORD || "E2eTest!Pass2026";

setup("UI login lands on the dashboard with live stats", async ({ page }) => {
  // Suppress the first-visit onboarding tour (auto-opens 800ms after the
  // app shell mounts; its overlay intercepts every click). Same flag the
  // tour's own "Skip tour" button sets (cm-onboarded-v1).
  await page.addInitScript(() => {
    localStorage.setItem("cm-onboarded-v1", "1");
  });

  await page.goto("/login");
  await page.locator("#email").fill(EMAIL);
  await page.locator("#password").fill(PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  // Full-page navigation (window.location.href) to /dashboard follows.
  await page.waitForURL("**/dashboard", { timeout: 20_000 });

  // Dashboard fetched /api/dashboard and rendered the Executive Cockpit.
  await expect(page.getByText("Executive Cockpit").first()).toBeVisible();
  await expect(page.getByText("Active Projects").first()).toBeVisible();

  await page.context().storageState({ path: "test-results/.auth/e2e.json" });
});
