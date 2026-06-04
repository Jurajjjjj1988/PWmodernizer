# Changelog

All notable changes per release.

Format: Keep a Changelog (https://keepachangelog.com), SemVer.

## [Unreleased / v0.4 development]

### Added (2026-06-04 multi-agent supercycle — 108 total commits)

**Wave 1+2 evening sweep (3 parallel agents + 6 sequential commits):**
- Multi-agent verify CANDOR (`3993b01`): `verify.yml` split into `verify-subagent` matrix `[sdet, code-review]` + `tally` job. New prompts `verify-sdet.md` (175 LOC) + `verify-code-review.md` (171 LOC). Verdict ladder 2/2 SHIP IT → SHIP IT, 1/2 → FIX FIRST, 0/2 → START OVER. Auto-regen + secret-scan + label state machine preserved. Closes v1.0 "Multi-agent verify (CANDOR)" ROADMAP item.
- Plan envelope enforcement E2E (`1c46c14`): Stage 1 dual-output mandate (markdown + JSON), Stage 2 pre-read envelope validation, `// plan:scenario=<id>` pins mandated and verified via new `plan-envelope-validate.ts --code` mode. `derive-envelope` safety net preserved. Closes v1.0 "Plan envelope enforcement" 3 ROADMAP items.
- Per-framework quality bins (`200dabc`): MetricsDB schema +`source_framework` column (idempotent migration with `unknown` backfill), framework detection by path/ext/content heuristic, dashboard adds stacked verdict-by-fw chart + multi-line confidence trend + sorted "Migrator quality by framework" table. Closes v1.0 "Per-source-framework quality bins" ROADMAP item.
- SonarLint cleanup (`3cc6c05`): `derive-envelope.ts` `.sort()` → `.toSorted()`, 58-line `parseScenarios` split into 3 helpers each <20 LOC. `tsconfig` target/lib `ES2022` → `ES2023` (Node 22 runtime already supports). Closes v0.5 cleanup item.
- Fragment adoption completion (`4f32724`): `_fragments/metric-verification-output.md` extracted; both `verify.md` and `verify-code-review.md` reference it. Closes the last v0.5 fragment-adoption gap (deferral note "not shared concept" no longer applies post-CANDOR).
- AST-diff threshold sweep (`0c243eb` + `4e899fe`): `scripts/ast-diff-threshold-sweep.ts` walks all 10 calibration fixtures, sweeps thresholds [1%..20%], reports per-fixture matrix + safe band. Today's result: bad_max=0.00%, good_min=36.36%, safety margin 36.36% — 5% default robust. `npm run ast-diff:sweep`. Closes v0.5 "AST-diff threshold tuning" ROADMAP item.
- Cypress KB expansion 14 → 20 (`e30bcc8`): 6 new high-quality anti-patterns added (cy.session no cache-bust, store internals leak, spy/stub cleanup, cy.then stale snapshot, Cypress.Commands.overwrite, should not.exist race). kb-validate 62 → 68 IDs. Remaining ~30 entries stay deferred under Phase 3 pending real Cypress input.
- playwright-mcp integration brief (`f4edcfb`): `docs/playwright-mcp-integration.md` — design contract for v1.0 Risk-1 (DOM grounding) closure. 7-phase implementation order, API contract for `scripts/dom-ground.ts`, token-budget mitigations, 4 open questions. No code shipped — spec only.

**Batch 3 (2 agents): stress tests + auto-regen**
- Stress test fixtures (`716815a` + `2ad6882`): 8 adversarial inputs under `inputs/_stress/` + `scripts/test-stage0.ts` simulator. Verdict matrix: 4 REJECT + 2 WARN + 2 PASS. Risk 4 thoroughly validated.
- Auto-regen on START OVER (`8d48060`): verify.yml fires `repository_dispatch type: regenerate-plan` automatically, with `regen-attempt:N` counter cap 3, then `regen-attempt:max-reached`. Closes loop without manual `/regenerate`.

**Batch 2 (3 agents): dashboard + regression-semantic + CI speedup**
- Web dashboard (`f8994b3`): `scripts/dashboard.ts` 240 LOC + HTML 90 LOC. Vanilla http + Chart.js/Tailwind CDN. 3 charts + KB-ID frequency table. `npm run dashboard`.
- Semantic regression workflow (`a4c0c26`): `.github/workflows/regression-semantic.yml` 348 LOC + `scripts/semantic-regression-check.ts` 440 LOC. Manual pre-release sweep with 5 comparison axes. Closes v0.5 "Semantic regression" ROADMAP item.
- CI matrix parallelization (`3d4065e`): regression-test 13 sequential → 10 matrix entries. Runtime ~5min → ~45-60s.

**Batch 1 (5 agents): tree-sitter + SQLite + LPW + build-inventory + workflow wiring**
- tree-sitter Java/Python AST diff (`666332a`): Risk 1 v2 closure. Real Zhang-Shasha tree-edit-distance for `.java`/`.py`. Calibration 6/6 → 10/10.
- SQLite metrics (`bef0e84` + `325101a`): MetricsDB 3 tables wired into all 3 stages. `npm run metrics:{report,export}`.
- Plan-vs-code coverage (`5f9cff7`): arXiv 2411.14503 LPW closure. Calibration 6/6.
- build-inventory extraction (`01f907d`): 95 LOC inline bash → 417 LOC ts-morph script.
- Integration (`be80841`): +5 devDeps + +4 npm scripts + migrate.yml wires new steps.

**Polish & docs (between/around batches):**
- assemble-prompts stale detection (`9f8571b`)
- kb-validate scope → outputs/plans (`e08e424`)
- validate:all matches CI strict (`a7fc8f7`)
- smoke includes eslint (`c69ce24`)
- npm run quickstart 10-check onboarding (`3887bd1` + `569427f`)
- README badges + Local commands table + 6 new research-backed defenses (`f9931ce` + `9278def` + `1be8a3d`)
- CONTRIBUTING + CODEOWNERS + PR template + 2 issue templates (`ac2f953` + `21d9f0b` + `4a35198`)
- File-existence guards across evaluate/derive/verify (`4faee68` + `84c105d` + `9bcc590`)
- Confidence formula v2 (5-signal output-aware): PR #2 lifted 0.65 → 0.75 (`4e2f16e`)
- regression-test triggers + outputs/plans envelope gate (`dd3372e` + `4b26eb5`)
- Verify SHIP IT override removes confidence:low (`0c9f234`)
- ROADMAP closures: 8 v0.5 items + 2 v1.0 items

### Added (2026-06-04 late session — 80+ total commits, second hardening pass)
- **scripts/derive-envelope.ts** (`31a2bfa` + `c3215a4`): markdown plan → JSON envelope parser. Works on all 12 example plans + the real flaky-waits.spec.ts plan. Wired as safety net in plan.yml + migrate.yml so envelope ALWAYS exists. Backfilled `outputs/plans/flaky-waits.spec.ts.envelope.json` for the existing real plan.
- **Confidence formula v2** (`4e2f16e`): 5-signal output-aware (0.4 plan + 0.25 selector + 0.1 webfirst + 0.15 smell-removal + 0.1 forbidden-absence). PR #2's high-quality output now reads 0.75 instead of 0.65 — triggers verify only when there's real cause. Plus per-signal breakdown table in the report.
- **Prompt fragment expansion in CI** (`60c6b51`): CRITICAL silent bug fix. Workflows now run `npm run assemble-prompts` and Claude reads `prompts/_assembled/*.md`. Previously Claude saw raw `{{include:...}}` markers and missed fragment content. Affected all 3 prompts (analyze, generate, verify).
- **Assemble stale detection** (`9f8571b`): `assemble-prompts --check` now also fails if committed `prompts/_assembled/` files don't match what would be generated from sources. Catches "edited fragment, forgot to run --write" silent regressions.
- **playwright.config.ts for outputs/tests/** (`992a1e2`): enables local `npx playwright test` against `MIGRATION_TARGET_URL`. Stage 2 prompt now knows about the runtime config (`d7f91e9`).
- **Verify HARD gate** (`13d2544`): START OVER verdict exits 1 (failed check) so branch protection can hard-block merge. Plus `actions: write` permission fix (`7c6bf16`) for trigger-verify.
- **kb-validate scope** (`e08e424`): now also scans `outputs/plans/*.md` for KB-ID references — catches Claude-cited dangling KB-IDs in real Stage 1 emissions.
- **Local commands**: `npm run quickstart` (10-check friendly onboarding, `3887bd1`+`569427f`), `npm run smoke` (now typecheck:all + 6 validators + eslint, `4da3248`+`c69ce24`), `npm run check:derive` (`b9b4feb`), `npm run validate:all`, `npm run derive-envelope`.
- **Pre-existing TS strict fixes** (`4e2f16e` + `b867d60` + `240b42b`): `noUncheckedIndexedAccess` errors in `longestCommonSubstring`, `typecheck:all` script, `tools/**/*.ts` added to root tsconfig include.
- **GitHub project files** (`4a35198` + `21d9f0b`): bug_report.md + migration_quality.md issue templates; PULL_REQUEST_TEMPLATE.md; CODEOWNERS.
- **CONTRIBUTING.md** (`ac2f953`): onboarding + PR impact tier + reviewer contract + project values.
- **ROADMAP.md** (`634d0be`): v0.4 / v0.5 / v1.0 / beyond + research backlog with arXiv refs.
- **CHANGELOG.md** (`5fef3bf`): Keep-a-Changelog format.
- **Stage 2 fixes**: `outputs/.snippets-inventory.md` + `outputs/.lint-errors.md` gitignored as transient (`e6998de`); `mkdirSync(dirname(...))` before `writeFileSync` in evaluate.ts (`6fce503`); `find -name '*.spec.ts'` replacing bare glob in 3 workflows (`7e7648b` + `42d1959`); `playwright.config.ts` excluded from forbidden-pattern grep (`cc8df98`); PR body branches on `github.event_name` (`2a94c56`).
- **CI hardening**: `actions/checkout` + `actions/setup-node` bumped v4→v6 for Node 24 runtime (`b2cf959`); `regression-test.yml` end-to-end `/regenerate` wiring check (4 assertions, `0c17581`); `outputs/plans/*.envelope.json` validated by regression-test (`4b26eb5`); trigger paths now include `tools/`, `package.json`, `outputs/plans/*.envelope.json` (`dd3372e`).
- **Verify report secret scan** (`482ac1e`): mirror of Stage 0 + Stage 2 — catches Opus quoting source credentials.
- **Verify report missing guard** (`9bcc590`): explicit error if Opus failed to write report.
- **Verdict ladder fragment adoption** (`90a2665`): verify.md uses `{{include:_fragments/verdict-ladder.md}}` instead of inline copy.
- **lint-output trigger fix** (`e3d127c`): now triggers on `eslint.config.js` (v9 flat config), not just legacy `.eslintrc*`.
- **README badges** (`f9931ce`): regression-test + lint-output status visible at top of README.
- **Local commands table** in README (`9278def`): all 15+ npm scripts documented with when-to-run guidance.

### Added (2026-06-04 first session — 17 commits, initial PROVEN-E2E hardening)
- **Plan envelope hard enforcement** (`a3a6cc5` + `31a2bfa` + `1d775c3` + `c3215a4`): Stage 1 instructs Claude to emit envelope.json alongside markdown plan; Stage 2 reads envelope as authoritative contract for scenario IDs / required POMs / fixtures; `scripts/derive-envelope.ts` (365 LOC strict TS) is the safety net — derives envelope from markdown if Claude misses, ensuring envelope ALWAYS exists; regression-test gates derive→validate roundtrip across all 12 example plans
- **Validator promotion**: `validate-examples` --warn → --strict (`a3e7f15`)
- **Verify HARD gate** (`13d2544`): START OVER verdict exits 1 (failed check), pairs with branch protection for actual merge block
- **Confidence formula v2** (`4e2f16e`): 5-signal output-aware (0.4 plan + 0.25 selector + 0.1 webfirst + 0.15 smell-removal + 0.1 forbidden-absence); per-signal breakdown table in report; PR #2 confidence 0.65 → 0.75 under new formula
- **Prompt fragment expansion in CI** (`60c6b51`): all 3 workflows now run `npm run assemble-prompts` and read `prompts/_assembled/*.md` — fixes silent gap where Claude saw raw `{{include:...}}` markers
- **outputs/tests/playwright.config.ts** (`992a1e2`): enables local SUT runs via `npx playwright test --config outputs/tests/playwright.config.ts`
- **CHANGELOG.md** (Keep-a-Changelog format)
- **ROADMAP.md** (v0.4 / v0.5 / v1.0 / beyond + research backlog)
- `workflow_dispatch` trigger on `migrate.yml` for manual fresh runs (`79c2422`)
- `actions: write` permission on trigger-verify job (`7c6bf16`)
- `npm run validate:all` (5 validators) + `npm run smoke` (typecheck:all + validate:all) + `npm run derive-envelope`
- Branch protection setup documentation in README

### Added (initial — pre-2026-06-04)
- **Stage 2 PROVEN end-to-end** (PR #2 — bad-PW flaky-waits → clean Playwright TS, 56 LOC, confidence 0.65→0.72 after evaluate.ts comment-strip fix)
- 11 research-backed defenses against LLM hallucination (see `README.md` § "Research-backed defenses"):
  - Snippet inventory grounding (Aider / Sourcegraph Cody RAG)
  - Lint-and-test feedback loop with 1-retry (Aider pattern)
  - Plan envelope JSON sidecar (LPW arXiv:2411.14503 + Routine arXiv:2507.14447)
  - Few-shot example validation (Cleanlab pattern, --strict mode)
  - BAML-style prompt fragments (4 fragments, 12 include sites)
  - Schema demotion: Hallucination-defense pins REQUIRED → ENCOURAGED (Tam et al. 2024 arXiv:2408.02442)
  - Token-based input gate (NVIDIA RULER 25K cap)
  - 3-level verdict ladder SHIP IT / FIX FIRST / START OVER
  - Validator calibration (Sakasegawa 2026)
  - Abandon-and-regenerate `/regenerate` slash command
  - ts-morph Zhang-Shasha AST-diff with identifier normalization
- 4 risk implementations + calibration fixtures:
  - Risk 1: ts-morph AST-diff replacing LCS (`scripts/ast-diff-trivial-check.ts`)
  - Risk 2: KB ID kebab-case schema + validator (`scripts/kb-validate.ts`)
  - Risk 3: `/regenerate` slash command flow (`regenerate-dispatch.yml`)
  - Risk 4: Token-based input sanity gate (Stage 0 in `plan.yml`)
- 5 validators + 24/24 calibration fixtures (3 good + 3 bad × 4 validators)
- 5 bad-Playwright + 5 Selenium examples (1 multi-file Selenium)
- ROADMAP.md (v0.4 / v0.5 / v1.0 / beyond)
- `outputs/tests/playwright.config.ts` — enables local test runs against MIGRATION_TARGET_URL
- `workflow_dispatch` trigger on `migrate.yml` for manual fresh runs
- `actions: write` permission on trigger-verify job (createWorkflowDispatch)
- `npm run validate:all` — local one-command pre-push smoke test
- `npm run calibrate` — Sakasegawa fixture-driven validator calibration
- Branch protection documentation for hard verify-gate enforcement

### Changed
- `validate-examples` promoted from `--warn` to `--strict` (calibration green)
- `evaluate.ts` strips comments before smell + forbidden-pattern detection (false-positive fix for waitForTimeout in WHY-comments)
- Plan PR body branches on `github.event_name` (workflow_dispatch vs pull_request)
- ESLint config: 22 `eslint-plugin-playwright` recommended + 11 research-backed additions (`prefer-native-locators`, `no-element-handle`, `no-networkidle`, `no-unsafe-references`, `max-nested-describe: 2`, etc.)
- `Hallucination-defense pins` schema section: REQUIRED → ENCOURAGED (Tam et al. 2024)
- `migration-rules.md` §2 fixture import policy relaxed: direct `@playwright/test` acceptable for ≤2-test subtractive bad-PW specs

### Fixed
- Phase 1 audit critical 5/5 + medium 2/3
- Inconsistency hunt 6/6 (KB-1.1.10 misuse, analyze.md vs §9 schema, pins workflow contract, etc.)
- 21 dangling Q-IDs in Selenium expected-plans rehabilitated → 0 findings
- evaluate.ts: `mkdirSync(dirname(...), recursive)` before `writeFileSync` (outputs/reports/ didn't exist after Claude stopped writing report)
- migrate.yml: `find -name '*.spec.ts'` for `playwright test --list` (was passing glob → regex error)
- outputs/tests/tsconfig.json: `rootDir: ..` + `exclude: []` to allow pages/fixtures siblings
- kb-validate.ts: ignore `prompts/_fragments/kb-id-format.md` placeholder examples
- 3 pre-existing TS `noUncheckedIndexedAccess` errors in `longestCommonSubstring`

### Research adopted
- arXiv 2410.10628 (LLM test smells: Magic Number + Assertion Roulette at 99.85%)
- arXiv 2411.14503 (LPW plan-verification contract)
- arXiv 2507.14447 (Routine structured planning)
- arXiv 2408.02442 (Tam: format restrictions degrade LLM quality)
- arXiv 2503.09572 (Plan-and-Act planner/executor)
- arXiv 2509.21791 (causal inference on structured output)
- NVIDIA RULER (effective Claude context degradation)
- Cleanlab (noisy few-shot examples)
- Sakasegawa 2026 (uncalibrated validator harm)
- Microsoft ISE (85% accuracy ceiling Stagehand→Playwright)
- Aider (repo-map + lint loop)
- Sourcegraph Cody (RAG grounding)
- BAML / Mirascope (typed prompts, DRY)

## [Pre-history]
- 2026-05-21 — Investown referral suite distilled into `examples/reference/company-style.spec.ts`
- 2026-06-03 — Initial repo scaffold (4 workflows, 3 prompts, 2 configs, 8 example dirs)
