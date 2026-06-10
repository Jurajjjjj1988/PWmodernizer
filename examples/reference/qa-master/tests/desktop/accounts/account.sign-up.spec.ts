import { test, expect } from '@fixtures/base.fixture';

import { uniqueEmail, ACCOUNT_PASSWORD } from '@api/accounts.api';

/**
 * Migrated from legacy `staging_account_signup.spec.ts`. Creates a brand-new account through the
 * UI (data-isolated by a unique email) and confirms it lands authenticated in the portal.
 */
test.describe('Accounts: Sign Up', { tag: ['@desktop', '@accounts'] }, () => {
    test(
        '[QA-0] - Check that a new user can create an account',
        {
            annotation: [
                { type: 'Test', description: 'A new user can sign up with email + password and reach the account portal' }
            ],
            tag: ['@staging']
        },
        async ({ accountsPage }) => {
            const email = uniqueEmail();

            await test.step('Open the create-account page', async () => {
                await accountsPage.openSignUp();
                await expect(accountsPage.headingCreateAccount,
                    'Create An Account heading should be visible').toBeVisible();
            });

            await test.step('Submit the sign-up form', async () => {
                await accountsPage.signUp({ email, password: ACCOUNT_PASSWORD });
                await expect(accountsPage.accountGreeting,
                    'New account should land authenticated in the portal').toContainText('Welcome back,');
            });
        }
    );
});
