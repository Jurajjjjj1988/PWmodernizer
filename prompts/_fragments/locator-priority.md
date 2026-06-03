Apply in this order, use the highest-priority option that fits the plan:

1. `page.getByRole(...)` with accessible name — buttons, links, headings, form controls, dialogs.
2. `page.getByLabel(...)` — form fields. Reads exactly as the label the user sees.
3. `page.getByPlaceholder(...)` — when no label is rendered (search bars, single-input forms).
4. `page.getByText(...)` — clickable visible labels. Prefer `{ exact: true }` for asserts; `false` when locating clickables by visible label.
5. `page.getByTestId(...)` — only if the app already exposes test IDs. Do NOT invent test IDs in migration output (out of scope).
6. `page.locator(<css>)` — only when no higher-priority option exists. Inline comment required explaining why role/label/text failed.
7. `page.locator("xpath=...")` — last resort. Attach a `// TODO: add testid` comment.

Forbidden as primary strategy: `nth()`, `:nth-child`, array indexing into locator collections. If the plan truly requires `.nth(N)`, emit it with a `// TODO: fragile selector — add testid` comment.

Canonical source: `config/migration-rules.md` §5.
