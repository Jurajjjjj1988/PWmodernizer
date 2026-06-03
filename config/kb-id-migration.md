# KB ID scheme migration — old `KB-N.N.N` → new `<fw>/<topic>/<name>`

> Reference document for the planned KB ID refactor. Read this before adding new entries to `config/knowledge-base.md` during Phase 2 (Cypress expansion) and Phase 3 (Selenium expansion). The validator (`scripts/kb-validate.ts`, gated in `.github/workflows/regression-test.yml`) enforces both formats during the transition window.

---

## 1. Why migrate

Current KB IDs (`KB-1.1.1`, `KB-1.2.5`, …) are hand-numbered. As the KB grows from 53 entries (Phase 1, Playwright + initial Cypress + Selenium stubs) to a projected ~300 entries across all phases:

- **Collision risk**: inserting a new entry between `1.2.7` and `1.2.8` requires renumbering everything below — and silently breaks every `KB-1.2.8`-and-later citation already merged in PRs.
- **No semantic hint**: `KB-1.3.7` tells the reader nothing without flipping to the KB. `sel/locator/find-elements-snapshot` is self-documenting at the citation site.
- **Cross-framework duplication invisible**: hard-waits exist in all four sections (`1.1.1`, `1.2.1`, `1.3.1`, `1.4.1`) — the numeric scheme hides the kinship. New scheme makes it grep-friendly (`grep '/timing/hard-wait'` finds the family).

Chosen scheme — **`<framework>/<topic>/<name>`**, kebab-case, ESLint-rule style:

- **Framework**: `pw` (Playwright, both bad-Playwright and Playwright-targeting), `cy` (Cypress source patterns), `sel` (Selenium WebDriver — Java + Python collapsed under one framework since the anti-patterns are language-agnostic).
- **Topic**: one of the controlled vocabulary below. Add new topics sparingly — prefer reusing an existing one even if the name is a slight stretch.
- **Name**: short kebab-case description of the specific anti-pattern.

Regex enforced by validator: `^(pw|cy|sel)/[a-z][a-z0-9-]*/[a-z][a-z0-9-]*$`.

### 1.1 Topic vocabulary (controlled)

- `timing` — hard waits, sleeps, page_source polling
- `wait` — explicit-wait ceremony (`WebDriverWait`, `implicitlyWait`)
- `selector` — locator strategy (nth, css-class, xpath positional, text ambiguity, dynamic concat)
- `action` — interaction primitives (`force: true`, JS-executor click, type-vs-fill, Actions API)
- `assertion` — one-shot vs web-first, equality vs role/name, URL/text checks
- `await` — missing `await` on async calls
- `debug` — `.only`, `.skip`, `pause()` leftovers
- `magic` — magic numbers, hardcoded URLs/viewports
- `structure` — assertion roulette, conditional-in-test, try/catch, ordering coupling
- `fixture` — custom commands, cy.task, cy.fixture, hand-rolled pytest fixtures, TestNG ordering, manual teardown, JSON fixture rot
- `network` — `cy.intercept` patterns, response stubbing

---

## 2. Migration mapping (53 entries)

Each old ID becomes a **deprecated alias** pointing at the new ID. The validator accepts both during the transition; PRs already merged with `KB-1.1.1` keep working. Phase-4 cleanup may eventually drop the aliases.

### 2.1 Bad-Playwright (was §1.1) — `pw/...`

