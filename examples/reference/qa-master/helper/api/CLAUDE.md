# api/ — rules

See [`/ARCHITECTURE.md`](../../ARCHITECTURE.md) §3.4, §7.

- One wrapper per endpoint (`{feature}.api.ts`) with typed functions over HTTP.
- **The only sanctioned way to prepare test data.** Never hand-roll `fetch`/`page.request` in a
  spec or page object; never prepare data by driving the UI.
- Prefer creating **unique, isolated** data per test (parallel-safe). Callable from tests,
  `actions/`, or setup helpers — never from a page object (browser-only).
