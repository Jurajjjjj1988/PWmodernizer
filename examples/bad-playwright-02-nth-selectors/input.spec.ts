import { test, expect } from '@playwright/test';

test.describe('Acme Shop - product listing', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/products*', async (route) => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify([
          { id: 'p1', name: 'Linen Tee', price: 29 },
          { id: 'p2', name: 'Denim Jacket', price: 119 },
          { id: 'p3', name: 'Wool Beanie', price: 24 },
        ]),
      });
    });
    await page.goto('https://shop.acme.test/products');
  });

  test.only('adds the third product to the cart', async ({ page }) => {
    const productCards = page.locator('.product-card');
    await productCards.nth(2).locator('button').nth(0).click();

    await page.waitForTimeout(1500);

    const cartBadge = page.locator('header > div').nth(1).locator('span').nth(0);
    expect(await cartBadge.innerText()).toBe('1');
  });

  test('removes a product from the cart', async ({ page }) => {
    await page.locator('.product-card').nth(0).locator('button').nth(0).click();
    await page.locator('header > div').nth(1).click();

    const removeBtn = page.locator('.cart-drawer li').nth(0).locator('button').nth(1);
    await removeBtn.click();

    const empty = page.locator('.cart-drawer .empty-message');
    expect(await empty.isVisible()).toBe(true);
  });
});