| OLD ID    | NEW ID                          | Status                                    |
|-----------|---------------------------------|-------------------------------------------|
| KB-1.1.1  | `pw/timing/hard-wait`           | deprecated, alias for `pw/timing/hard-wait` |
| KB-1.1.2  | `pw/selector/nth`               | deprecated, alias for `pw/selector/nth`     |
| KB-1.1.3  | `pw/selector/css-class`         | deprecated, alias for `pw/selector/css-class` |
| KB-1.1.4  | `pw/action/force-true`          | deprecated, alias for `pw/action/force-true` |
| KB-1.1.5  | `pw/assertion/sync-probe`       | deprecated, alias for `pw/assertion/sync-probe` |
| KB-1.1.6  | `pw/await/missing-await`        | deprecated, alias for `pw/await/missing-await` |
| KB-1.1.7  | `pw/debug/page-pause`           | deprecated, alias for `pw/debug/page-pause` |
| KB-1.1.8  | `pw/debug/test-only`            | deprecated, alias for `pw/debug/test-only`  |
| KB-1.1.9  | `pw/magic/numbers`              | deprecated, alias for `pw/magic/numbers`    |
| KB-1.1.10 | `pw/structure/assertion-roulette` | deprecated, alias for `pw/structure/assertion-roulette` |
| KB-1.1.11 | `pw/structure/test-order-coupling` | deprecated, alias for `pw/structure/test-order-coupling` |
| KB-1.1.12 | `pw/structure/conditional-in-test` | deprecated, alias for `pw/structure/conditional-in-test` |
| KB-1.1.13 | `pw/structure/try-catch-swallow` | deprecated, alias for `pw/structure/try-catch-swallow` |

### 2.2 Cypress (was §1.2) — `cy/...`

| OLD ID    | NEW ID                          | Status                                    |
|-----------|---------------------------------|-------------------------------------------|
| KB-1.2.1  | `cy/timing/hard-wait`           | deprecated, alias for `cy/timing/hard-wait` |
| KB-1.2.2  | `cy/selector/eq-index`          | deprecated, alias for `cy/selector/eq-index` |
| KB-1.2.3  | `cy/selector/css-class`         | deprecated, alias for `cy/selector/css-class` |
| KB-1.2.4  | `cy/action/force-true`          | deprecated, alias for `cy/action/force-true` |
| KB-1.2.5  | `cy/fixture/custom-commands`    | deprecated, alias for `cy/fixture/custom-commands` |
| KB-1.2.6  | `cy/selector/contains-ambiguous` | deprecated, alias for `cy/selector/contains-ambiguous` |
| KB-1.2.7  | `cy/network/intercept-no-stub`  | deprecated, alias for `cy/network/intercept-no-stub` |
| KB-1.2.8  | `cy/debug/cy-pause`             | deprecated, alias for `cy/debug/cy-pause`   |
| KB-1.2.9  | `cy/debug/it-only`              | deprecated, alias for `cy/debug/it-only`    |
| KB-1.2.10 | `cy/structure/conditional-in-test` | deprecated, alias for `cy/structure/conditional-in-test` |
| KB-1.2.11 | `cy/assertion/then-chain-assert` | deprecated, alias for `cy/assertion/then-chain-assert` |
| KB-1.2.12 | `cy/fixture/json-rot`           | deprecated, alias for `cy/fixture/json-rot` |
| KB-1.2.13 | `cy/magic/viewport-per-test`    | deprecated, alias for `cy/magic/viewport-per-test` |
| KB-1.2.14 | `cy/fixture/cy-task-bypass`     | deprecated, alias for `cy/fixture/cy-task-bypass` |

### 2.3 Selenium WebDriver Java (was §1.3) — `sel/...`

Java + Python collapse into one `sel/` framework — the anti-patterns are semantically identical across language bindings. Both numeric IDs become aliases for the same new ID. (Suffix `-java` / `-python` is NOT introduced; the language-specific examples stay inline in the KB entry.)

