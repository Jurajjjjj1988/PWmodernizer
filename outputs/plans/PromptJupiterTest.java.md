# Migration plan: PromptJupiterTest.java

## Source framework

**selenium-java** — JUnit 5 (`@Test`, `@BeforeEach`, `@AfterEach`) + Selenium WebDriver 4 (`org.openqa.selenium.*`, `WebDriverWait`, `ExpectedConditions`) + WebDriverManager 5.x (`WebDriverManager.chromedriver().create()`). No BasePage, no PageFactory, no helper classes — single self-contained test file with two `@Test` methods that exercise the same user scenario.

**Target:** Playwright TypeScript (v1.45+, latest stable).

---

## Summary

`PromptJupiterTest` navigates to a static dialog-boxes demo page and exercises a browser-native `window.prompt()` dialog triggered by a button click. It verifies that the dialog carries the expected prompt message ("Please enter your name"), types a name into the dialog, and accepts it. The test exists in two near-identical forms (`testPrompt`, `testPrompt2`) that differ only in which Selenium API variant is used to obtain the `Alert` object — a distinction that disappears entirely in Playwright's event-handler model.

### What bug does this catch?

Catches a regression where the prompt button on the dialog-boxes page either fails to fire a browser `window.prompt()` dialog at all, or fires a dialog whose message text has changed from the expected "Please enter your name".

### User-perceivable assertion checklist

- [ ] After clicking the prompt button (`#my-prompt`): browser prompt dialog is present
- [ ] While prompt is open: dialog message text equals `"Please enter your name"`
- [ ] After typing `"John Doe"` and accepting: *(no post-dialog DOM assertion exists in the source — see Open Question Q3)*

> **Note:** `testPrompt` (lines 56–68) and `testPrompt2` (lines 70–81) produce the same three checklist items. The second test is a behavioral duplicate of the first; the only difference is a Selenium API detail that vanishes in Playwright. See Open Question Q1 for consolidation guidance.

---

## Anti-patterns detected

| Severity | Line | KB-ID | Anti-pattern | Snippet (≤60 chars) | Replacement |
|---|---|---|---|---|---|
| H | 51 | KB-1.3.1 | Thread.sleep hard wait | `Thread.sleep(Duration.ofSeconds(3).toMillis())` | Remove entirely; Playwright fixture tears down the browser automatically |
| H | 58, 73 | KB-1.1.14 | Hardcoded absolute URL | `driver.get("https://bonigarcia.dev/…")` | Configure `baseURL` in `playwright.config.ts`; use `page.goto('/selenium-webdriver-java/dialog-boxes.html')` |
| H | 63, 78 | KB-1.3.18 | Alert switch without race protection | `wait.until(alertIsPresent()); driver.switchTo().alert()` | Register `page.once('dialog', async (dialog) => { … })` BEFORE the click |
| M | 44–46 | KB-1.3.12 | Manual driver setup/teardown | `WebDriverManager.chromedriver().create()` / `driver.quit()` | Drop; Playwright `page` fixture provides a fresh browser context per test and disposes it automatically |
| M | 60, 75 | KB-1.3.4 | WebDriverWait boilerplate per element | `new WebDriverWait(driver, Duration.ofSeconds(5))` | Drop; Playwright actions auto-wait; dialog handler fires on the dialog event without explicit wait construction |
| M | 63, 78 | KB-1.3.15 | ExpectedConditions ceremony | `wait.until(ExpectedConditions.alertIsPresent())` | `page.once('dialog', …)` pre-registered handler replaces the entire EC predicate |
| L | 50 | KB-UNCLASSIFIED | FIXME debug comment paired with hard wait | `// FIXME: pause for manual browser inspection` | Delete; debug holdover — Playwright config `screenshot: 'only-on-failure'` + `trace: 'retain-on-failure'` covers post-failure inspection |
| L | 65, 80 | KB-1.1.9 | Magic string — prompt input text | `prompt.sendKeys("John Doe")` | Extract to named constant `PROMPT_INPUT_TEXT` |
| L | 66, 81 | KB-1.1.9 | Magic string — expected dialog message | `isEqualTo("Please enter your name")` | Extract to named constant `EXPECTED_PROMPT_MESSAGE` |

