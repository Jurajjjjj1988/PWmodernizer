import { type BrowserContext, expect } from '@playwright/test';

import { CONSENT_COOKIES } from '@test-data/cookies';
import { URLS } from '@test-data/urls';

/**
 * Account data-prep over the signup API — the basis for **data isolation**: every test creates
 * its own brand-new, unique user. Signup also establishes a session (no UI login needed), which
 * is how we authenticate — confirmed via Playwright MCP against staging:
 *   GET  /profiles/users/sign_up  → scrape CSRF token
 *   POST /profiles/users          → creates the account AND sets the session cookie (302 → welcome)
 *
 * The `user_type=automated` cookie is required or staging returns 503 (bot gate) — so we set the
 * cookies on the context (shared with context.request) before calling the API.
 */
export type TestUser = { email: string, password: string };

export const ACCOUNT_PASSWORD = 'TestPass123!';
const PASSWORD = ACCOUNT_PASSWORD;

/** A unique disposable email for a brand-new account (keeps each test data-isolated). */
export function uniqueEmail(): string {
    return `qa-master-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@mailnull.com`;
}

function generateEmail(): string {
    return uniqueEmail();
}

/**
 * Create a fresh, unique account via the signup API and leave the browser `context` signed in
 * as that user. Returns the created credentials.
 */
export async function createAuthenticatedUser(context: BrowserContext): Promise<TestUser> {
    await context.addCookies(CONSENT_COOKIES);
    const request = context.request;

    const signupPage = await request.get(`${URLS.baseUrl}/profiles/users/sign_up`);
    const html = await signupPage.text();
    const match = /name="csrf-token"\s+content="([^"]+)"/.exec(html)
        ?? /content="([^"]+)"\s+name="csrf-token"/.exec(html);
    if (!match) {
        throw new Error('CSRF token not found on the sign_up page');
    }

    const email = generateEmail();
    const response = await request.post(`${URLS.baseUrl}/profiles/users`, {
        headers: { 'X-CSRF-Token': match[1] },
        form: {
            'user[email]': email,
            'user[password]': PASSWORD,
            'user[password_confirmation]': PASSWORD
        },
        maxRedirects: 0
    });
    // Successful signup redirects (302/303) to the welcome landing and sets the session cookie.
    expect([301, 302, 303].includes(response.status()),
        `Signup for ${email} should redirect on success (got ${response.status()})`).toBeTruthy();

    return { email, password: PASSWORD };
}
