# Migration plan: input.spec.ts

## Source framework
cypress

## Summary
New-employee form validation in Beacon HR. Three scenarios: empty-form
submit shows per-field required errors; submit with an invalid email shows
only the email error; once a valid email is typed and the field blurs, the
error disappears.

## Anti-patterns detected
- [x] deep CSS positional selectors (`div.form-section:nth-child(1) > .field
      > .error`, `.field:nth-child(3) .error`) — break the moment a section
      reorders.
- [x] `cy.contains(text)` for both buttons and validation messages —
      ambiguous: should be role-based for the button, text-based for the
      message (the message is decorative copy without a role).
- [x] `cy.wait(500)` (line 28) arbitrary wait.
- [x] `cy.viewport('macbook-15')` per-test (line 5) — set via project
      config; per-test only when the test specifically exercises responsive
      behaviour.
- [x] `cy.intercept('POST', '/api/employees')` set up without an alias and
      never `cy.wait('@...')`-ed (line 6) — dead code; remove.
- [x] chai chaining `.its('length').should('eq', 1)` — does not translate
      directly; use `toHaveCount`.
- [x] mixed selector strategies — some inputs use `data-cy`, others use
      `input[name="..."]`. Standardise to `getByLabel`.
- [x] blur-by-clicking-another-field (line 41) — works but is implicit;
      `field.focus()` on a sibling makes the intent clearer.

## Locator translation table
| Original | New | Confidence | Notes |
|---|---|---|---|
| `cy.contains('Save')` | `page.getByRole('button', { name: 'Save' })` | high | Save submit button. |
| `cy.get('[data-cy="firstName"]')` | `page.getByLabel('First name')` | medium | Assumes an associated `<label>`. If the team prefers their `data-cy` convention, `getByTestId('firstName')` is also acceptable — flag as reviewer choice. |
| `cy.get('[data-cy="lastName"]')` | `page.getByLabel('Last name')` | medium | Same as above. |
| `cy.get('[data-cy="email"]')` | `page.getByLabel('Email')` | medium | Same as above. |
| `cy.get('input[name="startDate"]')` | `page.getByLabel('Start date')` | medium | Same as above. |
| `cy.get('div.form-section:nth-child(1) > .field > .error')` | `page.getByText('First name is required')` | high | The visible error text is the user-facing thing being asserted; the structural CSS path is incidental. |
| `cy.get('.field:nth-child(3) .error')` | `page.getByText('Start date is required')` | high | Same — assert the visible message, not the DOM structure. |
| `cy.contains('Enter a valid email')` | `page.getByText('Enter a valid email')` | high | Validation message — `getByText` is appropriate (no interactive role). |
| `cy.get('.form-section .field.is-invalid')` | `page.getByText(/is required/)` (count assertion) | medium | The original asserts there is exactly 1 invalid field; the migrated test asserts there are 0 "required" messages alongside the email error. Reviewer should confirm this matches intent — slightly different semantics. |

## Structural changes
- Extract POM: no — three small tests in one feature.
- Extract fixture: no — only a `goto` is shared.
- Split into multiple specs: no — all three tests target the same form.

## Open questions for reviewer
- The team uses a `data-cy` convention for some inputs. Migrate to
  `getByLabel` (preferred 2026 default) or honour the existing convention
  with `getByTestId`? Defaulting to `getByLabel` because most inputs in the
  source already have visible labels; raise this in review.
- The original spec asserts there is exactly ONE invalid field after a
  bad-email submit; the migrated test asserts there are ZERO required-
  field messages alongside the email error. Functionally equivalent, but
  worth confirming intent.
- Does the form submit button enable / disable based on field state, or
  is it always enabled and only errors appear on submit? The migrated
  test assumes the latter.

## Risk callouts
- Blur-trigger semantics: the original uses `cy.click()` on another field
  to trigger blur. Playwright's `.focus()` on a sibling element triggers
  blur on the previously-focused element. If the app validates on
  `change` rather than `blur`, neither approach will fire validation —
  reviewer should verify the form's validation trigger.
- `getByText(/is required/)` matches ANY required message anywhere on
  the page. If the page has a global "Required fields are marked with *"
  helper text containing the word "required", this assertion will give a
  false positive. Switch to a more specific count if so.

## Expected metrics
- Selector quality score: 6/6 role/label-based (was 2/8 `data-cy` + 6/8
  deep CSS).
- Smell count delta: -1 hard-wait, -1 viewport, -1 dead intercept, -3
  deep-CSS, -1 chai chaining.
- LOC delta: 43 → 41 (-2 lines).
