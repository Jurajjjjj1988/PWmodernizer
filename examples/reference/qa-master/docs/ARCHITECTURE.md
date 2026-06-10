# Playwright Functional Test Architecture

> A complete, self-contained description of a layered architecture for Playwright functional
> tests. It defines where every kind of code lives, how the layers interact, and the
> conventions that keep a large suite maintainable. New and migrated tests conform to it.
>
> **Scope**: functional testing — interaction and behavior (navigation, clicks, keyboard,
> state changes, form submission, ARIA-state changes after interaction). Visual regression and
> standalone accessibility scans are out of scope.

---

## 1. Principles

1. **Horizontal surface, not vertical flows.** Page objects and blocks model the UI *surface*
   — one object per page or per section. Journeys that cross page boundaries live in `actions/`,
   which compose page objects.
2. **Declarative locators, imperative actions.** Page/block objects only *describe* elements
   (`readonly` locators). Acting and asserting happen in methods and tests.
3. **Grab → Parse → Assert.** Reading on-screen data always flows through three steps: a page
   method grabs raw DOM strings, a pure utility parses them into structured data, the test
   asserts. Parsing never lives in a page method or a spec.
4. **Auto-waiting, built-in assertions.** Synchronization is expressed solely through retrying
   `expect()` assertions and Playwright's built-in action waits — never manual `waitFor*`/sleeps.
   Assert with **built-in web-first assertions** (`toBeVisible`, `toHaveText`, `toContainText`,
   `toHaveValue`, `toHaveCount`, …) directly on locators. Only drop to a plain value comparison
   (`expect(value).toBe(…)`) when the data genuinely had to be parsed first (§4).
5. **Dependency injection via fixtures.** Tests never instantiate page objects; they receive
   them as fixtures.
6. **Everything has one home.** Every element/method/file has an obvious place. When a page
   grows, extract a block; when parsing creeps into a test, extract a utility. Err toward more
   structure.
7. **Self-documenting.** Locators carry `.describe()` labels; page-method assertions carry
   `[LABEL]` messages; tests carry annotations and tags. Failures explain themselves.
8. **Deterministic, isolated, parallel-safe.** Every test produces the same result on every run,
   owns the data it touches, and is safe to run concurrently with all others. See §7.
9. **Prepare data via the API, assert via the UI.** Preconditions are created through the
   project's existing API layer — never by driving the UI. See §7.
10. **Exercise each UI path once.** A given UI flow is verified through the UI in exactly one
    test; tests that merely need its result reuse a shared helper (an API helper where possible),
    never the same clicks again. See §7.
11. **Mock what you don't control.** Third-party/external dependencies are stubbed at the network
    layer (`page.route`), never hit live — distinct from first-party data prep via the `api/`
    layer. See §7.

---

## 2. Directory Layout

```
<infra-root>/                 # test infrastructure (e.g. `helper/`)
├── fixtures/
│   ├── base.fixture.ts       # base: injects page objects + cookies/flags + auto-logging
│   └── staging.fixture.ts    # extends base; auto-skips when IS_PRODUCTION=true
├── actions/                  # cross-page (vertical) flows — compose page objects
├── api/                      # API request wrappers (one file per endpoint) — used for data setup
├── browser/                  # helpers that need a Page (data-layer readers, locator builders)
├── page-object/
│   ├── basepage.ts           # abstract BasePage
│   ├── pages/                # PageClass${Name} — one per page
│   ├── blocks/               # BlockClass${Name} — reusable sections/components
│   └── popups/               # modal/popup objects
├── test-data/                # constants only: urls, ids, cookies, ticket-system suites
├── types/
│   ├── external/             # API/3rd-party response shapes
│   └── internal/             # internal data structures
└── utilities/                # PURE functions (parse/get/calculate/verify/generate)

tests/
└── <surface>/...             # specs mirror surfaces (e.g. frontend/, frontend-mobile/)
                              # each surface = a config project
```

Each directory carries its own `CLAUDE.md` documenting the rules for that layer, next to the
code it governs.

---

## 3. Layers

### 3.1 `page-object/` — the UI surface

