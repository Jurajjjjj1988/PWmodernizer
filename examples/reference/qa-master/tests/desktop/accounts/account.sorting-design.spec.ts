import { test, expect } from '@fixtures/base.fixture';

import { DESIGN_SORT } from '@page-object/pages/designs.page';

/**
 * Migrated from legacy `account_sorting_design.spec.ts`. Seeds its own design via NDX (the only
 * path that populates the GraphQL My Designs list), then exercises the sort options.
 */
test.describe('Accounts: My Designs', { tag: ['@desktop', '@accounts'] }, () => {
    test(
        '[QA-0] - Check that designs can be sorted',
        {
            annotation: [{ type: 'Test', description: 'My Designs sort options re-order the list without breaking it' }],
            tag: ['@staging']
        },
        async ({ ndxPage, designsPage, authenticatedUser: _authenticatedUser }) => {
            await test.step('Seed a saved design via NDX', async () => {
                await ndxPage.seedDesign('qa-master-sort-design');
            });

            await test.step('Open My Designs', async () => {
                await designsPage.open();
                await expect(designsPage.designCard.first(), 'Seeded design should be listed').toBeVisible();
            });

            for (const [name, value] of Object.entries(DESIGN_SORT)) {
                await test.step(`Sort by ${name}`, async () => {
                    await designsPage.sortBy(value);
                    await expect(designsPage.designCard.first(),
                        `Designs should remain listed after sorting by ${name}`).toBeVisible();
                });
            }
        }
    );
});
