// Migrated by PWmodernizer on 2026-06-10 from inputs/bad-playwright/flaky-waits.spec.ts. See outputs/plans/flaky-waits.spec.ts.md for plan.

import { expect, type Locator } from '@playwright/test';

import { BasePage } from '@page-object/basepage';
import { LOGIN_PATH } from '@test-data/urls';

const LABEL = 'AcmeShopLogin';

export class AcmeShopLoginPage extends BasePage {
  readonly url = LOGIN_PATH;

  // TODO: Q2 unresolved — confirm <label> text matches /email/i; fallback: page.locator('#email')
  readonly inputEmail: Locator = this.page
    .getByLabel(/email/i)
    .describe(`[${LABEL}] Email input`);

  // TODO: Q2 unresolved — confirm <label> text matches /password/i; fallback: page.locator('#password')
  readonly inputPassword: Locator = this.page
    .getByLabel(/password/i)
    .describe(`[${LABEL}] Password input`);

  // TODO: Q5 unresolved — confirm element is a <button>; fallback: page.getByText('Sign in', { exact: true })
  readonly buttonSignIn: Locator = this.page
    .getByRole('button', { name: /sign in/i })
    .describe(`[${LABEL}] Sign In button`);

  // TODO: Q3 unresolved — confirm role or add data-testid="dashboard-greeting"; CSS class kept (LOW confidence)
  readonly textDashboardGreeting: Locator = this.page
    .locator('.dashboard-greeting')
    .describe(`[${LABEL}] Dashboard greeting`);

  // TODO: Q4 unresolved — confirm role="alert" is present on .error-banner; fallback: page.locator('.error-banner')
  readonly alertErrorBanner: Locator = this.page
    .getByRole('alert')
    .describe(`[${LABEL}] Error banner`);

  async waitForPageLoad(): Promise<void> {
    await expect(this.inputEmail, `[${LABEL}] Email input should be visible on page load`).toBeVisible();
  }

  async fillCredentials(email: string, password: string): Promise<void> {
    await this.inputEmail.fill(email);
    await this.inputPassword.fill(password);
  }

  async clickSignIn(): Promise<void> {
    await this.buttonSignIn.click();
  }
}
