# Migration plan: checkout-flow.cy.js

## Source framework

Cypress — single-file spec at `inputs/cypress/checkout-flow.cy.js`. Framework version not inferable beyond `/// <reference types="cypress" />` (no `package.json` in the input directory). Target: Playwright TypeScript on the current stable major (v1.44+).

## Summary

The source spec exercises Beacon Shop's checkout funnel across two test cases: a happy-path credit-card purchase where the user updates a cart item's quantity, navigates to checkout, fills in payment details, and lands on the order-confirmation page; and an empty-cart guard that verifies the Checkout button becomes disabled once all cart items are removed. Both tests share a `beforeEach` that registers network spies (no response stubs) on `/api/cart` and `/api/checkout/pay`, navigates to `/cart`, waits for the spy to fire, and then adds a raw 800 ms hard wait. The spec hits a real backend — the migration converts this to deterministic `page.route` stubs throughout.

### What bug does this catch?

Catches a regression where the multi-step checkout funnel (cart quantity update → checkout navigation → payment form submission) fails to reach the order-confirmation page, and a separate regression where the Checkout button becomes active on an empty cart — allowing a user to initiate a $0 order.

### User-perceivable assertion checklist

**Scenario 1.1 — completes a credit-card checkout after updating cart quantity:**
- [ ] After navigating to `/cart`: cart renders with at least 2 rows visible
- [ ] After clicking "Update cart": (source does not assert the updated quantity — Stage 2 should add this; see Q15)
- [ ] After submitting the payment form: URL navigates to `/order-confirmed`
- [ ] After order confirmation: "Order confirmed" heading is visible
- [ ] After order confirmation: order summary total element containing `$` is visible

**Scenario 1.2 — disables the Checkout button when cart is empty:**
- [ ] After all items removed: empty cart banner is visible
- [ ] After all items removed: Checkout button (or its wrapper) is in a disabled state

## Anti-patterns detected

