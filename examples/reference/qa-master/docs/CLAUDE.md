# CLAUDE.md

This repo's architecture is defined in [`ARCHITECTURE.md`](./ARCHITECTURE.md) — read it before
writing any test or infrastructure code. Each `helper/<layer>/` has its own `CLAUDE.md` with
layer-specific rules.

Non-negotiables:
- Import `test`/`expect` from `@fixtures/base.fixture`, never `@playwright/test`.
- Page objects and blocks declare **no constructor**; locators are `readonly` fields on
  `this.page`, each with a `.describe()` label.
- **Auto-waiting + built-in web-first assertions only** — no `waitForSelector`/`waitForTimeout`;
  reserve `expect(value).toBe(…)` for genuinely-parsed data.
- Tests are **deterministic, data-isolated, parallel-safe**. Prepare data via `api/` (never the
  UI); mock third-party deps via `page.route`.
- Each `test.step()` = one **action → expectation**. Exercise each UI path once; extract shared
  flows (API-first) into helpers.
- Path aliases only (`@page-object`, `@api`, `@fixtures`, …). Lint with
  `@typescript-eslint/no-floating-promises` + `eslint-plugin-playwright`.

Migration from `playwright-ui-tests`: see [`MIGRATION.md`](./MIGRATION.md).
