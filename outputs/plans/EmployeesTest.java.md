# Migration plan: EmployeesTest.java

## Source framework

**selenium-java** — JUnit 5 + Selenium WebDriver 4.x (inferred from `org.openqa.selenium.*`
imports, `@Test` / `@BeforeEach` / `@AfterEach` annotations, and `PageFactory` / `ExpectedConditions`
usage). No explicit library version pinned in source files; PageFactory deprecation warning in
Selenium 4 is consistent with the observed `@FindBy` + `initElements` pattern (KB-1.3.14).

**Target framework:** Playwright TypeScript (latest stable, 1.44+).

**Migration unit:** three-file directory treated as one unit per Selenium multifile migration rules:
- `EmployeesTest.java` — test class (2 `@Test` methods)
- `pages/EmployeesPage.java` — Page Object Model
- `helpers/DriverFactory.java` — `ThreadLocal<WebDriver>` driver lifecycle manager

---

## Summary

This suite exercises the HR employee management page. One test verifies that typing a name in
the search box filters the employee grid to show only matching rows; the other verifies that the
invite-new-employee modal flow completes with a "Invitation sent" confirmation toast. Together
they guard the two primary user entry points on the employees feature — discovery (search) and
onboarding (invite).

### What bug does this catch?

Catches a regression where either the employee-grid search filter stops working (no rows appear
after typing a name) or the invite-employee flow breaks silently and no confirmation is surfaced
after submitting an email address.

### User-perceivable assertion checklist

- [ ] After typing "Jane" in the search box: the employee grid has at least one row visible
- [ ] After typing "Jane" in the search box: the first row's name cell contains "jane" (case-insensitive)
- [ ] After opening the invite modal, entering "new.hire@beacon.test", and submitting: a confirmation toast with the text "Invitation sent" is visible

---

## Anti-patterns detected

> Sorted by Severity (H → M → L), then by file + line ascending. One row per smell instance.
> Severity codes: **H** = test will flake / break / leak secrets; **M** = test still works but is fragile or unreadable; **L** = stylistic.

