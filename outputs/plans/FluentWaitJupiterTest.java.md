# Migration plan: FluentWaitJupiterTest.java

## Source framework

selenium-java — JUnit 5 (Jupiter) + `io.github.bonigarcia.wdm.WebDriverManager` + AssertJ +
`org.openqa.selenium.support.ui.FluentWait` / `ExpectedConditions`. Single-file input; no sibling
POM or helper classes. Framework translation required (not subtractive).

## Summary

The test navigates to Boni Garcia's public `loading-images.html` demo page, which renders four
browser images asynchronously after the initial HTML is parsed. The source uses a `FluentWait` to
poll (10 s ceiling, 1 s interval, ignoring `NoSuchElementException`) until `<img id="landscape">`
appears in the DOM, then makes a one-shot AssertJ assertion that the element's `src` DOM property
contains "landscape" (case-insensitive). The migration must: (1) drop the entire
WebDriverManager / FluentWait / ExpectedConditions ceremony, (2) move the absolute URL to
`playwright.config.ts` as `baseURL`, and (3) collapse the two-step wait-then-assert into a single
web-first `toHaveAttribute` call that auto-retries element presence and attribute resolution
together. No POM, no fixture, no file split.

### What bug does this catch?

Catches a regression where the landscape image fails to load on the loading-images demo page — the
image element is absent from the DOM or its `src` attribute does not contain "landscape" after up
to 10 seconds of polling.

### User-perceivable assertion checklist

- [ ] After `page.goto('/selenium-webdriver-java/loading-images.html')`: the landscape image
  element is reachable and attached to the DOM
- [ ] After the image loads: the element's `src` attribute value contains "landscape"
  (case-insensitive, matched by `/landscape/i`)

**Implementation note for Stage 2 (mandatory):** a single
`await expect(locator).toHaveAttribute('src', /landscape/i, { timeout: 10_000 })` satisfies both
checklist items — Playwright auto-waits for element attachment AND for the attribute to match
before the assertion resolves. Do **not** add a separate `toBeAttached()` or `toBeVisible()` call
before this assertion; it is redundant and adds an unnecessary sync barrier. Do **not** silently
drop either checklist item.

---

## Anti-patterns detected

| Severity | Line | KB-ID | Anti-pattern | Snippet (≤60 chars) | Replacement |
|---|---|---|---|---|---|
| H | 42–43 | KB-UNCLASSIFIED | Java WebDriverManager auto-installer in `@BeforeEach` | `WebDriverManager.chromedriver().create()` | Drop entirely; Playwright manages its own browser binaries via `npx playwright install` — no installer code in any test or setup file |
| H | 52–53 | KB-1.1.14 | Hardcoded absolute URL | `driver.get("https://bonigarcia.dev/…")` | Set `baseURL: process.env.BASE_URL ?? 'https://bonigarcia.dev'` in `playwright.config.ts`; emit `await page.goto('/selenium-webdriver-java/loading-images.html')` |
| H | 54–57 | KB-1.3.4 | `FluentWait` / `WebDriverWait` boilerplate per element | `new FluentWait<>(driver).withTimeout(…)` | Drop entirely; Playwright `expect()` auto-waits and retries without any ceremony |
| H | 59–60 | KB-1.3.15 | `ExpectedConditions` ceremony | `wait.until(EC.presenceOfElementLocated(…))` | Drop; fold into `await expect(locator).toHaveAttribute('src', /landscape/i, { timeout: 10_000 })` — one call replaces the entire wait+assert chain |
| M | 61–62 | KB-1.3.10 | Sync one-shot DOM-property assertion (no retry) | `assertThat(landscape.getDomProperty("src"))` | Replace with `await expect(locator).toHaveAttribute('src', /landscape/i, { timeout: 10_000 })` — auto-retrying web-first assertion |
| L | 47 | KB-1.3.12 | `driver.quit()` in `@AfterEach` | `driver.quit()` | Drop; Playwright's `page` fixture closes context automatically after each test |
| L | 55–56 | KB-1.1.9 | Magic duration literals | `Duration.ofSeconds(10)` / `Duration.ofSeconds(1)` | Translate 10 s → `{ timeout: 10_000 }` per-call override; polling interval is implicit in Playwright's retry loop (no equivalent needed) |

