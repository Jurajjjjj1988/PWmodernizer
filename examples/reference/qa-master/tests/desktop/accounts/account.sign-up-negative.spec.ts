import { test, expect } from '@fixtures/base.fixture';

import { uniqueEmail } from '@api/accounts.api';

/**
 * Migrated from legacy `staging_account_neg_signup.spec.ts`. Submitting the sign-up form with a
 * non-matching password confirmation shows the mismatch error and does not create an account.
 */
test.describe('Accounts: Sign Up', { tag: ['@desktop', '@accounts'] }, () => {
    test(
        '[QA-0] - Check that mismatched passwords are rejected on sign-up',
        {
            annotation: [
                { type: 'Test', description: 'Submitting mismatched password + confirmation shows the mismatch error' }
            ],
            tag: ['@staging']
        },
        async ({ accountsPage }) => {
            await test.step('Open the create-account page', async () => {
                await accountsPage.openSignUp();
            });

            await test.step('Submit with mismatched passwords', async () => {
                await accountsPage.submitSignUp({
                    email: uniqueEmail(),
                    password: 'TestPass123!',
                    confirmation: 'DifferentPass456!'
                });
                await accountsPage.expectPasswordMismatch();
                await expect(accountsPage.page,
                    'Should remain on the sign-up page (no account created)')
                    .toHaveURL(/\/profiles\/users\/sign_up/);
            });
        }
    );
});
