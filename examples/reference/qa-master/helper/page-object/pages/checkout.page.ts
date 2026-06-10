import { expect, type Locator } from '@playwright/test';

import { BasePage } from '@page-object/basepage';
import logger from '@logger';

const LABEL = 'Checkout';

/**
 * Checkout flow. Discovered via MCP: cart → Proceed → /checkout/contact → /checkout/shipping →
 * /checkout/credit_card → receipt. Contact/shipping are plain Rails forms (filled via UI). The
 * payment page uses **Braintree hosted-field iframes** which can't be filled cross-origin — but
 * Braintree **sandbox accepts `fake-valid-nonce`**, so the order is placed by submitting the
 * credit-card form with that nonce (the one step done outside the UI fields).
 */
export class CheckoutPage extends BasePage {
    readonly buttonProceed: Locator =
        this.page.getByTestId('order-submit').describe(`[${LABEL}] Proceed to Checkout`);
    readonly buttonContinueToShipping: Locator =
        this.page.locator('input[name="commit"][value="Continue to Shipping"]').first().describe(`[${LABEL}] Continue to Shipping`);
    readonly buttonContinueToPayment: Locator =
        this.page.locator('input[name="commit"][value="Continue to Payment"]').first().describe(`[${LABEL}] Continue to Payment`);

    readonly inputContactFirst: Locator = this.page.locator('#contact_detail_first_name');
    readonly inputContactLast: Locator = this.page.locator('#contact_detail_last_name');
    readonly inputContactPhone: Locator = this.page.locator('#contact_detail_phone_number');

    readonly inputShipAddress1: Locator = this.page.locator('#shipping_address_address_1');
    readonly radioAddressType: Locator = this.page.locator('#shipping_address_address_type_id_2');
    readonly buttonUseAsEntered: Locator =
        this.page.getByTestId('use-as-entered-button').describe(`[${LABEL}] Use address As Entered`);

    // Cart "How Many Do You Need?" prompt for a 0-quantity item
    readonly inputCartQtyM: Locator = this.page.locator('input[name="items.0.sizes.M"]');
    readonly buttonSaveQuantities: Locator =
        this.page.getByTestId('save-quantities').describe(`[${LABEL}] Save quantities`);

    async waitForPageLoad(): Promise<void> {
        await expect(this.page, `[${LABEL}] Should be on the cart`).toHaveURL(/\/cart/, { timeout: 45_000 });
    }

    /**
     * Place an order end-to-end from a cart holding a saved design. A freshly-added design has no
     * quantities, so the cart shows a "How Many Do You Need?" prompt — fill it to enable checkout.
     */
    async placeOrderFromCart(): Promise<void> {
        logger.info(`[${LABEL}] Placing order from cart`);
        await this.page.goto('/cart/', { timeout: 45_000 });

        // Set a quantity if the cart prompts for one (0-quantity item)
        if (await this.inputCartQtyM.isVisible({ timeout: 8_000 }).catch(() => false)) {
            logger.info(`[${LABEL}] Setting cart quantity`);
            await this.inputCartQtyM.fill('24');
            await this.buttonSaveQuantities.click();
        }

        await expect(this.buttonProceed, `[${LABEL}] Proceed should be enabled`).toBeEnabled({ timeout: 45_000 });
        await this.buttonProceed.click();

        // Contact — verify the form rendered (not just the URL) before filling
        await expect(this.page, `[${LABEL}] Contact step`).toHaveURL(/checkout\/contact/, { timeout: 45_000 });
        await expect(this.inputContactFirst, `[${LABEL}] Contact form should render`).toBeVisible({ timeout: 30_000 });
        await this.inputContactFirst.fill('QA');
        await this.inputContactLast.fill('Master');
        await this.inputContactPhone.fill('7035551234');
        await this.buttonContinueToShipping.click();

        // Shipping — verify the address form rendered before filling
        await expect(this.page, `[${LABEL}] Shipping step`).toHaveURL(/checkout\/shipping/, { timeout: 45_000 });
        await expect(this.inputShipAddress1, `[${LABEL}] Shipping form should render`).toBeVisible({ timeout: 30_000 });
        await this.inputShipAddress1.fill('123 Main St');
        await this.radioAddressType.check().catch(() => { /* address type may be preselected */ });
        await this.buttonContinueToPayment.click();
        // Address-verification modal may appear
        await this.buttonUseAsEntered.click({ timeout: 15_000 }).catch(() => { /* no verification prompt */ });

        // Payment — submit the credit-card form with a Braintree sandbox nonce (no iframe needed)
        await expect(this.page, `[${LABEL}] Payment step`).toHaveURL(/checkout\/credit_card/, { timeout: 45_000 });
        await this.submitPaymentWithFakeNonce();

        // Receipt — verify the confirmation page rendered, not just the URL
        await expect(this.page, `[${LABEL}] Order should land on the receipt`)
            .toHaveURL(/checkout\/receipt/, { timeout: 60_000 });
        await expect(this.page.getByRole('heading').first(), `[${LABEL}] Receipt page should render`)
            .toBeVisible({ timeout: 30_000 });
    }

    private async submitPaymentWithFakeNonce(): Promise<void> {
        logger.info(`[${LABEL}] Submitting payment (Braintree fake-valid-nonce)`);
        await expect(this.page.locator('#credit_card input[name="payment_method_nonce"]'),
            `[${LABEL}] Credit-card form should render`).toBeAttached({ timeout: 30_000 });
        await this.page.evaluate(() => {
            const form = document.querySelector<HTMLFormElement>('#credit_card');
            if (!form) {
                throw new Error('Credit-card form not found');
            }
            const set = (name: string, value: string) => {
                const input = form.querySelector<HTMLInputElement>(`[name="${name}"]`);
                if (input) {
                    input.value = value;
                }
            };
            set('payment_method_nonce', 'fake-valid-nonce');
            set('credit_card[name_on_card]', 'QA Master');
            set('credit_card_address[same_as_shipping]', '1');
            set('payment_vaulted', 'false');
            form.submit();
        });
    }
}
