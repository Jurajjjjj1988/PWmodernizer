import { expect, type Locator } from '@playwright/test';

import { BasePage } from '@page-object/basepage';
import { OrderHistoryPage } from '@page-object/pages/order-history.page';
import { URLS } from '@test-data/urls';
import logger from '@logger';

const LABEL = 'Accounts';

/**
 * Account sign-in + portal page. Selectors and flow confirmed live via Playwright MCP:
 * - sign-in is at /profiles/users/sign_in (#user_email → #email_submit)
 * - "Continue With Email" routes to the email-code (OTP) step — there is no password path
 * - the portal greeting is #accounts-greeting on /account/overview
 * - Sign Out lives in the <ci-accounts> shadow DOM (Playwright pierces it) and logs out to
 *   /profiles/users/sign_in
 */
export class AccountsPage extends BasePage {
    readonly url = URLS.paths.accountSignIn;

    // Sign-in form
    readonly inputEmail: Locator = this.page.locator('#user_email').describe(`[${LABEL}] Email input`);
    readonly buttonContinueWithEmail: Locator =
        this.page.locator('#email_submit').describe(`[${LABEL}] Continue With Email button`);
    readonly headingEmailCode: Locator =
        this.page.getByRole('heading', { name: 'Check Your Email for a Code' })
            .describe(`[${LABEL}] Email-code step heading`);

    // Sign-up form (/profiles/users/sign_up)
    readonly headingCreateAccount: Locator =
        this.page.getByRole('heading', { name: 'Create An Account' }).describe(`[${LABEL}] Create An Account heading`);
    readonly inputPassword: Locator = this.page.locator('#user_password').describe(`[${LABEL}] Password input`);
    readonly inputPasswordConfirmation: Locator =
        this.page.locator('#user_password_confirmation').describe(`[${LABEL}] Password confirmation input`);
    readonly checkboxPrivacyConsent: Locator =
        this.page.locator('input[name="eu_consent"]').describe(`[${LABEL}] Privacy Policy consent checkbox`);
    readonly buttonSignUpContinue: Locator =
        this.page.locator('#signup_submit').describe(`[${LABEL}] Sign-up Continue button`);
    readonly textPasswordMismatch: Locator =
        this.page.locator('#user_password_confirmation-helper-text').describe(`[${LABEL}] Password mismatch error`);

    // Authenticated portal
    readonly accountGreeting: Locator =
        this.page.locator('#accounts-greeting').describe(`[${LABEL}] Portal greeting`);
    readonly linkMyAccount: Locator =
        this.page.getByTestId('my-account').filter({ visible: true }).describe(`[${LABEL}] Header My Account link`);
    readonly linkOrderHistory: Locator =
        this.page.locator('a[data-action="order history"]').describe(`[${LABEL}] Order History nav link`);

    // Account menu (in the <ci-accounts> web component; Playwright pierces shadow DOM)
    readonly buttonAccountMenu: Locator =
        this.page.getByRole('button', { name: 'Open My Account menu' }).filter({ visible: true })
            .describe(`[${LABEL}] Open My Account menu`);
    readonly buttonSignOut: Locator =
        this.page.getByTestId('my-account-logout').filter({ visible: true }).describe(`[${LABEL}] Sign Out button`);

    /** Open the sign-in page (email step). */
    async open(): Promise<void> {
        logger.info(`[${LABEL}] Opening sign-in page`);
        await this.page.goto(this.url, { timeout: 45_000 });
        await expect(this.inputEmail, `[${LABEL}] Email field should be visible on the sign-in page`)
            .toBeVisible({ timeout: 30_000 });
    }

    async waitForPageLoad(): Promise<void> {
        await expect(this.inputEmail, `[${LABEL}] Email field should be visible on the sign-in page`)
            .toBeVisible({ timeout: 30_000 });
    }

    /** Open the authenticated account portal (relies on a signed-in context). */
    async openPortal(): Promise<void> {
        logger.info(`[${LABEL}] Opening account portal`);
        await this.page.goto(URLS.paths.accountPortal, { timeout: 45_000 });
        await expect(this.accountGreeting, `[${LABEL}] Portal greeting should be visible when signed in`)
            .toBeVisible({ timeout: 30_000 });
    }

