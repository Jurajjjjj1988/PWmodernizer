import { test, expect } from '@fixtures/base.fixture';

import { TEST_UPLOAD_FILE } from '@test-data/files';

/**
 * Migrated from legacy `account_add_art_to_product.spec.ts`. Uploads its own art, then adds it to
 * a product, which opens the design editor (NDX).
 */
test.describe('Accounts: Uploads', { tag: ['@desktop', '@accounts'] }, () => {
    test(
        '[QA-0] - Check that uploaded art can be added to a product',
        {
            annotation: [{ type: 'Test', description: 'Adding an uploaded art file to a product opens the design editor' }],
            tag: ['@staging']
        },
        async ({ uploadsPage, ndxPage, authenticatedUser: _authenticatedUser }) => {
            await test.step('Upload art', async () => {
                await uploadsPage.open();
                await uploadsPage.uploadFile(TEST_UPLOAD_FILE);
            });

            await test.step('Add the art to a product', async () => {
                await uploadsPage.buttonAddToProduct.click();
                await expect(ndxPage.buttonSaveShare, 'The design editor should open with the art')
                    .toBeVisible({ timeout: 60_000 });
            });
        }
    );
});
