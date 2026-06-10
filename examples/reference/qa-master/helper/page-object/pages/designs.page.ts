import { expect, type Locator } from '@playwright/test';

import { BasePage } from '@page-object/basepage';
import { URLS } from '@test-data/urls';
import logger from '@logger';

const LABEL = 'My Designs';

/** Sort option `data-value`s used by the My Designs filter (from the legacy suite). */
export const DESIGN_SORT = {
    newest: 'createdAt-desc',
    oldest: 'createdAt-asc',
    dateModified: 'updatedAt-desc',
    nameAtoZ: 'name-asc',
    nameZtoA: 'name-desc'
} as const;

/**
 * Account → My Designs (/account/designs). GraphQL-backed (`me.designs`); seed a design via NDX
 * first (see NdxPage). Selectors confirmed via MCP.
 */
export class DesignsPage extends BasePage {
    readonly url = URLS.paths.accountDesigns;

    readonly heading: Locator = this.page.getByRole('heading', { name: 'My Designs' }).describe(`[${LABEL}] Heading`);
    readonly designCard: Locator = this.page.getByTestId('designs card').describe(`[${LABEL}] Design card`);
    readonly cardCheckmark: Locator =
        this.page.locator('[data-testid*="CardSelect"]').describe(`[${LABEL}] Card select checkmark`);
    readonly sortDropdown: Locator =
        this.page.locator('[data-testid="designs filter"] [role="combobox"]').describe(`[${LABEL}] Sort dropdown`);
    readonly buttonAddToCart: Locator =
        this.page.getByRole('button', { name: 'Add to Cart' }).first().describe(`[${LABEL}] Add to Cart (card)`);
    readonly buttonAddSelectedToCart: Locator =
        this.page.locator('header').getByRole('button', { name: 'Add to Cart' }).describe(`[${LABEL}] Add selected to Cart`);
    readonly linkEditDesign: Locator =
        this.page.getByRole('link', { name: 'Edit Design' }).first().describe(`[${LABEL}] Edit Design link`);

    sortOption(value: string): Locator {
        return this.page.locator(`li[data-value="${value}"]`).describe(`[${LABEL}] Sort option ${value}`);
    }

    async open(): Promise<void> {
        await this.openWithDesigns(1);
    }

    async waitForPageLoad(): Promise<void> {
        await expect(this.designCard.first(), `[${LABEL}] At least one design card should be visible`)
            .toBeVisible({ timeout: 30_000 });
    }

    /**
     * Open My Designs, reloading until at least `minCount` designs are listed. The list is
     * GraphQL-backed and can lag for a few seconds after an NDX save (especially under load),
     * so a cold render right after seeding may briefly show the empty state.
     */
    async openWithDesigns(minCount = 1): Promise<void> {
        logger.info(`[${LABEL}] Opening My Designs (expecting >= ${minCount})`);
        await this.page.goto(this.url, { timeout: 45_000 });
        await expect
            .poll(
                async () => {
                    const count = await this.designCard.count();
                    if (count < minCount) {
                        await this.page.reload({ timeout: 45_000 });
                    }
                    return this.designCard.count();
                },
                {
                    message: `[${LABEL}] At least ${minCount} design(s) should be listed (GraphQL list can lag after a seed)`,
                    timeout: 60_000,
                    intervals: [2_000, 3_000, 5_000]
                }
            )
            .toBeGreaterThanOrEqual(minCount);
    }

    /** Pick a sort option; the list stays populated afterward. */
    async sortBy(value: string): Promise<void> {
        await this.sortDropdown.click();
        await this.sortOption(value).click();
        await expect(this.designCard.first(), `[${LABEL}] Designs should still be listed after sorting`)
            .toBeVisible();
    }
}
