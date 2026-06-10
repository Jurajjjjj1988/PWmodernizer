import { test, expect } from '@fixtures/base.fixture';

/**
 * Migrated from legacy `account_login_pw.spec.ts`. The legacy password flow no longer exists on
 * staging — "Continue With Email" now routes to an email-code (OTP) step (confirmed via MCP).
 * This test verifies that current sign-in entry. Completing OTP needs the emailed code, so the
 * authenticated tests instead get their session from the signup API (see account.portal).
 */
test.describe('Accounts: Sign In', { tag: ['@desktop', '@accounts'] }, () => {
    test(
        '[QA-0] - Check that Continue With Email routes to the email-code step',
        {
            annotation: [
                { type: 'Test', description: 'Entering an email and continuing shows the "Check Your Email for a Code" step' }
            ],
            tag: ['@staging', '@smoke']
        },
        async ({ accountsPage }) => {
            await test.step('Open the account sign-in page', async () => {
                await accountsPage.open();
                await expect(accountsPage.inputEmail,
                    'Email field should be visible on the sign-in page').toBeVisible();
            });

            await test.step('Continue with email routes to the email-code step', async () => {
                await accountsPage.continueWithEmail('qa-master-signin-probe@mailnull.com');
                await expect(accountsPage.headingEmailCode,
                    'Sign-in should advance to the email-code step').toBeVisible();
            });
        }
    );
});
