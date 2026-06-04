# Contributing to PWmodernizer

Thanks for your interest. This document is the onboarding shortcut.

## Quick start

```bash
git clone https://github.com/Jurajjjjj1988/PWmodernizer.git
cd PWmodernizer
npm ci
npm run smoke   # typecheck:all + validate:all (no Claude session needed)
```

If `npm run smoke` exits 0, your local environment is ready. Everything is gated by it.

## What kind of PRs are most valuable

In rough order of impact per LOC:

1. **`config/knowledge-base.md` entries** — new anti-patterns or API translations. Cite the smell, show the canonical fix, link the eslint rule if there is one. Every entry lifts every future migration.
2. **`examples/*-NN-<topic>/` triples** (input + expected-output + expected-plan) — few-shot examples. Run `npm run check:examples` to confirm KB/Q-ID cross-references resolve.
3. **`config/migration-rules.md`** — the target Playwright style contract. Discussions about rule changes (locator priority, file structure, naming) belong here.
4. **`scripts/` validators / metrics** — fixture-calibrated additions. New validator: add 3 good + 3 bad fixtures under `tools/calibrate-pipeline/fixtures/<validator>/` + golden outputs.
5. **`prompts/*.md` + `prompts/_fragments/*.md`** — Stage 1/2/verify prompts. Run `npm run check:assemble` to validate `{{include:}}` markers.
6. **`.github/workflows/*.yml`** — pipeline mechanics. Keep YAML diff-minimal; add a comment line above any non-obvious step explaining why.

## What kind of PRs need extra review

- **Schema changes** to `config/migration-rules.md` §9 or `scripts/plan-envelope.schema.json` — touches both prompt and code generation; update calibration fixtures.
- **`prompts/_fragments/*.md` edits** — fragments are included verbatim across 3+ prompts; a wording change ripples.
- **`scripts/evaluate.ts` confidence formula** — changing weights affects every future Stage 2's pass/fail-into-verify decision. Document the rationale in the commit.
- **ESLint rule additions** in `eslint.config.js` — research-backed only; cite the source (e.g., `eslint-plugin-playwright` rule docs + a real-world bug it would have caught).

## Pre-push checklist

```bash
npm run smoke            # MUST pass — typecheck + 6 validators + calibration (46 fixtures) + eslint
git push
```

If you edited any file under `prompts/_fragments/` you ALSO need to run:

```bash
npm run assemble-prompts # regenerates prompts/_assembled/*.md from fragments
git add prompts/_assembled/
git commit --amend --no-edit  # or a fresh commit
```

`npm run smoke` (via `check:assemble`) will fail if the committed `_assembled/` files don't match what fresh assembly would produce — better to catch locally than in CI.

CI (`regression-test.yml`) runs equivalent checks on every PR; if smoke passes locally, CI should pass too. If they diverge, the divergence is the bug.

## Stage 1 / Stage 2 / verify changes

Pipeline changes that affect Claude's behavior:

- Test against the canonical `examples/bad-playwright-01-flaky-waits/` first (smallest reproducer)
- Then run against `inputs/bad-playwright/flaky-waits.spec.ts` via `gh workflow run plan.yml -f input_path=inputs/bad-playwright/flaky-waits.spec.ts` — proves the live workflow YAML still works
- Don't ship a workflow change without running it at least once

## Commit message style

- Imperative subject ("fix(stage2): X")
- Cite the commit hash for any prior commit you're correcting
- Describe the bug AND the user-visible impact
- If research-backed, cite the source (arXiv ID, paper title, library name)

## Reviewers' contract

A reviewer who approves a PR is asserting:

- `npm run smoke` passed locally (or CI is green)
- The change matches its commit message — no scope creep
- If it adds a validator: fixtures are present + calibrated
- If it adds a prompt fragment: all consuming prompts assemble cleanly
- If it touches confidence formula: the rationale is documented

## Where to ask questions

- Open an issue tagged `question` for design discussions
- For bugs: include the failing `npm run smoke` output and the relevant `gh run view <id> --log` excerpt
- For prompt changes: include 2-3 specific source files the new prompt would have handled better

## Project values (in priority order)

1. **Honest accuracy ceilings** — never promise 100%. 85% is the realistic Stage 2 ceiling per Microsoft ISE case study; the rest needs human review.
2. **Research-backed defaults** — every gate, threshold, and formula cites a paper or production system pattern (Aider, Sourcegraph Cody, BAML, Cleanlab, Sakasegawa, Tam et al., etc.). See `README.md` "Research-backed defenses".
3. **Single source of truth** — config files + prompt fragments + JSON schema are authoritative; markdown explanations cross-reference them rather than duplicating.
4. **Validator calibration before gating** — uncalibrated validator runs in `--warn`; only `--strict` (CI-blocking) after `tools/calibrate-pipeline/` fixtures green. Per Sakasegawa 2026.
5. **Forced structure can degrade reasoning** — required schema sections that the model previously emitted as emergent reasoning may harm output quality (Tam et al. 2024). Use ENCOURAGED + example over REQUIRED + grep.
