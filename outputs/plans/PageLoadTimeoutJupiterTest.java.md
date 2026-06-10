# Migration plan: PageLoadTimeoutJupiterTest.java

## Source framework

Selenium Java — JUnit Jupiter 5, with `io.github.bonigarcia.wdm.WebDriverManager` for browser-binary management. Single file, no companion POM or helper classes. From the bonigarcia *Hands-On Selenium WebDriver with Java* book, chapter 4 (timeouts). Target: Playwright TypeScript (latest stable, v1.50+).

## Summary

This test sets an unrealistically small page-load timeout (1 ms) on the WebDriver session and then navigates to a real external URL, asserting that a `TimeoutException` is thrown. It is a **framework capability demonstration** — showing that Selenium honours the `pageLoadTimeout` setting — rather than a test of application behaviour under the SUT. The Playwright equivalent passes `{ timeout: 1 }` to `page.goto()` and asserts the returned Promise rejects with a `TimeoutError`, confirming Playwright's per-call timeout enforcement. No DOM elements are selected; the locator table is empty.

### What bug does this catch?

Catches a regression where `page.goto()` silently ignores the `timeout` option and completes successfully instead of throwing when the navigation limit is exceeded — verifying that Playwright's per-call navigation timeout mechanism is operative.

### User-perceivable assertion checklist

- [ ] After `page.goto(url, { timeout: PAGE_LOAD_TIMEOUT_TRIGGER_MS })`: the navigation Promise rejects with an error whose message matches `/timeout/i`

## Anti-patterns detected

| Severity | Line | KB-ID | Anti-pattern | Snippet (≤60 chars) | Replacement |
|---|---|---|---|---|---|
| H | 37 | KB-1.3.25 | binary-installer-in-test | `WebDriverManager.chromedriver().create()` | Drop entirely — Playwright bundles browsers; `npx playwright install` is the one-time provisioning step |
| H | 40–42 | KB-1.3.12 | manual-driver-teardown | `@AfterEach void teardown() { driver.quit(); }` | Drop entirely — Playwright `page` fixture auto-disposes the browser context per test |
| M | 47 | KB-UNCLASSIFIED | driver-level-timeout-mutation (Java) | `driver.manage().timeouts().pageLoadTimeout(…)` | Use per-call option: `page.goto(url, { timeout: PAGE_LOAD_TIMEOUT_TRIGGER_MS })` — see Unclassified smells |
| M | 48–50 | KB-1.1.14 | hardcoded-url | `driver.get("https://bonigarcia.dev/…")` | Move to env var `BONIGARCIA_SUT_URL`; see Q1 for alternatives |
| L | 47 | KB-1.1.9 | magic-number | `Duration.ofMillis(1)` | Extract to `const PAGE_LOAD_TIMEOUT_TRIGGER_MS = 1` |

### Unclassified smells

**Java `driver.manage().timeouts().pageLoadTimeout()` driver-level mutation** — Mutates a global driver property affecting every subsequent `driver.get()` call in the session. This is the Java sibling of KB-1.4.22 (Python `driver.set_page_load_timeout(N)`); the rationale is identical (`GlobalTimeoutMutationLeak`) but no KB-1.3.x entry covers it. Reviewer: consider adding `KB-1.3.26` to the knowledge base to close the gap.

**AssertJ `assertThatThrownBy(...).isInstanceOf(TimeoutException.class)`** — A JVM exception-assertion idiom with no direct KB entry. The canonical Playwright form is `await expect(promise).rejects.toThrow(...)` per migration-rules §8 ("try/catch wrapping a Playwright action"). No KB ID; not a smell to suppress, but needs explicit translation.

## Locator translation table

No DOM locators are present in this test. `driver.get(url)` is a navigation call, not an element selector. The table is empty.

| Original | New | Confidence | Notes |
|---|---|---|---|
| *(none)* | *(none)* | — | No `driver.findElement` / `By.*` calls in source |

## Hallucination-defense pins

N/A — locator table is empty; this test performs no DOM element selection. No MED/LOW locator rows exist.

## Structural changes

**Per-file fate:**

| Source artefact | Fate | Reason |
|---|---|---|
| `PageLoadTimeoutJupiterTest.java` | **KEPT and RESHAPED** → `outputs/tests/page-load-timeout.spec.ts` | Single test method; reshaping is mechanical |
| `WebDriverManager.chromedriver().create()` (import + call) | **DROPPED** | Playwright bundles browsers; no installer code needed in test code (KB-1.3.25) |
| `@BeforeEach setup()` / `@AfterEach teardown()` lifecycle | **DROPPED** | Playwright `page` fixture creates a fresh `BrowserContext` per test and disposes it automatically (KB-1.3.12) |

- **Extract POM:** No — zero DOM interactions, 0 locators, ~20 target LOC. Far below the 200-LOC trigger (migration-rules §1).
- **Extract fixture:** No — the only "setup" is the Playwright `page` fixture, provided for free by the framework.
- **Split into multiple specs:** No — single `@Test` method → single `test()` block.
- **Inline everything:** Yes — `import { test, expect } from "@playwright/test"` is appropriate (no POM/fixture extraction; ≤2 tests; migration-rules §2 relaxed import policy applies).

## Open questions for reviewer

