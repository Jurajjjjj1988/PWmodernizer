# PWmodernizer — Claude orientation

> Read this first on every new session. ~100 lines, scannable.

## What this repo is

PWmodernizer is an LLM-driven 3-stage pipeline that migrates legacy E2E tests (bad Playwright TS, Cypress, Selenium Java, Selenium Python) into **clean modern Playwright TypeScript** you own. Each migration produces a plan + generated code + a metrics report; **human review is required** before merge. Step 1 (bad-Playwright) is the active quality bar — 70% acceptable rate gates promotion of Cypress / Selenium beyond example status.

## Quick map

- `inputs/` — source tests by framework (`bad-playwright/`, `cypress/`, `selenium-java/`, `selenium-python/`, `_stress/`)
- `outputs/` — pipeline deliverables (`plans/` markdown, `tests/` generated `.spec.ts` + POMs/fixtures, `reports/` metrics)
- `prompts/` — Stage 1 (`analyze.md`), Stage 2 (`generate.md`), verify (`verify.md` / `verify-code-review.md` / `verify-sdet.md`), plus `_fragments/` + `_assembled/`
- `config/` — `knowledge-base.md` (125 KB IDs across pw 25 / cy 50 / sel-java 24 / sel-py 26), `migration-rules.md`, `kb-id-migration.md` (kebab-case conventions)
- `scripts/` — 26 TS scripts (validators, evaluators, replay, calibration helpers, dashboards, trajectory tracer) exposed via npm-run targets
- `tools/calibrate-pipeline/` — 46-fixture corpus across 7 validators (kb 6 + envelope 6 + ast-diff 10 + examples 6 + coverage 6 + dom-ground 6 + verify-tally 6) + `run-calibration.ts`; opt-in `dom-ground-live` adds 6 more against public SUTs
- `.github/workflows/` — 8 workflows: `plan.yml`, `migrate.yml`, `verify.yml`, `danger.yml`, `regression-test.yml`, `regression-semantic.yml`, `regenerate-dispatch.yml`, `lint-output.yml`
- `docs/` — `walkthrough.md`, `troubleshooting.md`, `baselines.md`, `dom-ground-public-suts.md`, `beyond-v1-research.md`, `playwright-mcp-integration.md`
- `examples/` — paired `expected-plan.md` + `expected-output.spec.ts` per scenario (used by validators)

## The pipeline (read before changing anything)

```
inputs/<framework>/foo.spec.ts
        │
        ▼
 ┌────────────────────┐
 │ Stage 1 — Plan      │  reads: kb + rules + reference style + input
 │ plan.yml            │  writes: outputs/plans/foo.spec.ts.md
 └────────────────────┘  GATE: PR labeled `migrator:plan` → HUMAN reviews + merges
        │
        ▼
 ┌────────────────────┐
 │ Stage 2 — Generate  │  reads: approved plan + kb + rules + reference
 │ migrate.yml         │  writes: outputs/tests/foo.spec.ts (+ pages/ + fixtures/)
 └────────────────────┘  GATES: tsc --noEmit · eslint-plugin-playwright · pw test --list
        │                       · ast-diff-not-trivial · evaluate.ts (confidence 0..1)
        ▼
 ┌────────────────────┐
 │ Stage 3 — Verify    │  SDET review + code review + metrics persistence
 │ verify.yml          │  writes: outputs/reports/foo.spec.ts.md
 └────────────────────┘
```

Key gates: PR-based human approval after Stage 1, validator wall after Stage 2, dual-perspective verify after Stage 3. `dangerfile.ts` enforces metadata + plan/output coherence on every PR.

## Commands you'll run most

```bash
npm run smoke                  # typecheck:all + validate:all + lint — run before any commit
npm run calibrate              # run 46-fixture corpus (7 validators) locally
npm run validate:all           # kb + examples + assemble + envelope (×2) + derive + coverage + calibrate
npm run check:kb               # verify all KB IDs referenced in prompts/examples resolve
npm run check:examples         # strict mode — examples must be plan/output coherent
npm run check:derive           # round-trip plan markdown → envelope → re-validate (12/12)
npm run check:dom-ground:live  # DOM grounding live calibration against public SUTs
npm run dashboard              # build /tmp dashboard for metrics inspection
gh workflow run plan.yml       # trigger Stage 1 against current branch's inputs/
gh workflow run regenerate-dispatch.yml -f path=outputs/tests/foo.spec.ts  # re-roll a single output
```

## Project rules (non-negotiable)

- **NEVER** add `Co-Authored-By: Claude` or any Claude/Anthropic attribution to commits
- **ALWAYS** commit with email `juraj.kapusansky@gmail.com` (the GitHub-linked address) — wrong email creates a phantom contributor on GitHub
- **NEVER** push to `main` without explicit user OK — PR-based flow is the default
- **NEVER** use `any` in TypeScript
- **NEVER** use hard waits (`waitForTimeout`, `setTimeout`, `sleep`) — they're an anti-pattern the pipeline migrates *away from*
- **ALWAYS** prefer stable selectors: `getByRole`, `getByLabel`, `getByTestId`, `getByPlaceholder` — never `nth()` or CSS classes as primary
- **NEVER** invent KB IDs — every ID in a plan must exist in `config/knowledge-base.md`; new IDs go through `config/kb-id-migration.md` conventions
- **NEVER** create wrapper helpers for things Playwright already provides (`test.step`, locator chaining, etc.)

## When in doubt

- **Living state** — `ROADMAP.md` (phased plan) + `CHANGELOG.md` (per-release deltas)
- **Pipeline behavior** — `docs/walkthrough.md` (end-to-end narrative of a single migration)
- **Known failure modes** — `docs/troubleshooting.md` (recurring issues + fixes)
- **Performance baselines** — `docs/baselines.md` (token cost, latency, calibration scores per stage)
- **KB-ID conventions** — `config/kb-id-migration.md` (kebab-case rules, deprecation path)
- **Research backing** — Google FSE 2025 (`arxiv:2504.09691`); honest expectation is ~36% pure-LLM landings, hence human gates everywhere

## Don't touch without intent

- Anything under `outputs/` — pipeline owns it
- `dangerfile.ts` — PR gate logic; changing it changes the contract
- `examples/*/expected-*` — they're the golden corpus; `validate-examples.ts --strict` will fail if you drift them
