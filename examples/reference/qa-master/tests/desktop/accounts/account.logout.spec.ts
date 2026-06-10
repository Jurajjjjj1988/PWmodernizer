import { test, expect } from '@fixtures/base.fixture';

/**
 * Migrated from legacy `account_logout.spec.ts`.
 * Data isolation: `authenticatedUser` creates a brand-new account via the API and signs the
 * context in — the test starts authenticated as its own user, with no UI login.
 */
test.describe('Accounts: Sign Out', { tag: ['@desktop', '@accounts'] }, () => {
    test(
        '[QA-0] - Check that a signed-in user can sign out',
        {
            annotation: [
                { type: 'Test', description: 'A signed-in user can sign out and is returned to the login page' }
            ],
            tag: ['@staging']
        },
        async ({ accountsPage, authenticatedUser: _authenticatedUser }) => {
            await test.step('Open the account overview (already signed in)', async () => {
                await accountsPage.openPortal();
                await expect(accountsPage.accountGreeting,
                    'Portal greeting should be visible when signed in').toContainText('Welcome back,');
            });

            await test.step('Sign out', async () => {
                await accountsPage.signOut();
                await expect(accountsPage.page,
                    'Sign-out should return to the login page').toHaveURL(/\/profiles\/users\/sign_in/);
                // Not just the URL — verify the sign-in form actually rendered.
                await expect(accountsPage.inputEmail, 'Sign-in email field should render after sign-out')
                    .toBeVisible({ timeout: 30_000 });
            });
        }
    );
});
