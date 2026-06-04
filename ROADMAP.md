# PWmodernizer Roadmap

## v0.4 — current (shipped 2026-06-04)

### Proven end-to-end

- ✅ Stage 1 (Sonnet plan) on `bad-playwright/flaky-waits.spec.ts` (PR #1)
- ✅ Stage 2 (Sonnet generate) — all 7 gates passed (PR #2, confidence 0.65)
- ✅ Code PR auto-opens with `migrator:code` + `confidence:low/high` labels
- ✅ Snippet inventory grounding before Claude (Aider/Cody pattern)
- ✅ Lint+test+parse capture with 1-retry feedback loop (Aider pattern)
- ✅ ts-morph Zhang-Shasha AST-diff with identifier normalization (Risk 1)
- ✅ Output secret scan mirror of Stage 0 (Risk D)
- ✅ Deterministic evaluate.ts metrics report (Improvement C)
- ✅ Plan PR severity histogram (Improvement E)
- ✅ Multi-file input detection (file OR directory)
- ✅ Workflow_dispatch trigger on migrate.yml for manual reruns
- ✅ Plan envelope JSON sidecar (LPW/Routine pattern, opt-in)
- ✅ BAML-style prompt fragments (4 fragments, 12 include sites)
- ✅ Hallucination-defense pins ENCOURAGED (Tam et al. 2024 demotion)

### Validators (all clean, calibrated 3+3 each)

- ✅ `scripts/kb-validate.ts` — 68 KB IDs, 29 references resolved
- ✅ `scripts/validate-examples.ts` — 12 plans, 0 findings (warn mode per Sakasegawa)
- ✅ `scripts/plan-envelope-validate.ts` — canonical example clean
- ✅ `scripts/ast-diff-trivial-check.ts` — ts-morph + Zhang-Shasha
- ✅ `scripts/assemble-prompts.ts` — 3 prompts, all includes resolve
- ✅ `tools/calibrate-pipeline/` — 24/24 fixtures (3 good + 3 bad × 4 validators)

### Corpus

- 5 bad-Playwright examples (flaky-waits, nth-selectors, silent-conditionals, missing-await, force-clicks)
- 5 Selenium examples (4 java + 4 python single-file; 1 java multi-file)
- 1 Cypress example pair (deprioritized; deferred to post-Selenium phase)
- 1 reference style anchor (Investown referral suite distilled)

---

## v0.5 — next (target 2026-06-30)

### Validator promotion: --warn → --strict

Per Sakasegawa 2026: uncalibrated validators should run in warn mode. Calibration fixtures landed. Next: promote validators one at a time after observing N real runs each.

- [x] `validate-examples.ts` --strict (commit `a3e7f15` — calibration green, promoted)
- [x] AST-diff threshold sweep across 10 calibration fixtures (commit `0c243eb` — safety margin 36.36%, 5% default robust; `npm run ast-diff:sweep`). Re-run on real ts-morph diffs once we have 10+ from production.
- [x] `plan-envelope-validate` wired into plan.yml + migrate.yml (commits `a3a6cc5` + `1d775c3` + `31a2bfa` — hard enforcement with derive-envelope safety net)

### Fragment adoption completion

- [x] Migrate `verify.md` L147-151 metric verification template to fragments (commit `4f32724` — `_fragments/metric-verification-output.md` shared between verify.md + verify-code-review.md post-CANDOR)
- [x] Migrate `verify.md` verdict-ladder inline copy to `verdict-ladder.md` (commit `90a2665`)
- [x] Add `assemble-prompts --write` as a workflow step before `Run Claude` (commit `60c6b51` — CRITICAL silent bug fix: Claude was reading raw `{{include:...}}` markers before)

### First real Selenium E2E

- [x] `inputs/selenium-java/` corpus prepared (`EmployeesTest.java` 40 LOC + `pages/EmployeesPage.java` 66 LOC + `helpers/DriverFactory.java` 34 LOC = 140 LOC across 3 files). Ready for Stage 1 → Stage 2.
- [ ] Trigger first multi-file Stage 1 → Stage 2 pipeline run (Claude session quota currently blocking; resumes 22:50 UTC)
- [ ] Compare Sonnet output against `examples/selenium-java-03-multifile-login/expected-output/` as quality baseline (post-run)
- [x] Tune ts-morph fallback — tree-sitter-java + tree-sitter-python landed in Batch 1 (commit `666332a`); calibration 6/6 → 10/10. `.java` and `.py` get native Zhang-Shasha now.

### Semantic regression workflow

- [x] `regression-semantic.yml` + `scripts/semantic-regression-check.ts` (commit `a4c0c26`, 348 + 440 LOC). 3 jobs (select-samples → analyze matrix → tally), 5 comparison axes (anti-patterns ±20%, KB-ID coverage, locator total ±20%, confidence L1, required sections). Run before each release tag.

### Verify stage hardening

- [x] `actions: write` permission for createWorkflowDispatch (commit 7c6bf16)
- [x] verify.yml output secret scan mirror (commit `482ac1e` — catches Opus-quoted credentials)
- [x] verify.yml: explicit guard when Opus fails to produce report (commit `9bcc590`)
- [x] Auto-regen on START OVER verdict — verify fires repository_dispatch with regen-attempt counter, cap 3 (commit `8d48060`)
- [x] verify.yml: handle the case where confidence < 0.7 but verify itself ships a SHIP IT verdict (commit `0c9f234` — Opus override removes confidence:low, adds confidence:high)

### Cleanup + polish

- [x] Remove pre-existing TS errors in evaluate.ts (`noUncheckedIndexedAccess`) (commit `4e2f16e`)
- [x] Bump `actions/checkout` v4→v6 + `actions/setup-node` v4→v6 (Node 24, commit `b2cf959`)
- [x] All 3rd-party actions SHA-pinned + comment with version
- [x] Remove SonarLint cosmetic warnings in derive-envelope.ts (commit `3cc6c05` — `.sort()` → `.toSorted()`, `parseScenarios` split into 3 helpers; tsconfig ES2022 → ES2023)

---

## v1.0 — production-ready (target 2026-09-30)

### DOM grounding (Risk 1 closure)

> **Design brief**: [`docs/playwright-mcp-integration.md`](docs/playwright-mcp-integration.md) (commit `f4edcfb`) — API contract, integration shape, and 7-phase implementation order.

- [x] Phase 1-3 of brief — `scripts/dom-ground.ts` contract surface (CLI, report shape, exit codes), ts-morph locator parser (8 method families), mock probe driver with `mock://always-resolve|always-fail|ambiguous-N` URLs for fixture-free testing. `npm run check:dom-ground` smoke.
- [x] Phase 4 — live probe driver via `chromium.launch` (direct Playwright; MCP layer not needed for server-side CI gate)
- [x] Phase 5 — wire dom-ground into migrate.yml as opt-in step (soft gate, persists `outputs/reports/*-dom-probe.json` for verify)
- [ ] Phase 6 — `@playwright/mcp` Stage 1 enrichment: Sonnet receives a DOM snapshot during plan generation, locator table annotates each row with DOM evidence
- [x] Phase 7a — calibration fixtures (3 good + 3 bad mock URLs in `tools/calibrate-pipeline/fixtures/dom-ground/`; integrated into `npm run calibrate`, currently 6/6 passing). Mock-mode proves gate logic without needing a real SUT.
- [x] Phase 7b — hard-gate flag: `DOM_GROUND_STRICT=true` repo var promotes the migrate.yml step from soft (warn) to hard (fail). Default soft until SUT calibration in place.
- [x] Phase 7c scaffolding — 6 live calibration fixtures (3 good + 3 bad) in `tools/calibrate-pipeline/fixtures/dom-ground-live/` targeting saucedemo.com, conduit.bondaracademy.com, practicetestautomation.com, demoqa.com; runner `scripts/dom-ground-live-calibrate.ts` + `npm run check:dom-ground:live`. Catalog at [`docs/dom-ground-public-suts.md`](docs/dom-ground-public-suts.md). Final flip of `DOM_GROUND_STRICT` waits for first green run against all 6 fixtures.
- [ ] HIGH-confidence locators (currently mechanical mapping only) get an additional check against the DOM before emission
- [ ] LOW-confidence pin rules become enforced: if DOM evidence contradicts the assumed locator, the fallback is taken AND the WHY-comment is materialized in the output

### Plan envelope enforcement

- [x] Stage 1 emits BOTH the markdown plan AND the JSON envelope (analyze.md mandates dual-output; plan.yml gate + derive-envelope safety net)
- [x] Stage 2 validates the envelope before reading the plan (migrate.yml "Validate plan envelope BEFORE reading plan body" step runs before assemble-prompts + inventory + Claude)
- [x] `// plan:scenario=<id>` comments mandated in every test block, verified by `plan-envelope-validate.ts --code` (canonical example + generate.md hard rule + `npm run check:envelope:code`)

### Multi-agent verify (CANDOR pattern)

- [x] Replace single-Opus verify with 2-agent consensus: SDET subagent + Code Review subagent (commit `3993b01` — verify.yml `verify-subagent` matrix `[sdet, code-review]` + `tally` job; prompts/verify-sdet.md 175 LOC + prompts/verify-code-review.md 171 LOC)
- [x] Verify ladder: 2/2 SHIP IT → SHIP IT; 1/2 → FIX FIRST; 0/2 → START OVER (commit `3993b01` — conservative fallback: missing/unparseable sub-report counts as START OVER for that lens)

### Metrics dashboard

- [x] SQLite persistence of every run (commits `bef0e84` + `325101a` — MetricsDB 3 tables wired into all 3 stages; tracks Stage 1 confidence, Stage 2 confidence, verify verdict, KB-ID frequency)
- [x] `npm run dashboard` opens a read-only web UI (commit `f8994b3` — vanilla http + Chart.js/Tailwind CDN, 5 charts + KB-ID table)
- [x] Per-source-framework quality bins (commit `200dabc` — SQLite `source_framework` column + dashboard stacked verdict chart + multi-line confidence trend + sorted "Migrator quality by framework" table; framework detection by path/ext/content)

### Phase 3 — Cypress (deprioritized but documented)

- [x] `examples/cypress-*/` corpus expansion: 5 examples (commit `3b6faf6` added cypress-03/04/05 — intercept-stubbing, session-auth, conditional-and-jquery). Further expansion parked.
- [ ] `inputs/cypress/` first real input — gated on user submission
- [x] `cy/...` KB-ID namespace expansion: 50 Cypress entries total (commits `e30bcc8` 14→20 + `0f2643a` 20→50). kb-validate: 98 IDs total. Parity with bad-PW reached.

---

## Beyond v1.0

> Scope and feasibility notes per direction: [`docs/beyond-v1-research.md`](docs/beyond-v1-research.md). Each includes motivation, implementation shape, what blocks each from being v1.0, and prerequisites before starting.

- LangChain/LangGraph integration for state-machine orchestration of Stage 1+2+verify — needs ≥ 20 real migrations first to inform graph design
- Claude Code SDK rewrite of Stage 2 (currently uses raw CLI; SDK gives better tool routing) — recommended first post-v1.0 move
- Auto-PR-merge after verify SHIP IT (currently requires manual click) — needs ≥ 10 manually-merged SHIP IT runs with no revert before enabling
- GitHub App distribution (currently a workflow only) — needs v1.0 stability + cost model + compliance scope before MVP

---

## Research backlog (papers to revisit)

- arXiv 2509.21791 (causal inference on structured output) — confirm Tam et al. demotion still holds for newer models
- NVIDIA RULER benchmark refresh for Claude 4.7 — current 25K token cap may be conservative
- Cleanlab confidence learning applied to KB curation (currently we have validation but not active relearning)
- LPW plan-verification benchmarks against our envelope approach
- Aider repo-map benchmarks for Java/Python projects (current snippet inventory is TypeScript-focused)
