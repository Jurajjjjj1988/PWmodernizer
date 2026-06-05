# Migration plan: AddCookiesJupiterTest.java

## Source framework

**Selenium Java** — JUnit 5 (`org.junit.jupiter.api.{Test,BeforeAll,BeforeEach,AfterEach}`),
WebDriverManager (`io.github.bonigarcia.wdm.WebDriverManager`) for browser-binary provisioning,
AssertJ (`org.assertj.core.api.Assertions.assertThat`) for assertions, plain `ChromeDriver` instantiation.
No PageFactory, no `ThreadLocal<WebDriver>`, no `WebDriverWait`.
Version of JUnit: 5 (Jupiter). Selenium version inferred from import path `org.openqa.selenium` — likely 4.x.
**Target:** Playwright TypeScript, latest stable (v1.x as of 2026-06-05).

Single-file input — `AddCookiesJupiterTest.java`, 73 LOC. No sibling source files in `inputs/selenium-java/` for this test unit.

---

## Summary

This test exercises the browser's cookie-management API against a public Selenium demo page
(`bonigarcia.dev/selenium-webdriver-java/cookies.html`). It navigates to the page, injects a new
cookie via the WebDriver cookie API, reads it back to verify the value round-trips, then clicks a
"Refresh cookies" button with no follow-up assertion on what the page renders.

The test is **substantively deficient** in two ways:

1. Its only `assertThat(...)` is an internal cookie-API round-trip check — verifying that
   `driver.manage().getCookieNamed("new-cookie-key").getValue()` equals the string we just set. This
   is not user-perceivable state; it tests WebDriver's own cookie plumbing, not the application's UI.
2. The click on `#refresh-cookies` (line 69) has no follow-up assertion. The test ends on an action,
   meaning it "passes" even if the page crashes, goes blank, or fails to display the new cookie.

The migration MUST add a web-first assertion after the click verifying visible cookie output (see Q3
and Q5). Without that, the migrated test has zero observable outcome assertions and will be rejected
by `migration-rules.md §2` and the post-generate evaluator.

### What bug does this catch?

Catches a regression where a cookie added programmatically to the browser context is not preserved or
displayed by the cookies-page UI — though only after adding the missing post-click assertion during
migration, because the source test does not assert the UI outcome at all.

### User-perceivable assertion checklist

- [ ] After `context.addCookies([{name: "new-cookie-key", value: "new-cookie-value", …}])`: the
  cookie is present in `context.cookies()` with value `"new-cookie-value"` (secondary, API-level;
  retain to confirm the cookie was actually stored before clicking refresh — see Q4)
- [ ] After clicking "Refresh cookies": the page visibly displays `"new-cookie-key"` (and/or its
  value) in the rendered cookie list — **currently MISSING from source; Stage 2 MUST add; see Q3, Q5**

---

## Anti-patterns detected

| Severity | Line | KB-ID | Anti-pattern | Snippet (≤60 chars) | Replacement |
|---|---|---|---|---|---|
| H | 52 | KB-1.3.1 | `Thread.sleep` hard wait | `Thread.sleep(Duration.ofSeconds(3).toMillis())` | Drop entirely; Playwright auto-disposes the browser context; debug via trace viewer / `--headed` |
| M | 39–42 | KB-UNCLASSIFIED | WebDriverManager auto-installer in `@BeforeAll` | `WebDriverManager.chromedriver().setup()` | Drop; Playwright provisions its own browsers via `npx playwright install`; no installer code needed |
| M | 44–47 | KB-1.3.12 | Manual driver lifecycle in `@BeforeEach` / `@AfterEach` | `driver = new ChromeDriver()` / `driver.quit()` | Drop both; Playwright `page` fixture is auto-provisioned and auto-disposed per test |
| M | 59–60 | KB-1.1.14 | Hardcoded environment URL | `https://bonigarcia.dev/selenium-webdriver-java/…` | Configure `baseURL: 'https://bonigarcia.dev'` in `playwright.config.ts`; use relative path in `goto()` |
| M | 63–67 | KB-1.3.23 | Cookie inspection via internal API (not user-perceivable) | `getCookieNamed(…).getValue()` | Retain as secondary `expect(cookie?.value).toBe(...)` assertion; add web-first UI assertion after the click (see Q5) |
| M | 69 | KB-UNCLASSIFIED | Action without follow-up assertion (test ends on a click) | `driver.findElement(By.id("refresh-cookies")).click()` | Add `await expect(...)` web-first assertion verifying the page reflects the new cookie |
| L | 51 | KB-UNCLASSIFIED | `// FIXME` debug comment in committed code | `// FIXME: pause for manual browser inspection` | Remove; `migration-rules.md §8` forbids TODO/FIXME; debug via trace viewer |

