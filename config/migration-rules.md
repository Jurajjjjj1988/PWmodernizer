# Migration rules

The style + structure contract for every Playwright TypeScript file emitted by the Migrator pipeline. This file is read by Claude during Stage 1 (plan generation) and Stage 2 (code generation). It is paired with `knowledge-base.md`, which catalogs anti-patterns and source-API translations; this file defines what the *output* must look like.

If a rule here conflicts with anything Claude has seen in training data, this file wins. If a rule here conflicts with `knowledge-base.md`, this file wins.

---

## How to update this file

Changes here propagate to every future migration the moment they land on `main`. The pipeline pulls the latest copy on each run; there is no per-input override mechanism by design.

Update procedure:

1. Edit this file with the new rule. Keep the rule + the "why" together — orphan rationale rots.
2. Update or add a fixture in `examples/` that demonstrates the rule in action. The eval script harvests these as golden outputs for regression.
3. Bump the `last-reviewed` date in the footer.
4. Run `scripts/eval.ts` against `inputs/` to confirm previously-passing migrations still pass under the tightened rules. If any regress, either loosen the rule, fix the affected fixtures by hand, or add a migration note explaining the cutover.
5. Commit with a message starting `rules:` so the changelog filter picks it up.

Do not add rules speculatively. Every rule here exists because output without it was demonstrably worse — flakier, harder to read, harder to maintain. If a proposed rule cannot be tied to a concrete failure mode, leave it out.

---

## 1. Project structure target

Every migrated suite lands in this exact layout. Do not reinvent it per-input.

```
tests/
├── <feature>.spec.ts
├── <feature>-edge-cases.spec.ts
fixtures/
├── pages.fixture.ts
├── <domain>.fixture.ts
pages/
├── <page-name>.page.ts
data/
├── <feature>-fixtures.ts
playwright.config.ts
```

### File naming

- Files: `kebab-case`. `checkout-flow.spec.ts`, not `CheckoutFlow.spec.ts` or `checkout_flow.spec.ts`.
- POM classes: `PascalCase`, suffix `Page`. `CheckoutPage`, not `Checkout` or `checkoutPage`.
- Fixture exports: `camelCase`. `authenticatedPage`, not `AuthenticatedPage`.
- Locator properties on a POM: `camelCase`, named after the element's *role + label*, not its CSS shape. `submitButton`, not `btnSubmit` or `submit_btn`.
- Test data exports: `camelCase` if a value, `PascalCase` if a type. `validCreditCard`, `type CardInput`.

### When to add a new POM

Threshold: **200 lines of code in a single test file** triggers extracting a POM. Below 200 LOC, inline locators are fine — the indirection cost of a POM outweighs the dedup benefit on small suites.

Other extraction triggers, even under 200 LOC:

- The same DOM region is referenced by ≥3 test files. Dedup wins.
- The page has a non-trivial state machine (login, checkout, multi-step form). Encapsulating the transitions in named action methods makes the test read as a user story.
- The page requires bilingual selectors (EN/CZ regex). Centralise so one place owns the locale matrix.

### When to extract a fixture vs keep inline

Extract a fixture when:

- The setup is needed by ≥2 test files. One file is not enough — premature abstraction.
- The setup involves network mocking, auth state, or any cross-test contract.
- The setup is slow and benefits from worker-scoped caching (login token, seeded DB).

Keep inline when:

- It is a one-line `await page.goto('/foo')`.
- It is unique to a single test's narrative and lifting it out would make the test harder to read.

### POM vs page-utility split

A POM owns *locators + actions*. It does not own *assertions* — those are the caller's responsibility, because assertion phrasing is where the test's narrative lives. If you find yourself adding `expect` inside a POM method, you are leaking the test's intent into shared code. Stop and refactor.

---

## 2. Test file template

Every `*.spec.ts` file Migrator emits follows this exact skeleton. Deviations require a comment explaining why.

