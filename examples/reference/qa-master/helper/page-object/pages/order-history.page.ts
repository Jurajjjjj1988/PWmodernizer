import { expect, type Locator } from '@playwright/test';

import { BasePage } from '@page-object/basepage';
import { URLS } from '@test-data/urls';
import logger from '@logger';

const LABEL = 'Order History';

/**
 * Account → Order History page. Migrated from `@page_actions/account/order_history.actions`
 * + the `LocatorsAccountOrderHistory` class.
 */
export class OrderHistoryPage extends BasePage {
    readonly url = URLS.paths.accountOrderHistory;

    readonly buttonOrderStatus: Locator =
        this.page.getByText('Order Status').first().describe(`[${LABEL}] Order Status button`);
    readonly buttonViewInvoice: Locator =
        this.page.getByText('View Invoice').first().describe(`[${LABEL}] View Invoice button`);
    readonly orderStatusHeader: Locator =
        this.page.locator('.ot-Status-header-main-status').describe(`[${LABEL}] Order Status header`);
    readonly buttonReorder: Locator =
        this.page.getByRole('button', { name: 'Reorder' }).first().describe(`[${LABEL}] Reorder button`);

    private readonly accountGreeting: Locator = this.page.locator('#accounts-greeting');
    private readonly navOrderHistory: Locator = this.page.locator('a[data-action="order history"]');

    /**
     * Open Order History via the portal so the account app establishes its OAuth session first
     * (a direct navigation to /account/orders can render before auth completes). Retries the whole
     * portal → Order History cycle because a freshly-placed order can lag in `me.orders`.
     */
    async open(): Promise<void> {
        logger.info(`[${LABEL}] Opening Order History (via portal)`);
        await expect(async () => {
            await this.page.goto(URLS.paths.accountPortal, { timeout: 45_000 });
            await expect(this.accountGreeting, `[${LABEL}] Account portal should load`).toBeVisible({ timeout: 30_000 });
            await this.navOrderHistory.click();
            await expect(this.page, `[${LABEL}] Should reach Order History`).toHaveURL(/\/account\/orders/, { timeout: 20_000 });
            const status = await this.buttonOrderStatus.isVisible().catch(() => false);
            const invoice = await this.buttonViewInvoice.isVisible().catch(() => false);
            expect(status || invoice, `[${LABEL}] A placed order should be listed`).toBe(true);
        }).toPass({ timeout: 180_000, intervals: [5_000, 10_000, 15_000] });
    }

    async waitForPageLoad(): Promise<void> {
        await expect(this.buttonOrderStatus, `[${LABEL}] Order Status button should be visible`)
            .toBeVisible({ timeout: 30_000 });
        await expect(this.page, `[${LABEL}] URL should be the order history page`)
            .toHaveURL(/\/account\/orders/);
        logger.info(`[${LABEL}] Page loaded`);
    }

    /** Open the order-status tracker for the most recent order. */
    async openOrderStatus(): Promise<void> {
        await expect(this.buttonOrderStatus, `[${LABEL}] Order Status button label`).toHaveText('Order Status');
        await this.buttonOrderStatus.click();
        await expect(this.orderStatusHeader, `[${LABEL}] Order status header should appear`)
            .toHaveText('Order Status');
    }
}
