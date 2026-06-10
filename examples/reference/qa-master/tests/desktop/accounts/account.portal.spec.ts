import { test, expect } from '@fixtures/base.fixture';

/**
 * Data isolation: `authenticatedUser` creates a brand-new account via the signup API and signs
 * the context in — so the test owns its own user. Verifies the user reaches their account portal.
 * (Modern equivalent of the legacy "can log in and see the account" coverage.)
 */
test.describe('Accounts: Portal', { tag: ['@desktop', '@accounts'] }, () => {
    test(
        '[QA-0] - Check that a signed-in user can open their account overview',
        {
            annotation: [
                { type: 'Test', description: 'A freshly-created, signed-in user lands on the account overview and is greeted by name' }
            ],
            tag: ['@staging', '@smoke']
        },
        async ({ accountsPage, authenticatedUser }) => {
            await test.step('Open the account overview', async () => {
                await accountsPage.openPortal();

                await expect(accountsPage.accountGreeting,
                    'Portal should greet the signed-in user').toContainText('Welcome back,');
                await expect(accountsPage.accountGreeting,
                    'Greeting should name the freshly-created user')
                    .toContainText(authenticatedUser.email.split('@')[0]);
            });
        }
    );
});