```typescript
// Migrated from cypress on 2026-06-03 by Migrator. See outputs/plans/checkout-flow.md for plan.

import { expect } from "@playwright/test";

import { test } from "../fixtures/pages.fixture";
import { CheckoutPage } from "../pages/checkout.page";
import { validCreditCard } from "../data/checkout-fixtures";

test.describe("Checkout flow", () => {
  test.beforeEach(async ({ checkoutPage }) => {
    await checkoutPage.navigate();
  });

  test("completes purchase with valid card @positive @e2e", async ({
    checkoutPage,
    page,
  }) => {
    await checkoutPage.fillShippingAddress(validCreditCard.shippingAddress);
    await checkoutPage.enterCard(validCreditCard);
    await checkoutPage.submitOrder();

    // Order confirmation page is the only observable outcome of a successful purchase.
    // We assert on the heading because the URL is opaque (contains a one-time token).
    await expect(
      page.getByRole("heading", { name: /order confirmed/i }),
    ).toBeVisible();
  });

  test("blocks submission when card number is invalid @negative", async ({
    checkoutPage,
  }) => {
    await checkoutPage.enterCard({ ...validCreditCard, number: "0000" });
    await checkoutPage.submitOrder();

    await expect(checkoutPage.cardErrorMessage).toHaveText(/invalid card/i);
  });
});
```

### Imports order

Strict order, blank line between groups:

1. Playwright (`@playwright/test`)
2. Fixtures (relative imports from `fixtures/`)
3. POMs (relative imports from `pages/`)
4. Data (relative imports from `data/`)
5. Anything else

Why: makes diffs predictable and grep-friendly. A regex for `^import.*pages/` finds every POM consumer.

### Describe nesting

**Maximum two levels of `test.describe` per file.** One level is preferred. Three levels is a code smell — split the file.

```typescript
// Acceptable
test.describe("Checkout", () => {
  test.describe("payment step", () => { /* ... */ });
});

// REJECT — split into checkout-payment.spec.ts and checkout-confirmation.spec.ts
test.describe("Checkout", () => {
  test.describe("payment step", () => {
    test.describe("credit card", () => { /* ... */ });
  });
});
```

Why: deep nesting hides which tests run on a given filter, and the IDE breadcrumb becomes unreadable.

### `test.beforeEach` discipline

Keep `beforeEach` to ≤3 lines. Anything heavier belongs in a fixture. The fixture pattern survives parallel-worker scope, gives you typed hooks into mock objects, and avoids the implicit-magic feeling of long beforeEach blocks.

### Test title rules

- Start with a present-tense verb. `completes purchase`, `blocks submission`, `displays error`.
- Never start with "should". `should complete purchase` is bureaucratic noise.
- Under 80 characters. Longer titles wrap in the reporter and become unreadable.
- Title describes *user-perceivable behaviour*, not implementation. `clicks submit button` is implementation; `submits the order` is behaviour.

### Tag taxonomy

Exactly this set. Do not invent project-specific tags without updating this file first.

| Tag | Meaning |
|---|---|
| `@positive` | Happy path; the feature works as advertised. |
| `@negative` | Expected error path; bad input, server error, auth failure. |
| `@edge` | Boundary case; max length, empty list, race condition. |
| `@e2e` | End-to-end through real backend (no API mocks). |
| `@slow` | Runtime >10s; gated out of the default CI run. |
| `@visual` | Captures a screenshot for visual regression. |

Tags go at the end of the title, space-separated. Filtering uses Playwright's grep on title.

### Assertions

Web-first only. Every `expect` ends with an auto-retrying matcher applied to a Locator.

```typescript
// CORRECT
await expect(page.getByRole("heading", { name: "Welcome" })).toBeVisible();

// REJECT — synchronous probe, no retry, flake magnet
expect(await page.getByRole("heading", { name: "Welcome" }).isVisible()).toBe(true);
```

Why: web-first assertions auto-poll with the configured timeout. Sync probes capture a single snapshot and race the UI.

### Observable outcome at the end of every test

Every test ends with at least one assertion on a user-perceivable thing — a heading, a URL, a toast message, a row count. Tests that end with `await page.click(submitButton)` and no follow-up assertion silently pass on broken builds.

---

## 3. POM template

Exact shape. Constructor wires every locator. No lazy getters, no `init()` methods.

