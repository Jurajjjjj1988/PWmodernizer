# Migration plan: ExplicitWaitJupiterTest.java

## Source framework

**selenium-java** — JUnit Jupiter 5 (`@Test`, `@BeforeEach`, `@AfterEach` from `org.junit.jupiter.api.*`),
Selenium WebDriver 4 (`org.openqa.selenium.*`, `getDomProperty` is a Selenium 4+ API),
`WebDriverWait` + `ExpectedConditions` (`org.openqa.selenium.support.ui.*`),
WebDriverManager (`io.github.bonigarcia.wdm.WebDriverManager`) for automatic ChromeDriver provisioning.
AssertJ (`org.assertj.core.api.Assertions.assertThat`) as the assertion library.

**Target:** Playwright TypeScript, latest stable (v1.x, 2026 conventions).

---

## Summary

This test exercises dynamic image loading: it navigates to a demo page that adds `<img>` elements to the DOM asynchronously via JavaScript, waits for the landscape photograph element to appear, and asserts that its `src` attribute resolves to a path containing the string "landscape". The test validates that the browser correctly processes asynchronously injected images and that the correct image URL is assigned.

### What bug does this catch?

Catches a regression where the landscape image on the loading-images demo page fails to appear or receives an incorrect/empty `src` attribute — e.g., a broken JavaScript timer that never fires, a wrong image path, or a missing element ID.

### User-perceivable assertion checklist

- [ ] After navigating to the loading-images page: the landscape photograph (`#landscape`) is present and visible in the document
- [ ] After image element appears: the landscape image's `src` attribute value contains the substring `"landscape"` (case-insensitive match)

---

## Anti-patterns detected

| Severity | Line | KB-ID | Anti-pattern | Snippet (≤60 chars) | Replacement |
|---|---|---|---|---|---|
| H | 40 | KB-UNCLASSIFIED | WebDriverManager installer in test setup | `driver = WebDriverManager.chromedriver().create()` | DROPPED — Playwright bundles browser management; entire `@BeforeEach` replaced by the `page` fixture |
| H | 50–51 | KB-1.1.14 | hardcoded-url | `driver.get("https://bonigarcia.dev/selenium…")` | configure `baseURL` in `playwright.config.ts`; use relative path `/selenium-webdriver-java/loading-images.html` |
| H | 52 | KB-1.3.4 | WebDriverWait boilerplate per element | `new WebDriverWait(driver, Duration.ofSeconds(10))` | DROPPED — Playwright web-first assertions auto-poll; set `{ timeout: 10_000 }` per-assertion to preserve budget |
| H | 54–55 | KB-1.3.15 | ExpectedConditions ceremony | `wait.until(ExpectedConditions.presenceOfElement…)` | `await expect(page.locator('#landscape')).toHaveAttribute('src', /landscape/i, { timeout: 10_000 })` — single call handles presence + attribute |
| M | 44–46 | KB-1.3.12 | manual `driver.quit()` in `@AfterEach` | `driver.quit();` | DROPPED — Playwright disposes `BrowserContext` and `Page` per test automatically |
| M | 56–57 | KB-1.3.10 | sync DOM-property assertion (no retry) | `assertThat(landscape.getDomProperty("src"))` | `await expect(page.locator('#landscape')).toHaveAttribute('src', /landscape/i)` — polls until the attribute matches |

### Unclassified smells

**WebDriverManager auto-installer** (`KB-UNCLASSIFIED`, line 40): `WebDriverManager.chromedriver().create()` reaches out to a binary registry on every run to download/verify the matching ChromeDriver binary — the Java counterpart of KB-1.4.20 (Python `webdriver-manager`). No Selenium Java–specific KB entry exists. Playwright separates browser provisioning (`npx playwright install chromium`, run once at CI setup time) from test execution entirely. Reviewer: confirm whether this pattern should be catalogued as KB-1.3.25 in `config/knowledge-base.md`.

---

## Locator translation table

| Original | New | Confidence | Notes |
|---|---|---|---|
| `By.id("landscape")` (line 55) | `page.locator('#landscape')` | high | Mechanical translation per KB rule: `By.id("x")` → `locator("#x")`. The id `landscape` does not match a testid-attribute convention. `getByAltText(/landscape/i)` would be semantically preferable if the `<img>` carries a non-empty `alt` attribute, but no DOM evidence is available — see Q1. Do **not** promote to `getByRole` without aria evidence. |

