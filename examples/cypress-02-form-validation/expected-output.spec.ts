/**
 * Beacon HR - new employee form validation.
 *
 * Verifies the /employees/new form: required-field errors appear when the
 * user submits an empty form, an invalid email format triggers the email
 * error on blur, and that error clears when a valid email is entered.
 */
import { test, expect } from '@playwright/test';

test.describe('Beacon HR - new employee form', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/employees/new');
  });

  test('shows validation messages for empty required fields @negative', async ({ page }) => {
    await page.getByRole('button', { name: 'Save' }).click();

    await expect(page.getByText('First name is required')).toBeVisible();
    await expect(page.getByText('Last name is required')).toBeVisible();
    await expect(page.getByText('Email is required')).toBeVisible();
    await expect(page.getByText('Start date is required')).toBeVisible();
  });

  test('shows email validation error for malformed email @negative', async ({ page }) => {
    await page.getByLabel('First name').fill('Sam');
    await page.getByLabel('Last name').fill('Patel');
    await page.getByLabel('Email').fill('not-an-email');
    await page.getByLabel('Start date').fill('2026-07-01');

    await page.getByRole('button', { name: 'Save' }).click();

    await expect(page.getByText('Enter a valid email')).toBeVisible();
    // No other field should be flagged invalid.
    await expect(page.getByText(/is required/)).toHaveCount(0);
  });

  test('clears the email error once a valid email is typed @positive', async ({ page }) => {
    const email = page.getByLabel('Email');
    const firstName = page.getByLabel('First name');

    await email.fill('not-an-email');
    await firstName.focus(); // trigger blur on email
    await expect(page.getByText('Enter a valid email')).toBeVisible();

    await email.fill('sam.patel@beacon.test');
    await firstName.focus();
    await expect(page.getByText('Enter a valid email')).toBeHidden();
  });
});
