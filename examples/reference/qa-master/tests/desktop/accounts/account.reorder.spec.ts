import { test, expect } from '@fixtures/base.fixture';

import { createOrderableDesign, addDesignToCart } from '@api/checkout.api';

/**
 * Migrated from legacy `account_reorder.spec.ts` (which was `test.skip`, QAE-3301 — it had no way
 * to seed an order). We seed a real order (API design + cart → UI checkout + sandbox payment),
 * then exercise Reorder from Order History, which returns the items to the cart.
 *
 * `test.fixme`: same blocker as account.order-history — order placement works, but a brand-new
 * isolated account's order does not associate to its accounts-service history (project-service
 * auth), so there is nothing to reorder. Un-fixme once order association/seed is available.
 */
test.describe('Accounts: Reorder', { tag: ['@desktop', '@accounts'] }, () => {
    test.fixme(
        '[QA-0] - Check that a past order can be reordered',
        {
            annotation: [{ type: 'Test', description: 'Reorder from Order History puts the order back into the cart' }],
            tag: ['@staging']
        },
        async ({ context, checkoutPage, cartPage, orderHistoryPage, authenticatedUser: _authenticatedUser }) => {
            await test.step('Seed an order to reorder', async () => {
                const cid = await createOrderableDesign(context.request);
                await addDesignToCart(context.request, cid);
                await checkoutPage.placeOrderFromCart();
            });

            await test.step('Reorder the placed order', async () => {
                await orderHistoryPage.open();
                await orderHistoryPage.buttonReorder.click();
            });

            await test.step('Reorder lands the item back in the cart', async () => {
                await cartPage.waitForPageLoad();
                await expect(cartPage.buttonProceedToCheckout, 'Cart should hold the reordered item')
                    .toBeEnabled({ timeout: 30_000 });
            });
        }
    );
});
