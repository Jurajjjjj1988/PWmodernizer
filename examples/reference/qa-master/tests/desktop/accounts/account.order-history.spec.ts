import { test, expect } from '@fixtures/base.fixture';

import { createOrderableDesign, addDesignToCart } from '@api/checkout.api';

/**
 * Migrated from legacy `account_order_history.spec.ts`. Seeds its own order: create a priced design
 * + add it to the cart via API, then place the order through the UI checkout (paid with the
 * Braintree sandbox `fake-valid-nonce`). The order should then appear in Order History (`me.orders`).
 *
 * `test.fixme`: order *placement* is fully implemented and verified (checkout reaches the receipt —
 * see CheckoutPage + checkout.api). The blocker is association: the cart lives in the
 * project-service (a `*.lambda-staging.customink.com` subdomain) which an APIRequestContext reaches
 * anonymously (the profiles auth is scoped to www-master), so the order is placed as a guest and
 * never surfaces in the brand-new isolated account's history. Associating it needs the app's
 * project-service OAuth token (PKCE) or a backend order-seed. Un-fixme once that exists.
 */
test.describe('Accounts: Order History', { tag: ['@desktop', '@accounts'] }, () => {
    test.fixme(
        '[QA-0] - Check that a placed order appears in order history',
        {
            annotation: [{ type: 'Test', description: 'A user who places an order sees it in Order History with status + invoice' }],
            tag: ['@staging']
        },
        async ({ context, checkoutPage, orderHistoryPage, authenticatedUser: _authenticatedUser }) => {
            await test.step('Seed a priced order (API design + cart) and place it via checkout', async () => {
                const cid = await createOrderableDesign(context.request);
                await addDesignToCart(context.request, cid);
                await checkoutPage.placeOrderFromCart();
            });

            await test.step('Open Order History and verify the order', async () => {
                await orderHistoryPage.open();
                await expect(orderHistoryPage.buttonOrderStatus, 'Order Status should be shown').toBeVisible();
                await expect(orderHistoryPage.buttonViewInvoice, 'View Invoice should be shown').toBeVisible();
            });
        }
    );
});
