import { test, expect } from '@fixtures/base.fixture';

import { TEST_UPLOAD_FILE } from '@test-data/files';

/**
 * Migrated from legacy `account_delete_file.spec.ts`. Uploads a file (its own data) then deletes
 * it and confirms the empty state returns.
 */
test.describe('Accounts: Uploads', { tag: ['@desktop', '@accounts'] }, () => {
    test(
        '[QA-0] - Check that a user can delete an uploaded file',
        {
            annotation: [{ type: 'Test', description: 'A user can delete an uploaded file and the empty state returns' }],
            tag: ['@staging']
        },
        async ({ uploadsPage, authenticatedUser: _authenticatedUser }) => {
            await test.step('Upload a file', async () => {
                await uploadsPage.open();
                await uploadsPage.uploadFile(TEST_UPLOAD_FILE);
            });

            await test.step('Delete the uploaded file', async () => {
                await uploadsPage.deleteFirstUpload();
                await expect(uploadsPage.browseYourDevice, 'Empty upload state should be shown again')
                    .toBeVisible();
            });
        }
    );
});
