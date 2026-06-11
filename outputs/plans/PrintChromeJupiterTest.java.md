# Migration plan: PrintChromeJupiterTest.java

## Source framework

**Selenium Java** — JUnit 5 Jupiter (`org.junit.jupiter.api.{Test,BeforeEach,AfterEach}`),
WebDriverManager (`io.github.bonigarcia.wdm.WebDriverManager`) for browser-binary provisioning,
AssertJ (`org.assertj.core.api.Assertions.assertThat`) for assertions, `ChromeOptions` with
`--headless` argument for headless execution.
Selenium 4 is inferred from the presence of `org.openqa.selenium.PrintsPage` and
`org.openqa.selenium.Pdf` — the CDP-backed print-to-PDF interface introduced in Selenium 4.0.
No PageFactory, no `ThreadLocal<WebDriver>`, no `WebDriverWait`.
**Target:** Playwright TypeScript, latest stable (v1.x as of 2026-06-09), using `page.pdf()` as
the first-class Chromium CDP equivalent.

Single-file input — `PrintChromeJupiterTest.java`, 72 LOC. No sibling source files in
`inputs/selenium-java/` for this test unit.

---

## Summary

This test navigates to the Boni Garcia Selenium WebDriver Java public demo page
(`https://bonigarcia.dev/selenium-webdriver-java/`), then uses Selenium 4's `PrintsPage` CDP
interface to trigger a browser print-to-PDF call with default print options. It asserts the
base64-encoded PDF response begins with `"JVBER"` — the base64 prefix for the PDF magic bytes
`%PDF` — confirming the browser produced a valid PDF file. Finally, it decodes the base64 string
and writes the raw bytes to a file named `my-pdf.pdf` in the working directory.

The test contains **no DOM element locators**: it navigates to a URL and calls a browser-level
API; there is no `findElement` anywhere. The migration maps `driver.get()` → `page.goto()` and
`PrintsPage.print()` → `page.pdf()`. The file-write side effect (`Files.write`) is a debug artifact
that should be removed (see Q3).

### What bug does this catch?

Catches a regression where Chrome's CDP-backed print-to-PDF capability fails to produce a valid PDF
when triggered on the target page — for example, the API returns an empty buffer or a response whose
first bytes are not the PDF magic bytes `%PDF`.

### User-perceivable assertion checklist

- [ ] After `page.pdf()`: the returned `Buffer`'s first four bytes equal `%PDF` in ASCII (equivalently
  the base64 string starts with `JVBER`), confirming a valid PDF was generated

> Note: the source also writes the PDF to disk (`Files.write("my-pdf.pdf", decodedImg)`) — this is a
> test artifact side-effect with no corresponding assertion. It is not listed here and is proposed for
> removal; see Q3.

---

## Anti-patterns detected

| Severity | Line | KB-ID | Anti-pattern | Snippet (≤60 chars) | Replacement |
|---|---|---|---|---|---|
| H | 45–46 | KB-1.3.21 | browser-flags-in-test | `ChromeOptions … addArguments("--headless")` | Move headless config to `playwright.config.ts` `use: { headless: true }` (or rely on the default — Playwright is headless by default in CI) |
| H | 48 | KB-1.3.25 | webdriver-binary-installer-in-test | `WebDriverManager.chromedriver().capabilities(…).create()` | Drop entirely; Playwright provisions its own browsers via `npx playwright install chromium`; no installer code needed |
| H | 57 | KB-1.1.14 | hardcoded-url | `driver.get("https://bonigarcia.dev/…")` | Configure `baseURL: 'https://bonigarcia.dev'` in `playwright.config.ts`; use relative path in `goto()` |
| M | 51–53 | KB-1.3.12 | driver-quit-in-aftereach | `@AfterEach void teardown() { driver.quit(); }` | Drop; Playwright `page` fixture is auto-provisioned and auto-disposed per test |
| L | 59 | KB-UNCLASSIFIED | unsafe-driver-cast | `PrintsPage pg = (PrintsPage) driver;` | No equivalent needed; `page.pdf()` is first-class in Playwright |
| L | 65–69 | KB-UNCLASSIFIED | test-artifact-file-write | `Files.write(destinationFile, decodedImg)` | Remove; writing to the working directory on every run is a debug artifact (analogous to KB-1.1.24) |

