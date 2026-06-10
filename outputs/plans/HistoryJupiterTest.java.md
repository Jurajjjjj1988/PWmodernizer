# Migration plan: HistoryJupiterTest.java

## Source framework

Selenium WebDriver (Java), JUnit 5 (Jupiter). Browser provisioned via `io.github.bonigarcia.wdm.WebDriverManager`. No framework version pinned in source; copyright header dates from 2021. Target: Playwright TypeScript on the latest stable major (v1.x, 2026).

## Summary

The test exercises browser history navigation primitives. It opens three sequential static HTML pages on a public demo site, then calls `navigate().back()`, `navigate().forward()`, and `navigate().refresh()` via the WebDriver API, finally asserting that the browser's current URL equals the third page URL. The test verifies that a sequence of history traversals leaves the browser in the expected page state.

This is a minimal, single-method test with no DOM interactions and no POM — it is a pure navigation-API exercise against an external demo site.

### What bug does this catch?

Catches a regression where browser history navigation (goBack → goForward → reload) corrupts the current URL or leaves the browser on an unexpected page after a sequence of history operations.

### User-perceivable assertion checklist

- [ ] After `goto(navigation1.html)` → `goto(navigation2.html)` → `goto(navigation3.html)` → `goBack()` → `goForward()` → `reload()`: the page URL must match `navigation3.html` (full URL: `https://bonigarcia.dev/selenium-webdriver-java/navigation3.html`)

## Anti-patterns detected

| Severity | Line | KB-ID | Anti-pattern | Snippet (≤60 chars) | Replacement |
|---|---|---|---|---|---|
| H | 42 | KB-1.3.1 | hard-wait | `Thread.sleep(Duration.ofSeconds(3).toMillis())` | Remove entirely; Playwright disposes context per-test automatically |
| H | 49 | KB-UNCLASSIFIED | hardcoded-url | `String baseUrl = "https://bonigarcia.dev/…"` | Extract to `baseURL` in `playwright.config.ts`; use relative paths in `page.goto()` |
| H | 62 | KB-1.3.10 | sync-probe-url | `assertThat(driver.getCurrentUrl()).isEqualTo(…)` | `await expect(page).toHaveURL(/\/navigation3\.html$/)` — web-first, auto-retrying |
| M | 36 | KB-1.3.25 | binary-installer | `WebDriverManager.chromedriver().create()` | Drop; Playwright `{ page }` fixture provides browser management |
| M | 44 | KB-1.3.12 | manual-teardown | `driver.quit()` | Drop; Playwright auto-disposes the browser context after each test |
| L | 41 | KB-UNCLASSIFIED | fixme-debug-comment | `// FIXME: pause for manual browser inspection` | Delete; post-run trace from Playwright config (`trace: 'on-first-retry'`) replaces manual sleep-based inspection |

### Unclassified smells

**US-1 — Hardcoded external URL (line 49):** `String baseUrl = "https://bonigarcia.dev/selenium-webdriver-java/"` concatenated into all three page URLs. There is no explicit Selenium Java KB entry for this smell (KB-1.4.12 covers the Python equivalent; KB-1.1.14 the bad-Playwright form). The fix is the same across all frameworks: move the base URL into `playwright.config.ts` `use.baseURL` and use relative paths (`'/navigation1.html'`, etc.) in `page.goto()` calls. Reviewer: confirm the `baseURL` value — see Q1.

**US-2 — FIXME debug comment (line 41):** `// FIXME: pause for manual browser inspection` references the three-second sleep that follows it. This is a debug residue comment with no ticket reference, no resolution date, and no migration intent. No KB entry. Delete it along with the sleep. Playwright's `trace: 'on-first-retry'` config produces richer post-run inspection than a sleep-based pause.

## Locator translation table

There are **zero DOM element locators** in this source test — no `driver.findElement()` calls appear anywhere. The test is a pure navigation exercise. The table below covers navigation-API and URL-assertion translations, which carry the same risk of getting wrong.

