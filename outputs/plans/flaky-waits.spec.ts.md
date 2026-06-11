# Migration plan: flaky-waits.spec.ts

## Source framework

**bad-playwright** — subtractive migration, no framework translation required. Source is already Playwright TypeScript; the migration removes anti-patterns and wires the qa-master layered architecture (PageClass + fixture injection) without adding new framework imports beyond the `@fixtures/base.fixture` barrel in the spec.

**Source file:** `inputs/bad-playwright/flaky-waits.spec.ts`

> **Regeneration note (2026-06-10 — addressing CANDOR START-OVER verdict):**
> Changes vs the rejected plan: (1) `KB-1.4.12` corrected to `KB-1.1.14` — hardcoded-URL anti-pattern is the bad-Playwright namespace, not Selenium-Python; (2) `KB-1.2.5` citation removed for env-var credentials — Cypress custom-command sprawl is off-topic; credentials are now cataloged under `KB-1.1.9`; (3) `Extract POM: No` changed to `Yes` — `migration-rules.md` §1–§4 mandate a PageClass for every page in a qa-master migration; (4) greeting oracle defaults to the **full phrase regex** `/welcome back, jane/i` (not bare `'Jane'`) to preserve the original bug class — Q8 asks the reviewer to confirm; (5) per-assertion timeout override on the error-banner defaults to **no override** — use Playwright framework default, reviewer must authorise Q7 before Stage 2 applies `{ timeout: 10_000 }`; (6) metrics updated for PageClass architecture (selector quality 4/5 = 0.80, positive LOC delta); (7) hallucination-defense pins populated (were empty in the rejected envelope).

## Summary

Login flow for the Acme Shop storefront. Two scenarios: valid credentials navigate the user to the dashboard with a personalised greeting, and a wrong password keeps the user on the login page with a visible error banner. The source spec passes locally but is severely timing-sensitive — five `waitForTimeout` calls, three sync-probe assertions, one conditional-logic block — and leaks credentials as committed plaintext.

### What bug does this catch?

Catches a regression where the login form silently accepts bad credentials without surfacing the error banner, or where a valid login fails to navigate the user to the dashboard and render the personalised greeting.

### User-perceivable assertion checklist

- [ ] After valid login: dashboard greeting element is visible
- [ ] After valid login: greeting text matches `/welcome back, jane/i` (full greeting phrase + user identity — see Q8)
- [ ] After invalid login: error banner appears containing `/invalid credentials/i`
- [ ] After invalid login: URL remains matching `/\/login/` (does NOT redirect to dashboard)

## Anti-patterns detected

| Severity | Line | KB-ID | Anti-pattern | Snippet (≤60 chars) | Replacement |
|---|---|---|---|---|---|
| H | 8 | KB-1.1.1 | hard-wait | `page.waitForTimeout(2000)` | `waitForPageLoad()` web-first guard in PageClass `open()` |
| H | 13 | KB-1.1.1 | hard-wait | `page.waitForTimeout(500)` between fills | remove — `fill()` auto-waits for actionability |
| H | 15 | KB-1.1.1 | hard-wait | `page.waitForTimeout(500)` after fill | remove entirely |
| H | 18 | KB-1.1.1 | hard-wait | `page.waitForTimeout(3000)` post click | `await expect(loginPage.textDashboardGreeting).toBeVisible()` |
| H | 29 | KB-1.1.1 | hard-wait | `page.waitForTimeout(7000)` post bad-login | `await expect(loginPage.alertErrorBanner).toContainText(…)` — see Q7 re: timeout |
| H | 7 | KB-1.1.14 | hardcoded-url | `'https://shop.acme.test/login'` | configure `baseURL`; `loginPage.open()` calls `page.goto(this.url)` |
| H | 20 | KB-1.1.5 | sync-probe | `expect(await el.isVisible()).toBe(true)` | `await expect(loginPage.textDashboardGreeting).toBeVisible()` |
| H | 21 | KB-1.1.19 | innerText-sync-probe | `expect(await el.innerText()).toContain(…)` | `await expect(loginPage.textDashboardGreeting).toContainText(…)` |
| H | 33 | KB-1.1.19 | innerText-sync-probe | `expect(await errorBanner.innerText()).toContain(…)` | `await expect(loginPage.alertErrorBanner).toContainText(…)` |
| H | 32–35 | KB-1.1.12 | conditional-logic | `if (await el.isVisible()) {…} else { throw }` | direct `await expect(loginPage.alertErrorBanner).toContainText(…)` |
| M | 12 | KB-1.1.9 | magic-string (credential) | `'jane.doe@acme.test'` | `VALID_EMAIL = process.env.TEST_USER_EMAIL` |
| M | 14 | KB-1.1.9 | magic-string (credential) | `'Sup3rSecret!'` | `VALID_PASSWORD = process.env.TEST_USER_PASSWORD` |
| M | 21 | KB-1.1.9 | magic-string (display-name) | `'Welcome back, Jane'` | `VALID_USER_DISPLAY_NAME = 'Jane'` constant + full-phrase regex |
| M | 25 | KB-1.1.9 | magic-string (credential) | `'jane.doe@acme.test'` (test 2) | same `VALID_EMAIL` constant |
| M | 26 | KB-1.1.9 | magic-string (bad-password) | `'wrong-password'` | `INVALID_PASSWORD = 'wrong-password'` constant |
| M | 20–21 | KB-1.1.3 | css-class | `page.locator('.dashboard-greeting')` | retain CSS at LOW confidence (see pin 4); request `data-testid` |
| M | 31 | KB-1.1.3 | css-class | `page.locator('.error-banner')` | `getByRole('alert')` at MED confidence (see pin 5) |
| M | 17, 27 | KB-1.2.6 | ambiguous-text | `page.getByText('Sign in')` (×2) | `getByRole('button', { name: /sign in/i })` at MED confidence (see pin 3) |
| L | 4–5 | KB-1.1.15 | nested-describe | `describe('Acme Shop login') > describe('credentials')` | flatten to single `test.describe` — inner block has no siblings |