| Severity | Line | KB-ID | Anti-pattern | Snippet (≤60 chars) | Replacement |
|---|---|---|---|---|---|
| H | 20 | KB-1.2.1 | hard wait | `cy.wait(800)` | remove; wait on first cart row visible (`await expect(checkoutPage.cartRows.first()).toBeVisible()`) |
| H | 28 | KB-1.2.1 | hard wait | `cy.wait(500)` | replace with web-first assertion on updated cart state before proceeding |
| H | 16 | KB-1.2.7 | intercept without stub | `cy.intercept('GET', '/api/cart')` — spy only | `page.route('**/api/cart', r => r.fulfill({ status: 200, json: cartPayload }))` |
| H | 17 | KB-1.2.7 | intercept without stub | `cy.intercept('POST', '/api/checkout/pay')` — spy | `page.route('**/api/checkout/pay', r => r.fulfill({ status: 201, json: { orderId: 'ord_test_123' } }))` |
| H | 37–41 | KB-1.2.11 | `cy.wait(@alias).then()` assertion chain | `cy.wait('@payReq').then((inter) => { … })` | `const resp = await page.waitForResponse(filter); expect(resp.status()).toBe(201)` |
| H | 32 | KB-1.1.9 | hardcoded test card number | `cy.get('input[name="card"]').type('4242…')` | extract to `VALID_CARD.number` in `data/checkout-fixtures.ts` |
| H | 33 | KB-1.1.9 | hardcoded magic string (expiry) | `.type('12/30')` | `VALID_CARD.expiry` constant |
| H | 34 | KB-1.1.9 | hardcoded magic string (CVC) | `.type('123')` | `VALID_CARD.cvc` constant |
| M | 15 | KB-1.2.13 | magic-number viewport per-test | `cy.viewport(1366, 768)` | remove from test; configure `{ viewport: { width: 1366, height: 768 } }` in desktop project in `playwright.config.ts` |
| M | 19 | KB-1.2.36 | `cy.wait(@alias)` without explicit timeout | `cy.wait('@getCart')` — 5 s default, may flake | remove; `page.route` fulfills synchronously on stub; wait on positive UI signal instead |
| M | 26 | KB-1.2.2 | index-based `eq(N)` selector | `cy.get('.cart-row').eq(1)` | `.filter({ hasText: /<product name>/ })` — see Q1 |
| M | 26 | KB-1.2.30 | `clear().type()` pattern | `.find('.qty-input').clear().type('3')` | `await quantityInput.fill('3')` — atomic replacement, no mid-operation race |
| M | 27 | KB-1.2.6 | ambiguous `cy.contains()` | `cy.contains('Update cart').click()` | `page.getByRole('button', { name: /update cart/i })` — see Q3 |
| M | 30 | KB-1.2.6 | ambiguous `cy.contains()` | `cy.contains('Checkout').click()` | `page.getByRole('button', { name: /checkout/i })` — see Q4 |
| M | 42 | KB-1.2.32 | Cypress sync URL check | `cy.url().should('include', '/order-confirmed')` | `await expect(page).toHaveURL(/\/order-confirmed/)` — web-first, polls |
| M | 43 | KB-1.2.6 | ambiguous `cy.contains()` | `cy.contains('Order confirmed').should('be.visible')` | `page.getByRole('heading', { name: /order confirmed/i })` — see Q8 |
| M | 53 | KB-1.2.6 | ambiguous `cy.contains()` + parent scoping | `cy.contains('Checkout').parent().should(…)` | `page.getByRole('button', { name: /checkout/i })` + `.toBeDisabled()` |
| M | 24 | KB-1.2.3 | CSS-class primary selector | `cy.get('.cart-row').should('have.length.gte', 2)` | `page.getByTestId('cart-row')` or `getByRole('row')` — see Q1 |
| M | 26 | KB-1.2.3 | CSS-class selector | `.find('.qty-input')` | `getByLabel(/quantity/i)` — see Q2 |
| M | 35 | KB-1.2.3 | CSS-class selector | `cy.get('button.pay-now').click()` | `page.getByRole('button', { name: /pay now/i })` — see Q7 |
| M | 44 | KB-1.2.3 | CSS-class selector | `cy.get('.summary-total').should('contain', '$')` | `page.getByTestId('summary-total')` — see Q9 |
| M | 48 | KB-1.2.3 | CSS-class selector | `cy.get('.cart-row .remove-btn').each(…)` | `page.getByRole('button', { name: /remove/i })` — see Q5 |
| M | 52 | KB-1.2.3 | CSS-class selector | `cy.get('.empty-cart-banner').should('be.visible')` | `page.getByRole('status')` or `getByRole('alert')` — see Q10 |
| L | 42 | KB-1.2.32 | URL substring match instead of pattern | `cy.url().should('include', '/order-confirmed')` | `await expect(page).toHaveURL(/\/order-confirmed/)` |

### Unclassified smells

**CSS-class disabled-state assertion (line 53):** `cy.contains('Checkout').parent().should('have.class', 'is-disabled')` asserts on the Checkout button's *parent container's CSS class* rather than the button's functional `disabled` attribute. If the frontend applies the CSS class without setting `disabled` (or vice versa), this assertion gives a false green. No KB entry for "CSS-class proxy for semantic disabled state." Reviewer should confirm whether `toBeDisabled()` (checks `disabled` attribute + `aria-disabled`) is the correct replacement or whether the element is only visually styled. See Q11.

## Locator translation table

