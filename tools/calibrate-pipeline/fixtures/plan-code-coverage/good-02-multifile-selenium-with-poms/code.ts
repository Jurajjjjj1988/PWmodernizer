// Multi-file Selenium migration with POM + fixture present on disk.
import { test, expect } from "@playwright/test";
import { LoginPage } from "./outputs/tests/pages/login.page.ts";

test.describe("Login flow", () => {
  // plan:scenario=1.1
  test("signs in with valid credentials and lands on dashboard", async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    await login.signIn("jane@acme.test", "Sup3rSecret!");
    await expect(page).toHaveURL(/\/dashboard/);
  });

  // plan:scenario=1.2
  test("rejects invalid credentials with error banner", async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    await login.signIn("jane@acme.test", "wrong");
    await expect(page.getByRole("alert")).toContainText("Invalid credentials");
  });
});
