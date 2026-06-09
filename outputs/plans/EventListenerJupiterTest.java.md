# Migration plan: EventListenerJupiterTest.java

## Source framework

Selenium WebDriver 4.x (Java), JUnit 5 (Jupiter), WebDriverManager 5.x, AssertJ assertions. The test uses `EventFiringDecorator` (Selenium 4's event-listener API) to wrap the WebDriver with a `MyEventListener` instance — pure test infrastructure scaffolding from a textbook chapter on Selenium event listeners.

Source is a **single file** (`EventListenerJupiterTest.java`). No companion page objects, helpers, or fixture classes are present in the inputs directory. `MyEventListener.java` is referenced but not provided — see Q2.

Target: Playwright TypeScript, latest stable (v1.x).

## Summary

The test wraps a Chrome WebDriver with `EventFiringDecorator` to demonstrate Selenium 4's event-listener mechanism, then navigates to the bonigarcia Selenium book demo site. The user-facing test logic: navigate to the demo home page, assert the page title matches the book title, then click the "Web form" navigation link. The `EventFiringDecorator`/`MyEventListener` scaffolding carries no user-facing behavior equivalent and is entirely dropped. The migrated test becomes a navigation smoke test of the bonigarcia demo site: load the home page, confirm the title, navigate to the web form.

### What bug does this catch?

Catches a regression where the bonigarcia Selenium WebDriver demo site fails to load with the expected page title ("Hands-On Selenium WebDriver with Java") or where the "Web form" navigation link has been removed, renamed, or broken.

### User-perceivable assertion checklist

- [ ] After `page.goto('/')`: page title is `"Hands-On Selenium WebDriver with Java"`
- [ ] After clicking the "Web form" link: page navigates to the web form (URL or heading — see Q1; **currently MISSING from source**, Stage 2 must add this assertion)

## Anti-patterns detected

| Severity | Line | KB-ID | Anti-pattern | Snippet (≤60 chars) | Replacement |
|---|---|---|---|---|---|
| H | 48 | KB-1.1.14 | hardcoded-url | `driver.get("https://bonigarcia.dev/…")` | configure `baseURL` in playwright.config.ts; use `await page.goto('/')` |
| H | 37 | KB-1.3.25 | webdriver-binary-installer | `WebDriverManager.chromedriver().create()` | DROPPED — Playwright bundles browsers; provisioned via `npx playwright install` |
| M | 42–44 | KB-1.3.12 | manual-driver-teardown | `driver.quit()` in `@AfterEach` | DROPPED — Playwright `page` fixture auto-disposes per test |
| M | 49–50 | KB-1.3.10 | sync-title-probe | `assertThat(driver.getTitle()).isEqualTo(…)` | `await expect(page).toHaveTitle(…)` web-first title assertion |
| M | 51 | KB-1.3.19 | linkText-exact-match | `findElement(By.linkText("Web form")).click()` | `page.getByRole('link', { name: 'Web form' }).click()` |

### Unclassified smells

**1. `EventFiringDecorator` / `MyEventListener` wrapper (lines 35–38):** The test wraps `originalDriver` in `new EventFiringDecorator<>(listener)` — Selenium 4's mechanism for intercepting WebDriver events (navigation, element-find, click, script-execution, etc.) for logging, screenshot, or tracing purposes. This is pure test infrastructure with no user-facing behavior equivalent in Playwright. Playwright's built-in tracing (`trace: 'on-first-retry'`), HTML reporter, and `page.on('console', ...)` subsume this capability at the framework level. Migration decision: **DROPPED entirely**. `MyEventListener.java` is not in the inputs directory — see Q2 for whether it contains assertions.

**2. Missing post-click observable-outcome assertion (line 51):** `driver.findElement(By.linkText("Web form")).click()` has no follow-up assertion. Per `migration-rules.md §2`: every test must end with an assertion on a user-perceivable thing. Stage 2 must add one — see Q1.

## Locator translation table

| Original | New | Confidence | Notes |
|---|---|---|---|
| `By.linkText("Web form")` | `page.getByRole('link', { name: 'Web form' })` | high | `By.linkText` exact-text match = link accessible name; direct mechanical translation to `getByRole('link', { name })` |

## Hallucination-defense pins

N/A — all locators are HIGH confidence.

## Structural changes

Per-file fate (selenium-multifile-rules, single-file case):

- **`EventListenerJupiterTest.java`** — **KEPT and RESHAPED** into `outputs/tests/event-listener-jupiter-test.spec.ts`. `@Test void testEventListener()` → `test('navigates to demo home page and reaches the web form @positive @e2e', ...)`. `@BeforeEach`/`@AfterEach` → **DROPPED** (Playwright `page` fixture handles browser lifecycle automatically).
- **`MyEventListener.java`** (referenced, not in inputs/) — **DROPPED**. The `EventFiringDecorator` infrastructure has no Playwright equivalent; replaced by Playwright's built-in trace, reporter, and `page.on(...)` event listeners.

**No POM extraction** — single page, one locator, ~54 source LOC well under the 200 LOC threshold (`migration-rules.md §1`: "Below 200 LOC, inline locators are fine").

**No fixture extraction** — setup reduces to a single `await page.goto('/')` after migration (`migration-rules.md §1`: "Keep inline when it is a one-line `await page.goto('/foo')`").

**No file split** — single `@Test` method maps to one `test.describe` + one `test(...)`.

**Target file:** `outputs/tests/event-listener-jupiter-test.spec.ts`

## Open questions for reviewer

```
Q1: What should Stage 2 assert after clicking the "Web form" link?
Context: Line 51 — driver.findElement(By.linkText("Web form")).click() has no follow-up
assertion. The bonigarcia demo site's Web form page URL pattern is unknown without live
DOM inspection.
What I assumed (if proceeding without an answer): Stage 2 should add
`await expect(page).toHaveURL(/web-form/)`. The bonigarcia site URL structure typically
uses /web-form/ as the path slug.
Impact if my assumption is wrong: If the web form page URL does not match /web-form/,
the added assertion introduces a false failure on a non-existent bug.
Reviewer: confirm the URL pattern or heading text visible after clicking the link.
```

```
Q2: Does MyEventListener contain assertions or side effects beyond logging?
Context: Lines 35–38 — new MyEventListener() is instantiated but MyEventListener.java
is not in the inputs directory. Common uses are logging and screenshots; uncommon uses
include event-level assertions (e.g., "verify that a beforeFindElement event fires").
What I assumed (if proceeding without an answer): MyEventListener performs logging /
tracing only, so no assertion coverage is lost by dropping it.
Impact if my assumption is wrong: If MyEventListener asserts on event sequences (e.g.,
verifying that EventFiringDecorator fires events in the correct order), those assertions
are entirely absent from the migrated test and must be recreated using Playwright page
events or test.step annotations. The migrated test would have shallower coverage.
```

```
Q3: What baseURL should playwright.config.ts use for this test?
Context: Line 48 — driver.get("https://bonigarcia.dev/selenium-webdriver-java/") is a
hardcoded external URL with a non-root path as the base.
What I assumed (if proceeding without an answer): Stage 2 sets
baseURL: process.env.BASE_URL ?? 'https://bonigarcia.dev/selenium-webdriver-java'
in playwright.config.ts and uses await page.goto('/') for the home page.
Impact if my assumption is wrong: If the project already has a different baseURL
configured (e.g., a local app), goto('/') navigates to the wrong host.
```

```
Q4: Exact string vs. regex for the title assertion?
Context: Lines 49–50 — assertThat(driver.getTitle()).isEqualTo("Hands-On Selenium
WebDriver with Java") uses exact string equality.
What I assumed (if proceeding without an answer): await expect(page).toHaveTitle(
"Hands-On Selenium WebDriver with Java") (exact match, preserving source intent).
Impact if my assumption is wrong: An exact match breaks on any copy change (new edition
title, subtitle addition, whitespace normalization). Reviewer: decide whether
/hands-on selenium webdriver with java/i regex is more appropriate for resilience.
```

```
Q5: Should this test be kept at all post-migration?
Context: Package path (ch04.event_listeners) confirms this is a textbook chapter example
whose stated purpose is demonstrating EventFiringDecorator. Without that scaffolding, the
migrated test reduces to a two-assertion navigation smoke test of an external public site.
What I assumed (if proceeding without an answer): Preserve the test as a navigation
smoke test — it still catches regressions in the demo site's title and link structure.
Impact if my assumption is wrong: If the intent is purely pedagogical (demonstrating the
Selenium event API), the migrated test has no meaningful CI regression value for a
product and should be deleted rather than migrated. Reviewer: confirm migrate or discard.
```

## Risk callouts

- **External network dependency:** The test navigates to `https://bonigarcia.dev/selenium-webdriver-java/`, a real external site not under the project's control. CI will fail if the site is down, changes its title, or removes the "Web form" link. Consider tagging `@e2e` and excluding from default CI, or adding a `page.route(...)` stub that serves a local HTML fixture.
- **Title brittleness (exact match):** `"Hands-On Selenium WebDriver with Java"` breaks on any copy change — e.g., if a second edition changes the title or the site adds a subtitle. A regex `/hands-on selenium webdriver with java/i` would be more resilient to minor copy variations.
- **Missing post-click assertion (carried from source):** Without Q1 resolved, Stage 2 makes an assumed URL-pattern choice (`/web-form/`) that may be wrong for the actual site, introducing a false CI gate.
- **EventFiringDecorator coverage gap:** If `MyEventListener` performed event-level assertions, those are silently absent from the migrated test. No safety net exists until Q2 is answered.
- **Pedagogical test value decay:** This test was designed to demonstrate a Selenium API feature, not to guard a product regression. Its regression value post-migration is low. Evaluate whether it belongs in the CI suite.

## Expected metrics

- Selector quality score (estimated): 1.0 (1/1 locators are role/accessible-name-based after migration)
- Smell count delta vs source: −6 (hardcoded URL, WebDriverManager installer, driver.quit, sync title probe, By.linkText, EventFiringDecorator; zero new smells introduced)
- New test file LOC estimate: ~35 (well under the 200 LOC threshold; no file split needed)
- POM LOC estimate: 0 (no POM extraction)
- Fixture LOC estimate: 0 (no fixture extraction)
- Anti-pattern coverage: 5 cataloged (KB-IDs) + 2 unclassified smells detected and flagged
