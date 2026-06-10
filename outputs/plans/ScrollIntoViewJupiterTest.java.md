# Migration plan: ScrollIntoViewJupiterTest.java

## Source framework

selenium-java — JUnit 5 (Jupiter) with `WebDriverManager.chromedriver().create()` for browser provisioning. Target: Playwright TypeScript on latest stable (≥ 1.39 required for `toBeInViewport()`).

## Summary

This test navigates to a long HTML demo page hosted on an external public site (`bonigarcia.dev`), sets a global implicit-wait timeout inside the test body, locates the last paragraph element via a CSS structural pseudo-selector, and scrolls it into view using a `JavascriptExecutor` call. **The test contains zero assertions** — it is a bare action trace that passes unconditionally regardless of whether the scroll succeeded. The migration must add `await expect(locator).toBeInViewport()` (net-new observable oracle) to make this a real test; Stage 2 validation (`migration-rules.md §8`) will reject any spec without at least one `expect`.

After migration the spec navigates to the long page, scrolls the last paragraph into view using Playwright's native `scrollIntoViewIfNeeded()`, and asserts the element is visible in the viewport.

### What bug does this catch?

Catches a regression where a long-page navigation followed by a scroll operation fails to bring the last paragraph element into the visible viewport — for example if JavaScript scroll APIs are blocked by a Content Security Policy, if the element is hidden behind a sticky overlay, or if the page structure changes such that the element no longer exists.

> **Critical:** The original test has **zero assertions** and therefore catches no bugs in its current form. The migration deliberately adds `await expect(page.locator('p:last-child')).toBeInViewport()` to give the test an observable oracle. This is a behavioral change from the source — see Q3 for reviewer sign-off.

### User-perceivable assertion checklist

- [ ] After navigating to the long page and invoking `scrollIntoViewIfNeeded()`: the last paragraph element (`p:last-child`) reports as in the viewport via `toBeInViewport()`

## Anti-patterns detected

| Severity | Line | KB-ID | Anti-pattern | Snippet (≤60 chars) | Replacement |
|---|---|---|---|---|---|
| H | 43 | KB-1.3.1 | hard wait in `@AfterEach` teardown | `Thread.sleep(Duration.ofSeconds(3).toMillis())` | Drop entirely — Playwright `page` fixture auto-disposes; use `trace: 'retain-on-failure'` for post-run inspection |
| H | 53 | KB-1.3.11 | `implicitlyWait` set inside test body | `driver.manage().timeouts().implicitlyWait(…10s…)` | Drop; configure `actionTimeout: 10_000` at project level in `playwright.config.ts` |
| H | 52, 57–58 | KB-1.3.24 | JS executor `scrollIntoView` bypass | `js.executeScript("arguments[0].scrollIntoView()"…)` | `await locator.scrollIntoViewIfNeeded()` + `await expect(locator).toBeInViewport()` |
| H | 48–59 | KB-UNCLASSIFIED | no observable assertion in test body | entire `testScrollIntoView()` body has no assert | Add `await expect(page.locator('p:last-child')).toBeInViewport()` |
| M | 37 | KB-1.3.25 | `WebDriverManager` binary auto-installer | `WebDriverManager.chromedriver().create()` | Drop; Playwright provisions browsers via `npx playwright install` — no in-test installer call |
| M | 45 | KB-1.3.12 | manual `driver.quit()` in `@AfterEach` | `driver.quit()` | Drop; Playwright `page` fixture disposes the browser context automatically after every test |
| M | 50–51 | KB-1.1.14 | hardcoded full URL in navigation | `driver.get("https://bonigarcia.dev/…long-page.html")` | `await page.goto('https://bonigarcia.dev/…')` — full URL is acceptable here since target is an external public page; see Q2 |
| M | 55–56 | KB-1.3.3 | CSS structural selector as primary locator | `By.cssSelector("p:last-child")` | `page.locator('p:last-child')` (LOW confidence — external page, data-testid cannot be added) |
| L | 42 | KB-UNCLASSIFIED | `FIXME` comment committed in teardown | `// FIXME: pause for manual browser inspection` | Remove; Playwright trace viewer (`trace: 'retain-on-failure'`) supersedes manual pausing |

### Unclassified smells

**No-assertion test body (KB-UNCLASSIFIED, H):** `testScrollIntoView()` performs navigation and a JS scroll with no `assert*` or `verify*` call. JUnit 5 treats a test as passing if no exception is thrown — so this test is permanently green whether the scroll succeeded or not. No specific KB-1.3.x entry exists for "zero-assertion Selenium Java test." The fix per `migration-rules.md §8` is mandatory: Stage 2 will be rejected if the generated spec has no `expect`. Reviewer confirmation requested at Q3.

