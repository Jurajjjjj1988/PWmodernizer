// Migrated by PWmodernizer on 2026-06-10 from inputs/bad-playwright/flaky-waits.spec.ts. See outputs/plans/flaky-waits.spec.ts.md for plan.

import { test, expect } from '@fixtures/base.fixture';

const VALID_EMAIL = process.env.TEST_USER_EMAIL ?? 'jane.doe@acme.test';
const VALID_PASSWORD = process.env.TEST_USER_PASSWORD ?? 'Sup3rSecret!';
const INVALID_PASSWORD = 'wrong-password';
const VALID_USER_DISPLAY_NAME = 'Jane';

test.describe('Acme Shop login', () => {
  // plan:scenario=1.1
  test('signs in with valid credentials @positive', async ({ acmeShopLoginPage }) => {
    await test.step('open the login page', async () => {
      await acmeShopLoginPage.open();
    });

    await test.step('fill and submit valid credentials', async () => {
      await acmeShopLoginPage.fillCredentials(VALID_EMAIL, VALID_PASSWORD);
      await acmeShopLoginPage.clickSignIn();
    });

    await test.step('dashboard greeting is visible with user name', async () => {
      await expect(
        acmeShopLoginPage.textDashboardGreeting,
        '[AcmeShopLogin] Dashboard greeting should contain user display name',
      ).toContainText(VALID_USER_DISPLAY_NAME);
    });
  });

  // plan:scenario=1.2
  test('rejects an invalid password @negative', async ({ acmeShopLoginPage }) => {
    await test.step('open the login page', async () => {
      await acmeShopLoginPage.open();
    });

    await test.step('fill valid email with wrong password and submit', async () => {
      await acmeShopLoginPage.fillCredentials(VALID_EMAIL, INVALID_PASSWORD);
      await acmeShopLoginPage.clickSignIn();
    });

    await test.step('error banner shows invalid credentials', async () => {
      // Q8 unresolved — 7 s hard wait in source suggests backend auth may take 5–7 s;
      // per-assertion timeout override surfaces latency correctly without masking it.
      await expect(
        acmeShopLoginPage.alertErrorBanner,
        '[AcmeShopLogin] Error banner should show invalid credentials message',
      ).toContainText('Invalid credentials', { timeout: 10_000 });
    });
  });
});