| Original | New | Confidence | Notes |
|---|---|---|---|
| `cy.get('.cart-row')` | `page.getByTestId('cart-row')` | low | CSS class only; no testid or ARIA role evidence; Q1 |
| `cy.get('.cart-row').eq(1)` | `page.getByTestId('cart-row').filter({ hasText: /<product name>/ })` | low | Index selector on CSS class; product name for row 2 unknown; Q1 |
| `.find('.qty-input')` | `page.getByLabel(/quantity/i)` | med | `qty-input` name implies a quantity field; visible `<label>` unconfirmed; Q2 |
| `cy.contains('Update cart')` | `page.getByRole('button', { name: /update cart/i })` | med | Text is visible; element role assumed `<button>`, could be `<a>`; Q3 |
| `cy.contains('Checkout')` | `page.getByRole('button', { name: /checkout/i })` | med | Text visible; role could be `<button>` or `<a>` link; Q4 |
| `cy.get('input[name="card"]')` | `page.getByLabel(/card number/i)` | med | `name="card"` implies card-number field; visible label text unconfirmed; may be inside a payment iframe — Q6 |
| `cy.get('input[name="exp"]')` | `page.getByLabel(/expiry\|expiration\|exp date/i)` | med | `name="exp"` implies expiry field; label text unconfirmed; iframe risk — Q6 |
| `cy.get('input[name="cvc"]')` | `page.getByLabel(/cvc\|cvv\|security code/i)` | med | `name="cvc"` implies CVC field; label unconfirmed; iframe risk — Q6 |
| `cy.get('button.pay-now')` | `page.getByRole('button', { name: /pay now/i })` | med | CSS class `pay-now` suggests accessible name "Pay now"; unconfirmed; Q7 |
| `cy.contains('Order confirmed')` | `page.getByRole('heading', { name: /order confirmed/i })` | med | Confirmation-page headline; assumed `<h1>/<h2>` but could be non-heading; Q8 |
| `cy.get('.summary-total')` | `page.locator('.summary-total')` | low | CSS class only; no testid or role evidence; reviewer should request `data-testid`; Q9 |
| `cy.get('.cart-row .remove-btn')` | `page.getByRole('button', { name: /remove/i })` | med | Class `remove-btn` implies "Remove" label; accessible name unconfirmed; Q5 |
| `cy.get('.empty-cart-banner')` | `page.getByRole('status')` | low | CSS class only; ARIA role unknown (could be `<aside>`, `<div>`, or `role="alert"`); Q10 |

## Hallucination-defense pins

1. **Cart row container** — assumed `page.getByTestId('cart-row')`. If DOM lacks `data-testid`: keep `locator('.cart-row')`, add WHY-comment `'Q1 unresolved: no testid on cart-row element'`. Reviewer fallback: ask FE team to add `data-testid="cart-row"` to the cart row component.

2. **Second cart row (index 1)** — assumed `page.getByTestId('cart-row').filter({ hasText: /<product name>/ })`. If product name is unknown or unstable: keep `locator('.cart-row').nth(1)` with comment `'Q1 unresolved: second row identity unknown, using positional fallback'`. Reviewer fallback: provide the expected product name for the second row so Stage 2 can filter by text.

3. **Quantity input** — assumed `page.getByLabel(/quantity/i)` scoped within the filtered row. If the input has no `<label>`: keep `locator('.qty-input')` scoped within the row, add comment `'Q2 unresolved: quantity input has no confirmed accessible label'`. Reviewer fallback: confirm the `<label>` text or `aria-label` value on the quantity field.

4. **"Update cart" button** — assumed `page.getByRole('button', { name: /update cart/i })`. If element is `<a>` not `<button>`: use `page.getByRole('link', { name: /update cart/i })`, add comment `'Q3 unresolved: element role assumed button'`. Reviewer fallback: inspect the DOM to confirm `<button>` vs `<a>`.

5. **"Checkout" button / link** — assumed `page.getByRole('button', { name: /checkout/i })`. If element is a link: use `page.getByRole('link', { name: /checkout/i })`, add comment `'Q4 unresolved: element role assumed button'`. Reviewer fallback: inspect DOM to confirm element type.

6. **Card number input** — assumed `page.getByLabel(/card number/i)`. Critical unknown: if card inputs are inside a Stripe / third-party iframe, all three card locators MUST be scoped to `page.frameLocator('iframe[name="stripe-…"]')` (iframe selector TBD). If top-level but no `<label>`: keep `locator('input[name="card"]')`, add comment `'Q6 unresolved: label absent or inside iframe'`. Reviewer fallback: confirm iframe presence and iframe selector, or confirm label text.

