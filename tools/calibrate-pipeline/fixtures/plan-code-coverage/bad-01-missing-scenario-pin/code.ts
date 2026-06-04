// Scenario 1.1 is pinned, but scenario 1.2 (declared in envelope) has no pin.
// Validator must flag the missing pin.
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

  // MISSING: plan:scenario=1.2 — this test() block has no pin.
  test("shows error on bad password @negative", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel(/email/i).fill("jane@acme.test");
    await page.getByLabel(/password/i).fill("wrong");
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page.getByRole("alert")).toContainText("Invalid credentials");
  });
});
