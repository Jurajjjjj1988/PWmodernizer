# End-to-end walkthrough (v0.2.0 qa-master)

> A real migration, narrated against the **v0.2.0 qa-master** architecture. PromptJupiterTest from
> [bonigarcia/selenium-webdriver-java](https://github.com/bonigarcia/selenium-webdriver-java) is the
> canonical example — Apache-2.0 Selenium-Java code that flowed plan → multi-file Stage 2 → verify
> end-to-end and closed the v0.2.0 calibration loop in 11 prompt-iteration cycles.
>
> **Result you can inspect today (2026-06-10):**
> - Stage 1 plan + envelope on `main`: [`outputs/plans/PromptJupiterTest.java.md`](../outputs/plans/PromptJupiterTest.java.md) + sidecar JSON
> - Stage 2 run `27265040399` — succeeded; emitted the qa-master layered output (spec + `base.fixture` extension + `PageClass` + `test-data` constants) on the `migrator/code-PromptJupiterTest` branch
> - Verify run `27265926538` — returned **FIX FIRST** (max-severity tally across SDET + Code Review)
> - The 11-iteration calibration loop that produced those run IDs is the closure event for v0.2.0; deltas live in `CHANGELOG.md` v0.1.1 + v0.2.0 entries

## What this walkthrough covers

Stage 1 plan generation, the qa-master multi-file Stage 2 output, the seven Stage 2 gates (incl. the new `validate-qa-master-conformance.ts`), CANDOR verify with max-severity tally, and what the reviewer sees at each PR. The big shift from v0.1.x is that Stage 2 **always** emits a layered tree — there is no minimal-spec mode anymore. See [`../examples/reference/qa-master/docs/ARCHITECTURE.md`](../examples/reference/qa-master/docs/ARCHITECTURE.md) for the structural spec the generator targets, and the per-layer `CLAUDE.md` files alongside it.

## The input

```bash
inputs/selenium-java/PromptJupiterTest.java   # 81 LOC — JUnit 5, two @Test methods
```

`PromptJupiterTest` exercises a browser-native `window.prompt()` dialog on the bonigarcia dialog-boxes demo page. Two `@Test` methods (`testPrompt`, `testPrompt2`) test the same scenario via different Selenium API variants (two-step `switchTo().alert()` vs one-step `wait.until(alertIsPresent())`). Visible anti-patterns: `Thread.sleep(3s)` in `@AfterEach`, hardcoded absolute URL in `driver.get(...)`, `WebDriverWait` + `ExpectedConditions.alertIsPresent()` boilerplate, manual `WebDriverManager` setup/teardown.

## Stage 1 — trigger and what happens

```bash
gh workflow run plan.yml -f input_path=inputs/selenium-java/PromptJupiterTest.java
```

`plan.yml` runs the v0.1.x preflight (Stage 0 sanity gate: size, encoding, test-marker grep, secret scan), assembles `prompts/_assembled/analyze.md` from fragments, calls Sonnet 4.6 with the qa-master reference plus the KB + rules + input, then writes:

- `outputs/plans/PromptJupiterTest.java.md` — the markdown plan
- `outputs/plans/PromptJupiterTest.java.envelope.json` — the machine-validatable sidecar

The envelope is the **contract** for Stage 2. It pins scenario IDs (`1.1`, `1.2`), the locator table with confidence levels, hallucination-defense pins with reviewer fallbacks, and (new in v0.2.0) optional `requiredPages` / `requiredBlocks` / `requiredApi` / `requiredActions` / `requiredUtilities` / `requiredTestData` / `requiredTypes` arrays naming the helper-tree files Stage 2 must emit. The plan PR opens labeled `migrator:plan`.

The PromptJupiter plan flagged 9 anti-patterns across H/M/L severity, declared no POM extraction needed (single page, two near-duplicate tests, ~30 LOC effective body — well under the 200-LOC threshold), and ended with 3 open questions for the reviewer (consolidate the duplicate `@Test` methods? role-based vs CSS locator? post-dialog DOM assertion?).

## Reviewing the plan PR

The PR carries the v0.1.x five-item Stage-1 review checklist (framework detection, anti-pattern accuracy, locator confidence, structural calls, open questions). Two ways to push back:

- **Edit the plan in-place** — Stage 2 reads the plan as-merged; surgical edits become the contract.
- **Comment `/regenerate <feedback>`** — fires `regenerate-dispatch.yml`, closes the PR, re-runs Stage 1 with the feedback injected.

## Stage 2 — qa-master multi-file output

Merging the plan PR fires `migrate.yml`. The shape mirrors v0.1.x but the prompt and validators are rewritten for qa-master:

1. **Guard** — confirms the merged PR carries `migrator:plan` and parses the input path.
2. **Validate envelope BEFORE reading plan** — fails fast if the sidecar is malformed.
3. **Build snippet inventory** — `scripts/build-inventory.ts` walks `outputs/helper/` and presents the existing scaffolding (`basepage.ts`, `baseblock.ts`, the current `base.fixture.ts`) so Sonnet reuses instead of reinventing.
4. **Run Claude (generate)** — Sonnet 4.6, `--max-turns 30`. Reads the plan + envelope + input + KB + rules + the `examples/reference/qa-master/` style anchor. Writes the **layered** output:
   - `outputs/tests/<kebab>.spec.ts` — imports `test`/`expect` from `@fixtures/base.fixture`, NEVER from `@playwright/test`
   - `outputs/helper/page-object/pages/<name>.page.ts` — `PageClass<Name>` extends `BasePage`, declares NO own constructor, `readonly` locator fields with `.describe('[LABEL] …')`
   - `outputs/helper/fixtures/base.fixture.ts` — extended with the page-object fixture entries this migration needs (the scaffolding shell stays committed; Sonnet adds the `test.extend<{...}>({...})` entries)
   - `outputs/helper/test-data/<name>.ts` — constants only (URLs, LABEL_* prefixes, magic strings extracted per Bullet 9 of `generate.md`)
   - optional helper layers per plan: `blocks/`, `api/`, `actions/`, `utilities/`, `types/{external,internal}/`
5. **Gates (the validator wall):**
   - `tsc --noEmit -p outputs/tests/tsconfig.json` (path aliases resolve at the `outputs/` rootDir)
   - `eslint --fix` with `eslint-plugin-playwright` + the no-restricted-imports rule that blocks `@playwright/test` outside `base.fixture.ts`
   - `npx playwright test --list`
   - `ast-diff-trivial-check` — rejects structural mirrors
   - `plan-code-coverage` — every envelope scenario ID appears as exactly one `// plan:scenario=<id>` comment; every `required*` file exists
   - **`validate-qa-master-conformance.ts` (new in v0.2.0)** — hard-fails on: spec importing from `@playwright/test`, `PageClass`/`BlockClass` with own constructor, locator field without `.describe('[LABEL] …')`, page-method `expect()` without `[LABEL]` arg, relative `../` cross-helper imports, `page.goto(` in a spec file. Soft-warns on missing type-prefix (`button*`/`input*`/`text*`/`array*`/`by*`) and utilities without unit tests.
   - `validate-report-metrics.ts` — report's claimed filename + LOC must match emitted spec (the v0.1.1 falsified-100% gate)
   - `evaluate.ts` — emits aggregate confidence 0..1 via the v2 5-signal formula
6. **Fix-lint retry** (1× cap) — if any of `tsc`/`eslint`/`pw parse` fails, errors are fed back to Sonnet with a STOP-block PROMPT wrapper for a single retry.
7. **Open code PR** labeled `migrator:code` + `confidence:high` or `confidence:low`.

For PromptJupiter, the Stage 2 run was `27265040399`. The emitted tree:

```
outputs/tests/prompt-jupiter.spec.ts
outputs/helper/page-object/pages/dialog-boxes.page.ts
outputs/helper/fixtures/base.fixture.ts   (extended with dialogBoxesPage entry)
outputs/helper/test-data/prompt.ts         (PROMPT_INPUT_TEXT + EXPECTED_PROMPT_MESSAGE constants)
outputs/reports/PromptJupiterTest.java.md
```

The spec imports `test`/`expect` from `@fixtures/base.fixture`, never calls `page.goto()` (delegated to `dialogBoxesPage.open()`), registers the dialog handler with `page.once('dialog', …)` before the click per `generate.md` Bullet 15, captures the message in a closure, then asserts after the click (the v0.1.1 dialog-handler anti-pattern fix). Both `@Test` methods carried forward as two `test()` blocks with `// plan:scenario=1.1` / `// plan:scenario=1.2` pins.

## Verify — CANDOR with max-severity tally

When `evaluate.ts` returns < 0.7, `verify.yml` fires. Two parallel Opus calls: one with the SDET lens ([`../prompts/verify-sdet.md`](../prompts/verify-sdet.md)), one with Code Review ([`../prompts/verify-code-review.md`](../prompts/verify-code-review.md)). The v0.1.1 closure replaced the legacy SHIP-IT-counting tally with **max-severity consensus**:

- both **SHIP IT** → SHIP IT
- mixed SHIP IT + FIX FIRST → **FIX FIRST** (reviewer required)
- both FIX FIRST → **FIX FIRST** (no lens wants regen — do not auto-regen)
- any lens **START OVER** → START OVER (auto-`/regenerate` cap 3)

For PromptJupiter, the verify run was `27265926538` against the unmerged `migrator/code-PromptJupiterTest` branch (using `verify.yml`'s `pr_branch` input, added in v0.1.1 PR #40). Verdict: **FIX FIRST** — both lenses concurred on FIX FIRST. No auto-regen, no false START OVER, reviewer is the next gate. Exactly the v0.1.1 closure pattern PR #42 was built to deliver.

## What happens on merge of the code PR

Recommended branch protection on `main` requires the `migrator:code` label + `confidence:high` (or a verify SHIP IT override) + a human approval. Once merged:

- `outputs/tests/<kebab>.spec.ts` and all helper-tree files land on `main`
- `outputs/reports/<basename>.md` carries the metric breakdown (selector quality, smell delta, AST-diff distance, web-first rate, forbidden absence)
- A row persists to `outputs/.metrics.db` for the dashboard (`npm run dashboard`)

## The 11-iteration calibration loop (what closed v0.2.0)

The PromptJupiter migration was not a one-shot. Between the v0.2.0 architecture rewrite landing on main and the final FIX FIRST verdict, 11 iterations of prompt + validator + workflow calibration pinned the qa-master output shape. The headline fixes:

- PR #47 — remove v0.1.x prompt leakage that overrode the qa-master rules
- PR #48 — baseline scaffolding on disk + max-turns 30 + type-only import exemption
- PR #49 / #50 — `migrate.yml` artifact upload on lint failure + max-turns 12 → 20
- PR #51 — validator + wrapper PROMPT: helper `expect` imports allowed; full spec/Page/fixture triad in the STOP block
- PR #52 — ESLint `no-restricted-imports` + `page.goto` block + validator paren fix
- PR #53 — promote tsconfig path aliases to `outputs/` so Playwright resolves them from `helper/`
- PR #54 — `verify.yml` auto-dispatch passes `pr_branch` so verify reads the Stage 2 PR branch

Each iteration produced one concrete failure mode → one fix → one calibrated validator. v0.1.x took the same shape (12 PRs across the verify-pipeline closure on 2026-06-09/10); v0.2.0's was 11. That's the operational pattern: ship a thin slice, run it against one real input, fix what Sonnet actually got wrong, re-run.

## Common failure modes for first-time users

See [`troubleshooting.md`](troubleshooting.md). For v0.2.0 specifically, the most common first-run misses are:

1. Spec imports `test` from `@playwright/test` instead of `@fixtures/base.fixture` — caught by `validate-qa-master-conformance.ts`. Fix: re-prompt or hand-edit.
2. `PageClass` declares its own constructor — caught by the same validator. The base class wires `page`.
3. Locator field missing `.describe('[LABEL] …')` — same validator, hard-fail.
4. Path-alias resolution fails (`@page-object/...` 404) — confirm `outputs/tsconfig.json` paths from PR #53 are present.

Four things to set up before the first migration:

1. **`CLAUDE_CODE_OAUTH_TOKEN` repo secret** (or `ANTHROPIC_API_KEY` — see README quickstart).
2. **`MIGRATION_TARGET_URL` repo variable (optional)** — enables DOM grounding.
3. **Repository permissions** — `contents: write`, `pull-requests: write`, `id-token: write`.
4. **Branch protection on `main`** — `migrator:code` label + `confidence:high` + human review.

**Cost expectations.** Per migration, end-to-end: roughly `$0.20–$0.70`. Stage 1 Sonnet ~`$0.10`; Stage 2 Sonnet (multi-file qa-master output is ~2× the v0.1.x single-spec cost) ~`$0.20`; verify Opus CANDOR (only when confidence < 0.7) ~`$0.40` for both lenses combined.

## Where to next

- [`../ROADMAP.md`](../ROADMAP.md) — shipped vs in-progress.
- [`../examples/reference/qa-master/docs/ARCHITECTURE.md`](../examples/reference/qa-master/docs/ARCHITECTURE.md) — the structural target Stage 2 generates against.
- [`../examples/reference/qa-master/docs/CLAUDE.md`](../examples/reference/qa-master/docs/CLAUDE.md) — the 100-line orientation alongside it.
- [`../config/migration-rules.md`](../config/migration-rules.md) — §1–§4 are the qa-master contract in prose.
- [`../config/knowledge-base.md`](../config/knowledge-base.md) — the `qa-master/` namespace (15 IDs) is the anti-pattern catalogue the conformance validator references.
- [`../prompts/`](../prompts/) — `analyze.md` Step 5a–5j and `generate.md` Your-task section are the v0.2.0 prompt anchors.
