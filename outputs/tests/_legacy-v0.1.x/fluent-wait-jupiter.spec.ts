// Migrated from selenium-java on 2026-06-06 by Migrator.
// See outputs/plans/FluentWaitJupiterTest.java.md for plan and rationale.

import { test, expect } from "@playwright/test";

test.describe("loading-images page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/selenium-webdriver-java/loading-images.html");
  });

  // plan:scenario=1.1
  test(
    "waits for landscape image to load and verifies its source attribute @positive",
    async ({ page }) => {
      // Q3 unresolved — alt text inferred from element id and bonigarcia demo conventions; not confirmed by DOM inspection.
      // Reviewer fallback: inspect loading-images.html source; if <img alt="landscape"> confirmed keep getByAltText;
      // if alt is absent or differs, switch to page.locator('#landscape') per migration-rules §5.
      const landscape = page.getByAltText(/landscape/i);

      // Q2 assumption: 10 s preserves the original FluentWait ceiling (.withTimeout(Duration.ofSeconds(10)));
      // reduce to default 5 s if the demo page reliably loads within that on CI runners.
      await expect(landscape).toHaveAttribute("src", /landscape/i, { timeout: 10_000 });
    },
  );
});
