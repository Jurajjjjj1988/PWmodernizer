import { expect, type Locator } from '@playwright/test';

import { BasePage } from '@page-object/basepage';
import logger from '@logger';

const LABEL = 'Cart';

/** Shopping cart (/cart). Reached from My Designs "Add to Cart". */
export class CartPage extends BasePage {
    readonly url = '/cart/';

    readonly buttonProceedToCheckout: Locator =
        this.page.getByTestId('order-submit').describe(`[${LABEL}] Proceed to Checkout`);
    /** The "My Cart" page heading — present whether the cart is empty or has items. */
    readonly heading: Locator =
        this.page.getByRole('heading', { name: 'My Cart' }).describe(`[${LABEL}] My Cart heading`);

    async waitForPageLoad(): Promise<void> {
        await expect(this.page, `[${LABEL}] Should be on the cart`).toHaveURL(/\/cart/, { timeout: 45_000 });
        await expect(this.buttonProceedToCheckout, `[${LABEL}] Proceed button should be present`)
            .toBeVisible({ timeout: 30_000 });
    }

    /** Proceed to checkout (requires a valid, priced item in the cart). */
    async proceedToCheckout(): Promise<void> {
        logger.info(`[${LABEL}] Proceeding to checkout`);
        await expect(this.buttonProceedToCheckout, `[${LABEL}] Proceed should be enabled for a valid cart`)
            .toBeEnabled({ timeout: 30_000 });
        await this.buttonProceedToCheckout.click();
    }
}
