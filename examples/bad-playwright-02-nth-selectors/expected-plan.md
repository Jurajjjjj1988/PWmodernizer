# Migration plan: input.spec.ts

## Source framework

**bad-playwright** — subtractive migration, no framework translation required. Source is already Playwright TypeScript; migration removes positional-locator anti-patterns + `test.only` correctness bug.

**Source file:** `examples/bad-playwright-02-nth-selectors/input.spec.ts`
**Target file(s):** `examples/bad-playwright-02-nth-selectors/expected-output.spec.ts`

## Summary

Product-listing page on the Acme Shop. With a stubbed 3-product catalogue, the user can add a specific product to the cart (cart badge shows count) and remove that product from a slide-out cart drawer (drawer shows an empty-state message). The original spec leans heavily on `.nth(N)` positional locators, which break the moment the layout changes.

### What bug does this catch?

Catches regressions where (a) clicking a product's add-to-cart button fails to increment the cart badge, and (b) the cart drawer's remove-item button fails to clear the cart and show the empty state.

### User-perceivable assertion checklist

- [ ] After click "Add to cart" on Wool Beanie: cart badge text becomes `"1"`
- [ ] After opening cart drawer: drawer is visible and contains "Linen Tee"
- [ ] After click "Remove Linen Tee" inside drawer: drawer shows empty-state copy
- [ ] Both tests run in CI (second test currently silently skipped by `test.only`)

## Anti-patterns detected

| Severity | Line | KB-ID | Anti-pattern | Snippet (≤60 chars) | Replacement |
|---|---|---|---|---|---|
| H | 17 | KB-1.1.8 | test-only-leftover | `test.only('adds product...', ...)` | remove `.only` — CORRECTNESS fix (second test currently silently skipped in CI) |
| H | 22 | KB-1.1.1 | hard-wait | `page.waitForTimeout(1500)` | `await expect(cartBadge).toHaveText('1')` |
| H | 25 | KB-1.1.5 | sync-probe | `expect(await el.innerText())` | `await expect(el).toHaveText(...)` |
| H | 36 | KB-1.1.5 | sync-probe | `expect(await el.isVisible()).toBe(true)` | `await expect(el).toBeVisible()` |
| M | 18 | KB-1.1.2 | index-selector | `.product-card.nth(2)` | `getByRole('article', { name: 'Wool Beanie' })` |
| M | 20 | KB-1.1.2 | index-selector | `productCards.nth(2).locator('button').nth(0)` | `card.getByRole('button', { name: 'Add to cart' })` |
| M | 21 | KB-1.1.2 | index-selector | `header > div .nth(1) span .nth(0)` (cart badge) | `getByRole('status', { name: /cart/i })` (LOW conf — see pins) |
| M | 25 | KB-1.1.3 | deep-css | `header > div` selector path | `getByRole('button', { name: /cart/i })` (cart icon click target) |
| M | 30 | KB-1.1.2 | index-selector | `cartDrawer li button.nth(1)` | `cartDrawer.getByRole('button', { name: 'Remove Linen Tee' })` |
| M | 30 | KB-1.1.3 | css-class | `page.locator('.cart-drawer')` | `getByRole('dialog', { name: /cart/i })` (MED conf — see pins) |
| L | 5-15 | KB-1.1.10 | inline-route-in-beforeEach | inline `page.route` in `beforeEach` duplicated across tests | extract to `shopPage` fixture for clarity and reuse |

## Locator translation table

