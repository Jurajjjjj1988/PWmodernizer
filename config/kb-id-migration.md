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
| KB-1.1.14 | `pw/config/hardcoded-url` | deprecated, alias for `pw/config/hardcoded-url` (added 2026-06-03 after Phase 1 audit) |
| KB-1.1.15 | `pw/structure/unnecessary-describe-nesting` | deprecated, alias for `pw/structure/unnecessary-describe-nesting` (added 2026-06-03 after Phase 1 audit) |
| KB-1.1.16 | `pw/timing/network-idle-universal-wait` | deprecated, alias for `pw/timing/network-idle-universal-wait` (added 2026-06-04 — `waitForLoadState('networkidle')` couples to third-party noise) |
| KB-1.1.17 | `pw/selector/raw-xpath` | deprecated, alias for `pw/selector/raw-xpath` (added 2026-06-04 — `xpath=` survives Selenium translator) |
| KB-1.1.18 | `pw/assertion/all-snapshot-iteration` | deprecated, alias for `pw/assertion/all-snapshot-iteration` (added 2026-06-04 — `.all()` snapshots before list renders) |
| KB-1.1.19 | `pw/assertion/inner-text-string-compare` | deprecated, alias for `pw/assertion/inner-text-string-compare` (added 2026-06-04 — `innerText()` then `toBe` bypasses web-first) |
| KB-1.1.20 | `pw/assertion/state-probe-sync` | deprecated, alias for `pw/assertion/state-probe-sync` (added 2026-06-04 — `isChecked()`/`isEnabled()`/`isEditable()` one-shot probes) |
| KB-1.1.21 | `pw/fixture/manual-context-clear` | deprecated, alias for `pw/fixture/manual-context-clear` (added 2026-06-04 — `clearCookies`/`clearPermissions` ceremony in `beforeEach`) |
| KB-1.1.22 | `pw/config/serial-mode-state-workaround` | deprecated, alias for `pw/config/serial-mode-state-workaround` (added 2026-06-04 — `describe.configure({ mode: 'serial' })` hides shared-state bugs) |
| KB-1.1.23 | `pw/debug/console-listener-leak` | deprecated, alias for `pw/debug/console-listener-leak` (added 2026-06-04 — `page.on('console', ...)` log noise without assertion) |
| KB-1.1.24 | `pw/debug/screenshot-leak` | deprecated, alias for `pw/debug/screenshot-leak` (added 2026-06-04 — `page.screenshot({ path })` debug artifact in committed test) |
| KB-1.1.25 | `pw/timing/short-hard-wait` | deprecated, alias for `pw/timing/short-hard-wait` (added 2026-06-04 — `waitForTimeout(100)` rationalized as non-hard-wait) |

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
| KB-1.2.15 | `cy/fixture/session-no-cache-bust` | deprecated, alias for `cy/fixture/session-no-cache-bust` (added 2026-06-04 — `cy.session()` without invalidation) |
| KB-1.2.16 | `cy/assertion/internals-leak`   | deprecated, alias for `cy/assertion/internals-leak` (added 2026-06-04 — reaching into framework store) |
| KB-1.2.17 | `cy/fixture/spy-stub-leak`      | deprecated, alias for `cy/fixture/spy-stub-leak` (added 2026-06-04 — `cy.spy`/`cy.stub` across tests) |
| KB-1.2.18 | `cy/assertion/stale-snapshot`   | deprecated, alias for `cy/assertion/stale-snapshot` (added 2026-06-04 — `cy.then` sync/async mix) |
| KB-1.2.19 | `cy/fixture/commands-overwrite` | deprecated, alias for `cy/fixture/commands-overwrite` (added 2026-06-04 — `Cypress.Commands.overwrite`) |
| KB-1.2.20 | `cy/assertion/premature-absence` | deprecated, alias for `cy/assertion/premature-absence` (added 2026-06-04 — `should('not.exist')` race) |
| KB-1.2.21 | `cy/selector/chained-get-unscoped` | deprecated, alias for `cy/selector/chained-get-unscoped` (added 2026-06-04 — chained cy.get re-queries document) |
| KB-1.2.22 | `cy/selector/contains-whitespace` | deprecated, alias for `cy/selector/contains-whitespace` (added 2026-06-04 — designer trailing space) |
| KB-1.2.23 | `cy/selector/data-cy-unquoted` | deprecated, alias for `cy/selector/data-cy-unquoted` (added 2026-06-04 — data-cy attribute typo silent failure) |
| KB-1.2.24 | `cy/selector/jquery-pseudo` | deprecated, alias for `cy/selector/jquery-pseudo` (added 2026-06-04 — `:contains():eq()` escape hatch) |
| KB-1.2.25 | `cy/selector/css-id-over-role` | deprecated, alias for `cy/selector/css-id-over-role` (added 2026-06-04 — framework-generated IDs churn) |
| KB-1.2.26 | `cy/action/double-click-retry` | deprecated, alias for `cy/action/double-click-retry` (added 2026-06-04 — masks actionability bug) |
| KB-1.2.27 | `cy/timing/type-keystroke-delay` | deprecated, alias for `cy/timing/type-keystroke-delay` (added 2026-06-04 — sympathetic-magic delay) |
| KB-1.2.28 | `cy/action/check-no-verify` | deprecated, alias for `cy/action/check-no-verify` (added 2026-06-04 — idempotent no-op masks state) |
| KB-1.2.29 | `cy/action/select-by-index` | deprecated, alias for `cy/action/select-by-index` (added 2026-06-04 — ordinal data drift) |
| KB-1.2.30 | `cy/action/clear-then-type` | deprecated, alias for `cy/action/clear-then-type` (added 2026-06-04 — React onChange race) |
| KB-1.2.31 | `cy/assertion/chained-should-stale` | deprecated, alias for `cy/assertion/chained-should-stale` (added 2026-06-04 — re-render between chain links) |
| KB-1.2.32 | `cy/assertion/url-full-equality` | deprecated, alias for `cy/assertion/url-full-equality` (added 2026-06-04 — env coupling) |
| KB-1.2.33 | `cy/selector/contains-broad-match` | deprecated, alias for `cy/selector/contains-broad-match` (added 2026-06-04 — unanchored substring) |
| KB-1.2.34 | `cy/assertion/jquery-attr-sync` | deprecated, alias for `cy/assertion/jquery-attr-sync` (added 2026-06-04 — `$el.attr` no retry) |
| KB-1.2.35 | `cy/assertion/text-exact-whitespace` | deprecated, alias for `cy/assertion/text-exact-whitespace` (added 2026-06-04 — `have.text` trim sensitivity) |
| KB-1.2.36 | `cy/timing/wait-alias-no-timeout` | deprecated, alias for `cy/timing/wait-alias-no-timeout` (added 2026-06-04 — implicit 5s default flake) |
| KB-1.2.37 | `cy/timing/wait-alias-array-order` | deprecated, alias for `cy/timing/wait-alias-array-order` (added 2026-06-04 — version-drift ordering) |
| KB-1.2.38 | `cy/fixture/health-poll-per-test` | deprecated, alias for `cy/fixture/health-poll-per-test` (added 2026-06-04 — global-setup belongs once) |
| KB-1.2.39 | `cy/network/intercept-no-alias` | deprecated, alias for `cy/network/intercept-no-alias` (added 2026-06-04 — no sync point) |
| KB-1.2.40 | `cy/network/intercept-times-coupling` | deprecated, alias for `cy/network/intercept-times-coupling` (added 2026-06-04 — count limit retry brittleness) |
| KB-1.2.41 | `cy/network/origin-ceremony` | deprecated, alias for `cy/network/origin-ceremony` (added 2026-06-04 — Playwright follows cross-origin natively) |
| KB-1.2.42 | `cy/network/request-fail-on-status` | deprecated, alias for `cy/network/request-fail-on-status` (added 2026-06-04 — implicit non-2xx throw) |
| KB-1.2.43 | `cy/fixture/alias-cross-describe-leak` | deprecated, alias for `cy/fixture/alias-cross-describe-leak` (added 2026-06-04 — singleton scope leak) |
| KB-1.2.44 | `cy/fixture/before-each-shared-state` | deprecated, alias for `cy/fixture/before-each-shared-state` (added 2026-06-04 — module-scope mutation) |
| KB-1.2.45 | `cy/fixture/manual-cleanup-ceremony` | deprecated, alias for `cy/fixture/manual-cleanup-ceremony` (added 2026-06-04 — clearCookies in beforeEach) |
| KB-1.2.46 | `cy/debug/describe-skip-orphan` | deprecated, alias for `cy/debug/describe-skip-orphan` (added 2026-06-04 — untraced skip rot) |
| KB-1.2.47 | `cy/structure/mixed-async-semantics` | deprecated, alias for `cy/structure/mixed-async-semantics` (added 2026-06-04 — cy.then + Promise.all) |
| KB-1.2.48 | `cy/structure/describe-nesting-deep` | deprecated, alias for `cy/structure/describe-nesting-deep` (added 2026-06-04 — readability fragmentation) |
| KB-1.2.49 | `cy/magic/hardcoded-test-data` | deprecated, alias for `cy/magic/hardcoded-test-data` (added 2026-06-04 — parallel-worker collision) |
| KB-1.2.50 | `cy/debug/cy-log-leftover` | deprecated, alias for `cy/debug/cy-log-leftover` (added 2026-06-04 — CI log noise; prefer test.step) |

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
| KB-1.3.14 | `sel/fixture/page-factory-eager-init` | deprecated, alias for `sel/fixture/page-factory-eager-init` (added 2026-06-04 — PageFactory `@FindBy` + `initElements` couples lifecycle to eager-init + stale-element risk) |
| KB-1.3.15 | `sel/wait/expected-conditions-ceremony` | deprecated, alias for `sel/wait/expected-conditions-ceremony` (added 2026-06-04 — `ExpectedConditions.visibilityOf(...)` boilerplate per wait) |
| KB-1.3.16 | `sel/fixture/thread-local-driver` | deprecated, alias for `sel/fixture/thread-local-driver` (added 2026-06-04 — `ThreadLocal<WebDriver>` parallel-runner accommodation, manual lifecycle) |
| KB-1.3.17 | `sel/frame/index-switch` | deprecated, alias for `sel/frame/index-switch` (added 2026-06-04 — `frame(0)` index-based race) |
| KB-1.3.18 | `sel/alert/race-unprotected` | deprecated, alias for `sel/alert/race-unprotected` (added 2026-06-04 — `switchTo().alert()` without registered handler) |
| KB-1.3.19 | `sel/selector/link-text-exact` | deprecated, alias for `sel/selector/link-text-exact` (added 2026-06-04 — `By.linkText` brittle on copy drift) |
| KB-1.3.20 | `sel/magic/viewport-in-test` | deprecated, alias for `sel/magic/viewport-in-test` (added 2026-06-04 — `setSize` per-test resolution coupling) |
| KB-1.3.21 | `sel/fixture/browser-flags-in-test` | deprecated, alias for `sel/fixture/browser-flags-in-test` (added 2026-06-04 — `ChromeOptions.addArguments` sprawl) |
| KB-1.3.22 | `sel/assertion/css-value-coupling` | deprecated, alias for `sel/assertion/css-value-coupling` (added 2026-06-04 — `getCssValue` browser-render drift) |
| KB-1.3.23 | `sel/assertion/auth-cookie-inspect` | deprecated, alias for `sel/assertion/auth-cookie-inspect` (added 2026-06-04 — cookie inspection couples to auth scheme) |
| KB-1.3.24 | `sel/action/js-scroll-into-view` | deprecated, alias for `sel/action/js-scroll-into-view` (added 2026-06-04 — JS scroll bypasses actionability) |

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
| KB-1.4.14 | `sel/fixture/class-scope-driver` | deprecated, alias for `sel/fixture/class-scope-driver` | Python-only (`setup_class`/`teardown_class` shares one driver across methods — coupling siblings) |
| KB-1.4.15 | `sel/action/body-send-keys` | deprecated, alias for `sel/action/body-send-keys` | Python-only (`body.send_keys(Keys.ESCAPE)` keyboard escape hatch — couples to focus state) |
| KB-1.4.16 | `sel/wait/implicit-wait` | deprecated, alias for `sel/wait/implicit-wait` | merges with KB-1.3.11 (`driver.implicitly_wait(N)` global timeout, Python binding) |
| KB-1.4.17 | `sel/selector/find-elements-snapshot` | deprecated, alias for `sel/selector/find-elements-snapshot` | merges with KB-1.3.7 (`find_elements(...)[i]` Python-binding snapshot-list indexing) |
| KB-1.4.18 | `sel/assertion/js-runtime-probe` | deprecated, alias for `sel/assertion/js-runtime-probe` (added 2026-06-04 — `execute_script("return ...")` bypasses visible state) |
| KB-1.4.19 | `sel/fixture/session-scope-driver` | deprecated, alias for `sel/fixture/session-scope-driver` (added 2026-06-04 — pytest `scope="session"` driver fixture) |
| KB-1.4.20 | `sel/fixture/webdriver-manager-network` | deprecated, alias for `sel/fixture/webdriver-manager-network` (added 2026-06-04 — `webdriver-manager` installer network flake) |
| KB-1.4.21 | `sel/frame/tab-handle-array` | deprecated, alias for `sel/frame/tab-handle-array` (added 2026-06-04 — `window_handles[-1]` race) |
| KB-1.4.22 | `sel/timing/page-load-timeout-global` | deprecated, alias for `sel/timing/page-load-timeout-global` (added 2026-06-04 — `set_page_load_timeout` global mutation) |
| KB-1.4.23 | `sel/magic/maximize-window-env-drift` | deprecated, alias for `sel/magic/maximize-window-env-drift` (added 2026-06-04 — `maximize_window` env-dependent viewport) |
| KB-1.4.24 | `sel/assertion/url-parse-snapshot` | deprecated, alias for `sel/assertion/url-parse-snapshot` (added 2026-06-04 — `urlparse(driver.current_url)` skips poll) |
| KB-1.4.25 | `sel/assertion/raw-attr-bypass-a11y` | deprecated, alias for `sel/assertion/raw-attr-bypass-a11y` (added 2026-06-04 — `get_attribute("aria-label")` skips a11y tree) |
| KB-1.4.26 | `sel/fixture/chromedriver-autoinstaller` | deprecated, alias for `sel/fixture/chromedriver-autoinstaller` (added 2026-06-04 — per-run installer network flake) |

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