**FIXME comment (KB-UNCLASSIFIED, L):** `// FIXME: pause for manual browser inspection` at line 42 violates `migration-rules.md §8` ("TODO / FIXME comments — tracking issues belong in the tracker, not in code"). Remove on migration. No dedicated KB-1.3.x entry for debug comments in teardown; Playwright replaces this need with `screenshot: 'only-on-failure'` and `trace: 'retain-on-failure'`.

**Variable name typo:** `lastElememt` (line 55) is a misspelling of "Element." The generated Playwright code should use a corrected name (`lastParagraph`). Stylistic only; no KB entry.

## Locator translation table

| Original | New | Confidence | Notes |
|---|---|---|---|
| `By.cssSelector("p:last-child")` | `page.locator('p:last-child')` | low | External public demo page — `data-testid` cannot be added. CSS structural pseudo-selector is a direct mechanical mapping. `page.locator('p').last()` is a Playwright idiom alternative but semantically different: `p:last-child` matches paragraphs that are the final child of **their parent container**, while `.last()` picks the final match in **document order**. These may target different elements if the page has nested containers. See Q1 and pin 1. |

## Hallucination-defense pins

1. **Last paragraph on long page** — assumed `page.locator('p:last-child')`. If browser DevTools inspection shows `document.querySelector('p:last-child')` and `document.querySelectorAll('p')[document.querySelectorAll('p').length - 1]` return different elements: use `page.locator('p').last()` instead, add WHY-comment `'Q1 unresolved: p:last-child targets last-child of container, not last paragraph overall'`. Reviewer fallback: open `https://bonigarcia.dev/selenium-webdriver-java/long-page.html` in DevTools, run both queries in the console, confirm they resolve to the same element before Stage 2 locks in the selector.

## Structural changes

- **Extract POM:** no — single page, single test, source ~62 LOC; well below the 200-LOC extraction threshold (`migration-rules.md §1`). Inline locators are the correct default.
- **Extract fixture:** no — setup is a one-line `page.goto(url)` with no auth, network mocking, or multi-test shared state. Inline navigation in `test.beforeEach` is fine.
- **Split into multiple specs:** no — single test scenario.
- **Per-file fate:**
  - `ScrollIntoViewJupiterTest.java` — **KEPT and RESHAPED** → `outputs/tests/scroll-into-view-jupiter-test.spec.ts` (kebab-case per `migration-rules.md §1`)
  - `@BeforeEach setup()` (`WebDriverManager.chromedriver().create()`) — **DROPPED**; replaced entirely by Playwright's `page` fixture, which provides an isolated browser context per test with no installer call.
  - `@AfterEach teardown()` (`Thread.sleep` + `driver.quit()`) — **DROPPED**; Playwright's `page` fixture disposes the context automatically. Debug artifact capture is handled by `screenshot: 'only-on-failure'` + `trace: 'retain-on-failure'` in `playwright.config.ts`.
  - `JavascriptExecutor` cast and `executeScript(scrollIntoView)` logic — **DROPPED**; replaced by `await locator.scrollIntoViewIfNeeded()` (Playwright native).

## Open questions for reviewer

```
Q1: Does `By.cssSelector("p:last-child")` target the same element as the
    last paragraph in document order?
Context: line 55–56 — `driver.findElement(By.cssSelector("p:last-child"))`.
What I assumed: the long page has a flat single-container structure where
  the last paragraph is both the last-child of its parent AND the last
  paragraph in document order — making p:last-child equivalent to
  page.locator('p').last().
Impact if wrong: the migration targets a different paragraph than the
  original test did, producing a test that scrolls to the wrong element.
```

```
Q2: Should the hardcoded external URL be left as a full URL in page.goto(),
    or does the project expect a baseURL configuration even for external sites?
Context: lines 50–51 — driver.get("https://bonigarcia.dev/selenium-webdriver-java/long-page.html").
What I assumed: full URL is acceptable for an external public demo page since
  there is no locally-controlled baseURL for bonigarcia.dev.
Impact if wrong: if project lint rules forbid hardcoded URLs in goto() calls
  regardless of origin, the generated spec will fail URL linting.
```

```
Q3: The original test has zero assertions. The migration adds
    `await expect(page.locator('p:last-child')).toBeInViewport()`.
    Is viewport visibility the intended oracle, or should the test
    verify specific text content of the last paragraph instead?
Context: lines 48–59 — testScrollIntoView() has no assert* calls.
What I assumed: the test's purpose is to verify the scroll-into-view
  behavior (element becomes viewport-visible), not to verify paragraph
  text content.
Impact if wrong: if the intent was to assert on the paragraph's text
  (e.g., the last sentence of a lorem ipsum sequence), the added
  viewport assertion tests the wrong property.
```