| Original | New | Confidence | Notes |
|---|---|---|---|
| `page.locator('.product-card').nth(2)` | `page.getByRole('article', { name: 'Wool Beanie' })` | med | Assumes each card is `<article>` with accessible name. Fall back to heading-proxy or `data-testid`. |
| `productCards.nth(2).locator('button').nth(0)` | `card.getByRole('button', { name: 'Add to cart' })` | high | Primary CTA on a product card — role-based is unambiguous. |
| `page.locator('header > div').nth(1).locator('span').nth(0)` | `page.getByRole('status', { name: /cart/i })` | low | Best guess — cart badges often use `role="status"` with aria-label. Reviewer MUST confirm. |
| `page.locator('header > div').nth(1)` (click target) | `page.getByRole('button', { name: /cart/i })` | med | Assumes accessible button. If a link, switch to `getByRole('link', { name: /cart/i })`. |
| `page.locator('.cart-drawer')` | `page.getByRole('dialog', { name: /cart/i })` | med | Slide-out drawers commonly use `role="dialog"`. Fall back to `getByTestId('cart-drawer')`. |
| `cartDrawer li button.nth(1)` | `cartDrawer.getByRole('button', { name: 'Remove Linen Tee' })` | high | Per-item remove button SHOULD have aria-label naming the product. If not, that's itself an a11y bug worth raising. |

## Hallucination-defense pins

1. **Product card root** — assumed `<article>` with accessible name. If DOM uses `<div>` with a heading child: keep current `.product-card` CSS path, comment `'Q1 unresolved: card root element'`. Reviewer fallback: ask FE team to wrap in `<article>` OR add `data-testid="product-card"`.
2. **Cart badge** — assumed `getByRole('status', { name: /cart/i })`. If no `role="status"` and no aria-label: keep `header > div .nth(1)` CSS path (degraded), comment `'Q2: cart-badge a11y missing'`. Reviewer fallback: prefer adding `role="status"` + aria-label to the FE component over locking the test to brittle CSS.
3. **Cart drawer** — assumed `getByRole('dialog', { name: /cart/i })`. If just a styled `<aside>` with no role: fall back to `getByTestId('cart-drawer')`.
4. **Remove-item buttons** — assumed each has aria-label naming its product. If they all share generic `aria-label="Remove"`: the test cannot distinguish between items and the second-product remove flow becomes non-deterministic. Raise as a11y bug instead of hacking around it.

## Structural changes

- **Extract POM:** no — only two tests, and the `shopPage` fixture covers shared setup. A POM would be premature.
- **Extract fixture:** yes — `shopPage` fixture stubs the products API + navigates to the listing. Both tests start from the same baseline.
- **Split into multiple specs:** no — both tests are cart-related and share the same fixture.

## Open questions for reviewer

- Q1: Are product cards `<article>` elements with accessible names, or generic `<div>`s?
- Q2: Does the cart icon expose `aria-label="Open cart"` and the badge `role="status"`? If not, `data-testid` is more honest than pretending a role exists.
- Q3: Does each cart-line "Remove" button have an aria-label that names the product?
- Q4: Was the second test (cart-remove) ever passing locally? `test.only` on the first test means it has been skipped in CI — re-validate it works before merging.

## Risk callouts

- **`test.only` removal is a CORRECTNESS fix, not a stylistic one.** The second test was not running in CI before; this migration surfaces it. Reviewer should expect either (a) the second test now passes (good — coverage gained) or (b) it fails because of a real app regression that was hidden. Either way, **do not silently fix any new failure** in this test as part of the migration — that's out of scope.
- **Fixture data drift.** `shopPage` fixture stubs the products API; if the real app paginates, filters, or the schema changes, the fixture data must stay in sync with the production contract.
- **Cart badge accessibility.** Plan assumes `role="status"` on the badge. If the FE never had this, this migration is exposing an existing a11y gap — flag it for the FE team rather than papering over with `data-testid`.

## Expected metrics

- **Selector quality score (estimated):** 0.86 (6/7 role-based; 1 LOW remains pending pin resolution).
- **Smell count delta:** -8 `.nth()` calls, -1 `test.only`, -1 hard-wait, -2 sync probes, -1 deep-CSS path = **-13 smells removed, +0 introduced**.
- **LOC delta:** 38 → ~41 (+3; fixture adds ~10 LOC but removes inline duplication).
- **Anti-pattern coverage:** 11/11 cataloged.
