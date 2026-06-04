// Subtractive: only @playwright/test + relative + node: imports allowed.
// Demonstrates that relative + node:* imports are NOT flagged as foreign.
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { CHECKOUT_TIMEOUT } from "../helpers/timeouts.ts";

const FIXTURE_ORDER = JSON.parse(
  readFileSync(new URL("./fixtures/order.json", import.meta.url), "utf8"),
) as { id: string };

test.describe("Checkout flow", () => {
  // plan:scenario=1.1
  test("completes checkout with saved card @positive", async ({ page }) => {
    await page.goto("/checkout");
    await page.getByRole("button", { name: "Pay now" }).click();
    await expect(
      page.getByRole("heading", { name: /order confirmed/i }),
    ).toBeVisible({ timeout: CHECKOUT_TIMEOUT });
    await expect(page.getByTestId("order-number")).toContainText(/^ORD-/);
    void FIXTURE_ORDER;
  });
});
