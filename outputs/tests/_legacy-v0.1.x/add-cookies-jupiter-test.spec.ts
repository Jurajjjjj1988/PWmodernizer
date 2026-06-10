// Migrated from selenium-java on 2026-06-06 by Migrator. See outputs/plans/AddCookiesJupiterTest.java.md for plan.

import { test, expect } from "@playwright/test";

// Q6: playwright.config.ts baseURL resolves to MIGRATION_TARGET_URL (a project-specific SUT).
// Cannot share that config with this external demo SUT without breaking other migrated tests.
// Per plan Q6 fallback: using absolute URL extracted to a named constant with this justifying comment.
const COOKIES_PAGE_URL =
  "https://bonigarcia.dev/selenium-webdriver-java/cookies.html";

test.describe("Cookie management", () => {
  // plan:scenario=1.1
  test("adds a cookie and verifies it appears on the page after refresh @positive", async ({ page }) => {
    await page.goto(COOKIES_PAGE_URL);

    // Q1 assumption: navigate first, then scope the cookie to the current page's resolved URL
    // so Playwright's addCookies() inherits the correct domain and path automatically.
    await page.context().addCookies([
      {
        name: "new-cookie-key",
        value: "new-cookie-value",
        url: page.url(),
      },
    ]);

    // Secondary API-level assertion: confirms addCookies() actually persisted the cookie before
    // clicking refresh — addCookies() returns void, so a silent failure would go undetected
    // without this check. Retained per plan Q4: context.cookies() returns a plain API value,
    // not a Locator, so web-first matchers do not apply. This is defensive hygiene; the UI
    // assertion below is the observable-outcome oracle.
    const cookies = await page.context().cookies();
    const storedCookie = cookies.find((c) => c.name === "new-cookie-key");
    expect(storedCookie?.value).toBe("new-cookie-value");

    // By.id("refresh-cookies") → CSS-ID per KB §6 Rule 1 (high confidence, mechanical translation).
    // If reviewer confirms this is a <button> with accessible name "Refresh cookies", upgrade to:
    //   page.getByRole("button", { name: /refresh cookies/i })
    await page.locator("#refresh-cookies").click();

    // Q5 unresolved: DOM structure of cookies.html not confirmed; assumed cookie name appears
    // as visible text after clicking Refresh.
    // Reviewer fallback: open https://bonigarcia.dev/selenium-webdriver-java/cookies.html,
    // click Refresh cookies, inspect the element rendering the new cookie, then replace this
    // locator with the appropriate role/testid (e.g. getByRole("cell", { name: "new-cookie-key" })
    // if it is rendered in a table row).
    await expect(page.getByText("new-cookie-key")).toBeVisible();
  });
});
