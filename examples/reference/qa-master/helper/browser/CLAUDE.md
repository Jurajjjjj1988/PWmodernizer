# browser/ — rules

See [`/ARCHITECTURE.md`](../../ARCHITECTURE.md) §3.5.

- Functions that need a Playwright `Page` but aren't page objects (data-layer readers, locator
  builders, third-party network stubs reused across specs).
- Keep third-party `page.route` mocks here or in a fixture so they're declarative and reused.
