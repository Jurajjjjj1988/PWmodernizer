import { test, expect } from "@playwright/test";

test.describe("Order management", () => {
  test("user can place an order", async ({ page }) => {
    await page.goto("https://shop.acme.test/catalog");
    await page.locator("#search").fill("widget");
    await page.locator("button.search").click();
    await page.locator(".product-card").nth(0).click();
    await page.locator("button.add-to-cart").click();
    await page.locator("a.cart-link").click();
    await page.locator("button.proceed").click();
    await page.waitForTimeout(1500);
    const visible = await page.locator(".order-confirmation").isVisible();
    expect(visible).toBe(true);
  });
});
