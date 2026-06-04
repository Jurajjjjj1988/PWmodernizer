# playwright-mcp DOM grounding — integration brief

> Design doc for the v1.0 Risk-1 closure work: ground Stage 2 locator decisions in real DOM snapshots from the SUT instead of relying on pure mechanical translation from the source test. Status as of 2026-06-04: **not yet implemented**. This doc is the contract the implementation must satisfy.

Cross-references:
- [`ROADMAP.md`](../ROADMAP.md) — v1.0 "DOM grounding (Risk 1 closure)" section
- [`README.md`](../README.md) §"Selector hallucinations" — articulates the failure mode this work prevents
- [Microsoft playwright-mcp](https://github.com/microsoft/playwright-mcp) — upstream MCP server

---

## 1. Why

Currently Stage 2 emits locators by mechanical translation: `By.id("submit")` → `page.locator('#submit')`, `cy.contains("Save")` → `page.getByText('Save')`, etc. The translation is correct in form but cannot verify the target element actually exists in the SUT under that role/name. This is the **#1 failure mode** of the pipeline:

- The source test passed against some DOM at some point in history.
- The DOM may have drifted (role renamed, label moved into `aria-labelledby`, button replaced with `<a role="button">`).
- The generated locator compiles and lints clean, but selects the wrong element — or no element — at runtime.

DOM grounding replaces the mechanical guess with a verified observation: at generation time, the pipeline opens the SUT at `MIGRATION_TARGET_URL`, takes an accessibility snapshot, and confirms each proposed locator resolves to the expected element.

## 2. What playwright-mcp gives us

`@playwright/mcp` exposes a Model Context Protocol server that wraps a headless Playwright browser. Tool surface relevant to grounding:

| MCP tool | Returns | Use in pipeline |
|---|---|---|
| `browser_navigate` | nav result | open SUT at target URL |
| `browser_snapshot` | accessibility tree (YAML-ish) | structural ground truth for locator validation |
| `browser_console_messages` | console log entries | catch dead-code paths (404s on test setup) |
| `browser_find_element` | element ref + coords | one-shot probe for a specific locator candidate |

The accessibility snapshot is preferred over a raw DOM snapshot because it already collapses presentational noise and exposes the same role/name graph Playwright uses for `getByRole`. Direct correspondence: if a heading appears as `heading "Sign in"` in the snapshot, `page.getByRole('heading', { name: 'Sign in' })` resolves to it. If the snapshot has no such heading, the locator is hallucinated.

## 3. Integration shape

Two integration points in the pipeline:

### 3.1 Stage 1 (`plan.yml`) — optional DOM enrichment

When `MIGRATION_TARGET_URL` is set, before Sonnet generates the plan:

1. Spawn an ephemeral `npx @playwright/mcp` subprocess.
2. Drive it to `browser_navigate(MIGRATION_TARGET_URL)` then `browser_snapshot()`.
3. Persist the snapshot to `outputs/dom-snapshots/<input-basename>.yaml`.
4. Pass the snapshot path to Sonnet via the plan prompt's `{{include:_fragments/dom-snapshot.md}}` slot.
5. Sonnet's locator translation table can now annotate each row with **DOM evidence** column: `confirmed` / `not-found` / `ambiguous (n matches)`.

This is **opt-in** — pipelines without a live SUT continue to work, they just don't get the grounding.

### 3.2 Stage 2 (`migrate.yml`) — hard validation gate

After Sonnet emits the migrated tests but before the verify stage runs:

1. Parse the emitted `*.spec.ts` for every `page.getByRole(...)`, `page.getByLabel(...)`, `page.getByTestId(...)` call.
2. For each, re-query the live DOM via `browser_find_element` with the same arguments.
3. Three outcomes:
   - **Resolved uniquely** — HIGH confidence preserved or promoted from MED.
   - **Resolved to >1 element** — demote to MED and append a TODO comment with the disambiguation hint (e.g., parent role + accessible name).
   - **Did not resolve** — HARD FAIL: append `// WHY: DOM evidence absent at <timestamp> against <url>; reviewer must verify`, demote to LOW, AND fire a verify-stage START OVER signal.

### 3.3 LOW-confidence pin enforcement

ROADMAP currently lists this as ENCOURAGED (Tam et al. 2024 demotion). After grounding lands, LOW-confidence pins become **enforced**: every LOW locator that fails DOM probe must materialize its WHY-comment in the output. Verify stage already secret-scans the output; this gate piggybacks on that infrastructure.

## 4. API contract

The integration introduces one new helper script:

```
scripts/dom-ground.ts \
  --url $MIGRATION_TARGET_URL \
  --output outputs/dom-snapshots/<basename>.yaml \
  --probe outputs/tests/<basename>.spec.ts \
  --report outputs/reports/<basename>-dom-probe.json
```

Exit codes:
- `0` — every probed locator resolved uniquely (HIGH preserved)
- `1` — at least one locator failed (downstream stages read the report for demote/fail decisions)
- `2` — could not reach the SUT (network / wrong URL); pipeline falls back to no-grounding mode with a `dom-probe:unreachable` label on the PR

Report shape (one entry per probed locator):

```json
{
  "locator": "page.getByRole('button', { name: 'Submit' })",
  "file": "outputs/tests/login.spec.ts",
  "line": 42,
  "claimedConfidence": "high",
  "domVerdict": "resolved-unique" | "resolved-multiple" | "not-found",
  "domEvidence": "button \"Submit\" — role=button, accessible-name=Submit (from textContent)",
  "matches": 1,
  "demotedTo": null
}
```

## 5. Why not rely on the verify stage alone?

Verify stage (post-CANDOR) inspects the generated code statically. It cannot tell whether `getByRole('button', { name: 'Submit' })` resolves to an actual button — that requires browser execution. DOM grounding fills exactly this gap: it is the only point in the pipeline where runtime DOM evidence enters the loop.

## 6. Token budget concerns

The accessibility snapshot grows linearly with page complexity. For routes with infinite scroll or rich app shells, the snapshot can exceed 25K tokens. Mitigations (apply before passing to Sonnet):

- Strip MUI-internal `presentation` elements
- Collapse repeated list items past N=10 with `... (k more)` summary
- Drop nodes with no `name` attribute
- Per-route override list in `config/dom-grounding-routes.json` for known-large pages

If the post-strip snapshot still exceeds 20K tokens, fall back to ungrounded mode for that input and label the PR `dom-probe:oversized`.

## 7. Implementation order

1. [`scripts/dom-ground.ts`](../scripts/) skeleton + report shape + exit codes (no MCP call yet, just contract validation).
2. Wire MCP spawn + `browser_navigate` + `browser_snapshot` (smoke test against a known SUT).
3. Implement locator parser (reuse ts-morph from `ast-diff-trivial-check.ts` for the AST walk).
4. Implement `browser_find_element` probe loop.
5. Wire into `migrate.yml` as a step between Stage 2 and verify.
6. Wire optional Stage 1 enrichment.
7. Add calibration fixtures (3 good URLs with known accessible names + 3 bad URLs where Stage 2 hallucinated).

## 8. Open questions (resolve before implementation starts)

- **Auth**: how does the SUT authenticate for grounding? Likely needs a service-account token + a pre-grounding navigation script. Defer to per-input config.
- **State pollution**: should probing trigger real form submissions? No — `browser_find_element` is read-only by design. Only `browser_snapshot` + queries.
- **Snapshot caching**: same URL probed across multiple Stage 2 reruns. Cache `<url>+<dom-hash>` for 5 min to keep token cost down during rapid iteration.
- **Multi-page apps**: snapshot represents one route. Tests covering multiple routes need N snapshots. Either probe each one in sequence or run them in parallel via a `browser_*_n` MCP server pool.
