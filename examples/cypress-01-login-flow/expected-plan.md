# Migration plan: input.spec.ts

## Source framework
cypress

## Summary
Beacon HR login page. Two scenarios: a valid credential pair lands the user
on `/dashboard` with a populated team table; and the Sign-in button must
stay disabled until both email and password fields are non-empty.

## Anti-patterns detected
- [x] `cy.wait(1000)` / `cy.wait(2000)` arbitrary waits (lines 9, 18) —
      replace with web-first assertions (`toHaveURL`, `toBeVisible`).
- [x] `cy.wait('@loginReq')` (line 17) — in Cypress this synchronises with
      the network response; Playwright's web-first assertions on the
      dashboard URL / greeting do the same job, so the intercept alias
      can be dropped.
- [x] brittle deep CSS (`div.auth-card form input[type="email"]`,
      `.greeting > span`, `.team-table tbody tr`) — replace with
      `getByLabel` / `getByRole`.
- [x] `cy.contains('Sign in')` for an interactive button — should be a
      role-based locator that distinguishes button from heading.
- [x] `cy.viewport(1440, 900)` per-test (line 6) — Playwright sets
      viewport via project config; do not set per-test unless the test
      specifically exercises responsive behaviour.
- [x] custom command `cy.loginAs('hr-admin')` (line 26) hides clears /
      types / waits — for an isolated edge-case test, the steps should be
      visible inline. (For multi-spec reuse, replace with a fixture, not a
      hidden command.)
- [x] Chai chaining `its('length').should('be.gte', 1)` (line 22) — does
      not translate directly; rewritten as a row-count assertion.
- [x] class-based assertion `should('have.class', 'is-disabled')` — fragile
      and styling-coupled; should assert the semantic disabled state via
      `toBeDisabled()`.

## Locator translation table
| Original | New | Confidence | Notes |
|---|---|---|---|
| `cy.get('div.auth-card form input[type="email"]')` | `page.getByLabel('Email')` | medium | Assumes the email input has a `<label>`. If not, `getByRole('textbox', { name: 'Email' })`. |
| `cy.get('div.auth-card form input[type="password"]')` | `page.getByLabel('Password')` | medium | Same assumption as Email. |
| `cy.contains('Sign in')` | `page.getByRole('button', { name: 'Sign in' })` | high | Button has visible "Sign in" text. |
| `cy.get('button[type="submit"]')` | `page.getByRole('button', { name: 'Sign in' })` | high | Same button — re-use rather than introduce a second locator. |
| `cy.get('input[name="password"]')` | `page.getByLabel('Password')` | high | Same input as the password field. |
| `cy.get('.greeting > span')` | `page.getByRole('heading', { name: /welcome/i })` | medium | Assumes greeting is a heading. If just styled `<span>`, fall back to `page.getByText(/welcome/i)`. |
| `cy.get('.team-table tbody tr')` | `page.getByRole('row')` | medium | Assumes table uses semantic `<table>` markup. If it is a div-table, fall back to `getByTestId('team-row')`. |

## Structural changes
- Extract POM: no — only two tests in one feature, both share the same
  `beforeEach`. POM would be overkill.
- Extract fixture: no — `beforeEach` only does a `goto`.
- Split into multiple specs: no.

## Open questions for reviewer
- The Cypress test asserts that the team table has at least 1 row
  (`its('length').should('be.gte', 1)`). The migrated test uses
  `not.toHaveCount(1)` (rough proxy: rejecting only the header row). If
  the team-table includes a header row in the row count, the assertion is
  correct; if not, use `expect(rows).not.toHaveCount(0)` instead.
- The Cypress test uses `cy.loginAs('hr-admin')` — what does that custom
  command actually do? If it sets `localStorage` or auth cookies to
  pre-authenticate, the migrated edge-case test should use a
  `storageState` fixture instead of typing credentials. For v0 we mirror
  the explicit-typing behaviour.
- Does the disabled button render as `<button disabled>` or just CSS-
  styled? `toBeDisabled()` only matches the semantic state. If the app
  styles disabled visually without the attribute, this is an a11y bug
  worth filing — but the assertion will need to switch.

## Risk callouts
- The Cypress test waits for the `loginReq` intercept before asserting on
  the dashboard. The migrated test relies on the URL change as the sync
  point. If the app navigates BEFORE the API response settles (optimistic
  redirect), the migrated test could race the API failure path. Suggest
  reviewer confirms the navigation timing.

## Expected metrics
- Selector quality score: 5/5 role/label-based (was 0/7 CSS-based).
- Smell count delta: -2 hard-waits, -1 viewport-per-test, -1 custom-
  command, -1 chai chaining, -1 class-based assertion.
- LOC delta: 31 → 35 (+4 lines; gain readability of the edge-case test
  by inlining what the custom command was hiding).
