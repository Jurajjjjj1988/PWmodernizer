import { test, expect } from '@fixtures/base.fixture';

import { URLS } from '@test-data/urls';

/**
 * Migrated from legacy `account_smoke.spec.ts`. A freshly-created, signed-in user can reach each
 * in-account section. (Fundraising is excluded — it lives behind a separate fundraising login,
 * so a customer account is not authenticated there.)
 */
const SECTIONS = [
    { name: 'My Designs', path: URLS.paths.accountDesigns },
    { name: 'My Uploads', path: URLS.paths.accountUploads },
    { name: 'Order History', path: URLS.paths.accountOrderHistory },
    { name: 'Group Orders', path: URLS.paths.accountGroupOrders },
    { name: 'Online Stores', path: URLS.paths.accountStores }
];

test.describe('Accounts: Portal Smoke', { tag: ['@desktop', '@accounts'] }, () => {
    test(
        '[QA-0] - Check that a signed-in user can reach each account section',
        {
            annotation: [
                { type: 'Test', description: 'Each in-account section loads for a signed-in user' }
            ],
            tag: ['@staging', '@smoke']
        },
        async ({ accountsPage, authenticatedUser: _authenticatedUser }) => {
            await test.step('Open the account overview', async () => {
                await accountsPage.openPortal();
            });

            for (const section of SECTIONS) {
                await test.step(`Open ${section.name}`, async () => {
                    await accountsPage.openSection(section.path);
                    await expect(accountsPage.page, `${section.name} URL should be ${section.path}`)
                        .toHaveURL(new RegExp(section.path.replace(/\//g, '\\/')));
                    // Not just the URL — verify the section's own content rendered (its heading).
                    await expect(
                        accountsPage.page.getByRole('heading', { name: section.name, level: 1 }),
                        `${section.name} heading should render`
                    ).toBeVisible({ timeout: 30_000 });
                });
            }
        }
    );
});
