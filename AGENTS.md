# PWmodernizer — Agentic tool orientation

This file mirrors `CLAUDE.md` but is the conventional landing pad for non-Claude agentic tools (Cursor, Codex, Aider, Continue, Cody). If a tool reads only one orientation file, this is the one it should pick. Claude Code sessions should prefer `CLAUDE.md` (same content, Claude-flavored).

## What this repo is

PWmodernizer is an LLM-driven 3-stage pipeline that migrates legacy E2E tests (bad Playwright TS, Cypress, Selenium Java, Selenium Python) into **clean modern Playwright TypeScript** you own. Each migration produces a plan + generated code + a metrics report; **human review is required** before merge. Step 1 (bad-Playwright) is the active quality bar — 70% acceptable rate gates promotion of Cypress / Selenium beyond example status.

## Quick map

- `inputs/` — source tests by framework (`bad-playwright/`, `cypress/`, `selenium-java/`, `selenium-python/`, `_stress/`)
- `outputs/` — pipeline deliverables (`plans/`, `tests/`, `reports/`)
- `prompts/` — Stage 1/2/verify system prompts + `_fragments/` + `_assembled/`
- `config/` — `knowledge-base.md` (125 KB IDs across pw 25 / cy 50 / sel-java 24 / sel-py 26), `migration-rules.md`, `kb-id-migration.md`
- `scripts/` — 26 TS scripts exposed via npm-run targets (validators, evaluators, replay, calibration, trajectory tracer)
- `tools/calibrate-pipeline/` — 46-fixture corpus across 7 validators + golden outputs; opt-in `dom-ground-live` adds 6 against public SUTs
- `.github/workflows/` — 8 workflows: `plan.yml`, `migrate.yml`, `verify.yml`, `danger.yml`, `regression-test.yml`, `regression-semantic.yml`, `regenerate-dispatch.yml`, `lint-output.yml`
- `docs/` — `walkthrough.md`, `troubleshooting.md`, `baselines.md`, `dom-ground-public-suts.md`, `beyond-v1-research.md`, `playwright-mcp-integration.md`

## The pipeline (read before changing anything)

```
inputs/<framework>/foo.spec.ts
        │
        ▼
 ┌────────────────────┐
 │ Stage 1 — Plan      │  reads: kb + rules + reference style + input
 │ plan.yml            │  writes: outputs/plans/foo.spec.ts.md
 └────────────────────┘  GATE: PR `migrator:plan` → human reviews + merges
        │
        ▼
 ┌────────────────────┐
 │ Stage 2 — Generate  │  reads: approved plan + kb + rules + reference
 │ migrate.yml         │  writes: outputs/tests/foo.spec.ts (+ pages/ + fixtures/)
 └────────────────────┘  GATES: tsc · eslint-plugin-playwright · pw test --list
        │                       · ast-diff-not-trivial · evaluate.ts (confidence 0..1)
        ▼
 ┌────────────────────┐
 │ Stage 3 — Verify    │  SDET review + code review + metrics persistence
 │ verify.yml          │  writes: outputs/reports/foo.spec.ts.md
 └────────────────────┘
```

## Commands you'll run most

```bash
npm run smoke                  # typecheck:all + validate:all + lint — before any commit
npm run calibrate              # local 46-fixture run across 7 validators
npm run validate:all           # full validator chain
npm run check:dom-ground:live  # DOM grounding live calibration
gh workflow run plan.yml       # trigger Stage 1 on current branch
```

## Project rules (non-negotiable)

- **NEVER** add Claude/Anthropic (or any other AI tool) attribution to commits
- **ALWAYS** commit with `juraj.kapusansky@gmail.com` (the GitHub-linked address)
- **NEVER** push to `main` without explicit user OK — PR-based flow only
- **NEVER** use `any` in TypeScript
- **NEVER** use hard waits (`waitForTimeout`, `setTimeout`, `sleep`)
- **ALWAYS** prefer stable selectors: `getByRole`, `getByLabel`, `getByTestId`, `getByPlaceholder`
- **NEVER** invent KB IDs — every ID in a plan must resolve in `config/knowledge-base.md`

## When in doubt

- Living state — `ROADMAP.md` + `CHANGELOG.md`
- Pipeline behavior — `docs/walkthrough.md`
- Known failure modes — `docs/troubleshooting.md`
- Performance baselines — `docs/baselines.md`
- KB-ID conventions — `config/kb-id-migration.md`

## Tool-specific notes

- **Cursor** — project rules live in `.cursorrules` (root) or `.cursor/rules/` (per-domain). Neither is currently present; this `AGENTS.md` is the de facto rules surface until one is added.
- **Aider** — respects `.aider.conf.yml` + `.aider.toml`. Neither is currently present. Aider auto-reads `AGENTS.md` when it's at repo root, which is the case here.
- **Codex** (OpenAI Codex CLI) — uses `AGENTS.md` as its primary orientation file by convention. This file is the source of truth.
- **Continue / Cody** — both honor `AGENTS.md` if no tool-specific config is present.
- **Claude Code** — prefer `CLAUDE.md` (same content, Claude-flavored phrasing).

## Don't touch without intent

- Anything under `outputs/` — pipeline owns it
- `dangerfile.ts` — PR gate logic
- `examples/*/expected-*` — golden corpus enforced by `validate-examples.ts --strict`
