import { test as base, expect } from '@playwright/test';

import { AccountsPage } from '@page-object/pages/accounts.page';
import { OrderHistoryPage } from '@page-object/pages/order-history.page';
import { UploadsPage } from '@page-object/pages/uploads.page';
import { NdxPage } from '@page-object/pages/ndx.page';
import { DesignsPage } from '@page-object/pages/designs.page';
import { GroupOrderSetupPage } from '@page-object/pages/group-order-setup.page';
import { GroupOrdersPage } from '@page-object/pages/group-orders.page';
import { CartPage } from '@page-object/pages/cart.page';
import { CheckoutPage } from '@page-object/pages/checkout.page';
import { createAuthenticatedUser, type TestUser } from '@api/accounts.api';
import { CONSENT_COOKIES } from '@test-data/cookies';
import logger from '@logger';

/**
 * The single import source for `test` and `expect` in every spec.
 * - Injects page objects (lazy locator holders — safe to construct up front).
 * - Injects consent + `user_type=automated` cookies (staging 503s bots without it).
 * - `authenticatedUser` gives per-test data isolation: a brand-new account created via the API,
 *   with the context already signed in (no shared account, no shared session).
 * - Auto-logs test start/finish.
 */
type Fixtures = {
    accountsPage: AccountsPage;
    orderHistoryPage: OrderHistoryPage;
    uploadsPage: UploadsPage;
    ndxPage: NdxPage;
    designsPage: DesignsPage;
    groupOrderSetupPage: GroupOrderSetupPage;
    groupOrdersPage: GroupOrdersPage;
    cartPage: CartPage;
    checkoutPage: CheckoutPage;
    /** A fresh, unique account created via the signup API, with the context already signed in. */
    authenticatedUser: TestUser;
};

export const test = base.extend<Fixtures & { autoLog: void }>({
    page: async ({ page }, use) => {
        await page.context().addCookies(CONSENT_COOKIES);
        await use(page);
    },

    accountsPage: async ({ page }, use) => use(new AccountsPage(page)),
    orderHistoryPage: async ({ page }, use) => use(new OrderHistoryPage(page)),
    uploadsPage: async ({ page }, use) => use(new UploadsPage(page)),
    ndxPage: async ({ page }, use) => use(new NdxPage(page)),
    designsPage: async ({ page }, use) => use(new DesignsPage(page)),
    groupOrderSetupPage: async ({ page }, use) => use(new GroupOrderSetupPage(page)),
    groupOrdersPage: async ({ page }, use) => use(new GroupOrdersPage(page)),
    cartPage: async ({ page }, use) => use(new CartPage(page)),
    checkoutPage: async ({ page }, use) => use(new CheckoutPage(page)),

    authenticatedUser: async ({ context }, use) => {
        const user = await createAuthenticatedUser(context);
        await use(user);
    },

    autoLog: [
        // eslint-disable-next-line no-empty-pattern
        async ({}, use, testInfo) => {
            logger.info(`▶ ${testInfo.title}`);
            await use();
            logger.info(`■ ${testInfo.title} — ${testInfo.status}`);
        },
        { auto: true }
    ]
});

export { expect };
