import { test } from '@playwright/test';

test('saucedemo textbox role matches multiple (Username + Password)', async ({ page }) => {
  await page.goto('https://www.saucedemo.com/');
  await page.getByRole('textbox').click();
});