| Original (Selenium Java) | New (Playwright TS) | Confidence | Notes |
|---|---|---|---|
| `driver.get(firstPage)` | `await page.goto('/navigation1.html')` | high | Direct equivalent; URL becomes relative once `baseURL` is configured |
| `driver.navigate().to(secondPage)` | `await page.goto('/navigation2.html')` | high | `navigate().to()` and `driver.get()` both map to `page.goto()` in Playwright |
| `driver.navigate().to(thirdPage)` | `await page.goto('/navigation3.html')` | high | Same as above |
| `driver.navigate().back()` | `await page.goBack()` | high | 1:1 API equivalent; Playwright returns the `Response` if needed |
| `driver.navigate().forward()` | `await page.goForward()` | high | 1:1 API equivalent |
| `driver.navigate().refresh()` | `await page.reload()` | high | 1:1 API equivalent |
| `assertThat(driver.getCurrentUrl()).isEqualTo(thirdPage)` | `await expect(page).toHaveURL(/\/navigation3\.html$/)` | med | Regex form chosen to allow any `baseURL` prefix; full-string absolute URL is the HIGH-confidence fallback if `baseURL` always equals the demo domain — see Q2 and pin 1 |

## Hallucination-defense pins

1. **Final URL assertion** — assumed `await expect(page).toHaveURL(/\/navigation3\.html$/)` (regex, path-suffix match, environment-agnostic). If the project always runs against the full absolute demo domain and `baseURL` is set to the exact origin: keep `await expect(page).toHaveURL('https://bonigarcia.dev/selenium-webdriver-java/navigation3.html')`, add WHY-comment `'Q2 unresolved: absolute vs relative URL assertion form'`. Reviewer fallback: inspect the `playwright.config.ts` `baseURL` value after it is set; if it matches the full origin, the string form is safe; if the base may vary by environment, the regex form is correct.

## Structural changes

- **Extract POM:** No — zero element locators, ~25 source LOC, single-page-family navigation. Well below the 200-LOC POM threshold (`migration-rules.md` §1). Inlining is correct.
- **Extract fixture:** No — the only setup is a single `page.goto()` which belongs in `test.beforeEach` or in the test body. The `{ page }` fixture from Playwright replaces the entire `@BeforeEach`/`@AfterEach` driver lifecycle. No nontrivial setup justifying a custom fixture (`migration-rules.md` §1 "When to extract a fixture").
- **Split into multiple specs:** No — single test method, single behaviour.
- **Inline everything:** Yes — the straightforward default for a trivial test.

**Per-file fate (Selenium multifile rules):**

| Source file | Fate | Reason |
|---|---|---|
| `HistoryJupiterTest.java` | KEPT and RESHAPED → `outputs/tests/history-jupiter.spec.ts` | `@Test` method becomes a single `test(...)` call; `@BeforeEach`/`@AfterEach` lifecycle dropped in favour of Playwright `{ page }` fixture |

No sibling files were found alongside `HistoryJupiterTest.java` (no `BasePage`, no `DriverFactory`, no helpers). This is a self-contained unit.

## Open questions for reviewer