**`BasePage`** is the abstract base every page extends. It is the **only** page-side class that
declares a constructor — it wires `page` (as a parameter property) so that **page objects
themselves declare no constructor**. Blocks extend an equally minimal **`BaseBlock`** for the
same reason. Locators in the subclasses are `readonly` class fields that reference `this.page`
(field initializers run after `super()`, so `this.page` is already set).

```ts
import { type Page } from '@playwright/test';

// Base for full pages. Wires `page`; pages extend this and declare NO constructor.
abstract class BasePage {
    readonly url: string = '';

    constructor(readonly page: Page) {}

    abstract waitForPageLoad(): Promise<void>;

    async reloadPage(): Promise<void> {
        await this.page.reload({ timeout: 60_000 });
        await this.waitForPageLoad();
    }
}

// Base for blocks. Wires `page`; blocks extend this and declare NO constructor.
abstract class BaseBlock {
    constructor(readonly page: Page) {}
}
```

**Pages** (`PageClass${Name}`) model one full page. They **declare no constructor** — locators
are `readonly` class fields referencing `this.page`, and blocks are instantiated eagerly as
fields. URL-navigable pages implement `open()` and `waitForPageLoad()`; nested (non-navigable)
pages implement only `waitForPageLoad()`.

```ts
class PageClassProductDetail extends BasePage {
    readonly url = '/products/styles';

    // Static locators — readonly fields referencing this.page (evaluated eagerly).
    readonly textProductName = this.page.getByTestId('pdp-header-style-name')
        .describe(`[${LABEL_PDP}] Product name`);
    readonly buttonStartDesigning = this.page.getByTestId('pdp-cta')
        .describe(`[${LABEL_PDP}] Start designing`);

    // Parameterized locators — arrow-function fields (evaluated lazily).
    readonly byColorSwatch = (name: string) =>
        this.page.getByTestId(`color-swatch-${name}`).describe(`[${LABEL_PDP}] Color swatch ${name}`);

    // Blocks — instantiated eagerly as fields (no constructor needed).
    readonly blockRecommendations = new BlockClassRecommendations(this.page);

    async open(styleId: number): Promise<void> {
        logger.info(`[${chalk.green(LABEL_PDP)}] Opening product ${styleId}`);
        await this.page.goto(`${URLS.baseUrl}${this.url}/${styleId}`, { timeout: 60_000 });
        await this.waitForPageLoad();
    }

    async waitForPageLoad(): Promise<void> {
        await expect(this.textProductName, `[${LABEL_PDP}] Product name should be visible`)
            .toBeVisible({ timeout: 45_000 });
    }

    // Navigation method: lands on a new page, waits, returns it (for ergonomic chaining;
    // the canonical access in specs is still the injected fixture — see §3.7).
    async startDesigning(): Promise<PageClassNDX> {
        await this.buttonStartDesigning.click();
        const ndxPage = new PageClassNDX(this.page);
        await ndxPage.waitForPageLoad();
        return ndxPage;
    }
}
```

**Blocks** (`BlockClass${Name}`) model a reusable section/component. They extend the minimal
**`BaseBlock`** (so they too **declare no constructor**) and are **eagerly instantiated** as
fields in the owning page. Blocks may nest blocks (same eager-field pattern). Extract a block
when a section reaches **~5+ locators or 3+ methods**.

```ts
class BlockClassHeader extends BaseBlock {
    readonly buttonCart = this.page.getByTestId('cart-button')
        .describe(`[${LABEL_HEADER}] Cart button`);
    readonly byNavLink = (label: string) =>
        this.page.getByRole('link', { name: label }).describe(`[${LABEL_HEADER}] Nav link ${label}`);
}
```

