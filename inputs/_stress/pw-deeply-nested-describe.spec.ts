import { test, expect } from '@playwright/test';

// Stage 0 stress fixture: 8 levels of test.describe nesting.
// Stage 0 should PASS (has test markers, OK encoding, within size+token
// limits). Downstream Stage 1 should WARN — KB-1.1.15 flags any
// test.describe nesting beyond 2 levels as an anti-pattern.

test.describe('Acme app', () => {
  test.describe('Settings module', () => {
    test.describe('Profile section', () => {
      test.describe('Display name editor', () => {
        test.describe('Edit mode', () => {
          test.describe('Validation states', () => {
            test.describe('Empty input', () => {
              test.describe('Save button states', () => {
                test('save disabled when display name is empty', async ({ page }) => {
                  await page.goto('/account/settings/profile');
                  await page.getByRole('button', { name: /edit display name/i }).click();
                  await page.getByLabel(/display name/i).fill('');
                  await expect(page.getByRole('button', { name: /save/i })).toBeDisabled();
                });
                test('save enabled when display name is non-empty', async ({ page }) => {
                  await page.goto('/account/settings/profile');
                  await page.getByRole('button', { name: /edit display name/i }).click();
                  await page.getByLabel(/display name/i).fill('Jane Doe');
                  await expect(page.getByRole('button', { name: /save/i })).toBeEnabled();
                });
              });
            });
          });
        });
      });
    });
  });
});
