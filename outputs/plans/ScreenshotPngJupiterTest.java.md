# Migration plan: ScreenshotPngJupiterTest.java

## Source framework

selenium-java — JUnit 5 with `io.github.bonigarcia.wdm.WebDriverManager` for browser provisioning. Book example from *Hands-On Selenium WebDriver with Java* (Boni Garcia), chapter 4 (screenshots). No Selenium version inferable from imports alone; WebDriverManager implies auto-matched ChromeDriver.

Target: Playwright TypeScript, latest stable (v1.x, 2026 conventions).

## Summary

This test navigates to the public Selenium WebDriver practice site (`https://bonigarcia.dev/selenium-webdriver-java/`), takes a full-page screenshot using Selenium's `TakesScreenshot` API, moves the resulting file to `screenshot.png` in the working directory, and asserts the file exists on disk. There are zero DOM-element locators, zero UI assertions, and zero user-perceivable behaviour verified. The test is a chapter-demonstration of the screenshot API, not a regression guard.

**Critical migration concern:** The source has no meaningful UI assertion. The migration cannot simply translate the filesystem assertion (`assertThat(destination).exists()`) to Playwright — that assertion was only proving Selenium could write a file. Stage 2 must ADD a user-perceivable assertion. The reviewer must confirm what that assertion should be (see Q1–Q3 in Open questions).

### What bug does this catch?

As written: a regression where Selenium's screenshot API fails to produce an output file — a test of the test framework, not of the application. Post-migration target: a regression where the practice site's main heading fails to render after navigation. The reviewer must confirm the heading text or supply an alternative stable assertion (see Q3).

### User-perceivable assertion checklist

- [ ] After navigation: the practice site's main heading is visible
  *(heading text unknown — see Q3; LOW confidence placeholder is `getByRole('heading', { level: 1 })`)*

> **Note:** The source test makes no user-perceivable assertion. The checklist item above is a migration addition, not a preserved assertion. If the reviewer decides the intent is visual regression, substitute: `expect(page).toHaveScreenshot('screenshot-png-jupiter.png')` tagged `@visual`.

## Anti-patterns detected

| Severity | Line | KB-ID | Anti-pattern | Snippet (≤60 chars) | Replacement |
|---|---|---|---|---|---|
| H | 48 | KB-1.3.25 | WebDriverManager binary installer in test | `WebDriverManager.chromedriver().create()` | Drop entirely; Playwright `page` fixture provisions the browser |
| H | 58 | KB-1.1.14 | Hardcoded absolute URL | `driver.get("https://bonigarcia.dev/selen…")` | `baseURL` in `playwright.config.ts` + `await page.goto('/selenium-webdriver-java/')` |
| H | 59–67 | KB-1.1.24 | Screenshot-as-assertion (file-existence check, not UI check) | `ts.getScreenshotAs(OutputType.FILE)` … `assertThat(dest).exists()` | Replace with web-first UI assertion; use Playwright config `screenshot: 'only-on-failure'` for debug artefacts |
| M | 52–54 | KB-1.3.12 | Manual `driver.quit()` in `@AfterEach` | `@AfterEach void teardown() { driver.quit(); }` | Drop; Playwright `page` fixture auto-disposes the context after each test |

### Unclassified smells

**Lines 62, 65 — SLF4J `log.debug()` calls:**
Two `log.debug(...)` statements logging the screenshot creation and file-move path. In Java these are standard SLF4J practice, not an anti-pattern in the source; however they have no equivalent in the migrated TypeScript (where `console.log` / `console.debug` are forbidden by the evaluator). They will be dropped. No KB entry for Java SLF4J logging in tests; flagged as L-severity, to-be-dropped.

**Lines 59–60 — `TakesScreenshot` cast:**
`TakesScreenshot ts = (TakesScreenshot) driver;` is the Selenium idiom for exposing the screenshot API on the driver. No Playwright equivalent exists as a surface concept; the whole screenshot-capture-and-save machinery (lines 59–67) maps to Playwright's config-level `screenshot: 'only-on-failure'` and is dropped entirely. Covered conceptually by KB-1.1.24 above.

