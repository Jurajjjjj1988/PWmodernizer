# PWmodernizer — Claude orientation

> Read this first on every new session. ~100 lines, scannable. Reflects v0.2.0 qa-master architecture.

## What this repo is

PWmodernizer is an LLM-driven 3-stage pipeline that migrates legacy E2E tests (bad Playwright TS, Cypress, Selenium Java, Selenium Python) into **clean modern Playwright TypeScript** you own. As of v0.2.0 every migration emits the **qa-master layered architecture** by default — a spec under `outputs/tests/`, a `PageClass` under `outputs/helper/page-object/pages/`, a base-fixture extension under `outputs/helper/fixtures/`, plus optional blocks / API wrappers / actions / utilities / test-data / types. **Human review is required** before merge. Step 1 (bad-Playwright) is the active quality bar — 70% acceptable rate gates promotion of Cypress / Selenium beyond example status.

## Quick map (v0.2.0)

- `inputs/` — source tests by framework (`bad-playwright/`, `cypress/`, `selenium-java/`, `selenium-python/`, `_stress/`)
- `outputs/` — pipeline deliverables
  - `plans/` — Stage 1 markdown + envelope JSON sidecar
  - `tests/` — Stage 2 spec files (`<kebab>.spec.ts` only; imports `test`/`expect` from `@fixtures/base.fixture`)
  - `helper/` — qa-master layered tree shared across migrations
    - `page-object/{basepage,baseblock}.ts` (committed scaffolding) + `pages/<name>.page.ts` + `blocks/<name>.block.ts`
    - `fixtures/base.fixture.ts` (the ONE file allowed to import from `@playwright/test`; extended per migration)
    - `api/`, `actions/`, `utilities/`, `test-data/`, `types/{external,internal}`
  - `reports/` — per-migration metrics (`<basename>.md` + optional verify lens reports + DOM-probe JSON)
- `prompts/` — Stage 1 (`analyze.md`), Stage 2 (`generate.md`), verify (`verify-sdet.md` + `verify-code-review.md`), plus `_fragments/` + `_assembled/`
- `config/` — `knowledge-base.md` (140+ KB IDs incl. `qa-master/` namespace), `migration-rules.md` §1–§4 rewritten for qa-master, `kb-id-migration.md`
- `examples/reference/qa-master/` — production-grade style anchor Sonnet reads at Stage 2 (real-company Playwright TS, owner-permitted snapshot)
- `scripts/` — validators (`validate-qa-master-conformance.ts`, `validate-report-metrics.ts`, `plan-envelope-validate.ts`, …), evaluators, replay, calibration, dashboards
- `.github/workflows/` — 8 workflows: `plan.yml`, `migrate.yml`, `verify.yml`, `danger.yml`, `regression-test.yml`, `regression-semantic.yml`, `regenerate-dispatch.yml`, `lint-output.yml`
- `docs/` — `walkthrough.md`, `troubleshooting.md`, `baselines.md`, `dom-ground-public-suts.md`, `beyond-v1-research.md`, `playwright-mcp-integration.md`

## The pipeline

```
inputs/<framework>/foo.spec.ts
        │
        ▼
 ┌─────────────────────┐
 │ Stage 1 — Plan      │  reads: kb + rules + qa-master reference + input
 │ plan.yml            │  writes: outputs/plans/foo.spec.ts.md (+ envelope)
 └─────────────────────┘  GATE: PR labeled `migrator:plan` → HUMAN reviews + merges
        │
        ▼
 ┌─────────────────────┐
 │ Stage 2 — Generate  │  reads: approved plan + envelope + kb + rules + qa-master ref
 │ migrate.yml         │  writes: outputs/tests/<kebab>.spec.ts
 └─────────────────────┘         + outputs/helper/page-object/pages/<name>.page.ts
        │                        + outputs/helper/fixtures/base.fixture.ts (extended)
        │                        + helper/{blocks,api,actions,utilities,test-data,types}/* per plan
        │                  GATES: tsc · eslint-plugin-playwright · pw test --list
        │                         · ast-diff-not-trivial · plan-vs-code coverage
        │                         · qa-master conformance · report-metric self-consistency
        ▼                         · evaluate.ts (confidence 0..1)
 ┌─────────────────────┐
 │ Stage 3 — Verify    │  Opus CANDOR (SDET + Code Review) — fires when confidence < 0.7
 │ verify.yml          │  max-severity tally: 2/2 SHIP → SHIP, mixed → FIX FIRST, both block → START OVER
 └─────────────────────┘  writes: outputs/reports/<basename>{-verify-sdet,-verify-code-review}.md
```

