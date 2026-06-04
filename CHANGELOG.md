# Changelog

All notable changes per release.

Format: Keep a Changelog (https://keepachangelog.com), SemVer.

## [Unreleased / v0.4 development]

### Added
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