| OLD ID    | NEW ID                          | Status                                    |
|-----------|---------------------------------|-------------------------------------------|
| KB-1.3.1  | `sel/timing/thread-sleep`       | deprecated, alias for `sel/timing/thread-sleep` |
| KB-1.3.2  | `sel/selector/xpath-positional` | deprecated, alias for `sel/selector/xpath-positional` |
| KB-1.3.3  | `sel/selector/css-class`        | deprecated, alias for `sel/selector/css-class` |
| KB-1.3.4  | `sel/wait/webdriverwait-boilerplate` | deprecated, alias for `sel/wait/webdriverwait-boilerplate` |
| KB-1.3.5  | `sel/structure/basepage-god-class` | deprecated, alias for `sel/structure/basepage-god-class` |
| KB-1.3.6  | `sel/action/actions-api`        | deprecated, alias for `sel/action/actions-api` |
| KB-1.3.7  | `sel/selector/find-elements-snapshot` | deprecated, alias for `sel/selector/find-elements-snapshot` |
| KB-1.3.8  | `sel/structure/try-catch-as-check` | deprecated, alias for `sel/structure/try-catch-as-check` |
| KB-1.3.9  | `sel/fixture/depends-on-methods` | deprecated, alias for `sel/fixture/depends-on-methods` |
| KB-1.3.10 | `sel/assertion/url-contains`    | deprecated, alias for `sel/assertion/url-contains` |
| KB-1.3.11 | `sel/wait/implicit-wait`        | deprecated, alias for `sel/wait/implicit-wait` |
| KB-1.3.12 | `sel/fixture/manual-teardown`   | deprecated, alias for `sel/fixture/manual-teardown` |
| KB-1.3.13 | `sel/action/js-executor-click`  | deprecated, alias for `sel/action/js-executor-click` |

### 2.4 Selenium WebDriver Python (was §1.4) — `sel/...`

Most map onto the same `sel/` IDs as §1.3 (cross-language equivalents). Python-only entries get their own kebab name.

| OLD ID    | NEW ID                          | Status                                    | Note |
|-----------|---------------------------------|-------------------------------------------|------|
| KB-1.4.1  | `sel/timing/thread-sleep`       | deprecated, alias for `sel/timing/thread-sleep` | merges with KB-1.3.1 |
| KB-1.4.2  | `sel/selector/xpath-positional` | deprecated, alias for `sel/selector/xpath-positional` | merges with KB-1.3.2 |
| KB-1.4.3  | `sel/selector/css-class`        | deprecated, alias for `sel/selector/css-class` | merges with KB-1.3.3 |
| KB-1.4.4  | `sel/wait/webdriverwait-boilerplate` | deprecated, alias for `sel/wait/webdriverwait-boilerplate` | merges with KB-1.3.4 |
| KB-1.4.5  | `sel/fixture/hand-rolled-driver` | deprecated, alias for `sel/fixture/hand-rolled-driver` | Python-only (pytest fixture sprawl) |
| KB-1.4.6  | `sel/assertion/page-source-in`  | deprecated, alias for `sel/assertion/page-source-in` | Python-only (`page_source` substring) |
| KB-1.4.7  | `sel/action/actions-api`        | deprecated, alias for `sel/action/actions-api` | merges with KB-1.3.6 |
| KB-1.4.8  | `sel/structure/try-catch-as-check` | deprecated, alias for `sel/structure/try-catch-as-check` | merges with KB-1.3.8 |
| KB-1.4.9  | `sel/debug/pytest-skip`         | deprecated, alias for `sel/debug/pytest-skip` | Python-only (`@pytest.mark.skip`) |
| KB-1.4.10 | `sel/selector/string-concat-xpath` | deprecated, alias for `sel/selector/string-concat-xpath` | Python-only (f-string XPath) |
| KB-1.4.11 | `sel/magic/timeout-constants`   | deprecated, alias for `sel/magic/timeout-constants` | partial dup of `sel/wait/implicit-wait` (KB-1.3.11) — keep separate; this is the "shared module constant" smell, not the implicit-wait smell |
| KB-1.4.12 | `sel/magic/hardcoded-url`       | deprecated, alias for `sel/magic/hardcoded-url` | Python-only example, but the smell is language-agnostic — Java code that hardcodes `driver.get("https://...")` falls under the same ID once KB grows |
| KB-1.4.13 | `sel/assertion/text-equality`   | deprecated, alias for `sel/assertion/text-equality` | Python-only (`el.text == "..."`) |

### 2.5 IDs that did NOT map cleanly to `framework/topic/name`

