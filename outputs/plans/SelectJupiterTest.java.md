# Migration plan: SelectJupiterTest.java

## Source framework

**selenium-java** — JUnit 5 (`@BeforeEach` / `@AfterEach` / `@Test`), Selenium WebDriver 4.x, AssertJ 3.x, WebDriverManager 5.x. Single-file input; no BasePage, no helper classes, no POM hierarchy.

Target: Playwright TypeScript (latest stable major, v1.x 2026).

---

## Summary

This test exercises the `<select>` dropdown on the bonigarcia demo web form: it selects the option whose visible text is "Three", then asserts that the selected option's text equals "Three". The entire test body is a single scenario spanning navigation, one user interaction, and one assertion.

### What bug does this catch?

Catches a regression where the dropdown either ignores a `selectByVisibleText` call (the selection silently no-ops) or where the displayed selected value does not match what was passed in — covering both rendering and form-widget behavior in one assertion.

### User-perceivable assertion checklist

- [ ] After `selectOption({ label: 'Three' })`: the dropdown widget reflects "Three" as the currently selected value.

---

## Anti-patterns detected

| Severity | Line | KB-ID | Anti-pattern | Snippet (≤60 chars) | Replacement |
|---|---|---|---|---|---|
| H | 45 | KB-1.3.1 | Thread.sleep hard wait | `Thread.sleep(Duration.ofSeconds(3).toMillis())` | Remove entirely; the 3 s delay is pure debug artifact annotated `FIXME`. Playwright disposes context automatically after each test — no wait needed. |
| H | 52–53 | KB-UNCLASSIFIED | Hardcoded absolute URL | `driver.get("https://bonigarcia.dev/…")` | Configure `BASE_URL=https://bonigarcia.dev/selenium-webdriver-java` in `.env`; replace with `page.goto('/web-form.html')`. |
| H | 59–60 | KB-1.3.10 | Sync-probe assertion (no auto-retry) | `assertThat(select.getFirstSelectedOption…` | `await expect(dropdown).toHaveValue('<value>')` — web-first, polls until match. |
| M | 39 | KB-1.3.25 | Browser-binary installer in test code | `WebDriverManager.chromedriver().create()` | DROPPED — Playwright's `page` fixture provisions and manages the browser. No installer code in tests. |
| M | 47 | KB-1.3.12 | Manual driver teardown in `@AfterEach` | `driver.quit()` | DROPPED — Playwright creates a fresh `BrowserContext` per test and auto-disposes it. No teardown needed. |
| L | 55 | KB-UNCLASSIFIED | `By.name` attribute selector (non-semantic) | `By.name("my-select")` | `page.locator('select[name="my-select"]')` as high-confidence fallback; upgrade to `page.getByLabel(…)` if DOM confirms an associated label (see Q1). |

### Unclassified smells

**KB-UNCLASSIFIED — Hardcoded absolute URL (lines 52–53):** No dedicated `KB-1.3.x` entry exists for Java Selenium hard-coded `driver.get("https://...")`, though Python's KB-1.4.12 (`driver.get(url)` with hardcoded environment) documents the same failure class. The fix is identical: configure `BASE_URL` via `.env` / `playwright.config.ts` and use a relative path. Reviewer should confirm the intended base URL for this suite (see Q3).

**KB-UNCLASSIFIED — `By.name` attribute selector (line 55):** Selenium's `By.name` targets the `name` attribute of form controls. It has no direct `KB-1.3.x` entry (KB-1.3.3 covers CSS-class selectors; KB-1.3.2 covers positional XPath). The migration concern is that `name` attributes are HTML wire-format identifiers — they survive for form submission, not as stable UI contracts. The preferred Playwright target is `getByLabel()` (if a visible `<label>` is associated), falling back to `locator('select[name="my-select"]')` with an inline comment explaining why the label strategy was unavailable. See Q1 and the locator table.

---

## Locator translation table

