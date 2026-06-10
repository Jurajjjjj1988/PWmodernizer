import { test, expect } from '@fixtures/base.fixture';

import { TEST_UPLOAD_FILE } from '@test-data/files';

/**
 * Migrated from legacy `account_rename_upload_name.spec.ts`. Uploads a file then renames it.
 */
test.describe('Accounts: Uploads', { tag: ['@desktop', '@accounts'] }, () => {
    test(
        '[QA-0] - Check that a user can rename an uploaded file',
        {
            annotation: [{ type: 'Test', description: 'A user can rename an uploaded file and the new name is shown' }],
            tag: ['@staging']
        },
        async ({ uploadsPage, authenticatedUser: _authenticatedUser }) => {
            const newName = 'renamed-by-qa-master';

            await test.step('Upload a file', async () => {
                await uploadsPage.open();
                await uploadsPage.uploadFile(TEST_UPLOAD_FILE);
            });

            await test.step('Rename the uploaded file', async () => {
                await uploadsPage.renameFirstUpload(newName);
                await expect(uploadsPage.uploadedFileName, 'Card should show the renamed file')
                    .toHaveText(newName);
            });
        }
    );
});
