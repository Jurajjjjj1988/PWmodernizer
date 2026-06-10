# test-data/ — rules

See [`/ARCHITECTURE.md`](../../ARCHITECTURE.md) §3.6.

- **Constants only** — URLs, ids, cookies, ticket-system suites. No logic (that goes in
  `utilities/`).
- Sensitive values come from `process.env` (add a placeholder to `.env.example`); never hardcode.
- `urls.ts` selects the environment from `IS_PRODUCTION`.
