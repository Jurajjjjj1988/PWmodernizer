import { test } from '@playwright/test';

test('practicetestautomation username label is uniquely resolvable', async ({ page }) => {
  await page.goto('https://practicetestautomation.com/practice-test-login/');
  await page.getByLabel('Username').fill('student');
});