```typescript
import { type Locator, type Page } from "@playwright/test";

export class CheckoutPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly shippingFirstNameInput: Locator;
  readonly shippingLastNameInput: Locator;
  readonly cardNumberInput: Locator;
  readonly cardExpiryInput: Locator;
  readonly cardCvcInput: Locator;
  readonly submitButton: Locator;
  readonly cardErrorMessage: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole("heading", { name: /checkout|pokladna/i });
    this.shippingFirstNameInput = page.getByLabel(/first name|jméno/i);
    this.shippingLastNameInput = page.getByLabel(/last name|příjmení/i);
    this.cardNumberInput = page.getByLabel(/card number|číslo karty/i);
    this.cardExpiryInput = page.getByLabel(/expiry|expirace/i);
    this.cardCvcInput = page.getByLabel(/cvc|cvv/i);
    this.submitButton = page.getByRole("button", { name: /place order|odeslat/i });
    this.cardErrorMessage = page.getByRole("alert").filter({ hasText: /card/i });
  }

  async navigate(): Promise<void> {
    await this.page.goto("/checkout");
    await this.heading.waitFor();
  }

  async fillShippingAddress(address: ShippingAddress): Promise<void> {
    await this.shippingFirstNameInput.fill(address.firstName);
    await this.shippingLastNameInput.fill(address.lastName);
  }

  async enterCard(card: CardInput): Promise<void> {
    await this.cardNumberInput.fill(card.number);
    await this.cardExpiryInput.fill(card.expiry);
    await this.cardCvcInput.fill(card.cvc);
  }

  async submitOrder(): Promise<void> {
    await this.submitButton.click();
  }
}
```

### Rules

- **Constructor wires all locators.** Lazy getters create a hidden lifecycle and make the POM harder to reason about. Locators in Playwright are cheap — they're just descriptors, not DOM queries.
- **Action methods are `async`** and named as verb phrases — `submitOrder`, not `submit` or `clickSubmit`. They return `Promise<void>` unless they return something the caller observes (e.g., a confirmation number).
- **POMs do not assert.** They expose Locators; the test file decides what to assert on them. If you find yourself adding `expect` inside the POM, that logic belongs in the test.
- **One file per POM.** `checkout.page.ts` exports `CheckoutPage`. Multiple POMs per file get tangled.
- **Bilingual EN/CZ matching via regex.** Project precedent: the Czech and English flavours of the same product share locators differentiated only by visible text. Use `/english|czech/i` regex inside `name:` options. Do not branch on locale at runtime.
- **Public methods have a JSDoc when their semantics are non-obvious.** A method named `submitOrder` does not need JSDoc. A method named `seedAddressFromGeolocation` does.

### Composition over inheritance

A `CheckoutPage` does not extend a `BasePage`. If you find shared behaviour across POMs (e.g., a common header), extract a `HeaderComponent` class that takes a `Page` in its constructor and is composed into the POMs that need it. Inheritance forces unrelated pages into the same hierarchy and pulls in fields they don't use.

---

## 4. Fixture template

Use Playwright's `test.extend<>()`. The conventional file is `fixtures/pages.fixture.ts` for POM fixtures and one file per domain for everything else (mocks, auth, baseline state).

### Page fixture

```typescript
import { test as base } from "@playwright/test";

import { CheckoutPage } from "../pages/checkout.page";
import { ProductPage } from "../pages/product.page";

type Pages = {
  checkoutPage: CheckoutPage;
  productPage: ProductPage;
};

export const test = base.extend<Pages>({
  checkoutPage: async ({ page }, use) => {
    await use(new CheckoutPage(page));
  },
  productPage: async ({ page }, use) => {
    await use(new ProductPage(page));
  },
});

export { expect } from "@playwright/test";
```

Why re-export `expect`: every test file imports `expect` from somewhere. Sourcing it from the fixture file means a single import line at the top of each test instead of two, and the IDE auto-import lands on the right thing.

### Mock fixture

```typescript
import { test as base } from "./pages.fixture";

type MockOptions = {
  mockPaymentSuccess: boolean;
};

type MockFixtures = {
  paymentMocks: void;
};

export const test = base.extend<MockOptions & MockFixtures>({
  mockPaymentSuccess: [true, { option: true }],

  paymentMocks: [
    async ({ page, mockPaymentSuccess }, use) => {
      await page.route("**/api/payments", async (route) => {
        if (mockPaymentSuccess) {
          await route.fulfill({ status: 200, json: { id: "pay_123", status: "ok" } });
        } else {
          await route.fulfill({ status: 402, json: { error: "card_declined" } });
        }
      });
      await use();
    },
    { auto: true },
  ],
});
```

