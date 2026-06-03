# Migration plan: input.spec.ts (Selenium Python -> Playwright TypeScript)

## Source framework
selenium-python

## Summary
Keystone Admin invite-user modal. Three scenarios on `/users`: opening the
modal via the Invite button and closing via the modal's close button;
closing the modal via the Escape key; and inline email validation
inside the modal when the user submits with a malformed address.

## Anti-patterns detected
- [x] `time.sleep(1)` (lines 22, 27, 33, 41, 44, 51, 58) — hard waits
      between every interaction; replace with web-first
      `toBeVisible()` / `toBeHidden()`.
- [x] class-based inheritance (`BaseTest` with `setup_class` /
      `teardown_class`) — carries hidden state (`cls.driver` shared
      across methods). Playwright's `page` fixture gives each test a
      fresh context.
- [x] deep XPath `//main//button[contains(.,'Invite')]`,
      `//div[contains(@class,'modal')]//button[3]` (positional `button[3]`)
      — fragile; replace with role-based locators with accessible
      names.
- [x] snapshot-list indexing `find_elements(...)[0]` (line 56) and
      `find_elements(...)[1]` (line 59) — positional, races UI changes.
- [x] `body.send_keys(Keys.ESCAPE)` (line 45) — Playwright has
      `page.keyboard.press('Escape')` which is more idiomatic.
- [x] non-web-first assertions: `assert "Invite a new user" in
      modal.text`, `assert len(overlays) == 0`, `assert error.text == ...`
      — replace with `expect(locator).toBeVisible()` /
      `toHaveText()`.
- [x] CSS deep path `div.modal-overlay > div.modal` and
      `.modal .field-error` — replace with `getByRole('dialog')` and
      `getByText` for the error message.

## Locator translation table
| Original | New | Confidence | Notes |
|---|---|---|---|
| `By.XPATH, "//main//button[contains(.,'Invite')]"` | `page.getByRole('button', { name: 'Invite' })` | high | The page's primary CTA. |
| `By.CSS_SELECTOR, "div.modal-overlay > div.modal"` | `page.getByRole('dialog', { name: 'Invite a new user' })` | medium | Assumes the modal has `role="dialog"` and an `aria-label` / `aria-labelledby`. If not, fall back to `getByTestId('invite-modal')`. |
| `By.XPATH, "//div[contains(@class,'modal')]//button[3]"` | `modal.getByRole('button', { name: 'Close' })` | medium | The original picks the 3rd button positionally — best guess is the Close button (an X icon). Reviewer should confirm; if it is "Cancel", switch the name. |
| `By.CSS_SELECTOR, "div.modal-overlay"` (for count check) | `expect(modal).toBeHidden()` | high | The original counts overlays to confirm closure; the migrated test asserts the dialog locator is hidden. Cleaner intent. |
| `body.send_keys(Keys.ESCAPE)` | `page.keyboard.press('Escape')` | high | Direct Playwright equivalent. |
| `find_elements(By.CSS_SELECTOR, ".modal input")[0]` | `modal.getByLabel('Email')` | medium | The modal's first input is the Email field. Migration prefers the labelled locator over positional access. |
| `find_elements(By.CSS_SELECTOR, ".modal button")[1]` | `modal.getByRole('button', { name: 'Send invite' })` | medium | Original picks the 2nd modal button positionally — best guess "Send invite" (the primary action). Reviewer should confirm exact button copy. |
| `By.CSS_SELECTOR, ".modal .field-error"` | `modal.getByText('Please enter a valid email')` | high | Assert on the visible message. |

## Structural changes
- Extract POM: no — three small modal scenarios; inline reads cleanly.
- Extract fixture: PARTIAL — the `beforeEach` opens the modal because
  all three tests start with it open. (The original spec duplicated the
  Invite-click in each test.)
- Split into multiple specs: no — single feature (invite modal).

## Open questions for reviewer
- Is the modal actually a `role="dialog"` element with an accessible
  name? If not, the `getByRole('dialog', { name: 'Invite a new user' })`
  strategy fails — switch to `getByTestId('invite-modal')`.
- The original spec picks the 3rd button in the modal as the close
  button (`button[3]`). Visually we suspect this is the X icon button.
  Reviewer should confirm via DOM; if not, name it correctly
  (`getByRole('button', { name: 'Cancel' })` etc.).
- Same for the 2nd button as "Send invite" — confirm the actual button
  copy.
- The invalid-email scenario only enters the email and clicks send. Does
  the modal have an additional required field (name, role)? If yes, the
  test may need to fill those to isolate the email-specific error.

## Risk callouts
- The class-based `setup_class` shared a single `driver` instance
  across all three test methods, meaning each test inherited DOM state
  from the previous test. Migrated tests are fully isolated (fresh
  context per test). If any test was implicitly depending on prior
  state, it will surface as a real failure here.
- `expect(modal).toBeHidden()` waits for the locator to be hidden OR
  detached. If the app fades the modal out with a transition, the
  default `expect` timeout should be enough; bump if the transition is
  long.

## Expected metrics
- Selector quality score: 6/6 role/label-based (was 0/8 xpath / css).
- Smell count delta: -7 `time.sleep`, -1 class-based inheritance, -2
  snapshot-list indexing, -3 non-web-first assertions, -1 `setup_class`
  driver wiring.
- LOC delta: 65 → 42 (-23 lines; dropping the class hierarchy and
  hidden state is the biggest saving).
