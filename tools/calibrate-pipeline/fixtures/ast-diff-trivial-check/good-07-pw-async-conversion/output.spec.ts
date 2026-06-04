import { test, expect } from "@playwright/test";

test.describe("registration", () => {
  // plan:scenario=1.1
  test("creates a new account with valid credentials @positive", async ({ page }) => {
    await page.goto("/register");
    await page.getByLabel(/email/i).fill("jane@acme.test");
    await page.getByLabel(/^password$/i).fill("hunter2");
    await page.getByLabel(/confirm password/i).fill("hunter2");
    await page.getByRole("button", { name: /create account/i }).click();
    await expect(page.getByRole("status", { name: /welcome/i })).toBeVisible();
    await expect(page).toHaveURL(/\/onboarding/);
  });
});
