// Migrated by PWmodernizer on 2026-06-06 from inputs/selenium-java/ExplicitWaitJupiterTest.java. See outputs/plans/ExplicitWaitJupiterTest.java.md for plan.

import { test, expect } from "@playwright/test";

const LOADING_IMAGES_PAGE = "/selenium-webdriver-java/loading-images.html";
// Plan Q5: preserves the source's 10 s WebDriverWait budget for slow CI image injection.
const IMAGE_LOAD_TIMEOUT_MS = 10_000;

test.describe("Explicit wait — loading images", () => {
  // plan:scenario=1.1
  test("displays landscape image with correct src after async load @positive @e2e", async ({ page }) => {
    await page.goto(LOADING_IMAGES_PAGE);

    // toHaveAttribute auto-polls for DOM presence + attribute readiness together (plan Q2, Q3).
    await expect(page.locator("#landscape")).toHaveAttribute(
      "src",
      /landscape/i,
      { timeout: IMAGE_LOAD_TIMEOUT_MS },
    );
  });
});
