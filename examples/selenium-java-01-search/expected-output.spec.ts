/**
 * Acme Shop - product search.
 *
 * Verifies the site search: a keyword query returns a non-empty grid of
 * matching products (and the first result contains the keyword), and
 * submitting an empty query surfaces a hint asking for a search term.
 */
import { test, expect } from '@playwright/test';

test.describe('Acme Shop - product search', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('https://shop.acme.test');
  });

  test('returns matching products for a keyword @positive', async ({ page }) => {
    await page.getByRole('searchbox', { name: 'Search products' }).fill('linen');
    await page.getByRole('button', { name: 'Search' }).click();

    const results = page.getByRole('article');
    await expect(results.first()).toBeVisible();
    await expect(results.first().getByRole('heading')).toContainText(/linen/i);
  });

  test('shows a hint when the search query is empty @negative', async ({ page }) => {
    await page.getByRole('button', { name: 'Search' }).click();

    await expect(page.getByText('Please enter a search term')).toBeVisible();
  });
});
