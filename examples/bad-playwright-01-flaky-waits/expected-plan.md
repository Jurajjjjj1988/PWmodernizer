# Migration plan: input.spec.ts

## Source framework

**bad-playwright** — subtractive migration, no framework translation required. Source is already Playwright TypeScript; the migration removes anti-patterns without rewiring imports beyond fixture restructuring.

**Source file:** `examples/bad-playwright-01-flaky-waits/input.spec.ts`
**Target file(s):** `examples/bad-playwright-01-flaky-waits/expected-output.spec.ts`

## Summary

Login flow for the Acme Shop storefront. Two scenarios: a valid credential pair lands the user on the dashboard with a personalised greeting, and an invalid password keeps the user on the login page with a visible error banner. Existing spec passes locally but is timing-sensitive and over-uses `waitForTimeout`.

### What bug does this catch?

Catches a regression where the login form silently accepts bad credentials without surfacing the error banner, or where a valid login no longer navigates to the dashboard with the personalised greeting.

### User-perceivable assertion checklist

- [ ] After valid login: dashboard greeting element is visible
- [ ] After valid login: greeting contains `"Welcome back, Jane"`
- [ ] After invalid login: error banner appears containing `"Invalid credentials"`
- [ ] After invalid login: URL remains on `/login` (does NOT redirect)

## Anti-patterns detected

| Severity | Line | KB-ID | Anti-pattern | Snippet (≤60 chars) | Replacement |
|---|---|---|---|---|---|
| H | 8 | KB-1.1.1 | hard-wait | `page.waitForTimeout(2000)` | web-first assertion on first observable element |
| H | 12 | KB-1.1.1 | hard-wait | `page.waitForTimeout(500)` between fills | remove entirely — `fill()` auto-waits |
| H | 14 | KB-1.1.1 | hard-wait | `page.waitForTimeout(500)` after fill | remove entirely |
| H | 17 | KB-1.1.1 | hard-wait | `page.waitForTimeout(3000)` after click | `await expect(dashboardGreeting).toBeVisible()` |
| H | 25 | KB-1.1.1 | hard-wait | `page.waitForTimeout(7000)` post bad-login | `await expect(errorBanner).toContainText('Invalid credentials', { timeout: 10_000 })` (see Risk callouts re: 7s) |
| H | 20 | KB-1.1.5 | sync-probe | `expect(await el.isVisible()).toBe(true)` | `await expect(el).toBeVisible()` |
| H | 21 | KB-1.1.5 | sync-probe | `expect(await el.innerText()).toContain(...)` | `await expect(el).toContainText(...)` |
| H | 31 | KB-1.1.5 | sync-probe | `expect(await errorBanner.innerText()).toContain(...)` | `await expect(errorBanner).toContainText(...)` |
| H | 30 | KB-1.1.12 | conditional-logic | `if (await el.isVisible()) { ... } else { throw }` | direct `await expect(...).toContainText(...)` |
| H | 7 | KB-1.1.14 | hardcoded-url | `page.goto('https://shop.acme.test/login')` | configure `baseURL`; use `page.goto('/login')` |
| M | 20 | KB-1.1.3 | css-class | `page.locator('.dashboard-greeting')` | `page.getByRole('heading', { name: /welcome back/i })` (LOW conf — see pins) |
| M | 31 | KB-1.1.3 | css-class | `page.locator('.error-banner')` | `page.getByRole('alert')` (MED conf — see pins) |
| M | 17 | KB-1.2.6 | ambiguous-text | `page.getByText('Sign in')` | `page.getByRole('button', { name: /sign in/i })` |
| L | 4-5 | KB-1.1.15 | nested-describe | `describe('Acme Shop login') > describe('credentials')` | flatten to single describe |

## Locator translation table

| Original | New | Confidence | Notes |
|---|---|---|---|
| `page.locator('#email')` | `page.getByLabel(/email/i)` | med | Assumes input has an associated `<label>`. Fall back to `getByRole('textbox', { name: 'Email' })`. |
| `page.locator('#password')` | `page.getByLabel(/password/i)` | med | Same assumption as Email. |
| `page.getByText('Sign in')` | `page.getByRole('button', { name: /sign in/i })` | high | Submit button — role-based avoids matching page heading. |
| `page.locator('.dashboard-greeting')` | `page.getByRole('heading', { name: /welcome back/i })` | low | Greeting MAY be a heading; if it's a div with no role, keep CSS class and add WHY-comment. |
| `page.locator('.error-banner')` | `page.getByRole('alert')` | med | Login error banners typically use `role="alert"`. Fall back to `getByTestId('login-error')` if not. |

