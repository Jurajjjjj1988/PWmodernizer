// Migrated from selenium-python on 2026-06-06 by Migrator. See outputs/plans/using_selenium_tests.py.md for plan.

import { test, expect } from "@playwright/test";

const INPUT_TEXT = "Selenium";

test.describe("Web form submission", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/selenium/web/web-form.html");
  });

  // plan:scenario=1.1
  test("submits web form text input and receives confirmation @positive", async ({ page }) => {
    await expect(page).toHaveTitle("Web form");

    // Q1 unresolved: label text not confirmed for name="my-text" — assumed 'Text input' from web-form convention.
    const textInput = page.getByLabel(/text input/i);
    // Q2 unresolved: submit button accessible name not confirmed — 'Submit' assumed from form semantics.
    const submitButton = page.getByRole("button", { name: /submit/i });
    // ID selector: ARIA role of #message not confirmed from source alone; direct ID is high-confidence per plan (Q3).
    const message = page.locator("#message");

    await textInput.fill(INPUT_TEXT);
    await submitButton.click();

    await expect(message).toHaveText("Received!");
  });
});