### Unclassified smells

**`WebDriverManager.chromedriver().create()` (lines 42–43)** — Java equivalent of Python's
`webdriver_manager` auto-installer (KB-1.4.20 covers the Python variant; no Java-specific KB-1.3.x
entry exists for this pattern). The library downloads and caches ChromeDriver at runtime via HTTP,
coupling test startup to `chromedriver.storage.googleapis.com` availability. Playwright separates
browser provisioning (`npx playwright install`, run once in CI setup) from test execution,
eliminating the network call entirely. Severity: H. Reviewer: confirm whether KB-1.3.x should
receive a new entry for Java WebDriverManager; until then cite as KB-UNCLASSIFIED.

---

## Locator translation table

| Original | New | Confidence | Notes |
|---|---|---|---|
| `By.id("landscape")` (lines 59–60) | `page.getByRole("img", { name: /landscape/i })` | med | An `<img>` element's ARIA role is `img`; its computed accessible name is its `alt` attribute. `getByRole("img", { name: /landscape/i })` is tier-1 and functionally equivalent to `getByAltText(/landscape/i)` for images. Evidence: element ID and Java variable both named "landscape" strongly suggest `alt="landscape"` by naming convention; bonigarcia educational demos consistently use descriptive alt text. Unconfirmed from source code alone — see Q3 and pin 1. Fallback: `page.locator('#landscape')` (HIGH — direct mechanical translation of `By.id("landscape")`) if alt text is absent or does not match `/landscape/i`. |

---

## Hallucination-defense pins

1. **Landscape image element** — assumed `page.getByRole("img", { name: /landscape/i })`. If DOM
   contradicts (the `<img id="landscape">` element has no `alt` attribute, or its `alt` does not
   match `/landscape/i`): keep `page.locator('#landscape')`, add the **verbatim** WHY-comment
   `'Q3 unresolved — alt text not confirmed'`. Reviewer fallback: open
   `https://bonigarcia.dev/selenium-webdriver-java/loading-images.html` in browser DevTools,
   inspect `<img id="landscape">`, confirm presence and value of `alt`. If `alt` contains
   "landscape" → use `getByRole("img", { name: /landscape/i })`; if absent or different → use
   `locator('#landscape')` with the verbatim WHY-comment above.

   **Stage 2 contract:** any silent promotion of the MED-confidence locator when Q3 has not been
   confirmed by reviewer DOM inspection is a **block-severity** hallucination failure on
   regeneration. Stage 2 must not emit `getByRole("img", { name: /landscape/i })` without the
   reviewer having resolved Q3 affirmatively.

---

## Structural changes

**Output filename:** `fluent-wait-jupiter.spec.ts` (kebab-case per `migration-rules.md` §1)
**Output path:** `outputs/tests/fluent-wait-jupiter.spec.ts`

### Per-file fate

Single-file input — no directory to decompose.

| Source construct | Fate | Target |
|---|---|---|
| `FluentWaitJupiterTest.java` (entire class) | KEPT and RESHAPED | `outputs/tests/fluent-wait-jupiter.spec.ts` |
| `@BeforeEach setup()` — WebDriverManager + driver init | DROPPED | No equivalent needed; Playwright's `page` fixture provides a fresh `BrowserContext` per test |
| `@AfterEach teardown()` — `driver.quit()` | DROPPED | Playwright auto-disposes the context per test (KB-1.3.12) |
| `FluentWait` / `ExpectedConditions` / `Wait<WebDriver>` | DROPPED | Replaced by `expect(locator).toHaveAttribute(…)` auto-retry |

### Other structural decisions

- **Extract POM:** no — single page, single locator, estimated target ~20 LOC; well below the
  200-LOC extraction threshold in `migration-rules.md` §1.
