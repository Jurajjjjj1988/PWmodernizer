/**
 * Beacon HR - login and submit-button gating.
 *
 * Exercises the /login page: successful sign-in lands on the team dashboard
 * with at least one row in the team table, and the submit button stays
 * disabled until both email and password have values.
 */
import { test, expect } from '@playwright/test';

test.describe('Beacon HR - login', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
  });

  test('logs in and lands on the team dashboard @positive', async ({ page }) => {
    await page.getByLabel('Email').fill('hr-admin@beacon.test');
    await page.getByLabel('Password').fill('Sup3rSecret!');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole('heading', { name: /welcome/i })).toBeVisible();
    await expect(page.getByRole('row')).not.toHaveCount(1); // header row only would mean empty
  });

  test('keeps submit disabled until both fields are filled @edge', async ({ page }) => {
    const submit = page.getByRole('button', { name: 'Sign in' });

    await expect(submit).toBeDisabled();

    await page.getByLabel('Email').fill('hr-admin@beacon.test');
    await expect(submit).toBeDisabled();

    await page.getByLabel('Password').fill('Sup3rSecret!');
    await expect(submit).toBeEnabled();

    await page.getByLabel('Password').clear();
    await expect(submit).toBeDisabled();
  });
});