| Sev | File | Line | KB-ID | Anti-pattern | Snippet (≤60 chars) | Replacement |
|---|---|---|---|---|---|---|
| H | EmployeesPage.java | 18 | KB-1.1.14 | hardcoded-url | `URL = "https://hr.beacon.test/employees"` | `page.goto('/employees')` with `baseURL` from env via config |
| H | EmployeesPage.java | 40 | KB-1.3.1 | hard-wait | `Thread.sleep(1500)` | web-first assertion on grid row appearing |
| H | EmployeesPage.java | 52 | KB-1.3.1 | hard-wait | `Thread.sleep(1000)` after modal action | `await expect(page.getByRole('dialog')).toBeVisible()` |
| H | EmployeesPage.java | 59 | KB-1.3.1 | hard-wait | `Thread.sleep(1200)` after sendBtn click | `await expect(toast).toBeVisible()` |
| H | DriverFactory.java | 11 | KB-1.3.16 | ThreadLocal-driver | `ThreadLocal<WebDriver> DRIVER` | Drop; Playwright `page` fixture is per-process, parallel-safe |
| M | EmployeesPage.java | 23–29 | KB-1.3.14 | PageFactory-FindBy-eager-init | `@FindBy(id=…) + PageFactory.initElements` | `readonly Locator` fields; drop `PageFactory.initElements` |
| M | EmployeesPage.java | 24 | KB-1.3.2 | positional-xpath | `@FindBy(xpath="//header//button[contains(., 'Add')]")` | `getByRole('button', { name: /add/i })` — MED; Q3 |
| M | EmployeesPage.java | 25 | KB-1.3.3 | css-class-selector | `@FindBy(css = ".invite-modal .send-btn")` | `getByRole('dialog').getByRole('button', { name: /send\|invite/i })` — LOW; Q4 |
| M | EmployeesPage.java | 29 | KB-1.3.4 | WebDriverWait-boilerplate | `new WebDriverWait(driver, Duration.ofSeconds(10))` | Drop; Playwright actions auto-wait for actionability |
| M | EmployeesPage.java | 40 | KB-1.1.9 | magic-number | `Thread.sleep(1500)` — bare ms literal | Remove sleep entirely; the wait is replaced by web-first assertion |
| M | EmployeesPage.java | 43–44 | KB-1.3.7 | findElements-snapshot | `driver.findElements(By.css(…)).size()` | `await expect(locator).not.toHaveCount(0)` |
| M | EmployeesPage.java | 47–49 | KB-1.3.7 | findElements-snapshot | `driver.findElements(…).get(0).getText()` | `locator('.employees-grid .row .name').first()` + `toContainText` |
| M | EmployeesPage.java | 52 | KB-1.1.9 | magic-number | `Thread.sleep(1000)` — bare ms literal | Remove; replaced by dialog visibility assertion |
| M | EmployeesPage.java | 53 | KB-1.3.6 | Actions-simple-click | `new Actions(driver).moveToElement(addBtn).click()…` | `await addBtn.click()` — investigate if hover required (Q2) |
| M | EmployeesPage.java | 54 | KB-1.3.15 | ExpectedConditions-ceremony | `wait.until(EC.visibilityOfElementLocated(…))` | `await expect(page.getByRole('dialog')).toBeVisible()` |
| M | EmployeesPage.java | 58 | KB-1.3.7 | findElements-snapshot | `driver.findElements(By.css(".invite-modal input")).get(0)` | Scoped textbox locator inside dialog (Q5) |
| M | EmployeesPage.java | 59 | KB-1.1.9 | magic-number | `Thread.sleep(1200)` — bare ms literal | Remove; replaced by toast visibility assertion |
| M | EmployeesPage.java | 64 | KB-1.3.2 | positional-xpath | `By.xpath("//div[contains(@class,'toast')]/span[2]")` | `getByRole('alert')` — LOW; Q6 |
| M | DriverFactory.java | 21 | KB-1.3.11 | implicitlyWait | `d.manage().timeouts().implicitlyWait(…8s…)` | Drop; configure `actionTimeout` + `expect.timeout` in `playwright.config.ts` |
| M | EmployeesTest.java | 24 | KB-1.3.12 | manual-driver-quit | `DriverFactory.dispose()` in `@AfterEach` | Drop; Playwright auto-disposes `page` fixture per test |
| M | EmployeesTest.java | 31 | KB-1.1.5 | sync-probe | `assertTrue(employees.rowCount() >= 1)` | `await expect(gridRows).not.toHaveCount(0)` |
| M | EmployeesTest.java | 32 | KB-1.1.5 | sync-probe | `assertTrue(employees.firstRowName()…contains("jane"))` | `await expect(firstRowNameCell).toContainText(/jane/i)` |
| M | EmployeesTest.java | 38 | KB-1.1.5 | sync-probe | `assertEquals("Invitation sent", employees.inviteToastText())` | `await expect(toast).toHaveText('Invitation sent')` |

### Unclassified smells

- **DriverFactory.java:22** — `d.manage().window().maximize()`. Not listed under KB §1.3 as a named anti-pattern, but §2.2 translation table maps it to `viewport: { width, height }` at project level. Should be replaced with a viewport setting in `playwright.config.ts` (e.g., `viewport: null` for native full-screen, or an explicit `{ width: 1920, height: 1080 }` constant). No KB-ID; flagged as L-severity. Reviewer to confirm target viewport dimensions (Q10).

---

## Locator translation table