Note: `auto: true` runs the fixture for every test that imports this `test` symbol, without the test having to name it. Use sparingly — auto fixtures that nobody asked for are surprising. The right candidates are baseline state every test in the file relies on (auth, mock setup).

### Baseline state fixture (auto)

```typescript
import { test as base } from "./pages.fixture";

export const test = base.extend<{ baselineState: void }>({
  baselineState: [
    async ({ page }, use) => {
      await page.addInitScript(() => {
        window.localStorage.setItem("cookieConsent", "accepted");
      });
      await use();
    },
    { auto: true },
  ],
});
```

### Worker-scoped vs test-scoped

Use **test-scoped** (the default) for anything that touches `page` or that has any per-test state.

Use **worker-scoped** (`scope: "worker"`) for:

- Auth token acquisition that costs >1s and is idempotent.
- Database seeding done once per worker.
- API client setup that holds no per-test state.

A worker fixture cannot use `page` — `page` is test-scoped. A worker fixture that mutates state is dangerous: subsequent tests inherit the mutation. Only use it for read-only artefacts.

---

## 5. Locator rules (2026 consensus)

The hierarchy. Every locator in Migrator output must come from this list, in priority order.

1. **`getByRole(role, { name })`** for interactive elements: buttons, links, headings, form controls, dialogs.
2. **`getByLabel(name)`** for form fields. Reads exactly as the label the user sees.
3. **`getByPlaceholder` / `getByText` / `getByAltText` / `getByTitle`** when role/label is unavailable.
4. **`getByTestId`** only if the app already exposes test IDs. Do not invent test IDs in the migration output — that requires a frontend change, which is out of scope for Migrator.
5. **`page.locator('css')` or XPath** only as a last resort. Each such use requires an inline comment explaining why nothing higher in the hierarchy works.

### Forbidden patterns (eval script will fail the output)

| Pattern | Why it fails |
|---|---|
| `page.waitForTimeout(N)` | Hard wait. Always wrong, no exceptions. Use web-first assertion. |
| `.nth(N)` where N > 1 without a comment | Index selectors are fragile. Reorder the DOM and the test silently targets a different element. |
| `.click({ force: true })` | Forces past actionability checks, which means the bug it was added to suppress is still there. |
| `expect(await el.isVisible()).toBe(true)` | Synchronous probe. Use `await expect(el).toBeVisible()`. |
| `test.only` left in committed code | Skips every other test silently. Always a mistake in CI. |
| `test.skip` without a tracked reason | Skips become permanent. Either delete the test or link to a ticket. |
| `page.pause()` | Debug-only API. Never in committed code. |
| Hard-coded timeouts >5s without a comment | Long timeouts hide bugs and make CI slow. If you genuinely need >5s, justify it. |
| Magic numbers without a named constant | `await page.goto('/products?page=37')` is unreadable. Extract `const PAGE_WITH_PAGINATION_BUG = 37`. |

### Examples

```typescript
// CORRECT
await page.getByRole("button", { name: /add to cart/i }).click();
await page.getByLabel(/email/i).fill("user@example.com");
await expect(page.getByRole("alert")).toContainText(/saved/i);

// REJECT — CSS class is fragile
await page.locator(".btn-primary.btn-submit").click();

// REJECT — nth(2) breaks the moment the DOM order changes
await page.getByRole("listitem").nth(2).click();

// REJECT — hard wait
await page.click("#submit");
await page.waitForTimeout(2000);
await expect(page.getByText("Saved")).toBeVisible();

// CORRECT — replacement
await page.getByRole("button", { name: /submit/i }).click();
await expect(page.getByText(/saved/i)).toBeVisible();
```

---

## 6. Config conventions

Exact `playwright.config.ts`:

