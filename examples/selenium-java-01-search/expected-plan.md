# Migration plan: input.spec.ts (Selenium Java -> Playwright TypeScript)

## Source framework
selenium-java

## Summary
Acme Shop site-search behaviour. Two scenarios: a keyword query returns a
visible grid whose first result contains the keyword in its title; and
submitting an empty query shows a hint message asking the user to enter a
search term.

## Anti-patterns detected
- [x] `Thread.sleep(2000)` / `Thread.sleep(1000)` (lines 41, 56) — hard
      waits; replace with web-first `toBeVisible()`.
- [x] `WebDriverWait + ExpectedConditions.visibilityOfElementLocated`
      (line 43) — Playwright's `expect(locator).toBeVisible()` is the
      direct, auto-retrying equivalent.
- [x] deep XPath `//header/div[2]/form/button` and
      `//div[contains(@class,'search-hint')]/span[2]` — fragile to layout
      changes; replace with role-based locators.
- [x] `driver.findElements(...).get(0)` (line 49) — positional access to
      a snapshot list; Playwright's `locator.first()` is auto-retrying and
      lazy.
- [x] `@BeforeEach` setting up `ChromeDriver` — Playwright provides this
      via the `page` fixture.
- [x] JUnit `assertEquals` / `assertTrue` — non-web-first, no auto-retry;
      Playwright's `expect(locator).toContainText()` waits for the
      condition.
- [x] `throws InterruptedException` boilerplate (a smell because it
      signals `Thread.sleep` use).

## Locator translation table
| Original | New | Confidence | Notes |
|---|---|---|---|
| `By.id("site-search")` | `page.getByRole('searchbox', { name: 'Search products' })` | medium | An `id="site-search"` input is most likely the search box. Role + accessible name is more semantic. If the input is not labelled, fall back to `getByPlaceholder('Search products')`. |
| `By.xpath("//header/div[2]/form/button")` | `page.getByRole('button', { name: 'Search' })` | high | The form's submit button — role-based locator is the canonical fix for deep XPath. |
| `By.cssSelector(".results-grid")` | `page.getByRole('article').first()` (as proxy) | medium | The original asserts the GRID is visible; the migrated test asserts the first article inside it is visible. Functionally equivalent if results are rendered as articles. Reviewer should confirm. |
| `By.cssSelector(".results-grid .product-card")` | `page.getByRole('article')` | medium | Assumes product cards are `<article>` elements. If they are generic `<div>`s, use `getByTestId('product-card')`. |
| `By.cssSelector(".product-card h3")` (first) | `results.first().getByRole('heading')` | high | Product titles as headings — the standard pattern. |
| `By.xpath("//div[contains(@class,'search-hint')]/span[2]")` | `page.getByText('Please enter a search term')` | high | The visible message is the assertable thing; the XPath is incidental. |

## Structural changes
- Extract POM: no — two short tests; POM would be premature.
- Extract fixture: no — `page` fixture already covers driver setup /
  teardown.
- Split into multiple specs: no.

## Open questions for reviewer
- Is the search box an `<input type="search">` with an accessible name?
  If it is just `<input id="site-search">`, the migrated test will need
  `getByPlaceholder` instead of `getByRole('searchbox')`.
- Are product cards rendered as `<article>` elements? If not, the
  `getByRole('article')` strategy will not work — switch to
  `getByTestId('product-card')`.
- The Selenium test asserts the FIRST title contains "linen". The
  migrated test does the same via `.first()`. If multi-product matching
  matters (e.g. all results should contain the keyword), reviewer should
  ask whether to upgrade the assertion to iterate.

## Risk callouts
- The Selenium test combines `Thread.sleep(2000)` with a `WebDriverWait`
  — the sleep is dead weight masking the wait. Migrated test relies only
  on web-first waits; if the search results actually take > 5 seconds to
  render, bump the default `expect` timeout for this assertion.
- `@AfterEach driver.quit()` is REPLACED by Playwright's automatic
  context teardown via the `page` fixture; no explicit cleanup needed.

## Expected metrics
- Selector quality score: 4/4 role-based (was 0/5 xpath / css).
- Smell count delta: -2 `Thread.sleep`, -1 `WebDriverWait`, -1 snapshot-
  list indexing, -2 JUnit assertions, -1 driver-setup boilerplate.
- LOC delta: 56 → 26 (-30 lines; massive saving because Playwright's
  page fixture replaces all of the setup / teardown machinery).