```
Q1: What should `baseURL` be set to in `playwright.config.ts`?
Context: The source hardcodes `https://bonigarcia.dev/selenium-webdriver-java/` as the base. This is a public educational demo site, not the company's application.
What I assumed: `baseURL` will be set to `https://bonigarcia.dev/selenium-webdriver-java/` and `page.goto('/navigation1.html')` etc. will be used with relative paths.
Impact if wrong: If the target is a different application or a locally-served mirror of these pages, the goto calls will hit the wrong server and the test is meaningless.
```

```
Q2: Should the final URL assertion use exact absolute URL or regex path suffix?
Context: Source asserts `assertThat(driver.getCurrentUrl()).isEqualTo("https://bonigarcia.dev/…/navigation3.html")` — full absolute URL.
What I assumed: Regex `/\/navigation3\.html$/` allows the test to run against any environment where `baseURL` varies (staging, local, prod); see locator table row 7 and pin 1.
Impact if wrong: If absolute URL equality is required (e.g., the org always runs against the canonical demo domain), the regex form is looser than intended and masks an environment misconfiguration.
```

```
Q3: Is the `driver.navigate().refresh()` at line 60 an intentional test step or debug leftover?
Context: The refresh is called immediately before the final URL assertion. Since refreshing navigation3.html leaves the URL unchanged, it does not affect the expected outcome. Its inclusion could be intentional (testing that a page refresh does not corrupt history state) or accidental.
What I assumed: Intentional — it tests a third navigation primitive (reload) and is preserved as `await page.reload()`.
Impact if wrong: If it is a debug leftover, removing it simplifies the test with no coverage loss; however, the reload semantic would no longer be exercised.
```

```
Q4: Should the test run against the live `bonigarcia.dev` site or against locally-served pages?
Context: All three URLs are on a public demo domain. Any network interruption, rate-limiting, or site downtime causes the test to fail for external reasons.
What I assumed: Test will navigate to the live site; no mocking or local serving is added, consistent with the source intent.
Impact if wrong: If CI is network-isolated or if the domain becomes unreachable, the test will produce misleading failures unrelated to the application under test. Mitigation: serve the three static HTML pages via `page.route()` or a local fixture.
```

```
Q5: Is a DOM assertion needed after each navigation step to confirm the correct page rendered?
Context: The source has no assertions on page content — only the final URL check. The test would pass if the browser navigated to navigation3.html but rendered a blank/error page, as long as the URL matched.
What I assumed: No DOM assertions are added in Stage 2 — the migration preserves the source test's oracle fidelity (URL only). Adding DOM assertions would expand scope beyond the plan.
Impact if wrong: If the reviewer considers URL-only assertions insufficient, a heading visible check (e.g., `await expect(page.getByRole('heading')).toBeVisible()`) should be added after each navigation in a separate coverage enhancement.
```

## Risk callouts

- **External SUT dependency:** All three navigation URLs point to `bonigarcia.dev`, a public demo site. Network interruptions, CDN changes, or the owner removing these pages will cause CI failures that are misleading (fail = infra, not product regression). This is the highest-risk aspect of this migration.

- **Exact URL equality is environment-coupled:** The source asserts the full absolute URL. Even the regex form chosen for the migration (`/\/navigation3\.html$/`) may fail if the server appends tracking query parameters (e.g., `?ref=...`) or redirects to a canonical URL.

- **Anti-test smell — assertion is logically guaranteed by the browser:** After `goBack()` + `goForward()`, the URL should always be `navigation3.html` regardless of application logic, because it is the browser's own history stack being exercised. This test would not catch a product regression unless the application actively interferes with `popstate` events (e.g., a SPA router that overrides browser back). Reviewer should assess whether this test adds meaningful regression coverage for the company's product.

- **Zero DOM assertions — blank page passes:** The test would pass on a page that returns HTTP 200 but renders nothing, as long as the URL matches. Upgrading to at least one visible-heading assertion per navigation step would give the test real oracle value.

- **`page.goBack()` / `page.goForward()` on SPAs:** If the target application later moves to an SPA router that manages history via the History API, `page.goBack()` may trigger a popstate event without a full navigation — meaning Playwright may resolve before the UI has updated. Web-first assertions between navigation steps (`await expect(page).toHaveURL(...)` after each step) mitigate this.

## Expected metrics

- **Selector quality score (estimated post-migration):** N/A — zero element locators in source or target. The navigation API calls are not selector-ranked.
- **Smell count delta vs source:** −6 (Thread.sleep removed, WebDriverManager removed, driver.quit removed, hardcoded absolute URL extracted to config, sync URL probe replaced with web-first, FIXME comment deleted); +0 new smells
- **New test file LOC estimate:** ~18 LOC (single spec file, one `test.describe`, one `test(...)`, no POM, no fixture file, no data file)
- **Anti-pattern coverage:** 6 cataloged (4 classified KB entries + 2 unclassified smells)