Total: **19 cataloged instances** across 9 KB-IDs.

## Locator translation table

All five locators become `readonly Locator` fields on `PageClassAcmeShopLogin`.

| Original | New (PageClass field → locator) | Confidence | Notes |
|---|---|---|---|
| `page.locator('#email')` | `inputEmail` → `this.page.getByLabel(/email/i)` | med | Assumes `<label for="email">` exists. Fallback: `getByRole('textbox', { name: /email/i })`. See pin 1. |
| `page.locator('#password')` | `inputPassword` → `this.page.getByLabel(/password/i)` | med | Same assumption as email. Fallback: `getByRole('textbox', { name: /password/i })`. See pin 2. |
| `page.getByText('Sign in')` | `buttonSignIn` → `this.page.getByRole('button', { name: /sign in/i })` | med | Probably `<button>` or `<input type=submit>`; could be a link or div. Fallback: `getByText('Sign in', { exact: true })`. See pin 3. |
| `page.locator('.dashboard-greeting')` | `textDashboardGreeting` → `this.page.locator('.dashboard-greeting')` | low | No DOM evidence for a semantic role. CSS class retained; request `data-testid="dashboard-greeting"`. See pin 4. |
| `page.locator('.error-banner')` | `alertErrorBanner` → `this.page.getByRole('alert')` | med | Error banners commonly carry `role="alert"`. Fallback: `page.locator('.error-banner')`. See pin 5. |

## Hallucination-defense pins

1. **Email input** — assumed `this.page.getByLabel(/email/i)`. If DOM has no `<label>` associated with `#email`: keep `this.page.locator('#email')`, add WHY-comment `'Q1 unresolved: label association for #email not confirmed'`. Reviewer fallback: inspect DOM for `<label for="email">` or confirm placeholder-only styling, then switch to `getByPlaceholder(/email/i)`.

2. **Password input** — assumed `this.page.getByLabel(/password/i)`. If DOM has no `<label>` associated with `#password`: keep `this.page.locator('#password')`, add WHY-comment `'Q2 unresolved: label association for #password not confirmed'`. Reviewer fallback: same investigation as pin 1.

3. **Sign-in button** — assumed `this.page.getByRole('button', { name: /sign in/i })`. If element is not a native `<button>` (e.g. it is an `<a>` or styled `<div>`): keep `this.page.getByText('Sign in', { exact: true })`, add WHY-comment `'Q3 unresolved: button role not confirmed — element may not be native <button>'`. Reviewer fallback: ask FE team to confirm semantic element type or add `role="button"`.

4. **Dashboard greeting** — assumed `this.page.locator('.dashboard-greeting')` (CSS class retained; LOW confidence for any role-based upgrade). If DOM evidence confirms element is a heading: upgrade to `this.page.getByRole('heading', { name: /welcome back/i })`. If a `data-testid` is added: upgrade to `this.page.getByTestId('dashboard-greeting')`. Add WHY-comment `'Q4 unresolved: greeting element role unknown — CSS class retained'`. Reviewer fallback: request `data-testid="dashboard-greeting"` from FE team.

