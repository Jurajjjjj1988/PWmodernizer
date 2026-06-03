# Migration plan: flaky-waits.spec.ts

## Source framework

bad-playwright

---

## Summary

This test exercises the Acme Shop login page for two user-facing scenarios: signing in with valid credentials (expecting a personalized dashboard greeting) and submitting wrong credentials (expecting an inline error banner). The source file is structurally valid Playwright TypeScript but suffers from five `waitForTimeout` hard waits, four CSS-class/id-based locators with no semantic grounding, two one-shot synchronous assertion probes, and a conditional `if/else` block that makes one test assertion optional. Together these defects make the suite highly sensitive to backend latency and DOM class renames. The migration must eliminate all timing hard-codes, promote locators toward role/label semantics where evidence allows, and replace the conditional block with a direct web-first assertion.

---

## Anti-patterns detected

| Line(s) | Snippet | KB ref | Severity | Fix in plan |
|---|---|---|---|---|
| 8 | `await page.waitForTimeout(2000)` | KB-1.1.1: Hard waits via `waitForTimeout` | block | Replace with a web-first assertion on the stable login-page landmark after `goto` (e.g. `await expect(emailInput).toBeVisible()`). Exact locator is TBD — see Q1. |
| 13 | `await page.waitForTimeout(500)` | KB-1.1.1: Hard waits via `waitForTimeout` | block | Remove entirely. Playwright's `fill()` auto-waits for the input to be actionable; no inter-field delay is needed. |
| 15 | `await page.waitForTimeout(500)` | KB-1.1.1: Hard waits via `waitForTimeout` | block | Remove entirely. Same rationale as line 13. |
| 18 | `await page.waitForTimeout(3000)` | KB-1.1.1: Hard waits via `waitForTimeout` | block | Remove. The subsequent web-first assertion `await expect(dashboardGreeting).toContainText(...)` auto-polls until `actionTimeout`, making this wait redundant. |
| 29 | `await page.waitForTimeout(7000)` | KB-1.1.1: Hard waits via `waitForTimeout` | block | Remove. 7 s exceeds the project's `actionTimeout: 5_000`. Replace with `await expect(errorLocator).toContainText('Invalid credentials')`. If the real backend error response exceeds 5 s, a per-assertion `{ timeout: 10_000 }` override must be added with a comment — see Q8 and Risk callouts. |
| 7 | `await page.goto('https://shop.acme.test/login')` | KB-1.4.12: Hardcoded environment URL | warn | Replace with `await page.goto('/login')` and ensure `baseURL` is read from `process.env.BASE_URL` in `playwright.config.ts`. |
| 20 | `expect(await page.locator('.dashboard-greeting').isVisible()).toBe(true)` | KB-1.1.5: Synchronous probe instead of web-first | block | Replace with `await expect(dashboardGreeting).toContainText('Welcome back, Jane')`. The `toContainText` matcher auto-retries and subsumes the visibility check, making the standalone `isVisible` probe redundant. |
| 21 | `expect(await page.locator('.dashboard-greeting').innerText()).toContain(…)` | KB-1.1.5: Synchronous probe instead of web-first | block | Merged into the fix for line 20 — a single `toContainText` replaces both probes. |
| 31–36 | `if (await errorBanner.isVisible()) { … } else { throw … }` | KB-1.1.12: Conditional logic inside test body | block | Replace the entire if/else block with `await expect(errorBanner).toContainText('Invalid credentials')`. Web-first `toContainText` retries until timeout and emits a clear failure if the element never appears — the manual `throw` is redundant and the `if` makes the assertion optional. |
| 33 | `expect(await errorBanner.innerText()).toContain('Invalid credentials')` | KB-1.1.5: Synchronous probe | block | Subsumed by the conditional-logic fix above. |
| 20–21, 31–33 | `page.locator('.dashboard-greeting')`, `page.locator('.error-banner')` | KB-1.1.3: CSS-class as primary selector | warn | No DOM evidence for role or accessible name. Default to `locator('.dashboard-greeting')` / `locator('.error-banner')` with LOW confidence in the locator table; reviewer should add `data-testid` attributes or confirm `role="alert"` on the error banner — see Q3, Q4. |
| 12, 25 | `page.locator('#email')` | KB-1.1.3: Non-semantic id selector (locator priority) | info | Can be upgraded to `getByLabel(/email/i)` with MED confidence if the input has an associated `<label>`. See Locator translation table Q2. |
| 14, 26 | `page.locator('#password')` | KB-1.1.3: Non-semantic id selector (locator priority) | info | Can be upgraded to `getByLabel(/password/i)` with MED confidence. Same rationale as `#email`. |
| 21 | `'Welcome back, Jane'` (hardcoded first name) | KB-1.1.9: Magic numbers / magic strings | warn | "Jane" is the display name of the specific test user `jane.doe@acme.test`. Extract to a named constant (`VALID_USER_DISPLAY_NAME`) or use a regex (`/Welcome back,/i`) that does not couple the assertion to the exact name — see Q6. |
| 12, 14, 25, 26 | `'jane.doe@acme.test'`, `'Sup3rSecret!'`, `'wrong-password'` | KB-1.1.9: Magic strings (inline credentials) | warn | Credentials are hardcoded inline. Should come from `process.env.TEST_USER_EMAIL` / `process.env.TEST_USER_PASSWORD` (valid path) and a symbolic constant for the invalid password — see Q7. |