### Unclassified smells

**KB-UNCLASSIFIED — WebDriverManager auto-installer** (lines 39–42): Java has no dedicated KB-1.3.x
entry for the WebDriverManager pattern. The closest analogs are KB-1.4.20 (Python `webdriver-manager`)
and KB-1.4.26 (Python `chromedriver-autoinstaller`): both fetch the matching driver binary on each
test run, introducing a network-dependent flake source unrelated to the SUT. Playwright separates
browser provisioning (`npx playwright install`, once, before CI runs) from test execution entirely.
The whole `@BeforeAll` block is dropped — no target equivalent. Reviewer: confirm `@BeforeAll`
contains no domain logic beyond driver setup.

**KB-UNCLASSIFIED — Action without follow-up assertion** (line 69): `driver.findElement(By.id("refresh-cookies")).click()`
is the final statement in the test. `migration-rules.md §2` requires every test to end with at least
one assertion on a user-perceivable element. Stage 2 cannot infer the correct locator without a DOM
snapshot of `cookies.html`; see Q3 and Q5 for the open question and the fallback.

**KB-UNCLASSIFIED — `// FIXME` debug comment** (line 51): `migration-rules.md §8` forbids TODO/FIXME
comments in committed code. This comment was the stated rationale for the `Thread.sleep` hard wait
(line 52) — "pause for manual browser inspection". Both the comment and the sleep are dropped;
Playwright's `--headed` mode + Inspector (`page.pause()` removed per §8) and trace viewer provide the
debug experience without committed artifacts.

---

## Locator translation table

| Original | New | Confidence | Notes |
|---|---|---|---|
| `By.id("refresh-cookies")` (line 69) | `page.locator('#refresh-cookies')` | high | Mechanical `By.id` → CSS-ID translation per KB §6 Rule 1. Never promote to `getByRole` without DOM evidence. If reviewer confirms `<button>` with accessible name "Refresh cookies", Stage 2 MAY upgrade to `page.getByRole('button', { name: /refresh cookies/i })` — see Q2. |
| `[new — post-click assertion; no source equivalent]` | `page.getByText('new-cookie-key')` | low | New assertion required by `migration-rules.md §2`; the source has no DOM assertion after the click. DOM structure of `cookies.html` is unknown. Fallback: if text is not in a searchable node, try scoping to the cookies table container. See pin 1 and Q3, Q5. |

---

## Hallucination-defense pins

1. **Cookie display element (post-click assertion)** — assumed `page.getByText('new-cookie-key')`.
   If DOM contradicts (text not directly visible, wrapped in a table cell, or uses `data-testid`):
   keep `page.locator('#cookies-table')` or a CSS fallback, add WHY-comment
   `'Q5 unresolved: cookie display DOM structure not confirmed'`.
   Reviewer fallback: open `https://bonigarcia.dev/selenium-webdriver-java/cookies.html` in a browser,
   click "Add cookies" then "Refresh cookies", inspect the element that shows the new cookie, and
   replace the locator with `getByRole` or `getByTestId` as appropriate.

---

## Structural changes

**Per-file fate** (single-file input):

| Source file | Fate | Reason |
|---|---|---|
| `AddCookiesJupiterTest.java` | **KEPT — reshaped** to `outputs/tests/add-cookies-jupiter-test.spec.ts` | Single `@Test` method becomes one `test(...)` block |
| `@BeforeAll` block (lines 39–42) | **DROPPED** | `WebDriverManager.chromedriver().setup()` has no Playwright equivalent; browser management is external to tests |
| `@BeforeEach` block (lines 44–47) | **DROPPED** | `new ChromeDriver()` replaced by Playwright's auto-provisioned `page` fixture |
| `@AfterEach` block (lines 49–55) | **DROPPED** | `Thread.sleep` (anti-pattern) and `driver.quit()` (auto-disposed by fixture) both removed |