```
Q4: `await expect(locator).toBeInViewport()` requires Playwright ≥ 1.39
    (October 2023). Does the project's @playwright/test version satisfy this?
Context: KB-1.3.24 canonical replacement — scrollIntoViewIfNeeded() +
  toBeInViewport().
What I assumed: the project uses Playwright 1.39 or later.
Impact if wrong: toBeInViewport will throw `TypeError: expect(locator).
  toBeInViewport is not a function`. Fallback: Stage 2 should emit
  `await expect(locator).toBeVisible()` with a comment noting it is
  weaker than toBeInViewport() (visible does not require being in
  the viewport on a scrollable page) pending a version upgrade.
```

```
Q5: The Thread.sleep(3000) is annotated `// FIXME: pause for manual browser
    inspection`. Is there any downstream CI artifact-capture system that
    requires a post-test dwell period, or is this purely debug scaffolding?
Context: lines 41–44, @AfterEach teardown.
What I assumed: purely debug scaffolding left from exploratory authoring;
  Playwright's trace/video capture supersedes it.
Impact if wrong: if a CI video recorder needs the browser open for 3s post-
  test to capture the final frame, dropping the sleep silently loses that
  artifact.
```

```
Q6: The source file originates from the Boni Garcia "Hands-On Selenium
    WebDriver with Java" textbook (package bonigarcia/webdriver/jupiter/
    ch04/javascript, Apache 2.0 license). Is this being migrated as a
    production CI test or as a pipeline corpus sample for migration
    quality measurement?
Context: copyright header lines 1–16; package declaration line 17.
What I assumed: treat as a standard migration target; note external URL
  risk in risk callouts.
Impact if wrong: if this is a corpus/learning sample, CI-green is
  secondary to migration correctness as a demonstration — the external
  URL dependency is an accepted trade-off.
```

```
Q7: `driver.manage().timeouts().implicitlyWait(Duration.ofSeconds(10))` is
    set INSIDE the test body (line 53), not in @BeforeEach. In a Selenium
    session this setting persists for the lifetime of the driver, meaning
    it would leak to any subsequent test using the same driver instance.
    Was this intentional (one-off test-scoped timeout) or an oversight?
Context: line 53, testScrollIntoView().
What I assumed: oversight; the migration replaces it with a config-level
  actionTimeout: 10_000 in playwright.config.ts.
Impact if wrong: if there is a reason to apply the 10s timeout only to
  this test and not globally, Stage 2 should emit a per-test
  `test.use({ actionTimeout: 10_000 })` override instead of relying
  on the global config.
```

## Risk callouts

- **External URL dependency (high):** The test navigates to `https://bonigarcia.dev/selenium-webdriver-java/long-page.html`, a public third-party website. If the domain expires, the page structure changes, or network is unavailable in CI, the test will fail at the navigation level with a misleading timeout error rather than an assertion failure. This is an unavoidable consequence of testing against an external demo page; the migrated test inherits this fragility.
- **Net-new assertion behavioral change (medium):** The original test made zero assertions — adding `toBeInViewport()` is behavioral delta, not a migration. The first CI run effectively validates whether the assertion holds on the live page. Reviewer must confirm this is the intended quality gate before merging.
- **`p:last-child` structural fragility (medium):** Without DOM inspection we cannot confirm the CSS pseudo-selector targets the intended element vs. `page.locator('p').last()`. Since the page is external, this cannot be mitigated by adding a `data-testid`. See pin 1 and Q1.
- **`toBeInViewport()` Playwright version gate (low):** If the project runs Playwright < 1.39, Stage 2 must fall back to `toBeVisible()` with a WHY-comment. The assertion semantics differ: `toBeVisible()` only confirms the element is in the DOM and has non-zero dimensions; `toBeInViewport()` additionally confirms it is within the visible scrollable area.
- **Implicit-wait mid-test leak (low, Selenium-only, moot in Playwright):** The original sets `implicitlyWait` inside the test body (line 53) rather than in setup. In a JUnit 5 class that reuses the same `WebDriver` instance across tests, this setting would contaminate subsequent tests. Playwright's per-test context isolation eliminates this failure mode entirely.

## Expected metrics

- **Selector quality score (estimated):** 0/1 = **0.0** — the single locator is a CSS fallback (`p:last-child`). External page prevents `data-testid` addition. Score below the 0.7 target is a known, documented limitation; not a migration defect.
- **Smell count delta vs source:** **−8** (Thread.sleep, implicitlyWait, JS executor scrollIntoView, WebDriverManager, driver.quit(), hardcoded URL pattern, FIXME comment, and zero-assertion smell all removed; CSS locator persists in target as unavoidable external-page exception)
- **New test file LOC estimate:** ~22 LOC (attribution header + import + describe + beforeEach goto + single test with scroll + assertion)
- **Anti-pattern coverage:** 9/9 cataloged (7 standard KB entries + 2 unclassified)
