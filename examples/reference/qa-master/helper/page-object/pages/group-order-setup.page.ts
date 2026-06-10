import { expect, type Locator } from '@playwright/test';

import { BasePage } from '@page-object/basepage';
import logger from '@logger';

const LABEL = 'GOF Setup';

/**
 * Group-Order-Form setup flow (Rails). Reached from a saved design as `/g/{cid}/setup/start`.
 * Used to **seed a launched group order** so the account Group Orders dashboard has data.
 * Flow confirmed via MCP: organizer info → settings (qty/shipping/payment) → Launch.
 */
export class GroupOrderSetupPage extends BasePage {
    readonly inputGroupName: Locator = this.page.locator('#group_order_name').describe(`[${LABEL}] Group name`);
    readonly inputFirstName: Locator = this.page.locator('#group_order_first_name').describe(`[${LABEL}] First name`);
    readonly inputLastName: Locator = this.page.locator('#group_order_last_name').describe(`[${LABEL}] Last name`);
    readonly inputPhone: Locator = this.page.locator('#group_order_phone_number').describe(`[${LABEL}] Phone`);
    readonly inputPostalCode: Locator = this.page.locator('#group_order_postal_code').describe(`[${LABEL}] Postal code`);
    readonly buttonContinue: Locator = this.page.locator('input[name="commit"]').describe(`[${LABEL}] Continue to settings`);

    readonly inputExpectedQuantity: Locator =
        this.page.locator('#group_order_expected_quantity').describe(`[${LABEL}] Expected quantity`);
    readonly radioShippingBulk: Locator =
        this.page.locator('#group_order_shipping_type_bulk').describe(`[${LABEL}] Bulk shipping`);
    readonly radioPaymentOff: Locator =
        this.page.locator('#group_order_payment_type_off').describe(`[${LABEL}] Payment off`);
    readonly buttonLaunch: Locator =
        this.page.getByRole('button', { name: 'Launch Your Group Order Form' }).describe(`[${LABEL}] Launch button`);

    async waitForPageLoad(): Promise<void> {
        await expect(this.inputGroupName, `[${LABEL}] Organizer form should be visible`)
            .toBeVisible({ timeout: 30_000 });
    }

    /**
     * Create and launch a group order from a saved design (its composite id). Organizer pays
     * (payment off) + bulk shipping — no payment required.
     */
    async createGroupOrder({ cid, name = 'QA Master Group Order' }: { cid: string, name?: string }): Promise<void> {
        logger.info(`[${LABEL}] Creating group order "${name}" for design ${cid}`);
        await this.page.goto(`/g/${cid}/setup/start`, { timeout: 45_000 });
        await this.waitForPageLoad();

        await this.inputGroupName.fill(name);
        await this.inputFirstName.fill('QA');
        await this.inputLastName.fill('Master');
        await this.inputPhone.fill('123-456-7890');
        await this.inputPostalCode.fill('22030');
        await this.buttonContinue.click();

        await expect(this.inputExpectedQuantity, `[${LABEL}] Settings step should load`)
            .toBeVisible({ timeout: 30_000 });
        await this.inputExpectedQuantity.fill('12');
        await this.radioShippingBulk.check();
        await this.radioPaymentOff.check();
        await this.buttonLaunch.click();

        await expect(this.page, `[${LABEL}] Group order should launch to its dashboard`)
            .toHaveURL(new RegExp(`/g/${cid}`), { timeout: 45_000 });
        // Not just the URL — verify the launched group-order page rendered (its name heading).
        await expect(this.page.getByRole('heading', { name }), `[${LABEL}] Launched group order "${name}" should render`)
            .toBeVisible({ timeout: 30_000 });
    }
}