| Original | New | Confidence | Notes |
|---|---|---|---|
| `By.name("my-select")` (line 55) | `page.locator('select[name="my-select"]')` | high | Mechanical CSS translation of `By.name(x)` → `[name="x"]`. Prefer `page.getByLabel(...)` if DOM confirms an associated label (Q1) — that would raise quality score from 0/1 to 1/1. |
| `select.getFirstSelectedOption().getText()` (lines 59–60) | `expect(page.locator('select[name="my-select"]')).toHaveValue('<option-value>')` | med | `toHaveValue()` targets the `value` attribute of the select, not the visible text. We do not have the option `value` from source code alone. If `value` matches visible text ("Three"), use `.toHaveValue('Three')`. If it differs, the fallback is `page.locator('select[name="my-select"] option:checked').toHaveText('Three')` (CSS pseudo-class, auto-retried via `toHaveText`). See Q2 and pin 1. |

---

## Hallucination-defense pins

1. **Dropdown selected-value assertion** — assumed `expect(page.locator('select[name="my-select"]')).toHaveValue('Three')` (value attribute equals visible text). If DOM inspection shows the option's `value` differs from its visible label: switch to `page.locator('select[name="my-select"] option:checked').toHaveText('Three')` and add WHY-comment `'Q2 unresolved: option value attribute unknown at plan time'`. Reviewer fallback: open DevTools on `https://bonigarcia.dev/selenium-webdriver-java/web-form.html`, inspect `<option>` elements, note the `value` for "Three", and update the assertion accordingly.

---

## Structural changes

This is a single-file, single-test Selenium Java source (62 LOC including copyright header; ~45 LOC active code). Per `migration-rules.md` §1, POM extraction triggers at 200 LOC — not reached here.

**Per-file fate:**

| Source file | Fate | Reason |
|---|---|---|
| `SelectJupiterTest.java` | **KEPT and RESHAPED** → `outputs/tests/select-jupiter.spec.ts` | The sole `@Test` method becomes one `test(...)` call inside a `test.describe`. |
| `@BeforeEach setup()` body (`WebDriverManager.chromedriver().create()`) | **DROPPED** | Browser provisioning is the Playwright `page` fixture's job. No target code emitted. |
| `@AfterEach teardown()` body (`Thread.sleep` + `driver.quit()`) | **DROPPED** | Both lines are anti-patterns (KB-1.3.1 + KB-1.3.12). Playwright auto-disposes the context after each test. |

**Structural decisions:**

- **Extract POM:** No — single page, test body < 200 LOC (per `migration-rules.md` §1 threshold). Inline locators.
- **Extract fixture:** No — setup collapses to a single `page.goto(...)` line inside `test.beforeEach` (or directly in the test body — see Q4). Not worth fixture abstraction for a one-liner.
- **Split file:** No — single scenario, single spec file.
- **New data files:** No — the option label "Three" is short enough to inline as a named constant inside the test body.

---

## Open questions for reviewer

```
Q1: Does the web-form page expose a visible <label> element associated with the
    my-select dropdown? If yes, what is its exact text?
Context: Line 55 uses By.name("my-select"). The highest-priority Playwright
    locator for a form control is getByLabel(). Without the label text we
    cannot use it and must fall back to the CSS attribute selector.
What I assumed (if proceeding without an answer): page.locator('select[name="my-select"]')
    (HIGH confidence fallback).
Impact if my assumption is wrong: Selector quality score stays 0/1 instead of
    reaching 1/1; the test is still correct but uses a lower-priority locator
    that would break if the name attribute is renamed.
```

```
Q2: What is the value attribute of the "Three" option in the <select>?
    E.g., <option value="three">Three</option> or <option value="3">Three</option>
    or <option value="Three">Three</option>?
Context: Lines 59–60 assert via AssertJ on visible text. Playwright's toHaveValue()
    asserts on the option's value attribute, not its visible label.
What I assumed (if proceeding without an answer): value equals visible text "Three"
    → toHaveValue('Three'). Pin 1 documents the fallback.
Impact if my assumption is wrong: The toHaveValue('Three') assertion silently passes
    even when a different option is selected, as long as that option's value happens
    to also be 'Three'. Use the CSS-pseudo fallback (option:checked + toHaveText)
    if value is uncertain.
```

