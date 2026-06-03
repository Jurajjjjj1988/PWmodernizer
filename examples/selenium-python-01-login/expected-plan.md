# Migration plan: input.spec.ts (Selenium Python -> Playwright TypeScript)

## Source framework
selenium-python

## Summary
Beacon HR sign-in and dashboard KPI. Two scenarios: a valid credential
pair signs the user in and shows a personalised greeting on the
dashboard; once signed in, the "Team members" KPI card shows a non-zero
integer count.

## Anti-patterns detected
- [x] `time.sleep(2)` (line 25) — hard wait; replace with web-first
      assertion.
- [x] `driver.implicitly_wait(5)` (line 13) — implicit waits are
      Selenium-only; Playwright's auto-retrying assertions cover this.
- [x] `WebDriverWait + EC.visibility_of_element_located` (lines 34-36)
      — translate to `expect(locator).toBeVisible()`.
- [x] `cards[0]` snapshot-list indexing (line 45) — Playwright's
      `locator.first()` is auto-retrying. Better: pick the card by its
      accessible name.
- [x] `driver` fixture with `webdriver.Chrome()` setup — replaced by
      Playwright's `page` fixture.
- [x] non-web-first `assert greeting == "Welcome back, HR Admin"` (line
      40) and `assert int(count) >= 1` (line 47) — Playwright's
      `toHaveText` waits for the value.
- [x] deep XPath `//form//button[@type='submit']` — replace with
      `getByRole('button', { name: 'Sign in' })`.
- [x] implicit fixture dependency — `logged_in_driver` depends on
      `driver` without making the login steps visible at the test
      callsite. Playwright fixture pattern keeps the dependency explicit
      via destructuring.

## Locator translation table
| Original | New | Confidence | Notes |
|---|---|---|---|
| `By.ID, "email"` | `page.getByLabel('Email')` | medium | Assumes a `<label>` association. If placeholder-only, `getByPlaceholder('Email')`. |
| `By.ID, "password"` | `page.getByLabel('Password')` | medium | Same. |
| `By.XPATH, "//form//button[@type='submit']"` | `page.getByRole('button', { name: 'Sign in' })` | high | The form's submit button is the Sign in CTA. |
| `By.CSS_SELECTOR, ".dashboard-greeting"` | `page.getByRole('heading', { name: 'Welcome back, HR Admin' })` | medium | Assumes the greeting is a heading. If just a styled `<div>`, fall back to `page.getByText('Welcome back, HR Admin')`. |
| `By.CSS_SELECTOR, ".kpi-card"` (first) | `page.getByRole('region', { name: 'Team members' })` | low | Original tests pick `cards[0]` and assumes it is the Team card. Migrated test picks BY NAME (more robust) but assumes the card has an accessible name. If not, fall back to `page.getByTestId('kpi-team').first()`. |
| `By.CSS_SELECTOR, ".kpi-value"` (inside team card) | `teamCard.getByTestId('kpi-value')` | medium | KPI values are commonly testid-tagged; reviewer should confirm. |

## Structural changes
- Extract POM: no — only two short tests, both highly readable inline.
- Extract fixture: YES — `loggedInPage` fixture replaces the implicit
  `logged_in_driver` pytest fixture. Login is performed via the UI (to
  keep parity with the source); for stable CI we could switch to a
  `storageState` fixture in a follow-up.
- Split into multiple specs: no.

## Open questions for reviewer
- Is the "Team members" KPI card the FIRST card in the layout, or just
  one of several? The original test relies on `cards[0]` (positional);
  the migrated test relies on the card's accessible name. If the card
  has no accessible name, switch to `getByTestId('kpi-team')`.
- Does the team KPI value show "0" when there are no team members, or
  does the API guarantee at least one? The assertion `not.toHaveText('0')`
  guards against the empty case — keep or drop based on intent.
- Currently the `loggedInPage` fixture logs in through the UI. If login
  is well-covered elsewhere, switch to a `storageState`-based fixture
  to halve runtime and reduce login-step noise.

## Risk callouts
- Auth via UI in a fixture: if the login page changes (selector,
  greeting copy), every test using `loggedInPage` will fail. This is the
  right level of coupling for v0; revisit when the suite grows.
- `not.toHaveText('0')` is a narrow guard — it lets "0 " (with a
  trailing space) through. Reviewer should confirm whether trim
  semantics matter.

## Expected metrics
- Selector quality score: 5/5 role/label-based + 1 testid (was 0/6
  id / xpath / css).
- Smell count delta: -1 `time.sleep`, -1 implicit wait, -1
  `WebDriverWait`, -1 snapshot-list indexing, -2 non-web-first
  assertions, -1 implicit fixture dependency.
- LOC delta: 47 → 39 (-8 lines).