### Unclassified smells

**Behaviorally duplicate `@Test` methods** (no KB entry): `testPrompt` (lines 56–68) and `testPrompt2` (lines 70–81) test the same user-perceivable scenario. The only difference is which Selenium idiom retrieves the `Alert` — two-step (`wait.until()` then `switchTo().alert()`) vs one-step (`wait.until(alertIsPresent())` returning `Alert` directly). In Playwright's `page.once('dialog', …)` model this distinction does not exist: both translate to identical code. Having two test methods for one scenario inflates the suite with a redundant test. Reviewer should confirm whether both should be preserved as-is or consolidated (see Q1). No KB entry; raising here to ensure the reviewer makes an explicit decision.

**Missing post-dialog DOM assertion** (no KB entry): After `prompt.accept()`, neither test asserts any change on the page. Tests that end with an action and no observable-outcome check (per `migration-rules.md` §2: "Every test ends with at least one assertion on a user-perceivable thing") will silently pass on a broken post-dialog page update. Stage 2 should attempt a reasonable post-dialog assertion; reviewer must verify correctness (see Q3).

---

## Locator translation table

| Source line | Original | Element role/purpose | Proposed target | Confidence | Evidence |
|---|---|---|---|---|---|
| 62, 77 | `driver.findElement(By.id("my-prompt"))` | Button that triggers the browser `window.prompt()` dialog | `page.locator('#my-prompt')` | high | `By.id` maps mechanically to CSS `#id` per KB §6 hallucination-defense pin rule 1; the ID `my-prompt` is not a framework-generated or testid-convention value |
| 62, 77 | `driver.findElement(By.id("my-prompt"))` *(role-based upgrade — alternative)* | Same button, expressed via accessible name | `page.getByRole('button', { name: /prompt/i })` | med | Button role inferred from test context (click triggers a dialog); accessible name `/prompt/i` inferred from the element ID value — not DOM-confirmed; reviewer must inspect the page to verify |

The dialog interaction (`switchTo().alert()`, `prompt.getText()`, `prompt.sendKeys()`, `prompt.accept()`) uses no DOM locators in Playwright — it is handled entirely via the `dialog` event object (`dialog.message()`, `dialog.accept(text)`). No further locator translation rows are needed.

---

## Hallucination-defense pins

1. **Prompt button accessible name** — assumed `getByRole('button', { name: /prompt/i })`. If DOM contradicts (button has a different accessible name, or the element is not a `<button>` tag): keep `page.locator('#my-prompt')`, add WHY-comment `'Q2 unresolved: prompt button role/name not DOM-confirmed'`. Reviewer fallback: open `https://bonigarcia.dev/selenium-webdriver-java/dialog-boxes.html` in a browser, inspect the button's accessible name (DevTools → Accessibility tree or `document.getElementById('my-prompt').accessibleName`), then either update the locator or ask the page owner to add a `data-testid` attribute.

---

## Structural changes

### Per-file fate

| Source file | Fate | Rationale |
|---|---|---|
| `PromptJupiterTest.java` | **KEPT and RESHAPED** → `outputs/tests/prompt-jupiter.spec.ts` | Contains both `@Test` methods; reshapen to `test.describe` + two `test()` calls |
| `@BeforeEach setup()` (lines 43–46) | **DROPPED** | `WebDriverManager.chromedriver().create()` is the Selenium driver factory; Playwright's `page` fixture provides an isolated browser context per test automatically — no equivalent setup code needed |
| `@AfterEach teardown()` (lines 48–54) | **DROPPED** | `driver.quit()` maps to Playwright fixture auto-teardown; the `Thread.sleep(3)` debug holdover is removed entirely |

### Structural decisions

- **Extract POM:** No. Single page, one interactive element, ~30 LOC effective test code. The 200-LOC extraction threshold in `migration-rules.md` §1 is not approached. Inline locators.
- **Extract fixture:** No. Setup is a single `await page.goto(…)`. The fixture extraction threshold (≥2 spec files sharing setup) is not met.
- **Split spec:** No. Both `@Test` methods operate on the same page and feature. One `test.describe` block in `prompt-jupiter.spec.ts` is correct; if the reviewer consolidates (Q1), the result is a single `test()` block.
- **File naming:** `prompt-jupiter.spec.ts` — kebab-case of `PromptJupiterTest` per `migration-rules.md` §1 file naming convention.
- **Import style:** `import { test, expect } from "@playwright/test"` (simple form, no POM/fixture extraction; per `migration-rules.md` §2 relaxed 2026-06-03 import policy for small subtractive-like specs with ≤2 tests and no POM).

