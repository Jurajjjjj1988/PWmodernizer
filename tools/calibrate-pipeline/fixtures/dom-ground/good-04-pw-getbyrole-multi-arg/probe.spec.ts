import { test, expect } from '@playwright/test';

// Idiomatic Playwright TypeScript: getByRole with multi-arg options object
// (name regex + exact + role). This is the recommended pattern from the
// official 2026 Playwright docs and the Tier-1 locator in our KB.
test('settings page – save profile changes', async ({ page }) => {
  await page.goto('/account/settings');
  await page.getByRole('textbox', { name: /display name/i }).fill('Jane Doe');
  await page.getByRole('button', { name: /save/i, exact: false }).click();
  await expect(page.getByRole('status', { name: /profile saved/i })).toBeVisible();
});
