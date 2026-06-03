/**
 * Keystone Admin - invite-user modal interactions.
 *
 * Three scenarios on the /users page: clicking Invite opens a modal that
 * can be closed via its close button; the same modal closes on Escape;
 * submitting an invalid email shows an inline validation error inside the
 * modal.
 */
import { test, expect } from '@playwright/test';

test.describe('Keystone Admin - invite-user modal', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('https://admin.keystone.test/users');
    await page.getByRole('button', { name: 'Invite' }).click();
  });

  test('opens via the Invite button and closes via the close button @positive', async ({ page }) => {
    const modal = page.getByRole('dialog', { name: 'Invite a new user' });
    await expect(modal).toBeVisible();

    await modal.getByRole('button', { name: 'Close' }).click();
    await expect(modal).toBeHidden();
  });

  test('closes when the user presses Escape @positive', async ({ page }) => {
    const modal = page.getByRole('dialog', { name: 'Invite a new user' });
    await expect(modal).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(modal).toBeHidden();
  });

  test('shows a validation error when the email is invalid @negative', async ({ page }) => {
    const modal = page.getByRole('dialog', { name: 'Invite a new user' });
    await modal.getByLabel('Email').fill('not-an-email');
    await modal.getByRole('button', { name: 'Send invite' }).click();

    await expect(modal.getByText('Please enter a valid email')).toBeVisible();
  });
});