---

## Open questions for reviewer

```
Q1: Should testPrompt and testPrompt2 be consolidated into one test?
Context: Both @Test methods produce identical Playwright code. The Selenium API distinction
         (two-step switchTo vs one-step wait.until returning Alert) disappears entirely in
         page.once('dialog', ...). Retaining both generates two redundant test() blocks.
What I assumed (if proceeding without answer): Plan includes two scenarios (1.1 and 1.2).
         Stage 2 generates two test() blocks with identical bodies. Reviewer may then delete
         scenario 1.2 and the corresponding test() block.
Impact if assumption is wrong: If reviewer expects only one test, the generated spec will have
         a redundant test that must be manually removed.
```

```
Q2: What is the accessible name of the button with id="my-prompt"?
Context: By.id("my-prompt") maps to page.locator('#my-prompt') at HIGH confidence. A
         role-based upgrade to getByRole('button', { name: /prompt/i }) is proposed at MED
         confidence, with the accessible name inferred from the element ID — not DOM-confirmed.
What I assumed (if proceeding without answer): Stage 2 uses page.locator('#my-prompt') (HIGH
         confidence) and adds a WHY-comment noting that a role-based upgrade is available
         pending reviewer DOM inspection. See hallucination-defense pin 1.
Impact if assumption is wrong: If the button's accessible name is not derivable from "prompt"
         (e.g., it is "Open prompt dialog" or uses aria-label), the MED alternative locator
         would fail silently or not resolve. The HIGH fallback (locator('#my-prompt')) would
         still work but would miss the quality target of ≥0.7 selector score.
```

```
Q3: Does anything appear on the page after prompt.accept() that can be asserted?
Context: The source test ends with prompt.accept() and makes no subsequent DOM assertion.
         Per migration-rules.md §2, every test must end with an observable-outcome assertion.
         The bonigarcia.dev dialog-boxes demo typically renders the entered name on the page
         after accepting a prompt (e.g., "Hello, John Doe" or similar) — but this is inferred,
         not confirmed from the source.
What I assumed (if proceeding without answer): Stage 2 should add a best-effort post-dialog
         assertion based on common demo-page behavior (e.g.,
         await expect(page.getByText('John Doe')).toBeVisible()). The comment
         in the generated code should note this is inferred and request reviewer verification.
Impact if assumption is wrong: If no post-dialog DOM change occurs (or the change is not
         "John Doe" appearing in text), Stage 2's inferred assertion will fail. The reviewer
         must supply the correct post-dialog observable or delete the assertion and accept
         a weaker test.
```

```
Q4: Is there a local/staging equivalent of the live external URL?
Context: Source uses https://bonigarcia.dev/selenium-webdriver-java/dialog-boxes.html — a
         live public demo page outside the team's control. CI against it depends on external
         network and the third-party site's availability.
What I assumed (if proceeding without answer): The URL is placed in config as
         baseURL: process.env.BASE_URL ?? 'https://bonigarcia.dev' and the test uses relative
         path '/selenium-webdriver-java/dialog-boxes.html'. This preserves the behavior while
         allowing environment override via BASE_URL.
Impact if assumption is wrong: If the team runs these tests against an internal SUT (not the
         bonigarcia.dev demo), the path may differ. If there is no local equivalent, CI is
         at risk from external network flakes.
```

```
Q5: Should the expected prompt message "Please enter your name" use exact match or regex?
Context: The source uses exact equality (assertThat(...).isEqualTo("Please enter your name")).
         If this is a third-party demo page, the text is stable. If migrating to a
         company-internal page, copy might be localized or change over time.
What I assumed (if proceeding without answer): Exact match via named constant
         EXPECTED_PROMPT_MESSAGE = "Please enter your name". If the reviewer prefers a
         regex for resilience (e.g., /please enter your name/i), the constant value should
         be a RegExp instead.
Impact if assumption is wrong: Copy change on the page (e.g., "Please type your name")
         will break the exact match but would be caught — which may be the correct behavior
         for a demo-page regression. If it should NOT catch copy changes, use regex.
```