### Unclassified smells

- **Unnecessary double-nesting (`test.describe('credentials')` inside `test.describe('Acme Shop login')`)**: With only two tests, the inner `describe` adds hierarchy without grouping value. The outer describe could be flattened, or the inner describe could be renamed to make it semantically distinct (e.g. `'happy path'` vs `'error path'`). Not in the knowledge base; flagging for reviewer decision.
- **Test title on line 11 — "user can sign in…"**: Starts with "user can" rather than a present-tense verb. Migration-rules §2 requires titles to start with a verb (e.g. "signs in with valid credentials"). Flagging; Stage 2 should rename.
- **`import { test, expect } from '@playwright/test'` — direct framework import**: Migration-rules §2 requires importing `test` from the project fixture file (`../../fixtures/pages.fixture`) so that fixture extensions and `expect` re-exports are co-located. Flagging for Stage 2 to wire the import correctly once a fixture path is confirmed — see Q9.
- **`page.getByText('Sign in').click()` on an interactive element (lines 17, 27)**: `getByText` is Tier 3 in the locator hierarchy; for a clickable element `getByRole('button', { name: /sign in/i })` (Tier 1) is preferred. No KB entry covers this exact bad-Playwright idiom; including here for completeness. See Locator translation table entry for lines 17/27.

---

## Locator translation table

| Line(s) | Source locator | Element role/purpose | Proposed target locator | Confidence | Evidence |
|---|---|---|---|---|---|
| 12, 25 | `page.locator('#email')` | Email address input field | `page.getByLabel(/email/i)` | MED | Id `email` strongly suggests an email input, and the form convention implies a `<label>` for `email`, but no DOM snapshot confirms the label text. Preserve `page.locator('#email')` as fallback if label is absent — see Q2. |
| 14, 26 | `page.locator('#password')` | Password input field | `page.getByLabel(/password/i)` | MED | Same rationale as `#email`. Standard login forms universally label the password field; no DOM snapshot to confirm — see Q2. |
| 17, 27 | `page.getByText('Sign in')` | Sign-in submit trigger | `page.getByRole('button', { name: /sign in/i })` | MED | The element is used with `.click()` in a form-submission context, making a `<button>` or `<input type="submit">` likely. However `getByText` matches any element — could be a styled `<a>` or `<div>`. **Review needed: confirm element tag before upgrading to `getByRole`.** Fallback: `page.getByText('Sign in', { exact: true })` (HIGH confidence, keeps current semantics) — see Q5. |
| 20, 21 | `page.locator('.dashboard-greeting')` | Personalized welcome message on the dashboard | `page.locator('.dashboard-greeting')` | LOW | CSS class only; no DOM evidence of role, `aria-label`, or `data-testid`. Cannot propose `getByRole` or `getByText` without knowing the element tag and runtime text. Reviewer should add a `data-testid="dashboard-greeting"` to the component or confirm a heading role — see Q3. |
| 31, 32, 33 | `page.locator('.error-banner')` | Inline error banner displayed after failed auth | `page.getByRole('alert')` | MED | Error notifications frequently carry `role="alert"` in accessible implementations; `.error-banner` class name reinforces this guess. If the element lacks a role, fallback is `page.locator('.error-banner')` (LOW). If `.error-banner` matches multiple elements on the page, scope with `.filter({ hasText: /invalid credentials/i })` — see Q4. |