- **Extract POM:** No. Single page, estimated target ~35–40 LOC — well below the 200-LOC threshold in
  `migration-rules.md §1`. No repeated locator blocks.
- **Extract fixture:** No. Setup is minimal (`page.goto` + `context.addCookies`); no cross-test
  reuse warranted. Playwright's built-in `page` fixture is sufficient.
- **Split into multiple specs:** No. One test case, one feature domain.
- **Inline everything:** Yes. Cookie context operations (`page.context().addCookies(...)`,
  `page.context().cookies()`) accessed inline in the test body.
- **Output file:** `outputs/tests/add-cookies-jupiter-test.spec.ts` (kebab-case per
  `migration-rules.md §1`).

---

## Open questions for reviewer

```
Q1: Cookie domain specification for context.addCookies()
Context: Line 63. Selenium's Cookie constructor without a domain argument inherits the current
  page's domain automatically. Playwright's context.addCookies() requires an explicit `domain` +
  `path` pair OR a `url` field.
What I assumed: Navigate first (`await page.goto('/selenium-webdriver-java/cookies.html')`), then
  call `context.addCookies([{ name: 'new-cookie-key', value: 'new-cookie-value', url: page.url() }])`.
  The `page.url()` call captures the resolved URL at that point.
Impact if my assumption is wrong: The cookie may be silently scoped to the wrong domain (e.g.,
  'localhost' if goto hasn't settled) and therefore not visible to context.cookies() or the page.
```

```
Q2: Is #refresh-cookies a <button> element with accessible name "Refresh cookies"?
Context: Line 69. By.id("refresh-cookies") → page.locator('#refresh-cookies') is HIGH confidence
  per KB §6 Rule 1. But migration-rules.md §5 requires a comment when using locator('css') as a
  last resort (i.e., when role is not available).
What I assumed: Using page.locator('#refresh-cookies') as a safe mechanical translation with an
  inline comment. Not promoting to getByRole without DOM evidence.
Impact if my assumption is wrong: Minor only — both locators target the same element. If reviewer
  confirms <button> with accessible name, Stage 2 should upgrade to getByRole('button', {
  name: /refresh cookies/i }) for a 1.0 selector quality score.
```

```
Q3: What element on the page shows the new cookie after clicking "Refresh cookies"?
Context: After line 69. This is the critical missing assertion. The cookies.html page presumably
  renders a table or list of current cookies; after clicking refresh, the new cookie should appear.
What I assumed: Stage 2 fallback is page.getByText('new-cookie-key'). The cookie name is likely
  rendered as plain visible text in a table cell or list item.
Impact if my assumption is wrong: Stage 2 will produce a test that fails on first run — even though
  the underlying behavior is correct. Highest-risk open question in this plan. Reviewer should
  inspect the live page before Stage 2 runs.
```

```
Q4: Should the API cookie round-trip assertion (lines 63–67) be preserved in Playwright form?
Context: assertThat(newCookie.getValue()).isEqualTo(readValue) → equivalent to
  const cookies = await page.context().cookies(); const c = cookies.find(c => c.name === 'new-cookie-key');
  expect(c?.value).toBe('new-cookie-value'). This is a synchronous expect() on a resolved value,
  not a web-first assertion (no Locator is involved — see KB-1.3.23).
What I assumed: Keep as a secondary assertion immediately after addCookies, before the click. It
  confirms the cookie was actually stored (addCookies() returning void without effect would silently
  pass otherwise).
Impact if my assumption is wrong: Removing it simplifies the test and makes it purely UI-focused,
  which is cleaner. Acceptable if reviewer prefers the UI assertion alone as the sole signal.
```

```
Q5: What locator should Stage 2 use for the post-click "cookie is visible" assertion?
Context: New assertion required (no source equivalent). DOM of cookies.html unknown without inspection.
What I assumed: page.getByText('new-cookie-key') as fallback. See pin 1 above.
Impact if my assumption is wrong: The test fails on CI at the assertion step even though the page
  correctly shows the cookie. Reviewer should supply the correct locator after inspecting the live page.
```