```typescript
import { defineConfig, devices } from "@playwright/test";
import "dotenv/config";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 4 : undefined,
  reporter: [["html", { open: "never" }], ["list"]],
  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout: 5_000,
    navigationTimeout: 15_000,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    ...(process.env.CROSS_BROWSER === "1"
      ? [
          { name: "firefox", use: { ...devices["Desktop Firefox"] } },
          { name: "webkit", use: { ...devices["Desktop Safari"] } },
        ]
      : []),
    ...(process.env.MOBILE === "1"
      ? [
          { name: "mobile-chrome", use: { ...devices["Pixel 7"] } },
          { name: "mobile-safari", use: { ...devices["iPhone 14"] } },
        ]
      : []),
  ],
});
```

### Conventions

- **`fullyParallel: true`** is the default. Tests must be independent. If a test relies on state from another test, that's a bug, not a config problem.
- **`forbidOnly: !!process.env.CI`** catches `test.only` checked into CI before it silently green-washes a broken build.
- **Retries in CI only.** Local retries hide flake from the author. CI retries dampen noise during the diagnosis window before the flake is fixed.
- **`actionTimeout: 5_000`** is short on purpose. Slow actions are usually a sign that the assertion is racing the UI, not that the timeout is too tight.
- **Trace on first retry** captures everything needed to debug a flake without slowing the happy path.
- **`baseURL` from `.env`** via `dotenv/config`. No `env.ts` wrapper — the global rules forbid it and there is no value in another indirection layer.

### When to add projects

- **Visual project** (`name: "visual"`) when a test file is tagged `@visual` and uses `toMatchSnapshot`. Visual projects pin a single browser channel for snapshot determinism.
- **Mobile projects** gated by `MOBILE=1` so default runs stay fast.
- **Cross-browser** gated by `CROSS_BROWSER=1` for the same reason.

### Sharding

Trigger sharding when the suite takes >5 minutes on a single CI runner. Use Playwright's `--shard=N/M` flag from CI workflow YAML, not from `playwright.config.ts`. Sharding is an infra concern.

---

## 7. Commenting discipline

Comments explain **why**, never **what**. The code shows what.

### Acceptable

```typescript
// The /checkout endpoint redirects to /login if the cart is empty, which trips a
// race against our seeded cart fixture. Wait for the heading before asserting URL.
await expect(checkoutPage.heading).toBeVisible();
expect(page.url()).toContain("/checkout");
```

```typescript
// Walk-and-Watch 2026-05-21: this dropdown renders an inline portal outside the
// dialog's DOM subtree. Scoping the locator to `page` (not `dialog`) is correct.
const countryOption = page.getByRole("option", { name: /czechia/i });
```

```typescript
// Stripe's iframe takes ~800ms to mount on slow CI. The default 5s actionTimeout
// covers this, but listing it here keeps the next reader from second-guessing.
await stripeCardInput.fill(card.number);
```

### Unacceptable

```typescript
// Click the submit button
await submitButton.click();

// Fill the email field with the user's email
await emailInput.fill(user.email);

// TODO: add edge case
```

The first two restate the code. The third is a tracking issue masquerading as a comment — open a ticket instead.

### Walk-and-Watch annotations

When a comment captures live exploration of the app, prefix it with the date in ISO format: `Walk-and-Watch 2026-MM-DD:`. Future readers can correlate the comment with the app version it was true for.

### Migration attribution

Every migrated file starts with exactly one line:

```typescript
// Migrated from <source> on 2026-MM-DD by Migrator. See outputs/plans/<this>.md for plan.
```

Where `<source>` is one of `cypress`, `selenium-java`, `selenium-python`, `bad-playwright`. The plan reference lets a human trace any oddity back to the LLM's reasoning at migration time.

---

## 8. Forbidden output patterns (hard fail)

The post-generate evaluator scans for these. If any appears, the migration is rejected and re-prompted.

