// Clean migration: both scenarios pinned exactly once, no foreign imports.
import { test, expect } from "@playwright/test";

test.describe("Acme login", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
  });

  // plan:scenario=1.1
  test("signs in with valid credentials @positive", async ({ page }) => {
    await page.getByLabel(/email/i).fill("jane@acme.test");
    await page.getByLabel(/password/i).fill("Sup3rSecret!");
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/dashboard/);
  });

  // plan:scenario=1.2
  test("shows error banner on bad password @negative", async ({ page }) => {
    await page.getByLabel(/email/i).fill("jane@acme.test");
    await page.getByLabel(/password/i).fill("wrong");
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page.getByRole("alert")).toContainText("Invalid credentials");
  });
});