```
Q6: Should baseURL in playwright.config.ts be set to https://bonigarcia.dev?
Context: Lines 59–60. Hardcoded URL to bonigarcia.dev. This is a public external demo SUT, not
  the project's own app.
What I assumed: Set baseURL: 'https://bonigarcia.dev' in playwright.config.ts and use the relative
  path /selenium-webdriver-java/cookies.html in goto().
Impact if my assumption is wrong: If the project's playwright.config.ts already has a baseURL
  pointing at a different SUT (the project's own app), adding bonigarcia.dev as the baseURL would
  break other tests. In that case, Stage 2 should use the full absolute URL with a justifying comment.
```

```
Q7: Should the cookie be added before or after page.goto()?
Context: Source navigates first (line 59–60), then adds cookie (lines 63–64). Playwright allows
  adding cookies before navigation by specifying domain explicitly, which would apply on the initial
  page load.
What I assumed: Maintain Selenium's order (navigate first, then addCookies with url: page.url())
  for a semantically faithful translation. For cookies.html's purpose (demonstrating cookie
  management, not affecting load behavior), the order does not matter functionally.
Impact if my assumption is wrong: Negligible for this specific test. If this cookie needed to be
  present during page load (e.g., locale or consent cookie), the order would matter. Flag for review
  only if the cookie's purpose is clarified differently.
```

---

## Risk callouts

- **Real external SUT (`bonigarcia.dev`)**: The test navigates to a live public website. Network
  outages or SUT unavailability will fail CI with misleading errors (locator-not-found, navigation
  timeout) rather than a clear "external SUT unavailable" signal. Consider tagging `@slow` and
  excluding from the main CI run, or add a pre-condition check.

- **Missing post-click assertion introduces behavioral drift risk**: The hard wait in `@AfterEach`
  (`Thread.sleep(3000)`) was the only reason this test didn't end immediately after the unasserted
  click — the sleep masked the absence of a proper synchronization point. Replacing the sleep with a
  web-first assertion is correct, but Stage 2 is guessing the locator structure without a DOM
  snapshot. The first CI run may fail until Q3/Q5 are resolved and the locator corrected.

- **Cookie domain precision**: Playwright is more explicit about cookie domain scoping than Selenium.
  A silent misconfiguration (wrong domain, missing leading dot for subdomains, wrong path) causes the
  cookie to be invisible to `context.cookies()` — the API assertion would pass on the add but fail
  to find the cookie, producing a confusing test failure.

- **`context.addCookies()` vs `page.context().addCookies()` scope**: Playwright's `page` fixture
  creates a `BrowserContext` per test; `page.context()` returns that context. If the test is ever
  moved into a shared-context project (e.g., `storageState` auth), cookies added via `page.context()`
  persist for the life of the context and may leak to subsequent tests. For now (fresh per-test
  context), this is not a problem.

- **API assertion tautology concern**: `assertThat(newCookie.getValue()).isEqualTo(readValue)` is
  `assertThat("new-cookie-value").isEqualTo(readValue)`. It is not a logical tautology (it does
  verify the browser stored what we asked it to store), but it tests browser infrastructure, not the
  application. If the migration's goal is E2E functional coverage, the UI assertion after the click
  is the signal that matters; the API assertion is defensive hygiene.

---

## Expected metrics

- **Selector quality score (estimated):** 0.5 (1/2 DOM locators are text-based; `page.getByText(...)` is
  tier-3 per `migration-rules.md §5` but counted by the quality script in `config/knowledge-base.md §7.1`.
  If reviewer confirms `<button>` role for `#refresh-cookies` and Stage 2 upgrades to `getByRole`:
  score becomes 1.0)
- **Smell count delta vs source:** −7 (1 hard wait, 1 manual driver lifecycle, 1 WebDriverManager
  installer, 1 hardcoded URL, 1 cookie-API-only assertion, 1 unasserted click end-of-test, 1 FIXME
  comment — all removed; 0 new smells introduced)
- **New test file LOC estimate:** ~35–40 LOC (single `test.describe` + one `test(...)` block; no
  POM, no fixture file; inline cookie operations + 1–2 assertions)
- **Anti-pattern coverage:** 7/7 cataloged
