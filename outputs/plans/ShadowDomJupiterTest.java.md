# Migration plan: ShadowDomJupiterTest.java

## Source framework

selenium-java — JUnit 5 with `WebDriverManager` driver provisioning. Single test class
(`ShadowDomJupiterTest`), single `@Test` method (`testShadowDom`), no Page Object Model or
helper files. Target: Playwright TypeScript (latest stable, v1.45+).

## Summary

The test exercises shadow DOM traversal: it navigates to a public demo page that renders a
host element (`#content`) with an attached shadow root, then asserts that a `<p>` paragraph
inside that shadow root contains the greeting string `"Hello Shadow DOM"`. The migration
preserves this single scenario verbatim while removing Selenium lifecycle boilerplate and
promoting the assertion to a web-first, auto-retrying form. The key translation point is
that Playwright's CSS selector engine auto-pierces open shadow DOM boundaries — the explicit
`getShadowRoot()` call is dropped entirely.

### What bug does this catch?

Catches a regression where a shadow-DOM-hosted paragraph (e.g., a web component's internal
text node) fails to render or displays incorrect content.

### User-perceivable assertion checklist

- [ ] After navigating to the shadow DOM demo page: the paragraph inside the `#content`
  shadow root is visible and contains the text `"Hello Shadow DOM"`

## Anti-patterns detected

| Severity | Line | KB-ID | Anti-pattern | Snippet (≤60 chars) | Replacement |
|---|---|---|---|---|---|
| H | 47–48 | KB-1.4.12 | hardcoded-url | `driver.get("https://bonigarcia.dev/…")` | configure `baseURL` in `playwright.config.ts`, use relative path |
| M | 35–38 | KB-UNCLASSIFIED | driver-provisioning-in-test | `WebDriverManager.chromedriver().create()` | drop; Playwright manages browsers via `npx playwright install` |
| M | 40–43 | KB-1.3.12 | manual-teardown | `@AfterEach void teardown() { driver.quit(); }` | drop; Playwright fixture auto-disposes context per test |
| M | 51 | KB-UNCLASSIFIED | shadow-root-explicit-access | `content.getShadowRoot()` | drop; Playwright CSS engine auto-pierces open shadow DOM |
| M | 52 | KB-1.3.3 | css-selector-as-primary | `shadowRoot.findElement(By.cssSelector("p"))` | chain `.locator('p')` on `#content` locator — shadow boundary auto-pierced |
| L | 53 | KB-1.1.19 | sync-text-snapshot | `assertThat(textElement.getText()).contains(…)` | `await expect(locator).toContainText('Hello Shadow DOM')` |

### Unclassified smells

**KB-UNCLASSIFIED-A — `WebDriverManager.chromedriver().create()` in `@BeforeEach`**:
Java equivalent of Python's `webdriver-manager` auto-installer (KB-1.4.20 covers the Python
version). Reaches out to an external CDN on every test run — flaky if the CDN is unavailable.
In the Playwright world, `npx playwright install chromium` (run once at provisioning time)
replaces this pattern entirely. Reviewer should confirm whether a KB-1.3.X entry should be
added for the Java driver-provisioning anti-pattern.

**KB-UNCLASSIFIED-B — `SearchContext.getShadowRoot()` explicit shadow root access**:
Selenium requires calling `element.getShadowRoot()` to obtain a `SearchContext` for querying
inside a shadow DOM. Playwright's CSS locator engine auto-pierces open shadow DOM boundaries
by default — `page.locator('#content').locator('p')` traverses the shadow root without any
explicit switch. Mechanism translation is HIGH confidence; confidence in the resulting locator
(whether `p` is unique) is MED. See Q1 and Q2 for the open/closed mode risk.

## Locator translation table