```
Q6: Is the prompt input value "John Doe" semantically significant?
Context: prompt.sendKeys("John Doe") sends a fixed name. If the page renders the entered
         name somewhere (see Q3), the value "John Doe" may need to appear in the post-dialog
         assertion.
What I assumed (if proceeding without answer): Extracted to named constant
         PROMPT_INPUT_TEXT = "John Doe". Not sourced from an env var since it is not a
         credential; it is test-persona data.
Impact if assumption is wrong: If the entered name must match an existing user record or has
         specific downstream significance, it should come from a fixture or env var instead
         of a named constant.
```

```
Q7: Was Thread.sleep(3) in teardown protecting against any real race?
Context: The FIXME comment says "pause for manual browser inspection", suggesting the sleep
         was purely a debug holdover with no production intent.
What I assumed (if proceeding without answer): Pure debug artifact; remove without
         replacement. Playwright config's screenshot: 'only-on-failure' and
         trace: 'retain-on-failure' handle post-failure artifact capture.
Impact if assumption is wrong: If there is an implicit race in the original test runner (e.g.,
         a file written to disk that the test suite reads after teardown), removing the sleep
         may surface it. The risk is low given the explicit FIXME annotation.
```

---

## Risk callouts

- **Dialog handler registration order (critical):** `page.once('dialog', …)` MUST be registered BEFORE `await page.locator('#my-prompt').click()`. If the handler is registered after the click, Playwright's default dialog-handling behavior dismisses the dialog immediately and the handler never fires. Stage 2 must emit the `page.once(…)` line before the `click()` line. This is the most likely flake source if the order is reversed.
- **Dialog type assumption:** The test assumes `window.prompt()` (a native browser prompt). Playwright's `page.on('dialog', …)` fires only for native browser dialogs (`alert`, `confirm`, `prompt`, `beforeunload`). If the page has been updated to use a custom JavaScript modal (e.g., a `<dialog>` element or CSS overlay), the `page.once` handler will NOT fire and the click will hang until the action timeout. The source test verifies native dialog via `switchTo().alert()`, so this is low risk for the current page version but may silently break if the SUT changes.
- **External SUT availability:** The target URL is hosted at `bonigarcia.dev`. CI runs will fail if the domain is unreachable or the page structure changes — not a product bug but an infrastructure flake. Mitigate with `BASE_URL` env var override (Q4) and consider network-retry policy at the CI level.
- **Missing post-dialog assertion (test oracle gap):** The migrated test only asserts the dialog message text before acceptance. A broken post-dialog page update (the page fails to show the typed name) will not be caught. This is a pre-existing weakness in the source test that the migration carries forward unless the reviewer adds an assertion per Q3.
- **Duplicate tests and parallel workers:** With two identical tests mapped to one Playwright spec, `fullyParallel: true` (default per `migration-rules.md` §6) will run them concurrently. Since each Playwright test gets an isolated `BrowserContext`, there is no cross-test state contamination. The only risk is redundant CI time.

---

## Expected metrics

- **Selector quality score (estimated):** 0.0 following HIGH-confidence path (`page.locator('#my-prompt')` = CSS/id, counts as 0/1). Upgrades to 1.0 (1/1) if reviewer confirms the MED role-based alternative in Q2 and Stage 2 uses `getByRole('button', { name: /prompt/i })`. Target ≥0.7 is achievable if the role-based upgrade is confirmed.
- **Smell count delta vs source:** −9 (9 classified anti-patterns removed: Thread.sleep ×1, hardcoded URL ×2 occurrences, alert race ×2, WebDriverWait ×2, ExpectedConditions ×2, manual teardown ×1, FIXME ×1, magic strings ×4 occurrences = 9 distinct categories → +0 new smells)
- **LOC delta:** Source 83 LOC → estimated target ~35 LOC = **−48**
- **Anti-pattern coverage:** 9/9 classified anti-patterns addressed; 2 unclassified smells flagged for reviewer action (duplicate tests, missing post-dialog assertion)
