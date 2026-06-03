/**
 * Acme Shop login - happy path and invalid-password rejection.
 *
 * Exercises the /login page: a valid credential pair lands the user on
 * the dashboard with a personalised greeting; an invalid password shows
 * an error banner without leaving the page.
 */
import { test, expect } from '@playwright/test';

test.describe('Acme Shop login', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('https://shop.acme.test/login');
  });

  test('signs in with valid credentials @positive', async ({ page }) => {
    await page.getByLabel('Email').fill('jane.doe@acme.test');
    await page.getByLabel('Password').fill('Sup3rSecret!');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page.getByRole('heading', { name: /welcome back, jane/i })).toBeVisible();
  });

  test('rejects an invalid password @negative', async ({ page }) => {
    await page.getByLabel('Email').fill('jane.doe@acme.test');
    await page.getByLabel('Password').fill('wrong-password');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page.getByRole('alert')).toHaveText(/invalid credentials/i);
    await expect(page).toHaveURL(/\/login/);
  });
});
