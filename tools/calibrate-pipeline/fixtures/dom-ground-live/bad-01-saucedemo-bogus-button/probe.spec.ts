import { test } from '@playwright/test';

test('saucedemo bogus button should not resolve', async ({ page }) => {
  await page.goto('https://www.saucedemo.com/');
  await page.getByRole('button', { name: 'No Such Button' }).click();
});
