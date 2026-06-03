# Migration plan: input.spec.ts (Selenium Python -> Playwright TypeScript)

## Source framework
selenium-python

## Summary
Keystone Admin invite-user modal. Three scenarios on `/users`: opening the
modal via the Invite button and closing via the modal's close button;
closing the modal via the Escape key; and inline email validation
inside the modal when the user submits with a malformed address.

## Anti-patterns detected

Sorted by Severity (H, M, L), then by Line.

| Severity | Line | KB-ID | Anti-pattern | Snippet (≤60 chars) | Replacement |
|---|---|---|---|---|---|
| H | 9-17 | KB-1.4.14 | class-based-setup-class | `BaseTest.setup_class { cls.driver = Chrome() }` | `page` fixture (per-test fresh context) |
| H | 23,27,33,41,44,51,58 | KB-1.4.1 | hard-wait | `time.sleep(1)` | web-first `toBeVisible()` / `toBeHidden()` |
| H | 26,40,51 | KB-1.4.2 | xpath-deep | `//main//button[contains(.,'Invite')]` | `getByRole('button', { name: 'Invite' })` |
| H | 32 | KB-1.4.2 | xpath-positional | `//div[contains(@class,'modal')]//button[3]` | `modal.getByRole('button', { name: 'Close' })` |
| H | 45 | KB-1.4.15 | escape-via-body-send-keys | `body.send_keys(Keys.ESCAPE)` | `page.keyboard.press('Escape')` |
| M | 29 | KB-1.4.3 | css-deep-path | `div.modal-overlay > div.modal` | `page.getByRole('dialog', { name: 'Invite a new user' })` |
| M | 30 | KB-1.4.6 | non-web-first-text-contains | `assert "Invite a new user" in modal.text` | `await expect(modal).toBeVisible()` |
| M | 37,47 | KB-1.4.17 | snapshot-list-count | `assert len(overlays) == 0` | `await expect(modal).toBeHidden()` |
| M | 54,57 | KB-1.4.17 | snapshot-list-indexing | `find_elements(...)[0]`, `find_elements(...)[1]` | `modal.getByLabel('Email')`, `modal.getByRole('button', { name: 'Send invite' })` |
| M | 62 | KB-1.4.13 | non-web-first-text-equality | `assert error.text == "Please enter a valid email"` | `await expect(modal.getByText('Please enter a valid email')).toBeVisible()` |
| L | 61 | KB-1.4.3 | css-class-selector | `.modal .field-error` | `getByText('Please enter a valid email')` |

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

## Hallucination-defense pins

1. **Invite modal (dialog root)** — assumed `page.getByRole('dialog', { name: 'Invite a new user' })`. If the modal is a styled `<div>` without `role="dialog"` / `aria-label`: keep `By.CSS_SELECTOR, "div.modal-overlay > div.modal"` → `page.locator('div.modal-overlay > div.modal')`, add WHY-comment `'Q-dialog unresolved: dialog role and accessible name'`. Reviewer fallback: ask FE team to add `role="dialog"` + `aria-labelledby` to the modal title, OR use `page.getByTestId('invite-modal')`.
2. **Modal close button** — assumed `modal.getByRole('button', { name: 'Close' })`. The original picks the 3rd modal button positionally — best guess is the X icon. If the button copy is actually "Cancel" or has no accessible name: keep positional `//div[contains(@class,'modal')]//button[3]` (degraded), add WHY-comment `'Q-close unresolved: 3rd modal button identity'`. Reviewer fallback: confirm the X-icon button's `aria-label` ("Close" vs "Cancel") via DOM, OR ask FE team to set `aria-label="Close"` on the icon button.
3. **Modal email input** — assumed `modal.getByLabel('Email')`. The original picks `find_elements(...)[0]` positionally; the migration assumes the first input is the Email field and that it has a `<label>`. If the input lacks a label: keep positional `.modal input` first-of-type, add WHY-comment `'Q-modal-email unresolved: label association on first input'`. Reviewer fallback: ask FE team to associate `<label for="invite-email">Email</label>`, OR use `modal.getByPlaceholder('Email')`.
4. **Send invite button** — assumed `modal.getByRole('button', { name: 'Send invite' })`. The original picks the 2nd modal button positionally — best guess is the primary action. If the button copy is "Invite" or "Submit": keep positional `.modal button` second-of-type, add WHY-comment `'Q-send-invite unresolved: 2nd modal button copy'`. Reviewer fallback: confirm the exact button text via DOM and rename accordingly, OR add `data-testid="send-invite"` and switch to `modal.getByTestId('send-invite')`.

## Structural changes
- Extract POM: no — three small modal scenarios; inline reads cleanly.
- Extract fixture: PARTIAL — the `beforeEach` opens the modal because
  all three tests start with it open. (The original spec duplicated the
  Invite-click in each test.)
- Split into multiple specs: no — single feature (invite modal).

## Open questions for reviewer
- **Q-dialog**: Is the modal actually a `role="dialog"` element with an accessible name? If not, the `getByRole('dialog', { name: 'Invite a new user' })` strategy fails — switch to `getByTestId('invite-modal')`.
- **Q-close**: The original spec picks the 3rd button in the modal as the close button (`button[3]`). Visually we suspect this is the X icon button. Reviewer should confirm via DOM; if not, name it correctly (`getByRole('button', { name: 'Cancel' })` etc.).
- **Q-send-invite**: Same for the 2nd button as "Send invite" — confirm the actual button copy.
- **Q-modal-email**: Does the email input in the modal have an associated `<label>` element? Plan assumes `getByLabel('Email')`; without a label, switch to `getByPlaceholder('Email')` or `getByTestId`.
- The invalid-email scenario only enters the email and clicks send. Does the modal have an additional required field (name, role)? If yes, the test may need to fill those to isolate the email-specific error.

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
