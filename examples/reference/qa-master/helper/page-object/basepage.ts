import { type Page } from '@playwright/test';

/**
 * Base for full pages. Wires `page` (parameter property) so subclasses declare NO constructor —
 * their locators are `readonly` fields that reference `this.page`.
 */
abstract class BasePage {
    readonly url: string = '';

    constructor(readonly page: Page) {}

    abstract waitForPageLoad(): Promise<void>;

    async reloadPage(): Promise<void> {
        await this.page.reload({ timeout: 60_000 });
        await this.waitForPageLoad();
    }
}

export { BasePage };
