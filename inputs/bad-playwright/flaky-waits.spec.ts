import { test, expect } from '@playwright/test';

// Acme Shop login E2E - covers happy path and bad password
test.describe('Acme Shop login', () => {
  test.describe('credentials', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('https://shop.acme.test/login');
      await page.waitForTimeout(2000);
    });

    test('user can sign in with valid credentials', async ({ page }) => {
      await page.locator('#email').fill('jane.doe@acme.test');
      await page.waitForTimeout(500);
      await page.locator('#password').fill('Sup3rSecret!');
      await page.waitForTimeout(500);

      await page.getByText('Sign in').click();
      await page.waitForTimeout(3000);

      expect(await page.locator('.dashboard-greeting').isVisible()).toBe(true);
      expect(await page.locator('.dashboard-greeting').innerText()).toContain('Welcome back, Jane');
    });

    test('shows error on wrong password', async ({ page }) => {
      await page.locator('#email').fill('jane.doe@acme.test');
      await page.locator('#password').fill('wrong-password');
      await page.getByText('Sign in').click();

      await page.waitForTimeout(7000);

      const errorBanner = page.locator('.error-banner');
      if (await errorBanner.isVisible()) {
        expect(await errorBanner.innerText()).toContain('Invalid credentials');
      } else {
        throw new Error('No error banner appeared');
      }
    });
  });
});