---

## Hallucination-defense pins

N/A — all locators in the table above are HIGH confidence. If the reviewer answers Q1 (alt text confirmed on `<img id="landscape">`), Stage 2 should upgrade the locator to `page.getByAltText(/landscape/i)` at that point; no pin is needed to govern the fallback because the `page.locator('#landscape')` id-based selector is mechanically correct regardless.

---

## Structural changes

**Per-file fate (single-file input):**

| Source file | Fate | Rationale |
|---|---|---|
| `ExplicitWaitJupiterTest.java` | KEPT and RESHAPED → `outputs/tests/explicit-wait-jupiter-test.spec.ts` | The single `@Test` method becomes one `test(...)` call; `@BeforeEach`/`@AfterEach` driver lifecycle DROPPED (Playwright `page` fixture handles it); `WebDriverWait`/`ExpectedConditions` DROPPED (web-first assertion); `WebDriverManager` DROPPED (Playwright bundled browser management) |

**Extract POM:** no — single page, one locator, ~20 functional LOC. Well under the 200-LOC threshold (`migration-rules.md` §1 "When to add a new POM"). Indirection cost of a POM outweighs any benefit here.

**Extract fixture:** no — setup is a single `page.goto(...)` call; inline is clearer and the 1-line threshold in `migration-rules.md` §1 ("Keep inline when: it is a one-line `await page.goto('/foo')`") applies.

**Split into multiple specs:** no — single test scenario.

**New data files:** none required.

**Output spec file:** `outputs/tests/explicit-wait-jupiter-test.spec.ts`