7. **Expiry input** — assumed `page.getByLabel(/expiry|expiration|exp date/i)`. Same iframe risk as pin 6. If no label: keep `locator('input[name="exp"]')`, add comment `'Q6 unresolved'`. Reviewer fallback: as for card number.

8. **CVC input** — assumed `page.getByLabel(/cvc|cvv|security code/i)`. Same iframe risk as pin 6. If no label: keep `locator('input[name="cvc"]')`, add comment `'Q6 unresolved'`. Reviewer fallback: as for card number.

9. **"Pay now" button** — assumed `page.getByRole('button', { name: /pay now/i })`. If accessible name differs (e.g., "Pay", "Place order", "Submit payment"): keep `locator('button.pay-now')`, add comment `'Q7 unresolved: button accessible name not confirmed'`. Reviewer fallback: inspect button's text content or `aria-label`.

10. **Order summary total** — assumed `page.locator('.summary-total')` (CSS fallback, LOW confidence). If testid exists: prefer `page.getByTestId('summary-total')`, update comment to `'Q9 resolved'`. Reviewer fallback: request `data-testid="summary-total"` from the FE team to eliminate the CSS-class dependency.

11. **"Order confirmed" heading** — assumed `page.getByRole('heading', { name: /order confirmed/i })`. If rendered as a non-heading `<div>` or `<p>`: use `page.getByText(/order confirmed/i)`, add comment `'Q8 unresolved: element is not a heading'`. Reviewer fallback: inspect the order confirmation page DOM to confirm element tag.

12. **Remove item button(s)** — assumed `page.getByRole('button', { name: /remove/i })`. If accessible name differs (e.g., "Delete", "×", or "Remove item"): keep `locator('.remove-btn')`, add comment `'Q5 unresolved: remove button accessible name not confirmed'`. Reviewer fallback: inspect each remove button's text content or `aria-label`.

13. **Empty cart banner** — assumed `page.getByRole('status')` or `page.getByRole('alert')`. If neither ARIA role is set: keep `locator('.empty-cart-banner')`, add comment `'Q10 unresolved: empty cart banner has no confirmed ARIA role'`. Reviewer fallback: add `role="status"` (informational) or `role="alert"` (urgent) to the empty-cart component — role choice depends on product intent.

## Structural changes

- **Extract POM: YES** — `outputs/tests/pages/checkout.page.ts` exporting `CheckoutPage`. Justification: the checkout flow is an explicit non-trivial state machine (cart page → checkout form → payment → order confirmation), which is one of the POM extraction triggers in `migration-rules.md` §1 that fires *even under 200 LOC*. The POM encapsulates cart locators, payment form locators, and named action methods so the test reads as a user story.

  **`CheckoutPage` must contain:**
  - `cartRows: Locator` — the collection of cart row elements
  - `checkoutButton: Locator` — the proceed-to-checkout button/link
  - `updateCartButton: Locator` — the update-cart submit button
  - `emptyCartBanner: Locator` — empty cart state indicator
  - `orderConfirmedHeading: Locator` — post-payment confirmation heading
  - `summaryTotal: Locator` — order summary total element
  - `cardNumberInput: Locator` — card number field (scoped to frame if Q6 confirms iframe)
  - `expiryInput: Locator` — expiry field
  - `cvcInput: Locator` — CVC field
  - `payNowButton: Locator` — pay/submit button
  - `navigate(): Promise<void>` — `goto('/cart')`; wait for first cart row visible
  - `updateItemQuantity(row: Locator, qty: number): Promise<void>` — fills qty input within `row`, clicks update button
  - `proceedToCheckout(): Promise<void>` — clicks checkout button
  - `submitPayment(card: CardInput): Promise<void>` — fills all three card fields, clicks pay button
  - `removeAllItems(): Promise<void>` — loops through remove buttons until none remain (used by test 1.2)

  The POM does **not** assert. All `expect` calls stay in the spec file.

