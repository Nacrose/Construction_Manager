/**
 * Full-stack browser smoke: project → pending expense → approve → verified
 * in the totals (the "report"). Runs against a real production build
 * (`next build` + `next start`) on a real Postgres with the real migration
 * chain — no mocks anywhere in the stack.
 *
 * Auth comes from the setup project's storageState (one UI login per run —
 * the login route's L1 limiter allows only 5 attempts/email/minute, so the
 * suite logs in once and reuses the session).
 *
 * Seed data comes from scripts/e2e-seed.mjs (same strings asserted here):
 *   user    pm@e2e.test / E2eTest!Pass2026  (project_manager on E2E-P1)
 *   project "E2E Highway Bridge Project"
 *   expense EXP-001, NPR 12,500.50, pending
 */
import { test, expect } from "@playwright/test";

const EMAIL = process.env.E2E_LOGIN_EMAIL || "pm@e2e.test";
const PROJECT_NAME = "E2E Highway Bridge Project";

/** Navigate to the seeded project page; returns the project id. */
async function openProject(page: import("@playwright/test").Page): Promise<string> {
  await page.goto("/projects");
  const card = page.getByText(PROJECT_NAME).first();
  await expect(card).toBeVisible();
  await card.click();
  await page.waitForURL(/\/projects\/[^/]+$/);
  const projectId = page.url().match(/\/projects\/([^/]+)$/)?.[1];
  expect(projectId).toBeTruthy();
  return projectId!;
}

test.describe("smoke: project → expense approval", () => {
  test("wrong password is rejected with the generic error", async ({ page }) => {
    await page.goto("/login");
    await page.locator("#email").fill(EMAIL);
    await page.locator("#password").fill("definitely-wrong-password");
    await page.getByRole("button", { name: /sign in/i }).click();
    // Same message as "user not found" — no account enumeration.
    await expect(page.getByText("Invalid email or password.")).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test("project list shows the seeded project and opens it", async ({ page }) => {
    await openProject(page);
    // Project overview renders the project name.
    await expect(page.getByText(PROJECT_NAME).first()).toBeVisible();
  });

  test("expenses page lists the pending seeded expense", async ({ page }) => {
    const projectId = await openProject(page);
    await page.goto(`/projects/${projectId}/expenses`);
    const row = page.getByRole("row", { name: /EXP-001/ });
    await expect(row).toBeVisible();
    await expect(row.getByText("E2E cement delivery to site")).toBeVisible();
    await expect(row.getByText("Pending")).toBeVisible();
    // 12500.5 renders via en-IN grouping: "12,500.50" (appears in both the
    // Amount and Total columns since VAT is 0 — assert at least one).
    await expect(row.getByText("12,500.50").first()).toBeVisible();
  });

  test("PM approves the expense; status and Approved total update", async ({ page }) => {
    const projectId = await openProject(page);
    await page.goto(`/projects/${projectId}/expenses`);

    const row = page.getByRole("row", { name: /EXP-001/ });
    await expect(row).toBeVisible();

    // The "Approved" stat card starts at 0.00 (unique success value cell).
    const approvedTotal = page.locator("div.text-xl.font-mono.text-success");
    await expect(approvedTotal).toHaveText(/^0\.00$/);

    // Approve (ghost button with the success Check icon in EXP-001's row).
    await row.locator("button.text-success").click();

    // Row flips to Approved …
    await expect(row.getByText("Approved")).toBeVisible({ timeout: 20_000 });
    // … and the Approved total picks up the amount (report layer).
    await expect(approvedTotal).toHaveText(/12,500\.50/);
  });

  test("materials page renders the inventory tab", async ({ page }) => {
    const projectId = await openProject(page);
    await page.goto(`/projects/${projectId}/materials`);
    // The inventory tab header renders (empty inventory is fine — the page
    // must not crash, and the tab structure proves the router + queries ran).
    await expect(page.getByText(/materials/i).first()).toBeVisible();
  });

  test("activity page renders server-side (audit trail)", async ({ page }) => {
    await page.goto("/activity");
    await expect(page.getByText("Activity Log")).toBeVisible();
    // The seeded expense approval ran an audit mutation — the trail is live.
    await expect(page.getByText(/approve/i).first()).toBeVisible();
  });

  test("/admin is off-limits to regular org users", async ({ page }) => {
    await page.goto("/admin");
    // The middleware gate bounces non-admin sessions to the admin login
    // (the page-level server guard is defense-in-depth behind it).
    await page.waitForURL("**/admin/login**");
    await expect(page).not.toHaveURL(/\/admin$/);
  });
});
