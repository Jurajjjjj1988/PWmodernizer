# PWmodernizer

[![Regression contracts](https://github.com/Jurajjjjj1988/PWmodernizer/actions/workflows/regression-test.yml/badge.svg)](https://github.com/Jurajjjjj1988/PWmodernizer/actions/workflows/regression-test.yml)
[![Lint generated tests](https://github.com/Jurajjjjj1988/PWmodernizer/actions/workflows/lint-output.yml/badge.svg)](https://github.com/Jurajjjjj1988/PWmodernizer/actions/workflows/lint-output.yml)

> An LLM-driven pipeline that turns bad Playwright tests into clean modern Playwright TypeScript. Cypress and Selenium support land in Step 2 and Step 3.

**Honest scope:** PWmodernizer is _assistive scaffolding_, not a deterministic test framework migrator. Each migration produces a markdown plan + generated code + a metrics report. **Human review is required** before merge. Quality target: 70% acceptable rate on the bad-Playwright corpus before opening Step 2 (Cypress).

## Why this exists

Existing tools either (a) trap you in a proprietary DSL (testRigor, Mabl, Functionize), or (b) do syntax-only mechanical conversion (cy2pw — _archived by the Playwright team in Sept 2025_). No serious source-code-in → source-code-out migrator exists for Playwright. We emit standard `.spec.ts` files you own, with a complete audit trail.

Research backing this approach: Google FSE 2025 (`arxiv:2504.09691`) demonstrated multi-stage LLM-driven migration at scale, but **only 36% of changes landed pure-LLM** — 38% required human polish, 25% were human-only. We design accordingly — humans gate every stage in v0.

## Phased build plan

| Step | Source framework | Status | Target rollout |
|---|---|---|---|
| **Step 1** | Bad / outdated Playwright TypeScript | 🚧 In progress | v0 |
| Step 2 | Cypress | ⏸ Pending Step 1 quality bar | v1 |
| Step 3 | Selenium WebDriver (Java + Python) | ⏸ Pending DOM-grounding via playwright-mcp | v2 |

The repo ships knowledge-base and rule content for **all 4** sources (bad-Playwright, Cypress, Selenium Java, Selenium Python) because they share most anti-pattern categories. The pipeline workflows fire on any input file regardless of subfolder. But our **quality bar gate is Step 1 only**: until we hit 70% acceptable migrations on bad-Playwright, we won't promote the other sources beyond example status.

## Architecture overview

```
inputs/bad-playwright/foo.spec.ts
            │
            │  on: push, paths: inputs/**
            ▼
   ┌────────────────────┐
   │  Stage 1 — Plan    │  Claude Sonnet 4.6 (cheap, good)
   │  (plan.yml)        │  Reads:
   └────────────────────┘    - config/knowledge-base.md (cached)
            │                - config/migration-rules.md (cached)
            │                - examples/reference/company-style.spec.ts (style anchor)
            │                - the input file
            ▼                Writes:
   outputs/plans/foo.spec.ts.md   - the plan markdown
            │
            │  open PR labeled `migrator:plan`
            │  HUMAN REVIEWS PLAN → edits if needed → merges
            ▼
   ┌────────────────────┐
   │  Stage 2 — Generate │  Claude Sonnet 4.6
   │  (migrate.yml)      │  Reads:
   └────────────────────┘    - the approved plan
            │                - input file, knowledge-base, rules
            │                - examples/reference/company-style.spec.ts
            │                Writes:
            ▼                  - outputs/tests/foo.spec.ts
   Validation gates:            - outputs/tests/pages/*.page.ts (if plan said extract)
   - tsc --noEmit               - outputs/tests/fixtures/*.fixture.ts (if plan said extract)
   - eslint-plugin-playwright   - outputs/reports/foo.spec.ts.md (metrics)
   - playwright test --list
   - ast-diff-not-trivial check
   - evaluate.ts (emits aggregate confidence 0..1)
            │
            ├──► confidence ≥ 0.7 → open code PR (labeled `migrator:code`)
            │
            └──► confidence < 0.7 → trigger verify.yml
                       │
                       ▼
                ┌────────────────────┐
                │ Verify — consensus  │  Claude Opus 4.7 (expensive, only for low-confidence)
                │ (verify.yml)        │  Reads: plan + output + report.
                └────────────────────┘  Writes: outputs/reports/foo.spec.ts-verify.md
                       │
                       │  Comments on code PR with disagreements + verdict.
                       │  Labels code PR `verify:block` or `verify:warn` if needed.
                       ▼
                HUMAN REVIEWS CODE PR → merges or sends back for regeneration
```

### Why this shape (the research distilled)

- **2-stage plan → code** instead of one-shot: Stage 1 produces an auditable plan that humans can edit. Stage 2 follows that plan literally. This is the only LLM-only pattern that delivers _auditability_ (true determinism with LLMs is a myth — see `arxiv:2410.10628`).
- **Validation cascade** after generation: tsc → eslint --fix → playwright parse → AST diff non-trivial → metrics. Per Google FSE 2025, multi-gate validation > prompt tuning.
- **Confidence-aware routing**: cheap default (Sonnet), expensive verifier (Opus) only fires when needed. Multi-model consensus (CANDOR pattern, `arxiv:2506.02943`) filters hallucinations that prompt engineering can't.
- **Reference style file**: `examples/reference/company-style.spec.ts` is the gold-standard target the migrator anchors output style on. Sogeti Skills methodology — the only honest published pattern in the AI-testing market.

## Quickstart

### Prerequisites

- Node 22+
- GitHub repository secrets (Settings → Secrets and variables → Actions):
  - **`CLAUDE_CODE_OAUTH_TOKEN`** — **required**. Generate locally via `claude setup-token` in a real terminal (requires Claude Pro/Max). The token leverages your existing subscription; no separate Anthropic API billing. Alternative: use `ANTHROPIC_API_KEY` from https://console.anthropic.com/ — to switch, replace `claude_code_oauth_token:` with `anthropic_api_key:` in the `with:` blocks of `.github/workflows/{plan,migrate,verify}.yml`.
  - `MIGRATION_TARGET_URL` — _optional_. If set, generation can ground locators against the live DOM via `playwright-mcp` (planned for v1; for v0 it's not yet wired).

### Local commands (npm scripts)

| Command | What it does | When to run |
|---|---|---|
| `npm run quickstart` | 9-check onboarding (Node, deps, types, KB, examples, fragments, envelope, calibration) with hints | First time setup; debugging "why does CI fail?" |
| `npm run smoke` | Same as CI: typecheck + 6 validators + calibration + eslint. Silent on success | Pre-push, every commit |
| `npm run validate:all` | 5 validators + 24 calibration fixtures | When touching scripts/ or examples/ |
| `npm run check:kb` | KB ID uniqueness + references resolve | When editing knowledge-base.md or expected-plan.md |
| `npm run check:examples` | Examples KB/Q-ID cross-references (strict) | When editing examples/*/expected-plan.md |
| `npm run check:assemble` | Prompt fragment `{{include:}}` markers resolve + `prompts/_assembled/` is in sync with source | When editing prompts/_fragments/ or prompts/*.md (stale detection catches forgotten `npm run assemble-prompts`) |
| `npm run check:envelope` | Canonical envelope schema sanity | When editing scripts/plan-envelope.schema.json |
| `npm run check:derive` | derive-envelope works on every example plan (12/12 roundtrip) | When editing scripts/derive-envelope.ts or example expected-plan.md |
| `npm run calibrate` | Run each validator against 3 good + 3 bad fixtures | After validator code changes |
| `npm run derive-envelope -- --plan <md> --out <json>` | Backfill envelope from markdown plan | When manually fixing a plan that's missing envelope |
| `npm run assemble-prompts` | Expand `{{include:}}` markers into `prompts/_assembled/` | After editing prompts/_fragments/ |
| `npm run typecheck` | TS strict on outputs/tests/ | After editing playwright.config.ts or migrations |
| `npm run typecheck:all` | TS strict across scripts/ + tools/ + outputs/tests/ | Pre-push |
| `npm run lint` / `npm run lint:fix` | ESLint on outputs/tests/ (22 + 11 rules) | When generated test fails CI lint |
| `npm run evaluate` | Run evaluate.ts on a specific migration locally | Debugging confidence score |
| `npm run check:trivial` | AST-diff non-trivial check (ts-morph + Zhang-Shasha) | Debugging "trivial migration" rejection |

### Trigger your first migration

1. Drop a bad Playwright spec into `inputs/bad-playwright/your-test.spec.ts`.
2. Commit and push.
3. **Stage 1 (`plan.yml`) fires automatically.** It produces `outputs/plans/your-test.spec.ts.md` and opens a PR labeled `migrator:plan`.
4. **Review the plan.** Read every row in the locator translation table. Pay attention to MED and LOW confidence entries — these are the LLM's best guesses and may be wrong.
5. Edit the plan in the PR if needed. The plan is a contract — Stage 2 follows it literally.
6. Merge the plan PR.
7. **Stage 2 (`migrate.yml`) fires automatically** on the merge. It produces:
   - `outputs/tests/your-test.spec.ts` — the migrated Playwright code
   - `outputs/tests/pages/*.page.ts` and `outputs/tests/fixtures/*.fixture.ts` — only if the plan said extract them
   - `outputs/reports/your-test.spec.ts.md` — metrics report
   - A second PR labeled `migrator:code` with the generated files
8. **Review the code PR.** The PR description shows aggregate confidence + which validation gates passed. Read the migration report — selector quality score, smell deltas, AST-diff non-trivial flag.
9. Pull the branch locally. Run `npx playwright test outputs/tests/your-test.spec.ts` against your staging app. Verify it catches the same bug class as the source did.
10. Merge or send back for regeneration with feedback (comment `/regenerate <feedback>` on the plan PR — see `regenerate-dispatch.yml`).

### Optional: branch protection for hard verify gate

`verify.yml` is configured to exit 1 on `START OVER` verdict (see `prompts/verify.md` for the 3-level ladder). This makes the workflow run show as a failed check on the code PR. To turn that failed check into a *hard block* on merge:

1. Repo Settings → Branches → Add rule for `main`
2. Enable **Require status checks to pass before merging**
3. Add `verify` (or whatever the workflow name appears as after first run) to the required checks list
4. Optional: also require `regression-test` and `Stage 2 — Generate Playwright code` for full pipeline gating

Without this, START OVER verdicts only label the PR (`verify:start-over`); a reviewer can still click Merge. With it, the PR is blocked until the code is regenerated via `/regenerate` (which produces a new code PR with a fresh verify check).

## Repository structure

```
PWmodernizer/
├── .github/workflows/
│   ├── plan.yml             # Stage 1 — generates migration plan markdown
│   ├── migrate.yml          # Stage 2 — generates Playwright TS code
│   ├── verify.yml           # Multi-model consensus (only on low-confidence)
│   └── lint-output.yml      # Standalone eslint on outputs/tests/**
├── config/
│   ├── migration-rules.md   # Target style + structure contract (~4,300 words, 85 rules)
│   └── knowledge-base.md    # Anti-pattern catalog + API translation tables (~7,200 words, 52 anti-patterns, 155 mappings)
├── prompts/
│   ├── analyze.md           # Stage 1 system prompt
│   ├── generate.md          # Stage 2 system prompt
│   └── verify.md            # Verify-stage system prompt
├── inputs/
│   ├── bad-playwright/      # Step 1 — focus
│   ├── cypress/             # Step 2 — content ready, gate closed
│   ├── selenium-java/       # Step 3 — content ready, gate closed
│   └── selenium-python/     # Step 3 — content ready, gate closed
├── outputs/
│   ├── plans/               # Stage 1 deliverables (per-input markdown)
│   ├── tests/               # Stage 2 deliverables (the migrated code)
│   │   └── tsconfig.json    # Strict mode + Playwright types
│   └── reports/             # Per-migration metrics (one per input + optional -verify)
├── examples/
│   ├── reference/
│   │   └── company-style.spec.ts  # The gold-standard target Claude anchors on
│   ├── bad-playwright-01-flaky-waits/   # input + expected-output + expected-plan
│   ├── bad-playwright-02-nth-selectors/
│   ├── cypress-01-login-flow/           # Step 2 reference (not yet active)
│   ├── cypress-02-form-validation/
│   ├── selenium-java-01-search/         # Step 3 reference (not yet active)
│   ├── selenium-java-02-checkout/
│   ├── selenium-python-01-login/
│   └── selenium-python-02-modal-interaction/
├── scripts/
│   ├── evaluate.ts                  # Emits per-migration metrics report
│   └── ast-diff-trivial-check.ts    # Fails the build on cosmetic-only migrations
├── tsconfig.json            # Strict TS root config (scripts)
├── outputs/tests/tsconfig.json  # Strict TS for generated tests
├── .eslintrc.cjs            # eslint-plugin-playwright + TS strictness
├── package.json
└── README.md                # You are here.
```

## Quality gates (what the pipeline enforces)

**Stage 0 pre-flight** (before Claude is even called):
- Input must be 200B+ (not empty/stub)
- Input must tokenize to ≤25K tokens (NVIDIA RULER context-degradation threshold)
- Encoding must be UTF-8 or US-ASCII (`file --mime-encoding`)
- Must contain test markers (`test|it|describe|@Test|def test_|cy.|page.`)
- Secret scan against AWS / Stripe live / GitHub PAT / Slack / Anthropic / OpenAI tokens (warn, not block)

**Stage 2 generation gates** — code PR opens only if all pass:

- `tsc --noEmit` passes (strict mode, no `any`)
- `eslint --fix` with 22 `eslint-plugin-playwright` rules + 11 research-backed additions (`prefer-native-locators`, `no-element-handle`, `no-networkidle`, `no-unsafe-references`, `max-nested-describe: 2`, etc.)
- `npx playwright test --list` enumerates the generated spec (parses as a real Playwright test)
- **AST-diff-not-trivial** check: ts-morph + Zhang-Shasha tree-edit-distance with identifier normalization (`$id`, `$str`). Reject if normalized distance < 5% of max tree size. Falls back to LCS overlap > 80% for `.java`/`.py` inputs where ts-morph can't parse. (See `scripts/ast-diff-trivial-check.ts`.)
- **Output secret scan**: mirrors Stage 0 pre-flight against generated output — blocks if Claude hallucinated a real prod credential
- **Lint-and-test feedback loop** (Aider pattern): if any of `tsc`/`eslint`/`playwright parse` fails, retry once with errors fed back to Claude; hard-fail after 1 retry
- No forbidden patterns: `waitForTimeout`, `force: true`, `.nth()`, `test.only`, `test.skip`, `page.pause()`, `: any`, `as unknown as`, `console.log`

Stage 2 emits aggregate confidence (0..1):

- **≥ 0.7**: opens code PR for human review.
- **< 0.7**: triggers `verify.yml` (Opus second opinion). The verify report comments on the code PR; if it produces a `block` verdict, the code PR is labeled `verify:block` until a human resolves it.

The aggregate confidence formula (updated 2026-06-04 to reward output-quality signals):
```
0.40 × plan_confidence
+ 0.25 × selector_quality
+ 0.10 × web_first_rate
+ 0.15 × smell_removal_rate    (source smells eliminated in output)
+ 0.10 × forbidden_absence     (1.0 if no forbidden patterns in output)
```

Previous formula (0.6/0.3/0.1) capped output-driven confidence at the plan's own confidence — a high-quality Stage 2 migration of an ambitious plan was stuck below 0.7 even when all gates passed. New formula rewards the substantive work of Stage 2 and triggers verify only when there's real cause. See `scripts/evaluate.ts` `computeAggregateConfidence` for the implementation; the migration report includes a per-signal breakdown table.

## Known limitations (read before opening issues)

- **Pure-LLM landed rate is 36%** in Google's industrial study. Plan accordingly — you WILL spend time reviewing.
- **Selector hallucinations** are the #1 failure mode without DOM access. Until `playwright-mcp` grounding lands in v1, every locator that wasn't a direct ID/testid translation carries LOW or MED confidence by design.
- **Magic Number Test smell** appears in 99.85% of LLM-generated unit tests (`arxiv:2410.10628`). We post-process with smell detection but don't promise to catch all instances.
- **Pre-existing test failures in your target app** make pass/fail signal unreliable. Record a baseline before migrating.
- **Selenium Java/Python are Step 3** for a reason — no public migrator exists for them. The cross-language + cross-paradigm gap is real. We mark every Selenium locator as LOW confidence.
- **CodeBLEU is NOT used as a quality metric** — superseded by CodeBERTScore (semantic) + CrystalBLEU (n-gram with trivial-grams stripped). We use selector quality + smell deltas + AST non-triviality (ts-morph + Zhang-Shasha) + execution-based mutation-kill-rate as primary signal.
- **Realistic accuracy ceiling is ~85%** — Microsoft ISE case study + multiple independent reports (Stagehand→Playwright, GitHub Copilot Workspace) all converge on 85% as the LLM-generated-Playwright-code correctness bound. The remaining 15% requires human review per migration. Plan downstream review capacity accordingly — don't promise 100%.

## Costs

The pipeline uses Anthropic prompt caching. Knowledge-base + migration-rules + reference style (~13k tokens combined) cache at 0.1× the input price. A typical 60-line bad-Playwright migration costs roughly:

- Stage 1 (Sonnet): ~0.05 USD
- Stage 2 (Sonnet): ~0.10 USD
- Verify (Opus, only ~25% of migrations): ~0.30 USD

Realistic: **$0.15–0.40 per migration**, ceiling $0.50.

## Anti-patterns we explicitly do NOT promise

The commercial AI testing market is full of these. Migrator does not do them:

- ❌ "Full code export" theatre (the export is unmaintainable)
- ❌ NL-DSL lock-in (output is real Playwright TypeScript)
- ❌ Self-healing oversold ("works on minor changes" is the disclaimer hidden in their FAQs)
- ❌ Hidden per-seat / per-run / per-SKU pricing (we are OSS)
- ❌ Live-mode "AI fixing flaky tests in your CI" — that's a different product

## Research-backed defenses against hallucination

The pipeline implements specific patterns from the LLM-as-code-author literature:

- **Snippet inventory grounding (Aider repo-map / Sourcegraph Cody RAG):** before Stage 2 generation, the workflow enumerates existing POMs/fixtures/helpers and injects their export signatures into the prompt. Forces reuse over reinvention. See `migrate.yml` "Build snippet inventory" step.
- **Lint-and-test feedback loop (Aider pattern):** if `tsc`/`eslint`/`playwright parse` fails after generation, the errors are fed back to Claude with a 1-retry hard cap. Cuts hallucination rate before any human sees the output.
- **Plan envelope JSON sidecar (LPW / Routine pattern):** machine-validatable schema (`scripts/plan-envelope.schema.json`) alongside the markdown plan. Opt-in; validates Stage 1 output against contracts before Stage 2 reads it.
- **Few-shot example validation (Cleanlab pattern):** `scripts/validate-examples.ts` cross-checks every `examples/*/expected-plan.md` against `knowledge-base.md` (KB-IDs) and its own Open-questions section (Q-IDs). Currently 21 dangling Q-IDs surfaced in Selenium plans (synthesized Q-slugs that don't bind).
- **BAML-style prompt fragments:** `prompts/_fragments/*.md` define shared rules (locator-priority, verdict-ladder, KB-ID format, plan schema) included via `{{include:}}` markers; `scripts/assemble-prompts.ts` expands them. Single source of truth across analyze/generate/verify prompts.
- **Schema demotion under Tam et al. 2024:** the `Hallucination-defense pins` section was emergent in early runs; we considered making it mandatory, then demoted it back to ENCOURAGED after research showed forced structured-output sections degrade reasoning quality (JSON-mode dropped Claude 3 Haiku 86.5%→23.4% on GSM8K).
- **Token-based input gate (NVIDIA RULER):** Stage 0 uses character/4 token estimate capped at 25K (well below the ~50% degradation threshold of Claude's 1M context).
- **3-level verdict ladder (from QA-skills `22-reality-check.md`):** `SHIP IT` / `FIX FIRST` / `START OVER` — round-up rule, no soft middle.
- **Uncalibrated validators run in warn-only mode (Sakasegawa 2026):** `validate-examples.ts` is `--warn` until `tools/calibrate-pipeline/` fixtures land. Premature gating produces false confidence.
- **Abandon-and-regenerate flow:** `/regenerate` slash command via `peter-evans/slash-command-dispatch` lets a reviewer close a bad plan PR and force fresh Stage 1 with comment body as feedback. (`regenerate-dispatch.yml`)

## Contributing

See **[CONTRIBUTING.md](CONTRIBUTING.md)** for the full guide — onboarding, PR impact tier, review contract, project values.

Quick orientation: PRs that improve `config/migration-rules.md`, `config/knowledge-base.md`, `examples/reference/company-style.spec.ts`, or `prompts/*.md` directly improve every future migration. PRs that add new validation gates to `scripts/` raise the quality floor.

PRs that add a new input source (Cypress, Selenium) should also include 2+ seed examples in `examples/` and unlock the gate in `README.md` only after the bad-Playwright corpus hits the 70% bar.

Before opening a PR, run `npm run quickstart` — it runs the same gates CI runs and explains each one. Issue templates live in `.github/ISSUE_TEMPLATE/`.

## License

MIT. See `LICENSE`.

## References

- Google FSE 2025 — Migrating Code At Scale With LLMs At Google: https://arxiv.org/abs/2504.09691
- Test smells in LLM-generated unit tests: https://arxiv.org/abs/2410.10628
- Testing Framework Migration with LLMs (AST 2026): https://arxiv.org/pdf/2602.02964
- CANDOR (multi-agent consensus): https://arxiv.org/abs/2506.02943
- CodeBERTScore (semantic code similarity, supersedes CodeBLEU): https://arxiv.org/abs/2302.05527
- CrystalBLEU (strips trivially-shared n-grams, 4× distinguishability over CodeBLEU): ASE 2022, https://software-lab.org/publications/ase2022_CrystalBLEU.pdf
- Test-migration accuracy ceiling — ~85% LLM-correct, requires human review (Microsoft ISE case study + multiple independent reports): https://devblogs.microsoft.com/ise/app-modernization-llm-driven-ui-tests-hve/
- LLM code-generation hallucination taxonomy (3 categories, 12 subtypes): https://arxiv.org/abs/2404.00971
- Plan-and-Act (planner/executor pattern, no formal contract): https://arxiv.org/abs/2503.09572
- LPW Planning-Driven Programming (plan-verification as plan-vs-code contract): https://arxiv.org/abs/2411.14503
- AIMigrate (diff-context migration): https://arxiv.org/abs/2511.00160
- Playwright official docs: https://playwright.dev
- eslint-plugin-playwright: https://github.com/playwright-community/eslint-plugin-playwright
- Microsoft playwright-mcp: https://github.com/microsoft/playwright-mcp
- Sogeti Skills methodology: https://labs.sogeti.com/from-test-case-to-running-playwright-spec-how-skills-make-agentic-ai-test-automation-efficient/
