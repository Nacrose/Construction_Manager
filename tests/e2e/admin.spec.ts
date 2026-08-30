/**
 * Admin-plane smoke: dedicated admin login → holiday calendar CRUD.
 *
 * The platform admin is a SEPARATE identity plane (kind="admin" sessions via
 * /api/auth/admin-login; customer login refuses superadmins by design). This
 * spec proves that plane end-to-end: the login form, the server-rendered
 * admin dashboard (RSC), and the holiday admin page (the admin UI over the
 * holidays-as-data feature — DB rows authoritative per year, cache
 * invalidation on every mutation).
 *
 * Seeds (scripts/e2e-seed.mjs): admin@e2e.test / E2eAdmin!Pass2026
 */
import { test, expect } from "@playwright/test";

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || "admin@e2e.test";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || "E2eAdmin!Pass2026";

test.describe("admin plane", () => {
  test("admin login → dashboard → holiday add + delete", async ({ page }) => {
    // ── Admin login (separate identity plane) ────────────────────────
    await page.goto("/admin/login");
    await page.locator("#email").fill(ADMIN_EMAIL);
    await page.locator("#password").fill(ADMIN_PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL("**/admin", { timeout: 20_000 });

    // The admin dashboard is a SERVER COMPONENT — stats rendered in HTML.
    await expect(page.getByRole("heading", { name: "Platform Admin" })).toBeVisible();
    await expect(page.getByText("Organizations", { exact: true }).first()).toBeVisible();

    // ── Holiday calendar CRUD ────────────────────────────────────────
    await page.goto("/admin/holidays");
    await expect(page.getByRole("heading", { name: "Holiday Calendar" })).toBeVisible();

    // Add: the current year is preselected; pick Christmas (2026 container
    // clock) via the dialog.
    const nowYear = new Date().getFullYear();
    const holidayDate = `${nowYear}-12-25`;

    await page.getByRole("button", { name: /add holiday/i }).first().click();
    const addDialog = page.getByRole("dialog");
    await expect(addDialog).toBeVisible();
    await addDialog.locator("#holiday-date").fill(holidayDate);
    await addDialog.locator("#holiday-name").fill("E2E Test Holiday");
    await addDialog.getByRole("button", { name: /^add holiday$/i }).click();

    // The new row appears (mutation → list invalidated → refetch).
    const row = page.getByRole("row", { name: /E2E Test Holiday/ });
    await expect(row).toBeVisible({ timeout: 15_000 });
    await expect(row.getByText(holidayDate)).toBeVisible();

    // Delete it again (trash icon → confirm dialog's Delete action).
    await row.locator("button[title='Delete']").click();
    const confirmDialog = page.getByRole("alertdialog");
    await expect(confirmDialog).toBeVisible();
    await confirmDialog.getByRole("button", { name: "Delete", exact: true }).click();

    await expect(page.getByRole("row", { name: /E2E Test Holiday/ })).toHaveCount(0, {
      timeout: 15_000,
    });
  });
});