Key gates: PR-based human approval after Stage 1, validator wall after Stage 2, dual-perspective verify after Stage 3. `dangerfile.ts` enforces metadata + plan/output coherence on every PR.

## Commands you'll run most

```bash
npm run smoke                  # typecheck:all + validate:all + lint — run before any commit
npm run calibrate              # run 53-fixture corpus (8 validators) locally
npm run validate:all           # kb + examples + assemble + envelope (×2) + derive + coverage + calibrate
npm run check:kb               # verify all KB IDs referenced in prompts/examples resolve
npm run check:examples         # strict mode — examples must be plan/output coherent
npm run check:derive           # round-trip plan markdown → envelope → re-validate
npm run check:dom-ground:live  # DOM grounding live calibration against public SUTs
npm run dashboard              # build dashboard for metrics inspection
gh workflow run plan.yml       # trigger Stage 1 against current branch's inputs/
gh workflow run regenerate-dispatch.yml -f path=outputs/tests/foo.spec.ts  # re-roll a single output
```

## Project rules (non-negotiable)

- **NEVER** add `Co-Authored-By: Claude` or any Claude/Anthropic attribution to commits
- **ALWAYS** commit with email `juraj.kapusansky@gmail.com` (the GitHub-linked address)
- **NEVER** push to `main` without explicit user OK — PR-based flow is the default
- **NEVER** use `any` in TypeScript
- **NEVER** use hard waits (`waitForTimeout`, `setTimeout`, `sleep`) — the pipeline migrates *away from* them
- **ALWAYS** prefer stable selectors: `getByTestId`, `getByRole`, `getByLabel`, `getByPlaceholder` (qa-master priority)
- **NEVER** import `test`/`expect` from `@playwright/test` in a spec — only `outputs/helper/fixtures/base.fixture.ts` may; specs import from `@fixtures/base.fixture` (qa-master conformance hard rule)
- **NEVER** declare an own constructor on a `PageClass`/`BlockClass` — `BasePage`/`BaseBlock` wires `page`; subclasses use `readonly` locator fields with `.describe('[LABEL] …')`
- **NEVER** invent KB IDs — every ID in a plan must exist in `config/knowledge-base.md`
- **NEVER** create wrapper helpers for things Playwright already provides (`test.step`, locator chaining, etc.)

## When in doubt

- **Living state** — `ROADMAP.md` + `CHANGELOG.md` (v0.2.0 entry is the architecture-rewrite delta)
- **Pipeline behavior** — `docs/walkthrough.md` (end-to-end narrative on PromptJupiterTest)
- **qa-master target architecture** — `examples/reference/qa-master/docs/ARCHITECTURE.md` + `docs/CLAUDE.md`
- **Known failure modes** — `docs/troubleshooting.md`
- **KB-ID conventions** — `config/kb-id-migration.md` (kebab-case rules, `qa-master/` namespace)

## Don't touch without intent

- Anything under `outputs/` — pipeline owns it (except the committed scaffolding files: `helper/page-object/{basepage,baseblock}.ts`, `helper/fixtures/base.fixture.ts`, `helper/utilities/logger.ts`)
- `examples/reference/qa-master/` — verbatim style anchor; included with owner permission, not modified
- `dangerfile.ts` — PR gate logic
- `examples/*/expected-*` — golden corpus; `validate-examples.ts --strict` fails on drift