| Original (file:line) | New | Confidence | Notes |
|---|---|---|---|
| `@FindBy(id = "search-employees")` (EmployeesPage:23) | `page.locator('#search-employees')` | high | Direct ID→CSS per KB §6 Rule 1; upgrade to `getByLabel(/search/i)` if DOM has an associated `<label for="search-employees">` (Q1) |
| `@FindBy(xpath = "//header//button[contains(., 'Add')]")` (EmployeesPage:24) | `page.getByRole('button', { name: /add/i })` | med | XPath targets `<button>` tag with text "Add" — semantic tag is direct evidence per KB §6 Rule 4; exact accessible name unverified (Q3) |
| `@FindBy(css = ".invite-modal .send-btn")` (EmployeesPage:25) | `page.getByRole('dialog').getByRole('button', { name: /send\|invite/i })` | low | CSS-class-only evidence; modal `role="dialog"` and button name are guessed (Q4) |
| `By.cssSelector(".employees-grid .row")` (EmployeesPage:43) | `page.locator('.employees-grid .row')` | med | Descriptive structural selector; no accessible row name available; may degrade if CSS class renamed |
| `By.cssSelector(".employees-grid .row .name").get(0)` (EmployeesPage:47) | `page.locator('.employees-grid .row .name').first()` | low | Positional `.first()` retained; `.name` CSS class may be fragile; no accessible cell name evidence (Q7) |
| `By.cssSelector(".invite-modal input").get(0)` (EmployeesPage:58) | `page.getByRole('dialog').getByRole('textbox')` | low | No label evidence for email input; assumes single textbox in modal (Q5) |
| `By.xpath("//div[contains(@class,'toast')]/span[2]")` (EmployeesPage:64) | `page.getByRole('alert')` | low | Toast ARIA role unverified; `span[2]` positional index loses meaning in Playwright — `toHaveText` on `role=alert` asserts the whole visible string (Q6) |

---

## Hallucination-defense pins

1. **Add/Invite header button** — assumed `page.getByRole('button', { name: /add/i })`. If DOM contradicts (e.g., accessible name is "Invite Employee" and `/add/i` does not match, or the element is not a `<button>`): keep `page.locator('xpath=//header//button[contains(.,\'Add\')]')`, add WHY-comment `'Q3 unresolved: accessible name of add-employee button not confirmed'`. Reviewer fallback: inspect the header DOM, confirm element tag + accessible name, then upgrade.

2. **Send button inside invite modal** — assumed `page.getByRole('dialog').getByRole('button', { name: /send|invite/i })`. If DOM lacks `role="dialog"` on modal container, or button name doesn't match `/send|invite/i`: keep `page.locator('.invite-modal .send-btn')`, add WHY-comment `'Q4 unresolved: modal role and send-button accessible name not confirmed'`. Reviewer fallback: ask FE team to confirm ARIA role on modal wrapper and exact visible text on the send button.

3. **Employee name cell (first visible row)** — assumed `page.locator('.employees-grid .row .name').first()`. If grid is semantic `<table>` with `<tr>` / `<td>`: replace with `page.getByRole('row').nth(1).getByRole('cell', { name: ... })`, add WHY-comment `'Q7 unresolved: grid DOM structure (table vs div) not confirmed'`. Reviewer fallback: inspect grid HTML to determine whether role-based row/cell selectors are viable.

4. **Email input inside invite modal** — assumed `page.getByRole('dialog').getByRole('textbox')`. If modal has multiple inputs (e.g., name + email) or input has an accessible label: use `getByLabel(/email/i)` (preferred) or `getByPlaceholder(...)`, add WHY-comment `'Q5 unresolved: email input label not confirmed'`. Reviewer fallback: ask FE team to confirm label text on invite-email input.

5. **Confirmation toast** — assumed `page.getByRole('alert')`. If toast container does not carry `role="alert"` or `role="status"`: keep `page.locator('xpath=//div[contains(@class,\'toast\')]').filter({ hasText: /invitation sent/i })`, add WHY-comment `'Q6 unresolved: toast ARIA role not confirmed'`. Reviewer fallback: ask FE team to add `role="alert"` (for urgent notifications) or `role="status"` (for polite ones) to the toast component.

6. **Employees grid rows** — assumed `page.locator('.employees-grid .row')` for count assertions. If CSS class changes or grid is a semantic `<table>`: use `page.getByRole('row')` (may need `.filter()` to exclude the header row), add WHY-comment `'Q7 unresolved: grid DOM structure not confirmed'`. Reviewer fallback: inspect grid HTML structure.

