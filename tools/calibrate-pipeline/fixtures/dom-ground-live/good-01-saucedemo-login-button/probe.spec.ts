import { test } from '@playwright/test';

test('saucedemo login button is uniquely resolvable', async ({ page }) => {
  await page.goto('https://www.saucedemo.com/');
  await page.getByRole('button', { name: 'Login' }).click();
});