| Pattern | Why it fails |
|---|---|
| `any` type anywhere | Erases the type system's value. Global rule. |
| `as unknown as X` casts | Either the types are wrong (fix them) or the cast is hiding a bug. |
| `// @ts-ignore` / `// @ts-expect-error` without a TODO ticket reference | Silences the compiler. If you must, link to a ticket. |
| `console.log` / `console.debug` in committed code | Debug residue. Use the reporter. |
| `TODO` / `FIXME` comments | Tracking issues belong in the tracker, not in code. |
| `eslint-disable` without an inline justification | Disabling a lint rule is a decision; the next reader needs the reason. |
| Unused imports | Lints catch these; if they made it through, the gate is broken. |
| >2 top-level `test.describe` per file | Split the file. See section 2. |
| File >300 LOC | Split the file. Big spec files are unmaintainable. |
| `try/catch` wrapping a Playwright action | Either the action is expected to throw (use `await expect(action).rejects.toThrow()`) or the catch is hiding a real failure. |
| `if (await el.isVisible())` branching test logic on element presence | Conditional test logic means the test asserts nothing. Two tests are clearer. |
| Duplicate selectors in the same spec file | Extract a POM. The 200-LOC threshold is a default; recurring locators trigger extraction earlier. |
| Test file without at least one `expect` | A test that asserts nothing is a smoke check, not a test. Either add an assertion or move it to `smoke/`. |
| Test depending on test order (`test.serial` without justification) | Parallel-by-default. Serial requires a comment naming the dependency. |

The evaluator emits a structured failure per match. Migrator re-prompts Claude with the failure list and a request to fix only those issues, not regenerate from scratch.

---

## 9. Plan markdown shape (Stage 1 output contract)

The Stage 1 plan is what Claude produces *before* writing code. It is the human-reviewable artefact and the input to Stage 2. Every plan markdown file goes to `outputs/plans/<input-basename>.md` and follows this exact shape.

```markdown
# Migration plan: <input-filename>

## Source framework

{cypress | selenium-java | selenium-python | bad-playwright}

## Summary

One paragraph describing what this test exercises in terms of user-perceivable behaviour. No implementation detail — what the test proves, not how. Aim for 2-4 sentences.

## Anti-patterns detected

Mandatory table format. Sort by Severity descending (H, M, L), then by Line ascending. One row per smell. Severity codes: **H** = test will flake / break / leak secrets, **M** = test still works but is fragile or unreadable, **L** = stylistic.

| Severity | Line | KB-ID | Anti-pattern | Snippet (≤60 chars) | Replacement |
|---|---|---|---|---|---|
| H | 8 | KB-1.1.1 | hard-wait | `cy.wait(2000)` | web-first assertion on next observable element |
| H | 12 | KB-1.4.12 | hardcoded-url | `cy.visit('https://shop.acme.test')` | configure `baseURL`, use relative path |
| M | 15 | KB-1.2.3 | index-selector | `cy.get('.item').eq(2)` | `getByRole('listitem', { name: ... })` |
| M | 18 | KB-1.1.5 | sync-probe | `expect(await el.isVisible()).toBe(true)` | `await expect(el).toBeVisible()` |
| L | 22 | KB-1.1.12 | conditional-logic | `if (el) { ... } else { throw }` | direct `await expect(...)` |

Each KB-ID MUST exist in `config/knowledge-base.md`. If you detect a smell with no KB entry, emit row with KB-ID `KB-UNCLASSIFIED` and add a one-paragraph note in the "Unclassified smells" subsection below the table.

## Locator translation table

| Original | New | Confidence | Notes |
|---|---|---|---|
| `cy.get('#submit')` | `page.getByRole('button', { name: /submit/i })` | high | Has accessible name in source DOM |
| `cy.get('.cart-item').eq(0)` | `page.getByRole('listitem').filter({ hasText: /first product/i })` | med | Assumes product name is stable; flag for review |
| `cy.xpath('//div[contains(@class, "modal")]//button')` | `page.getByRole('dialog').getByRole('button', { name: ... })` | low | Original XPath is ambiguous; reviewer needs to specify button |

Confidence levels: `high` = mechanical translation, `med` = inferred from context, `low` = requires reviewer input.

## Structural changes

- **Extract POM:** yes — `CheckoutPage` owning shipping form, payment form, and submit. Inline locators would exceed 200 LOC.
- **Extract fixture:** yes — `paymentMocks` fixture stubbing `/api/payments` for negative-path tests.
- **Split into multiple specs:** no — single feature, two top-level describes is fine.
- **New data files:** `data/checkout-fixtures.ts` exporting `validCreditCard`, `declinedCard`, `expiredCard`.

## Open questions for reviewer

- Q1: The source test relies on `cy.intercept` matching by URL substring. The new mock matches by glob — confirm the substring is unique enough that glob matching is equivalent.
- Q2: Lines 45-50 use `cy.window().its('store').invoke('dispatch', ...)`. This is direct Redux dispatch, no UI equivalent. Recommend deletion (test no longer simulates user) but flagging for sign-off.
- Q3: Selector for "country dropdown" was `[data-cy=country]` — there is no `data-cy` attribute in production. Confirm the test ID exists or replace with role-based.

## Risk callouts

- **Likely flake:** Stripe iframe mount race; mitigated by `await expect(stripeFrame).toBeVisible()` before fill.
- **Behavioural drift:** The Cypress test was passing because `cy.wait(2000)` masked a real backend slowness. Replacing with assertion will surface the slowness as a 5s timeout; if it fails on CI, the test is now reporting a real bug.
- **Locale coverage:** Source test only covered EN. New POM uses EN/CZ regex; CZ flavour is not yet covered by an assertion and will silently pass on the EN run.

## Expected metrics

- Selector quality score (estimated): 0.85 (8/10 locators are role/label, 2 are testid)
- Smell count delta vs source: -7 (4 hard waits removed, 2 index selectors replaced, 1 conditional split)
- New test file LOC estimate: ~140 (under threshold; no further split)
- POM LOC estimate: ~110
```

