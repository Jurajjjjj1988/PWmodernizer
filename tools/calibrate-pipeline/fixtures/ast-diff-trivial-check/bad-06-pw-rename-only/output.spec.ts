import { test, expect } from "@playwright/test";

test.describe("Purchase workflow", () => {
  test("buyer can submit a purchase", async ({ tab }) => {
    await tab.goto("https://store.beacon.test/items");
    await tab.locator("#query").fill("gadget");
    await tab.locator("button.find").click();
    await tab.locator(".item-tile").nth(0).click();
    await tab.locator("button.add-to-basket").click();
    await tab.locator("a.basket-link").click();
    await tab.locator("button.continue").click();
    await tab.waitForTimeout(1500);
    const shown = await tab.locator(".purchase-confirmation").isVisible();
    expect(shown).toBe(true);
  });
});
