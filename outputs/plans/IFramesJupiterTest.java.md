# Migration plan: IFramesJupiterTest.java

## Source framework

selenium-java — JUnit 5 + Selenium WebDriver 4 + WebDriverManager 5 (inferred from `io.github.bonigarcia.wdm.WebDriverManager` import and `Duration.ofSeconds` API introduced in Selenium 4). Target: Playwright TypeScript on the latest stable major (1.x).

Single-file input: no sibling page-object, base-test, or config files — the test is fully self-contained.

## Summary

This test navigates to a demonstration page containing an embedded `<iframe>`, waits for the frame to become accessible, switches the WebDriver context into it, then asserts that the frame body contains exactly 20 `<p>` elements. It exercises a single scenario: verifying that the iframe's content loads fully and matches the expected paragraph count.

The source is a compact (28 LOC of logic, 65 total with license/imports) self-contained JUnit 5 test. The entire WebDriverWait + ExpectedConditions stack is replaced by Playwright's built-in auto-wait and a single web-first `toHaveCount` assertion.

### What bug does this catch?

Catches a regression where the `my-iframe` iframe on the iframes demonstration page fails to mount its content, producing a paragraph count other than 20 (including 0 if the frame does not load at all).

### User-perceivable assertion checklist

- [ ] After navigating to the iframes page and switching into `my-iframe`: exactly 20 `<p>` elements are present inside the iframe content

## Anti-patterns detected

| Severity | Line | KB-ID | Anti-pattern | Snippet (≤60 chars) | Replacement |
|---|---|---|---|---|---|
| H | 51–53 | KB-1.1.14 | hardcoded-url | `driver.get("https://bonigarcia.dev/…")` | Configure `baseURL` in `playwright.config.ts`; use relative path `/selenium-webdriver-java/iframes.html` |
| H | 60 | KB-1.3.7 | snapshot-list | `List<WebElement> paragraphs = driver.findElements(pName)` | Drop snapshot — replace with a live `Locator` and `toHaveCount(20)` |
| H | 61 | KB-1.3.10 | sync-count-assert | `assertThat(paragraphs).hasSize(20)` | `await expect(iframeParagraphs).toHaveCount(20)` (web-first, polls to timeout) |
| M | 41 | KB-1.3.25 | browser-binary-installer | `WebDriverManager.chromedriver().create()` | Drop entirely; Playwright manages browser binaries via `npx playwright install` |
| M | 46 | KB-1.3.12 | manual-teardown | `driver.quit()` | Automatic — Playwright `page` fixture disposes context after every test |
| M | 54 | KB-1.3.4 | webdriverwait-boilerplate | `new WebDriverWait(driver, Duration.ofSeconds(10))` | Drop; Playwright actions + `expect` auto-wait up to `actionTimeout` |
| M | 55–56 | KB-1.3.15 | expectedconditions-ceremony | `wait.until(EC.frameToBeAvailableAndSwitchToIt…)` | `page.frameLocator('iframe[name="my-iframe"]')` — frameLocator auto-waits for iframe to appear |
| M | 59 | KB-1.3.15 | expectedconditions-ceremony | `wait.until(EC.numberOfElementsToBeMoreThan…)` | Subsumed by `await expect(iframeParagraphs).toHaveCount(20)` — that matcher polls from 0 to 20 |
| L | 58 | KB-UNCLASSIFIED | tag-name-selector | `By pName = By.tagName("p")` | `frameLocator.locator('p')` — no ARIA role alternative for generic `<p>`; see Unclassified smells |

### Unclassified smells

`By.tagName("p")` (line 58): The knowledge base has no dedicated entry for `By.tagName` selectors. The smell is that a structural tag-name selector has no semantic grounding. However, generic `<p>` elements do not expose an ARIA role in the accessibility tree that would allow `getByRole`; CSS tag `p` is the only viable and correct translation. Severity **L** (stylistic; no functional impact; no better alternative exists). Reviewer confirmation requested: acceptable to treat as KB-UNCLASSIFIED?

## Locator translation table

| Original | New | Confidence | Notes |
|---|---|---|---|
| `EC.frameToBeAvailableAndSwitchToIt("my-iframe")` | `page.frameLocator('iframe[name="my-iframe"]')` | med | Selenium's string overload matches `name` OR `id`; DOM inspection required to confirm which attribute is present — see Q1 and Pin 1 |
| `By.tagName("p")` (inside iframe context) | `frameLocator.locator('p')` | high | Direct tag-name translation; no accessible ARIA role exists for generic `<p>` elements; CSS tag selector is the correct and only viable approach |

## Hallucination-defense pins

1. **iframe context switch** — assumed `page.frameLocator('iframe[name="my-iframe"]')`. If DOM contradicts (uses `id="my-iframe"` instead of `name="my-iframe"`): switch to `page.frameLocator('#my-iframe')`, add WHY-comment `'Q1 unresolved: iframe attribute type (name vs id) not confirmed from source alone'`. Reviewer fallback: view page source of `https://bonigarcia.dev/selenium-webdriver-java/iframes.html` and confirm `<iframe name="my-iframe">` vs `<iframe id="my-iframe">`.

## Structural changes