```
Q3: Should the baseURL for this suite be https://bonigarcia.dev/selenium-webdriver-java
    (the public third-party demo), or is there a locally-hosted mirror for CI runs?
Context: Lines 52–53 hard-code a public third-party URL. Hardcoded URLs are
    KB-UNCLASSIFIED (parallels KB-1.4.12 for Python).
What I assumed (if proceeding without an answer): BASE_URL is set to the public
    demo origin in .env; page.goto('/web-form.html') uses a relative path.
Impact if my assumption is wrong: If CI does not have internet access, the test
    will fail with a navigation timeout on every run. A locally-served mock or a
    network-policy allowlist may be required.
```

```
Q4: The @AfterEach contained "// FIXME: pause for manual browser inspection",
    indicating this test was primarily used as an exploration harness rather than
    a committed regression gate. Should the migrated test remain in the committed
    suite, or should it be treated as a spike (deleted or moved to a scratch dir)?
Context: Line 44 FIXME comment + 3-second sleep for interactive inspection.
What I assumed (if proceeding without an answer): The test is retained; the sleep
    and FIXME are debug artifacts that the migration removes, leaving a valid
    regression test for the dropdown selection behavior.
Impact if my assumption is wrong: If deleted, the dropdown selection behavior has
    no coverage. If kept, the migrated test is thin but still provides a valid
    smoke check for the select widget.
```

```
Q5: The source method is void test() — a non-descriptive name. The proposed
    migration title is "selects option by visible text and verifies selection
    @positive @e2e". Does this accurately describe the test scenario?
Context: Line 50–51 @Test void test() — JUnit 5 method name used as scenario label.
What I assumed (if proceeding without an answer): The proposed title is used.
Impact if my assumption is wrong: Only the test label in the runner output is
    affected; test logic is unaffected.
```

---

## Risk callouts

- **Third-party SUT dependency:** The test navigates to `https://bonigarcia.dev/…`, a public demo site not under our control. Downtime, rate-limiting, or content changes will fail the test for infrastructure reasons unrelated to the product. Tag `@e2e`; consider a CI skip policy if the suite runs air-gapped.

- **Option value attribute unknown (Pin 1):** If the `<option value="...">Three</option>` value attribute does not equal the visible text "Three", the `toHaveValue('Three')` assertion will either always pass (wrong value, passes vacuously) or always fail (correct selection, wrong assertion). This is the primary correctness risk in the migration.

- **Assertion coverage gap — post-selection state not verified beyond text match:** The original test's single assertion only confirms text equality after selection. It does not verify the form's submission behavior or that the selected value is retained across a page interaction. The migration preserves this gap by design.

- **Thread.sleep removal in teardown:** The 3-second sleep was in `@AfterEach`, not `@Test`, so it did not directly affect assertion timing (it ran after `assertThat` had already resolved). Its removal is safe. However, if there were any hypothetical side-effect from the delay (e.g., a browser process needed time to close cleanly), Playwright's auto-dispose handles it correctly.

- **Select widget API mismatch:** Selenium's `Select.selectByVisibleText()` and Playwright's `selectOption({ label: '...' })` are semantically identical — both match by visible text. No behavioral drift expected. However, `selectOption({ label })` is case-sensitive by default in Playwright; if the visible text in the rendered DOM has different casing than "Three", the action will throw. The source test used the exact string "Three" stored in a variable, so this risk is low.

---

## Expected metrics

- **Selector quality score (estimated):** 0.5 provisional (0/1 with CSS fallback; 1/1 if Q1 resolves to `getByLabel`). Target ≥ 0.7 — reviewer should confirm Q1 to reach 1.0.
- **Smell count delta vs source:** −6 (−1 Thread.sleep, −1 hardcoded URL, −1 sync-probe assertion, −1 WebDriverManager installer, −1 manual driver.quit(), −1 By.name non-semantic selector); +0 new smells.
- **LOC delta:** source ~62 LOC → target ~18 LOC; delta ≈ −44.
- **Anti-pattern coverage:** 6/6 cataloged anti-patterns addressed in plan.
