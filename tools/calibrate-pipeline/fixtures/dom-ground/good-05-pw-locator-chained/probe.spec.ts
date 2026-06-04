import { test, expect } from '@playwright/test';

// Locator chaining: getByRole('row').filter({ hasText }).getByRole('button')
// Tier-1 idiomatic Playwright for narrowing into a table row before scoping
// further. Each link in the chain produces its own locator call the parser
// should pick up.
test('table row – clicks per-row action', async ({ page }) => {
  await page.goto('/admin/users');
  const row = page.getByRole('row').filter({ hasText: 'foo' });
  await row.getByRole('button', { name: /edit/i }).click();
  await expect(page.getByRole('dialog', { name: /edit user/i })).toBeVisible();
});
