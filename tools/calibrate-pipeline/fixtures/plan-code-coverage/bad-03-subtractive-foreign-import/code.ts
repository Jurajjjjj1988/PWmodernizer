// Subtractive (bad-playwright) MUST NOT introduce foreign framework imports.
// This generated code imports selenium-webdriver — clear violation.
import { test, expect } from "@playwright/test";
import { By, type WebDriver } from "selenium-webdriver";

test.describe("submit flow", () => {
  // plan:scenario=1.1
  test("submits the form @positive", async ({ page }) => {
    await page.goto("/form");
    await page.getByRole("button", { name: "Submit" }).click();
    await expect(page.getByRole("status")).toBeVisible();
    void By;
    void ({} as WebDriver);
  });
});
