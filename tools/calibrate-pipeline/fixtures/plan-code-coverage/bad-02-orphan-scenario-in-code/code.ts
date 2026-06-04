// Envelope only declares scenario 1.1, but code also pins 9.9 (made up).
// Validator must flag the orphan pin.
import { test, expect } from "@playwright/test";

test.describe("Acme login", () => {
  // plan:scenario=1.1
  test("signs in with valid credentials @positive", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel(/email/i).fill("jane@acme.test");
    await page.getByLabel(/password/i).fill("Sup3rSecret!");
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/dashboard/);
  });

  // plan:scenario=9.9 — orphan: envelope doesn't know about 9.9
  test("undeclared bonus scenario", async ({ page }) => {
    await page.goto("/bonus");
    await expect(page).toHaveURL(/\/bonus/);
  });
});