    /** Open the create-account page. */
    async openSignUp(): Promise<void> {
        logger.info(`[${LABEL}] Opening sign-up page`);
        await this.page.goto(URLS.paths.accountSignUp, { timeout: 45_000 });
        await expect(this.headingCreateAccount, `[${LABEL}] Create An Account heading should be visible`)
            .toBeVisible({ timeout: 30_000 });
    }

    /** Fill the sign-up form (no submit) — callers assert success or a blocked state. */
    async fillSignUp({ email, password, confirmation }: { email: string, password: string, confirmation: string }): Promise<void> {
        await this.inputEmail.fill(email);
        await this.inputPassword.fill(password);
        await this.inputPasswordConfirmation.fill(confirmation);
    }

    /** Fill the form, accept the Privacy Policy, and submit (no outcome assertion). */
    async submitSignUp({ email, password, confirmation }: { email: string, password: string, confirmation: string }): Promise<void> {
        await this.fillSignUp({ email, password, confirmation });
        await this.checkboxPrivacyConsent.check();
        await expect(this.buttonSignUpContinue, `[${LABEL}] Continue should be enabled after consent`).toBeEnabled();
        await this.buttonSignUpContinue.click();
    }

    /** Create an account with matching passwords; asserts the authenticated portal greeting. */
    async signUp({ email, password }: { email: string, password: string }): Promise<void> {
        logger.info(`[${LABEL}] Signing up ${email}`);
        await this.submitSignUp({ email, password, confirmation: password });
        await expect(this.accountGreeting, `[${LABEL}] Portal greeting should appear after sign-up`)
            .toContainText('Welcome back,');
    }

    /** Assert the password-mismatch error after a sign-up attempt. */
    async expectPasswordMismatch(): Promise<void> {
        await expect(this.textPasswordMismatch, `[${LABEL}] Password mismatch error should be shown`)
            .toContainText('This needs to match your new password');
    }

    /** Open an authenticated in-account section by path; asserts the header shows we're signed in. */
    async openSection(path: string): Promise<void> {
        logger.info(`[${LABEL}] Opening account section ${path}`);
        await this.page.goto(path, { timeout: 45_000 });
        await expect(this.linkMyAccount, `[${LABEL}] My Account header link should be visible (signed in)`)
            .toHaveText('My Account', { timeout: 30_000 });
    }

    /** Enter an email and continue — the flow routes to the email-code (OTP) step. */
    async continueWithEmail(email: string): Promise<void> {
        logger.info(`[${LABEL}] Continuing with email ${email}`);
        await this.inputEmail.fill(email);
        await expect(this.buttonContinueWithEmail, `[${LABEL}] Continue button label`)
            .toHaveText('Continue With Email');
        await this.buttonContinueWithEmail.click();
    }

    /** Sign out from the authenticated portal; lands back on the sign-in page. */
    async signOut(): Promise<void> {
        logger.info(`[${LABEL}] Signing out`);
        // The header is a web component that hydrates asynchronously (flaky under load). Poll:
        // open the account dropdown (force past the overlaying <ci-cart>) until Sign Out is ready.
        await expect(async () => {
            await this.buttonAccountMenu.click({ force: true });
            await expect(this.buttonSignOut).toBeVisible({ timeout: 5_000 });
        }).toPass({ timeout: 30_000 });
        await this.buttonSignOut.click();
        await expect(this.page, `[${LABEL}] Sign-out should return to the login page`)
            .toHaveURL(/\/profiles\/users\/sign_in/);
        await expect(this.inputEmail, `[${LABEL}] Sign-in form should render after sign-out`)
            .toBeVisible({ timeout: 30_000 });
    }

    /** Navigate to Order History from the portal; returns the OrderHistoryPage. */
    async openOrderHistory(): Promise<OrderHistoryPage> {
        await expect(this.linkOrderHistory, `[${LABEL}] Order History link label`).toHaveText('Order History');
        await this.linkOrderHistory.click();

        const orderHistoryPage = new OrderHistoryPage(this.page);
        await orderHistoryPage.waitForPageLoad();
        return orderHistoryPage;
    }
}
