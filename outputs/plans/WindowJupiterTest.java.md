# Migration plan: WindowJupiterTest.java

## Source framework

`selenium-java` — JUnit Jupiter 5 (`@Test`, `@BeforeEach`, `@AfterEach`) with Selenium WebDriver 4.x and WebDriverManager for ChromeDriver binary provisioning. Single `.java` source file (no BasePage, no helper classes). Target: Playwright TypeScript on the latest stable major (v1.x, 2026).

## Summary

`WindowJupiterTest` navigates to a public demo site, records the browser window's OS-level position and size, calls `driver.manage().window().maximize()`, then asserts that both the position and the outer dimensions changed. The class has a single `@Test` method (`testWindow`) that is annotated `@Disabled`, meaning **it has never run in CI**. The `@AfterEach` teardown inserts a hard `Thread.sleep(3 s)` labeled `// FIXME: pause for manual browser inspection` before `driver.quit()`.

**Critical migration caveat — read before Stage 2 begins.** Playwright's `page` fixture does not expose OS-level browser window position (`x, y`) or an outer-window-size API. `driver.manage().window().getPosition()` and `driver.manage().window().maximize()` have **no direct Playwright equivalents**. The two core assertions cannot be preserved verbatim. The reviewer must decide the target strategy (see Q2 and Q3) before Stage 2 generates any code.

### What bug does this catch?

Catches a regression where `WebDriver.manage().window().maximize()` silently fails to change the browser window's OS-level position and outer dimensions — it guards browser/WebDriver infrastructure behavior, not web application behavior. Because the test is currently `@Disabled`, it is catching no regressions in practice.

### User-perceivable assertion checklist

- [ ] After `window.maximize()`: window position (`x, y`) differs from the position recorded before maximize
- [ ] After `window.maximize()`: window outer dimensions (`width × height`) differ from the dimensions recorded before maximize

## Anti-patterns detected

| Severity | Line | KB-ID | Anti-pattern | Snippet (≤60 chars) | Replacement |
|---|---|---|---|---|---|
| H | 45 | KB-1.3.25 | binary-installer-in-test | `WebDriverManager.chromedriver().create()` | Drop; Playwright `page` fixture provides the browser with no network call |
| H | 50–51 | KB-1.3.1 | hard-wait | `Thread.sleep(Duration.ofSeconds(3).toMillis())` | Remove entirely — debug pause, no runtime condition to replace it with |
| H | 59 | KB-1.1.14 | hardcoded-url | `driver.get("https://bonigarcia.dev/…")` | `baseURL` in `playwright.config.ts` + `await page.goto('/')` |
| M | 49–54 | KB-1.3.12 | manual-driver-teardown | `@AfterEach void teardown() { … driver.quit(); }` | Drop; Playwright auto-disposes the browser context after each test |
| M | 56–57 | KB-UNCLASSIFIED | disabled-test-no-tracked-reason | `@Disabled @Test void testWindow()` | Migrate as `test.skip(reason)` with a tracker reference, or remove annotation if re-enabling |
| L | 50 | KB-UNCLASSIFIED | fixme-comment | `// FIXME: pause for manual browser inspection` | Remove; open a tracker issue instead (`migration-rules.md` §8) |
| L | 64–65 | KB-UNCLASSIFIED | debug-log | `log.debug("Initial window: position {} …")` | Remove; no assertion backs it — use trace viewer if post-hoc inspection is needed |
| L | 71–72 | KB-UNCLASSIFIED | debug-log | `log.debug("Maximized window: position {} …")` | Remove; same rationale |

### Unclassified smells

Three rows above carry `KB-UNCLASSIFIED`. No explicit §1.3 entry covers them; reviewer confirmation needed to promote these to first-class KB entries.

1. **`@Disabled` without a tracked reason** (line 56) — analogous in intent to Cypress KB-1.2.46 (`describe.skip` without a ticket link). The annotation disables the test indefinitely with no expiry or tracking. Playwright equivalent: `test.skip('window-position/maximize API not supported in Playwright headless — see issue #<N>')`. Until resolved, Stage 2 should emit a `test.skip()` block (see Q2).

2. **FIXME comment in committed code** (line 50) — `migration-rules.md` §8 forbids `TODO`/`FIXME` in committed code ("Tracking issues belong in the tracker, not in code"). This comment documents a deliberate debug shortcut that should be a ticket.

3. **SLF4J `log.debug` as debug residue** (lines 64–65, 71–72) — no explicit KB-1.3.x entry, but SLF4J `log.debug(...)` in test code is the Java equivalent of `console.log` debug residue (spirit of `migration-rules.md` §8 and KB-1.1 family). These lines have zero assertion value — they existed only for manual inspection. Drop them.

## Locator translation table

This test contains **zero DOM element locators** — no `driver.findElement(By.*)` calls appear anywhere in the source. Window management is performed entirely via `driver.manage().window()`, a browser-level API with no DOM counterpart. The only "navigation target" is the URL.