5. **Error banner** — assumed `this.page.getByRole('alert')`. If DOM lacks `role="alert"` or `aria-live`: keep `this.page.locator('.error-banner')`, add WHY-comment `'Q5 unresolved: alert role not confirmed on .error-banner'`. Reviewer fallback: ask team to add `role="alert"` to the error banner component, or use `getByTestId('login-error')` if a testid exists.

## Structural changes

The qa-master architecture (`migration-rules.md` §1–§4, v0.2.0 default) mandates a PageClass for every page visited by the spec. This migration therefore produces a PageClass even though the source spec is short.

- **Extract POM: yes** — `PageClassAcmeShopLogin` at `outputs/helper/page-object/pages/acme-shop-login.page.ts`. Five `readonly` locator fields (type-prefixed): `inputEmail`, `inputPassword`, `buttonSignIn`, `textDashboardGreeting`, `alertErrorBanner`. Methods: `open()`, `fillCredentials(email: string, password: string)`, `clickSignIn()`, `waitForPageLoad()`. No own constructor (BasePage wires `page`).
- **Extract block: no** — single-section page, no cross-page or multi-instance reuse.
- **Extend fixture: yes** — mutate `outputs/helper/fixtures/base.fixture.ts` to add `acmeShopLoginPage: PageClassAcmeShopLogin` injection.
- **Split spec: no** — both scenarios target the same page and share a `beforeEach` navigate. One file.
- **Flatten describe: yes** — remove inner `test.describe('credentials')` whose only children are the two tests; outer `test.describe('Acme Shop login')` is sufficient.
- **Extract credential constants: yes** — `VALID_EMAIL`, `VALID_PASSWORD`, `INVALID_PASSWORD`, `VALID_USER_DISPLAY_NAME` at spec top-of-file (secrets sourced from `process.env`; named literal for display name and bad-password).
- **Test-data files:** add `URL_ACME_SHOP_LOGIN = '/login'` to `outputs/helper/test-data/urls.ts`; add `LABEL_ACME_SHOP_LOGIN = 'AcmeShopLogin'` to `outputs/helper/test-data/labels.ts`.

### Summary table

| Layer | File path | Why it exists |
|---|---|---|
| Page | `outputs/helper/page-object/pages/acme-shop-login.page.ts` | Owns all 5 login-page locators + `open()`, `fillCredentials()`, `clickSignIn()`, `waitForPageLoad()` — qa-master mandatory PageClass |
| Block | (none) | Single page section, no cross-page reuse |
| Fixture | `outputs/helper/fixtures/base.fixture.ts` (mutate) | Add `acmeShopLoginPage: PageClassAcmeShopLogin` injection |
| API | (none) | No data prep — both scenarios drive the UI login flow directly |
| Action | (none) | Single-page journey |
| Utility | (none) | No DOM string parsing required |
| Test-data | `outputs/helper/test-data/urls.ts` (mutate) | Add `URL_ACME_SHOP_LOGIN = '/login'` |
| Test-data | `outputs/helper/test-data/labels.ts` (mutate) | Add `LABEL_ACME_SHOP_LOGIN = 'AcmeShopLogin'` |
| Type | (none) | No new type shapes needed |
| Spec | `outputs/tests/flaky-waits.spec.ts` | The migrated spec |

## Open questions for reviewer

```
Q1: Does the #email input have an associated <label for="email">?
Context: page.locator('#email') lines 12, 25.
What I assumed: label exists → getByLabel(/email/i).
Impact if wrong: locator resolves to null; spec fails immediately with "no element found".
If placeholder-only: switch to getByPlaceholder(/email/i) or getByRole('textbox', { name: /email/i }).
```

```
Q2: Does the #password input have an associated <label>?
Context: page.locator('#password') lines 14, 26.
What I assumed: label exists → getByLabel(/password/i).
Impact if wrong: same as Q1.
```

```
Q3: Is the "Sign in" trigger a native <button> or <input type=submit>?
Could it be an <a> or a <div> with a click handler?
Context: page.getByText('Sign in').click() lines 17, 27.
What I assumed: native button → getByRole('button', { name: /sign in/i }).
Impact if wrong: getByRole('button') matches nothing; click never fires; test fails.
```

```
Q4: What is the DOM element type of .dashboard-greeting?
Is it a heading (<h1>–<h6>), a <p>, or an unsemantic <div>?
Context: page.locator('.dashboard-greeting') lines 20–21.
What I assumed: role unknown → CSS class retained at LOW confidence.
Impact if wrong: any role-based upgrade targets the wrong element and breaks the test.
```