### Plan markdown rules

- Every section above is required even if its content is "none". Reviewers grep for the headers.
- "Confidence" is honest, not optimistic. A `low` confidence row is not a bug — it's a flag that humans need to look here.
- "Open questions" is the most important section. If the LLM has no questions, the migration is either trivial or insufficiently considered.

---

## 10. Stage 2 output contract

Stage 2 reads the plan from section 9 and produces code. It must produce, and only produce, the following.

### Must produce

- `outputs/tests/<input-basename>.spec.ts` — the migrated test file.
- `outputs/tests/<input-basename>-edge-cases.spec.ts` — if the plan said split.
- `outputs/pages/<page-name>.page.ts` — if the plan said extract a POM. One file per POM.
- `outputs/fixtures/<domain>.fixture.ts` — if the plan said extract a fixture.
- `outputs/data/<feature>-fixtures.ts` — if the plan introduced test data constants.
- `outputs/reports/<input-basename>.md` — migration report with metrics from the eval script.

### Must not produce

- Modifications to `inputs/**`. The input corpus is read-only by convention. If you find the input file is wrong, flag in the plan's "Open questions" — do not edit it.
- Modifications to `config/**`. These files are user-curated. If you think a config change is needed, raise it; do not silently change it.
- Speculative refactors not in the plan. If the plan said extract one POM, do not extract two. The plan is the contract.
- A second pass on a file already written in this Stage 2 invocation. One write per file per pass. If something is wrong, the evaluator catches it and re-prompts with surgical fixes.
- New top-level directories. Use the layout in section 1.

### Migration report shape

The report at `outputs/reports/<input-basename>.md` is generated by the eval script after Stage 2 writes the code. It includes:

- Selector quality score (actual, from analyser)
- Smell count by category, before and after
- Test file LOC, POM LOC, fixture LOC (actual)
- Time to first assertion in the longest test (proxy for fixture-heavy setup)
- List of forbidden-pattern matches (should be empty)
- Diff summary against the plan's expected metrics — variance >20% is flagged

### Stage 2 self-checks before declaring done

Claude runs these checks mentally before emitting the final file set:

1. Does every file start with the migration attribution line?
2. Does every test end with an observable-outcome assertion?
3. Does every POM constructor wire every Locator the methods reference?
4. Are there any imports of `expect` from the wrong place (should be the fixture re-export when in a test file)?
5. Are there any forbidden patterns from section 8? (`any`, `waitForTimeout`, `force: true`, etc.)
6. Does each test title start with a verb, no "should", under 80 chars?
7. Are the tag suffixes from the closed set in section 2?

A failed self-check means edit before emit, not emit and apologise.

---

## Footer

- Owner: Migrator project, `/Users/kapusansky/DEV/Migrator`.
- Pairs with: `config/knowledge-base.md` (anti-patterns + API translations).
- Last reviewed: 2026-06-03.
- Update procedure: see "How to update this file" at the top.