---

## Structural changes

**Per-file fate:**

| Source file | Fate | Target |
|---|---|---|
| `EmployeesTest.java` | KEPT AND RESHAPED | `outputs/tests/employees.spec.ts` |
| `pages/EmployeesPage.java` | KEPT AND RESHAPED | `outputs/tests/pages/employees.page.ts` |
| `helpers/DriverFactory.java` | DROPPED | no target file |

**Rationale for each:**

- `EmployeesTest.java` → `employees.spec.ts`: `@Test` methods become `test(...)` calls inside `test.describe('Employees page', ...)`. `@BeforeEach` (single `employees.open()`) becomes a three-line `test.beforeEach` navigating to `/employees` — does not warrant a fixture (migration-rules §1: keep `beforeEach` ≤3 lines; no cross-file reuse). `@AfterEach` with `DriverFactory.dispose()` is dropped entirely; Playwright auto-disposes the `page` fixture.

- `pages/EmployeesPage.java` → `employees.page.ts`: Per Selenium multifile rules, existing POMs are KEPT AND RESHAPED into slim Playwright POMs, not abandoned. The page has non-trivial interactions (search with async debounce, modal lifecycle, toast assertion) that justify a POM even under the 200 LOC threshold. `@FindBy` annotations become `readonly Locator` fields (lazy by default in Playwright — no `initElements` step). `PageFactory.initElements` and `WebDriverWait` dropped. `extends BasePage` is absent in this source (already standalone) — no inheritance to break. Return values for `rowCount()` and `firstRowName()` are removed; callers use web-first assertions on locators directly. `inviteToastText()` similarly is removed; the toast locator is exposed, and the test asserts on it.

- `helpers/DriverFactory.java` → DROPPED: `ThreadLocal<WebDriver>` is the Selenium parallel-runner accommodation (KB-1.3.16). Playwright runs each worker as a separate Node process — `page` fixture isolation is automatic. No explicit lifecycle management is needed. `WebDriverManager.chromedriver().setup()` equivalent is `npx playwright install` (built-in). No target file produced.

**POM extraction:** YES — `outputs/tests/pages/employees.page.ts`. Source already has a POM (multifile Selenium migration rule: KEPT AND RESHAPED). Justified even under the 200 LOC threshold because (a) the source POM boundary exists and is meaningful, and (b) the modal lifecycle pattern (open → fill → submit → assert toast) benefits from encapsulation. Inline locators in the spec file alone would be ~100 LOC, still under threshold, but the POM boundary is architecturally correct here.

**POM methods and properties to expose:**
- `searchInput: Locator`
- `addButton: Locator`
- `inviteDialog: Locator`
- `inviteEmailInput: Locator`
- `sendButton: Locator`
- `gridRows: Locator`
- `firstRowNameCell: Locator`
- `confirmationToast: Locator`
- `navigate(): Promise<void>` — `page.goto('/employees')`
- `search(query: string): Promise<void>` — fill `searchInput`, then rely on caller to assert grid state
- `openInviteModal(): Promise<void>` — click `addButton`, await `inviteDialog` visible
- `fillAndSubmitInvite(email: string): Promise<void>` — fill `inviteEmailInput`, click `sendButton`

Assertions live in the spec, not the POM (migration-rules §3: "POMs do not assert").

**Fixture extraction:** NO — `test.beforeEach` is a single `await page.goto('/employees')`. This is one line and does not produce a value the test needs; a fixture would be over-abstraction (migration-rules §1: extract fixture only when setup is needed by ≥2 test files or produces a value, or involves auth/mocking).

**Split into multiple specs:** NO — two tests on one feature (employees page), single file is correct.

---

## Open questions for reviewer