| Source line | Source locator | Element role/purpose | Proposed target locator | Confidence | Evidence |
|---|---|---|---|---|---|
| 50 | `By.id("content")` | Shadow DOM host container | `page.locator('#content')` | high | Mechanical `By.id("x")` → `locator('#x')` per KB-6 Rule 1; no aria evidence to promote to role-based |
| 51 | `content.getShadowRoot()` | Shadow root access point | N/A — dropped | high | Playwright CSS engine auto-pierces open shadow DOM; no explicit target equivalent needed |
| 52 | `By.cssSelector("p")` on `shadowRoot` | Paragraph inside shadow root | `page.locator('#content').locator('p')` | med | CSS tag `p`; Playwright auto-pierces shadow boundary; single `<p>` assumed but unverified without live DOM inspection — see Q1 |
| 53 | `textElement.getText()` (assertion source) | Paragraph text content | `await expect(page.locator('#content').locator('p')).toContainText('Hello Shadow DOM')` | med | Text string is known from source; `p` selector could match multiple elements if shadow root has more content — see pin 1 |

## Hallucination-defense pins

1. **Shadow DOM paragraph `<p>`** — assumed `page.locator('#content').locator('p')`. If DOM
   contradicts (multiple `<p>` elements inside shadow root): keep
   `page.locator('#content').locator('p').first()`, add WHY-comment
   `'Q1 unresolved: multiple <p> in shadow root — .first() index is fragile'`. Reviewer
   fallback: inspect the live page and replace with
   `page.locator('#content').getByText('Hello Shadow DOM')` if text is unique, which elevates
   the locator to tier-3 quality.