## Locator translation table

The source has **no DOM element locators** — no `findElement()`, `By.*`, or `driver.find_element()` calls. The only interaction is navigation (`driver.get(url)`) and Selenium's screenshot API. The table below maps (1) the navigation call and (2) the source's only assertion to their migration targets.

| Original | New | Confidence | Notes |
|---|---|---|---|
| `driver.get("https://bonigarcia.dev/selenium-webdriver-java/")` | `page.goto('/selenium-webdriver-java/')` | high | Mechanical URL → relative path; `baseURL` configured as `https://bonigarcia.dev` via `process.env.BASE_URL` in `playwright.config.ts` (see Q4) |
| `assertThat(destination).exists()` (filesystem assertion) | `expect(page.getByRole('heading', { level: 1 })).toBeVisible()` | low | Source asserts file existence, not UI state; migration must replace with a UI assertion — heading text and element type are unknown without DOM inspection (see Q1, Q3) |

## Hallucination-defense pins

1. **Practice site main heading** — assumed `page.getByRole('heading', { level: 1 })`. If DOM contradicts (e.g., heading is an element with no ARIA heading role): keep `page.locator('h1')` as fallback, add WHY-comment `'Q3 unresolved: heading element and text not confirmed from DOM inspection'`. Reviewer fallback: open `https://bonigarcia.dev/selenium-webdriver-java/` in a browser, inspect the first heading element, then replace with `page.getByRole('heading', { name: '<exact text>', level: 1 })` at HIGH confidence.

## Structural changes

Per-file fate of source artefacts:

| Source artefact | Fate | Reason |
|---|---|---|
| `ScreenshotPngJupiterTest.java` (class + test) | **KEPT and RESHAPED** → `outputs/tests/screenshot-png-jupiter.spec.ts` | Single test; reshaped to Playwright `test.describe` + `test()` |
| `@BeforeEach setup()` + `WebDriverManager.chromedriver().create()` | **DROPPED** | Playwright `page` fixture handles browser lifecycle; no `@BeforeEach` needed |
| `@AfterEach teardown()` + `driver.quit()` | **DROPPED** | Playwright auto-disposes per-test `BrowserContext`; KB-1.3.12 |
| `static final Logger log` + `log.debug(...)` | **DROPPED** | No debug logging infrastructure needed in migrated TypeScript |
| `TakesScreenshot` + `Files.move` + `assertThat(destination).exists()` | **DROPPED and REPLACED** | Entire screenshot-to-file mechanism replaced by a web-first UI assertion; Playwright config handles on-failure screenshots |

- **Extract POM:** no — zero DOM locators, single page, estimated target ~28 LOC (threshold is 200 LOC per `migration-rules.md` §1)
- **Extract fixture:** no — setup reduces to one `page.goto()` line; no complex pre-conditions, no cross-test state
- **Split into multiple specs:** no — single `@Test` method maps to a single `test(...)` block

## Open questions for reviewer

```
Q1: What user-perceivable assertion should replace `assertThat(destination).exists()`?
Context: Source asserts a screenshot FILE exists on disk — not any UI element. The migration must add a meaningful UI assertion.
What I assumed (if proceeding): `await expect(page.getByRole('heading', { level: 1 })).toBeVisible()` as a placeholder.
Impact if assumption is wrong: Test either passes vacuously (if no h1 exists) or fails immediately without a useful error message.
```

```
Q2: Is the intent of this test visual regression testing, or just a page-load smoke check?
Context: The book chapter is about screenshots; the test may have been intended to demonstrate/verify visual output, not functional behaviour.
What I assumed: the screenshot is purely demonstrational; migration should replace with a content assertion and drop the screenshot machinery.
Impact if assumption is wrong: if visual regression IS the intent, Stage 2 should emit `await expect(page).toHaveScreenshot('screenshot-png-jupiter.png')` tagged `@visual` instead of a heading assertion. A baseline PNG must be committed alongside.
```

