import { test, expect } from '@playwright/test';

// Starts as clean UTF-8 ASCII, then deliberately switches to
// raw Latin-1 byte sequences mid-file. The `file --mime-encoding -b`
// detector should report something other than utf-8 / us-ascii
// because the trailing bytes are not valid UTF-8.

test.describe('mixed-encoding stream', () => {
  test('renders accented heading', async ({ page }) => {
    await page.goto('https://shop.example.test/products');
    await expect(page.getByRole('heading', { name: 'Café Praèka úóí' })).toBeVisible();
  });
});
