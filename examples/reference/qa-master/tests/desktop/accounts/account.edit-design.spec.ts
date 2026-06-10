import { test, expect } from '@fixtures/base.fixture';

/**
 * Migrated from legacy `account_edit_design.spec.ts`. Seeds a design via NDX, then opens it for
 * editing from My Designs and confirms the editor loads for that design (cid in URL).
 */
test.describe('Accounts: My Designs', { tag: ['@desktop', '@accounts'] }, () => {
    test(
        '[QA-0] - Check that a design can be opened for editing',
        {
            annotation: [{ type: 'Test', description: 'Edit Design opens the saved design in the design editor' }],
            tag: ['@staging']
        },
        async ({ ndxPage, designsPage, authenticatedUser: _authenticatedUser }) => {
            await test.step('Seed a saved design via NDX', async () => {
                await ndxPage.seedDesign('qa-master-edit-design');
            });

            await test.step('Open the design for editing', async () => {
                await designsPage.open();
                await designsPage.linkEditDesign.click();
                await expect(designsPage.page, 'Editor should open for the saved design (cid in URL)')
                    .toHaveURL(/cid=/, { timeout: 45_000 });
                await expect(ndxPage.buttonSaveShare, 'Design editor should load').toBeVisible({ timeout: 60_000 });
            });
        }
    );
});
