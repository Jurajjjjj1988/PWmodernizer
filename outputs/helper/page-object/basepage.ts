import { type Page } from "@playwright/test";

/**
 * Base for full pages. Wires `page` (parameter property) so subclasses declare NO own constructor —
 * their locators are `readonly` fields that reference `this.page`.
 *
 * v0.2.0 qa-master scaffolding — checked into main so every migration extends this exact file
 * instead of re-emitting it. Per migration-rules.md §3 (PageClass discipline).
 */
abstract class BasePage {
  readonly url: string = "";

  constructor(readonly page: Page) {}

  abstract waitForPageLoad(): Promise<void>;

  async open(): Promise<void> {
    await this.page.goto(this.url);
    await this.waitForPageLoad();
  }

  async reloadPage(): Promise<void> {
    await this.page.reload({ timeout: 60_000 });
    await this.waitForPageLoad();
  }
}

export { BasePage };