- **Extract fixture:** no — setup is a single `await page.goto(…)`; no auth, no mocking, no
  seeding. One-line `test.beforeEach` is within the ≤3-line rule.
- **Split file:** no — single test case.
- **Import style:** `import { test, expect } from "@playwright/test"` — no POM, no custom fixture,
  ≤2 tests; relaxed 2026-06-03 import policy per `migration-rules.md` §2.

---

## Open questions for reviewer

```
Q1: baseURL — set to "https://bonigarcia.dev" or leave to the project default?
Context: Lines 52–53 — driver.get("https://bonigarcia.dev/selenium-webdriver-java/loading-images.html").
What I assumed: playwright.config.ts sets baseURL: process.env.BASE_URL ?? 'https://bonigarcia.dev'.
  Stage 2 emits await page.goto('/selenium-webdriver-java/loading-images.html').
Impact if wrong: If the project intends to run against a locally controlled mirror of this content,
  the default URL must change. The reference playwright.config.ts template uses
  'http://localhost:3000' as the fallback — that is wrong for this SUT; bonigarcia.dev must be the
  default.
```

```
Q2: Per-assertion timeout — { timeout: 10_000 } per call, or raise expect.timeout globally?
Context: Lines 55–56 — FluentWait with Duration.ofSeconds(10). Default actionTimeout is 5,000 ms.
  The loading-images demo deliberately loads images asynchronously; 5 s may be insufficient on a
  slow connection or loaded CI runner.
What I assumed: Stage 2 passes { timeout: 10_000 } to the single toHaveAttribute call:
    await expect(locator).toHaveAttribute('src', /landscape/i, { timeout: 10_000 })
  with a WHY-comment: "Source FluentWait used 10 s — image load on this page is intentionally delayed."
  A global raise of expect.timeout to 10_000 in playwright.config.ts is an acceptable alternative
  if the reviewer prefers config-level visibility.
Impact if wrong: Using the 5 s default without an override will fail on slow CI runners with a
  timeout error that looks like a product regression. Hard-wait substitutes (waitForTimeout,
  setTimeout, sleep) are NOT acceptable — the { timeout: 10_000 } per-call override is the only
  valid replacement.
```

```
Q3: Does <img id="landscape"> have an alt attribute whose value matches /landscape/i?
Context: Line 59 — By.id("landscape") on the loading-images page. Source code does not include
  DOM fixtures; alt text is inferred from naming convention only.
What I assumed: alt="landscape" (or similar) is present. Primary: page.getByRole("img",
  { name: /landscape/i }) [MED]. Fallback: page.locator('#landscape') [HIGH].
Impact if wrong: If getByRole("img", { name: /landscape/i }) is emitted but alt is absent or
  different, Stage 2 produces a test that finds no element and fails as a locator-not-found error.
  Reviewer MUST resolve this by inspecting the live DOM before Stage 2 runs. If unresolved,
  Stage 2 MUST fall back to locator('#landscape') with the verbatim WHY-comment
  'Q3 unresolved — alt text not confirmed' per pin 1.
```

```
Q4: getDomProperty("src") vs toHaveAttribute("src") — do both contain "landscape"?
Context: Lines 61–62 — getDomProperty returns the resolved absolute URL (IDL attribute);
  toHaveAttribute checks the raw HTML attribute value (may be relative).
What I assumed: Both the HTML src attribute and the resolved property value contain "landscape" in
  the filename (e.g., the src attribute is something like "img/landscape-3297.jpg"). The
  case-insensitive regex /landscape/i covers both forms.
Impact if wrong: If the raw HTML src attribute is a server-generated path without "landscape"
  (e.g., a numeric CDN URL), toHaveAttribute would pass the source assertion but fail the migrated
  one. Stage 2 should note this semantic difference with a WHY-comment inline.
```