**Hallucination-defense pins for Stage 2:**

1. `page.locator('#email')` / `page.locator('#password')` — do **not** upgrade to `getByRole('textbox')` without DOM evidence. The `#id` carries no role information. If `getByLabel` is not confirmed by reviewer, keep `page.locator('#email')` / `page.locator('#password')` at HIGH confidence.
2. `page.getByText('Sign in')` — do **not** silently promote to `getByRole('button')`. If reviewer confirms it is a `<button>`, promote with HIGH confidence. Otherwise keep `getByText('Sign in', { exact: true })`.
3. `page.locator('.dashboard-greeting')` — do **not** invent a role or accessible name. No role evidence exists. Keep `locator('.dashboard-greeting')` and add an inline comment requesting a `data-testid`.
4. `page.getByRole('alert')` for `.error-banner` — emit with MED confidence and a reviewer flag.

---

## Structural changes

- **Extract POM:** No. The test file is ~39 LOC and exercises a single login page plus a brief post-login dashboard view. This is well under the 200 LOC threshold defined in migration-rules §1. Inline locators are the correct default.
- **Extract fixture:** No — but consider. The `beforeEach` navigation and credential constants could live in a fixture, but they are used by only one spec file, and migration-rules §1 says to extract a fixture only when setup is needed by ≥2 test files or involves non-trivial auth/mocking. The current setup (`goto` + a readiness assertion) is trivially inline. Credential constants belong in `data/acme-login-fixtures.ts` (see Q7).
- **Split into multiple specs:** No. Two tests, one feature (login). Splitting would create two single-test files with duplicated `beforeEach`, which is worse.
- **Inline everything:** Yes — the correct default for this size and scope.
- **Describe restructuring:** Flatten the two-level `describe` to a single `test.describe('Acme Shop login')`. The inner `'credentials'` describe adds no grouping value and slightly obscures test path reporting. If the reviewer wants to differentiate happy/error paths, rename the inner describe to `'happy path'` and `'error path'` and add a second top-level or second-level describe as appropriate — but still within the two-level maximum.
- **Test data file:** A minimal `data/acme-login-fixtures.ts` exporting `VALID_USER` (email + password) and `INVALID_PASSWORD` and `VALID_USER_DISPLAY_NAME` constants is recommended (not strictly an extraction trigger, but avoids inline magic strings per KB-1.1.9). Stage 2 may inline them as named `const` at the top of the spec file if no data file exists yet.

---

## Open questions for reviewer

```
Q1: What stable DOM element can replace waitForTimeout(2000) in beforeEach?
Context: Line 8 — the goto('/login') is followed by a 2s hard wait before each test runs.
What I assumed (if proceeding without an answer): Use `await expect(emailInput).toBeVisible()` (where emailInput is #email / getByLabel('email')). This is the most logical readiness signal for a login page.
Impact if my assumption is wrong: If the email input is not the first stable element (e.g., it's injected by a slow JS bundle after a splash screen), the readiness assertion may time out. A heading or a visible form container might be a better anchor.
```

```
Q2: Do the #email and #password inputs have associated <label> elements? If so, what is the label text?
Context: Lines 12, 14, 25, 26 — id selectors are used. Upgrading to getByLabel requires knowing the label text.
What I assumed (if proceeding without an answer): Labels exist with text /email/i and /password/i respectively (standard login form pattern). Emitted as MED confidence.
Impact if my assumption is wrong: getByLabel will throw "no element found" if labels are absent or use different text (e.g. "E-mail address" or "Username"). Fallback: keep page.locator('#email') / page.locator('#password') at HIGH confidence.
```

