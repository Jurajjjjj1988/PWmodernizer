# Migration plan: AsyncScriptJupiterTest.java

## Source framework

**Selenium Java** — JUnit Jupiter 5.x (`@Test`, `@BeforeEach`, `@AfterEach`), WebDriverManager for browser binary provisioning, AssertJ for assertions, SLF4J for logging. Selenium WebDriver version: 4.x inferred from WebDriverManager API shape (`WebDriverManager.chromedriver().create()`).

**Target framework:** Playwright TypeScript, latest stable (v1.x, 2026 conventions).

---

## Summary

The test navigates to the Bonigarcia Selenium WebDriver demo homepage (`https://bonigarcia.dev/selenium-webdriver-java/`), casts the `WebDriver` to a `JavascriptExecutor`, constructs an async script that invokes `window.setTimeout(callback, 2000)`, executes it with `executeAsyncScript`, and then asserts the elapsed wall-clock time is at least 2 seconds. No DOM elements are located or interacted with, and no user-visible page state is asserted. The test is a Selenium API capability demonstration from Chapter 4 of Bonigarcia's "Hands-On Selenium WebDriver with Java", not an acceptance test of the web application's behaviour.

### What bug does this catch?

**This test catches no user-perceivable application bug.** It verifies that Selenium's `executeAsyncScript` blocks the calling thread until the provided async callback fires — an API capability of the WebDriver, not of the SUT. If the page at `https://bonigarcia.dev/selenium-webdriver-java/` broke entirely, this test would still pass, because the timing assertion depends only on the JavaScript executor and `window.setTimeout`, not on any rendered UI.

### User-perceivable assertion checklist

- [ ] (None — the source makes only a wall-clock timing assertion: `assertThat(elapsed).isGreaterThanOrEqualTo(pause)`. No DOM element, page heading, URL pattern, or visible text is asserted.)

**Migration note for Stage 2:** `migration-rules.md` §2 requires "every test ends with at least one assertion on a user-perceivable thing." Because the source has no such assertion, Stage 2 must add one. The minimal acceptable addition is `await expect(page).toHaveTitle(/.+/)` after navigation — but the reviewer should supply the actual page title. See Q1 and Q4.

---

## Anti-patterns detected

| Severity | Line | KB-ID | Anti-pattern | Snippet (≤60 chars) | Replacement |
|---|---|---|---|---|---|
| H | 42 | KB-1.3.25 | WebDriverManager binary installer in test setup | `WebDriverManager.chromedriver().create()` | Drop entirely; Playwright `page` fixture provides a fresh browser context automatically |
| H | 52 | KB-1.1.14 | Hardcoded environment URL | `driver.get("https://bonigarcia.dev/…")` | Move host to `baseURL` in `playwright.config.ts`; emit `await page.goto('/')` |
| H | 53–60 | KB-1.3.1 | Hard wait disguised as async script execution (`executeAsyncScript` + `setTimeout(cb, 2000)` = 2-second block) | `js.executeAsyncScript(script)` (2 s pause) | Translate to `await page.evaluate(() => new Promise(r => setTimeout(r, ASYNC_PAUSE_MS)))` — but the entire pattern should be removed; see Q1 and Q3 |
| H | 53 | KB-1.3.13 | JavascriptExecutor cast and async execution | `(JavascriptExecutor) driver` / `js.executeAsyncScript` | `await page.evaluate(() => ...)` for sync return; `await page.evaluate(() => new Promise(...))` for async |
| M | 45–48 | KB-1.3.12 | `driver.quit()` in `@AfterEach` | `driver.quit()` | Drop; Playwright's `page` fixture is test-scoped and auto-disposes after every test |
| M | 40–43 | KB-1.3.12 | Manual driver creation in `@BeforeEach` | `driver = WebDriverManager.chromedriver().create()` | Drop; Playwright's `{ page }` fixture replaces the entire `@BeforeEach` driver lifecycle |
| L | 36, 63 | KB-UNCLASSIFIED | SLF4J debug logger declared and used in test body | `static final Logger log …` / `log.debug(…)` | Remove; debug logging belongs in the reporter, not in committed test code |
| L | 55 | KB-1.1.9 | Magic number: `2` inside `Duration.ofSeconds(2)` | `Duration.ofSeconds(2)` | Extract to `const ASYNC_PAUSE_MS = 2_000` or remove the delay concept entirely |

### Unclassified smells