```
Q5: Is the image-loaded oracle sufficient — src contains "landscape" but not naturalWidth > 0?
Context: Lines 61–62 — source checks src substring, not browser decode success. A 404 with the
  right filename passes the current assertion.
What I assumed: Preserve the same assertion depth as the source. Noted as a known oracle weakness.
Impact if wrong: If the reviewer wants to catch broken image URLs (404 responses), a
  page.evaluate() checking img.complete && img.naturalWidth > 0 would be needed as a second
  assertion — this is out of scope for the migration unless explicitly requested.
```

```
Q6: EC.presenceOfElementLocated vs visibilityOfElementLocated — which is the correct contract?
Context: Lines 59–60 — source uses presenceOfElementLocated (DOM-attached, not necessarily visible).
  An <img> could be in the DOM but hidden (display:none, opacity:0).
What I assumed: toHaveAttribute auto-waits for element attachment; the page intent is for images
  to become visible once loaded, so the two are equivalent in practice.
Impact if wrong: If an image could be attached but hidden, toHaveAttribute passes but the user
  cannot see the image. Adding a toBeVisible() call before or after toHaveAttribute would be the
  fix, at the cost of a slightly stricter oracle.
```

---

## Risk callouts

- **External SUT flake:** `https://bonigarcia.dev` is a public third-party site not under project
  control. Downtime, DNS failures, or rate-limiting of CI IPs cause the test to fail with a
  navigation timeout unrelated to any product regression. Tag `@e2e` (and optionally `@slow`) to
  enable CI gating so this test can be excluded from the default fast run.

- **Timeout regression from 5 s default:** The source's 10-second FluentWait tolerance was chosen
  because this demo page deliberately loads images asynchronously. Dropping to the 5-second
  `actionTimeout` default without a per-assertion `{ timeout: 10_000 }` override halves the
  tolerance and produces false-positive CI failures on any loaded runner. See Q2 — the override is
  mandatory, not advisory.

- **`getDomProperty` vs `toHaveAttribute` semantic gap:** Selenium's `getDomProperty("src")`
  returns the fully-resolved absolute URL; Playwright's `toHaveAttribute` checks the raw HTML
  attribute value, which may be a relative path. For this test the regex `/landscape/i` should
  match both forms, but Stage 2 must include a WHY-comment noting the semantic difference so a
  future maintainer does not change the regex to an exact-string match and silently break the
  assertion. See Q4.

- **Locator confidence gap:** The primary locator `page.getByRole("img", { name: /landscape/i })`
  is MED confidence. If alt text is absent or does not match `/landscape/i`, Stage 2 produces a
  test that immediately throws "locator not found" with no clear diagnostic. Reviewer MUST resolve
  Q3 before Stage 2 runs to avoid this failure mode. If Q3 cannot be resolved, Stage 2 uses
  `page.locator('#landscape')` with the verbatim WHY-comment per pin 1 — this is the correct and
  safe path, not a degraded fallback.

- **Single-image scope is narrow:** Only `#landscape` is tested; the other three images on the
  page (`#compass`, `#waterfall`, `#city`) are not covered. This mirrors the source scope
  deliberately — extending coverage to all four images is out of scope unless the reviewer requests
  it.

---

## Expected metrics

- **Selector quality score (estimated):** 1/1 = 1.0 if Q3 confirms alt text
  (`getByRole("img", { name: /landscape/i })` is tier-1 role-based); 0/1 = 0.0 if Q3 is
  unresolved and fallback `locator('#landscape')` is used. Reviewer should resolve Q3 before
  Stage 2 runs to hit the ≥ 0.7 target.
- **Smell count delta vs source:** −7 (−1 WebDriverManager installer, −1 hardcoded URL, −1
  FluentWait boilerplate, −1 ExpectedConditions ceremony, −1 sync DOM-property assertion, −1
  `@AfterEach` driver.quit, −1 magic duration literals; +0 new smells introduced)
- **Source LOC:** ~65 (including copyright header, blank lines, imports, class/field boilerplate)
- **Estimated target LOC:** ~20–25
- **LOC delta:** ~−40
- **Anti-pattern coverage:** 7/7