```
Q3: What is the .dashboard-greeting element? Does it have a role, aria-label, or data-testid?
Context: Lines 20–21 — the locator is a CSS class with no semantic information.
What I assumed (if proceeding without an answer): No role evidence — keeping page.locator('.dashboard-greeting') at LOW confidence with a comment asking for a data-testid.
Impact if my assumption is wrong: If the element is a heading (e.g. <h2>) and the page later gains multiple headings, the locator may become ambiguous. A data-testid="dashboard-greeting" is the cleanest long-term fix.
```

```
Q4: Does .error-banner carry role="alert" in the DOM?
Context: Lines 31–33 — the error banner locator is a CSS class. getByRole('alert') is proposed at MED confidence.
What I assumed (if proceeding without an answer): getByRole('alert') is used as the primary proposal. If no role="alert", the fallback is page.locator('.error-banner').
Impact if my assumption is wrong: If role="alert" is absent, getByRole('alert') will not find the element. If there are other alerts on the page (e.g., cookie consent), scope with .filter({ hasText: /invalid credentials/i }) to disambiguate.
```

```
Q5: Is the "Sign in" trigger a <button>, <input type="submit">, or a styled <a>/<div>?
Context: Lines 17, 27 — page.getByText('Sign in').click() is used.
What I assumed (if proceeding without an answer): Proposing getByRole('button', { name: /sign in/i }) at MED confidence with a reviewer flag.
Impact if my assumption is wrong: If it is a link (<a>), the correct locator is getByRole('link', { name: /sign in/i }). If it is a <div> with a click handler, there is no accessible role and page.getByText('Sign in', { exact: true }) should be kept.
```

```
Q6: Should "Welcome back, Jane" be an exact match or a pattern assertion?
Context: Line 21 — the display name "Jane" is hardcoded. This ties the assertion to the specific test user's display name.
What I assumed (if proceeding without an answer): Extract to a VALID_USER_DISPLAY_NAME constant ('Jane') defined alongside the test credentials, and use toContainText(VALID_USER_DISPLAY_NAME) so it is one-place-to-update.
Impact if my assumption is wrong: If the app's display format changes (e.g., "Welcome back, Jane Doe" or locale-aware "Vítejte, Jane"), the hardcoded match fails. Using /Welcome back,/i as a regex assertion is more resilient but loses the per-user identity check.
```

```
Q7: Should test credentials come from env vars or a data file?
Context: Lines 12, 14, 25, 26 — email and passwords are hardcoded inline.
What I assumed (if proceeding without an answer): Emit named constants at the top of the spec (VALID_EMAIL, VALID_PASSWORD, INVALID_PASSWORD) as a minimum improvement. If a data/acme-login-fixtures.ts exists, Stage 2 should import from there. Credentials should ultimately come from process.env.TEST_USER_EMAIL / process.env.TEST_USER_PASSWORD per KB-1.2.5 precedent.
Impact if my assumption is wrong: If the test user's password is rotated in staging, every hardcoded occurrence silently breaks. Env vars allow credential rotation without code changes.
```

```
Q8: Does the backend error response for a wrong password genuinely take >5 s?
Context: Line 29 — waitForTimeout(7000) implies the dev observed a 5–7 s error response.
What I assumed (if proceeding without an answer): Replace with web-first toContainText using the default actionTimeout: 5_000. If that fails on CI, add { timeout: 10_000 } to only this assertion with an inline comment explaining the backend latency.
Impact if my assumption is wrong: If the backend genuinely needs 6–7 s to return an auth error, the migrated test will flake on CI under the default 5 s timeout. This is a real latency bug that the 7 s wait was masking — surfacing it is correct, but we must set an appropriate explicit timeout rather than leaving it silently broken. See Risk callouts.
```

```
Q9: What is the project fixture file path for importing `test`?
Context: Line 1 — import { test, expect } from '@playwright/test'. Migration-rules §2 requires importing from the project fixture file.
What I assumed (if proceeding without an answer): Using ../../fixtures/pages.fixture as the import path per the migration-rules §2 skeleton. If the project has a different fixture path, Stage 2 must update the import.
Impact if my assumption is wrong: Broken import path → TypeScript compile error at Stage 2. If no fixture file exists yet, Stage 2 should create fixtures/pages.fixture.ts that re-exports test and expect from @playwright/test.
```

