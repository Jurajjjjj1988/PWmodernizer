# fixtures/ — rules

See [`/ARCHITECTURE.md`](../../ARCHITECTURE.md) §3.7.

- `base.fixture.ts` is the **only** file that imports `test` from `@playwright/test`. Every spec
  imports `test`/`expect` from `@fixtures/base.fixture`.
- Inject page/block objects here; also inject cookies/feature flags and auto-logging.
- Auth is reused via `storageState` (setup project), not re-driven through the UI per test.
- `staging.fixture.ts` extends base and auto-skips on production.