- **Extract fixture: YES** — `outputs/tests/fixtures/checkout.fixture.ts` providing `cartMocks` with `{ auto: true }`. It stubs:
  - `GET **/api/cart` → 200 with a fixed two-item cart payload (sourced from `CART_ITEMS` in the data file)
  - `POST **/api/checkout/pay` → 201 with `{ orderId: 'ord_test_123' }`

  For scenario 1.2 (empty cart), the test-body must override the cart route to return an empty items array *before* navigating; the auto-fixture's stub is the beforeEach default and can be overridden per-test via a last-registered `page.route` (last-wins, matching the pattern from `examples/reference/company-style.spec.ts`).

  See Q14 regarding whether a remove-item API endpoint also needs stubbing.

- **Extract data file: YES** — `outputs/tests/data/checkout-fixtures.ts` exporting:
  - `VALID_CARD: { number: string; expiry: string; cvc: string }` — replaces the three hardcoded magic strings on lines 32–34
  - `CART_ITEMS: CartItem[]` — the two-item cart fixture payload used in the route stub; shape TBD per Q12

- **Split into multiple specs: NO** — both scenarios are cohesive (same checkout feature, one positive path, one guard path). A single `test.describe("Beacon Shop — checkout")` with two tests is appropriate.

- **Recommended output file:** `outputs/tests/checkout-flow.spec.ts`

## Open questions for reviewer

```
Q1: Cart row selector and second-row identity
Context: line 26, `cy.get('.cart-row').eq(1).find('.qty-input').clear().type('3')`
What I assumed: LOW confidence `locator('.cart-row').nth(1)` as positional fallback.
Impact if wrong: Stage 2 updates the wrong cart item, making the quantity assertion meaningless (or missing entirely).
Question: Does the `.cart-row` element have a `data-testid`? What is the product name shown in the second cart row so we can filter by text instead of by index?
```

```
Q2: Quantity input accessible label
Context: `.find('.qty-input')` on line 26
What I assumed: `getByLabel(/quantity/i)` (MED).
Impact if wrong: quantity input not found; fill fails with a timeout.
Question: Does the quantity field have a `<label>` or `aria-label`? If so, what is the label text?
```

```
Q3: "Update cart" element role
Context: `cy.contains('Update cart').click()` on line 27
What I assumed: `getByRole('button', { name: /update cart/i })` (MED).
Impact if wrong: locator matches nothing (role mismatch); test fails before reaching checkout.
Question: Is "Update cart" a `<button>` element or an `<a>` link?
```

```
Q4: "Checkout" element role
Context: `cy.contains('Checkout').click()` on line 30; `cy.contains('Checkout').parent()…` on line 53
What I assumed: `getByRole('button', { name: /checkout/i })` (MED).
Impact if wrong: locator fails; neither test proceeds past this step.
Question: Is "Checkout" a `<button>` or an `<a>` link to the checkout page?
```

```
Q5: Remove button accessible name
Context: `cy.get('.cart-row .remove-btn').each(…)` on line 48
What I assumed: `getByRole('button', { name: /remove/i })` (MED).
Impact if wrong: remove buttons not found; scenario 1.2 cannot empty the cart.
Question: What is the accessible name on each remove button — "Remove", "Delete", "×", "Remove item"?
```

```
Q6: Payment form — Stripe/third-party iframe?
Context: `cy.get('input[name="card"]')`, `input[name="exp"]`, `input[name="cvc"]` on lines 32–34
What I assumed: top-level page inputs with visible <label> elements; no iframe.
Impact if wrong: ALL three card locators fail silently; payment form cannot be filled.
Question: Are the card number, expiry, and CVC inputs rendered inside an embedded iframe
(e.g., Stripe Elements, Braintree)? If yes: what is the iframe selector
(e.g., `iframe[name="stripe-card-number"]`)? This single answer changes three locators from
`page.getByLabel(…)` to `page.frameLocator('…').getByLabel(…)`.
```

