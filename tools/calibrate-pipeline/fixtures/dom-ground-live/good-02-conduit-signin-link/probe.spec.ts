import { test } from '@playwright/test';

test('conduit signin link is uniquely resolvable', async ({ page }) => {
  await page.goto('https://conduit.bondaracademy.com/');
  await page.getByRole('link', { name: 'Sign in' }).click();
});
