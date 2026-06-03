/**
 * Acme Shop - product listing add-to-cart and remove flows.
 *
 * Stubs the product API with a fixed 3-product catalogue, then verifies the
 * user can add a specific product to the cart (cart badge increments) and
 * remove it from the cart drawer (empty-state appears).
 */
import { test as base, expect, type Page } from '@playwright/test';

const PRODUCTS = [
  { id: 'p1', name: 'Linen Tee', price: 29 },
  { id: 'p2', name: 'Denim Jacket', price: 119 },
  { id: 'p3', name: 'Wool Beanie', price: 24 },
] as const;

const test = base.extend<{ shopPage: Page }>({
  shopPage: async ({ page }, use) => {
    await page.route('**/api/products*', (route) =>
      route.fulfill({ status: 200, body: JSON.stringify(PRODUCTS) }),
    );
    await page.goto('https://shop.acme.test/products');
    await use(page);
  },
});

test.describe('Acme Shop - product listing', () => {
  test('adds a specific product to the cart @positive', async ({ shopPage }) => {
    const beanieCard = shopPage.getByRole('article', { name: 'Wool Beanie' });
    await beanieCard.getByRole('button', { name: 'Add to cart' }).click();

    await expect(shopPage.getByRole('status', { name: 'Cart item count' })).toHaveText('1');
  });

  test('removes a product from the cart @positive', async ({ shopPage }) => {
    const teeCard = shopPage.getByRole('article', { name: 'Linen Tee' });
    await teeCard.getByRole('button', { name: 'Add to cart' }).click();

    await shopPage.getByRole('button', { name: 'Open cart' }).click();
    const cartDrawer = shopPage.getByRole('dialog', { name: 'Cart' });
    await cartDrawer.getByRole('button', { name: 'Remove Linen Tee' }).click();

    await expect(cartDrawer.getByText(/your cart is empty/i)).toBeVisible();
  });
});