## Hallucination-defense pins

1. **Dashboard greeting** — assumed `getByRole('heading', { name: /welcome back/i })`. If DOM lacks heading role: keep `page.locator('.dashboard-greeting')`, add WHY-comment `'Q3 unresolved: greeting element type unknown'`. Reviewer fallback: ask FE team for heading semantics OR add `data-testid="dashboard-greeting"`.
2. **Error banner** — assumed `getByRole('alert')`. If DOM lacks `role="alert"`: keep `.error-banner` CSS, add WHY-comment `'Q4: alert role not confirmed'`. Reviewer fallback: ask team to add `role="alert"` or use `data-testid="login-error"`.
3. **7-second wait semantics** — assumed defensive over-wait (not real backend delay). If invalid-login response genuinely needs >5 s: Stage 2 must raise the per-assertion timeout to 10 s (already shown above) instead of removing the wait silently.

## Structural changes

- **Extract POM:** no — single short spec, two scenarios, fixture overhead would outweigh the savings. Reconsider if a third scenario lands.
- **Extract fixture:** no — `beforeEach` only does a single `goto`; no shared state worth extracting.
- **Split into multiple specs:** no — both scenarios target the same page and share setup. Keep as one file.
- **Flatten describe nesting:** yes — collapse inner `describe('credentials')` into outer.
- **Extract credential constants:** yes — `VALID_EMAIL`, `VALID_PASSWORD`, `INVALID_PASSWORD`, `VALID_USER_DISPLAY_NAME` at top-of-file constants.

## Open questions for reviewer

- Q1: Does the `#email` input have an associated `<label for="email">`? If placeholder-only, switch `getByLabel` → `getByPlaceholder`.
- Q2: Is the dashboard greeting actually a heading (`<h1>`/`<h2>`/`<h3>`), or just styled text? Determines whether to upgrade locator OR keep CSS class.
- Q3: Does `.error-banner` have `role="alert"` or `aria-live`?
- Q4: Is `"Welcome back, Jane"` stable across product updates, or could a profile rename break the assertion? Suggest making `Jane` a regex (`/welcome back/i`) and extracting display name to a constant.
- Q5: Why does the invalid-login path use `waitForTimeout(7000)`? Is there a real server-side rate-limit/cooldown that means the error response arrives after Playwright's default `actionTimeout: 5_000`?
- Q6: Are `TEST_USER_EMAIL` and `TEST_USER_PASSWORD` already provisioned as CI env vars?

## Risk callouts

- **Hard-wait masking backend latency.** The 7-second `waitForTimeout` before the invalid-login assertion (line 25) may be compensating for a real ~7s server delay (rate-limit cooldown). If so, replacing it with a default-timeout web-first assertion will cause consistent CI timeouts. See Q5 — resolve before merging.
- **Dashboard greeting may not be a heading.** Plan upgrades `.dashboard-greeting` to `getByRole('heading')` at LOW confidence. If wrong, the test breaks with a misleading "no heading found" instead of "no greeting".
- **Assertion too narrow — display name dependency.** `'Welcome back, Jane'` couples the test to one account's name. Any profile rename breaks the test with no product regression signal. Suggest regex.
- **Missing URL assertion after login.** Neither test asserts URL post-navigation. A page that coincidentally renders the same greeting text would pass. Add `await expect(page).toHaveURL(/\/dashboard/)`.
- **Credential exposure.** `jane.doe@acme.test` and `Sup3rSecret!` are committed as plaintext. Migration to `process.env` references is NOT optional.

## Expected metrics

- **Selector quality score (estimated):** 0.78 (7/9 role/label-based; 2 remain CSS-class pending pin resolution).
- **Smell count delta:** -5 hard-waits, -3 sync probes, -1 conditional logic block, -1 nested describe, -1 hardcoded URL, -3 hardcoded credential literals = **-14 smells removed, +0 introduced**.
- **LOC delta:** 38 → ~26-30 LOC (-10 to -12 lines).
- **Anti-pattern coverage:** 14/14 cataloged.
