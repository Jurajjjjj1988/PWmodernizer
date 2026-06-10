# Migrator Knowledge Base

> Reference document consumed by the LLM during Stage 1 (plan generation) and Stage 2 (code generation) of the test-migration pipeline. Target output: clean, idiomatic Playwright TypeScript (strict mode, web-first assertions, role-based locators) from one of four sources — bad-Playwright, Cypress, Selenium WebDriver (Java), Selenium WebDriver (Python).

---

## Table of contents

1. [Anti-pattern catalog (per source framework)](#1-anti-pattern-catalog-per-source-framework)
   - [1.1 Bad-Playwright anti-patterns](#11-bad-playwright-anti-patterns)
   - [1.2 Cypress anti-patterns](#12-cypress-anti-patterns)
   - [1.3 Selenium WebDriver (Java) anti-patterns](#13-selenium-webdriver-java-anti-patterns)
   - [1.4 Selenium WebDriver (Python) anti-patterns](#14-selenium-webdriver-python-anti-patterns)
2. [Framework → Playwright TypeScript translation tables](#2-framework--playwright-typescript-translation-tables)
   - [2.1 Cypress → Playwright](#21-cypress--playwright)
   - [2.2 Selenium Java → Playwright TypeScript](#22-selenium-java--playwright-typescript)
   - [2.3 Selenium Python → Playwright TypeScript](#23-selenium-python--playwright-typescript)
   - [2.4 Bad Playwright → Clean Playwright](#24-bad-playwright--clean-playwright)
3. [Locator priority cheatsheet (2026 consensus)](#3-locator-priority-cheatsheet-2026-consensus)
4. [2026 Playwright pattern conventions](#4-2026-playwright-pattern-conventions)
5. [Common semantic translation gotchas](#5-common-semantic-translation-gotchas)
6. [Hallucination defense — locator grounding rules](#6-hallucination-defense--locator-grounding-rules)
7. [Migration smell scan checklist](#7-migration-smell-scan-checklist)

---

## 1. Anti-pattern catalog (per source framework)

### 1.1 Bad-Playwright anti-patterns

These are patterns frequently seen in early-2024 Playwright suites that survived linter drift, juniors copying StackOverflow, or AI-generated tests that did not internalize the web-first assertions model.

#### 1.1.1 Hard waits via `waitForTimeout`

```ts
// ANTI-PATTERN
await page.click('#submit');
await page.waitForTimeout(3000);
expect(await page.locator('.success').isVisible()).toBe(true);
```

```ts
// CANONICAL
await page.getByRole('button', { name: 'Submit' }).click();
await expect(page.getByText('Success')).toBeVisible();
```

Rationale: hard waits cause flakes on slow CI and waste time on fast CI. Web-first `toBeVisible()` polls until the configured timeout. Prevents `RaceConditionFailure` + `SlowCIFlake` bug class. See [`eslint-plugin-playwright/no-wait-for-timeout`](https://github.com/playwright-community/eslint-plugin-playwright/blob/main/docs/rules/no-wait-for-timeout.md).

#### 1.1.2 `nth()` selector instead of accessible name

```ts
// ANTI-PATTERN
await page.locator('button').nth(2).click();
```

```ts
// CANONICAL
await page.getByRole('button', { name: 'Save changes' }).click();
```

Rationale: index-based selectors break the moment DOM order changes (new feature flag, A/B variant, reordered list). Prevents `DOMOrderCoupling` bug class. See [`eslint-plugin-playwright/no-nth-methods`](https://github.com/playwright-community/eslint-plugin-playwright/blob/main/docs/rules/no-nth-methods.md).

#### 1.1.3 CSS-class as primary selector

```ts
// ANTI-PATTERN
await page.locator('.btn-primary.MuiButton-root').click();
```

```ts
// CANONICAL
await page.getByRole('button', { name: 'Continue' }).click();
```

Rationale: CSS framework classes change between major versions (MUI v4 → v5 renamed half the classes). Prevents `StylingRefactorBreakage`.

#### 1.1.4 `force: true` to bypass actionability

```ts
// ANTI-PATTERN
await page.locator('#agree').click({ force: true });
```

```ts
// CANONICAL — diagnose WHY actionability failed first
await expect(page.getByLabel('I agree to terms')).toBeEnabled();
await page.getByLabel('I agree to terms').check();
```

Rationale: `force: true` skips checks for visible, stable, receives-pointer-events, enabled. Hides real bugs where a modal overlay is blocking the click. Prevents `MaskedRealBug`. See [`eslint-plugin-playwright/no-force-option`](https://github.com/playwright-community/eslint-plugin-playwright/blob/main/docs/rules/no-force-option.md).

#### 1.1.5 `expect(await locator.isVisible())` instead of web-first

```ts
// ANTI-PATTERN
expect(await page.locator('.banner').isVisible()).toBeTruthy();
```

```ts
// CANONICAL
await expect(page.getByRole('alert')).toBeVisible();
```

Rationale: `isVisible()` returns a one-shot boolean — no auto-retry. `toBeVisible()` polls until the assertion timeout, eliminating timing-sensitive flakes. See [`eslint-plugin-playwright/prefer-web-first-assertions`](https://github.com/playwright-community/eslint-plugin-playwright/blob/main/docs/rules/prefer-web-first-assertions.md).

#### 1.1.6 Missing `await` on Playwright action

```ts
// ANTI-PATTERN
test('fills form', async ({ page }) => {
  page.getByLabel('Email').fill('a@b.c'); // no await — promise discarded
  await page.getByRole('button', { name: 'Sign in' }).click();
});
```

```ts
// CANONICAL
test('fills form', async ({ page }) => {
  await page.getByLabel('Email').fill('a@b.c');
  await page.getByRole('button', { name: 'Sign in' }).click();
});
```

Rationale: unawaited promises produce race conditions and `UnhandledPromiseRejection` exits. See [`eslint-plugin-playwright/missing-playwright-await`](https://github.com/playwright-community/eslint-plugin-playwright/blob/main/docs/rules/missing-playwright-await.md).

#### 1.1.7 `page.pause()` left in committed code

```ts
// ANTI-PATTERN
await page.goto('/login');
await page.pause();
await page.getByLabel('Email').fill('x@y.z');
```

```ts
// CANONICAL — remove entirely
await page.goto('/login');
await page.getByLabel('Email').fill('x@y.z');
```

Rationale: `page.pause()` blocks CI indefinitely waiting for inspector input. See [`eslint-plugin-playwright/no-page-pause`](https://github.com/playwright-community/eslint-plugin-playwright/blob/main/docs/rules/no-page-pause.md).

#### 1.1.8 `test.only` / `test.describe.only` leftover

```ts
// ANTI-PATTERN
test.only('important', async ({ page }) => { /* ... */ });
```

```ts
// CANONICAL
test('important', async ({ page }) => { /* ... */ });
```

Rationale: `.only` silently skips the entire rest of the suite on CI. Prevents `SilentCoverageDrop`. See [`eslint-plugin-playwright/no-focused-test`](https://github.com/playwright-community/eslint-plugin-playwright/blob/main/docs/rules/no-focused-test.md).

#### 1.1.9 Magic numbers AND magic strings (viewport, timeouts, indices, credentials, display names, exact-text assertions)

```ts
// ANTI-PATTERN — numbers AND strings
await page.setViewportSize({ width: 1366, height: 768 });
await page.locator('li').nth(7).click();
test.setTimeout(45000);
await page.getByLabel('Email').fill('jane.doe@acme.test');
await page.getByLabel('Password').fill('Sup3rSecret!');
await expect(greeting).toContainText('Welcome back, Jane');
```

```ts
// CANONICAL — numbers AND strings both promoted to named constants
const DESKTOP_VIEWPORT = { width: 1366, height: 768 } as const;
const PRICING_PLAN_PRO_INDEX = 7;
const VALID_EMAIL = process.env.TEST_USER_EMAIL ?? throwMissing('TEST_USER_EMAIL');
const VALID_PASSWORD = process.env.TEST_USER_PASSWORD ?? throwMissing('TEST_USER_PASSWORD');
const VALID_USER_DISPLAY_NAME = 'Jane';

await page.setViewportSize(DESKTOP_VIEWPORT);
await page.getByRole('listitem', { name: 'Pro plan' }).click();
test.setTimeout(45_000);
await page.getByLabel('Email').fill(VALID_EMAIL);
await page.getByLabel('Password').fill(VALID_PASSWORD);
await expect(greeting).toContainText(new RegExp(`Welcome back, ${VALID_USER_DISPLAY_NAME}`));
```

Rationale: magic numbers AND magic strings both signal "I don't know what this means". Named constants document intent and make refactors safe. **Strings deserve EXTRA caution**: hardcoded credentials are a security smell (committed plaintext); hardcoded display names couple the test to one account's state (a profile rename breaks the test with no product regression signal); hardcoded exact-text assertions break on copy edits. Promote to env vars (for secrets) or named constants (for display strings); prefer regex for greeting/heading assertions that may have copy variations.

#### 1.1.10 Assertion roulette (multiple unrelated expects)

```ts
// ANTI-PATTERN
test('dashboard works', async ({ page }) => {
  await expect(page.getByRole('heading')).toContainText('Welcome');
  await expect(page.getByText('Pending orders')).toBeVisible();
  await expect(page.locator('.balance')).toContainText('$1,000');
  await expect(page.getByRole('button', { name: 'Logout' })).toBeEnabled();
});
```

```ts
// CANONICAL — one behavior, one test
test('shows personalized welcome heading', async ({ dashboardPage }) => {
  await expect(dashboardPage.heading).toContainText('Welcome');
});

test('lists pending orders widget', async ({ dashboardPage }) => {
  await expect(dashboardPage.pendingOrders).toBeVisible();
});
```

Rationale: when one assertion fails inside a 4-expect test, you don't know which behavior is broken without rerunning. Prevents `MaskedFailureLocation`. (xUnit Test Patterns — Meszaros.)

#### 1.1.11 Test order coupling

```ts
// ANTI-PATTERN
test('1 - create user', async ({ page }) => {
  await createUser(page, 'shared@a.com');
});
test('2 - login as that user', async ({ page }) => {
  await login(page, 'shared@a.com'); // relies on test #1 having run
});
```

```ts
// CANONICAL — each test is hermetic
test('login flow', async ({ page, freshUser }) => {
  await login(page, freshUser.email);
});
```

Rationale: parallel sharding (`--shard=3/8`) runs tests out of order. Prevents `ParallelizationBreaks`.

#### 1.1.12 Conditional logic inside test bodies

```ts
// ANTI-PATTERN
test('checkout', async ({ page }) => {
  if (await page.getByText('Cookie banner').isVisible()) {
    await page.getByRole('button', { name: 'Accept' }).click();
  }
  // ... real test
});
```

```ts
// CANONICAL — handle in fixture, not test
const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript(() => localStorage.setItem('cookies_ok', '1'));
    await use(page);
  },
});
```

Rationale: `if` inside a test means the test "passes" while skipping the behavior under test. Prevents `SilentNoOp`. See [`eslint-plugin-playwright/no-conditional-in-test`](https://github.com/playwright-community/eslint-plugin-playwright/blob/main/docs/rules/no-conditional-in-test.md).

#### 1.1.13 `try/catch` swallowing failures

```ts
// ANTI-PATTERN
test('upload', async ({ page }) => {
  try {
    await page.getByLabel('File').setInputFiles('./a.csv');
  } catch (e) {
    console.log('upload failed', e);
  }
});
```

```ts
// CANONICAL — let it throw
await page.getByLabel('File').setInputFiles(testDataPath('a.csv'));
await expect(page.getByText('Upload complete')).toBeVisible();
```

Rationale: swallowed exceptions = green tests that miss bugs. See [`eslint-plugin-playwright/no-conditional-expect`](https://github.com/playwright-community/eslint-plugin-playwright/blob/main/docs/rules/no-conditional-expect.md).

#### 1.1.14 Hardcoded environment URL

```ts
// ANTI-PATTERN
test('checkout', async ({ page }) => {
  await page.goto('https://shop.acme.test/login');
  // ...
});
```

```ts
// CANONICAL — baseURL in playwright.config.ts + relative goto
// playwright.config.ts:
//   use: { baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000' }
test('checkout', async ({ page }) => {
  await page.goto('/login');
  // ...
});
```

Rationale: hardcoded URLs lock the test to one environment; CI/staging/prod toggling requires editing source. Couples test code to deployment topology. See `playwright.config.ts` reference at [playwright.dev/docs/test-configuration#basic-configuration](https://playwright.dev/docs/test-configuration#basic-configuration).

#### 1.1.15 Unnecessary `test.describe` nesting

```ts
// ANTI-PATTERN — single-feature suite with redundant inner describe
test.describe('Acme Shop login', () => {
  test.describe('credentials', () => {
    test('valid email and password lands user on dashboard', async ({ page }) => { /* ... */ });
    test('wrong password surfaces error banner', async ({ page }) => { /* ... */ });
  });
});
```

```ts
// CANONICAL — flatten when inner describe has no sibling
test.describe('Acme Shop login', () => {
  test('valid email and password lands user on dashboard', async ({ page }) => { /* ... */ });
  test('wrong password surfaces error banner', async ({ page }) => { /* ... */ });
});
```

Rationale: nested `describe` blocks justify themselves only when they have siblings (e.g., `describe('sso')` alongside `describe('credentials')`). A single-child describe doubles the indentation budget and adds noise to test runner output without grouping value. Max 2 levels — see `config/migration-rules.md` §2.

#### 1.1.16 `waitForLoadState('networkidle')` as universal wait

```ts
// ANTI-PATTERN
await page.goto('/dashboard');
await page.waitForLoadState('networkidle');
await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
```

```ts
// CANONICAL — wait on the actual user-visible state
await page.goto('/dashboard');
await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
```

Rationale: `networkidle` waits for ZERO in-flight requests for 500ms — that includes ad pixels, analytics beacons, polling sockets, and Intercom-style chat widgets that NEVER go idle in production. The test then hangs or flakes on unrelated third-party network noise that has zero bearing on whether the user can see the dashboard. Playwright's own docs (since v1.30) explicitly discourage `networkidle` outside of unusual cases. Auto-waiting locators + web-first assertions already wait for the right thing. Prevents `NetworkNoiseFlake` bug class. See [playwright.dev/docs/api/class-page#page-wait-for-load-state](https://playwright.dev/docs/api/class-page#page-wait-for-load-state).

#### 1.1.17 Raw XPath via `xpath=` selector engine

```ts
// ANTI-PATTERN — survived a Selenium-to-Playwright translator
await page.locator('xpath=//div[@class="header"]/button[2]').click();
await page.locator('xpath=//*[contains(text(),"Continue")]').click();
```

```ts
// CANONICAL — role-based, accessible-name, getByText
await page.getByRole('banner').getByRole('button', { name: 'Save' }).click();
await page.getByRole('button', { name: 'Continue' }).click();
```

Rationale: raw XPath is a tell that this file came out of a Selenium translator without semantic rework. Playwright supports XPath for completeness but it loses every advantage of role-based locators — no a11y-tree grounding, brittle to DOM refactors, opaque at the call site. Positional XPath (`button[2]`) recreates the `nth()` anti-pattern (1.1.2) in a different syntax. Prevents `SeleniumTranslationLeak` bug class. See [playwright.dev/docs/locators#locate-by-css-or-xpath](https://playwright.dev/docs/locators#locate-by-css-or-xpath).

#### 1.1.18 `.all()` then manual `for` loop with count assertions

```ts
// ANTI-PATTERN
const items = await page.locator('[data-testid="row"]').all();
expect(items.length).toBe(5);
for (const item of items) {
  expect(await item.textContent()).toContain('OK');
}
```

```ts
// CANONICAL — web-first count + iteration on a live locator
const rows = page.getByTestId('row');
await expect(rows).toHaveCount(5);
await expect(rows).toContainText(['OK', 'OK', 'OK', 'OK', 'OK']);
```

Rationale: `.all()` snapshots the locator into a fixed array — auto-retry semantics die immediately. If the list is still rendering when `.all()` resolves, the count assertion fails for a UI bug that doesn't exist. `toHaveCount` and `toContainText(array)` poll until the expected count is reached. Same family as the Selenium `find-elements-snapshot` smell. Prevents `SnapshotIterationRace` bug class.

#### 1.1.19 `innerText()` / `textContent()` string compare instead of `toHaveText`

```ts
// ANTI-PATTERN
const heading = await page.getByRole('heading').innerText();
expect(heading).toBe('Welcome back');
```

```ts
// CANONICAL — web-first, polls until match
await expect(page.getByRole('heading')).toHaveText('Welcome back');
```

Rationale: `innerText()` is a one-shot snapshot — same flake mode as `isVisible()` (1.1.5) but for text content. If the heading renders one tick after the snapshot, the assertion fails on a non-existent bug. `toHaveText` polls and also normalizes whitespace by default (a common source of `have.text` flakes — see Cypress 1.2.35 sibling). Prevents `TextSnapshotRace` bug class. See [`eslint-plugin-playwright/prefer-to-have-text`](https://github.com/playwright-community/eslint-plugin-playwright/blob/main/docs/rules/prefer-to-have-text.md).

#### 1.1.20 `expect(await locator.isChecked()).toBe(true)` — sync probe on stateful methods

```ts
// ANTI-PATTERN — variant of 1.1.5 on isChecked/isEnabled/isEditable
expect(await page.getByLabel('Remember me').isChecked()).toBe(true);
expect(await page.getByRole('button', { name: 'Submit' }).isEnabled()).toBe(true);
expect(await page.getByLabel('Comment').isEditable()).toBe(true);
```

```ts
// CANONICAL — web-first state assertions
await expect(page.getByLabel('Remember me')).toBeChecked();
await expect(page.getByRole('button', { name: 'Submit' })).toBeEnabled();
await expect(page.getByLabel('Comment')).toBeEditable();
```

Rationale: same family as 1.1.5 but applied to the other sync probes — `isChecked`, `isEnabled`, `isEditable`, `isDisabled`, `isHidden`. Each returns a one-shot boolean with no auto-retry. The web-first counterparts (`toBeChecked`, `toBeEnabled`, `toBeEditable`, `toBeDisabled`, `toBeHidden`) poll until the assertion timeout. The lint rule covers all of them. Prevents `StateProbeRace` bug class. See [`eslint-plugin-playwright/prefer-web-first-assertions`](https://github.com/playwright-community/eslint-plugin-playwright/blob/main/docs/rules/prefer-web-first-assertions.md).

#### 1.1.21 Manual `clearCookies` / `clearPermissions` in `beforeEach`

```ts
// ANTI-PATTERN — ceremonial isolation
test.beforeEach(async ({ context }) => {
  await context.clearCookies();
  await context.clearPermissions();
  await context.storageState({ path: undefined });
});
```

```ts
// CANONICAL — Playwright creates a fresh BrowserContext per test by default
test('logged-out user sees marketing page', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible();
});
```

Rationale: Playwright's default test fixture creates a NEW `BrowserContext` per test — cookies, localStorage, sessionStorage, IndexedDB, and granted permissions all reset for free. Manual `clearCookies` in `beforeEach` is leftover Selenium-era muscle memory and clutters every spec. The only legitimate use is when explicitly opting into a shared context (e.g., `storageState` auth reuse) AND wanting to invalidate it mid-suite — both rare. Prevents `IsolationCeremonyClutter` bug class. See [playwright.dev/docs/browser-contexts#why-browser-contexts](https://playwright.dev/docs/browser-contexts#why-browser-contexts).

#### 1.1.22 `test.describe.configure({ mode: 'serial' })` as state-bug workaround

```ts
// ANTI-PATTERN — serial mode hides shared-state coupling
test.describe.configure({ mode: 'serial' });

test.describe('user CRUD', () => {
  test('creates user', async ({ page }) => { /* writes to module-scope createdUserId */ });
  test('edits that user', async ({ page }) => { /* reads createdUserId */ });
  test('deletes that user', async ({ page }) => { /* reads createdUserId */ });
});
```

```ts
// CANONICAL — hermetic tests with per-test setup
test('creates a user', async ({ page, freshUser }) => {
  await createUser(page, freshUser);
  await expect(page.getByText(freshUser.email)).toBeVisible();
});

test('edits an existing user', async ({ page, seededUser }) => {
  await editUser(page, seededUser, { name: 'New Name' });
  await expect(page.getByText('New Name')).toBeVisible();
});
```

Rationale: `mode: 'serial'` forces tests to run in declaration order on one worker AND aborts the suite at the first failure. It's almost always a workaround for shared-state bugs (e.g., test 2 depends on side effects of test 1). The fix is to make each test hermetic via fixtures (`freshUser`, `seededUser`) — not to constrain the runner. Serial mode also disables sharding speedups. Legitimate uses (e.g., one-shot DB migration in setup project) are rare and belong in a `setup` project, not in feature specs. Prevents `SerialModeStateLeak` bug class. See [playwright.dev/docs/test-parallel#serial-mode](https://playwright.dev/docs/test-parallel#serial-mode).

#### 1.1.23 `page.on('console', ...)` listener left in committed tests

```ts
// ANTI-PATTERN — debug observability leaked into CI
test('checkout flow', async ({ page }) => {
  page.on('console', msg => console.log('BROWSER:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err));
  await page.goto('/checkout');
  // ... rest of test
});
```

```ts
// CANONICAL — either delete OR convert to an assertion on quality bar
test('checkout flow produces no console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  await page.goto('/checkout');
  await page.getByRole('button', { name: 'Pay' }).click();
  await expect(page.getByText('Thank you')).toBeVisible();
  expect(errors, 'no console errors during checkout').toEqual([]);
});
```

Rationale: a `console.log` listener with no assertion bloats CI logs (every browser-side log line spams the runner output) without ever failing the test. Either the listener should drive an assertion (the canonical form turns "no console errors" into a real quality gate) OR it should be deleted. Leftover debug listeners are the test-code equivalent of `console.log('here')` shipping to production. Prevents `DebugListenerLeak` bug class.

#### 1.1.24 `page.screenshot({ path: 'debug.png' })` left in committed tests

```ts
// ANTI-PATTERN — debug artifact leaked into repo
test('payment form', async ({ page }) => {
  await page.goto('/checkout');
  await page.getByLabel('Card number').fill('4242424242424242');
  await page.screenshot({ path: 'debug.png' });
  await page.screenshot({ path: 'after-fill.png' });
  await page.getByRole('button', { name: 'Pay' }).click();
});
```

```ts
// CANONICAL — let Playwright handle on-failure artifacts via config
// playwright.config.ts:
//   use: { screenshot: 'only-on-failure', trace: 'retain-on-failure' }
test('payment form', async ({ page }) => {
  await page.goto('/checkout');
  await page.getByLabel('Card number').fill('4242424242424242');
  await page.getByRole('button', { name: 'Pay' }).click();
  await expect(page.getByText('Payment received')).toBeVisible();
});
```

Rationale: manual `page.screenshot({ path })` writes a PNG to the working directory on every run — on CI that means orphan artifacts, in dev that means a polluted git status. Playwright's config-level `screenshot: 'only-on-failure'` plus `trace: 'retain-on-failure'` produces richer failure artifacts (full DOM snapshot, network, console) and only when something actually broke. Manual screenshots also leak sensitive data (the card number above lands on disk). Visual regression is a separate concern handled via `toHaveScreenshot()`, not ad-hoc PNG dumps. Prevents `DebugArtifactLeak` bug class. See [playwright.dev/docs/test-use-options#recording-options](https://playwright.dev/docs/test-use-options#recording-options).

#### 1.1.25 Short `waitForTimeout(100)` masquerading as a non-hard-wait

```ts
// ANTI-PATTERN — "tiny" timeout, same anti-pattern as 1.1.1
await page.getByRole('button', { name: 'Save' }).click();
await page.waitForTimeout(100);  // "let React rerender"
await page.waitForTimeout(50);   // "small debounce"
await page.waitForTimeout(300);  // "animation"
await expect(page.getByText('Saved')).toBeVisible();
```

```ts
// CANONICAL — wait on the visible state, not on a guess
await page.getByRole('button', { name: 'Save' }).click();
await expect(page.getByText('Saved')).toBeVisible();
```

Rationale: developers normalize the `waitForTimeout` smell by using "small" values (50ms, 100ms, 300ms) and rationalizing them as "just letting React rerender" or "small debounce". The anti-pattern is identical to 1.1.1 — a sleep with no relation to the actual UI state, just a guess that happens to work on one machine. On loaded CI runners those 100ms become 800ms and the test still races. The lint rule `no-wait-for-timeout` fires regardless of N — it's the call that's wrong, not the size. Prevents `ShortHardWaitRationalization` bug class. See [`eslint-plugin-playwright/no-wait-for-timeout`](https://github.com/playwright-community/eslint-plugin-playwright/blob/main/docs/rules/no-wait-for-timeout.md).

---

### 1.2 Cypress anti-patterns

Cypress idioms that mechanically translate badly into Playwright. The Cypress runtime model (single-domain, command queue, retryable subjects) doesn't exist in Playwright — naive translations preserve broken assumptions.

#### 1.2.1 `cy.wait(N)` hard wait

```js
// ANTI-PATTERN — Cypress
cy.get('#submit').click();
cy.wait(3000);
cy.contains('Success').should('be.visible');
```

```ts
// CANONICAL — Playwright
await page.getByRole('button', { name: 'Submit' }).click();
await expect(page.getByText('Success')).toBeVisible();
```

Rationale: same as bad-Playwright; eliminates timing flakes.

#### 1.2.2 `cy.get('.class').eq(2)` index-based selector

```js
// ANTI-PATTERN
cy.get('.product-card').eq(2).click();
```

```ts
// CANONICAL
await page.getByRole('article', { name: 'Wireless Mouse' }).getByRole('link').click();
```

Rationale: index-based selection couples test to feed order. Same bug class as `nth()`.

#### 1.2.3 `cy.get('.btn-primary')` CSS-class selector

```js
// ANTI-PATTERN
cy.get('.btn-primary').click();
```

```ts
// CANONICAL
await page.getByRole('button', { name: 'Continue' }).click();
```

Rationale: styling refactors break the suite.

#### 1.2.4 `cy.get('button').click({ force: true })`

```js
// ANTI-PATTERN
cy.get('#agree').click({ force: true });
```

```ts
// CANONICAL
await expect(page.getByLabel('I agree')).toBeEnabled();
await page.getByLabel('I agree').check();
```

Rationale: Cypress and Playwright share the same `force: true` smell — it hides actionability bugs.

#### 1.2.5 Custom command sprawl (`cy.login()`, `cy.createOrder()` …)

```js
// ANTI-PATTERN — commands/login.js
Cypress.Commands.add('login', (email, pw) => {
  cy.visit('/login');
  cy.get('#email').type(email);
  cy.get('#password').type(pw);
  cy.get('button[type=submit]').click();
});
```

```ts
// CANONICAL — fixture (preferred for small suites)
import { test as base } from '@playwright/test';

type Fixtures = { authedPage: Page };

export const test = base.extend<Fixtures>({
  authedPage: async ({ page }, use) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill(process.env.TEST_USER_EMAIL!);
    await page.getByLabel('Password').fill(process.env.TEST_USER_PASSWORD!);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await use(page);
  },
});
```

Rationale: custom commands hide intent behind a wall of API calls and conflict with TypeScript types unless declaration-merged. Fixtures are typed end-to-end.

#### 1.2.6 `cy.contains('Submit')` ambiguous text match

```js
// ANTI-PATTERN — matches "Submit", "Submit and review", "Submitted"
cy.contains('Submit').click();
```

```ts
// CANONICAL — exact role+name
await page.getByRole('button', { name: 'Submit', exact: true }).click();
```

Rationale: substring match is the #1 source of "wrong element clicked" bugs in Cypress suites.

#### 1.2.7 `cy.intercept` without explicit response shape

```js
// ANTI-PATTERN
cy.intercept('POST', '/api/orders').as('createOrder');
cy.get('button').click();
cy.wait('@createOrder');
```

```ts
// CANONICAL — stub with explicit shape
await page.route('**/api/orders', async (route) => {
  await route.fulfill({
    status: 201,
    contentType: 'application/json',
    body: JSON.stringify({ id: 'ord_test_123', status: 'pending' }),
  });
});
await page.getByRole('button', { name: 'Place order' }).click();
await expect(page.getByText('Order pending')).toBeVisible();
```

Rationale: intercept-only relies on real backend (slow, flaky). Explicit stubs make the test deterministic.

#### 1.2.8 `cy.pause()` leftover

```js
// ANTI-PATTERN
cy.visit('/login');
cy.pause();
```

```ts
// CANONICAL — remove or use trace viewer post-run
await page.goto('/login');
```

Rationale: same as `page.pause()` — blocks CI.

#### 1.2.9 `it.only` / `describe.only`

```js
// ANTI-PATTERN
it.only('important', () => { /* ... */ });
```

```ts
// CANONICAL
test('important', async ({ page }) => { /* ... */ });
```

Rationale: silently disables the rest of the file.

#### 1.2.10 Conditional `if (Cypress.$(...).length)` inside test

```js
// ANTI-PATTERN
if (Cypress.$('.cookie-banner').length) {
  cy.get('.cookie-banner button').click();
}
```

```ts
// CANONICAL — fixture sets cookie pre-test
await page.context().addCookies([{
  name: 'cookies_accepted', value: '1', domain: 'localhost', path: '/',
}]);
```

Rationale: conditional UI handling = silent no-op when the condition is wrong.

#### 1.2.11 `cy.wait('@req').then(...)` chaining with assertions buried inside

```js
// ANTI-PATTERN
cy.wait('@createOrder').then((interception) => {
  expect(interception.response.statusCode).to.equal(201);
  expect(interception.response.body.id).to.match(/^ord_/);
});
```

```ts
// CANONICAL — capture via waitForResponse, assert flat
const respPromise = page.waitForResponse(r => r.url().includes('/api/orders') && r.request().method() === 'POST');
await page.getByRole('button', { name: 'Place order' }).click();
const resp = await respPromise;
expect(resp.status()).toBe(201);
expect((await resp.json()).id).toMatch(/^ord_/);
```

Rationale: flat structure reads top-to-bottom. Nested `.then` is hard to debug.

#### 1.2.12 `cy.fixture()` for test data inline

```js
// ANTI-PATTERN
cy.fixture('users.json').then((users) => {
  cy.login(users.admin.email, users.admin.password);
});
```

```ts
// CANONICAL — typed factory function
import { adminUser } from '../fixtures/users';

test('admin login', async ({ page }) => {
  await login(page, adminUser());
});
```

Rationale: typed factories let TypeScript catch missing fields. JSON fixtures rot silently.

#### 1.2.13 `cy.viewport(N, M)` magic numbers per-test

```js
// ANTI-PATTERN
cy.viewport(1366, 768);
```

```ts
// CANONICAL — project config
// playwright.config.ts
projects: [
  { name: 'desktop', use: { viewport: { width: 1366, height: 768 } } },
  { name: 'mobile', use: { ...devices['iPhone 14'] } },
],
```

Rationale: viewport belongs at the project level, not sprinkled in tests.

#### 1.2.14 `cy.task()` for backend operations called from tests

```js
// ANTI-PATTERN
cy.task('db:seedUser', { email: 'a@b.c' });
```

```ts
// CANONICAL — APIRequestContext or test fixture
test('with seeded user', async ({ request, page }) => {
  const user = await request.post('/api/test-helpers/seed-user', {
    data: { email: 'a@b.c' },
  });
  expect(user.ok()).toBeTruthy();
  // ...
});
```

Rationale: `cy.task` runs in Node context bypassing the network — easy to drift away from production. APIRequestContext goes through real HTTP, matching how real clients use the system.

#### 1.2.15 `cy.session()` without explicit cache invalidation

```js
// ANTI-PATTERN
beforeEach(() => {
  cy.session('admin', () => {
    cy.visit('/login');
    cy.get('#email').type('admin@x.com');
    cy.get('#password').type('pw');
    cy.get('#submit').click();
  });
});
```

```ts
// CANONICAL — storageState produced once, consumed via project config
// playwright.config.ts
projects: [
  {
    name: 'authed',
    use: { storageState: 'playwright/.auth/admin.json' },
  },
],
// playwright/global-setup.ts produces admin.json (signed-in localStorage + cookies).
```

Rationale: `cy.session` caches by key but offers no automatic invalidation when the auth flow changes — stale sessions silently mask login regressions. Playwright `storageState` is produced explicitly in global setup, with version pinning if needed. Prevents `StaleAuthMasksRegression` bug class.

#### 1.2.16 `cy.window().its('app.store')` reaching into framework internals

```js
// ANTI-PATTERN
cy.window().its('app.store').invoke('getState').should('deep.include', {
  user: { id: 42 },
});
```

```ts
// CANONICAL — assert through the user-perceivable surface
await expect(page.getByRole('heading', { name: /welcome,? alice/i })).toBeVisible();
await expect(page.getByTestId('account-id')).toHaveText('42');
```

Rationale: reaching into Redux/Vuex/store internals couples tests to implementation. Refactoring state shape — even with identical UX — breaks the test. Web-first assertions exercise the same path real users see. Prevents `StoreShapeCoupling` bug class.

#### 1.2.17 `cy.spy()` / `cy.stub()` without cleanup discipline

```js
// ANTI-PATTERN
beforeEach(() => {
  cy.window().then((win) => {
    cy.stub(win.console, 'error').as('consoleError');
  });
});

it('does X', () => {
  // ... action ...
  cy.get('@consoleError').should('not.have.been.called');
});
```

```ts
// CANONICAL — Playwright captures console events with explicit lifecycle
test('does X', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  // ... action ...
  expect(errors).toEqual([]);
});
```

Rationale: Cypress stubs sometimes survive across `it` blocks if cleanup goes wrong; the listener stays attached. Playwright `page.on` is auto-scoped to the test fixture lifecycle. Prevents `CrossTestSpyLeak` bug class.

#### 1.2.18 `cy.then()` mixing synchronous assertions with async chain

```js
// ANTI-PATTERN
cy.get('.row').then(($rows) => {
  expect($rows).to.have.length(3);
  cy.get('.row').first().click(); // re-queries DOM — original $rows may be stale
});
```

```ts
// CANONICAL — single locator, flat assertions
const rows = page.getByRole('row');
await expect(rows).toHaveCount(3);
await rows.first().click();
```

Rationale: `cy.then` captured snapshots get stale; subsequent `cy.get` re-queries the DOM but the assertion above ran on stale data. Playwright locators are LAZY descriptors — each method call re-resolves against the current DOM. Prevents `StaleSnapshotAssertion` bug class.

#### 1.2.19 `Cypress.Commands.overwrite` monkey-patching base commands

```js
// ANTI-PATTERN — repo-wide override
Cypress.Commands.overwrite('visit', (originalFn, url, options) => {
  return originalFn(url, { ...options, timeout: 60000 });
});
```

```ts
// CANONICAL — explicit per-call, or project-level config
// playwright.config.ts
use: {
  navigationTimeout: 60000, // applies globally, discoverable in config
},
// OR per-call:
await page.goto('/slow-route', { timeout: 60000 });
```

Rationale: monkey-patching `cy.visit` makes the actual behavior invisible at call sites — readers think `cy.visit('/foo')` uses the default timeout when it doesn't. Playwright forces the choice to be visible (either in config or at the call). Prevents `HiddenBehaviorOverride` bug class.

#### 1.2.20 `.should('not.exist')` masking page-not-yet-loaded races

```js
// ANTI-PATTERN
cy.visit('/profile');
cy.get('.error-toast').should('not.exist'); // passes before page renders
cy.get('.username').should('have.text', 'alice');
```

```ts
// CANONICAL — wait for positive signal first, then assert absence
await page.goto('/profile');
await expect(page.getByText('alice')).toBeVisible(); // page has rendered
await expect(page.getByRole('alert')).toHaveCount(0); // now check absence
```

Rationale: `should('not.exist')` returns immediately if the element hasn't been added yet (it doesn't wait). Tests pass during the loading window before the toast appears. Playwright's `toHaveCount(0)` polls, but the safer pattern is to wait on a positive signal first. Prevents `PrematureAbsenceCheck` bug class. See [`playwright-rules/absence-after-presence`](https://github.com/microsoft/playwright/issues/15391) discussion.

#### 1.2.21 `cy.get('parent').get('child')` chained instead of scoped `.find()`

```js
// ANTI-PATTERN
cy.get('.order-row').get('.delete-btn').first().click();
```

```ts
// CANONICAL
await page.getByRole('row').filter({ hasText: 'Order #42' }).getByRole('button', { name: 'Delete' }).click();
```

Rationale: chaining `cy.get('.parent').get('.child')` re-queries the WHOLE document for `.child` — it does NOT scope the second query under the first match. Selecting the wrong delete button on a different row passes the test but corrupts data. Prevents `UnscopedDescendantSelection` bug class.

#### 1.2.22 `cy.contains('Save ')` whitespace-sensitive text match

```js
// ANTI-PATTERN
cy.contains('Save changes ').click(); // trailing space copy-pasted from designer
```

```ts
// CANONICAL — regex with anchored boundary
await page.getByRole('button', { name: /^save changes$/i }).click();
```

Rationale: Cypress `cy.contains` uses substring matching with the exact string including whitespace; a designer-pasted trailing space breaks the test in a way that's invisible in code review. Playwright `getByRole` normalizes accessible names. Prevents `InvisibleWhitespaceMismatch` bug class.

#### 1.2.23 `cy.get('[data-cy=user-row]')` data-attribute without quotes

```js
// ANTI-PATTERN
cy.get('[data-cy=user row]').click(); // breaks: unquoted multi-word value
cy.get('[data-test=row-1]').click();  // works but pollutes prod DOM
```

```ts
// CANONICAL
await page.getByTestId('user-row').click();
// playwright.config.ts: use: { testIdAttribute: 'data-cy' }
```

Rationale: unquoted attribute values fail silently on multi-word strings; quoted ones work but typos go undetected because CSS selectors don't validate. `getByTestId` with a project-level `testIdAttribute` config is the canonical form — typos at call sites surface as missing-element errors immediately. Prevents `SilentSelectorTypo` bug class.

#### 1.2.24 `cy.get(':contains("Sign in"):eq(0)')` jQuery pseudo-selector escape hatch

```js
// ANTI-PATTERN
cy.get(':contains("Sign in"):eq(0)').click();
```

```ts
// CANONICAL
await page.getByRole('link', { name: 'Sign in' }).click();
```

Rationale: jQuery pseudo-selectors mix CSS with substring matching and ordinal indexing — three foot-guns in one selector. Playwright role queries express the intent at the level the user perceives. Prevents `JQueryAntiPatternResurrection` bug class.

#### 1.2.25 `cy.get('#submit')` CSS-id when role would be stable

```js
// ANTI-PATTERN
cy.get('#submit').click();
```

```ts
// CANONICAL
await page.getByRole('button', { name: 'Submit order' }).click();
```

Rationale: framework-generated IDs (React, Angular auto-IDs) churn across major versions. Even stable hand-written IDs couple the test to implementation rather than to what the user sees. Role + accessible name survive refactors that preserve UX. Prevents `IdChurnOnFrameworkBump` bug class.

#### 1.2.26 `cy.click().click()` double-click retry workaround

```js
// ANTI-PATTERN — masks a real race with no fix
cy.get('#submit').click().click();
```

```ts
// CANONICAL — wait for the button to be enabled, then single click
const submit = page.getByRole('button', { name: 'Submit' });
await expect(submit).toBeEnabled();
await submit.click();
```

Rationale: double-clicking to "make it work" hides actionability problems — the button is disabled, the modal hasn't rendered, the form is mid-validation. Playwright's actionability checks (`toBeEnabled`, automatic stability wait) handle the root cause. Prevents `DoubleClickMaskingRace` bug class.

#### 1.2.27 `cy.type('hello', { delay: 100 })` hardcoded inter-keystroke delay

```js
// ANTI-PATTERN
cy.get('#search').type('quarterly report', { delay: 150 });
```

```ts
// CANONICAL
await page.getByRole('searchbox').fill('quarterly report');
// If real typing is needed (autocomplete triggers, e.g.):
await page.getByRole('searchbox').pressSequentially('quarterly', { delay: 50 });
await expect(page.getByRole('option')).toHaveCount(3);
```

Rationale: `delay` is a sympathetic-magic fix for autocomplete races. Either no delay is needed (`fill` is instant and works for most inputs) or the test should assert on the visible result of typing instead of waiting blindly. Prevents `SympatheticMagicDelay` bug class.

#### 1.2.28 `cy.check()` without verifying state

```js
// ANTI-PATTERN
cy.get('#tos').check();
cy.get('#submit').click(); // — if check() silently no-op'd, click fails ambiguously
```

```ts
// CANONICAL
const tos = page.getByRole('checkbox', { name: 'I agree to terms' });
await tos.check();
await expect(tos).toBeChecked(); // confirm state changed
await page.getByRole('button', { name: 'Submit' }).click();
```

Rationale: `check()` is idempotent — if the box is already checked, nothing happens. If a previous test left the page in a checked state and `beforeEach` failed to reset, the next assertion fails in a way that points at the WRONG bug. Explicit state assertions catch this. Prevents `IdempotentNoOpHidesState` bug class.

#### 1.2.29 `cy.get('select').select(2)` by index

```js
// ANTI-PATTERN
cy.get('#country').select(2); // — what country is index 2?
```

```ts
// CANONICAL
await page.getByLabel('Country').selectOption('Czech Republic');
```

Rationale: option order changes when the data source changes — adding a new country alphabetically shifts every index downstream. The test passes but tests the wrong country. Selecting by visible label survives data churn. Prevents `OrdinalDataDrift` bug class.

#### 1.2.30 `cy.get(...).clear().type(...)` clear-then-type pattern

```js
// ANTI-PATTERN
cy.get('#email').clear().type('new@x.com');
```

```ts
// CANONICAL
await page.getByLabel('Email').fill('new@x.com');
```

Rationale: `fill` replaces input value atomically; the manual `clear().type()` pattern can race if the underlying React/Vue input handler fires onChange between the two operations and re-validates mid-replacement. Atomic fill removes the race. Prevents `ClearTypeReactStateRace` bug class.

#### 1.2.31 `should('be.visible').should('contain', text)` chained assertion ladder

```js
// ANTI-PATTERN
cy.get('.welcome').should('be.visible').should('contain', 'alice');
```

```ts
// CANONICAL — one assertion that subsumes both
await expect(page.getByText('Welcome, alice', { exact: false })).toBeVisible();
```

Rationale: chained `.should` re-queries the DOM between each link in the chain. If the element re-renders (React conditional render) between visibility check and contain check, the test passes against a stale element. Single web-first assertion against the user-visible string is atomic. Prevents `ChainedShouldStaleAssertion` bug class.

#### 1.2.32 `cy.url().should('eq', 'https://staging.example.com/full/path?q=1')` over partial match

```js
// ANTI-PATTERN
cy.url().should('eq', 'https://staging.example.com/orders/42?status=new');
```

```ts
// CANONICAL — assert what the test actually cares about (route + key params)
await expect(page).toHaveURL(/\/orders\/\d+\?.*status=new/);
```

Rationale: full-URL equality couples to environment (staging vs prod hostname), to query-string ordering, and to optional tracking params. Pattern-match against the route + meaningful params. Prevents `URLOverSpecification` bug class.

#### 1.2.33 `cy.contains('Order')` matching too broadly

```js
// ANTI-PATTERN — matches "Order #42", "Order summary", "Ordering...", "Reorder"
cy.contains('Order').click();
```

```ts
// CANONICAL — anchored, scoped, role-targeted
await page.getByRole('heading', { name: /^order #\d+$/i }).click();
```

Rationale: substring text matching against unanchored single words is a source of CI flakes — a UI string addition can shift which element matches first. Role + anchored pattern eliminates the ambiguity. Prevents `TextSubstringFlakeAmplification` bug class.

#### 1.2.34 `cy.then(($el) => expect($el.attr('href')).toEqual(...))` jQuery property extraction

```js
// ANTI-PATTERN
cy.get('.docs-link').then(($el) => {
  expect($el.attr('href')).to.equal('/docs');
});
```

```ts
// CANONICAL — Playwright has direct DOM property assertions
await expect(page.getByRole('link', { name: 'Documentation' })).toHaveAttribute('href', '/docs');
```

Rationale: reaching into jQuery's `$el` mixes synchronous DOM access into Cypress's command queue and bypasses retry. Playwright's `toHaveAttribute` polls until the assertion holds. Prevents `JQueryAttrSyncMismatch` bug class.

#### 1.2.35 `should('have.text', '  Submit  ')` whitespace-trim sensitivity

```js
// ANTI-PATTERN
cy.get('.btn').should('have.text', 'Submit'); // fails if text is "  Submit  "
```

```ts
// CANONICAL — explicit normalization or pattern match
await expect(page.getByRole('button', { name: 'Submit' })).toBeVisible();
// or: expect(await btn.textContent()).toMatch(/^\s*Submit\s*$/);
```

Rationale: `have.text` does an exact-match string comparison; CSS `white-space: pre` styling can leave invisible padding. `getByRole` normalizes accessible names. Prevents `WhitespaceExactMatchFailure` bug class.

#### 1.2.36 `cy.wait('@createOrder')` without explicit timeout

```js
// ANTI-PATTERN — defaults to 5s, may flake on slow CI
cy.wait('@createOrder');
```

```ts
// CANONICAL — explicit, with intent
const orderResp = await page.waitForResponse(
  r => r.url().includes('/api/orders') && r.request().method() === 'POST',
  { timeout: 30000 }
);
expect(orderResp.status()).toBe(201);
```

Rationale: implicit 5-second default works in dev but fails when staging is under load. Explicit timeout documents the SLO. Plus Playwright's pattern matcher is more precise than alias-based wait. Prevents `ImplicitTimeoutFlake` bug class.

#### 1.2.37 `cy.wait(['@a', '@b'])` ordering assumption

```js
// ANTI-PATTERN — assumes both already fired
cy.wait(['@createOrder', '@logEvent']);
```

```ts
// CANONICAL — Promise.all races them, no ordering assumption
const [order, log] = await Promise.all([
  page.waitForResponse(r => r.url().includes('/api/orders')),
  page.waitForResponse(r => r.url().includes('/api/events')),
]);
expect(order.status()).toBe(201);
expect(log.status()).toBe(200);
```

Rationale: `cy.wait(['@a', '@b'])` semantically races but past Cypress versions enforced array order; the migration target shouldn't carry that brittleness forward. Promise.all is explicitly unordered. Prevents `AliasArrayOrderingDrift` bug class.

#### 1.2.38 `cy.request('/health')` polling instead of fixture readiness

```js
// ANTI-PATTERN — polls in beforeEach until backend wakes up
beforeEach(() => {
  cy.request({ url: '/health', retryOnStatusCodeFailure: true });
});
```

```ts
// CANONICAL — global-setup waits once, tests assume ready state
// playwright/global-setup.ts
async function globalSetup() {
  const r = await fetch(`${process.env.MIGRATION_TARGET_URL}/health`);
  if (!r.ok) throw new Error(`Backend not ready: ${r.status}`);
}
```

Rationale: per-test health polling wastes minutes on a 30-test suite. Global setup proves readiness once per worker. Prevents `PerTestReadinessProbeWaste` bug class.

#### 1.2.39 `cy.intercept('GET', '/api/foo', ...)` without `.as()` alias

```js
// ANTI-PATTERN — can't wait on it later
cy.intercept('GET', '/api/orders', { fixture: 'orders.json' });
cy.visit('/orders');
// Test can't synchronize on the intercept firing
```

```ts
// CANONICAL — route + waitForResponse
await page.route('**/api/orders', (route) =>
  route.fulfill({ body: JSON.stringify(ordersFixture) })
);
const respPromise = page.waitForResponse('**/api/orders');
await page.goto('/orders');
await respPromise;
```

Rationale: aliasless intercepts leave the test without a sync point — assertions race the network. Explicit waiters tie the assertion to the network response. Prevents `UnaliasedInterceptRace` bug class.

#### 1.2.40 `cy.intercept(..., { times: 1 })` count limit brittleness

```js
// ANTI-PATTERN — fails the second call (e.g., on retry)
cy.intercept('POST', '/api/login', { statusCode: 401 }).as('login');
// If frontend retries on 401, second call hits the real endpoint
```

```ts
// CANONICAL — explicit per-call control or unmocked retry
let callCount = 0;
await page.route('**/api/login', (route) => {
  callCount++;
  if (callCount === 1) return route.fulfill({ status: 401 });
  return route.continue(); // let retries through
});
```

Rationale: implicit `times: 1` semantics (or any count limit) couples the test to retry behavior in the SUT. Explicit per-call logic documents the intent. Prevents `InterceptCountCoupling` bug class.

#### 1.2.41 `cy.origin()` ceremony for SSO flow

```js
// ANTI-PATTERN — requires special config + plugin
cy.origin('auth.example.com', () => {
  cy.get('#user').type('alice');
  cy.get('#pass').type('pw');
  cy.get('#login').click();
});
```

```ts
// CANONICAL — Playwright follows cross-origin redirects natively
await page.goto('/protected'); // redirects to auth.example.com
await page.getByLabel('Username').fill('alice');
await page.getByLabel('Password').fill('pw');
await page.getByRole('button', { name: 'Log in' }).click();
// Or skip the UI entirely:
await page.context().addCookies([{ name: 'session', value: token, domain: 'example.com', path: '/' }]);
```

Rationale: Cypress's same-origin restriction birthed `cy.origin` ceremony; Playwright operates per-Page not per-origin, so cross-origin flows just work. Prevents `OriginCeremonyCarryover` bug class.

#### 1.2.42 `cy.request(...)` without `failOnStatusCode: false` for expected errors

```js
// ANTI-PATTERN — test crashes on expected 404
cy.request('/api/missing-resource'); // crashes the test instead of returning the response
```

```ts
// CANONICAL — APIRequestContext returns the response regardless of status
const resp = await request.get('/api/missing-resource');
expect(resp.status()).toBe(404);
```

Rationale: Cypress's `cy.request` throws on non-2xx by default — tests checking for 404 must opt out with `failOnStatusCode: false`. Playwright's APIRequestContext returns the response uniformly; status check is explicit. Prevents `ImplicitFailOnNon2xx` bug class.

#### 1.2.43 `@alias` leaking across `describe` blocks

```js
// ANTI-PATTERN
describe('A', () => {
  beforeEach(() => cy.fixture('user').as('user'));
  it('uses @user', () => { /* ok */ });
});
describe('B', () => {
  it('also uses @user', () => { cy.get('@user'); }); // — works if A ran first, fails if B runs alone
});
```

```ts
// CANONICAL — per-describe fixtures via Playwright's fixture system
import { test } from './fixtures';
test.describe('B', () => {
  test('uses user', async ({ user, page }) => {
    // user is a scoped fixture
  });
});
```

Rationale: Cypress aliases live on the test runner singleton and leak across describes; test isolation breaks under `--testPathPattern` runs that pick only describe B. Playwright fixtures are explicit and per-test. Prevents `AliasGlobalScopeLeak` bug class.

#### 1.2.44 `beforeEach(() => sharedArr.push(...))` shared-state mutation

```js
// ANTI-PATTERN
const seen = [];
beforeEach(() => {
  seen.push(Date.now()); // each test mutates a module-scoped array
});
```

```ts
// CANONICAL — fixture-scoped state, fresh per test
test.beforeEach(({ }, testInfo) => {
  testInfo.attach('seen-at', { body: String(Date.now()) });
});
```

Rationale: module-scoped mutation makes test order matter — running test 5 in isolation sees an empty array; running the full suite sees an array with 4 entries. Either is "test passes" but they assert different things. Prevents `OrderDependentSharedState` bug class.

#### 1.2.45 `cy.clearCookies()` / `cy.clearLocalStorage()` in every `beforeEach`

```js
// ANTI-PATTERN — adds 50-100ms × N tests to suite runtime
beforeEach(() => {
  cy.clearCookies();
  cy.clearLocalStorage();
});
```

```ts
// CANONICAL — fresh BrowserContext per test (default behavior)
test('starts clean', async ({ page }) => {
  // Playwright gives each test a fresh context; no cookies/storage carry over.
});
```

Rationale: Cypress shares a single browser context across tests so cleanup ceremony is required. Playwright defaults to per-test context isolation — the cleanup is automatic and faster. Prevents `ManualIsolationCeremony` bug class.

#### 1.2.46 `describe.skip('flaky', ...)` without a tracking issue

```js
// ANTI-PATTERN — silently disabled forever
describe.skip('checkout flow', () => { /* ... */ });
```

```ts
// CANONICAL — link the ticket and set a deadline
test.skip('checkout flow — re-enable after #4231 lands (target: 2026-Q3)', async ({ page }) => {
  // ...
});
// OR fixme for known-broken pending repair:
test.fixme('payment redirect', async ({ page }) => { /* tracked */ });
```

Rationale: untraced skips rot into permanent dead code. The linked-ticket convention forces a re-enable window. Prevents `OrphanedSkipDecay` bug class.

#### 1.2.47 `cy.then(() => Promise.all([...]))` mixing Cypress and native async

```js
// ANTI-PATTERN
cy.then(() => {
  return Promise.all([fetchA(), fetchB()]);
});
```

```ts
// CANONICAL — Playwright is async/await native, no mixing
const [a, b] = await Promise.all([fetchA(), fetchB()]);
```

Rationale: Cypress's command queue and native Promise chains have different error semantics — a Promise rejection inside `cy.then` may or may not fail the test depending on Cypress version. Pure async/await has one error model. Prevents `MixedAsyncErrorSemantics` bug class.

#### 1.2.48 4-level `describe` nesting (`describe(describe(describe(it)))`)

```js
// ANTI-PATTERN
describe('Auth', () => {
  describe('Login', () => {
    describe('Valid credentials', () => {
      describe('Remember me checked', () => {
        it('persists session', () => { /* ... */ });
      });
    });
  });
});
```

```ts
// CANONICAL — flat structure, intent in test title
test('login: valid creds + remember-me persists session', async ({ page }) => {
  // ...
});
```

Rationale: deep nesting fragments the reader's mental model and makes `before`/`after` ordering hard to trace. Playwright community convention is ≤ 1 level of describe; intent goes in the test title. Prevents `NestingMazeReadability` bug class.

#### 1.2.49 Hardcoded test emails (`admin@x.com`) without isolation

```js
// ANTI-PATTERN
cy.get('#email').type('admin@x.com');
// — every parallel worker types the same email, races on user lookup
```

```ts
// CANONICAL — generated unique per test
const email = `admin+${test.info().workerIndex}-${Date.now()}@example.com`;
await page.getByLabel('Email').fill(email);
```

Rationale: hardcoded test data makes parallel test runs race on the same backend record. Unique-per-worker emails eliminate the contention. Prevents `ParallelWorkerDataCollision` bug class.

#### 1.2.50 `cy.log('about to click')` debug leftover

```js
// ANTI-PATTERN — commits debug output to CI logs
cy.log('about to click submit');
cy.get('#submit').click();
cy.log('clicked');
```

```ts
// CANONICAL — test.step for structured grouping (visible in HTML report)
await test.step('submit the form', async () => {
  await page.getByRole('button', { name: 'Submit' }).click();
});
```

Rationale: `cy.log` was a debug aid that survived into committed code; CI logs fill with noise. Playwright `test.step` produces structured trace entries visible in the HTML report — useful AND survives review. Prevents `DebugLogOnboardNoise` bug class.

---

### 1.3 Selenium WebDriver (Java) anti-patterns

#### 1.3.1 `Thread.sleep(N)` hard wait

```java
// ANTI-PATTERN
driver.findElement(By.id("submit")).click();
Thread.sleep(3000);
assertTrue(driver.findElement(By.cssSelector(".success")).isDisplayed());
```

```ts
// CANONICAL — Playwright
await page.getByRole('button', { name: 'Submit' }).click();
await expect(page.getByText('Success')).toBeVisible();
```

Rationale: same flake class; web-first assertion polls until configured timeout.

#### 1.3.2 `By.xpath("//div[3]")` positional XPath

```java
// ANTI-PATTERN
driver.findElement(By.xpath("//ul[@id='items']/li[3]/button")).click();
```

```ts
// CANONICAL
await page.getByRole('listitem', { name: 'Q3 forecast' })
  .getByRole('button', { name: 'Edit' })
  .click();
```

Rationale: positional XPath breaks the moment a row is added.

#### 1.3.3 `By.cssSelector(".btn-primary")` styling-class selector

```java
// ANTI-PATTERN
driver.findElement(By.cssSelector(".btn-primary.MuiButton-root")).click();
```

```ts
// CANONICAL
await page.getByRole('button', { name: 'Continue' }).click();
```

Rationale: styling-class coupling.

#### 1.3.4 `WebDriverWait` boilerplate per element

```java
// ANTI-PATTERN
WebDriverWait wait = new WebDriverWait(driver, Duration.ofSeconds(10));
WebElement el = wait.until(ExpectedConditions.elementToBeClickable(By.id("submit")));
el.click();
```

```ts
// CANONICAL — auto-wait is built-in
await page.getByRole('button', { name: 'Submit' }).click();
```

Rationale: Playwright actions auto-wait for actionability. Explicit waits create noise. If timeout-tuning is needed, set `actionTimeout` at config level.

#### 1.3.5 Page Object inheritance with hidden state (`BasePage` god class)

```java
// ANTI-PATTERN
public class LoginPage extends BasePage {
  // BasePage has 200 methods, half are stateful
}
```

```ts
// CANONICAL — composition over inheritance
export class LoginPage {
  readonly emailField = this.page.getByLabel('Email');
  readonly submitButton = this.page.getByRole('button', { name: 'Sign in' });
  constructor(private readonly page: Page) {}

  async login(email: string, password: string) {
    await this.emailField.fill(email);
    await this.page.getByLabel('Password').fill(password);
    await this.submitButton.click();
  }
}
```

Rationale: deep inheritance hides where state mutates. Composition is greppable.

#### 1.3.6 `Actions` class for simple operations

```java
// ANTI-PATTERN
new Actions(driver).moveToElement(menu).click(item).perform();
```

```ts
// CANONICAL
await page.getByRole('button', { name: 'File menu' }).hover();
await page.getByRole('menuitem', { name: 'Save' }).click();
```

Rationale: `Actions` chains are imperative pixel-math. Role-based locators describe intent.

#### 1.3.7 `driver.findElements(...).get(0)` instead of `.first()`

```java
// ANTI-PATTERN — throws on empty list
WebElement first = driver.findElements(By.cssSelector(".item")).get(0);
```

```ts
// CANONICAL
await expect(page.getByRole('listitem')).toHaveCount(1);
await page.getByRole('listitem').first().click();
```

Rationale: assert count before clicking — surfaces the "no items" bug instead of `IndexOutOfBoundsException`.

#### 1.3.8 `try { ... } catch (NoSuchElementException e) { return false; }`

```java
// ANTI-PATTERN
public boolean isErrorShown() {
  try {
    driver.findElement(By.cssSelector(".error"));
    return true;
  } catch (NoSuchElementException e) {
    return false;
  }
}
```

```ts
// CANONICAL
await expect(page.getByRole('alert')).toBeVisible();
```

Rationale: exception-as-flow-control hides the real check. Web-first assertions are explicit.

#### 1.3.9 `@Test(dependsOnMethods = ...)` TestNG ordering

```java
// ANTI-PATTERN
@Test public void createUser() { /* ... */ }
@Test(dependsOnMethods = "createUser") public void loginAsUser() { /* ... */ }
```

```ts
// CANONICAL — independent tests, each seeds via fixture
test('login flow', async ({ page, freshUser }) => {
  await login(page, freshUser);
});
```

Rationale: ordering coupling breaks parallel sharding.

#### 1.3.10 `assertTrue(driver.getCurrentUrl().contains("/dashboard"))`

```java
// ANTI-PATTERN
assertTrue(driver.getCurrentUrl().contains("/dashboard"));
```

```ts
// CANONICAL — web-first URL assertion
await expect(page).toHaveURL(/\/dashboard/);
```

Rationale: web-first version polls; the assertTrue version is a one-shot snapshot.

#### 1.3.11 Hardcoded timeouts via `implicitlyWait`

```java
// ANTI-PATTERN
driver.manage().timeouts().implicitlyWait(Duration.ofSeconds(10));
```

```ts
// CANONICAL — configure at project level
// playwright.config.ts
use: { actionTimeout: 10_000 }
```

Rationale: implicit wait silently affects every `findElement` call — surprising for new contributors. Config keeps it visible.

#### 1.3.12 `driver.quit()` in `@AfterEach` (Playwright closes per-test)

```java
// ANTI-PATTERN — manual teardown
@AfterEach void close() { driver.quit(); }
```

```ts
// CANONICAL — Playwright closes the browser context per test automatically
test('no manual teardown needed', async ({ page }) => { /* ... */ });
```

Rationale: `{ page }` fixture is already worker-scoped + auto-disposed. Manual cleanup risks double-close errors.

#### 1.3.13 JavaScript Executor for click (workaround)

```java
// ANTI-PATTERN
((JavascriptExecutor) driver).executeScript("arguments[0].click();", el);
```

```ts
// CANONICAL — investigate why normal click failed
await expect(page.getByRole('button', { name: 'Save' })).toBeEnabled();
await page.getByRole('button', { name: 'Save' }).click();
```

Rationale: JS-executor click bypasses pointer-event checks, hiding modal-overlay bugs.

#### 1.3.14 PageFactory `@FindBy` with `initElements` (eager-init + stale-element risk)

```java
// ANTI-PATTERN
public class LoginPage extends BasePage {
  @FindBy(id = "email") private WebElement emailInput;
  @FindBy(css = "button.next-step") private WebElement nextButton;

  public LoginPage(WebDriver driver) {
    PageFactory.initElements(driver, this);
  }
}
```

```ts
// CANONICAL — Playwright POM uses LAZY locators
export class LoginPage {
  readonly emailField = this.page.getByLabel('Email');
  readonly nextButton = this.page.getByRole('button', { name: 'Next' });
  constructor(private readonly page: Page) {}
}
```

Rationale: PageFactory's `initElements` is the Selenium-only proxy-wrapper trick. It eagerly resolves locators at POM construction, which then causes `StaleElementReferenceException` after any DOM re-render. Playwright `Locator` objects are LAZY — they re-resolve on every call — so this entire failure mode disappears. The `@FindBy` annotations also force locator strategy into Java metadata, making them un-greppable from a TS migration. Translation: each `@FindBy(id = "x")` becomes a `readonly` Locator field; choose the highest-priority locator strategy per `migration-rules.md` §5 (role > label > placeholder > text > testid > css). Never preserve the eager-init pattern.

#### 1.3.15 `ExpectedConditions` ceremony for every wait

```java
// ANTI-PATTERN
wait.until(ExpectedConditions.visibilityOfElementLocated(By.cssSelector(".x")));
wait.until(ExpectedConditions.elementToBeClickable(By.id("submit")));
wait.until(ExpectedConditions.textToBePresentInElementLocated(By.cssSelector(".banner"), "Hi"));
wait.until(ExpectedConditions.urlContains("/dashboard"));
wait.until(ExpectedConditions.titleContains("Home"));
wait.until(ExpectedConditions.invisibilityOfElementLocated(By.cssSelector(".spinner")));
```

```ts
// CANONICAL — each EC maps to a single web-first matcher
await expect(page.locator('.x')).toBeVisible();
// .toBeClickable is built into action auto-wait — just call .click()
await expect(page.getByText('Hi')).toBeVisible();
await expect(page).toHaveURL(/\/dashboard/);
await expect(page).toHaveTitle(/Home/);
await expect(page.locator('.spinner')).toBeHidden();
```

Rationale: every `ExpectedConditions.*` predicate has a direct Playwright matcher equivalent. The Selenium version requires constructing a `WebDriverWait`, picking the right `EC.*` static method, passing a `By` locator, and `.until()`-chaining — five-line ceremony for what is `await expect(...).toBeVisible()` in Playwright. The "boilerplate per element" entry (1.3.4) covers the basic case; this entry catalogs the FULL translation table for the migration's anti-pattern detector. Full mapping table also lives in §2.2.

#### 1.3.16 `ThreadLocal<WebDriver>` driver provider (parallel-runner accommodation)

```java
// ANTI-PATTERN
public final class WebDriverConfig {
  private static final ThreadLocal<WebDriver> DRIVER = new ThreadLocal<>();
  public static WebDriver getDriver() {
    if (DRIVER.get() == null) {
      DRIVER.set(new ChromeDriver());
    }
    return DRIVER.get();
  }
  public static void quit() {
    DRIVER.get().quit();
    DRIVER.remove();
  }
}
```

```ts
// CANONICAL — Playwright workers each own their browser context
test('parallel-safe by default', async ({ page }) => { /* ... */ });
// playwright.config.ts:
// workers: process.env.CI ? 2 : '50%', fullyParallel: true
```

Rationale: ThreadLocal driver is the Selenium accommodation for parallel JUnit/TestNG runners that share a JVM and thus must isolate driver instances per thread. Playwright runs each test worker as a SEPARATE process — each worker gets its own browser, context, and `page` fixture, with zero shared state. The ThreadLocal pattern is therefore not just unnecessary, it actively misleads contributors into thinking parallel safety is something they must implement. Delete the whole class; configure parallelism via `playwright.config.ts` `workers` and `fullyParallel` instead.

---

### 1.4 Selenium WebDriver (Python) anti-patterns

#### 1.4.1 `time.sleep(N)` hard wait

```python
# ANTI-PATTERN
driver.find_element(By.ID, "submit").click()
time.sleep(3)
assert driver.find_element(By.CSS_SELECTOR, ".success").is_displayed()
```

```ts
// CANONICAL — Playwright TypeScript
await page.getByRole('button', { name: 'Submit' }).click();
await expect(page.getByText('Success')).toBeVisible();
```

#### 1.4.2 `By.XPATH, "//div[3]"` positional XPath

```python
# ANTI-PATTERN
driver.find_element(By.XPATH, "//ul[@id='items']/li[3]/button").click()
```

```ts
// CANONICAL
await page.getByRole('listitem', { name: 'Q3 forecast' })
  .getByRole('button', { name: 'Edit' })
  .click();
```

#### 1.4.3 `By.CSS_SELECTOR, ".btn-primary"` styling-class

```python
# ANTI-PATTERN
driver.find_element(By.CSS_SELECTOR, ".btn-primary").click()
```

```ts
// CANONICAL
await page.getByRole('button', { name: 'Continue' }).click();
```

#### 1.4.4 `WebDriverWait` ceremony

```python
# ANTI-PATTERN
wait = WebDriverWait(driver, 10)
el = wait.until(EC.element_to_be_clickable((By.ID, "submit")))
el.click()
```

```ts
// CANONICAL
await page.getByRole('button', { name: 'Submit' }).click();
```

#### 1.4.5 Hand-rolled pytest fixtures duplicating page setup

```python
# ANTI-PATTERN
@pytest.fixture
def driver():
    d = webdriver.Chrome()
    d.implicitly_wait(10)
    yield d
    d.quit()
```

```ts
// CANONICAL — Playwright provides `page` fixture for free
test('uses framework-provided page fixture', async ({ page }) => { /* ... */ });
```

#### 1.4.6 `assert "Welcome" in driver.page_source`

```python
# ANTI-PATTERN
assert "Welcome" in driver.page_source
```

```ts
// CANONICAL — semantic, polled
await expect(page.getByRole('heading', { name: 'Welcome' })).toBeVisible();
```

Rationale: `page_source` matches text in script tags, CSS, hidden divs. Role-based assertion targets only what the user sees.

#### 1.4.7 `ActionChains(driver).move_to_element(menu).click(item).perform()`

```python
# ANTI-PATTERN
ActionChains(driver).move_to_element(menu).click(item).perform()
```

```ts
// CANONICAL
await page.getByRole('button', { name: 'File menu' }).hover();
await page.getByRole('menuitem', { name: 'Save' }).click();
```

#### 1.4.8 `try: el = driver.find_element(...); return True; except: return False`

```python
# ANTI-PATTERN
def is_error_shown(driver):
    try:
        driver.find_element(By.CSS_SELECTOR, ".error")
        return True
    except NoSuchElementException:
        return False
```

```ts
// CANONICAL
await expect(page.getByRole('alert')).toBeVisible();
```

#### 1.4.9 `pytest.mark.skip` left as TODO

```python
# ANTI-PATTERN
@pytest.mark.skip(reason="flaky")
def test_checkout(): ...
```

```ts
// CANONICAL — either fix or delete
test.fixme('checkout has known flake — JIRA-1234', async ({ page }) => { /* ... */ });
```

Rationale: `test.fixme` carries the JIRA link forward so it doesn't rot. Bare `skip` becomes invisible debt.

#### 1.4.10 Selector polymorphism via string concat

```python
# ANTI-PATTERN
def find_row(driver, name):
    return driver.find_element(By.XPATH, f"//tr[td[text()='{name}']]")
```

```ts
// CANONICAL
await page.getByRole('row', { name }).click();
```

Rationale: f-string XPath risks injection-style breakage on names with quotes.

#### 1.4.11 Magic timeout constants

```python
# ANTI-PATTERN
TIMEOUT = 45  # used inconsistently across files
```

```ts
// CANONICAL — config-level
// playwright.config.ts
use: { actionTimeout: 10_000, navigationTimeout: 30_000 }
```

#### 1.4.12 `driver.get(url)` with hardcoded environment

```python
# ANTI-PATTERN
driver.get("https://staging.example.com/login")
```

```ts
// CANONICAL — baseURL + relative path
// playwright.config.ts: use: { baseURL: process.env.APP_BASE_URL }
await page.goto('/login');
```

#### 1.4.13 `assert el.text == "Welcome"` direct equality on text

```python
# ANTI-PATTERN
assert el.text == "Welcome"
```

```ts
// CANONICAL
await expect(page.getByRole('heading', { name: 'Welcome' })).toBeVisible();
```

Rationale: direct text equality strips whitespace differences inconsistently across Selenium versions.

#### 1.4.14 Class-based `setup_class` / `teardown_class` sharing one driver across methods

```python
# ANTI-PATTERN
class BaseTest:
    @classmethod
    def setup_class(cls):
        cls.driver = webdriver.Chrome()

    @classmethod
    def teardown_class(cls):
        cls.driver.quit()

class TestUsers(BaseTest):
    def setup_method(self):
        self.driver.get("/users")

    def test_a(self): ...
    def test_b(self): ...   # inherits DOM state from test_a
```

```ts
// CANONICAL — each test gets a fresh `page` (no inherited DOM state)
test.describe('users', () => {
  test.beforeEach(async ({ page }) => { await page.goto('/users'); });
  test('a', async ({ page }) => { /* ... */ });
  test('b', async ({ page }) => { /* fresh page — no leak from "a" */ });
});
```

Rationale: `setup_class` allocates one driver per CLASS, then every test method in the class shares it. Each method inherits the previous method's URL state, cookies, scroll position, and DOM mutations. This is the single largest source of order-dependent pytest flakes in Selenium suites — tests pass in isolation but fail when run together (or in a different order). Playwright's `page` fixture is test-scoped: every test gets a fresh `BrowserContext` + `Page`, with isolation guaranteed. Translation: delete the `BaseTest` class; replace `setup_method` with `test.beforeEach`; replace inheritance with the `page` fixture.

#### 1.4.15 `body.send_keys(Keys.ESCAPE)` for keyboard events

```python
# ANTI-PATTERN
body = driver.find_element(By.TAG_NAME, "body")
body.send_keys(Keys.ESCAPE)
```

```ts
// CANONICAL — page-level keyboard API
await page.keyboard.press('Escape');
```

Rationale: Selenium dispatches keys through the `<body>` element as a workaround because there is no `driver.press_key()` API at the document level. Playwright has `page.keyboard.press()` and `page.keyboard.type()` — these dispatch at the document level and respect the currently-focused element. The Selenium pattern also breaks when the focused element traps `keydown` (some modal libraries call `e.preventDefault()` on body-level Escape), where the Playwright API correctly hits the actual focus target. Same applies to `Keys.ENTER`, `Keys.TAB`, etc.

#### 1.4.16 `driver.implicitly_wait(N)` global timeout

```python
# ANTI-PATTERN
@pytest.fixture
def driver():
    drv = webdriver.Chrome()
    drv.implicitly_wait(10)   # silently affects every find_element
    yield drv
    drv.quit()
```

```ts
// CANONICAL — configure at project level
// playwright.config.ts
export default defineConfig({
  use: { actionTimeout: 10_000 },
  expect: { timeout: 5_000 },
});
```

Rationale: `implicitly_wait` silently affects every `find_element` call in the session — including ones that are CHECKING FOR ABSENCE (e.g. "the error banner is not there"). With `implicitly_wait(10)`, a `find_elements()` returning an empty list takes 10 seconds. Playwright's auto-retry is per-assertion and explicit (`actionTimeout`, `expect timeout`, per-call timeout override). The mental model is also different: Playwright's matchers KNOW about negation (`expect(...).not.toBeVisible()`), so absence checks are fast. Delete the global implicit wait; configure timeouts at project level for visibility.

#### 1.4.17 `driver.find_elements(...)[i]` / `len(driver.find_elements(...))` snapshot-list indexing

```python
# ANTI-PATTERN
cards = driver.find_elements(By.CSS_SELECTOR, ".kpi-card")
team_card = cards[0]
assert len(driver.find_elements(By.CSS_SELECTOR, ".modal-overlay")) == 0
```

```ts
// CANONICAL — pick by accessible name; assert on the locator itself
const teamCard = page.getByRole('region', { name: 'Team members' });
await expect(page.getByRole('dialog')).toBeHidden();
```

Rationale: Python's mirror of Java's KB-1.3.7. `find_elements(...)` returns a snapshot LIST at call time. Indexing `[0]` or counting via `len()` races against ANY UI change between the call and the read. Playwright `Locator` objects are LAZY and auto-retrying — `expect(locator).toHaveCount(N)` polls until match, and `getByRole(...)` with an accessible name eliminates the need to pick by position. If position is genuinely the only differentiator, `locator.nth(i)` exists but should be flagged as LOW confidence and reviewed.

#### 1.4.18 `driver.execute_script("return document.querySelector(...)")` JS-bridge state probe

```python
# ANTI-PATTERN
is_loaded = driver.execute_script("return window.app && window.app.loaded === true;")
assert is_loaded
```

```ts
// CANONICAL — wait for the user-visible signal that proves load
await expect(page.getByRole('heading', { name: /dashboard/i })).toBeVisible();
```

Rationale: `execute_script` reaches past WebDriver's API and probes the page's JS runtime directly. Tests pass when `window.app.loaded` is true but the visible UI hasn't actually rendered (asynchronous flush gap). Worse: the probe is invisible at code-review time — readers see `assert is_loaded` and don't know it's a JS-runtime read. Playwright's web-first assertions wait for what the user sees. Prevents `JsRuntimeProbeRaceUI` bug class.

#### 1.4.19 `@pytest.fixture(scope="session")` for the WebDriver

```python
# ANTI-PATTERN
@pytest.fixture(scope="session")
def driver():
    drv = webdriver.Chrome()
    yield drv
    drv.quit()
```

```ts
// CANONICAL — Playwright defaults to fresh BrowserContext per test
// playwright.config.ts: nothing special needed.
test('isolated by default', async ({ page }) => { /* fresh */ });
```

Rationale: `scope="session"` allocates one driver for the whole pytest session — every test shares cookies, localStorage, and (often) URL state. Parallel `pytest-xdist` workers each get their own session, but inside a worker tests still pollute each other. Playwright's per-test `page` fixture is the right default. Translation: change `scope="session"` to `scope="function"` (or drop the fixture entirely and use Playwright's built-in). Prevents `SessionScopedDriverPollution` bug class.

#### 1.4.20 `webdriver-manager` auto-installer in test code

```python
# ANTI-PATTERN
from webdriver_manager.chrome import ChromeDriverManager
from selenium.webdriver.chrome.service import Service

driver = webdriver.Chrome(service=Service(ChromeDriverManager().install()))
```

```ts
// CANONICAL — Playwright bundles its own browser binary management
// $ npx playwright install chromium  (one-time, before CI runs)
// In tests: just `await chromium.launch()` — no installer code.
```

Rationale: `webdriver-manager` reaches out to chromedriver.storage.googleapis.com on every test run. Network blip → flaky test that fails with a misleading "WebDriver init error" instead of "test assertion failed". Playwright separates browser provisioning (`npx playwright install`) from test execution. Prevents `WebDriverInstallerNetworkFlake` bug class.

#### 1.4.21 `driver.window_handles[-1]` for new-tab switching

```python
# ANTI-PATTERN
driver.find_element(By.LINK_TEXT, "Open in new tab").click()
driver.switch_to.window(driver.window_handles[-1])
assert "details" in driver.current_url
```

```ts
// CANONICAL — explicit Playwright pattern with waitForEvent
const newPagePromise = page.context().waitForEvent('page');
await page.getByRole('link', { name: /open in new tab/i }).click();
const newPage = await newPagePromise;
await newPage.waitForLoadState();
await expect(newPage).toHaveURL(/\/details/);
```

Rationale: `window_handles[-1]` assumes the new tab opened last in the list — true in single-action tests but unreliable when the SUT opens auxiliary popups (analytics, chat widget). Playwright `context.waitForEvent('page')` synchronizes on the exact new page event. Prevents `TabHandleArrayRace` bug class.

#### 1.3.17 `driver.switchTo().frame(0)` index-based frame selection

```java
// ANTI-PATTERN
driver.switchTo().frame(0);
driver.findElement(By.id("widget-input")).sendKeys("hello");
driver.switchTo().defaultContent();
```

```ts
// CANONICAL — frame by name attribute, no manual context switching
const widgetFrame = page.frameLocator('iframe[name="widget"]');
await widgetFrame.getByLabel('Widget input').fill('hello');
```

Rationale: `frame(0)` picks the first iframe in document order — adds a hidden tracking iframe ahead of the real one and the test silently targets the tracker. Playwright `frameLocator` requires an explicit selector and supports auto-waiting/retry inside the frame just like top-level locators. Prevents `IndexedFrameDriftPicker` bug class.

#### 1.3.18 `driver.switchTo().alert().accept()` without race protection

```java
// ANTI-PATTERN
driver.findElement(By.id("delete")).click();
driver.switchTo().alert().accept();   // throws NoAlertPresentException if alert hasn't fired yet
```

```ts
// CANONICAL — register the dialog handler BEFORE the action
page.once('dialog', async (dialog) => {
  expect(dialog.message()).toMatch(/are you sure/i);
  await dialog.accept();
});
await page.getByRole('button', { name: 'Delete' }).click();
```

Rationale: `switchTo().alert()` is synchronous — if the alert hasn't fired by the time it runs (race with click handler), Selenium throws and the test fails with no useful info. Playwright's `page.on('dialog')` is a registered handler that fires whenever a dialog appears, so the listener is in place before the click can trigger it. Prevents `AlertRaceFlake` bug class.

#### 1.3.19 `By.linkText("Click here")` exact-match link locator

```java
// ANTI-PATTERN
driver.findElement(By.linkText("Click here")).click();
```

```ts
// CANONICAL
await page.getByRole('link', { name: 'Click here' }).click();
```

Rationale: `By.linkText` requires the visible text to match exactly, including casing and whitespace. Designers update copy from "Click here" to "Click here →" (added arrow) → test breaks at the locator level, not at the assertion level. `getByRole('link', { name })` normalizes accessible names. Prevents `LinkTextExactCopyDrift` bug class.

#### 1.3.20 `driver.manage().window().setSize(new Dimension(...))` per-test viewport

```java
// ANTI-PATTERN
driver.manage().window().setSize(new Dimension(1366, 768));
driver.get("/products");
```

```ts
// CANONICAL — viewport at project level, never in test code
// playwright.config.ts
projects: [
  { name: 'desktop', use: { viewport: { width: 1366, height: 768 } } },
  { name: 'tablet', use: { ...devices['iPad Pro 11'] } },
],
```

Rationale: per-test `setSize` couples the test to a hardcoded resolution. Adding a mobile breakpoint means editing every test; CI parallelism via different viewports becomes impossible. Playwright's project config separates dimension from behavior. Prevents `ViewportCodedInTest` bug class.

#### 1.3.21 `ChromeOptions options = new ChromeOptions(); options.addArguments("--headless")` in test code

```java
// ANTI-PATTERN — browser config sprinkled across tests
ChromeOptions options = new ChromeOptions();
options.addArguments("--headless=new", "--no-sandbox", "--disable-gpu");
WebDriver driver = new ChromeDriver(options);
```

```ts
// CANONICAL — launchOptions in playwright.config.ts
use: {
  launchOptions: {
    args: ['--disable-gpu'],
  },
  headless: process.env.CI ? true : false,
},
```

Rationale: distributing browser flags across test code creates drift — half the suite runs with one set, half with another. Playwright config centralizes launchOptions. Prevents `BrowserFlagsDriftAcrossSuite` bug class.

#### 1.3.22 `webElement.getCssValue("background-color")` style-coupled assertion

```java
// ANTI-PATTERN
String bgColor = button.getCssValue("background-color");
assertEquals("rgba(0, 128, 0, 1)", bgColor);
```

```ts
// CANONICAL — assert via data-state attribute or visible behavior
await expect(button).toHaveAttribute('data-variant', 'success');
// OR if CSS truly is the assertion target:
await expect(button).toHaveCSS('background-color', 'rgb(0, 128, 0)');
```

Rationale: CSS values vary by browser rendering (`rgba(...)` vs `rgb(...)`, alpha presence/absence) and by design-system updates. Asserting visible state through semantics (data attributes, accessible name) survives styling refactors. Prevents `CSSValueBrowserDrift` bug class.

#### 1.3.23 `driver.manage().getCookies().stream().filter(...).findFirst()` cookie inspection in test

```java
// ANTI-PATTERN — test reads auth cookie to verify login worked
Set<Cookie> cookies = driver.manage().getCookies();
Cookie sessionCookie = cookies.stream()
    .filter(c -> c.getName().equals("session"))
    .findFirst().orElseThrow();
assertNotNull(sessionCookie.getValue());
```

```ts
// CANONICAL — assert visible authenticated state
await expect(page.getByText(/welcome.*admin/i)).toBeVisible();
// If cookies truly are the contract (rare — usually they're an impl detail):
const cookies = await page.context().cookies();
expect(cookies.some((c) => c.name === 'session')).toBe(true);
```

Rationale: reading auth cookies couples the test to the auth scheme (session vs JWT vs OAuth) — refactoring auth breaks the test even though the UX is identical. Assert on what the user sees. Prevents `AuthCookieSchemeCoupling` bug class.

#### 1.3.24 `((JavascriptExecutor) driver).executeScript("arguments[0].scrollIntoView();", el)` scroll-into-view

```java
// ANTI-PATTERN
WebElement target = driver.findElement(By.id("footer-link"));
((JavascriptExecutor) driver).executeScript("arguments[0].scrollIntoView();", target);
target.click();
```

```ts
// CANONICAL — Playwright auto-scrolls on action
await page.getByRole('link', { name: 'Privacy policy' }).click();
// If explicit scroll is needed (e.g., to lazy-load content):
await page.getByText('Privacy policy').scrollIntoViewIfNeeded();
```

Rationale: `scrollIntoView` via JS bypasses the actionability checks; if a sticky header is covering the element, the JS scroll moves it under the header and the click silently misses. Playwright's `.click()` auto-scrolls AND auto-checks visibility AND retries. Prevents `JsScrollMissedActionability` bug class.

#### 1.3.25 `WebDriverManager.chromedriver().setup()` browser-binary auto-installer

```java
// ANTI-PATTERN
WebDriverManager.chromedriver().setup();
WebDriver driver = new ChromeDriver();
```

```ts
// CANONICAL — Playwright separates provisioning from execution
// $ npx playwright install chromium  (once, before suite ever runs)
// In tests: chromium is bundled; no installer call needed.
import { test } from '@playwright/test';
```

Rationale: `WebDriverManager` reaches out to a binary registry on every test run to download/verify the matching ChromeDriver. Network blip → flaky test that fails with a misleading "WebDriver init error" instead of "test assertion failed". Java counterpart of KB-1.4.20 (Python `webdriver-manager`); both collapse to `sel/fixture/binary-installer-in-test` under the new namespace scheme. Playwright fetches browsers up-front and pins them per `@playwright/test` version. Prevents `WebDriverInstallerNetworkFlake` bug class.

#### 1.4.22 `driver.set_page_load_timeout(N)` driver-level page-load timeout

```python
# ANTI-PATTERN
driver = webdriver.Chrome()
driver.set_page_load_timeout(60)
driver.get("/slow-route")
```

```ts
// CANONICAL — per-call timeout, discoverable at call site
await page.goto('/slow-route', { timeout: 60000 });
// OR project-wide:
// playwright.config.ts: use: { navigationTimeout: 60000 }
```

Rationale: driver-level timeouts mutate global state — every subsequent `driver.get` inherits 60s even when the test author meant just one slow route. Per-call timeouts document intent at the call site. Prevents `GlobalTimeoutMutationLeak` bug class.

#### 1.4.23 `driver.maximize_window()` viewport coupling

```python
# ANTI-PATTERN
driver.maximize_window()
driver.get("/dashboard")
```

```ts
// CANONICAL — explicit, deterministic, in project config
// playwright.config.ts
use: { viewport: { width: 1920, height: 1080 } },
```

Rationale: `maximize_window` produces whatever the local display can offer — your laptop gets 1440×900, CI runner gets 1024×768, tester's external monitor gets 3840×2160. Tests pass on one resolution and fail on another for visibility-cutoff reasons that have nothing to do with the SUT. Prevents `MaximizeWindowEnvDrift` bug class.

#### 1.4.24 `urllib.parse.urlparse(driver.current_url).path` URL string parsing

```python
# ANTI-PATTERN
from urllib.parse import urlparse
path = urlparse(driver.current_url).path
assert path.startswith("/orders/")
```

```ts
// CANONICAL — Playwright expect handles URL matching with regex
await expect(page).toHaveURL(/\/orders\//);
```

Rationale: pulling the URL into Python's `urlparse` skips Playwright's polling — the assertion runs once on the current state instead of waiting for the navigation to settle. `expect(page).toHaveURL()` waits for the URL to match. Prevents `UrlParseSyncSnapshot` bug class.

#### 1.4.25 `element.get_attribute("aria-label")` raw attribute extraction for assertion

```python
# ANTI-PATTERN
button = driver.find_element(By.CSS_SELECTOR, "button.close")
assert button.get_attribute("aria-label") == "Close dialog"
```

```ts
// CANONICAL — accessibility-first assertion
await expect(page.getByRole('button', { name: 'Close dialog' })).toBeVisible();
// OR if asserting on attribute is truly the contract:
await expect(page.getByRole('button', { name: 'Close dialog' }))
  .toHaveAccessibleName('Close dialog');
```

Rationale: extracting `aria-label` to compare manually skips Playwright's accessibility-aware retry. `getByRole(role, { name })` resolves the same accessible name via the proper a11y tree (handles aria-label, aria-labelledby, textContent, alt — all the sources screen readers use). Prevents `RawAttributeBypassA11yTree` bug class.

#### 1.4.26 `chromedriver_autoinstaller.install()` per-run installer

```python
# ANTI-PATTERN
import chromedriver_autoinstaller
chromedriver_autoinstaller.install()  # downloads on every test run
driver = webdriver.Chrome()
```

```ts
// CANONICAL — Playwright separates browser install (one-time) from test run
// $ npx playwright install chromium  (once, before suite ever runs)
// In tests, just import chromium and launch.
```

Rationale: `chromedriver_autoinstaller` makes test startup non-deterministic — network calls to fetch the matching chromedriver introduce a flake source unrelated to the SUT. Playwright fetches browsers up-front and pins them per `@playwright/test` version. Prevents `PerRunInstallerFlake` bug class.

---

## 2. Framework → Playwright TypeScript translation tables

### 2.1 Cypress → Playwright

| SOURCE IDIOM | PLAYWRIGHT REPLACEMENT | NOTES |
|---|---|---|
| `cy.visit('/login')` | `await page.goto('/login')` | Use `baseURL` in config. |
| `cy.get('#id')` | `page.locator('#id')` | Prefer `getByRole`/`getByLabel` first. |
| `cy.get('[data-cy=foo]')` | `page.getByTestId('foo')` | Set `testIdAttribute: 'data-cy'` in `use` config. |
| `cy.contains('Submit')` | `page.getByText('Submit')` or `page.getByRole('button', { name: 'Submit' })` | Choose based on element type. |
| `cy.contains('Submit', { matchCase: false })` | `page.getByText(/submit/i)` | Use regex flag. |
| `cy.get('input').type('hello')` | `await page.getByRole('textbox').fill('hello')` | `fill` is faster; use `pressSequentially` to simulate keystrokes. |
| `cy.get('button').click()` | `await page.getByRole('button').click()` | |
| `cy.get('button').click({ force: true })` | `await locator.click({ force: true })` | Avoid — diagnose first. |
| `cy.get('a').dblclick()` | `await locator.dblclick()` | |
| `cy.get('a').rightclick()` | `await locator.click({ button: 'right' })` | |
| `cy.get('input').clear()` | `await locator.clear()` or `locator.fill('')` | |
| `cy.get('select').select('Pro')` | `await page.getByRole('combobox').selectOption('Pro')` | |
| `cy.get('input[type=file]').selectFile('a.csv')` | `await page.getByLabel('Upload').setInputFiles('a.csv')` | |
| `cy.get('input[type=checkbox]').check()` | `await locator.check()` | |
| `cy.get('.modal').should('be.visible')` | `await expect(page.getByRole('dialog')).toBeVisible()` | |
| `cy.get('.x').should('not.exist')` | `await expect(locator).toHaveCount(0)` | |
| `cy.get('.x').should('contain', 'Hi')` | `await expect(locator).toContainText('Hi')` | |
| `cy.get('.x').should('have.value', 'a')` | `await expect(locator).toHaveValue('a')` | |
| `cy.get('.x').should('have.attr', 'href', '/y')` | `await expect(locator).toHaveAttribute('href', '/y')` | |
| `cy.get('.x').should('have.class', 'active')` | `await expect(locator).toHaveClass(/active/)` | |
| `cy.url().should('include', '/dash')` | `await expect(page).toHaveURL(/\/dash/)` | |
| `cy.title().should('eq', 'Home')` | `await expect(page).toHaveTitle('Home')` | |
| `cy.wait(1000)` | `await expect(condition).toPass()` | Eliminate — replace with web-first wait. |
| `cy.wait('@alias')` | `await page.waitForResponse(p => p.url().includes('/api/x'))` | |
| `cy.intercept('GET', '/api/x', { fixture: 'x.json' })` | `await page.route('**/api/x', r => r.fulfill({ path: 'x.json' }))` | |
| `cy.intercept('POST', '/api/x').as('post')` | Use `waitForRequest` for observation, `route` for stubbing. | |
| `cy.fixture('users.json')` | `import users from './fixtures/users.json'` | Or typed factory. |
| `cy.viewport(1366, 768)` | Set in `projects[].use.viewport` | |
| `cy.viewport('iphone-x')` | `use: { ...devices['iPhone 14'] }` | |
| `cy.session(name, setup)` | `storageState` + `auth.setup.ts` | See [auth docs](https://playwright.dev/docs/auth). |
| `cy.task('db:seed', data)` | `await request.post('/test-helpers/seed', { data })` | Or call DB directly from a `globalSetup`. |
| `cy.exec('npm run seed')` | `globalSetup` with `child_process.execSync` | |
| `Cypress.env('FOO')` | `process.env.FOO` | Or `test.info().project.use.foo`. |
| `cy.screenshot()` | `await page.screenshot({ path })` | Or use `use: { screenshot: 'only-on-failure' }`. |
| `cy.log('msg')` | `console.log` or `test.info().annotations.push(...)` | |
| `cy.window().its('foo')` | `await page.evaluate(() => (window as any).foo)` | |
| `cy.then((subj) => { ... })` | `await` + flat code | No queue model. |
| `Cypress.Commands.add('login', ...)` | `test.extend<{ login: ... }>({ login: async (...) => ... })` | Fixture. |
| `cy.get('iframe').then($i => cy.wrap($i.contents().find('button')).click())` | `await page.frameLocator('iframe').getByRole('button').click()` | |
| `cy.scrollTo('bottom')` | `await page.mouse.wheel(0, 10000)` or `locator.scrollIntoViewIfNeeded()` | |

### 2.2 Selenium Java → Playwright TypeScript

| SOURCE IDIOM | PLAYWRIGHT REPLACEMENT | NOTES |
|---|---|---|
| `driver.get(url)` | `await page.goto(url)` | |
| `driver.findElement(By.id("x"))` | `page.locator('#x')` | Prefer role-based. |
| `driver.findElement(By.cssSelector(".y"))` | `page.locator('.y')` | Prefer role-based. |
| `driver.findElement(By.xpath("//div"))` | `page.locator('xpath=//div')` or `page.locator('div')` | |
| `driver.findElement(By.name("email"))` | `page.locator('[name="email"]')` or `getByLabel(...)` | |
| `driver.findElement(By.linkText("Home"))` | `page.getByRole('link', { name: 'Home' })` | |
| `driver.findElement(By.partialLinkText("Hom"))` | `page.getByRole('link', { name: /Hom/ })` | |
| `driver.findElements(By.cssSelector(".x"))` | `page.locator('.x')` | Returns `Locator`, not list. |
| `driver.findElements(...).get(0)` | `page.locator('.x').first()` | Live locator vs snapshot. |
| `driver.findElements(...).size()` | `await page.locator('.x').count()` | |
| `el.click()` | `await locator.click()` | |
| `el.sendKeys("hi")` | `await locator.fill('hi')` | Or `pressSequentially`. |
| `el.clear()` | `await locator.clear()` | |
| `el.getText()` | `await locator.innerText()` | Or `await locator.textContent()`. |
| `el.getAttribute("href")` | `await locator.getAttribute('href')` | |
| `el.isDisplayed()` | `await expect(locator).toBeVisible()` | |
| `el.isEnabled()` | `await expect(locator).toBeEnabled()` | |
| `el.isSelected()` | `await expect(locator).toBeChecked()` | |
| `new Select(el).selectByVisibleText("Pro")` | `await locator.selectOption({ label: 'Pro' })` | |
| `new Actions(driver).moveToElement(el).perform()` | `await locator.hover()` | |
| `new Actions(driver).dragAndDrop(a, b).perform()` | `await a.dragTo(b)` | |
| `new Actions(driver).keyDown(Keys.CONTROL).click(el)...perform()` | `await locator.click({ modifiers: ['Control'] })` | |
| `new WebDriverWait(driver, 10).until(EC.visibilityOf(el))` | `await expect(locator).toBeVisible({ timeout: 10_000 })` | |
| `new WebDriverWait(...).until(EC.elementToBeClickable(...))` | Built into `click()` auto-wait. | |
| `EC.titleContains("Home")` | `await expect(page).toHaveTitle(/Home/)` | |
| `EC.urlContains("/dash")` | `await expect(page).toHaveURL(/\/dash/)` | |
| `driver.switchTo().frame("f")` | `page.frameLocator('iframe[name="f"]')` | |
| `driver.switchTo().alert().accept()` | `page.on('dialog', d => d.accept())` | Set up BEFORE the action. |
| `driver.switchTo().window(handle)` | Use `context.on('page', …)` to get new tab. | |
| `((JavascriptExecutor) driver).executeScript("...")` | `await page.evaluate(() => ...)` | |
| `driver.manage().window().maximize()` | `viewport: null` in project use | Or set explicit viewport. |
| `driver.manage().deleteAllCookies()` | `await context.clearCookies()` | |
| `Thread.sleep(N)` | `await expect(locator).toBeVisible()` | Eliminate. |
| `assertEquals(a, b)` | `expect(a).toEqual(b)` | |
| `assertTrue(cond)` | `expect(cond).toBe(true)` | |
| `@BeforeEach setup()` | `test.beforeEach` or fixture | |
| `@AfterEach teardown()` | `test.afterEach` or fixture cleanup | |
| `@BeforeAll setupClass()` | `test.beforeAll` or worker-scoped fixture | |
| `@Test public void name()` | `test('name', async ({ page }) => { ... })` | |
| `@Disabled` | `test.skip` | |
| `@Tag("smoke")` | `test('name @smoke', ...)` + `--grep @smoke` | |
| `driver.quit()` | Automatic via fixture teardown. | |
| `@FindBy(id = "x") WebElement el` | `readonly el = page.getByLabel(...)` or `getByTestId('x')` | POM field; choose locator strategy per migration-rules §5. |
| `@FindBy(css = ".y") WebElement el` | `readonly el = page.getByRole(...)` | Never preserve CSS class; promote to role/label. |
| `@FindBy(how = How.XPATH, using = "//...")` | `readonly el = page.getByRole(...)` (high-priority) or `page.locator('xpath=//...')` (fallback) | XPath usually loses; flag as LOW confidence. |
| `PageFactory.initElements(driver, this)` | Drop. | Playwright locators are lazy; no init step needed. |
| `EC.elementToBeClickable(by)` | `await locator.click()` (auto-wait) | Click already waits for actionability. |
| `EC.textToBePresentInElementLocated(by, "X")` | `await expect(locator).toContainText('X')` | |
| `EC.textToBe(by, "X")` | `await expect(locator).toHaveText('X')` | |
| `EC.invisibilityOfElementLocated(by)` | `await expect(locator).toBeHidden()` | |
| `EC.presenceOfElementLocated(by)` | `await expect(locator).toBeAttached()` | `toBeAttached` waits for the node, not visibility. |
| `EC.numberOfElementsToBe(by, N)` | `await expect(locator).toHaveCount(N)` | |
| `EC.attributeToBe(by, "aria-expanded", "true")` | `await expect(locator).toHaveAttribute('aria-expanded', 'true')` | |
| `EC.stalenessOf(el)` | `await expect(locator).toBeHidden()` or re-resolve via `locator` | Locators are lazy — staleness is not a concept in Playwright. |
| `ThreadLocal<WebDriver> + getDriver()` | Drop. | Playwright workers each own a fresh context — parallel-safe by default. |
| `driver.manage().window().maximize()` | `viewport: { width, height }` at project level | Or omit; default 1280×720 covers most desktop tests. |
| `WebDriverManager.chromedriver().setup()` | Drop. | Playwright bundles browsers; managed by `npx playwright install`. |
| `JavaScriptExecutor + scrollIntoView` | `await locator.scrollIntoViewIfNeeded()` | Built-in; no JS executor needed. |

### 2.3 Selenium Python → Playwright TypeScript

| SOURCE IDIOM | PLAYWRIGHT REPLACEMENT | NOTES |
|---|---|---|
| `driver.get(url)` | `await page.goto(url)` | |
| `driver.find_element(By.ID, "x")` | `page.locator('#x')` | |
| `driver.find_element(By.CSS_SELECTOR, ".y")` | `page.locator('.y')` | |
| `driver.find_element(By.XPATH, "//div")` | `page.locator('xpath=//div')` | |
| `driver.find_element(By.NAME, "email")` | `page.locator('[name="email"]')` | |
| `driver.find_element(By.LINK_TEXT, "Home")` | `page.getByRole('link', { name: 'Home' })` | |
| `driver.find_element(By.PARTIAL_LINK_TEXT, "Hom")` | `page.getByRole('link', { name: /Hom/ })` | |
| `driver.find_elements(By.CSS_SELECTOR, ".x")` | `page.locator('.x')` | |
| `driver.find_elements(...)[0]` | `page.locator('.x').first()` | Live vs snapshot. |
| `len(driver.find_elements(...))` | `await page.locator('.x').count()` | |
| `el.click()` | `await locator.click()` | |
| `el.send_keys("hi")` | `await locator.fill('hi')` | |
| `el.send_keys(Keys.ENTER)` | `await locator.press('Enter')` | |
| `el.clear()` | `await locator.clear()` | |
| `el.text` | `await locator.innerText()` | |
| `el.get_attribute("href")` | `await locator.getAttribute('href')` | |
| `el.is_displayed()` | `await expect(locator).toBeVisible()` | |
| `el.is_enabled()` | `await expect(locator).toBeEnabled()` | |
| `el.is_selected()` | `await expect(locator).toBeChecked()` | |
| `Select(el).select_by_visible_text("Pro")` | `await locator.selectOption({ label: 'Pro' })` | |
| `ActionChains(driver).move_to_element(el).perform()` | `await locator.hover()` | |
| `ActionChains(driver).drag_and_drop(a, b).perform()` | `await a.dragTo(b)` | |
| `WebDriverWait(driver, 10).until(EC.visibility_of(el))` | `await expect(locator).toBeVisible({ timeout: 10_000 })` | |
| `WebDriverWait(...).until(EC.element_to_be_clickable(...))` | Built-in auto-wait. | |
| `EC.title_contains("Home")` | `await expect(page).toHaveTitle(/Home/)` | |
| `EC.url_contains("/dash")` | `await expect(page).toHaveURL(/\/dash/)` | |
| `driver.switch_to.frame("f")` | `page.frameLocator('iframe[name="f"]')` | |
| `driver.switch_to.alert.accept()` | `page.on('dialog', d => d.accept())` | |
| `driver.execute_script("return X")` | `await page.evaluate(() => X)` | |
| `driver.set_window_size(W, H)` | `await page.setViewportSize({ width: W, height: H })` | |
| `time.sleep(N)` | `await expect(...).toBeVisible()` | Eliminate. |
| `assert x == y` | `expect(x).toBe(y)` | |
| `@pytest.fixture def driver():` | Built-in `page` fixture. | |
| `@pytest.fixture(scope="session")` | Worker-scoped fixture (`{ scope: 'worker' }`). | |
| `def test_x(driver):` | `test('x', async ({ page }) => { ... })` | |
| `@pytest.mark.skip` | `test.skip(...)` | |
| `@pytest.mark.parametrize` | `for (const c of cases) { test(...) }` | |
| `class TestX(BaseTest): @classmethod setup_class(cls): cls.driver = ...` | `test.describe('x', () => { ... })` + `page` fixture | Per-test fresh context replaces shared class driver. |
| `class TestX: def setup_method(self): ...` | `test.beforeEach(async ({ page }) => { ... })` | |
| `class TestX: def teardown_method(self): ...` | `test.afterEach(async ({ page }) => { ... })` or fixture cleanup | |
| `body.send_keys(Keys.ESCAPE)` | `await page.keyboard.press('Escape')` | Page-level keyboard API; respects focused element. |
| `el.send_keys(Keys.TAB)` | `await locator.press('Tab')` | |
| `ActionChains(driver).context_click(el).perform()` | `await locator.click({ button: 'right' })` | |
| `driver.implicitly_wait(N)` | `actionTimeout` / `expect.timeout` at project config | Per-call timeouts available too. |
| `WebDriverWait(driver, N).until(EC.text_to_be_present_in_element_value((By.ID, "x"), "Y"))` | `await expect(page.locator('#x')).toHaveValue('Y')` | |
| `WebDriverWait(driver, N).until(EC.invisibility_of_element_located(...))` | `await expect(locator).toBeHidden()` | |
| `WebDriverWait(driver, N).until(EC.alert_is_present())` | `page.on('dialog', d => ...)` (register BEFORE the action) | |
| `driver.find_elements(...)[i]` | `page.getByRole(...).nth(i)` (last resort) or pick by accessible name | Never `[i]` in migrated code — flag as LOW confidence. |

### 2.4 Bad Playwright → Clean Playwright

| BAD IDIOM | CLEAN REPLACEMENT | NOTES |
|---|---|---|
| `await page.waitForTimeout(N)` | `await expect(locator).toBeVisible()` | Web-first wait. |
| `page.locator('button').nth(2)` | `page.getByRole('button', { name: 'X' })` | Eliminate index. |
| `page.locator('.btn-primary')` | `page.getByRole('button', { name: 'Continue' })` | Role-based. |
| `page.locator('xpath=//div[3]')` | `page.getByRole('region', { name: 'Sidebar' })` | |
| `await locator.click({ force: true })` | `await expect(locator).toBeEnabled()` then `click()` | Diagnose. |
| `expect(await locator.isVisible()).toBe(true)` | `await expect(locator).toBeVisible()` | Web-first. |
| `expect(await locator.textContent()).toContain('Hi')` | `await expect(locator).toContainText('Hi')` | |
| `expect(await locator.count()).toBe(3)` | `await expect(locator).toHaveCount(3)` | |
| `await page.locator('input').type('x')` | `await locator.fill('x')` | `type` is the slow keystroke simulator. |
| `page.pause()` | Remove. | Use trace viewer. |
| `test.only(...)` | `test(...)` | |
| `test.describe.only(...)` | `test.describe(...)` | |
| `await page.locator('a').click(); await page.waitForLoadState('networkidle')` | `await page.locator('a').click()` then web-first assert | `networkidle` is fragile with analytics beacons. |
| `await page.goto(url, { waitUntil: 'networkidle' })` | `await page.goto(url)` then web-first assert | |
| `page.on('dialog', ...)` registered after action | Register BEFORE action. | |
| `expect.poll(...)` for visibility | `await expect(locator).toBeVisible()` | Use `toPass` only for non-locator polling. |
| `test('name', async ({ browser }) => { const ctx = await browser.newContext(); ... })` | Use `page` fixture. | |
| `await page.locator('input').evaluate(el => el.value = 'x')` | `await locator.fill('x')` | |
| `await page.waitForSelector(sel)` | `await expect(page.locator(sel)).toBeVisible()` | Old API. |
| `await page.$('selector')` | `page.locator('selector')` | `$` returns ElementHandle (stale-prone). |
| `await page.$$('selector')` | `page.locator('selector')` | |
| Custom `await sleep(N)` helper | `await expect(...)` | Delete the helper. |
| `await page.locator('button:has-text("Save")').click()` | `await page.getByRole('button', { name: 'Save' }).click()` | Role-based. |
| `await locator.evaluate(el => el.click())` | `await locator.click()` | Native click. |

---

## 3. Locator priority cheatsheet (2026 consensus)

Order is normative — start at the top, only descend when the higher tier genuinely doesn't fit.

### Tier 1: `getByRole(role, { name })` — DEFAULT

```ts
await page.getByRole('button', { name: 'Submit' }).click();
await page.getByRole('heading', { name: 'Welcome' }).waitFor();
await page.getByRole('link', { name: /Sign up/i }).click();
await page.getByRole('checkbox', { name: 'I agree' }).check();
await page.getByRole('combobox', { name: 'Country' }).selectOption('Slovakia');
```

USE: any interactive element with an accessible name. Mirrors how assistive tech sees the page → assertion implicitly covers a11y. STABLE across CSS / DOM refactors.

AVOID: when accessible name is dynamic (e.g., contains a generated ID) or missing. Fix the app instead.

### Tier 2: `getByLabel(text)` — FORMS

```ts
await page.getByLabel('Email address').fill('a@b.c');
await page.getByLabel('Password').fill('•••');
```

USE: form inputs. Resolves via `<label for="...">`, `aria-label`, `aria-labelledby`. Reads like spec language.

AVOID: when input has no label (still a bug — file it).

### Tier 3: `getByPlaceholder` / `getByText` / `getByAltText` / `getByTitle`

```ts
// Placeholder — when no real label exists yet
await page.getByPlaceholder('Search products').fill('mouse');

// Body text — when not interactive (paragraphs, status text)
await expect(page.getByText('Order placed successfully')).toBeVisible();

// Image alt
await expect(page.getByAltText('Company logo')).toBeVisible();

// Title attribute — last-resort tooltip
await page.getByTitle('Edit profile').click();
```

USE: when role-based isn't viable but the text is the user-facing identifier.

AVOID: `getByPlaceholder` if you can fix the missing label. Placeholder is not a substitute for a label (a11y violation).

### Tier 4: `getByTestId(id)` — STABLE HOOK FOR DYNAMIC NAMES

```ts
// playwright.config.ts: use: { testIdAttribute: 'data-testid' }
await page.getByTestId('order-row-123').click();
```

USE: when the user-visible name is dynamic, internationalized, or contains a generated ID. Coordinate with engineering to keep test IDs stable.

AVOID: as a default — defaulting to test IDs leaks implementation detail into tests and weakens a11y feedback.

### Tier 5: `locator('css/xpath')` — ESCAPE HATCH

```ts
await page.locator('[data-feature="checkout-v2"] >> visible=true').click();
```

USE: deeply structural cases (DOM trees with no a11y, third-party widgets). Combine with `.filter()` for specificity.

AVOID: as a default. Every CSS-selector check-in invites a styling-refactor flake later.

---

## 4. 2026 Playwright pattern conventions

### 4.1 Fixtures over POM for small/medium suites

```ts
// fixtures.ts
import { test as base, expect } from '@playwright/test';

type AppFixtures = {
  authedPage: import('@playwright/test').Page;
  freshUser: { email: string; password: string };
};

export const test = base.extend<AppFixtures>({
  freshUser: async ({ request }, use) => {
    const email = `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`;
    const password = 'TestPass123!';
    await request.post('/test-helpers/users', { data: { email, password } });
    await use({ email, password });
  },

  authedPage: async ({ page, freshUser }, use) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill(freshUser.email);
    await page.getByLabel('Password').fill(freshUser.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    await use(page);
  },
});

export { expect };
```

```ts
// uses
import { test, expect } from '../fixtures';

test('places order', async ({ authedPage }) => {
  await authedPage.getByRole('link', { name: 'Catalog' }).click();
  await authedPage.getByRole('button', { name: 'Add to cart' }).first().click();
  await expect(authedPage.getByText('Item added')).toBeVisible();
});
```

Why fixtures first: typed end-to-end, no inheritance gymnastics, lazy (only run when requested), composable (`mergeTests`).

### 4.2 Page Object Model — only when warranted

Trigger to introduce POM: suite has 200+ specs OR multiple teams contribute and need a shared vocabulary for a complex page (multi-step wizard, dashboard with 30 widgets).

```ts
// pages/CheckoutPage.ts
import { Page, Locator, expect } from '@playwright/test';

export class CheckoutPage {
  readonly shippingForm: Locator;
  readonly nameField: Locator;
  readonly addressLine1: Locator;
  readonly placeOrderButton: Locator;
  readonly orderConfirmedHeading: Locator;

  constructor(private readonly page: Page) {
    this.shippingForm = page.getByRole('form', { name: 'Shipping details' });
    this.nameField = this.shippingForm.getByLabel('Full name');
    this.addressLine1 = this.shippingForm.getByLabel('Address line 1');
    this.placeOrderButton = page.getByRole('button', { name: 'Place order' });
    this.orderConfirmedHeading = page.getByRole('heading', { name: 'Order confirmed' });
  }

  async fillShipping(name: string, addr: string) {
    await this.nameField.fill(name);
    await this.addressLine1.fill(addr);
  }

  async placeOrder() {
    await this.placeOrderButton.click();
    await expect(this.orderConfirmedHeading).toBeVisible();
  }
}
```

```ts
// uses
import { test, expect } from '../fixtures';
import { CheckoutPage } from '../pages/CheckoutPage';

test('checkout happy path', async ({ authedPage }) => {
  const checkout = new CheckoutPage(authedPage);
  await authedPage.goto('/checkout');
  await checkout.fillShipping('Juraj K', 'Hlavná 1');
  await checkout.placeOrder();
});
```

Pitfalls to AVOID:
- Inheriting from `BasePage` god class — use composition.
- Returning `Locator` from methods that should encapsulate behavior.
- Putting assertions inside actions (`async login()` should call `await this.loginButton.click()` then return; assertion lives in the test or in a dedicated `expectLoggedIn()` method).

### 4.3 Web-first assertions ALWAYS

```ts
// CORRECT — polled, auto-retries until timeout
await expect(page.getByRole('alert')).toContainText('Saved');
await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled();
await expect(page.getByRole('row')).toHaveCount(3);
await expect(page).toHaveURL(/\/orders\/\d+/);

// WRONG — one-shot, no retry
expect(await page.getByRole('alert').textContent()).toContain('Saved');
expect(await page.getByRole('button').isDisabled()).toBe(true);
expect(await page.getByRole('row').count()).toBe(3);
expect(page.url()).toMatch(/\/orders\/\d+/);
```

### 4.4 Worker-scoped fixtures for expensive setup

```ts
// fixtures.ts
type WorkerFixtures = { adminToken: string };

export const test = base.extend<{}, WorkerFixtures>({
  adminToken: [async ({}, use) => {
    const r = await fetch(`${process.env.APP_BASE_URL}/api/admin/login`, {
      method: 'POST', body: JSON.stringify({ /* creds */ }),
    });
    const { token } = await r.json();
    await use(token);
  }, { scope: 'worker' }],
});
```

Worker-scoped = setup runs ONCE per parallel worker, not once per test. Use for: admin tokens, seeded fixture data, ephemeral test environments.

### 4.5 `mergeTests` for fixture composition

```ts
import { mergeTests } from '@playwright/test';
import { test as authTest } from './fixtures/auth';
import { test as billingTest } from './fixtures/billing';

export const test = mergeTests(authTest, billingTest);

test('billing dashboard', async ({ authedPage, billingAccount }) => {
  await authedPage.goto(`/billing/${billingAccount.id}`);
});
```

Use to compose feature-specific fixture files instead of one giant `fixtures.ts`.

### 4.6 Project config (cross-browser + mobile)

```ts
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 4 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: process.env.APP_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
    testIdAttribute: 'data-testid',
  },
  projects: [
    { name: 'setup', testMatch: /.*\.setup\.ts/ },
    { name: 'chromium', use: { ...devices['Desktop Chrome'] }, dependencies: ['setup'] },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] }, dependencies: ['setup'] },
    { name: 'webkit', use: { ...devices['Desktop Safari'] }, dependencies: ['setup'] },
    { name: 'Mobile Chrome', use: { ...devices['Pixel 7'] }, dependencies: ['setup'] },
    { name: 'Mobile Safari', use: { ...devices['iPhone 14'] }, dependencies: ['setup'] },
  ],
});
```

### 4.7 Sharding for suites over 10 minutes

```bash
# CI matrix: shard 1/4, 2/4, 3/4, 4/4 in parallel
npx playwright test --shard=1/4
npx playwright test --shard=2/4
npx playwright test --shard=3/4
npx playwright test --shard=4/4
```

Each shard runs ~25% of tests; merge HTML reports via `npx playwright merge-reports`.

### 4.8 Auth via `storageState`

```ts
// auth.setup.ts
import { test as setup, expect } from '@playwright/test';

const authFile = 'playwright/.auth/user.json';

setup('authenticate', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill(process.env.TEST_USER_EMAIL!);
  await page.getByLabel('Password').fill(process.env.TEST_USER_PASSWORD!);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await page.context().storageState({ path: authFile });
});

// playwright.config.ts: projects[].use.storageState = 'playwright/.auth/user.json'
```

Login once, reuse cookies/localStorage across all tests in the project.

---

## 5. Common semantic translation gotchas

### 5.1 Cypress command queue → Playwright async/await

Cypress chains are LAZY — the queue defers execution. Direct mechanical translation drops the queue model but keeps the brittle code shape.

```js
// Cypress — looks synchronous, isn't
cy.get('#email').type('a@b.c');
cy.get('#submit').click();
cy.contains('Welcome').should('be.visible');
```

```ts
// MECHANICAL (wrong): missing awaits drop everything into promise hell
page.getByLabel('Email').fill('a@b.c');
page.getByRole('button', { name: 'Sign in' }).click();
expect(page.getByText('Welcome')).toBeVisible();
```

```ts
// CORRECT
await page.getByLabel('Email').fill('a@b.c');
await page.getByRole('button', { name: 'Sign in' }).click();
await expect(page.getByText('Welcome')).toBeVisible();
```

EVERY Playwright async call needs an explicit `await`. ESLint rule [`require-await`](https://eslint.org/docs/latest/rules/require-await) catches some cases; [`missing-playwright-await`](https://github.com/playwright-community/eslint-plugin-playwright/blob/main/docs/rules/missing-playwright-await.md) catches the rest.

### 5.2 Selenium implicit wait ≠ Playwright auto-wait

Selenium's `driver.manage().timeouts().implicitlyWait(10s)` applies to every `findElement` invocation. Playwright's auto-wait waits for actionability (visible + stable + enabled + receives events) per action — semantically different.

Common bug: translator preserves `implicitlyWait(10)` as `actionTimeout: 10_000`, then test passes locally but fails on CI because a different assertion needed >10s. Fix: configure `actionTimeout` and `expect.timeout` deliberately, don't blanket-copy.

### 5.3 `findElements().get(0)` (SNAPSHOT) → `.first()` (LIVE)

```java
// Selenium — snapshot at call time, becomes stale
List<WebElement> rows = driver.findElements(By.cssSelector(".row"));
WebElement first = rows.get(0);
// Re-render in between → first is now stale → StaleElementReferenceException
first.click();
```

```ts
// Playwright — live locator, evaluated at action time
const first = page.locator('.row').first();
// Re-render between definition and click is fine; locator re-evaluates
await first.click();
```

The semantic difference matters for tests that capture an element early and click it after a state change. Naive translation that calls `.first()` immediately works; storing the result in a variable for later use across awaits requires re-evaluation discipline.

### 5.4 `cy.intercept` vs `page.route` — cleanup scope

```js
// Cypress — intercept lives until end of test, auto-cleans
cy.intercept('GET', '/api/x', { fixture: 'x.json' });
```

```ts
// Playwright — route lives until end of context (i.e., whole test) OR until unroute
await page.route('**/api/x', r => r.fulfill({ path: 'x.json' }));
// Optional explicit teardown:
test.afterEach(async ({ page }) => { await page.unroute('**/api/x'); });
```

In Playwright, `page.route` registered in a fixture survives across tests unless the page itself is per-test. With `{ page }` fixture (default), the page is per-test → routes auto-clean. With shared contexts (e.g., `storageState` projects with `dependencies`), routes may persist if registered at the context level.

### 5.5 `@BeforeEach` (Java/Python) → fixture vs `test.beforeEach`

Decision rule:
- USE FIXTURE when setup produces a VALUE the test needs (`freshUser`, `seededProject`, `authedPage`).
- USE `test.beforeEach` when setup is side-effect-only and doesn't return data (clear cookies, reset feature flag).

```ts
// Fixture (preferred for data)
const test = base.extend<{ seededProject: { id: string } }>({
  seededProject: async ({ request }, use) => {
    const r = await request.post('/api/projects', { data: { name: 'Test' } });
    const project = await r.json();
    await use(project);
    await request.delete(`/api/projects/${project.id}`);
  },
});

// beforeEach (preferred for side effects)
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('feature_x', 'on'));
});
```

### 5.6 `cy.session` → `storageState` — different invalidation semantics

`cy.session(name, setupFn, { validate })` caches per-spec by `name` and revalidates via `validate`. Playwright `storageState` is a static JSON file written once (per setup project run) and read by every test in projects that opt in via `use.storageState`. No automatic revalidation.

If the session expires mid-suite (e.g., 1h JWT), Playwright won't re-login automatically. Fix: rerun `auth.setup.ts` between test groups, or build a fixture that detects expiry and re-logs in.

### 5.7 Cypress retryability (built-in) → Playwright (explicit)

Cypress `cy.get` retries until command-default timeout. Playwright LOCATOR is retryable AT ACTION TIME (clicks auto-wait), but a raw `await locator.textContent()` is one-shot — no retry. Translation must promote to web-first assertion (`toContainText`) to preserve retryability.

```js
// Cypress — implicit retry on the chain
cy.get('.balance').should('contain', '$1,000');
```

```ts
// WRONG — loses the retry
const text = await page.locator('.balance').textContent();
expect(text).toContain('$1,000');

// CORRECT — preserves retry semantics
await expect(page.locator('.balance')).toContainText('$1,000');
```

### 5.8 Selenium `Alert` → Playwright `dialog` event timing

```java
// Selenium — synchronous alert handling
driver.findElement(By.id("delete")).click();
Alert alert = driver.switchTo().alert();
alert.accept();
```

```ts
// Playwright — handler MUST be registered BEFORE the action
page.once('dialog', dialog => dialog.accept());
await page.getByRole('button', { name: 'Delete' }).click();
```

Common bug: translator preserves the post-click handler — Playwright sees no listener and the dialog throws.

### 5.9 Cypress `cy.task` (Node bypass) → API request (network)

`cy.task` runs in Cypress's Node runner, so it can read files, query DBs, send raw SMTP. Naive Playwright translation that tries `await page.evaluate(() => fs.readFileSync(...))` will fail — page context has no `fs`.

Translation strategies:
- Move the operation to `globalSetup` (Node context).
- Expose a test-only HTTP endpoint and call via `APIRequestContext`.
- For test data, prefer build-time fixtures (`fixtures/*.json`) imported at top-of-file.

### 5.10 `pytest.mark.parametrize` → `for (const c of cases) test(...)`

```python
@pytest.mark.parametrize("name,expected", [("a", 1), ("b", 2)])
def test_x(name, expected):
    assert f(name) == expected
```

```ts
const cases = [
  { name: 'a', expected: 1 },
  { name: 'b', expected: 2 },
] as const;

for (const c of cases) {
  test(`f returns ${c.expected} for ${c.name}`, () => {
    expect(f(c.name)).toBe(c.expected);
  });
}
```

Critical: each iteration must declare its own `test()` — putting cases inside a single `test` collapses to one test ID and you lose granular reporting.

---

## 6. Hallucination defense — locator grounding rules

CANDOR multi-agent test-generation research (arXiv 2410.10628, multiple 2024-2025 follow-ups) and the Allegro internal case study both document that LLMs given only source-test code generate plausible-looking but UNVERIFIED `getByRole` selectors. The model "guesses" that a `<div class="cta">` is a button, or that `Login` text means `role="button"`. These hallucinations pass syntactic review but break at runtime.

Mitigation = STRICT GROUNDING RULES. Stage 2 codegen MUST follow:

### Rule 1: `By.id("foo")` → `#foo` or `getByTestId("foo")`, NEVER `getByRole`

```java
// SOURCE
driver.findElement(By.id("submit")).click();
```

```ts
// CORRECT — preserve the identifier
await page.locator('#submit').click();
// OR (only if "submit" looks like a testid convention used in this codebase)
await page.getByTestId('submit').click();

// WRONG — invented role
await page.getByRole('button', { name: 'Submit' }).click();
```

`By.id("submit")` may target a `<div>`, an `<input type="submit">`, or a custom web component — output cannot assume role without evidence.

### Rule 2: `By.xpath("//div[contains(@class,'foo')]")` → `page.locator('.foo')`, NEVER guess role

```java
// SOURCE
driver.findElement(By.xpath("//div[contains(@class,'submit-btn')]")).click();
```

```ts
// CORRECT
await page.locator('.submit-btn').click();
// or
await page.locator('div.submit-btn').click();

// WRONG
await page.getByRole('button', { name: 'Submit' }).click();
```

The source explicitly targets a `<div>` — if the dev meant a button, they would have used `<button>`. Preserve the structural intent.

### Rule 3: `cy.contains("Submit")` → `getByText("Submit")`, NOT `getByRole("button")`

```js
// SOURCE
cy.contains('Submit').click();
```

```ts
// CORRECT
await page.getByText('Submit').click();

// WRONG — promoting to role without DOM evidence
await page.getByRole('button', { name: 'Submit' }).click();
```

`cy.contains` matches any element with that text. Stage 2 cannot promote to `getByRole('button')` without DOM evidence. If the migrator can inspect a sample render (`inputs/dom/*.html`), it MAY upgrade. Otherwise: PRESERVE.

### Rule 4: Role-based selector ALLOWED only with evidence

The model MAY upgrade to `getByRole` when the source contains:
- `aria-label`, `aria-labelledby`, `aria-describedby` attribute references
- Selectors that explicitly target semantic tags: `By.tagName("button")`, `cy.get('button')`, `page.locator('button')`
- An accessible-name pattern that matches a known design-system component (e.g., `MuiButton`)
- Source comments documenting the element role

```java
// SOURCE has explicit semantic tag — upgrade ALLOWED
driver.findElement(By.cssSelector("button.primary")).click();
// → await page.getByRole('button', { name: ??? }).click(); // still need name evidence
```

### Rule 5: Preserve attribute selectors verbatim when no role evidence

```java
// SOURCE
driver.findElement(By.cssSelector("[data-test='checkout-btn']")).click();
```

```ts
// CORRECT
await page.locator('[data-test="checkout-btn"]').click();
// OR (if testIdAttribute: 'data-test' is configured)
await page.getByTestId('checkout-btn').click();
```

### Rule 6: When unsure — emit a TODO with the original selector

```ts
// TODO(migration): original selector was By.xpath("//div[@class='complex']/span[2]/button")
//   — verify role/name in DOM before replacing with getByRole.
await page.locator('xpath=//div[@class="complex"]/span[2]/button').click();
```

Explicit TODO beats silent guess. The Stage 3 reviewer can grep for `TODO(migration)` and resolve.

### Rule 7: Never invent text content

If the source uses `By.id("x")` with no text, the migrator MUST NOT add `getByRole('button', { name: 'Save' })` — the text "Save" is invented. Either preserve `locator('#x')` or emit a TODO.

### Rule 8: Frame switching needs verified frame identifier

```java
// SOURCE
driver.switchTo().frame("payment-iframe");
```

```ts
// CORRECT
const frame = page.frameLocator('iframe[name="payment-iframe"]');
await frame.getByRole('textbox', { name: 'Card number' }).fill('...');

// WRONG — invented index
const frame = page.frameLocator('iframe').nth(0);
```

---

## 7. Migration smell scan checklist

Run after every Stage 2 codegen pass; fail the pipeline (or flag for human review) if any threshold is breached.

### 7.1 Selector quality

```bash
# Goal: >70% of locators are role/label/testid-based
ROLE_COUNT=$(grep -rE "(getByRole|getByLabel|getByText|getByPlaceholder|getByAltText|getByTitle|getByTestId)" outputs/ | wc -l)
RAW_COUNT=$(grep -rE "(\.nth\(|page\.locator\('\.|page\.locator\(\"xpath=|page\.locator\('//)" outputs/ | wc -l)
TOTAL=$((ROLE_COUNT + RAW_COUNT))
# fail if RAW_COUNT / TOTAL > 0.30
```

### 7.2 Hard waits banned

```bash
# Goal: zero matches
grep -rE "waitForTimeout|setTimeout|page\.pause\(|cy\.pause\(|Thread\.sleep|time\.sleep" outputs/ && exit 1
```

### 7.3 `force: true` flagged

```bash
# Goal: zero (or each occurrence has a justifying comment)
grep -rE "force:\s*true" outputs/
```

### 7.4 Magic numbers

```bash
# Detect hardcoded integers >2 inside test bodies (excluding configured constants)
# Heuristic: numbers in setTimeout/setViewportSize/nth/Index calls not assigned to a named const above
grep -rE "(setTimeout\(\s*\d{3,}|setViewportSize\(\{[^}]*\d+[^}]*\}|\.nth\(\d+\))" outputs/
```

Treat anything other than `0` or `1` inside test bodies as suspect.

### 7.5 Assertion roulette

```bash
# Goal: <2 awaited expects per test
# Heuristic: parse with ts-morph; for each test body count awaited expect calls
# Flag tests where count > 3 OR assertions target unrelated subjects
```

### 7.6 Conditional logic inside tests

```bash
grep -rE "^\s*if\s*\(" outputs/tests/ | grep -v "^\s*//\|^\s*\*"
grep -rE "^\s*try\s*\{" outputs/tests/ | grep -v "^\s*//\|^\s*\*"
```

Any match in test files = manual review required.

### 7.7 Focus / skip leftovers

```bash
grep -rE "test\.only\(|test\.describe\.only\(|test\.skip\(|fit\(|fdescribe\(|xit\(|xdescribe\(" outputs/ && exit 1
```

### 7.8 Missing `await` on Playwright calls

```bash
# Heuristic: lines starting with `page.` or ending in `.click();` `.fill(...);` without leading `await`
grep -rnE "^\s+page\.|^\s+locator\.|\.click\(\);$" outputs/ | grep -vE "await|return|=>" | head
```

Better: run `eslint --rule '{"@playwright/missing-playwright-await": "error"}'` as part of CI.

### 7.9 Web-first assertion adoption

```bash
WEB_FIRST=$(grep -rE "await expect\(" outputs/ | wc -l)
ONE_SHOT=$(grep -rE "expect\(await " outputs/ | wc -l)
RATIO=$((WEB_FIRST * 100 / (WEB_FIRST + ONE_SHOT + 1)))
# fail if RATIO < 90
```

### 7.10 Hallucinated `getByRole` without source evidence

Cross-check (when DOM samples available):
- For every `getByRole(role, { name })` in output, search the source for either an `aria-label="name"` or an element tag matching `role`. If neither found, flag as suspect hallucination.

### 7.11 Lint gate

Run before merge:

```bash
npx eslint outputs/ --config config/eslint.config.js --max-warnings 0
npx tsc --project outputs/tsconfig.json --noEmit
npx playwright test outputs/ --list  # syntactic check: tests collect
```

### 7.12 Trace-viewer smoke

```bash
# Run a small subset with traces; visual sanity check
npx playwright test outputs/ --grep @smoke --trace on --reporter=line
# Open one trace; verify selectors resolve to intended elements
```

---

## qa-master target architecture (v0.2.0 default)

PWmodernizer's default `TARGET_STYLE` is `qa-master` — Sonnet emits multi-file
layered output matching `examples/reference/qa-master/` (CustomInk's
production Playwright suite). The KB IDs below catalogue the anti-patterns
the qa-master conformance validator and verify CANDOR check for in
generated output. Cross-references to ARCHITECTURE.md sections in the
reference directory.

### qa-master/architecture/import-source

**Smell**: spec imports `test`/`expect` directly from `@playwright/test`.
**Fix**: import from `@fixtures/base.fixture` — the single source per
ARCHITECTURE.md §3.7. Only the fixture file itself imports from
`@playwright/test`. ESLint `no-restricted-imports` enforces this.

```ts
// ❌ WRONG
import { test, expect } from "@playwright/test";

// ✅ RIGHT
import { test, expect } from "@fixtures/base.fixture";
```

### qa-master/architecture/relative-imports

**Smell**: relative imports like `../../helper/page-object/cart.page`.
**Fix**: path aliases — `@page-object`, `@actions`, `@fixtures`, `@api`,
`@browser`, `@test-data`, `@project-types`, `@utilities`, `@logger`. Enforced
import order: builtin → external → internal (internal alphabetised within
group). ARCHITECTURE.md §9.

### qa-master/architecture/no-constructor

**Smell**: a `PageClass*` or `BlockClass*` declares its own constructor.
**Fix**: only `BasePage`/`BaseBlock` (the abstract bases) declare constructors;
subclasses inherit and use `readonly` class fields that reference `this.page`.
Field initialisers run after `super()`, so `this.page` is set. ARCHITECTURE.md §3.1.

```ts
// ❌ WRONG
class PageClassCart extends BasePage {
  constructor(page: Page) { super(page); this.buttonCheckout = page.getByRole(...); }
}

// ✅ RIGHT
class PageClassCart extends BasePage {
  readonly buttonCheckout = this.page.getByRole("button", { name: "Checkout" })
    .describe(`[${LABEL_CART}] Checkout button`);
}
```

### qa-master/architecture/locator-no-describe

**Smell**: a `readonly` locator field without `.describe()`.
**Fix**: every locator carries a `[SECTION_LABEL]` describe so failures
self-explain in trace + error output. ARCHITECTURE.md §5.

### qa-master/architecture/expect-no-label

**Smell**: `expect(locator).toBeVisible()` inside a page-method without a
`[LABEL]` message argument.
**Fix**: every `expect()` *inside a page method* takes the explanatory-message
form. Callers can't see inside the method; the message is the only diagnostic
they get. ARCHITECTURE.md §3.1.

```ts
// ❌ WRONG
async waitForPageLoad(): Promise<void> {
  await expect(this.textProductName).toBeVisible();
}

// ✅ RIGHT
async waitForPageLoad(): Promise<void> {
  await expect(this.textProductName, `[${LABEL_PDP}] Product name should be visible`)
    .toBeVisible({ timeout: 45_000 });
}
```

### qa-master/architecture/parameterised-locator-method

**Smell**: `byStyleId(id: string): Locator { return page.getByTestId(...); }`
declared as a method.
**Fix**: parameterised locators are `readonly` arrow-function fields, not
methods. Methods are reserved for actions. ARCHITECTURE.md §3.1.

```ts
// ❌ WRONG
byColorSwatch(name: string): Locator { return this.page.getByTestId(`color-swatch-${name}`); }

// ✅ RIGHT
readonly byColorSwatch = (name: string) =>
  this.page.getByTestId(`color-swatch-${name}`).describe(`[${LABEL_PDP}] Color swatch ${name}`);
```

### qa-master/architecture/naming-no-prefix

**Smell**: locator named `addBtn` / `nameField` / `prices` — caller can't
tell element type from the stack trace.
**Fix**: type-prefix names — `buttonAddToCart`, `inputName`, `textProductName`,
`imageMain`, `headingPersonalData`, `linkForgotPassword`, `iconSearch`,
`arrayPrices`, `arrayProductCards`, `byStyleId(id)`, `byColorSwatch(name)`.
ARCHITECTURE.md §5.

### qa-master/architecture/nav-returns-void

**Smell**: a navigation method returns `void`; the spec has to re-instantiate
the next POM and rerun `waitForPageLoad()`.
**Fix**: nav methods return the destination POM, with its `waitForPageLoad()`
already awaited. The spec receives it from a fixture (canonical), but the
return value enables ergonomic chaining. ARCHITECTURE.md §3.1.

```ts
// ✅ RIGHT
async startDesigning(): Promise<PageClassNDX> {
  await this.buttonStartDesigning.click();
  const ndxPage = new PageClassNDX(this.page);
  await ndxPage.waitForPageLoad();
  return ndxPage;
}
```

### qa-master/architecture/parse-in-page-method

**Smell**: a page-method calls `.text()` / `.allTextContents()` then
`parseFloat()` / `JSON.parse()` / `.replace()` to compute a structured
result.
**Fix**: Grab → Parse → Assert. The page method GRABS (returns raw `string[]`),
a pure `utilities/` function PARSES, the spec ASSERTS. Parsing is unit-testable
in isolation; 100% coverage gate on utilities. ARCHITECTURE.md §4.

### qa-master/architecture/page-goto-in-spec

**Smell**: spec calls `page.goto('/products/123')` directly.
**Fix**: never `page.goto()` in a test — always `productPage.open(styleId)`.
Specs are behavior, not URL strings. ARCHITECTURE.md §6.

### qa-master/architecture/ui-data-prep

**Smell**: spec creates a user via UI (sign-up form filled), creates a cart
via UI (add-to-cart clicks), then asserts on something downstream.
**Fix**: prepare data via `helper/api/*.api.ts` — the only sanctioned path.
The UI-creation flow is exercised in exactly ONE test (the sign-up test);
every other test uses the API helper. ARCHITECTURE.md §7.

### qa-master/architecture/should-test-name

**Smell**: `test("should display logo when …")` — "should" is filler.
**Fix**: `[TICKET-ID] - Check that <user-perceivable outcome>`. Start with
`Check that`. Never imperative ("displays") or "should". ARCHITECTURE.md §6.

### qa-master/architecture/step-without-action

**Smell**: `test.step("Verify cart has 3 items", () => { ... });` — a
step that only asserts.
**Fix**: each `test.step()` is one action → one expectation pair. Title
names the **action** ("Add the product to the cart"); body performs the
action AND asserts the expected outcome. No nested steps. ARCHITECTURE.md §6.

### qa-master/architecture/selector-not-testid-first

**Smell**: a freshly-created locator uses `getByText` or `getByRole` when
the underlying element has a `data-testid`.
**Fix**: selector priority for qa-master = **`getByTestId` first**, then
`getByRole` → `getByLabel` → `getByText` → `getByPlaceholder` → CSS → XPath.
This is the ONE point where qa-master diverges from the general Playwright
recommendation (getByRole-first); the rationale is that the CustomInk
front-end ships maintained testids and they're the most stable contract
in that codebase. ARCHITECTURE.md §5.

### qa-master/architecture/foreign-framework-import

**Smell**: subtractive migration leaves an `import` from `cypress`,
`selenium-webdriver`, or another framework.
**Fix**: subtractive mode bans every non-`@playwright/test` non-relative
non-`node:` import. Either translate the API or drop it. Already enforced
by `plan-envelope-validate.ts:validateSubtractiveImports`; qa-master mode
extends this to ban `@playwright/test` outside the fixture file too.

### qa-master/architecture/utilities-coverage

**Smell**: `helper/utilities/parse-prices.ts` exists but has no unit tests.
**Fix**: `utilities/` carries a 100% coverage gate. Parsing functions are
pure; testing them is cheap; not testing them means the spec inherits their
bugs invisibly. ARCHITECTURE.md §3.3.

### qa-master/page-object/click-without-assertion

**Smell**: a page-object method's last statement is `await this.<locator>.click();`
with no follow-up `expect(...)`. The caller can't tell whether the click did
anything; failures surface in the next method, far from the cause.
**Fix**: every action ends with the assertion that proves the action took effect
(`await expect(this.textConfirmation, '[LABEL] WHY').toBeVisible()`). Per
`helper/page-object/CLAUDE.md`: "Never end a method on click() — assert after."
`validate-qa-master-conformance.ts` emits: `Page method ends on .click() with
no following assertion — KB qa-master/page-object/click-without-assertion`.

### qa-master/page-object/no-try-catch

**Smell**: `try { ... } catch (e) { ... }` inside a `*.page.ts` or `*.block.ts`.
**Fix**: page objects must not swallow errors. Playwright's web-first assertions
already auto-retry; a `try/catch` either masks a real flake or duplicates that
retry. Let the failure propagate so the spec sees the real cause.
`validate-qa-master-conformance.ts` emits: `try/catch in page/block — KB
qa-master/page-object/no-try-catch`.

### qa-master/page-object/no-get-accessor

**Smell**: `get buttonSubmit(): Locator { return this.page.getByRole(...); }` —
a getter returning a locator.
**Fix**: locators are `readonly` fields — eager for static elements, arrow-function
for parameterised ones. Getters re-evaluate on every access (no caching) and
break the "every locator has a `.describe()` label" contract.
`validate-qa-master-conformance.ts` emits: `get <name>() returns a locator — KB
qa-master/page-object/no-get-accessor`.

### qa-master/page-object/locator-in-method

**Smell**: a page method declares `const x = this.page.getByRole(...)` to use a
locator on the fly.
**Fix**: every locator the page object knows about belongs as a `readonly` field
on the class (with a `.describe()` label). Method bodies act on existing fields;
they don't build new locators ad-hoc. Parameterised locators are arrow-function
fields, not inline `const`s.
`validate-qa-master-conformance.ts` emits: `Locator built inside method body —
KB qa-master/page-object/locator-in-method`.

### qa-master/page-object/locator-priority

**Smell**: `this.page.locator('.product-name')` or `this.page.locator('//div[@id="foo"]')` —
a bare CSS / XPath selector when a higher-priority `getBy*` would do.
**Fix**: selector priority for qa-master is
`getByTestId` → `getByRole` → `getByLabel` → `getByText` → `getByPlaceholder` → CSS → XPath.
The `.locator()` fallback is a last resort after the four `getBy*` paths have
been exhausted. Per `helper/page-object/CLAUDE.md`.
`validate-qa-master-conformance.ts` emits: `Bare CSS/XPath locator '<sel>' — KB
qa-master/page-object/locator-priority`.

### qa-master/utilities/verb-prefix

**Smell**: `helper/utilities/prices.ts` exports `cents(x: string): number` — a
noun-named function in a utility module.
**Fix**: per `helper/utilities/CLAUDE.md`: "Verb-prefix names: parse*, get*,
calculate*, verify*, generate*, normalize*". The verb prefix makes call sites
read as actions (`parsePrices(rows)`) and pairs naturally with the
"Grab → Parse → Assert" three-layer separation.
`validate-qa-master-conformance.ts` emits: `Exported utility '<name>' has no
verb prefix — KB qa-master/utilities/verb-prefix`.

### qa-master/actions/page-param

**Smell**: `export async function signInAndAddToCart(email: string, sku: string): Promise<void>` —
an action whose first argument is not a destructured object containing `page`.
**Fix**: per `helper/actions/CLAUDE.md`: "Signature: destructure
`{ page, ...params }`". Every action receives the Playwright `page` (and any
other dependencies) as a destructured-object first arg so callers can extend
without re-ordering positional args.
`validate-qa-master-conformance.ts` emits: `Action '<name>' first param is not
a destructured object including \`page\` — KB qa-master/actions/page-param`.

### qa-master/actions/cross-page-only

**Smell**: `helper/actions/account-rename.ts` constructs only one
`new AccountsPage(page)` — a single-page flow disguised as an action.
**Fix**: actions are for **cross-page** (vertical) flows that compose 2+ page
objects, or for flows shared across multiple specs. Single-page logic stays on
the page object. Per `helper/actions/CLAUDE.md`: "Create one when 2+ page
objects are involved or a flow is shared setup across files."
`validate-qa-master-conformance.ts` emits: `Action constructs only 1 page
object (<Class>) — KB qa-master/actions/cross-page-only`.

### qa-master/runtime/route-in-spec

**Smell**: `await page.route('**/api/payments', …)` appearing directly in a
spec or a page object.
**Fix**: third-party / network mocking is a fixture concern (browser-context
level, set up once across the suite), not a per-spec ad-hoc inline call.
Centralise the route handler in `helper/fixtures/*.fixture.ts` so every test
inherits a deterministic network surface.
`validate-qa-master-conformance.ts` emits: `page.route() outside fixtures — KB
qa-master/runtime/route-in-spec`.

### qa-master/specs/test-name-format

**Smell**: `test('Sign-in works', …)` or `test('should sign in', …)`.
**Fix**: titles must match `^\[[^\]]+\]\s*-\s*Check\b` — i.e. start with a
bracketed ticket id, then ` - Check that <user-perceivable outcome>`. Pairs
with the existing `qa-master/architecture/should-test-name` rule but enforces
the structural form (ticket id + "Check") in addition to banning "should".
`validate-qa-master-conformance.ts` emits: `Test title '<title>' not in
'[TICKET-ID] - Check that ...' form — KB qa-master/specs/test-name-format`.

### qa-master/specs/single-describe

**Smell**: a `*.spec.ts` file declaring two or more `test.describe(...)` blocks.
**Fix**: one describe per feature, one feature per file. Multiple describes in
one file signal a file that should be split into siblings under the same
feature folder.
`validate-qa-master-conformance.ts` emits: `Spec has <N> test.describe()
blocks — KB qa-master/specs/single-describe`.

### qa-master/specs/no-nested-steps

**Smell**: `test.step('Outer', async () => { await test.step('Inner', …); })`.
**Fix**: each `test.step()` is ONE action → ONE assertion. Nesting muddies that
contract and produces useless trace timelines. Refactor inner steps into
sibling steps (or into the page object method).
`validate-qa-master-conformance.ts` emits: `Nested test.step() — KB
qa-master/specs/no-nested-steps`.

### qa-master/files/kebab-case

**Smell**: a file emitted under `outputs/` named `signInPage.ts` or
`order_history.spec.ts` — uppercase or underscore in the stem.
**Fix**: kebab-case throughout (`sign-in-page.ts`, `order-history.spec.ts`).
The convention matches the qa-master reference and the path-alias map.
`validate-qa-master-conformance.ts` emits: `Filename '<base>' contains
uppercase or underscore — KB qa-master/files/kebab-case`.

### qa-master/architecture/relative-imports-sibling

**Smell**: `from "./checkout.api"` from a helper file — a sibling-dir relative
import between two different concerns.
**Fix**: extends `qa-master/architecture/relative-imports` (which already bans
parent-dir `../...`). Same-dir `./...` imports across helper concerns also
bypass the path-alias surface and make refactors brittle. Use the alias
(`@page-object`, `@api`, `@fixtures`, `@test-data`, …) for every cross-helper
reference, even within the same folder.
`validate-qa-master-conformance.ts` emits: `Sibling relative import (./…) —
KB qa-master/architecture/relative-imports-sibling`.

## Authoritative references

- Playwright docs — [playwright.dev/docs](https://playwright.dev/docs/intro)
- Best practices — [playwright.dev/docs/best-practices](https://playwright.dev/docs/best-practices)
- Locators — [playwright.dev/docs/locators](https://playwright.dev/docs/locators)
- Web-first assertions — [playwright.dev/docs/test-assertions](https://playwright.dev/docs/test-assertions)
- Fixtures — [playwright.dev/docs/test-fixtures](https://playwright.dev/docs/test-fixtures)
- Auth — [playwright.dev/docs/auth](https://playwright.dev/docs/auth)
- ESLint plugin — [github.com/playwright-community/eslint-plugin-playwright](https://github.com/playwright-community/eslint-plugin-playwright)
- xUnit Test Patterns — Gerard Meszaros, 2007 (Assertion Roulette, Test Code Duplication).
- CANDOR multi-agent test generation — arXiv 2410.10628 (2024).
- Allegro Engineering — internal Playwright migration write-up (2024-2025), on locator hallucination patterns.
- WCAG 2.1 AA on role/name/state semantics — [w3.org/TR/WCAG21](https://www.w3.org/TR/WCAG21/).