```
Q1: Does the search input have an accessible label?
Context: EmployeesPage.java:23, @FindBy(id = "search-employees").
What I assumed: locator('#search-employees') — HIGH confidence, safe to ship.
Impact if my assumption is wrong: none — the CSS ID locator is stable regardless.
Note: if a <label for="search-employees"> exists, getByLabel is the preferred upgrade (a11y benefit).
```

```
Q2: Why does openInviteModal() use Actions.moveToElement(addBtn) before clicking?
Context: EmployeesPage.java:53.
What I assumed: direct click() is sufficient — Playwright's actionability handling covers scroll-into-view.
Impact if my assumption is wrong: if the Add button is genuinely hover-revealed (e.g., only appears on
  header toolbar hover), the migrated openInviteModal() will fail with a "not visible" actionability
  error. In that case addButton.hover() must precede addButton.click().
```

```
Q3: What is the exact accessible name of the Add/Invite button in the header?
Context: EmployeesPage.java:24, XPath contains(., 'Add').
What I assumed: /add/i regex — matches any variant containing "add" (case-insensitive).
Impact if my assumption is wrong: locator matches a different header button (e.g., "Add Role",
  "Add Team") if multiple buttons contain "add". The regex must be tightened to the exact name.
```

```
Q4: Does the invite modal have role="dialog"? What is the visible text of the send button?
Context: EmployeesPage.java:25 (.invite-modal .send-btn), EmployeesPage.java:54.
What I assumed: getByRole('dialog').getByRole('button', { name: /send|invite/i }).
Impact if my assumption is wrong: locator fails at runtime; Stage 2 test times out on "send button
  not found". If modal uses a custom class without role="dialog", fall back to
  page.locator('.invite-modal').getByRole('button', { name: /send|invite/i }).
```

```
Q5: Does the email input inside .invite-modal have a <label>, aria-label, or placeholder?
Context: EmployeesPage.java:58, findElements(By.cssSelector(".invite-modal input")).get(0).
What I assumed: getByRole('dialog').getByRole('textbox') — assumes exactly one textbox in modal.
Impact if my assumption is wrong: if modal gains a second input (e.g., name field), getByRole('textbox')
  throws a strict-mode violation. If a label exists, getByLabel(/email/i) is both more robust and
  communicates intent.
```

```
Q6: Does the toast element carry role="alert" or role="status"? Is the text in one element?
Context: EmployeesPage.java:64, By.xpath("//div[contains(@class,'toast')]/span[2]").
What I assumed: page.getByRole('alert') with toHaveText('Invitation sent') on the whole element.
Impact if my assumption is wrong: getByRole('alert') finds nothing and the test times out. The
  span[2] positional selector suggests the toast text is split across child spans (e.g., icon in
  span[1], message in span[2]). toContainText is safer than toHaveText if there is an icon span.
```

```
Q7: Is .employees-grid built from <table><tr><td> or <div> rows?
Context: EmployeesPage.java:43–44, 47–49.
What I assumed: div-based CSS grid; locator('.employees-grid .row') and .first() for the name cell.
Impact if my assumption is wrong: if it's a semantic <table>, getByRole('row') / getByRole('cell')
  are preferred; the current CSS locators still work but miss the role-based upgrade and a11y feedback.
```

```
Q8: Should the row-count assertion be "at least 1" or "exactly 1" after searching "Jane"?
Context: EmployeesTest.java:31, assertTrue(employees.rowCount() >= 1).
What I assumed: not.toHaveCount(0) — preserves the >= 1 semantics of the source.
Impact if my assumption is wrong: toHaveCount(1) would fail if test data has multiple Janes, but
  would catch a regression where search returns multiple results when it should return exactly one.
```

```
Q9: What environment variable name does the team use for the base URL?
Context: EmployeesPage.java:18, URL = "https://hr.beacon.test/employees".
What I assumed: BASE_URL — the playwright.config.ts template default.
Impact if my assumption is wrong: CI will break if the team's .env uses BEACON_HR_URL or APP_URL.
  Stage 2 should check for an existing playwright.config.ts before defaulting to BASE_URL.
```