**Page/block method rules:**
- **No API/HTTP calls** — browser interaction only.
- **No parsing/transformation** in a method — read DOM, optionally delegate to a utility.
  *Exception:* DOM-conditional logic (check visibility, fall back to another element) stays in
  the page object (it can't be a pure function).
- **Never end a method on `click()`** — verify something happened after.
- **Never `waitFor` before an action** — `click()`/`fill()` auto-wait.
- **Navigation methods return the target page object**, never `void`.
- **`private`** for internal helpers; public methods are the test-facing API.
- **Guard parse results** — assert raw arrays non-empty before parsing and/or the parsed result
  valid after.
- **Prefer `Promise.all` + `.all()`** over `evaluateAll` (keeps logic in Node, preserves
  Playwright retry/reporting).
- **Optional elements** via `.catch(() => {})`, never `try/catch`.
- **Every `expect()` inside a method carries a `[LABEL]` message** (the caller can't see inside).

### 3.2 `actions/` — cross-page flows

Vertical journeys that compose page objects. Create one when **2+ page objects are involved**
or a multi-file shared setup is needed. Destructure `{ page, ...params }`; return the final page
object when the caller continues, or `void` for terminal steps.

```ts
export async function addProductToCart({
    page,
    styleId
}: {
    page: Page,
    styleId: number
}): Promise<PageClassShoppingCart> {
    const productDetailPage = new PageClassProductDetail(page);
    await productDetailPage.open(styleId);
    const ndxPage = await productDetailPage.startDesigning();
    return ndxPage.addProductToCart();
}
```

### 3.3 `utilities/` — pure functions

No side effects, no browser, no I/O — JS primitives/plain objects in and out. This is what makes
parsing unit-testable; utilities carry a **100% unit-coverage gate**. Verb-prefix names:

| Prefix | For |
|---|---|
| `parse*` | raw strings/untyped arrays → structured data |
| `get*` | derive a value from already-typed data |
| `calculate*` | compute a derived number |
| `verify*` | a group of `expect()`s reused across 3+ files (takes already-parsed data) |
| `generate*` / `normalize*` / `filter*` / `determine*` | produce / transform / classify |

### 3.4 `api/` — data-setup request wrappers

One wrapper per endpoint (`{feature}.api.ts`) exposing typed functions that create/read/update
backend state over HTTP. **This is the only sanctioned way to prepare test data** — see §7.
Wrappers are reused by every test that needs setup; a spec never hand-rolls a raw HTTP call.
API wrappers may be called from tests, `actions/`, or setup helpers — **never from a page
object** (page objects are browser-only, §3.1).

### 3.5 `browser/` — Page-bound helpers

Functions that need a `Page` but aren't page objects (e.g. reading an analytics data layer,
building a locator from a testid). The home for browser-bound helpers that don't belong to a
single page.

### 3.6 `test-data/` & `types/`

`test-data/` holds **constants only** (URLs, ids, cookies, ticket-system suite ids). Sensitive
values come from `process.env`, never hardcoded (add a placeholder to `.env.example`). `types/`
splits `external/` (API/3rd-party shapes) from `internal/` (internal structures).

### 3.7 `fixtures/` — dependency injection & setup

The base fixture is the **single import source** for `test` and `expect` in every spec. It:
- **Injects every page and block object** as a fixture (page objects are lazy locator holders,
  so all of them can be constructed up front regardless of navigation state).
- **Injects required cookies / feature flags** before each test.
- **Auto-logs** test start/finish.

```ts
import { test as base, expect } from '@playwright/test';

import { PageClassProductDetail } from '@page-object/pages/pdp.page';
import { PageClassCheckout } from '@page-object/pages/checkout.page';
import { COOKIE_AUTOMATED_USER /* … */ } from '@test-data/cookies';

type Fixtures = {
    productDetailPage: PageClassProductDetail;
    checkoutPage: PageClassCheckout;
};

export const test = base.extend<Fixtures>({
    // setup: cookies + logging (auto)
    page: async ({ page }, use) => {
        await page.context().addCookies([COOKIE_AUTOMATED_USER /* … */]);
        await use(page);
    },
    // injected page objects
    productDetailPage: async ({ page }, use) => use(new PageClassProductDetail(page)),
    checkoutPage:      async ({ page }, use) => use(new PageClassCheckout(page)),
});

export { expect };
```

> **POM access rule.** Specs obtain page objects from **injected fixtures**, not by `new`-ing
> them. Navigation methods still run `waitForPageLoad()` and may return the next page object for
> chaining, but the canonical access is the fixture. Do **not** inject separate "method classes"
> — single-page action logic lives in the page/block's own methods; cross-page flows live in
> `actions/`.

Provide **env-gated fixture variants** (e.g. `staging.fixture.ts` that auto-skips when
`IS_PRODUCTION=true`) so environment-specific specs need no manual `test.skip`.

**Authentication is reused, never re-performed through the UI per test — but not at the cost of
isolation.** Two mechanisms, by need:
- **Per-test API user (default for anything that mutates account state).** A fixture creates a
  **fresh user via the API** and injects its session cookies into the context, so each test
  starts signed in as its *own* isolated user (no shared account). This is the per-test
  data-isolation rule from §7 applied to auth.
- **Shared `storageState` (only for read-only / expensive auth).** Authenticate once in a setup
  project, save `storageState`, and load it via `use: { storageState }` — acceptable **only**
  when tests don't mutate the shared account. If a test changes account data, it must create its
  own user instead.

Either way the UI login flow itself is exercised in exactly one place (§7). Lightweight
feature-flag cookies go through the base fixture's cookie injection.

---

## 4. The Grab → Parse → Assert Data Flow

```ts
// page object — GRAB (and optionally delegate parsing to a utility)
async getPriceTexts(): Promise<string[]> {
    const texts = await this.arrayPrices.allTextContents();
    expect(texts.length, `[${LABEL_PDP}] Prices should not be empty`).toBeGreaterThan(0);
    return texts;
}

// utility — PARSE (pure, unit-tested)
export function parsePrices(texts: string[]): Price[] { /* … */ }

// spec — ASSERT
const prices = parsePrices(await productDetailPage.getPriceTexts());
expect(prices[0].amount, `[${LABEL_PDP}] First price should match`).toBe(expected);
```

Never collapse these into one expression; never put `.replace()`/`parseFloat()`-style logic in a
spec or page method.

**Use this flow only when raw DOM strings must be transformed** (parsed into numbers, objects, or
arrays) for the assertion. For a plain check — visible text, input value, element count — assert
**directly with a built-in web-first assertion** and skip the grab/parse entirely:

```ts
// ✅ no parsing needed — assert directly on the locator (auto-waiting, built-in)
await expect(productDetailPage.textProductName,
    `[${LABEL_PDP}] Product name should match`).toHaveText('Basic T-Shirt');
await expect(catalogPage.productCard,
    `[${LABEL_CATALOG}] Catalog should show 12 products`).toHaveCount(12);

// ❌ don't pull text out and value-compare when a built-in assertion would do
const name = await productDetailPage.textProductName.textContent();
expect(name).toBe('Basic T-Shirt');
```

`expect(value).toBe(…)` is reserved for data that was genuinely parsed (e.g. comparing a computed
price total) — not as a substitute for `toHaveText`/`toHaveValue`/`toHaveCount`.

---

## 5. Locator Conventions

- **`readonly` class fields — no constructor.** Page objects and blocks declare **no
  constructor**; the base class (`BasePage` / `BaseBlock`) wires `page`. Locators are `readonly`
  fields that reference `this.page`, declared in **UI order** (top-to-bottom, left-to-right).
  Static locators evaluate eagerly (may reference `this.page` or an earlier field); parameterized
  locators are arrow-function fields (`(arg) => this.page…`) that evaluate lazily, so they may
  reference any field. Never `get` accessors (they rebuild the Locator each access); never build
  a top-level `this.page` locator inside a method (chaining from an existing locator inline is
  fine).
- **Selector priority**: built-ins (`getByTestId` → `getByRole` → `getByLabel` → `getByText` →
  `getByPlaceholder`) → CSS → XPath (only for relationships CSS can't express).
- **Prefer one dynamic locator** over N near-identical static properties — as an arrow-function
  field: `readonly bySortOption = (option: string) => this.page…`.
- **Scope to avoid false matches** — chain from a parent container or `.filter()`, never a bare
  `page.locator('img')`.
- **`.describe()` on every locator**: `` `[${LABEL}] short description` `` — surfaces in traces
  and error output.
- **Name by element type**: `buttonClose`, `inputEmail`, `imageMain`, `textProductName`; arrays
  `arrayButtonsAddToCart`; dynamic `byStyleIdProductCard(id)`.

---

## 6. Spec Conventions

```ts
import { test, expect } from '@fixtures/base.fixture';

import { STYLES } from '@test-data/products';
import { TESTRAIL_SUITES } from '@test-data/testrail';
import { generateTags } from '@utilities/tags';

const productId = STYLES.tShirts.basicTShirt;

test.describe('PDP: Tabbed View', { tag: ['@frontend-team', '@pdp'] }, () => {
    test(
        '[TICKET-ID] - Check that all tabs are shown',
        {
            annotation: [{ type: 'Test', description: 'All recommendation tabs render on the PDP' }],
            tag: generateTags({ [TESTRAIL_SUITES.PDP]: [24029, 24030] }),
        },
        async ({ productDetailPage }) => {
            await productDetailPage.open(productId);

            await test.step('Check You May Also Like tab @24029', async () => {
                await expect(productDetailPage.blockRecommendations.tabYouMayAlsoLike).toBeVisible();
            });
            await test.step('Check More From This Brand tab @24030', async () => {
                await expect(productDetailPage.blockRecommendations.tabMoreFromThisBrand).toBeVisible();
            });
        },
    );
});
```

- **Import `test`/`expect` from the fixtures barrel** — never `@playwright/test` (only the
  fixture file may).
- **One flat `test.describe()` per file** — no nested describes (exception: data-driven files
  iterating a dataset). Describe name: `[Area]: [Feature]`.
- **Test name**: `[TICKET-ID] - Check that …` — start with `Check`/`Check that`, never an
  imperative verb. (Use the ticket prefix when the repo tracks one.)
- **Never `page.goto()` in a test** — always a page object's `open()`.
- **A test reads as test-case steps — each `test.step()` is one *action → expectation* pair.**
  The step **title names the action** the test performs (imperative, e.g. *"Add the product to
  the cart"*); the step **body performs that action and then asserts the expectation** — what
  should happen as a result. So the title is *what you do*, the contents are *what you expect to
  happen after doing it*.

  ```ts
  await test.step('Add the product to the cart', async () => {
      await productDetailPage.clickAddToCart();                       // the action (what the step tests)
      await expect(shoppingCartPage.lineItemBySku(sku),              // the expectation (what should happen)
          `[${LABEL_CART}] Added item should appear in the cart`).toBeVisible();
  });
  ```

  Also use steps for loop-iteration validations and for sub-checks mapped to distinct ticket
  cases. Do **not** create a step that only restates a lone assertion with no action behind it,
  and **no nested steps**.
- **Auto-waiting only** — no `waitForSelector`/`waitForLoadState`/`waitForTimeout`.
- **`expect()` messages**: mandatory inside page/block methods (with `[LABEL]`); optional in
  specs when the locator/var name makes failure self-explanatory — but biased toward including
  them, and labeled when present.
- **Soft assertions for independent multi-checks**: when a step verifies several *independent*
  properties and you want all failures reported at once (not fail-fast), use `expect.soft(...)`.
  Keep **hard** assertions for preconditions and for any check the rest of the step depends on
  (a soft failure lets execution continue, so don't soft-assert something a later line needs).
- **`test.skip()` in `beforeEach`** with a mandatory reason; gate on feature flags
  (`isActiveFrontend`/`isActiveAPI`), don't hardcode booleans.
- **Metadata**: structured `annotation` (`type: 'Test'` + ticket link) **and** a tag taxonomy —
  one team tag, page tags (`@pdp`, `@category-page`), feature tags, plus ticket-system linkage
  via a `generateTags()`-style helper. Use `test.info().annotations.push(...)` to attach debug
  payloads.
- **Test data** at file scope before `describe`, `array`-prefixed; `debugSample(array)` to run
  only the first element under `DEBUG_MODE` for fast local iteration.

---

## 7. Test Reliability — Determinism, Data Isolation & Parallel Execution

These three properties are **non-negotiable** and reinforce each other: isolated data makes a
test deterministic, and deterministic + isolated tests are safe to run in parallel.

### Deterministic
A test produces the same result on every run — regardless of order, machine, time of day, or
who else is running.
- No dependence on data created by another test, on "today's" date, on un-seeded randomness, or
  on pre-existing environment state. Pin every input: feature-flag cookies, locale/currency,
  viewport, and the exact entities under test.
- Wait on real conditions via `expect()` — never `waitForTimeout`/sleeps (a timing race *is*
  non-determinism).
- Assert exact outcomes (an event fires **exactly once**, a list has **exactly N** items), not
  "at least something".

### Data isolation
Each test owns the data it touches; no two tests share mutable state.
- **Every test creates its own entities via the API** (a fresh user / cart / order with a unique
  id or email), in a fixture or `beforeEach`. This is mandatory, not a preference.
- **Never share a seeded account or a single shared session across tests.** A shared login that
  multiple tests read/mutate is a data-isolation violation and a source of flakiness — each test
  signs in as *its own* freshly-created user.
- Never rely on test execution order, or on residue left by a previous run.
- Clean up data that would otherwise accumulate — but design so a *missed* cleanup can't break
  another test. Isolation first, cleanup second.

### Parallel-safe
Because tests are deterministic and isolated, the suite runs fully in parallel
(`fullyParallel: true`).
- No shared global state, no shared mutable login session, no "test A must run before test B".
- Each test runs in its own browser context (Playwright's default) — keep it that way; never
  reach across contexts or workers.

### Data preparation via the API
Set up preconditions through the **API**, never by driving the UI. UI-based setup is slow,
flaky, and couples the test to unrelated surfaces.
- Use the project's **existing `api/` request wrappers** (see §3.4) — do **not** hand-roll
  `fetch` / `page.request` calls in a spec or page object. If a needed endpoint wrapper is
  missing, **add it to the `api/` layer and reuse it**, rather than inlining a request.
- **Capture the application's real creation endpoint and reuse it.** To create test data, find
  how the app itself creates the entity (e.g. the signup request behind the UI — `GET` for the
  CSRF token, then `POST` the create endpoint) and wrap that in `api/`. Expose it as a
  **per-test fixture** (e.g. `newUser` / `authenticatedUser`) so each test provisions its own
  isolated entity automatically.
- API setup belongs in the **test**, a **fixture**, or a **setup/`actions` helper** — never in a
  page object (browser-only, §3.1).
- The canonical shape of a test:
  **create your own data via API → navigate via a page object's `open()` → assert via the UI.**

```ts
test('[TICKET-ID] - Check that a saved item appears in the cart', async ({ cartPage }) => {
    // 1. Prepare — deterministic, isolated data created over the API (existing wrapper)
    const { cartId, item } = await createCartWithItem({ sku: SKUS.basicTShirt });

    // 2. Navigate — via the page object, not page.goto
    await cartPage.open(cartId);

    // 3. Assert — UI behavior only
    await expect(cartPage.lineItemBySku(item.sku),
        `[${LABEL_CART}] Prepared item should appear in the cart`).toBeVisible();
});
```

### Exercise each UI path once
A given UI flow (log in, add to cart, apply a filter, complete checkout) is tested **through the
UI in exactly one test** — the test that owns that behavior. Every other test that just needs
the *resulting state* must **not** re-drive the same clicks.
- When several tests share the same pattern/flow, **extract it into a single shared helper and
  reuse it** — never duplicate the steps inline across files.
- **Prefer an API helper** (an `api/` request wrapper, §3.4) for the shared flow: it's faster and
  deterministic. Reproduce the flow through the UI only when the flow itself cannot be done over
  the API.
- Shared flows that genuinely must run through the browser live in `actions/` (§3.2); pure state
  setup lives in `api/` (§3.4). Either way the flow is **written once and reused**.
- Net effect: the suite stays fast, and each UI path has one source of truth — changing the flow
  updates one helper instead of many tests.

### Mock what you don't control
Only test what you own. **Third-party / external dependencies are stubbed at the network layer**
with `page.route(...)` + `route.fulfill(...)` — never hit live (they make tests slow,
non-deterministic, and fail for reasons outside the app).
- This is **distinct from first-party data prep**: own backend state is prepared through the
  `api/` layer (real calls, §3.4); *external* services (payment gateways, analytics, partner
  APIs, CDNs) are mocked.
- Keep route stubs in a fixture or `browser/` helper so specs stay declarative and the same stub
  is reused, not duplicated.

---

## 8. Configuration

- One `playwright.config.ts`; **projects = surfaces**, each with its own `testDir` and
  `workers` (e.g. `chromium` → `tests/frontend`, `mobile` → `tests/frontend-mobile`).
- `fullyParallel`, generous timeouts (`timeout` ~180 s, `expect.timeout` ~20 s, action/nav
  ~20–25 s), `trace` on (or on-first-retry), screenshot only-on-failure.
- Add a `webServer` block **only when the app under test runs locally**; suites targeting a
  deployed environment (staging/prod via `IS_PRODUCTION`) omit it.
- Separate config variants as needed (CI, scripts, report generation).
- **Cross-browser scope is an explicit, documented decision.** Playwright recommends covering
  Chromium + Firefox + WebKit. Narrowing the engine matrix (e.g. Chromium desktop + a mobile
  device + API only) is a legitimate cost/coverage trade-off — but state it deliberately and
  record what coverage is given up, rather than defaulting to one engine by omission.

---

## 9. Conventions & Tooling

- **Path aliases only — never relative imports** (`@fixtures`, `@actions`, `@page-object`,
  `@browser`, `@test-data`, `@project-types`, `@utilities`, `@logger`). Enforced import order:
  builtin → external → internal (internal in a fixed semantic order, alphabetized within group).
- **Structured `logger`, never `console.log`**; chalk color conventions per layer (green = page
  labels, cyan = computations, blue = fixtures; yellow = warn, red = error).
- **Parameters**: group optional params into a single options object with defaults; never mix a
  positional primitive with an options object; format multi-prop objects one property per line.
- **Naming**: files lowercase-with-hyphens (`pdp.tabbed-view.spec.ts`); methods are verbs
  (`clickAddToCart`); variables are nouns; arrays `array`-prefixed; no abbreviations for class
  instances (`productDetailPage`, not `pdpPage`).
- **Gates**: ESLint + `tsc --noEmit` + 100% utility unit coverage; pre-commit/pre-push hooks.
  Enable **`@typescript-eslint/no-floating-promises`** (Playwright calls this out by name — it
  catches missing `await`s on assertions/actions, the most common Playwright bug) and
  **`eslint-plugin-playwright`** for Playwright-specific lint rules.
- **Sensitive data** from `process.env` only.
- **Discover, don't guess — use the Playwright MCP.** Whenever you are uncertain how something
  actually works — a selector, a login/checkout/auth flow, why a step fails, what a page renders,
  which network calls fire — you **must** explore it live with the **Playwright MCP** (navigate,
  snapshot the DOM, inspect elements, read network/console) *before* writing or "fixing" code.
  Never invent selectors, URLs, or flow steps from assumption or from what legacy code implies —
  the live app may have diverged. Capture the real behavior with the MCP, then encode it. This is
  mandatory for migration work and for any debugging of a failing test.

---

## 10. Layer Cheat-Sheet — "where does this go?"

| You need to… | It goes in… |
|---|---|
| Locate an element | a page or block object (`readonly` locator) |
| Act on one page (click, fill, read) | a method on that page/block object |
| Move across pages in a journey | an `actions/` function |
| Prepare test data (create a cart / user / order, seed state) | an `api/` request wrapper, called from the test or a setup helper |
| Transform raw strings into structured data | a pure `utilities/` function |
| Touch the browser but not as a page (data layer, locator builder) | `browser/` |
| Store a URL, id, cookie, or ticket suite | `test-data/` (constant) |
| Describe a data shape | `types/` (`external/` or `internal/`) |
| Provide a page object / cookie / login to tests | `fixtures/` |
| Assert a behavior | the spec (`tests/<surface>/…`) |
