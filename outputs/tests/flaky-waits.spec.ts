// Migrated by PWmodernizer on 2026-06-03 from inputs/bad-playwright/flaky-waits.spec.ts. See outputs/plans/flaky-waits.spec.ts.md for plan.

import { test, expect } from "@playwright/test";

// Credentials as named constants so a single env-var change rotates them everywhere.
// Ultimate target: process.env vars with no fallback, forcing CI to configure them explicitly.
const VALID_EMAIL = process.env.TEST_USER_EMAIL ?? "jane.doe@acme.test";
const VALID_PASSWORD = process.env.TEST_USER_PASSWORD ?? "Sup3rSecret!";
const INVALID_PASSWORD = "wrong-password";
// Extracted from the inline "Welcome back, Jane" assertion — one place to update if
// the test account display name changes.
const VALID_USER_DISPLAY_NAME = "Jane";

test.describe("Acme Shop login", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    // Q1 unresolved — email input assumed as the first stable readiness signal after
    // navigation; if the form is rendered by a slow JS bundle, a page heading or form
    // container may be a more reliable anchor.
    // Q2 unresolved — /email/i label assumed from standard login-form convention;
    // fallback: page.locator('#email') if no <label> element is present.
    await expect(page.getByLabel(/email/i)).toBeVisible();
  });

  test("signs in with valid credentials @positive @e2e", async ({ page }) => {
    // Q2 unresolved — /email/i and /password/i labels assumed; fallbacks: '#email' / '#password'.
    await page.getByLabel(/email/i).fill(VALID_EMAIL);
    await page.getByLabel(/password/i).fill(VALID_PASSWORD);
    // Q5 unresolved — "Sign in" trigger assumed to be a <button>; if it is a styled <a>
    // or <div>, fallback: page.getByText('Sign in', { exact: true }).
    await page.getByRole("button", { name: /sign in/i }).click();

    // Q3 unresolved — no DOM evidence of role, aria-label, or data-testid on
    // .dashboard-greeting; keeping CSS locator. Reviewer: add data-testid="dashboard-greeting"
    // to the component to eliminate CSS-class coupling (KB-1.1.3).
    await expect(page.locator(".dashboard-greeting")).toContainText(
      VALID_USER_DISPLAY_NAME,
    );
  });

  test("displays error banner on wrong password @negative @e2e", async ({ page }) => {
    // Q2 unresolved — see readiness comment in beforeEach.
    await page.getByLabel(/email/i).fill(VALID_EMAIL);
    await page.getByLabel(/password/i).fill(INVALID_PASSWORD);
    // Q5 unresolved — see test above.
    await page.getByRole("button", { name: /sign in/i }).click();

    // Q4 unresolved — role="alert" assumed on the error banner; fallback: page.locator('.error-banner').
    // If multiple alerts are present, scope with .filter({ hasText: /invalid credentials/i }).
    // The original waitForTimeout(7000) suggests the auth rejection may take >5 s; if this
    // assertion times out under the default actionTimeout: 5_000, add { timeout: 10_000 }
    // with a comment explaining the backend latency budget (plan Q8 / Risk callout).
    await expect(page.getByRole("alert")).toContainText("Invalid credentials");
  });
});
