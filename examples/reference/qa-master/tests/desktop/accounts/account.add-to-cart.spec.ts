import { test, expect } from '@fixtures/base.fixture';

/**
 * Migrated from legacy `account_add_to_cart.spec.ts`. Seeds a design via NDX, then adds it to the
 * cart from My Designs and confirms the cart redirect.
 */
test.describe('Accounts: My Designs', { tag: ['@desktop', '@accounts'] }, () => {
    test(
        '[QA-0] - Check that a design can be added to the cart',
        {
            annotation: [{ type: 'Test', description: 'Adding a saved design to the cart redirects to the cart' }],
            tag: ['@staging']
        },
        async ({ ndxPage, designsPage, cartPage, authenticatedUser: _authenticatedUser }) => {
            await test.step('Seed a saved design via NDX', async () => {
                await ndxPage.seedDesign('qa-master-cart-design');
            });

            await test.step('Add the design to the cart', async () => {
                await designsPage.open();
                await designsPage.buttonAddToCart.click();
                await expect(cartPage.page, 'Should redirect to the cart')
                    .toHaveURL(/cart/, { timeout: 45_000 });
                // Not just the URL — verify the cart page actually rendered.
                await expect(cartPage.heading, 'The cart page should render')
                    .toBeVisible({ timeout: 30_000 });
            });
        }
    );
});
