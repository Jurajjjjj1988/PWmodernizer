# Migration plan: input.spec.ts

## Source framework
bad-playwright

## Summary
Product-listing page on the Acme Shop. With a stubbed 3-product catalogue,
the user can add a specific product to the cart (cart badge shows count)
and remove that product from a slide-out cart drawer (drawer shows an
empty-state message). The original spec leans heavily on `.nth(N)`
positional locators, which break the moment the layout changes.

## Anti-patterns detected
- [x] `.nth(N)` positional locators (lines 18, 20, 21, 25, 30, 33) — the
      first test relies on the products being in array order; the second
      test uses `header > div` followed by `.nth(1)` to pick the cart icon
      — both will silently target the wrong element if the DOM changes.
- [x] `test.only` leftover (line 17) — would prevent the second test from
      running in CI; must be removed.
- [x] inline `page.route` in `beforeEach` (lines 5-15) — duplicated across
      tests, hides the test data setup; extract to a fixture for clarity
      and reuse.
- [x] hard-wait `page.waitForTimeout(1500)` (line 22) — replace with a
      web-first `toHaveText('1')` on the cart badge.
- [x] non-web-first assertions (lines 25, 36) — `expect(await el.innerText())`
      and `expect(await el.isVisible()).toBe(true)`.
- [x] deep CSS path `header > div > span` — fragile to wrapper-element
      changes; replace with an accessible role / name.

## Locator translation table
| Original | New | Confidence | Notes |
|---|---|---|---|
| `page.locator('.product-card').nth(2)` | `page.getByRole('article', { name: 'Wool Beanie' })` | medium | Assumes each card is rendered as `<article>` with an accessible name. If the card root is a `<div>` with a heading, use `page.getByRole('heading', { name: 'Wool Beanie' }).locator('..')` or a `data-testid`. |
| `productCards.nth(2).locator('button').nth(0)` | `card.getByRole('button', { name: 'Add to cart' })` | high | The product card's primary CTA is almost certainly the add-to-cart button — role-based locator is unambiguous. |
| `page.locator('header > div').nth(1).locator('span').nth(0)` | `page.getByRole('status', { name: 'Cart item count' })` | low | Best guess — cart badges often use `role="status"` with an `aria-label`. Reviewer must confirm; otherwise fall back to `getByTestId('cart-badge')`. |
| `page.locator('header > div').nth(1)` (as click target) | `page.getByRole('button', { name: 'Open cart' })` | medium | Assumes the cart icon is an accessible button. If it is a link, switch to `getByRole('link', { name: 'Cart' })`. |
| `page.locator('.cart-drawer')` | `page.getByRole('dialog', { name: 'Cart' })` | medium | Slide-out drawers commonly use `role="dialog"`. If it is just a styled `<aside>`, use `getByTestId('cart-drawer')`. |
| `cartDrawer li button.nth(1)` | `cartDrawer.getByRole('button', { name: 'Remove Linen Tee' })` | high | The remove button per cart-line should have an aria-label that names the product. If it does not, that is itself an accessibility bug worth raising. |

## Structural changes
- Extract POM: no — only two tests, and the `shopPage` fixture covers the
  shared setup. A POM would be premature.
- Extract fixture: yes — `shopPage` fixture stubs the products API and
  navigates to the listing. Both tests start from the same baseline.
- Split into multiple specs: no — both tests are cart-related and share
  the same fixture.

## Open questions for reviewer
- Are product cards actually `<article>` elements with an accessible name,
  or generic `<div>`s? If `<div>`, we need a `data-testid` or a heading
  proxy.
- Does the cart icon expose an `aria-label="Open cart"` and the badge a
  `role="status"`? If not, switching to `data-testid` is more honest than
  pretending a role exists.
- Does each cart-line "remove" button have an `aria-label` that names the
  product (e.g. `Remove Linen Tee`)? Without that, the test cannot
  distinguish between remove buttons when there are multiple items.

## Risk callouts
- `test.only` removal is a CORRECTNESS fix, not a stylistic one — the
  second test was not running in CI before. Reviewer should re-validate
  that the second test passes; if it does not, that is a regression in
  the app, not in the migration.
- Fixture stubs the products API; if the real app paginates or filters,
  the fixture data must stay in sync with the source-of-truth schema.

## Expected metrics
- Selector quality score: 6/6 role-based (was 0/8 `.nth()`-based).
- Smell count delta: -8 `.nth()` calls, -1 `test.only`, -1 hard-wait, -2
  non-web-first assertions.
- LOC delta: 38 → 41 (+3 lines; fixture adds ~10 LOC but removes inline
  duplication and improves clarity).
