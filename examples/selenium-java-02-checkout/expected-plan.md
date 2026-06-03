# Migration plan: input.spec.ts (Selenium Java -> Playwright TypeScript)

## Source framework
selenium-java

## Summary
Three-step checkout flow on Acme Shop: shipping details, payment, review.
The user fills shipping, advances, fills card details (test card
`4242 4242 4242 4242`), advances to review, confirms the order total is a
currency value, places the order, and sees a personalised confirmation
heading.

## Anti-patterns detected
- [x] `Thread.sleep(1500)` / `Thread.sleep(2000)` (lines 43, 51, 60) —
      hard waits between steps; replace with web-first waits on the next
      step's first element.
- [x] `WebDriverWait + ExpectedConditions.visibilityOf` (lines 44-45) —
      translate to `expect(locator).toBeVisible()`.
- [x] PageFactory pattern with `@FindBy` (lines 65-74) — Selenium-only,
      eager-resolves elements at instantiation time. Playwright POMs use
      LAZY getters (`= () => this.page.getByLabel(...)`).
- [x] deep XPath `By.xpath("//section[3]/div/div[2]/span[2]")` (line 56)
      — fragile to layout changes; replace with role / label.
- [x] `Actions` builder for a single click (line 42) — overkill;
      `locator.click()` is sufficient.
- [x] JUnit `assertEquals` / `assertTrue` — non-web-first; use
      `expect(locator).toHaveText()`.
- [x] driver setup / teardown boilerplate (`@BeforeEach setUp`,
      `@AfterEach tearDown`) — replaced by Playwright's `page` fixture.

## Locator translation table
| Original | New | Confidence | Notes |
|---|---|---|---|
| `@FindBy(id = "shipping-name")` | `page.getByLabel('Full name')` | medium | Assumes the input has an associated `<label>`. If it is placeholder-only, switch to `getByPlaceholder('Full name')`. |
| `@FindBy(id = "shipping-address")` | `page.getByLabel('Street address')` | medium | Same assumption. |
| `@FindBy(id = "shipping-city")` | `page.getByLabel('City')` | medium | Same. |
| `@FindBy(id = "shipping-zip")` | `page.getByLabel('ZIP / postcode')` | medium | Same. UK address terminology — confirm against the live form. |
| `@FindBy(id = "card-number")` | `page.getByLabel('Card number')` | medium | Same. |
| `@FindBy(id = "card-expiry")` | `page.getByLabel('Expiry')` | medium | Same. |
| `@FindBy(id = "card-cvc")` | `page.getByLabel('CVC')` | medium | Same. |
| `@FindBy(css = "button.next-step")` | `page.getByRole('button', { name: 'Next' })` | high | Step-advancing button. |
| `@FindBy(css = "button.place-order")` | `page.getByRole('button', { name: 'Place order' })` | high | Final submit button. |
| `By.xpath("//section[3]/div/div[2]/span[2]")` | `page.getByRole('definition', { name: 'Order total' })` | low | Reviewer's call — the original XPath is opaque. Best guess: the order total is a `<dd>` paired with `<dt>Order total</dt>` (definition role). If it is just a styled span, use `getByTestId('order-total')`. |
| `By.cssSelector(".order-confirmation h1")` | `page.getByRole('heading', { level: 1 })` | medium | Assumes there is a single H1 on the confirmation page. If there are multiple, narrow with `name`. |

## Structural changes
- Extract POM: YES — checkout has 9 distinct locators across 3 steps;
  inlining them in a single test would obscure the user flow. A small
  POM with lazy getters captures the shape without the PageFactory
  eagerness.
- Extract fixture: no — single test; `page` fixture is enough.
- Split into multiple specs: no — single end-to-end happy path. (If we
  add per-step validation tests later, split then.)

## Open questions for reviewer
- The test uses the Stripe test card `4242 4242 4242 4242`. Should the
  migrated test stub the payment provider, or hit the real Stripe test
  endpoint? v0 mirrors the source (real test endpoint). For CI stability,
  consider stubbing in a follow-up.
- The order-total locator is the biggest unknown. Reviewer needs to
  confirm whether the markup uses a definition list (`<dt>`/`<dd>`),
  test-ids, or just styled spans.
- Confirmation page H1 — is it the only H1 on the page? If the page has
  layout-level headings, narrow the locator with a name regex.
- Currency assertion uses `/^\$\d+/` — does the shop use USD? If the
  app is multi-currency, the assertion needs to be currency-symbol-aware.

## Risk callouts
- The original spec uses raw `Thread.sleep(1500)` between step
  transitions; the migrated test relies on the NEXT step's first
  element becoming visible. If the app uses CSS transitions that delay
  visibility, the auto-retry will absorb it, but if a step renders
  blank-then-populated, the assertion timing could race.
- POM uses lazy getters (`= () =>`). If the team prefers
  `@playwright/test`'s `PageObjectModel` convention with readonly fields,
  this can be reshaped trivially. Lazy getters are recommended in 2026
  because they avoid stale-element issues across navigations.

## Expected metrics
- Selector quality score: 10/10 role/label-based (was 0/11 id / css /
  xpath via PageFactory).
- Smell count delta: -3 `Thread.sleep`, -1 `WebDriverWait`, -1 PageFactory,
  -1 deep XPath, -1 Actions builder, -2 JUnit assertions, -2 driver setup
  / teardown.
- LOC delta: 77 → 70 (-7 lines; POM trades teardown boilerplate for
  reusable structure).