- **`IFramesJupiterTest.java`** → **KEPT and RESHAPED** → `outputs/tests/iframes-jupiter.spec.ts`. Single `test.describe("iframes content loading")` wrapping one `test()`. Follows `migration-rules.md §1` kebab-case naming convention.
- **`WebDriverManager.chromedriver().create()`** → **DROPPED**. Playwright bundles browser binaries managed via `npx playwright install`. Per KB-1.3.25, no target file for binary-installer setup code.
- **`@BeforeEach void setup()` / `@AfterEach void teardown()`** → **DROPPED**. Playwright's built-in `page` fixture provides a fresh `BrowserContext` + `Page` per test and disposes them automatically. No `beforeEach` / `afterEach` needed for this trivial single-navigation case.
- **Extract POM:** No. Source logic is 28 LOC; single page; single scenario. Well below the 200 LOC threshold per `migration-rules.md §1`. Inline locators are the correct default.
- **Extract fixture:** No. Setup is a single `await page.goto(...)` — the condition for fixture extraction (≥2 test files sharing setup, nontrivial auth/mocking) is not met. Per `migration-rules.md §1`, "one-line `await page.goto('/foo')` — keep inline."
- **Split into multiple specs:** No. Single scenario; no unrelated test cases.

## Open questions for reviewer

Q1: Is "my-iframe" the `name` attribute or `id` attribute on the `<iframe>` element?
Context: Lines 55–56 — Selenium's `frameToBeAvailableAndSwitchToIt(String)` resolves a string as either the frame's `name` or `id`. In Playwright, `page.frameLocator('iframe[name="x"]')` and `page.frameLocator('#x')` are distinct selectors and only one will match.
What I assumed (if proceeding without an answer): `name` attribute, yielding `page.frameLocator('iframe[name="my-iframe"]')`.
Impact if my assumption is wrong: `frameLocator` will fail to resolve the iframe and the test will time out with a "no frame matching" error — a false positive that hides the real bug.

Q2: Is the paragraph count of 20 stable (static page content) or potentially dynamic (server-side rendering or JS injection)?
Context: Line 61 — `assertThat(paragraphs).hasSize(20)`.
What I assumed: static content on a public demo site; count is stable across runs.
Impact if my assumption is wrong: `await expect(iframeParagraphs).toHaveCount(20)` will either permanently fail (if count changed) or flake (if count varies), with no signal about the product under test.

Q3: Should `baseURL` in `playwright.config.ts` be set to `https://bonigarcia.dev`, so that `page.goto('/selenium-webdriver-java/iframes.html')` resolves correctly? Or is this corpus being migrated against a different base (e.g., a local clone of the demo site)?
Context: Lines 51–53 — absolute URL `https://bonigarcia.dev/selenium-webdriver-java/iframes.html`.
What I assumed: `baseURL` is `https://bonigarcia.dev`; Stage 2 emits the relative path.
Impact if my assumption is wrong: navigation will fail or land on an unexpected page.

Q4: Does the iframe content load synchronously with the host page or asynchronously (lazy-loaded after page ready)?
Context: Lines 59–60 — the source uses `numberOfElementsToBeMoreThan(pName, 0)` as an explicit async-load barrier before fetching all elements.
What I assumed: `await expect(iframeParagraphs).toHaveCount(20)` is sufficient — Playwright's `toHaveCount` polls from 0 to the expected count within `actionTimeout`, covering both the "already loaded" and "loads after frame switch" cases.
Impact if my assumption is wrong: if the content loads in batches beyond `actionTimeout` (default 5 s), the assertion times out; the reviewer may need to pass an explicit `{ timeout }` override on this assertion.

Q5: Should the migration extend the assertion surface to include content-based checks (e.g., `toContainText` on the first paragraph) to make the test more behaviorally meaningful, or should it preserve the original count-only scope?
Context: Line 61 — `assertThat(paragraphs).hasSize(20)` is the sole assertion; no textual content is checked.
What I assumed: preserve original assertion scope (count only) — adding new assertions is out of Stage 1 scope; reviewer may choose to expand in Stage 2.
Impact if my assumption is wrong: the test will pass even if the iframe loads garbage content, as long as exactly 20 `<p>` tags exist.

## Risk callouts

- **External URL dependency**: The test navigates to `https://bonigarcia.dev/selenium-webdriver-java/iframes.html`, a publicly hosted demonstration page maintained by the book author. If the site is unreachable or the page content changes, the test fails for reasons unrelated to the product under test. The migration preserves this dependency; the reviewer should decide whether to serve the page locally.
- **Magic number 20**: The `assertThat(paragraphs).hasSize(20)` assertion is tightly coupled to the external page's current content. A future revision adding or removing a `<p>` element breaks the test with no product regression signal. `migration-rules.md §2` identifies magic numbers as a smell, but in this case the count is the oracle itself — consider extracting `const EXPECTED_PARAGRAPH_COUNT = 20` as a named constant to at least document intent.
- **Selector quality below threshold**: Both locators in the migrated output — `iframe[name="my-iframe"]` (frameLocator selector) and `locator('p')` (tag-name selector inside frame) — fall below the role/label hierarchy. There is no viable `getByRole` or `getByLabel` alternative for either. Estimated selector quality score: 0/2 = 0.0 (well below the ≥0.7 target). This is inherent to the test's subject matter (iframe context switching + generic paragraph counting) and should be explicitly accepted by the reviewer.
- **Single narrow assertion**: The only assertion is paragraph count = 20. This is closer to a smoke check than a behavioral test — it catches "iframe didn't load" but not "wrong content inside iframe." If fuller coverage is desired, the reviewer should add content-based assertions in Stage 2.

## Expected metrics

- Selector quality score (estimated): 0.0 (0/2 locators are role/label/testid-based; inherent to iframe + generic `<p>` content — accepted by reviewer per Risk callouts)
- Smell count delta vs source: −9 (3 H + 5 M + 1 L removed; 0 new smells introduced)
- New test file LOC estimate: ~22 (migration attribution line + imports + describe block + single test + navigation + frameLocator + assertion; well below 300-LOC file limit)
- Anti-pattern coverage: 9/9 cataloged, all addressed in migration