```
Q7: "Pay now" button accessible name
Context: `cy.get('button.pay-now').click()` on line 35
What I assumed: `getByRole('button', { name: /pay now/i })` (MED).
Impact if wrong: pay button not found; test fails at the submission step.
Question: What is the exact visible text or aria-label on the submit-payment button?
```

```
Q8: "Order confirmed" element role
Context: `cy.contains('Order confirmed').should('be.visible')` on line 43
What I assumed: `getByRole('heading', { name: /order confirmed/i })` (MED).
Impact if wrong: heading query returns no element; the URL assertion passes but the heading
assertion fails, masking whether the right page was rendered.
Question: Is "Order confirmed" rendered as an `<h1>` / `<h2>` heading, or as a `<p>` / `<div>`?
```

```
Q9: Summary total testid / role
Context: `cy.get('.summary-total').should('contain', '$')` on line 44
What I assumed: CSS fallback `locator('.summary-total')` (LOW).
Impact if wrong: assertion passes even if the element is renamed or removed; CSS-class coupling
was the original smell.
Question: Does `.summary-total` have a `data-testid`? If not, can one be added?
```

```
Q10: Empty cart banner ARIA role
Context: `cy.get('.empty-cart-banner').should('be.visible')` on line 52
What I assumed: `locator('.empty-cart-banner')` CSS fallback (LOW).
Impact if wrong: wrong ARIA query returns no element; scenario 1.2 assertion fails.
Question: Does `.empty-cart-banner` carry role="alert", role="status", or no ARIA role?
```

```
Q11: Checkout button disabled state mechanism
Context: `cy.contains('Checkout').parent().should('have.class', 'is-disabled')` on line 53
What I assumed: `toBeDisabled()` — checks the HTML `disabled` attribute.
Impact if wrong: test passes even if the button is functionally clickable (CSS applied but
disabled attribute absent), meaning the empty-cart guard is not actually tested.
Question: When the cart is empty, does the Checkout button have the HTML `disabled` attribute
set, or is it only visually styled via the `is-disabled` CSS class?
```

```
Q12: API stub payloads
Context: lines 16–17, cy.intercept without response bodies
What I assumed: cart stub returns two generic items; pay stub returns { orderId: 'ord_test_123' }.
Impact if wrong: the SUT's render code may throw on missing required fields (e.g., price,
productId), causing the page to break before any assertion runs.
Question: What is the minimum cart item shape the frontend needs to render?
(e.g., { id, name, qty, price }) What fields does the pay response need beyond orderId?
```

```
Q13: Preserve or drop HTTP-level assertions
Context: lines 37–41, cy.wait('@payReq').then(interception => { expect statusCode + orderId })
What I assumed: preserve as `page.waitForResponse` + flat assertions — they add a contract
that the backend returns a valid order ID prefix.
Impact if dropped: a backend returning HTTP 200 with a malformed body still passes the test.
Impact if kept: Stage 2 must emit a `waitForResponse` before the click and assert on the
response object, adding ~8 lines and a non-UI assertion.
Question: Should Stage 2 preserve the backend response assertions (statusCode + orderId prefix)
or replace them with UI-only assertions (URL + heading)?
```

```
Q14: Remove-item API endpoint
Context: lines 48–50, each `.remove-btn` is clicked; the cart presumably calls an API
What I assumed: clicking "Remove" triggers a DELETE or PATCH to some cart-item endpoint.
Impact if wrong: if the remove endpoint is not stubbed, clicking remove either hits the real
backend (non-deterministic) or fails with a network error, breaking scenario 1.2.
Question: What API endpoint does the "Remove" button call? (e.g., DELETE /api/cart/items/:id
or POST /api/cart/remove) This endpoint also needs a page.route stub in checkout.fixture.ts.
```

