# page-object/ — rules

See [`/ARCHITECTURE.md`](../../ARCHITECTURE.md) §3.1, §5 for the full spec.

- **Pages** (`pages/`, `PageClass*` or `*Page`) extend `BasePage`; **blocks** (`blocks/`,
  `BlockClass*`) extend `BaseBlock`. **Neither declares a constructor** — the base wires `page`.
- Locators are `readonly` **class fields** referencing `this.page`, in UI order, each ending in
  a `.describe()` label. Static = eager field; parameterized = arrow-function field.
- Selector priority: `getByTestId` → `getByRole`/`getByLabel`/`getByText` → CSS → XPath.
- No API/HTTP here (browser only). No parsing (delegate to `utilities/`). Never end a method on
  `click()` — assert after. Navigation methods return the next page object.
- Blocks are eager fields on the owning page; extract a block at ~5+ locators / 3+ methods.