```
Q3: What visible heading text appears on `https://bonigarcia.dev/selenium-webdriver-java/` after page load?
Context: The LOW confidence heading locator needs to be anchored to actual DOM content.
What I assumed: an h1 heading exists on the page root (typical for static book demo sites).
Impact if assumption is wrong: the generated `getByRole('heading', { level: 1 })` will time out and the test fails immediately; fallback to `page.locator('h1')` is also uncertain without DOM inspection.
```

```
Q4: Should `baseURL` be `https://bonigarcia.dev` (project-wide), or does the project already have a baseURL targeting a different environment?
Context: Line 58 navigates to `https://bonigarcia.dev/selenium-webdriver-java/`. The relative goto path depends on what baseURL is configured.
What I assumed: `baseURL: process.env.BASE_URL ?? 'https://bonigarcia.dev'` in playwright.config.ts; goto path is `/selenium-webdriver-java/`.
Impact if assumption is wrong: navigation fails with a 404 or lands on the wrong page.
```

```
Q5: Should this test be tagged `@slow` given it hits an external third-party URL with no SLA?
Context: `bonigarcia.dev` is a publicly owned demo site, not an internal staging server. It can be slow or unavailable on CI.
What I assumed: no `@slow` tag; standard `navigationTimeout: 15_000` from config is sufficient.
Impact if assumption is wrong: if CI has no outbound internet access, the test fails at navigation — not a meaningful product regression signal.
```

```
Q6: Should the screenshot file `screenshot.png` be committed to the repo (e.g. as a visual baseline) or removed entirely?
Context: The source writes `screenshot.png` to the working directory. Playwright's `screenshot: 'only-on-failure'` produces screenshots automatically when tests fail, with no manual file management.
What I assumed: the file should NOT be committed; it is a debug artefact. Playwright config handles on-failure screenshots.
Impact if assumption is wrong: if the file is a golden baseline for visual comparison, Stage 2 must use `toHaveScreenshot()` and commit the PNG.
```

## Risk callouts

- **External third-party dependency**: The SUT is `bonigarcia.dev` — a public demo site not under this project's SLA. It can go down, change content, add CAPTCHAs, or block CI IP ranges; all cause test failures unrelated to product regressions. Recommend: either mock the navigation response (page.route) or accept the network flake risk and tag `@slow`.

- **No meaningful source assertion to preserve**: This is an additive migration — the source has zero UI assertions. Every assertion in the migrated test is INVENTED by the migration, not translated from source. This means the assertion checklist above is a contract between the plan author and the reviewer, not a direct translation. Reviewer must actively confirm or replace the heading assertion before Stage 2 generates code.

- **Visual regression scope unclear**: If the intent is to use `toHaveScreenshot()` for visual regression, a PNG baseline must be committed before CI can pass. The source has no baseline file; the test would fail on first CI run after generation (expected — Playwright generates the baseline on first run, test passes on second run).

- **Screenshot file pollution**: The source creates `screenshot.png` in the working directory on every run. This pollutes `git status` and CI artefact storage. Playwright's `screenshot: 'only-on-failure'` + `trace: 'retain-on-failure'` in `playwright.config.ts` produces richer debug artefacts only when the test fails, without touching the working directory.

## Expected metrics

- Selector quality score (estimated post-migration): 1.0 (1/1 — the single new assertion locator will be role-based; the `driver.get(url)` navigation has no DOM selector to count)
- Smell count delta vs source: −4 (KB-1.3.25 binary installer, KB-1.1.14 hardcoded URL, KB-1.1.24 screenshot-as-assertion, KB-1.3.12 manual teardown; plus 2 unclassified L-severity items dropped)
- Source LOC: ~70 (including Apache license header, imports, class shell, lifecycle, one test method)
- New test file LOC estimate: ~28 (migration attribution line + imports + single describe + single test with navigation + one assertion)
- LOC delta: approximately −42
- Anti-pattern coverage: 4/4 KB-backed (+ 2 unclassified smells, both addressed)
