# utilities/ — rules

See [`/ARCHITECTURE.md`](../../ARCHITECTURE.md) §3.3.

- **Pure functions only** — no browser, no I/O. Primitives/plain objects in and out (so they're
  unit-testable without Playwright). Aim for full unit coverage.
- Verb-prefix names: `parse*`, `get*`, `calculate*`, `verify*`, `generate*`, `normalize*`.
- `logger.ts` lives here (the one allowed non-pure utility — the structured logger).
