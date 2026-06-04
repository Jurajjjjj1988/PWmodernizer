import { type Page, type Locator, expect } from "@playwright/test";

/**
 * Playwright POM for the login flow. Refactored from the Selenium Java
 * PageFactory @FindBy class — Locators are lazily evaluated by Playwright
 * (no PageFactory equivalent needed) and waits are implicit via web-first
 * assertions.
 */
export class LoginPage {
  readonly page: Page;
  readonly emailField: Locator;
  readonly passwordField: Locator;
  readonly signInButton: Locator;
  readonly errorBanner: Locator;

  constructor(page: Page) {
    this.page = page;
    this.emailField = page.getByLabel(/email/i);
    this.passwordField = page.getByLabel(/password/i);
    this.signInButton = page.getByRole("button", { name: /sign in/i });
    this.errorBanner = page.getByRole("alert");
  }

  async open(): Promise<void> {
    await this.page.goto("/login");
  }

  async enterCredentials(email: string, password: string): Promise<void> {
    await this.emailField.fill(email);
    await this.passwordField.fill(password);
  }

  async submit(): Promise<void> {
    await this.signInButton.click();
  }

  async expectErrorMessage(text: string | RegExp): Promise<void> {
    await expect(this.errorBanner).toHaveText(text);
  }

  async expectDashboardLanding(): Promise<void> {
    await expect(this.page).toHaveURL(/\/dashboard/);
  }
}
