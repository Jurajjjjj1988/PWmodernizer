import { test, expect } from '@fixtures/base.fixture';

/**
 * Migrated from legacy `account_add_multi_to_cart.spec.ts`. Seeds two designs via NDX, selects
 * both on My Designs, and adds them to the cart together.
 */
test.describe('Accounts: My Designs', { tag: ['@desktop', '@accounts'] }, () => {
    test(
        '[QA-0] - Check that multiple designs can be added to the cart',
        {
            annotation: [{ type: 'Test', description: 'Selecting multiple saved designs and adding them redirects to the cart' }],
            tag: ['@staging']
        },
        async ({ ndxPage, designsPage, cartPage, authenticatedUser: _authenticatedUser }) => {
            await test.step('Seed two saved designs via NDX', async () => {
                await ndxPage.seedDesign('qa-master-multi-1');
                await ndxPage.seedDesign('qa-master-multi-2');
            });

            await test.step('Select both designs', async () => {
                await designsPage.openWithDesigns(2);
                await expect(designsPage.designCard, 'Two designs should be listed').toHaveCount(2);
                await designsPage.cardCheckmark.nth(0).click();
                await designsPage.cardCheckmark.nth(1).click();
            });

            await test.step('Add the selected designs to the cart', async () => {
                await designsPage.buttonAddSelectedToCart.click();
                await expect(designsPage.page, 'Should redirect to the cart')
                    .toHaveURL(/cart/, { timeout: 45_000 });
                // Not just the URL — verify the cart page actually rendered.
                await expect(cartPage.heading, 'The cart page should render')
                    .toBeVisible({ timeout: 30_000 });
            });
        }
    );
});