| Original | New | Confidence | Notes |
|---|---|---|---|
| `driver.get("https://bonigarcia.dev/selenium-webdriver-java/")` | `await page.goto('/')` | med | Pattern is clear (relative path + `baseURL` in config); exact path depends on what `baseURL` is configured to. See Q1 and Pin 1. |

*Window API translation — structural, not DOM locators:*

| Selenium Java call | Playwright equivalent | Notes |
|---|---|---|
| `driver.manage().window()` | N/A | No direct equivalent in the `page` fixture API |
| `window.getPosition()` | N/A | OS window position not exposed by Playwright |
| `window.getSize()` | `page.viewportSize()` | Returns **content-area** viewport only, not outer window dimensions |
| `window.maximize()` | None / CDP workaround | No Playwright API; see Q3 for options |

## Hallucination-defense pins

1. **Demo site navigation URL** — assumed `await page.goto('/')` with `baseURL = https://bonigarcia.dev/selenium-webdriver-java` in `playwright.config.ts`. If `baseURL` covers the domain only (`https://bonigarcia.dev`): keep `await page.goto('/selenium-webdriver-java/')`, add WHY-comment `'Q1 unresolved: baseURL config unknown'`. Reviewer fallback: confirm the project's `baseURL` value before Stage 2 generates the `goto` call.

## Structural changes

**Per-file fate (single-file input):**

- **`WindowJupiterTest.java`** → **KEPT and RESHAPED** into `outputs/tests/window-jupiter.spec.ts`. One `test.describe('Window management', ...)` block containing one `test.skip(...)` (or `test(...)` if reviewer enables it per Q2).

- **`@BeforeEach setup()` (lines 43–46)** → **DROPPED as a lifecycle hook.** The only action it performs is `WebDriverManager.chromedriver().create()`, which maps to Playwright's `page` fixture (zero-code). There is no navigation in `setup()` — the `driver.get(...)` is inside the test method itself. No `test.beforeEach` is needed.

- **`@AfterEach teardown()` (lines 49–54)** → **DROPPED entirely.** `Thread.sleep` is removed (KB-1.3.1, debug pause). `driver.quit()` is replaced by Playwright's automatic browser context disposal (KB-1.3.12). No `test.afterEach` is needed.

