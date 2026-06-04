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

- ✅ `scripts/kb-validate.ts` — 62 KB IDs, 7 references resolved
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
- [ ] AST-diff threshold tuning after observing 10+ real ts-morph diffs (currently 5% normalized distance; may need stricter)
- [x] `plan-envelope-validate` wired into plan.yml + migrate.yml (commits `a3a6cc5` + `1d775c3` + `31a2bfa` — hard enforcement with derive-envelope safety net)

### Fragment adoption completion

- [ ] Migrate `verify.md` L147-151 metric verification template to fragments (deferred — placeholder structure, not shared concept)
- [x] Migrate `verify.md` verdict-ladder inline copy to `verdict-ladder.md` (commit `90a2665`)
- [x] Add `assemble-prompts --write` as a workflow step before `Run Claude` (commit `60c6b51` — CRITICAL silent bug fix: Claude was reading raw `{{include:...}}` markers before)

### First real Selenium E2E

- [ ] `inputs/selenium-java/` (`EmployeesTest.java` + pages + helpers) — first multi-file Stage 1 → Stage 2 pipeline run (Claude session quota currently blocking; resumes 22:50 UTC)
- [ ] Compare Sonnet output against `examples/selenium-java-03-multifile-login/expected-output/` as quality baseline
- [ ] Tune ts-morph fallback (currently falls back to LCS for `.java` because ts-morph can't parse Java — consider adding tree-sitter-java for native AST diff)

### Semantic regression workflow

- [ ] `regression-semantic.yml` — manually-triggered workflow that runs Stage 1 + Stage 2 against every `examples/*/input.*` (sampled to 3-5 per release) and compares Claude's output to `expected-output.*` via:
  - `ast-diff-trivial-check` (existing) — output must be non-trivial
  - new `output-equivalence` script — output and expected-output must be semantically equivalent (web-first assertions match, locator hierarchy match, no forbidden patterns) within a threshold
- Run before each release tag. Catches the "we changed a prompt and now Claude generates worse code" regression class that structural CI can't catch.

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
- [ ] Remove SonarLint cosmetic warnings in derive-envelope.ts (cognitive complexity, sort vs toSorted — partial fix in `26260bd`)

---

## v1.0 — production-ready (target 2026-09-30)

### DOM grounding (Risk 1 closure)

- [ ] `playwright-mcp` integration: Stage 2 receives a real DOM snapshot from the SUT at `MIGRATION_TARGET_URL` and grounds locator decisions
- [ ] HIGH-confidence locators (currently mechanical mapping only) get an additional check against the DOM before emission
- [ ] LOW-confidence pin rules become enforced: if DOM evidence contradicts the assumed locator, the fallback is taken AND the WHY-comment is materialized in the output

### Plan envelope enforcement

- [x] Stage 1 emits BOTH the markdown plan AND the JSON envelope (analyze.md mandates dual-output; plan.yml gate + derive-envelope safety net)
- [x] Stage 2 validates the envelope before reading the plan (migrate.yml "Validate plan envelope BEFORE reading plan body" step runs before assemble-prompts + inventory + Claude)
- [x] `// plan:scenario=<id>` comments mandated in every test block, verified by `plan-envelope-validate.ts --code` (canonical example + generate.md hard rule + `npm run check:envelope:code`)

### Multi-agent verify (CANDOR pattern)

- [ ] Replace single-Opus verify with 2-agent consensus: SDET subagent + Code Review subagent (per `ai-debug-accelerator/debugger.py`)
- [ ] Verify ladder becomes: 2/2 agree → SHIP IT; 1/2 → FIX FIRST; 0/2 → START OVER

### Metrics dashboard

- [ ] SQLite persistence of every run (Stage 1 confidence, Stage 2 confidence, verify verdict, time-to-merge)
- [ ] `npm run dashboard` opens a read-only FastAPI/React view of trends
- [ ] Per-source-framework quality bins (which framework Migrator handles best/worst)

### Phase 3 — Cypress (deprioritized but documented)

- [ ] `examples/cypress-*/` corpus expansion to 5+ examples
- [ ] `inputs/cypress/` first real input
- [ ] `cy/...` KB-ID namespace expansion (currently ~10 entries, target 50+ for parity with bad-PW)

---

## Beyond v1.0

- LangChain/LangGraph integration for state-machine orchestration of Stage 1+2+verify
- Claude Code SDK rewrite of Stage 2 (currently uses raw CLI; SDK gives better tool routing)
- Auto-PR-merge after verify SHIP IT (currently requires manual click)
- GitHub App distribution (currently a workflow only)

---

## Research backlog (papers to revisit)

- arXiv 2509.21791 (causal inference on structured output) — confirm Tam et al. demotion still holds for newer models
- NVIDIA RULER benchmark refresh for Claude 4.7 — current 25K token cap may be conservative
- Cleanlab confidence learning applied to KB curation (currently we have validation but not active relearning)
- LPW plan-verification benchmarks against our envelope approach
- Aider repo-map benchmarks for Java/Python projects (current snippet inventory is TypeScript-focused)