**Wall-clock timing assertion** (lines 59–64):

```java
assertThat(elapsed).isGreaterThanOrEqualTo(pause);
```

This is not a web-first assertion and has no Playwright equivalent. It verifies that the JVM elapsed at least 2 seconds while `executeAsyncScript` ran — an assertion about the JavaScript executor's blocking behaviour, not about any user-visible state. No KB entry covers this pattern because it is a test design problem (the test has no oracle for app behaviour), not a Playwright anti-pattern category. **Recommend the reviewer decide: delete the test, or replace the assertion with a real app-state assertion.** See Q1 and Q5.

---

## Locator translation table

| Original | New | Confidence | Notes |
|---|---|---|---|
| `driver.get("https://bonigarcia.dev/selenium-webdriver-java/")` | `await page.goto('/')` with `baseURL: 'https://bonigarcia.dev/selenium-webdriver-java'` in `playwright.config.ts` | high | Mechanical URL navigation translation; host moves to config |

**No element locators (`By.*`, `findElement`, `findElements`) are present in this source.** The test performs only page navigation and JavaScript execution — no DOM elements are located, clicked, or asserted upon. The locator table therefore contains a single URL-navigation entry and nothing else.

---

## Hallucination-defense pins

N/A — source contains no element locators. The locator table contains zero MED or LOW confidence rows. The sole entry (URL navigation) is HIGH confidence: it is a mechanical translation from `driver.get(url)` to `page.goto(url)`.

---

## Structural changes

- **Extract POM:** No — there are zero DOM element interactions in this test. A POM would own no locators and no action methods, violating `migration-rules.md` §1 ("A POM owns locators + actions"). Per the 200-LOC threshold in `migration-rules.md` §1, POM extraction is unjustified here.
- **Extract fixture:** No — setup reduces to a single `page.goto('/')` call, which `migration-rules.md` §1 explicitly says should remain inline ("It is a one-line `await page.goto('/foo')`. Keep inline").
- **Split the file:** No — single test method, single scenario.
- **Inline everything:** Yes — one `test.describe` block containing one `test()` call.
- **Target output file:** `outputs/tests/AsyncScriptJupiterTest.spec.ts` only.

**Per-file fate:**

| Source element | Fate | Reason |
|---|---|---|
| `AsyncScriptJupiterTest.java` (test class) | KEPT and RESHAPED | Single-file input; becomes one `.spec.ts` with JUnit `@Test` → Playwright `test(...)` |
| `WebDriverManager.chromedriver().create()` (inline, no separate file) | DROPPED | Replaced by Playwright `page` fixture; no target file |
| `static final Logger log` (inline field) | DROPPED | Debug logging; no equivalent needed in Playwright output |

---

## Open questions for reviewer

```
Q1: No user-visible assertion — what should Stage 2 assert?
Context: Lines 59–64 — the sole assertion is `assertThat(elapsed).isGreaterThanOrEqualTo(pause)`,
         a wall-clock timing check that verifies nothing about the application's rendered state.
         migration-rules.md §2 requires every test to end with a user-perceivable assertion.
What I assumed (if proceeding without an answer): Stage 2 will add
  `await expect(page).toHaveTitle(/.+/)` as a minimal observable-outcome assertion after
  navigation. This is semantically weak (any non-empty title passes) but satisfies the
  "test is not empty" contract.
Impact if my assumption is wrong: The test asserts nothing about the SUT; any homepage
  regression that preserves the page title goes undetected.
```

```
Q2: Should the async JavaScript evaluation pattern be preserved at all?
Context: Lines 53–60 — the executeAsyncScript + setTimeout block is the core "feature" being
         demonstrated (Selenium async script blocking). The Playwright equivalent is
         `await page.evaluate(() => new Promise(r => setTimeout(r, 2000)))`.
What I assumed (if proceeding without an answer): Stage 2 will translate the pattern to
  `page.evaluate()` with a Promise, but drop the wall-clock assertion (no Playwright
  equivalent exists that is meaningful). The evaluate call would remain as a structural
  demonstration of the async API.
Impact if my assumption is wrong: Removing the evaluate call entirely changes the semantic
  intent of the test (becomes a pure navigation smoke test). Keeping it without assertion
  is arguably noise.
```