```
Q1: URL configuration — the source navigates to https://bonigarcia.dev/selenium-webdriver-java/
    (an external public SUT). Since this is a timeout demonstration, the URL is almost
    irrelevant — any URL that doesn't respond in 1ms triggers the timeout. Three options:
    a. Env var: const BASE_URL = process.env.BONIGARCIA_SUT_URL ?? 'https://bonigarcia.dev/…'
    b. Hermetic stall handler: page.route('**/*', () => { /* never fulfill */ }) so CI
       works without internet, then navigate to any URL
    c. Keep hardcoded with a WHY-comment noting this is an educational demo
    Context: source lines 48–50.
    What I assumed (if proceeding without an answer): option (a) with env-var fallback.
    Impact if my assumption is wrong: on CI runners without internet, DNS failure produces
    a different error than TimeoutError; .rejects.toThrow(/timeout/i) would then fail on
    the wrong error type, not because the test logic is wrong.
```

```
Q2: Exception specificity — the source asserts .isInstanceOf(TimeoutException.class).
    Playwright throws playwright.errors.TimeoutError whose message contains "Timeout".
    Options:
    a. await expect(page.goto(…)).rejects.toThrow(/timeout/i)  — message substring
    b. await expect(page.goto(…)).rejects.toThrow()            — any error (weaker)
    Context: source lines 49–51.
    What I assumed: option (a) — message-level specificity prevents DNS/network errors
    from producing a false-positive pass.
    Impact if my assumption is wrong: on a restricted network, error message may not
    contain "timeout", causing an unnecessary failure.
```

```
Q3: Test purpose — migrate or delete?
    This test demonstrates a Selenium/Playwright API feature (timeout enforcement), not
    application behaviour. After migration it becomes a test that Playwright's own
    timeout option works — effectively testing Playwright itself.
    Options:
    a. Migrate as a Playwright capability test (documents expected framework behaviour)
    b. Delete — framework behaviour is guaranteed by Playwright's own CI, not ours
    c. Convert to an application-level test (e.g. graceful handling of a genuinely slow
       navigation in the target application)
    Context: overall test intent — bonigarcia chapter 4 is a tutorial, not an app spec.
    What I assumed: option (a) — migrate as-is; reviewer decides keep vs. delete.
    Impact if my assumption is wrong: if deleted, no spec file is produced; Stage 2
    should be informed before code generation begins.
```

```
Q4: Deterministic timeout triggering — with { timeout: 1 }, the test relies on no page
    loading in 1ms over the real network. This is virtually guaranteed, but on a
    loopback-only CI runner the error mode could differ (connection refused vs. timeout).
    Should Stage 2 use a page.route() stall handler to guarantee a TimeoutError
    independent of network topology?
    Context: source line 47 (Duration.ofMillis(1)).
    What I assumed: no stall handler — 1ms is so small that even localhost connections
    won't respond in time; the test stays simple.
    Impact if my assumption is wrong: extremely unlikely to matter; noted for completeness.
```

```
Q5: Named constant for the timeout value — should `1` be extracted to
    PAGE_LOAD_TIMEOUT_TRIGGER_MS = 1 (KB-1.1.9), or is `1` "obvious in context"
    (the exception clause in KB-1.1.9: "other than 0 and 1 in obvious contexts")?
    Context: source line 47.
    What I assumed: extract the constant; a reviewer reading `page.goto(url, { timeout: 1 })`
    cold may not realise 1 is intentionally absurd rather than a copy-paste from a
    real timeout value.
    Impact if my assumption is wrong: purely stylistic.
```

## Risk callouts

- **Network dependency**: The test navigates to `https://bonigarcia.dev/selenium-webdriver-java/`. On CI runners with no outbound internet, DNS or TCP failure fires before Playwright's 1ms timeout expires, producing a `net::ERR_NAME_NOT_RESOLVED` or similar — NOT a `TimeoutError` — causing the `.rejects.toThrow(/timeout/i)` assertion to fail on a non-existent bug. Mitigate with the stall-handler approach (see Q4) or by gating the test behind `BONIGARCIA_SUT_URL` being set.
- **Framework capability test drift**: This test exercises Playwright's `timeout` option, not application logic. If Playwright ever changes the wording of its timeout error message, the `/timeout/i` regex assertion breaks. Consider importing `playwright.errors.TimeoutError` for a type-stable instanceof check.
- **Anti-test smell — near-tautological assertion**: A 1ms page-load timeout will always expire on any real network. The test effectively asserts "Playwright's timeout mechanism exists", which is guaranteed by the framework itself. It will never catch an application regression. Reviewer should confirm whether this belongs in the suite at all (see Q3).
- **No user-perceivable DOM outcome**: Every other migration produces at least one `expect(locator)` web-first assertion. This test's only assertion is `rejects.toThrow()` — it verifies a thrown error, not a visible UI state. The test is structurally correct but must carry a note explaining the exception.

## Expected metrics

- Selector quality score (estimated): N/A — 0 locators total (0/0); no DOM element selection
- Smell count delta vs source: −5 (−1 binary installer, −1 manual teardown, −1 driver-level timeout mutation, −1 hardcoded URL, −1 magic number)
- New test file LOC estimate: ~20 (source ~25 LOC; `@BeforeEach`/`@AfterEach` blocks dropped)
- Anti-pattern coverage: 5/5 identified smells addressed
