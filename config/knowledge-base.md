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

#### 1.1.9 Magic numbers (viewport, timeouts, indices)

```ts
// ANTI-PATTERN
await page.setViewportSize({ width: 1366, height: 768 });
await page.locator('li').nth(7).click();
test.setTimeout(45000);
```

```ts
// CANONICAL
const DESKTOP_VIEWPORT = { width: 1366, height: 768 } as const;
const PRICING_PLAN_PRO_INDEX = 7;

await page.setViewportSize(DESKTOP_VIEWPORT);
await page.getByRole('listitem', { name: 'Pro plan' }).click();
test.setTimeout(45_000);
```

Rationale: magic numbers signal "I don't know what this means". Named constants document intent and make refactors safe.

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