```
Q3: Drop or keep the 2-second delay in the migrated test?
Context: The `Duration.ofSeconds(2)` / window.setTimeout(callback, 2000) implements a
         deliberate 2-second pause. In the migrated test this translates to
         `await page.evaluate(() => new Promise(r => setTimeout(r, 2_000)))`.
         This makes the test intentionally slow with no CI payoff.
What I assumed (if proceeding without an answer): Stage 2 will preserve the evaluate call
  (to demonstrate the API translation) but will NOT add the delay if the reviewer confirms
  the test is purely demonstrative. If the delay is dropped, the test becomes a simple
  navigation + title assert (< 1s). Tagging @slow is required if delay is kept.
Impact if my assumption is wrong: A 2-second programmatic sleep in every CI run is the
  same flake class as the hard-wait anti-patterns the pipeline exists to eliminate.
```

```
Q4: What is the exact page title of https://bonigarcia.dev/selenium-webdriver-java/?
Context: Required to write a meaningful `await expect(page).toHaveTitle(...)` assertion.
         Without DOM inspection of the live site, Stage 2 cannot assert a specific title.
What I assumed (if proceeding without an answer): Stage 2 will use a permissive regex
  `/.+/` (any non-empty title). Reviewer should replace with the exact title string
  or a tighter regex pattern after checking the page.
Impact if my assumption is wrong: Assertion passes on a completely wrong page
  if the URL resolves to some error page with any non-empty <title> element.
```

```
Q5: Is this test migrated as production acceptance-test content, or as teaching material?
Context: Package `io.github.bonigarcia.webdriver.jupiter.ch04.javascript` identifies
         this as Chapter 4 book exercise, not a real application acceptance test. The
         assertion is about executor blocking behaviour, not SUT behaviour.
What I assumed (if proceeding without an answer): Migration proceeds to produce a
  compilable, runnable Playwright test. The reviewer decides whether to delete it
  (no oracle value), keep it as a capability demonstration, or rewrite it to test
  real functionality of the Bonigarcia demo site.
Impact if my assumption is wrong: Book-exercise content with trivially-passing assertions
  enters the production test suite, inflating coverage metrics without catching real regressions.
```

---

## Risk callouts

- **No app-behavior oracle:** After migration this test will verify at most that the Bonigarcia homepage has a non-empty title. It will not catch any UI regression on that page. Any green result is therefore a false confidence signal.
- **External SUT dependency:** The test target (`https://bonigarcia.dev/selenium-webdriver-java/`) is a third-party public demo site. Tests against external sites are inherently flaky: site downtime, SSL expiry, DNS failure, and maintenance windows all cause test failures unrelated to the SUT. If retained, the test must be tagged `@e2e @slow` and gated out of the default CI run via `--grep-invert`.
- **Timing-based flake (if delay preserved):** Translating `executeAsyncScript` + `setTimeout(cb, 2000)` to `page.evaluate(() => new Promise(r => setTimeout(r, 2_000)))` reintroduces a 2-second hard wait — the exact smell the pipeline migrates *away from*. Do NOT add a wall-clock timing assertion on the evaluate result; there is no web-first equivalent that is meaningful.
- **Behavioural drift by design:** Replacing the wall-clock assertion with a page-title assertion changes the test's semantic intent from "executor blocks for N ms" to "homepage renders a title". This is intentional: the Playwright migration cannot preserve an infrastructure timing assertion, and the title assertion is the minimum viable observable outcome. Reviewer should sign off on this intentional drift.
- **`page.evaluate()` vs `page.evaluateHandle()`:** For Promise-returning scripts, `page.evaluate()` is the correct call (resolves to the JS-side resolved value). `page.evaluateHandle()` returns a `JSHandle` — appropriate only for DOM references. Stage 2 must use `page.evaluate()`.

---

## Expected metrics

- **Selector quality score (estimated post-migration):** 1.0 (1/1 — the only locator-equivalent is URL navigation; no element selectors exist in the source)
- **Smell count delta vs source:** −9 (WebDriverManager binary installer, hardcoded URL, JS hard wait via executeAsyncScript, JavascriptExecutor cast, @AfterEach driver.quit, @BeforeEach driver init, SLF4J debug logger, magic number `2`, wall-clock timing assertion)
- **New test file LOC estimate:** ~20 (reduced from ~43 meaningful source LOC; license header and blank lines excluded from count)
- **Anti-pattern coverage:** 8/8 (all 8 cataloged table rows are addressed; 1 additional unclassified wall-clock assertion flagged separately)
