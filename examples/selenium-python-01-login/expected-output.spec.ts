/**
 * Beacon HR - login and dashboard KPI verification.
 *
 * Two scenarios: an admin can sign in with valid credentials and sees a
 * personalised greeting on the dashboard; the dashboard's "Team members"
 * KPI card shows a non-zero count once authenticated.
 */
import { test as base, expect, type Page } from '@playwright/test';

const ADMIN = {
  email: 'hr-admin@beacon.test',
  password: 'Sup3rSecret!',
} as const;

const test = base.extend<{ loggedInPage: Page }>({
  loggedInPage: async ({ page }, use) => {
    await page.goto('https://hr.beacon.test/login');
    await page.getByLabel('Email').fill(ADMIN.email);
    await page.getByLabel('Password').fill(ADMIN.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/dashboard/);
    await use(page);
  },
});

test.describe('Beacon HR - login', () => {
  test('signs in with valid credentials @positive', async ({ page }) => {
    await page.goto('https://hr.beacon.test/login');
    await page.getByLabel('Email').fill(ADMIN.email);
    await page.getByLabel('Password').fill(ADMIN.password);
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page.getByRole('heading', { name: 'Welcome back, HR Admin' })).toBeVisible();
  });

  test('dashboard shows team-member count @positive', async ({ loggedInPage }) => {
    const teamCard = loggedInPage.getByRole('region', { name: 'Team members' });
    await expect(teamCard.getByTestId('kpi-value')).toHaveText(/^\d+$/);
    await expect(teamCard.getByTestId('kpi-value')).not.toHaveText('0');
  });
});