```
Q15: Missing post-update assertion
Context: line 27–28, source clicks "Update cart" then waits 500 ms with no assertion
What I assumed: Stage 2 should add `await expect(qtyInput).toHaveValue('3')` after updating.
Impact if no assertion: test continues to checkout without confirming the cart actually
updated — the 500 ms wait was masking this gap.
Question: Should Stage 2 add an assertion on the updated quantity value after clicking
"Update cart"? This adds a check the source was missing (a genuine improvement) but is not
present in the source's observable-outcome list.
```

## Risk callouts

- **Stripe/payment iframe (HIGH RISK):** If the card number, expiry, and CVC inputs are inside a third-party payment iframe (Stripe Elements is common), ALL three card locators will resolve to nothing at the top-level page. The test will timeout on the card number fill, and the failure message will not point at the iframe. This is the single most likely reason Stage 2 would produce a test that passes linting but fails at runtime. Confirm Q6 before Stage 2 runs.

- **`cy.wait(800)` masks real cart-load latency:** The 800 ms wait in `beforeEach` may be covering a genuine backend slowness on the cart endpoint. Replacing it with `await expect(checkoutPage.cartRows.first()).toBeVisible()` will expose this — if the cart endpoint takes >5 s on CI, the `actionTimeout: 5000` will fire. The stub-based migration eliminates this risk entirely (stub fulfills synchronously); confirm the intent is to stub (Q12) before Stage 2 proceeds.

- **`have.length.gte` → exact count:** The source asserts `cy.get('.cart-row').should('have.length.gte', 2)`. Playwright's `toHaveCount` requires an exact number. The migration pins the count to however many items the route stub returns (see Q12). If the stub always returns 2 items, `toHaveCount(2)` replaces the assertion exactly. Stage 2 must not silently drop the count check.

- **Empty cart via route override vs. UI removal:** Test 1.2 removes items via clicking each remove button. Stage 2 can either (a) loop through `getByRole('button', { name: /remove/i })` items and click each (faithful to original, tests real UI removal), or (b) override the cart route in the test body to return `{ items: [] }` before navigating (deterministic but skips the removal flow). Option (b) is cleaner for Playwright but loses coverage of the "remove" button interaction. Confirm preference with reviewer and see Q14 for the required stub endpoint.

- **Network-dependent → stub transition:** The source makes real API calls against a running backend. The migration converts both endpoints to `page.route` stubs. This changes the test from an integration test to a mocked E2E test. If the project's intent is to always hit a real server, the route stubs must be removed and replaced with `page.waitForResponse` synchronizers. Confirm with reviewer (Q12/Q13).

- **Selector quality degrades to 0.77 without reviewer input:** Three LOW-confidence locators (`.cart-row`, `.summary-total`, `.empty-cart-banner`) will fall back to CSS-class selectors if Q1, Q9, Q10 are not answered before Stage 2 runs. The resulting test still runs but the three locators remain fragile on style refactors. Stage 2 must emit `// Q* unresolved` WHY-comments on each CSS fallback so they are visible in code review.

## Expected metrics

- **Selector quality score (estimated post-migration):** 0.77 (10/13 locators resolved to role/label; 3 LOW-confidence fallbacks to CSS pending Q1/Q9/Q10). Score rises to ~1.0 if reviewer provides testids for the three LOW rows.
- **Smell count delta:** −24 (8 H-severity removed: 2 hard waits + 2 un-stubbed intercepts + 1 wait-then chain + 3 hardcoded card strings; 14 M-severity removed: 1 viewport + 1 aliased wait + 1 eq-index + 1 clear-type + 4 cy.contains + 6 CSS-class selectors; 1 L-severity removed: URL substring check; 1 unclassified CSS disabled assertion removed)
- **LOC delta:** source ~55 LOC → spec ~90 + POM ~70 + fixture ~40 + data ~20 = ~220 total output LOC (+165 net; POM + stub setup more than doubles raw line count)
- **Anti-pattern coverage:** 24/24 (23 KB-classified + 1 KB-UNCLASSIFIED; all addressed in plan)
