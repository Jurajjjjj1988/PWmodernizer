# Docs index

> Design briefs, troubleshooting, and post-v1.0 research notes. Operational README is at [`../README.md`](../README.md). Living ROADMAP is at [`../ROADMAP.md`](../ROADMAP.md).

## Design briefs

| Doc | Status | What it covers |
|---|---|---|
| [`playwright-mcp-integration.md`](playwright-mcp-integration.md) | Phase 1-7b shipped, 6 + 7c future | DOM grounding via direct Playwright (Stage 2 gate) + MCP (Stage 1 LLM enrichment). API contract for `scripts/dom-ground.ts`. 7-phase implementation order. |
| [`beyond-v1-research.md`](beyond-v1-research.md) | Scope only | 4 post-v1.0 directions (LangGraph, Claude SDK rewrite, auto-PR-merge, GitHub App). Per-direction motivation, implementation shape, prerequisites. |

## Operational

| Doc | What it covers |
|---|---|
| [`walkthrough.md`](walkthrough.md) | End-to-end walkthrough of a real migration using PR #3 as the running example. |
| [`troubleshooting.md`](troubleshooting.md) | Known failure modes + the exact fix. Updated when a real-world bug surfaces. |
| [`baselines.md`](baselines.md) | Measured smoke + calibrate + per-validator wall-clock timings. Use to spot regressions. |
| [`dom-ground-public-suts.md`](dom-ground-public-suts.md) | Curated catalog of public demo sites for Phase 7c calibration. |

## Where things live (cross-reference)

- Knowledge base — [`../config/knowledge-base.md`](../config/knowledge-base.md) (115 KB IDs across pw/cy/sel)
- KB ID migration scheme — [`../config/kb-id-migration.md`](../config/kb-id-migration.md) (old `KB-N.N.N` → new `<fw>/<topic>/<name>`)
- Prompts — [`../prompts/`](../prompts/) (sources) + [`../prompts/_fragments/`](../prompts/_fragments/) (shared blocks) + [`../prompts/_assembled/`](../prompts/_assembled/) (CI consumed)
- Validators — [`../scripts/`](../scripts/) (16 entries)
- Calibration fixtures — [`../tools/calibrate-pipeline/fixtures/`](../tools/calibrate-pipeline/fixtures/) (46 fixtures across 6 validators)
- Workflows — [`../.github/workflows/`](../.github/workflows/) (7 workflows: plan, migrate, verify, lint-output, regression-test, regression-semantic, regenerate-dispatch)

## Contribution conventions for docs

- Living state (counts, percentages, dates) belongs in `ROADMAP.md` and `CHANGELOG.md`. Briefs here describe DESIGN, not status.
- Each brief opens with a status snapshot table — shipped/future per phase, with commit references.
- Mark a brief **shipped** by editing its §0 status block AND updating the index table above (Status column). Never delete a shipped brief; future readers comparing to current code need the design context.
- Troubleshooting entries are append-only and named by symptom (the user reads the symptom, not the cause). Cause + fix go inside the entry.
