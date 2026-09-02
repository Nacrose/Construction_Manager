/**
 * Money-path E2E: retention → release payment → cash-flow outflow.
 *
 * Walks the financial spine of the app against a REAL production build on a
 * REAL Postgres (no mocks): a seeded certified subcontractor-IPC holds NPR
 * 5,000 of retention; the spec drives the payments UI to release part of it
 * (previously IMPOSSIBLE — the over-release guard read a column no code ever
 * wrote and rejected every release), asserts the guard still rejects an
 * over-release, and verifies the cash-flow forecast surfaces the seeded
 * payment settlement in its outflow series.
 *
 * Seed data (scripts/e2e-seed.mjs — change together):
 *   subcontractor  "E2E Builders Nepal"  (contractValue 5,000,000)
 *   sub-IPC        "IPC-SUB-001" certified, retentionAmount 5,000
 *   payment        "E2E Fuel Suppliers" paid, netPaid 45,000
 *
 * Auth: reuses the setup project's storageState (one login per run).
 */
import { test, expect } from "@playwright/test";

const PROJECT_NAME = "E2E Highway Bridge Project";
const SUB_NAME = "E2E Builders Nepal";

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

async function openRetentionSection(page: import("@playwright/test").Page): Promise<void> {
  const projectId = await openProject(page);
  await page.goto(`/projects/${projectId}/payments`);
  await expect(page.getByText("Retention Money (धरौटी)")).toBeVisible();
}

test.describe("money path: retention → release → cash flow", () => {
  test("retention summary shows the seeded held retention from the certified sub-IPC", async ({ page }) => {
    await openRetentionSection(page);

    const row = page.getByRole("row", { name: new RegExp(SUB_NAME) });
    await expect(row).toBeVisible();
    // IPC retention 5,000 held from the seeded certified sub-IPC;
    // nothing released yet → held 5,000.00 (en-IN grouping, 2 decimals).
    await expect(row.getByText("5,000.00").first()).toBeVisible();
    // Totals strip agrees.
    await expect(page.getByText("Currently Held")).toBeVisible();
  });

  test("over-release is rejected by the live guard with a precise message", async ({ page }) => {
    await openRetentionSection(page);

    const row = page.getByRole("row", { name: new RegExp(SUB_NAME) });
    await row.getByRole("button", { name: /release/i }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    // Pre-filled with the full held amount — overwrite with an over-release.
    const amountInput = dialog.getByRole("spinbutton");
    await amountInput.fill("99999");
    await dialog.getByRole("button", { name: /confirm release/i }).click();

    // The guard's message names the amount AND the live held balance
    // (raw numbers — the API interpolates without thousands separators).
    await expect(page.getByText(/Cannot release 99999: only 5000 retention is currently held for E2E Builders Nepal/))
      .toBeVisible();
    await dialog.getByRole("button", { name: /cancel/i }).click();
    await expect(dialog).toBeHidden();
  });

  test("partial release succeeds, updates the summary, and the row reflects it", async ({ page }) => {
    await openRetentionSection(page);

    const row = page.getByRole("row", { name: new RegExp(SUB_NAME) });
    await row.getByRole("button", { name: /release/i }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("spinbutton").fill("2000");
    await dialog.getByRole("button", { name: /confirm release/i }).click();

    // Success toast + dialog closes.
    await expect(page.getByText("Retention released")).toBeVisible();
    await expect(dialog).toBeHidden();

    // Summary re-queries (invalidate + refetch): released 2,000 / held 3,000.
    await expect(row.getByText("3,000.00").first()).toBeVisible();
    await expect(row.getByText("2,000.00").first()).toBeVisible();
  });

  test("cash-flow forecast surfaces the settled payment in its outflow series", async ({ page }) => {
    const projectId = await openProject(page);
    await page.goto(`/projects/${projectId}/cash-flow`);

    await expect(page.getByText("Total Actual Costs")).toBeVisible();
    // The seeded 45,000 payment settles into the paymentsOut series, PLUS
    // the 2,000 retention release the previous test paid through the UI —
    // the release payment flows straight into the forecast: 45,000 + 2,000
    // = 47,000.00 (this is the money path closing on itself).
    await expect(page.getByText("Bill Payments Out:")).toBeVisible();
    await expect(page.getByText("47,000.00").first()).toBeVisible();
    // Net cash flow for the current month reflects the full outflow.
    await expect(page.getByText(/-47,000\.00/).first()).toBeVisible();
    // Monthly breakdown table renders buckets.
    await expect(page.getByText("Monthly Breakdown")).toBeVisible();
  });
});
