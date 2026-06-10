import { expect, type Locator } from '@playwright/test';

import { BasePage } from '@page-object/basepage';
import { URLS } from '@test-data/urls';
import logger from '@logger';

const LABEL = 'Group Orders';

/** Account → Group Orders dashboard (/account/group_orders). */
export class GroupOrdersPage extends BasePage {
    readonly url = URLS.paths.accountGroupOrders;

    readonly linkPlaceOrder: Locator =
        this.page.getByRole('link', { name: 'Place Order' }).first().describe(`[${LABEL}] Place Order`);
    readonly linkViewDesign: Locator =
        this.page.getByRole('link', { name: 'View Design' }).first().describe(`[${LABEL}] View Design`);
    readonly linkManage: Locator =
        this.page.getByRole('link', { name: 'Manage' }).first().describe(`[${LABEL}] Manage`);

    async open(): Promise<void> {
        logger.info(`[${LABEL}] Opening Group Orders`);
        await this.page.goto(this.url, { timeout: 45_000 });
        // The dashboard is GraphQL-backed and can lag right after a group order launches
        // (especially under load), so reload until the launched order is listed.
        await expect
            .poll(
                async () => {
                    if (!(await this.linkPlaceOrder.isVisible().catch(() => false))) {
                        await this.page.reload({ timeout: 45_000 });
                    }
                    return this.linkPlaceOrder.isVisible().catch(() => false);
                },
                {
                    message: `[${LABEL}] A launched group order should be listed (dashboard can lag)`,
                    timeout: 60_000,
                    intervals: [2_000, 3_000, 5_000]
                }
            )
            .toBe(true);
    }

    async waitForPageLoad(): Promise<void> {
        await expect(this.linkPlaceOrder, `[${LABEL}] A launched group order should be listed`)
            .toBeVisible({ timeout: 30_000 });
    }
}