```
Q10: Is the login page at '/login' the correct relative path (after stripping the hardcoded domain)?
Context: Line 7 — https://shop.acme.test/login.
What I assumed (if proceeding without an answer): The path segment /login is correct and baseURL will be set to process.env.BASE_URL ?? 'http://localhost:3000'.
Impact if my assumption is wrong: If the app serves the login page at a different path (e.g. /auth/login or /sign-in), the goto call will navigate to a 404 and every test in the file will fail.
```

---

## Risk callouts

- **7-second wait masking real backend latency (line 29):** The `waitForTimeout(7000)` on the error path suggests the auth rejection response takes 5–7 seconds. Replacing with a web-first assertion under the default `actionTimeout: 5_000` will surface this as a real flake. This is the test now *correctly* catching a bug rather than hiding it. The reviewer must decide: accept that the test correctly reports a slow backend, or add `{ timeout: 10_000 }` to this assertion alone with a comment naming the latency budget.

- **No network mocking — real backend required:** Both tests hit `https://shop.acme.test` directly. If the backend is unavailable, both tests fail together and the failure is indistinguishable from a product regression. Consider adding `page.route` stubs for `/login` responses as an opt-in via a fixture option, so CI can run a fast stubbed variant alongside the full E2E run.

- **Hardcoded display name "Jane" is brittle:** The assertion `toContainText('Welcome back, Jane')` will fail if: (a) the test user is re-created with a different display name, (b) the app introduces locale-aware greeting text, or (c) the name format changes. Migrating to a named constant + regex fallback reduces this risk but does not eliminate it.

- **Behavioural drift from removing the 2 s beforeEach wait:** The original `waitForTimeout(2000)` in `beforeEach` may have been silently absorbing a login-page hydration delay (JS bundle, cookie-consent overlay, etc.). The replacement web-first assertion on the email input will surface any such delay as an `actionTimeout` failure, which is correct — but the first CI run after migration may reveal a legitimate slow-loading page that needs investigation.

- **Assertion on `.dashboard-greeting` is single-locator, two assertions in source:** The source makes two sequential one-shot probes on the same element (visible check + text check). Web-first `toContainText` subsumes both. The net result is one assertion instead of two, which is correct and simpler — but reviewers should confirm the removed `isVisible` check is not independently valuable (e.g., if the element can exist in the DOM while not being visible to the user, `toBeVisible` before `toContainText` would still be warranted).

- **No cleanup / state isolation:** Neither test clears cookies, localStorage, or auth state between runs. Playwright's default `page` fixture is test-scoped (fresh context per test), so this is handled implicitly. However, if the project ever switches to a shared browser context (`storageState` or worker-scoped page), auth state from test 1 (valid login) could bleed into test 2 (wrong password). The migration should keep the default test-scoped page fixture.

---

## Expected metrics

- **Selector quality score (estimated post-migration):** 3–4 / 5 unique locators will be role/label-based if MED-confidence proposals are confirmed (0.60–0.80). Target ≥0.70 is achievable if `#email`, `#password`, and `Sign in` are confirmed; `.dashboard-greeting` is the only locator that may remain CSS-only.
- **Smell count delta vs source:** −5 hard waits (KB-1.1.1), −5 synchronous probes (KB-1.1.5), −1 conditional logic block (KB-1.1.12), −3 CSS/non-semantic locators (where MED upgrades are confirmed), −1 hardcoded URL, −2 hardcoded credentials/magic strings = **−17 smells**, +0 new smells introduced.
- **LOC delta:** Source ~39 LOC → target ~28–34 LOC. Reduction comes from eliminating 5 `waitForTimeout` lines, collapsing the 6-line conditional block to 1 line, and merging the two one-shot probes in test 1 into a single assertion. Imports and describe scaffolding are stable.
- **Anti-pattern coverage:** 14 cataloged anti-pattern instances / ~14 estimated total = 14/14. Three unclassified smells noted outside the KB catalog.