- **KB-1.4.11 (`Magic timeout constants`)** vs **KB-1.3.11 (`Hardcoded timeouts via implicitlyWait`)** — both touch "timeout values" but the underlying anti-patterns are different (one is a shared-module constant fan-out, the other is implicit-wait semantics drift). Kept as two IDs; topic differs (`magic` vs `wait`).
- **KB-1.3.5 (`BasePage god class`)** — sits under `structure` for now but is arguably its own topic (`pom-design`). Revisit during Phase 3 when more POM-related entries land.
- **KB-1.4.12 (`Hardcoded environment URL`)** — chose framework `sel` and topic `magic`, but the same smell appears in Cypress (`cy.visit('https://staging...')`) and bad-Playwright (`page.goto('https://...')`). Phase-2 expansion should add `cy/magic/hardcoded-url` and `pw/magic/hardcoded-url`. The current single-framework ID is fine — cross-framework smells get one entry per source language, not a synthetic merged ID.

---

## 3. Concrete migration steps

### 3.1 Now (this PR, Phase 1.5)

1. Land `scripts/kb-validate.ts` and the `KB IDs valid + referenced` CI step. ✅ in this PR.
2. Land this doc (`config/kb-id-migration.md`). ✅ in this PR.
3. **Do NOT** modify `config/knowledge-base.md` headers yet. Existing PR citations using `KB-N.N.N` continue to work; validator passes because old format is still accepted.

### 3.2 Phase 2 (Cypress KB expansion, target ~80 new entries)

1. **Open a dedicated refactor PR** that rewrites all 53 §1.x headers in `knowledge-base.md` from `#### 1.1.1 Hard waits via …` to `#### [pw/timing/hard-wait] Hard waits via …` (square brackets so the header parser regex `HEADER_NEW_FORMAT` matches).
2. For each renamed entry, append an `> **Deprecated alias**: KB-1.1.1` line directly under the new header. Validator regex `HEADER_OLD_FORMAT` still picks up these aliases (they live inside fenced text but begin with `####` — adjust validator if alias format collides; current design uses a `> ` blockquote which won't match `####`).
3. Update `config/migration-rules.md` table examples to cite new IDs (`pw/timing/hard-wait`) instead of `KB-1.1.1`.
4. Update `prompts/analyze.md` and `prompts/generate.md` to use new format in examples.
5. **Do NOT** find-replace `KB-N.N.N` citations in existing example plans (`examples/*/expected-plan.md`) — they document a snapshot of the older scheme. New examples added in Phase 2 use new format.
6. Add new Cypress entries with new format only. Phase 2 contributors don't see numeric IDs at all.

### 3.3 Phase 3 (Selenium KB expansion, target ~150 new entries)

1. Same pattern as Phase 2 — new entries use `sel/...` namespace only.
2. **Consolidate cross-language Selenium duplicates**: where §1.3 and §1.4 have the same conceptual smell (e.g., KB-1.3.1 + KB-1.4.1 → `sel/timing/thread-sleep`), merge into ONE entry with both Java and Python code blocks side by side. The old IDs become aliases of the same merged ID.
3. Audit `config/kb-id-migration.md` (this file) — append a §2.6 "Phase-3 additions" table if new topic vocabulary is introduced.

### 3.4 Phase 4 (cleanup, optional)

1. After two release cycles with no merged PR citing an old `KB-N.N.N` ID (`gh search prs --merged --json title,body | grep KB- | head` audit), drop the deprecated-alias lines from KB.
2. Remove old-format regex from `scripts/kb-validate.ts`. New format becomes the only accepted format.
3. Bump validator version comment.

---

## 4. Open questions

- **Sub-framework split?** Considered `pw-bad/` vs `pw-good/` (the §1.1 entries are bad-Playwright, not the target-Playwright clean style). Rejected — every KB entry has a "ANTI-PATTERN" / "CANONICAL" pair, the bad-vs-clean distinction lives at the example level. Framework prefix tracks the SOURCE language only.
- **Cypress component testing**? Out of scope for now. If added, `cyct/` could be a new framework prefix, or stay under `cy/` with `topic=component`.
- **Severity in ID?** Considered `pw/H/timing/hard-wait`. Rejected — severity lives in the citation table (`migration-rules.md §7.2`), not the ID. ESLint doesn't bake severity into rule names either.
