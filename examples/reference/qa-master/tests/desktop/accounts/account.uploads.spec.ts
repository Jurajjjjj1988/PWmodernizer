import { test, expect } from '@fixtures/base.fixture';

import { TEST_UPLOAD_FILE, TEST_UPLOAD_FILE_NAME } from '@test-data/files';

/**
 * Migrated from legacy `account_uploads.spec.ts`. Data isolation: `authenticatedUser` is a fresh
 * account, so its uploads start empty.
 */
test.describe('Accounts: Uploads', { tag: ['@desktop', '@accounts'] }, () => {
    test(
        '[QA-0] - Check that a user can upload a file',
        {
            annotation: [{ type: 'Test', description: 'A signed-in user can upload a file to My Uploads' }],
            tag: ['@staging']
        },
        async ({ uploadsPage, authenticatedUser: _authenticatedUser }) => {
            await test.step('Open My Uploads', async () => {
                await uploadsPage.open();
            });

            await test.step('Upload a file', async () => {
                await uploadsPage.uploadFile(TEST_UPLOAD_FILE);
                await expect(uploadsPage.uploadedFileName, 'Uploaded file should be listed')
                    .toHaveText(TEST_UPLOAD_FILE_NAME);
            });
        }
    );
});
