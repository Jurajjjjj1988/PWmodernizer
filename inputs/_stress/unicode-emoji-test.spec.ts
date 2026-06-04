import { test, expect } from '@playwright/test';

// Emoji in test descriptions and inside assertions. UTF-8 multibyte
// sequences for these glyphs are valid utf-8, so `file --mime-encoding`
// reports utf-8 and Stage 0 should PASS. Proves Stage 0 doesn't choke
// on supplementary-plane / 4-byte UTF-8.

test.describe('emoji-decorated happy paths', () => {
  test('🎉 happy path checkout', async ({ page }) => {
    await page.goto('https://shop.example.test/');
    await page.getByRole('button', { name: '🛒 Add to cart' }).click();
    await expect(page.getByText('✅ Added')).toBeVisible();
  });

  test('🔥 search returns results', async ({ page }) => {
    await page.goto('https://shop.example.test/');
    await page.getByRole('searchbox', { name: 'Search' }).fill('🎁 gift');
    await page.getByRole('button', { name: 'Search' }).click();
    await expect(page.getByRole('heading', { name: /Results for "🎁 gift"/u })).toBeVisible();
  });

  test('🚨 empty cart shows guidance', async ({ page }) => {
    await page.goto('https://shop.example.test/cart');
    await expect(page.getByText('🛒 Your cart is empty')).toBeVisible();
  });

  test('🌍 i18n + emoji combined: Bonjour 👋', async ({ page }) => {
    await page.goto('https://shop.example.test/fr/');
    await expect(page.getByRole('heading', { name: 'Bonjour 👋' })).toBeVisible();
  });
});