```
Q5: Does .error-banner carry role="alert" or aria-live="assertive" in the DOM?
Context: page.locator('.error-banner') lines 31–33.
What I assumed: role="alert" is present → getByRole('alert').
Impact if wrong: getByRole('alert') resolves to empty locator; assertion vacuously passes
even when the error banner is absent — the test silently fails to catch regressions.
```

```
Q6: Are TEST_USER_EMAIL and TEST_USER_PASSWORD already provisioned as CI environment variables?
Context: credentials hardcoded at lines 12, 14, 25.
What I assumed: CI env vars exist per project convention.
Impact if wrong: CI run fails with "missing env var" — which IS the correct failure.
Committed plaintext is unacceptable and the migration makes this explicit.
```

```
Q7: Does the backend genuinely need >5 seconds to return the invalid-login error response?
Context: page.waitForTimeout(7000) at line 29.
What I assumed: the 7 s was a defensive over-wait, NOT real backend latency.
Stage 2 default: NO per-assertion timeout override — use Playwright's actionTimeout: 5_000.
Reviewer must explicitly authorise { timeout: 10_000 } on the alertErrorBanner assertion
if CI evidence shows the backend genuinely needs more than 5 s.
Impact if assumption wrong: the error-banner assertion will timeout consistently in CI,
surfacing a real backend latency issue that the hard-wait was masking.
```

```
Q8: Should the dashboard greeting assertion preserve the full "Welcome back, Jane" form?
Context: expect(await el.innerText()).toContain('Welcome back, Jane') at line 21.
Plan default: FULL PHRASE REGEX — toContainText(new RegExp(`Welcome back, ${VALID_USER_DISPLAY_NAME}`, 'i')).
This preserves both the greeting phrase ("Welcome back") AND the user identity ("Jane"),
matching the original assertion's bug class.
Asserting only VALID_USER_DISPLAY_NAME (bare 'Jane') is oracle dilution: any text node
containing "Jane" (e.g. "Jane Doe joined yesterday") would pass without a product signal.
Impact if reviewer overrides to bare name: test no longer catches a page that renders the
wrong greeting structure while incidentally containing "Jane" in unrelated content.
```

## Risk callouts

- **Backend latency on invalid login.** The 7-second `waitForTimeout` before the error-banner assertion (line 29) may compensate for a real server-side rate-limit cooldown. Replacing with the default-timeout web-first assertion will surface this as a consistent CI timeout — see Q7. Resolve before merge.
- **Dashboard greeting element role unknown.** Plan retains `.dashboard-greeting` CSS class at LOW confidence. If FE renames the class in a refactor, the test breaks silently with no product regression signal. Mitigation: request `data-testid="dashboard-greeting"`.
- **Parallel-run credential collision.** Both tests use the same `VALID_EMAIL` account. With `fullyParallel: true`, two workers may submit concurrent login requests. Acme Shop may have per-account session limits or rate-limiting that causes one to fail non-deterministically. See Q6.
- **No URL assertion after valid login.** The source test does not assert URL post-navigation. A page that coincidentally renders a matching greeting at a non-dashboard URL would pass. Recommend adding `await expect(page).toHaveURL(/\/dashboard/)` after the greeting assertion.
- **Oracle dilution risk.** If Q8 is overridden to use only the bare display name constant, any text node containing "Jane" satisfies the assertion. The plan defaults to the full phrase regex to prevent this.
- **Missing network mocking.** Both tests hit the real `shop.acme.test` backend. If the backend is unavailable, both fail together indistinguishably from a product regression.

## Expected metrics

- **Selector quality score (estimated post-migration):** 0.80 (4/5 locators canonical: `inputEmail` getByLabel, `inputPassword` getByLabel, `buttonSignIn` getByRole, `alertErrorBanner` getByRole; `textDashboardGreeting` CSS class retained pending pin 4 resolution).
- **Smell count delta:** −5 hard waits, −1 hardcoded URL, −3 sync probes (1 isVisible + 2 innerText), −1 conditional logic, −5 magic strings, −1 CSS class upgraded (error-banner), −1 ambiguous text match, −1 nested describe = **−18 smells removed, +0 introduced**; 1 CSS class smell retained (`.dashboard-greeting`) pending Q4.
- **LOC delta:** source ~39 LOC → target ~87 LOC across 5 files (spec ~28 + PageClass ~45 + fixture ext ~8 + urls.ts ~3 + labels.ts ~3) = **+48 LOC** — positive because qa-master PageClass adds meaningful structure.
- **Anti-pattern coverage:** 19/19 cataloged.
- **TypeScript strict mode:** pass — no `any`, no `as unknown as X` casts; `Locator` type-imported from `@playwright/test` in PageClass only; `page` typed as `Page` via `BasePage` parameter property.
