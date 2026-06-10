# actions/ — rules

See [`/ARCHITECTURE.md`](../../ARCHITECTURE.md) §3.2, §7.

- Cross-page (vertical) flows that **compose page objects**. Create one when 2+ page objects are
  involved or a flow is shared setup across files.
- Signature: destructure `{ page, ...params }`. Return the final page object when the caller
  continues; `void` for terminal steps.
- Single-page logic stays on the page object, not here. Shared UI flows live here; shared **data**
  setup lives in `api/`. Write a flow once, reuse it — never re-drive a UI path.