- **`static final Logger log`** (line 39) → **DROPPED.** All `log.debug` calls are removed (Unclassified smell #3 above).

- **`WebDriver driver` field** (line 41) → **DROPPED.** Replaced by Playwright's built-in `{ page }` test fixture parameter.

- **No POM extraction.** The test has zero DOM locators and touches only browser window APIs. No DOM region to encapsulate. Source file is well below the 200-LOC POM threshold (`migration-rules.md` §1).

- **No fixture extraction.** The only setup is a single `page.goto()` call (inline; per `migration-rules.md` §1 "a one-line `await page.goto('/foo')` — keep inline").

- **No file split.** Single `@Test` method → single `test(...)` or `test.skip(...)` block. One spec file is correct.

**Target file tree produced by Stage 2 (no other files):**
```
outputs/tests/window-jupiter.spec.ts
```

## Open questions for reviewer

**Q1: `baseURL` configuration for the demo site.**
Context: line 59, `driver.get("https://bonigarcia.dev/selenium-webdriver-java/")`.
What I assumed: `baseURL = https://bonigarcia.dev/selenium-webdriver-java` → relative path `'/'`.
Impact if wrong: `page.goto('/')` navigates to the wrong page; test fails with no useful signal.

---

**Q2: Should the migrated test be `test.skip()` or `test()`?**
Context: line 56, `@Disabled @Test void testWindow()`. No tracking comment explains why it was disabled.
What I assumed: migrate as `test.skip('window-position/maximize API not available in Playwright headless — resolves with Q3')`.
Impact if wrong: if reviewer wants to enable the test, Stage 2 needs a concrete implementation strategy (see Q3) and should NOT emit a skip block.

---

**Q3: Window maximize API — what is the target assertion strategy?**
Context: lines 60–75. `window.getPosition()`, `window.getSize()`, and `window.maximize()` have no direct Playwright equivalents. Three options:

  - **Option A — `test.skip()` with documentation.** The test covers browser infrastructure that does not apply to Playwright's headless model. Simplest and honest. Stage 2 emits a skip block with a WHY-comment.
  - **Option B — Viewport approximation.** Use `page.viewportSize()` before and after `page.setViewportSize({ width: ..., height: ... })` to verify a size change. Tests a different concept (viewport, not window), but is the closest available Playwright primitive.
  - **Option C — CDP window-state control.** Use `browser.newBrowserCDPSession().send('Browser.setWindowBounds', ...)` to programmatically resize and inspect the browser window. Requires non-headless launch or a CDP-aware runner; heavy for one smoke assertion.

What I assumed (default): **Option A** — `test.skip()`.
Impact if assumption is wrong: Stage 2 generates a skip that the reviewer must replace with a real implementation; re-prompt Stage 2 with the chosen option.

---

**Q4: Is `https://bonigarcia.dev/selenium-webdriver-java/` the correct SUT for this project?**
Context: this is the Selenium WebDriver Java book's public practice site (Boni García). If the migration is for a company product, the URL must be replaced.
What I assumed: URL stays as-is but becomes `baseURL`-relative.
Impact if wrong: tests pass against the wrong SUT; real application regressions go undetected.

---

**Q5: Should the OS-level position assertion be preserved in any form?**
Context: lines 74–75. `assertThat(initialPosition).isNotEqualTo(maximizedPosition)` compares `org.openqa.selenium.Point` objects. Playwright exposes no `window.getPosition()` equivalent at all.
What I assumed: assertion dropped entirely (no Playwright equivalent); only the size assertion may be approximated via viewport (Q3 Option B).
Impact if wrong: if reviewer needs x/y-based position assertions, they require a custom CDP session or a non-headless runner; flag this to the platform team.

---

**Q6: Was the `Thread.sleep(3000)` in teardown masking a real timing issue, or purely debug convenience?**
Context: lines 50–51. The FIXME label says "pause for manual browser inspection", strongly suggesting it is debug-only.
What I assumed: safe to remove entirely with no replacement.
Impact if wrong: if the sleep was masking a real teardown race (browser log flush, screenshot upload, async session close), removing it surfaces the underlying issue in CI. In that case, the correct fix is a web-first assertion on the teardown condition, not a timed pause.

---

**Q7: Migrated test title — should it reflect the skip or the intended behavior?**
Context: `testWindow()` (line 58) has no descriptive name. Per `migration-rules.md` §2, titles must start with a present-tense verb, no "should", under 80 chars.
What I assumed:
  - If `test.skip()`: `"window maximize — skipped: headless Playwright limitation (see Q3) @edge"`
  - If `test()`: `"maximizes browser window and detects position and size change @edge"`
Impact if wrong: cosmetic; reviewer can adjust. No re-prompt of Stage 2 required.

---

**Q8: SLF4J `log.debug` calls — is any project tooling consuming these log lines from CI output?**
Context: lines 64–65 and 71–72. These log the window coordinates at `DEBUG` level.
What I assumed: no CI tooling depends on them; safe to drop with no replacement.
Impact if wrong: if a CI log aggregator parses these lines for test artifact correlation, removing them breaks that tooling. If logging is needed, the canonical Playwright replacement is `test.step()` blocks (visible in the HTML trace report).

## Risk callouts

- **Behavioral drift — window management APIs (HIGH):** Playwright does not expose `window.getPosition()`, `window.getSize()` (as outer window), or `window.maximize()` in the `page` fixture. The test's two core assertions cannot be expressed as standard Playwright web-first matchers. This is a fundamental API mismatch, not a locator translation problem. Reviewer must resolve Q3 before Stage 2 can produce runnable code.

- **Headless mode incompatibility:** Even with a CDP workaround (Q3 Option C), headless Chromium windows have no OS desktop to maximize into. Window position will remain at `{x: 0, y: 0}` and the `isNotEqualTo(maximizedPosition)` assertion would trivially fail. Non-headless (`headless: false`) is required for true window-maximize semantics, which breaks standard CI.

- **`@Disabled` means no known-good baseline:** The source test has never run successfully in CI. Enabling it in the migration is a net-new test write, not a migration of a verified test. The reviewer should apply a higher review bar for the assertions.

- **Platform-dependent window behavior:** OS-level window maximize produces different positions and sizes on Windows (taskbar height), Linux (tiling window manager), and macOS (menu bar). Tests that assert on absolute or relative window coordinates are inherently platform-coupled and prone to CI-environment drift.

- **AssertJ non-web-first assertions:** The source assertions (`assertThat(point).isNotEqualTo(otherPoint)`) are synchronous object comparisons, not polling web-first matchers. The nearest Playwright equivalent (`expect(after).not.toEqual(before)`) is also synchronous — correct for non-DOM objects, but provides none of Playwright's auto-retry semantics. This is expected behavior for window dimension assertions; just confirming it is intentional and not a web-first regression.

- **Single disabled test — low complexity, high API mismatch:** The test body is only ~18 lines of functional code, but the window API mismatch makes this harder to migrate than a typical single-page form test. LOC complexity is low; semantic complexity is high.

## Expected metrics

- **Selector quality score (estimated):** N/A — zero DOM locators in the source; the metric is undefined (0/0). Evaluator should record as `1.0` (vacuously: all 0 locators are high-quality) and annotate the report.
- **Smell count delta:** −8 (3 H-severity + 2 M-severity + 3 L-severity removed; 0 new smells introduced)
- **LOC delta:** approximately −54 (source 79 lines including Apache license header; target estimated 25 lines for a skip block or ~30 for a viewport-approximation test)
- **Anti-pattern coverage:** 8/8 (all catalogued anti-patterns addressed in this plan)