### Unclassified smells

**KB-UNCLASSIFIED — Unsafe driver cast** (line 59): `PrintsPage pg = (PrintsPage) driver;` is an
unchecked runtime cast with no `instanceof` guard. This is a Selenium 4 API design pattern (the
`WebDriver` instance returned by `ChromeDriver` implements `PrintsPage` under the hood), not a test
author error per se. There is no KB-1.3.x entry covering this specific pattern. No Playwright
equivalent needed — `page.pdf()` is a top-level API on the `Page` object. Reviewer: no action
required; this smell is an artefact of Selenium's interface-implementation design that disappears
entirely in the migration.

**KB-UNCLASSIFIED — Test artifact file write** (lines 65–69): `Files.write(Paths.get("my-pdf.pdf"),
decodedImg)` writes a binary PDF to the test working directory on every run, with no assertion on the
file content or presence. This is the closest Java equivalent of KB-1.1.24 (ad-hoc screenshot writes),
but KB-1.1.24 targets `page.screenshot()` in Playwright. The spirit is identical: a debug artifact
committing side effects without an assertion value. The recommended replacement is removal; Playwright's
config-level `use: { screenshot: 'only-on-failure', trace: 'retain-on-failure' }` provides richer
failure artifacts automatically without polluting the working directory. Reviewer: confirm whether the
PDF file write is intentional (e.g., integration output for a downstream consumer) or incidental (debug
residue from the bonigarcia textbook example). See Q3.

---

## Locator translation table

This test contains **no DOM element locators** — the source uses no `findElement`, `By.*`, or CSS
selector at any point. The table maps the two API calls that produce side effects: the URL navigation
and the PDF print invocation.

| Original | New | Confidence | Notes |
|---|---|---|---|
| `driver.get("https://bonigarcia.dev/selenium-webdriver-java/")` | `await page.goto('/selenium-webdriver-java/')` | med | Requires `baseURL: 'https://bonigarcia.dev'` in `playwright.config.ts`. If the project's existing config already sets a different `baseURL`, use a named constant instead (see pin 1 and Q1). |
| `(PrintsPage) driver; pg.print(new PrintOptions())` | `await page.pdf()` | high | `page.pdf()` is the direct Playwright CDP equivalent. Returns `Buffer` directly — no base64 cast needed. Requires headless Chromium (see Q4). Default print options are equivalent to `new PrintOptions()` defaults. |

---

## Hallucination-defense pins