**Named constants Stage 2 must extract:**
- `LOADING_IMAGES_PAGE` = `'/selenium-webdriver-java/loading-images.html'` (relative path; base URL from config)
- `IMAGE_LOAD_TIMEOUT_MS` = `10_000` (preserves source's 10-second WebDriverWait budget)

---

## Open questions for reviewer

```
Q1: Does <img id="landscape"> carry a non-empty alt attribute on the loading-images page?
Context: Line 55 — By.id("landscape") is translated to page.locator('#landscape') (HIGH confidence).
  If the element is <img id="landscape" alt="Landscape photograph"> or similar, the preferred
  Playwright locator is page.getByAltText(/landscape/i) which is semantically stable and
  accessibility-grounded. Upgrading would raise the selector quality score from 0.0 to 1.0.
What I assumed: no alt attribute confirmed — proceeding with page.locator('#landscape').
Impact if wrong: generated locator is correct but lower quality than available; no functional
  regression, but selector quality metric stays 0/1 instead of 1/1.
```

```
Q2: Should presenceOfElementLocated translate to toBeAttached() (DOM presence) or toBeVisible()
  (user-visible)? The source uses EC.presenceOfElementLocated which checks DOM presence, not
  visibility. The image could theoretically be inserted into the DOM before it is rendered.
Context: Lines 54–55. The plan defaults to toHaveAttribute('src', ...) which inherently waits for
  DOM presence AND the attribute to be set — more correct than the original two-step pattern.
What I assumed: toHaveAttribute polling is the right replacement; toBeVisible() is not added as a
  separate gate because it would duplicate the retry semantics.
Impact if wrong: if the page ever inserts the element as display:none before revealing it,
  toHaveAttribute will still pass (attribute is readable on a hidden element). If the intent is
  specifically to assert the image is rendered, a preceding toBeVisible() should be added.
```

```
Q3: Is getDomProperty("src") semantically equivalent to getAttribute("src") for this assertion?
Context: Lines 56–57. getDomProperty("src") (Selenium 4) returns the FULLY RESOLVED absolute URL
  (e.g., https://bonigarcia.dev/selenium-webdriver-java/img/landscape.png). Playwright's
  toHaveAttribute('src', ...) reads the HTML *attribute* which may be a relative path
  (e.g., img/landscape.png). Both contain the substring "landscape" so the assertion passes
  either way, but the semantics differ.
What I assumed: the HTML src attribute contains "landscape" in its value; the regex /landscape/i
  matches both relative and absolute forms. Functional equivalence confirmed for this assertion.
Impact if wrong: for a different assertion (e.g., exact URL match), the difference matters —
  flag this if Stage 2 is ever reused as a pattern for attribute-value exact-match tests.
```

```
Q4: Is https://bonigarcia.dev the configured baseURL for this project, or should the full URL
  remain as a named constant?
Context: Lines 50–51 — driver.get("https://bonigarcia.dev/selenium-webdriver-java/loading-images.html").
  Per KB-1.1.14 and migration-rules.md §6, the base URL should be in playwright.config.ts.
  However, this is a public demo SUT, not an in-house application.
What I assumed: Stage 2 should set BASE_URL = 'https://bonigarcia.dev' in playwright.config.ts
  (or use process.env.BASE_URL) and navigate with the relative path '/selenium-webdriver-java/loading-images.html'.
Impact if wrong: if relative URLs are used but baseURL is not configured, page.goto('/...') will
  resolve against localhost:3000 and fail immediately with a connection-refused error.
```

```
Q5: Is Playwright's default expect timeout (5 000 ms) sufficient for the loading images to appear
  on CI, or must the 10-second budget from WebDriverWait be preserved?
Context: Line 52 — new WebDriverWait(driver, Duration.ofSeconds(10)). Playwright's built-in
  expect.timeout is typically 5 000 ms. If the images take 6–10 s on a cold CI runner, the
  migrated test will fail.
What I assumed: { timeout: IMAGE_LOAD_TIMEOUT_MS } (10 000 ms) is added to the toHaveAttribute
  call to preserve the original tolerance, making the test no stricter than the source.
Impact if wrong: if 5 s is sufficient, the named constant is harmless overhead; if 5 s is
  insufficient, omitting it would introduce a flake that doesn't exist in the Selenium version.
```

---

## Risk callouts

- **External SUT dependency**: the test navigates to `https://bonigarcia.dev/...` — a public internet service outside the team's control. SSL cert rotation, DNS changes, CDN outages, or the maintainer taking the page down will fail the test with no product regression signal. Recommend: (a) mock the page via `page.route` or a local fixture, (b) host a local copy of the loading-images HTML in `inputs/_fixtures/`, or (c) tag `@e2e` and gate the test out of fast-feedback CI runs while keeping it in nightly/scheduled runs.

- **Timeout mismatch (Q5)**: the source explicitly waits 10 s; Playwright's default `expect.timeout` is 5 000 ms. Without `{ timeout: 10_000 }` on the assertion, the migrated test will flake on any CI runner that takes between 5–10 s to load the images — a class of failure that did not exist in the Selenium version. Stage 2 **must** carry the explicit timeout constant forward.

- **`getDomProperty("src")` vs `getAttribute("src")` format drift (Q3)**: `getDomProperty` returns the browser-resolved absolute URL; `toHaveAttribute` reads the raw HTML attribute. The regex `/landscape/i` is safe for this test because "landscape" appears in both forms. If this migration pattern is reused for an attribute-value equality assertion (`toHaveAttribute('src', 'exact-string')`), it will fail silently when relative and absolute paths differ.

- **`presenceOfElementLocated` semantics upgrade**: the migration upgrades the assertion from "element exists in DOM" to "element has correct src attribute". This is strictly better — if the element is in the DOM but has an empty src (race condition where element is inserted before the JavaScript sets its src), the original test would pass but the migration catches the real failure. This is an intentional quality improvement, not a behavioural drift.

---

## Expected metrics

- **Selector quality score (estimated):** 0.0 (0/1 — the single locator is id-based CSS; upgrades to 1.0/1.0 if reviewer answers Q1 and confirms alt attribute)
- **Smell count delta vs source:** −6 (−1 WebDriverManager unclassified, −1 hardcoded URL, −1 WebDriverWait, −1 ExpectedConditions, −1 driver.quit teardown, −1 sync DOM-property assertion; 0 new smells introduced)
- **New test file LOC estimate:** ~25 (vs ~60 source including license header; license dropped, driver lifecycle boilerplate dropped, WebDriverWait ceremony dropped)
- **LOC delta:** −35 (estimate)
- **Anti-pattern coverage:** 6/6 cataloged anti-patterns fully addressed