```
Q10: What is the target viewport for the migrated tests?
Context: DriverFactory.java:22, d.manage().window().maximize().
What I assumed: default Playwright viewport (1280×720); team configures in playwright.config.ts.
Impact if my assumption is wrong: if the employees grid has responsive breakpoints that hide/show
  columns at narrow widths, tests may behave differently. If the team tests at 1920×1080, Stage 2
  should add a viewport entry to playwright.config.ts's projects[].use.
```

---

## Risk callouts

1. **Search debounce masking** — The 1500ms `Thread.sleep` strongly suggests a search debounce. Replacing with `await expect(gridRows).not.toHaveCount(0)` is correct for the happy path but can produce a false positive: if the grid briefly shows _all_ employees before the debounce fires, the assertion passes against unfiltered results. Mitigation: assert on BOTH row count (not empty) AND first-row name containing "jane" — the name assertion is the meaningful oracle.

2. **Toast auto-dismiss race** — Confirmation toasts typically auto-dismiss after 3–5 seconds. The default Playwright `expect` timeout is 5s. If the toast appears and disappears within the assertion window (e.g., toast visible for 3s, assertion fires at 4.5s), the test will flake. Mitigation: stage the response-promise capture _before_ clicking send (or configure a per-assertion timeout slightly below the dismiss window).

3. **`Actions.moveToElement` hover-reveal risk** — If the Add button is hidden until a toolbar hover (Q2), the direct `click()` translation will always fail with "element not visible." This is not a flake — it is a hard failure that exposes a real constraint. Stage 2 must not silently swallow this; if `click()` fails on CI, the reviewer must confirm Q2 and add `hover()`.

4. **Parallel worker email collision** — `"new.hire@beacon.test"` is hardcoded. If the backend enforces email uniqueness and tests run in parallel (Playwright's default `fullyParallel: true`), workers will race on the same email. Mitigation: append `${test.info().workerIndex}` to the local part (KB-1.2.49 pattern). Stage 2 should emit a named constant, not the literal string.

5. **Positional `span[2]` assertion loses specificity** — The source reads `span[2]` inside the toast div, which likely means `span[1]` is an icon and `span[2]` is the message. `getByRole('alert')` with `toHaveText('Invitation sent')` will assert on the full concatenated text content of the toast element — if the icon span renders an accessible text or a non-breaking space before the message, `toHaveText` fails. `toContainText('Invitation sent')` is safer until Q6 is resolved.

6. **`rowCount() >= 1` is a lax oracle** — The assertion passes as long as _any_ row is visible, including the unfiltered grid state. Stage 2 should preserve the `not.toHaveCount(0)` semantics but document the weakness. The `toContainText(/jane/i)` on the first row is the true regression signal.

---

## Expected metrics

- **Selector quality score (estimated post-migration):** 0.50 — 3–4 of 7 locators will be role/label-based (addButton, confirmationToast via `getByRole('alert')`, inviteEmailInput via `getByRole('textbox')`). Best case 5/7 = 0.71 once Q1, Q5, Q6 are confirmed by reviewer. Minimum viable is 0.43 if all LOW pins fall back to CSS.
- **Smell count delta vs source:** −23 (5 H + 18 M classified) — 3 hard waits removed, 1 ThreadLocal dropped, 1 hardcoded URL parameterised, 3 PageFactory @FindBy translated, 1 WebDriverWait dropped, 1 Actions-simple-click simplified, 1 ExpectedConditions ceremony dropped, 3 findElements-snapshot-index calls replaced, 1 implicitlyWait removed, 1 manual driver.quit dropped, 3 sync-probe assertions promoted to web-first, 3 magic-number ms literals removed. Plus 1 KB-UNCLASSIFIED window.maximize → viewport config = −24 total.
- **LOC delta:** estimated −56 (source ~141 LOC across 3 files → target ~85 LOC: ~35 spec + ~50 POM)
- **Anti-pattern coverage:** 23/24 (24th is KB-UNCLASSIFIED `window.maximize()`)
