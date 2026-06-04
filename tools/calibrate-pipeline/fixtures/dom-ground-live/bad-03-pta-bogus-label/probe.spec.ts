import { test } from '@playwright/test';

test('practicetestautomation bogus label should not resolve', async ({ page }) => {
  await page.goto('https://practicetestautomation.com/practice-test-login/');
  await page.getByLabel('Phone Number').fill('+421000000000');
});