1. **Navigation target URL** — assumed `page.goto('/selenium-webdriver-java/')` with `baseURL:
   'https://bonigarcia.dev'`. If the project's existing `playwright.config.ts` already declares a
   different `baseURL` (e.g., pointing at the project's own SUT): keep the absolute URL as a named
   constant `const BONIGARCIA_DEMO_URL = 'https://bonigarcia.dev/selenium-webdriver-java/'`, use
   `await page.goto(BONIGARCIA_DEMO_URL)`, add WHY-comment `'Q1 unresolved: external demo SUT, does
   not share baseURL with the main project'`. Reviewer fallback: confirm whether this test suite
   belongs in a separate Playwright project with its own `baseURL`, or whether the absolute URL
   constant approach is preferred.

---

## Structural changes

**Per-file fate** (single-file input):

| Source file | Fate | Reason |
|---|---|---|
| `PrintChromeJupiterTest.java` | **KEPT — reshaped** to `outputs/tests/print-chrome-jupiter-test.spec.ts` | Single `@Test` method becomes one `test(...)` block |
| `@BeforeEach setup()` block (lines 43–49) | **DROPPED** | `ChromeOptions + --headless` lives in `playwright.config.ts`; `WebDriverManager.chromedriver().create()` replaced by Playwright's auto-provisioned `page` fixture |
| `@AfterEach teardown()` block (lines 51–53) | **DROPPED** | `driver.quit()` replaced by Playwright's automatic per-test page disposal |

- **Extract POM:** No. Zero DOM interactions; zero locators. The 200-LOC and multi-page thresholds in
  `migration-rules.md §1` are not close to being met. Gold-plating would make the result worse.
- **Extract fixture:** No. The setup is a single `page.goto()` call; all browser config lives in
  `playwright.config.ts`. `migration-rules.md §1` requires ≥2 consumers or auth/mocking involvement
  before fixture extraction is justified.
- **Split into multiple specs:** No. One test case, one behavior.
- **Inline everything:** Yes. `page.pdf()` and the assertion inline directly in the test body.
- **Output file:** `outputs/tests/print-chrome-jupiter-test.spec.ts` (kebab-case of `PrintChromeJupiterTest` per `migration-rules.md §1`).
- **Browser constraint:** `page.pdf()` is only available in headless Chromium (Playwright
  restriction — CDP feature). The test must be scoped to a `chromium` project in
  `playwright.config.ts`. Running against Firefox or WebKit projects will throw at runtime (see Q4).

---

## Open questions for reviewer

```
Q1: Target URL and baseURL conflict
Context: Line 57 — driver.get("https://bonigarcia.dev/selenium-webdriver-java/")
What I assumed (proceeding without an answer): Set baseURL: 'https://bonigarcia.dev' in
  playwright.config.ts (or a separate Playwright project scoped to bonigarcia.dev) and use
  page.goto('/selenium-webdriver-java/'). The locator table row is MED confidence for this reason.
Impact if my assumption is wrong: If the project's playwright.config.ts already has a different
  baseURL pointing at the project's own SUT, relative paths would navigate to the wrong host and
  the test would fail on navigation. Fall back to an absolute URL constant (see pin 1).
```

```
Q2: PDF magic-bytes assertion — preserve base64 check or use raw buffer?
Context: Line 63 — assertThat(pdfBase64).contains("JVBER")
What I assumed (proceeding without an answer): Playwright's page.pdf() returns a raw Buffer; the
  cleaner assertion is expect(pdfBuffer.subarray(0, 4).toString('ascii')).toBe('%PDF'). This is
  semantically identical to the "JVBER" base64 check and avoids an unnecessary base64 round-trip.
Impact if my assumption is wrong: Negligible — both forms verify the same invariant. If downstream
  consumers compare the base64 string directly, Stage 2 should add:
  const pdfBase64 = pdfBuffer.toString('base64');
  expect(pdfBase64.startsWith('JVBER')).toBe(true);
  But prefer the raw-buffer form for clarity.
```

```
Q3: File write — remove or retain?
Context: Lines 65–69 — Files.write(Paths.get("my-pdf.pdf"), decodedImg)
What I assumed (proceeding without an answer): This is a debug artifact analogous to KB-1.1.24
  and should be removed from the migrated test. Playwright config (use: { screenshot: 'only-on-failure',
  trace: 'retain-on-failure' }) already captures rich failure artifacts without explicit writes.
Impact if my assumption is wrong: If the PDF file write is intentional — e.g., a nightly job that
  archives PDFs for compliance or visual QA — the Playwright version should use Node's
  fs.writeFileSync(path.join(test.info().outputDir, 'my-pdf.pdf'), pdfBuffer) to scope the write
  to Playwright's per-test output directory rather than the working directory. This prevents orphan
  artifacts in git status and scopes the file to the test run cleanly.
```

```
Q4: Headless-only constraint for page.pdf()
Context: page.pdf() requires headless Chromium in Playwright (CDP restriction).
What I assumed (proceeding without an answer): Add a chromium-only project entry in playwright.config.ts
  (or a skip guard via test.skip(!process.env.CI, 'PDF requires headless Chromium')) so this test
  is not run in headed or non-Chromium project configurations.
Impact if my assumption is wrong: If the test suite runs all tests in all projects (Chromium, Firefox,
  WebKit), page.pdf() will throw in Firefox and WebKit workers: "page.pdf is not supported in
  non-headless Chromium". The test must be guarded or limited to a Chromium project.
```

```
Q5: PrintOptions defaults — equivalent between Selenium and Playwright?
Context: Line 61 — PrintOptions printOptions = new PrintOptions(); (default construction, no configuration)
What I assumed (proceeding without an answer): page.pdf() with no options is equivalent to
  new PrintOptions() with defaults (A4 paper, portrait, no background, scale 1.0).
Impact if my assumption is wrong: If the original test relied on a particular paper size or print
  scale for its assertions (which it doesn't — the only assertion is "it's a PDF"), the difference
  is irrelevant. Flag only if a downstream comparison of PDF content is planned.
```

```
Q6: Is the navigation URL the assertion target or just setup?
Context: The source navigates to the Selenium WebDriver Java demo landing page —
  not a page from the project's own SUT.
What I assumed (proceeding without an answer): The URL is just setup context for the print test;
  any page that loads successfully in Chrome would yield a valid PDF. The bonigarcia.dev demo site
  is used because this is a textbook example (Boni Garcia's "Hands-On Selenium WebDriver with Java").
Impact if my assumption is wrong: If this test is intended to verify that a SPECIFIC application
  page prints to PDF correctly (e.g., the project's own invoice page), then the URL must be replaced
  with the actual application page path and the assertion should verify meaningful PDF content, not
  just magic bytes. Reviewer: clarify whether this test belongs in the migration suite or should be
  replaced by a project-specific print test.
```

---

## Risk callouts

- **External public SUT (`bonigarcia.dev`):** The test navigates to a live public website. Network
  outages or SUT unavailability cause CI failures with misleading errors (navigation timeout, not
  "the feature is broken"). Consider tagging `@slow` or gating behind an environment variable, or
  replace with a controlled internal page.

- **Headless-only PDF API:** `page.pdf()` throws outside headless Chromium. Any CI runner that sets
  `headless: false` or runs Firefox/WebKit projects will fail this test with a confusing non-product
  error. Scope to a `chromium` project in config.

- **Shallow assertion — valid PDF ≠ correct content:** The only assertion is "the file is a PDF".
  A blank page, an error page, or an incorrect page all produce valid PDFs. If the intent is to
  verify the page's actual content appears in the PDF (e.g., a specific heading), the assertion must
  be strengthened. This is a pre-existing weakness in the source test, not introduced by the migration.

- **PDF generation latency on cold CI:** `page.pdf()` can be slow on the first call in a cold
  Chromium worker (CDP handshake + rendering). The default `actionTimeout: 5_000` may be
  insufficient; consider a per-call `{ timeout: 30_000 }` override.

- **File write to working directory (if retained):** `my-pdf.pdf` written to the test working
  directory on every run creates orphan CI artifacts and may appear in `git status` on local runs.
  If the write is retained, use `test.info().outputDir` to scope it to Playwright's output directory.

---

## Expected metrics

- **Selector quality score (estimated):** 1.0 (vacuously — the source contains zero DOM element
  locators; the metric is N/A in the conventional sense. All non-DOM API calls map to `page.goto()`
  and `page.pdf()`, both of which are role/API-tier in the Playwright hierarchy)
- **Smell count delta vs source:** −6 (2 block: headless-in-test + WebDriverManager installer; 1 medium:
  driver.quit in @AfterEach; 1 high: hardcoded URL; 2 low: unsafe cast + file-write artifact — all
  removed; 0 new smells introduced)
- **New test file LOC estimate:** ~20–25 LOC (single `test.describe` + one `test(...)` block; no
  POM, no fixture file; one `page.goto`, one `page.pdf()`, one or two `expect` assertions)
- **Anti-pattern coverage:** 6/6 cataloged
