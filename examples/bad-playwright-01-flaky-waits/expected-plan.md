# Migration plan: input.spec.ts

## Source framework
bad-playwright

## Summary
Login flow for the Acme Shop storefront. Two scenarios: a valid credential pair
lands the user on the dashboard with a personalised greeting, and an invalid
password keeps the user on the login page with a visible error banner. Existing
spec passes locally but is timing-sensitive and over-uses `waitForTimeout`.

## Anti-patterns detected
- [x] hard-wait (lines 8, 12, 14, 17, 25) — `page.waitForTimeout` between
      every action; replace with web-first `expect(...).toBeVisible()` /
      `toHaveText()` which auto-retry.
- [x] non-web-first assertion (lines 20, 21, 31) —
      `expect(await el.isVisible()).toBe(true)` and
      `expect(await el.innerText()).toContain(...)` lose auto-retry; convert
      to `expect(locator).toBeVisible()` / `toHaveText()`.
- [x] nested `describe` (lines 4-5) — two levels of `describe` for the same
      feature; flatten to a single `describe('Acme Shop login')`.
- [x] CSS-id locators (`#email`, `#password`, `.dashboard-greeting`,
      `.error-banner`) — replace with `getByLabel`, `getByRole('alert')`,
      `getByRole('heading')`. More resilient to styling changes.
- [x] `getByText('Sign in')` for an interactive button — should be
      `getByRole('button', { name: 'Sign in' })`. `getByText` can match
      decorative copy and is ambiguous when the same string appears in a
      heading and a button.
- [x] conditional `if (await el.isVisible())` inside a test (lines 30-34)
      — branching hides flakiness; assert directly with a web-first matcher.
- [x] magic-number timeout `waitForTimeout(7000)` (line 27) — 7-second
      hardcoded wait with no justification.

## Locator translation table
| Original | New | Confidence | Notes |
|---|---|---|---|
| `page.locator('#email')` | `page.getByLabel('Email')` | medium | Assumes the input has an associated `<label>`. If not, fall back to `getByRole('textbox', { name: 'Email' })` or `getByPlaceholder`. |
| `page.locator('#password')` | `page.getByLabel('Password')` | medium | Same assumption as Email. |
| `page.getByText('Sign in')` | `page.getByRole('button', { name: 'Sign in' })` | high | Submit button — role-based locator is more semantic and avoids matching the page heading. |
| `page.locator('.dashboard-greeting')` | `page.getByRole('heading', { name: /welcome back, jane/i })` | medium | Assumes the greeting is rendered as a heading. If it is a paragraph, use `page.getByText(/welcome back, jane/i)`. |
| `page.locator('.error-banner')` | `page.getByRole('alert')` | medium | Login error banners typically use `role="alert"`. If not, fall back to `getByTestId('login-error')`. |

## Structural changes
- Extract POM: no — single short spec, two scenarios, fixture overhead would
  outweigh the savings. Reconsider if a third scenario lands.
- Extract fixture: no — `beforeEach` only does a single `goto`; no shared
  state worth extracting.
- Split into multiple specs: no — both scenarios target the same page and
  share setup. Keep as one file.

## Open questions for reviewer
- Does the `#email` input have an associated `<label for="email">`? If the
  team uses placeholder-only inputs, switch `getByLabel` → `getByPlaceholder`.
- Is the dashboard greeting actually an `<h1>` / `<h2>`, or just styled
  copy? The plan assumes heading; verify against the live DOM and adjust.
- Does the error banner use `role="alert"` or just a styled `<div>`? If it
  is not an alert, a `data-testid` would be safer than a class.
- After a failed login, does the URL remain `/login` or does the app
  redirect? The new spec asserts `toHaveURL(/\/login/)` — drop it if the
  app behaves differently.

## Risk callouts
- The original 7-second hardcoded wait after a bad-password submit may be
  masking a real server-side throttle. If the API genuinely takes ~7s, the
  web-first assertion will still wait for it (default 5s timeout), so we may
  need to bump `expect.configure({ timeout: 10_000 })` for this assertion.
- `getByRole('alert')` will match the FIRST alert on the page. If a banner
  (e.g. cookie notice) is also an alert, narrow the locator with `.filter()`
  or a more specific test id.

## Expected metrics
- Selector quality score: 4/5 role/label-based (was 0/5).
- Smell count delta: -5 hard-waits, -3 non-web-first assertions, -1 nested
  describe, -1 conditional in test body.
- LOC delta: 37 → 26 (-11 lines).