2. **Assertion text match** — assumed `toContainText('Hello Shadow DOM')` (substring match,
   mirroring AssertJ's `.contains()`). If source intends exact full-text match: use
   `toHaveText(/^Hello Shadow DOM$/)` instead. Reviewer fallback: verify paragraph has no
   surrounding text nodes (whitespace, punctuation) that would break an exact match.

## Structural changes

- **Extract POM:** no — single test, single page, estimated ≈12 LOC output. Well below the
  200-LOC threshold in `migration-rules.md` §1.
- **Extract fixture:** no — setup is trivial (`page.goto(url)` only); built-in `{ page }`
  fixture is sufficient. No nontrivial login, seeded data, or feature flags.
- **Split into multiple specs:** no — single test case, single concern.
- **`@BeforeEach` (driver init):** DROPPED — replaced by Playwright's built-in `{ page }`
  fixture which provides a fresh `BrowserContext` per test automatically.
- **`@AfterEach` (driver.quit):** DROPPED — Playwright auto-disposes `BrowserContext` after
  each test; manual teardown is unnecessary and risks double-close errors (KB-1.3.12).
- **Per-file fate:** `ShadowDomJupiterTest.java` → KEPT and RESHAPED into
  `outputs/tests/shadow-dom-jupiter.spec.ts`.

## Open questions for reviewer

Q1: What is the exact DOM structure inside `#content`'s shadow root?
- Context: Line 52 uses `By.cssSelector("p")` targeting all `<p>` elements within the shadow
  root.
- What I assumed: exactly one `<p>` element exists inside the shadow root.
- Impact if wrong: `page.locator('#content').locator('p')` throws a "strict mode violation"
  at runtime if multiple `<p>` elements exist, or times out if shadow DOM nesting is
  deeper than expected.

Q2: Is the shadow root on `#content` "open" or "closed" mode?
- Context: Playwright's CSS engine auto-pierces **open** shadow roots but NOT closed ones.
  Selenium's `getShadowRoot()` works on both. The source test's use of `getShadowRoot()`
  does not distinguish mode.
- What I assumed: the shadow root is "open" mode (standard for public demo pages).
- Impact if wrong: the locator chain `page.locator('#content').locator('p')` silently
  returns 0 elements on a closed-mode shadow root; the assertion then times out. Fallback:
  `await page.locator('#content').evaluate(el => el.shadowRoot?.querySelector('p')?.textContent)`
  but that is a sync probe, not web-first — reviewer must decide.

Q3: Should the URL be extracted as `baseURL` + relative path, or is it always external?
- Context: KB-1.4.12 flags hardcoded full URLs; convention is `baseURL` in
  `playwright.config.ts` + relative `page.goto(path)`.
- What I assumed: `baseURL = "https://bonigarcia.dev"` configured in `playwright.config.ts`;
  test navigates to `"/selenium-webdriver-java/shadow-dom.html"`.
- Impact if wrong: if the team runs against a local replica, the hardcoded domain breaks
  local runs. If the demo site goes down, CI fails with a navigation error rather than
  a meaningful assertion failure.

Q4: Can `page.getByText('Hello Shadow DOM')` replace the chained `#content p` locator?
- Context: `getByText` is tier-3 quality vs. tier-5 CSS. Playwright's `getByText` also
  auto-pierces shadow DOM, so it would work if the text is unique on the page.
- What I assumed: using the chained CSS approach is safer without live DOM verification.
- Impact if wrong: if "Hello Shadow DOM" appears in multiple places (light DOM and shadow
  DOM both), `getByText` throws in strict mode or targets the wrong element.

Q5: What is the semantic role/element type of `#content`?
- Context: Line 50 uses `By.id("content")` — element type unknown without DOM inspection;
  could be `<div>`, `<section>`, a custom element, or `<span>`.
- What I assumed: non-semantic container; preserved as `locator('#content')` per KB-6
  hallucination-defense Rule 1 (never promote `By.id` to `getByRole` without aria evidence).
- Impact if wrong: if it's `<section aria-label="Shadow content">` or similar, a role-based
  locator would be more stable than the id.

Q6: Should the test assert that the shadow root EXISTS, not just that its content matches?
- Context: the source test only asserts text content — it does not explicitly verify that
  `#content` has an attached shadow root.
- What I assumed: the `toContainText` assertion implicitly covers this (a missing element
  causes a timeout, which is a test failure).
- Impact if wrong: if the product requirement is to test shadow DOM attachment separately
  (e.g., that the shadow root is non-null), an additional assertion should be added.

Q7: Is the `"Hello Shadow DOM"` text expected to be static, or could it be
  internationalised/configurable?
- Context: the source uses a hardcoded exact string literal.
- What I assumed: the string is static and stable for this demo page.
- Impact if wrong: if the text can vary, the assertion should use a regex pattern
  (`/hello shadow dom/i`) rather than a literal string.

## Risk callouts

- **Shadow DOM open/closed mode**: Playwright auto-pierces open shadow roots. If the target
  application ever uses closed-mode shadow roots (a legitimate security/encapsulation choice),
  the locator chain silently times out. The Selenium source used `getShadowRoot()` which
  handles both — flag for verification.

- **External URL dependency**: The test navigates to `https://bonigarcia.dev` — a public
  demo site maintained by the book author. If the domain goes down, changes structure, or
  adds network throttling, CI fails for infra reasons unrelated to the SUT. Consider whether
  a local HTML fixture or a Playwright `page.route` stub is acceptable for isolation.

- **Single assertion / low oracle strength**: The test has one assertion (text content of one
  paragraph). It does not verify shadow DOM attachment, element visibility independently,
  absence of console errors, or URL correctness. Migration preserves this oracle strength
  exactly — stronger coverage must be added intentionally (see Q6).

- **No negative-path test**: Source covers only the happy path. No test for shadow DOM
  rendering failure, network error on navigation, or wrong text content.

- **Cross-browser shadow DOM**: Open shadow DOM is well-supported across Chromium, Firefox,
  and WebKit, but subtle edge cases exist in older WebKit. Playwright's CSS engine piercing
  is tested across all three — flag for CI cross-browser coverage confirmation.

## Expected metrics

- Selector quality score (estimated): 0.5 (0/2 CSS-based locators in the chained form; would
  be 1/1 if reviewer approves `getByText('Hello Shadow DOM')` per Q4)
- Smell count delta vs source: −5 (hardcoded URL, WebDriverManager driver provisioning,
  manual teardown, explicit shadow root access, sync text assertion)
- LOC delta: ~40 source LOC (including license header + package/imports) → ~12 target LOC
- Anti-pattern coverage: 6/6 cataloged (4 classified + 2 unclassified flagged for KB expansion)
