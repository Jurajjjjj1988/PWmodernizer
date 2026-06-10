# PWmodernizer

[![Regression contracts](https://github.com/Jurajjjjj1988/PWmodernizer/actions/workflows/regression-test.yml/badge.svg)](https://github.com/Jurajjjjj1988/PWmodernizer/actions/workflows/regression-test.yml)
[![Lint generated tests](https://github.com/Jurajjjjj1988/PWmodernizer/actions/workflows/lint-output.yml/badge.svg)](https://github.com/Jurajjjjj1988/PWmodernizer/actions/workflows/lint-output.yml)
[![Danger PR policy](https://github.com/Jurajjjjj1988/PWmodernizer/actions/workflows/danger.yml/badge.svg)](https://github.com/Jurajjjjj1988/PWmodernizer/actions/workflows/danger.yml)

> An LLM-driven 3-stage pipeline that turns bad Playwright / Cypress / Selenium tests into clean modern Playwright TypeScript. Step 1 (bad-Playwright) is the active quality bar; Step 2 (Cypress) and Step 3 (Selenium) ride the same rails with deferred promotion.

**Honest scope:** PWmodernizer is _assistive scaffolding_, not a deterministic test framework migrator. As of **v0.2.0** every migration produces a markdown plan + JSON envelope + a **multi-file qa-master layered output** (spec + `PageClass` + `base.fixture` extension + optional blocks/api/actions/utilities/test-data/types) + a metrics report + a verify verdict. **Human review is required** before merge. Quality target: 70% acceptable rate on the bad-Playwright corpus before promoting Cypress/Selenium beyond example status.

## What you get (v0.2.0 qa-master)

The Stage 2 default output is the **qa-master layered architecture** — a real-company production-grade tree, not a single bare `.spec.ts`:

```
outputs/
├── tests/
│   └── <kebab>.spec.ts                          # imports test/expect from @fixtures/base.fixture
└── helper/
    ├── page-object/
    │   ├── basepage.ts        (committed)        # abstract BasePage — wires `page`
    │   ├── baseblock.ts       (committed)        # abstract BaseBlock — for reusable sections
    │   ├── pages/<name>.page.ts                  # PageClass<Name>, readonly locators w/ .describe()
    │   └── blocks/<name>.block.ts                # BlockClass<Name> (when section ≥5 locators / 3 methods)
    ├── fixtures/
    │   └── base.fixture.ts    (committed shell)  # ONLY file allowed to import @playwright/test
    ├── api/<name>.api.ts                         # request wrappers for data prep
    ├── actions/<name>.ts                         # cross-page flows
    ├── utilities/<verb>-<noun>.ts                # PURE functions (parse*/get*/calculate*/verify*)
    ├── test-data/<name>.ts                       # URLs, LABEL_* prefixes, magic strings
    └── types/{external,internal}/<name>.ts       # data shapes
```

The single-spec minimal mode from v0.1.x is gone. Every migration emits the layered tree because that's what a senior SDET would write. The architecture is anchored on the verbatim `examples/reference/qa-master/` snapshot (real-company Playwright tests, owner-permitted) — see `examples/reference/qa-master/docs/ARCHITECTURE.md` for the structural spec. Hard-enforced by `scripts/validate-qa-master-conformance.ts` (wired into `migrate.yml`).

The v0.2.0 calibration loop closed at **11 iterations** of prompt + validator + workflow fixes on the canonical PromptJupiterTest migration: Stage 2 run `27265040399` succeeded, verify run `27265926538` returned **FIX FIRST** (max-severity tally across SDET + Code Review). End-to-end narrative: [`docs/walkthrough.md`](docs/walkthrough.md).

## Current state (2026-06-10)

The pipeline is end-to-end PROVEN on random public GitHub tests. Status snapshot:

- **6/6 random public Selenium tests → solid Stage 1 plans** (PR #6 PromptJupiter, #10 SelHQ Python, #11 ExplicitWait, #12 AddCookies, #14 FluentWait, #19 ShadowDOM — all real bonigarcia/SeleniumHQ Apache-2.0 code, zero hallucinated KB-IDs across ~50 anti-pattern citations)
- **5/5 Stage 2 cross-language code outputs** (PR #13/#15/#16/#17/#18 — Java + Python → Playwright TS, all `confidence:high`, plan:scenario pins emitted, hallucination-defense WHY-comments materialised)
- **CANDOR verify validated N=3** (PR #16 = 2/2 SHIP IT, PR #15/#17 = SHIP IT + FIX FIRST = reviewer required — real divergence, not synthetic agreement)
- **DOM grounding** — Phase 7c live calibration 6/6 GREEN against `saucedemo.com` + `conduit.bondaracademy.com` + `practicetestautomation.com`; `DOM_GROUND_STRICT=true` set as repo var
- **8 validators / 53 calibration fixtures** GREEN (kb 6 + envelope 6 + ast-diff 11 + examples 6 + coverage 6 + dom-ground 6 + verify-tally 6 + danger-policy 6)
- **9 real infra bugs found + fixed today** (Stage 0 `\b@Test\b` + `\bdef test_\b` regex, AST-diff cross-language path, plan-code-coverage path, evaluate path, peer-dep ERESOLVE, peter-evans 400 auth, regression-semantic checkbox parser, verify parser `Verdict: **SHIP IT**` format)
- **Walkthrough** uses real bonigarcia migration (PR #6 → PR #13) as canonical example

## Why this exists

Existing tools either (a) trap you in a proprietary DSL (testRigor, Mabl, Functionize), or (b) do syntax-only mechanical conversion (cy2pw — _archived by the Playwright team in Sept 2025_). No serious source-code-in → source-code-out migrator exists for Playwright. We emit standard `.spec.ts` files you own, with a complete audit trail.

Research backing: Google FSE 2025 (`arxiv:2504.09691`) demonstrated multi-stage LLM-driven migration at scale, but **only 36% of changes landed pure-LLM** — 38% required human polish, 25% were human-only. We design accordingly — humans gate every stage in v0.

## Phased build plan

| Step | Source framework | Status | Target rollout |
|---|---|---|---|
| **Step 1** | Bad / outdated Playwright TypeScript | Active quality bar | v0 |
| Step 2 | Cypress | Pipeline live, gate closed pending Step 1 hits 70% | v1 |
| Step 3 | Selenium WebDriver (Java + Python) | Pipeline live, gate closed pending Step 1 + DOM-grounding hardening | v2 |

The repo ships knowledge-base and rule content for **all 4** sources (bad-Playwright, Cypress, Selenium Java, Selenium Python) because they share most anti-pattern categories. The pipeline workflows fire on any input file regardless of subfolder. Our **quality bar gate is Step 1 only**: until we hit 70% acceptable migrations on bad-Playwright, we won't promote the other sources beyond example status.

## Architecture overview

```
inputs/<framework>/foo.spec.ts
            │
            │  on: push, paths: inputs/**
            ▼
   ┌────────────────────┐
   │  Stage 1 — Plan    │  Claude Sonnet 4.6 (cheap, good)
   │  (plan.yml)        │  Reads:
   └────────────────────┘    - config/knowledge-base.md (cached, incl. qa-master/ namespace)
            │                - config/migration-rules.md §1–§4 (qa-master contract, cached)
            │                - examples/reference/qa-master/ (production style anchor)
            │                - prompts/_assembled/analyze.md (fragment-expanded)
            │                - the input file
            ▼                Writes:
   outputs/plans/foo.spec.ts.md       - the plan markdown (incl. §5 file-emission table)
   outputs/plans/foo.spec.ts.envelope.json  - LPW machine-validatable contract w/ requiredPages,
                                              requiredBlocks, requiredApi, requiredActions,
                                              requiredUtilities, requiredTestData, requiredTypes
            │
            │  open PR labeled `migrator:plan`
            │  HUMAN REVIEWS PLAN → edits if needed → merges
            ▼
   ┌────────────────────┐
   │  Stage 2 — Generate │  Claude Sonnet 4.6
   │  (migrate.yml)      │  Reads:
   └────────────────────┘    - the approved plan + envelope (fail-fast validation)
            │                - input file, knowledge-base, rules
            │                - examples/reference/qa-master/ (layered architecture anchor)
            │                - snippets inventory (existing POMs/fixtures/helpers in outputs/helper/)
            ▼                Writes (qa-master layered tree, always multi-file):
   Validation gates:           - outputs/tests/<kebab>.spec.ts (imports from @fixtures/base.fixture)
   - tsc --noEmit              - outputs/helper/page-object/pages/<name>.page.ts
   - eslint-plugin-playwright  - outputs/helper/page-object/blocks/<name>.block.ts (when warranted)
     + no-restricted-imports   - outputs/helper/fixtures/base.fixture.ts (extended; never replaced)
   - playwright test --list    - outputs/helper/api/<name>.api.ts (when data prep needed)
   - ast-diff-not-trivial      - outputs/helper/actions/<name>.ts (cross-page flows)
   - plan-vs-code coverage     - outputs/helper/utilities/<verb>-<noun>.ts (pure, unit-tested)
   - qa-master conformance     - outputs/helper/test-data/<name>.ts (constants + LABEL_* prefixes)
     (NEW in v0.2.0)           - outputs/helper/types/{external,internal}/<name>.ts (data shapes)
   - report-metric self-check  - outputs/reports/<basename>.md (metrics)
   - dom-ground probe (opt-in, MIGRATION_TARGET_URL)
   - evaluate.ts (emits aggregate confidence 0..1 via 5-signal v2 formula)
            │
            ├──► confidence ≥ 0.7 → open code PR (labeled `migrator:code`)
            │
            └──► confidence < 0.7 → trigger verify.yml
                       │
                       ▼
                ┌────────────────────┐
                │ Verify — CANDOR     │  Claude Opus 4.7 split into 2 parallel sub-agents
                │ (verify.yml)        │  - SDET (locators / web-first / flakiness / pins)
                └────────────────────┘  - Code Review (TS strict / KB-grounding / structure)
                       │                Tally: 2/2 SHIP IT → SHIP IT; 1/2 → FIX FIRST; 0/2 → START OVER
                       │
                       │  Comments on code PR with disagreements + verdict.
                       │  Labels code PR `verify:block` or `verify:warn` if needed.
                       │  Auto-fires repository_dispatch type: regenerate-plan on START OVER (cap 3).
                       ▼
                HUMAN REVIEWS CODE PR → merges or sends back for regeneration
```

### Why this shape (the research distilled)

- **2-stage plan → code** instead of one-shot: Stage 1 produces an auditable plan + JSON envelope that humans can edit. Stage 2 follows that envelope literally with `// plan:scenario=<id>` pins verified post-hoc. This is the only LLM-only pattern that delivers _auditability_ (true determinism with LLMs is a myth — see `arxiv:2410.10628`).
- **Validation cascade** after generation: tsc → eslint --fix → playwright parse → AST diff non-trivial → plan-vs-code coverage → metrics. Per Google FSE 2025, multi-gate validation > prompt tuning.
- **Confidence-aware routing**: cheap default (Sonnet), expensive verifier (Opus split into 2 sub-agents) only fires when needed. CANDOR multi-agent consensus (`arxiv:2506.02943`) filters single-perspective hallucinations.
- **Reference style file**: `examples/reference/company-style.spec.ts` is the gold-standard target the migrator anchors output style on. Sogeti Skills methodology — the only honest published pattern in the AI-testing market.

## Quickstart

### Prerequisites

- Node 22+
- GitHub repository secrets (Settings → Secrets and variables → Actions):
  - **`CLAUDE_CODE_OAUTH_TOKEN`** — **required**. Generate locally via `claude setup-token` in a real terminal (requires Claude Pro/Max). The token leverages your existing subscription; no separate Anthropic API billing. Alternative: use `ANTHROPIC_API_KEY` from https://console.anthropic.com/ — to switch, replace `claude_code_oauth_token:` with `anthropic_api_key:` in the `with:` blocks of `.github/workflows/{plan,migrate,verify}.yml`.
  - **`MIGRATION_TARGET_URL`** — _optional_. If set, Stage 2 enables the dom-ground step against the live SUT. Default soft gate; promote to hard via the `DOM_GROUND_STRICT=true` repo variable.

### Local commands (npm scripts)

| Command | What it does | When to run |
|---|---|---|
| `npm run quickstart` | 10-check onboarding (Node, deps, types, KB, examples, fragments, envelope, derive-roundtrip, calibration) with hints | First time setup; debugging "why does CI fail?" |
| `npm run smoke` | Same as CI: typecheck:all + 8 validators + 53-fixture calibration + eslint. Silent on success | Pre-push, every commit |
| `npm run validate:all` | 8 validators + 53 calibration fixtures | When touching scripts/ or examples/ |
| `npm run check:kb` | KB ID uniqueness + references resolve (125 IDs, 55 refs as of 2026-06-04) | When editing knowledge-base.md or expected-plan.md |
| `npm run check:examples` | Examples KB/Q-ID cross-references (strict) | When editing examples/*/expected-plan.md |
| `npm run check:assemble` | Prompt fragment `{{include:}}` markers resolve + `prompts/_assembled/` is in sync with source | When editing prompts/_fragments/ or prompts/*.md (stale detection catches forgotten `npm run assemble-prompts`) |
| `npm run check:envelope` | Canonical envelope schema sanity | When editing scripts/plan-envelope.schema.json |
| `npm run check:envelope:code` | Unified envelope `--code` mode — cross-references `// plan:scenario=<id>` pins in `.spec.ts` against envelope scenarios | When editing scripts/plan-envelope-validate.ts |
| `npm run check:derive` | derive-envelope works on every example plan (12/12 roundtrip) | When editing scripts/derive-envelope.ts or example expected-plan.md |
| `npm run check:coverage` | plan-vs-code coverage check (LPW closure) — verifies envelope scenario IDs appear as `// plan:scenario=X` comments in code | When editing scripts/plan-code-coverage.ts or testing a Stage 2 output locally |
| `npm run check:dom-ground` | DOM grounding smoke (mock URL, 8 locators from canonical good output) | When editing scripts/dom-ground.ts |
| `npm run check:dom-ground:live` | DOM grounding live calibration (3 public SUTs, 6/6 GREEN as of commit `7d4746d`) | When the live SUT catalog changes or before flipping `DOM_GROUND_STRICT` |
| `npm run dom:snapshot` | `@playwright/mcp` accessibility-tree snapshot of a URL — Phase 6 Stage 1 enrichment stub | Probing what DOM evidence Stage 1 could feed Sonnet for a candidate SUT |
| `npm run trajectory:trace` | Walk an input file through plan + envelope + code + verify reports; emit JSON tracing per-stage decisions | Debugging "what did the pipeline actually decide on file X" |
| `npm run trajectory:show` | Pretty-print the trajectory JSON | After `trajectory:trace`, for human-friendly read |
| `npm run ast-diff:sweep` | Threshold-sensitivity sweep across 10 AST-diff calibration fixtures + safe-band report | When considering retuning the 5% threshold |
| `npm run stress:test-stage0` | Run Stage 0 sanity simulator against 15 adversarial fixtures (empty/huge/encoding/credentials/mixed-encoding/...) | When editing the Stage 0 sanity gate in plan.yml |
| `npm run stage1:replay` | Replay Stage 1 with SHA-256(input+prompt+feedback) cache; `--write-cache` / `--force-fresh` flags | Local prompt iteration without burning Claude quota |
| `npm run build-inventory` | Builds `outputs/.snippets-inventory.md` from existing POMs/fixtures/helpers (Aider/Cody pattern) | Debugging Stage 2 inventory output |
| `npm run metrics:report` | Reads `outputs/.metrics.db` and prints cross-run trends (per-framework counts, KB-ID frequency, verdict distribution, confidence sparkline) | Inspecting pipeline trends after >=3 real runs |
| `npm run metrics:export` | Exports the same data as JSON | CI artifact upload, future dashboard backend |
| `npm run dashboard` | Starts a read-only web UI at http://localhost:8000 reading `outputs/.metrics.db` (5 charts including per-framework stacked verdict + multi-line confidence trend + "Migrator quality by framework" table) | Visual review of cross-run metrics |
| `npm run calibrate` | Run 8 validators against 53 fixtures (kb 6 + envelope 6 + ast-diff 11 + examples 6 + coverage 6 + dom-ground 6 + verify-tally 6 + danger-policy 6) | After validator code changes |
| `npm run derive-envelope -- --plan <md> --out <json>` | Backfill envelope from markdown plan | When manually fixing a plan that's missing envelope |
| `npm run assemble-prompts` | Expand `{{include:}}` markers into `prompts/_assembled/` | After editing prompts/_fragments/ |
| `npm run typecheck` | TS strict on outputs/tests/ | After editing playwright.config.ts or migrations |
| `npm run typecheck:all` | TS strict across scripts/ + tools/ + outputs/tests/ | Pre-push |
| `npm run lint` / `npm run lint:fix` | ESLint on outputs/tests/ (22 + 11 rules) | When generated test fails CI lint |
| `npm run evaluate` | Run evaluate.ts on a specific migration locally | Debugging confidence score |
| `npm run check:trivial` | AST-diff non-trivial check (ts-morph + Zhang-Shasha for `.ts`; tree-sitter for `.java`/`.py`) | Debugging "trivial migration" rejection |

### Trigger your first migration

> Full end-to-end walkthrough using a real merged PR as the example: [`docs/walkthrough.md`](docs/walkthrough.md). PR #6 (real bonigarcia Selenium test plan) → PR #13 (cross-language code output) is the canonical narrative.

1. Drop a bad Playwright (or Cypress / Selenium) spec into `inputs/<framework>/your-test.spec.ts`.
2. Commit and push.
3. **Stage 1 (`plan.yml`) fires automatically.** It produces `outputs/plans/your-test.spec.ts.md` + `outputs/plans/your-test.spec.ts.envelope.json` and opens a PR labeled `migrator:plan`.
4. **Review the plan.** Read every row in the locator translation table. Pay attention to MED and LOW confidence entries — these are the LLM's best guesses and may be wrong.
5. Edit the plan in the PR if needed. The envelope is a contract — Stage 2 validates it BEFORE reading the plan body and follows it literally.
6. Merge the plan PR.
7. **Stage 2 (`migrate.yml`) fires automatically** on the merge. It produces the **qa-master layered output** (multi-file by default):
   - `outputs/tests/your-test.spec.ts` — the migrated Playwright spec (imports `test`/`expect` from `@fixtures/base.fixture`, `// plan:scenario=<id>` pin on every test block)
   - `outputs/helper/page-object/pages/<name>.page.ts` — the `PageClass`, `readonly` locator fields with `.describe('[LABEL] …')`, no own constructor
   - `outputs/helper/fixtures/base.fixture.ts` — extended with the page-object fixture entry for this migration (the scaffolding shell stays committed)
   - `outputs/helper/test-data/<name>.ts` — constants (URLs, LABEL_* prefixes, extracted magic strings)
   - optional helper layers per plan: `blocks/`, `api/`, `actions/`, `utilities/`, `types/{external,internal}/`
   - `outputs/reports/your-test.spec.ts.md` — metrics report with per-signal confidence breakdown
   - `outputs/reports/your-test.spec.ts-dom-probe.json` — DOM grounding evidence (if `MIGRATION_TARGET_URL` is set)
   - A second PR labeled `migrator:code` with the generated files
8. **Review the code PR.** The PR description shows aggregate confidence + which validation gates passed. Read the migration report — selector quality score, smell deltas, AST-diff non-trivial flag.
9. Pull the branch locally. Run `npx playwright test outputs/tests/your-test.spec.ts` against your staging app. Verify it catches the same bug class as the source did.
10. Merge or send back for regeneration with feedback (comment `/regenerate <feedback>` on the plan PR — see `regenerate-dispatch.yml`).

### Optional: branch protection for hard verify gate

`verify.yml` is configured to exit 1 on `START OVER` verdict (see `prompts/verify-sdet.md` + `prompts/verify-code-review.md` for the 3-level ladder). This makes the workflow run show as a failed check on the code PR. To turn that failed check into a *hard block* on merge:

1. Repo Settings → Branches → Add rule for `main`
2. Enable **Require status checks to pass before merging**
3. Add `verify-tally` (or whatever the workflow job name appears as after first run) to the required checks list
4. Optional: also require `regression-test`, `danger`, and `Stage 2 — Generate Playwright code` for full pipeline gating

Without this, START OVER verdicts only label the PR (`verify:start-over`); a reviewer can still click Merge. With it, the PR is blocked until the code is regenerated via `/regenerate` (which produces a new code PR with a fresh verify check). Auto-regen also fires on START OVER (commit `8d48060`) up to `regen-attempt:max-reached` cap 3.

## Repository structure

```
PWmodernizer/
├── .github/workflows/
│   ├── plan.yml                  # Stage 1 — generates migration plan markdown + envelope JSON
│   ├── migrate.yml               # Stage 2 — generates Playwright TS code (+ dom-ground opt-in + plan-vs-code coverage)
│   ├── verify.yml                # CANDOR 2-agent verify (SDET + Code Review + tally)
│   ├── danger.yml                # PR-quality policy (6 rules, commit 9950167)
│   ├── lint-output.yml           # Standalone eslint on outputs/tests/**
│   ├── regression-test.yml       # CI matrix: 10 parallel checks (~45-60s vs ~5min sequential)
│   ├── regression-semantic.yml   # Manual pre-release semantic regression sweep
│   └── regenerate-dispatch.yml   # /regenerate slash-command handler
├── config/
│   ├── migration-rules.md        # Target style + structure contract (~4,300 words, 85 rules)
│   ├── knowledge-base.md         # Anti-pattern catalog + API translation tables (125 KB IDs across 4 frameworks: pw 25, cy 50, sel-java 24, sel-py 26)
│   └── kb-id-migration.md        # Old `KB-N.N.N` → new `<fw>/<topic>/<name>` alias table
├── prompts/
│   ├── analyze.md                # Stage 1 system prompt
│   ├── generate.md               # Stage 2 system prompt
│   ├── verify-sdet.md            # Verify SDET sub-agent (CANDOR pattern)
│   ├── verify-code-review.md     # Verify Code Review sub-agent (CANDOR pattern)
│   ├── verify.md                 # Legacy single-Opus verify prompt (kept for migration reference)
│   ├── _fragments/               # Shared blocks (locator-priority, verdict-ladder, KB-ID format, plan schema, metric-verification-output)
│   └── _assembled/               # CI-consumed expansion of {{include:}} markers
├── inputs/
│   ├── bad-playwright/           # Step 1 — focus (5 real inputs)
│   ├── cypress/                  # Step 2 — first real input shipped (checkout-flow.cy.js, commit 98b9368)
│   ├── selenium-java/            # Step 3 — first real input shipped (EmployeesTest.java + pages/ + helpers/)
│   ├── selenium-python/          # Step 3 — content ready, awaiting first trigger
│   └── _stress/                  # 15 adversarial fixtures for Stage 0 calibration
├── outputs/
│   ├── plans/                    # Stage 1 deliverables (per-input .md + .envelope.json)
│   ├── tests/                    # Stage 2 specs only — <kebab>.spec.ts, imports from @fixtures/base.fixture
│   │   ├── tsconfig.json         # Strict mode + Playwright types + path aliases
│   │   └── playwright.config.ts
│   ├── helper/                   # v0.2.0 qa-master layered tree
│   │   ├── page-object/
│   │   │   ├── basepage.ts       # committed scaffolding (abstract BasePage)
│   │   │   ├── baseblock.ts      # committed scaffolding (abstract BaseBlock)
│   │   │   ├── pages/            # PageClass<Name> emitted per migration
│   │   │   └── blocks/           # BlockClass<Name> when warranted
│   │   ├── fixtures/
│   │   │   └── base.fixture.ts   # committed shell — Stage 2 EXTENDS, never replaces
│   │   ├── api/                  # request wrappers for data prep
│   │   ├── actions/              # cross-page flows
│   │   ├── utilities/            # pure functions (parse*/get*/calculate*/verify*) + logger.ts
│   │   ├── test-data/            # constants only (URLs, LABEL_* prefixes, magic strings)
│   │   └── types/{external,internal}/
│   ├── reports/                  # Per-migration metrics (one .md per input + optional -verify-{sdet,code-review}.md + -dom-probe.json)
│   ├── .metrics.db               # SQLite cross-run persistence (3 tables: migrations, plans, verifications)
│   └── .stage1-cache/            # SHA-256 keyed local replay cache (gitignored)
├── examples/
│   ├── reference/
│   │   ├── company-style.spec.ts # v0.1.x style anchor (kept for historical corpus)
│   │   └── qa-master/            # v0.2.0 style anchor — real-company production tree
│   │       ├── README.md         # how PWmodernizer uses this anchor
│   │       ├── docs/{ARCHITECTURE,CLAUDE}.md   # structural spec + 100-line orientation
│   │       ├── helper/{page-object,fixtures,api,utilities,test-data}/
│   │       └── tests/account.sign-in.spec.ts   # canonical spec shape
│   ├── bad-playwright-01-flaky-waits/   # input + expected-output + expected-plan + expected-plan.envelope.json
│   ├── bad-playwright-02-nth-selectors/
│   ├── bad-playwright-03-silent-conditionals/
│   ├── bad-playwright-04-missing-await/
│   ├── bad-playwright-05-force-clicks/
│   ├── cypress-01-login-flow/           # Step 2 reference
│   ├── cypress-02-form-validation/
│   ├── cypress-03-intercept-stubbing/
│   ├── cypress-04-session-auth/
│   ├── cypress-05-conditional-and-jquery/
│   ├── selenium-java-01-search/         # Step 3 reference
│   ├── selenium-java-02-checkout/
│   ├── selenium-java-03-multifile-login/
│   ├── selenium-python-01-login/
│   ├── selenium-python-02-modal-interaction/
│   └── selenium-python-03-multifile-login/  # parity with java-03
├── scripts/                              # 26 TS scripts + 1 dashboard.html
│   ├── evaluate.ts                       # Emits per-migration metrics report + confidence v2 (5-signal)
│   ├── ast-diff-trivial-check.ts         # Zhang-Shasha (TS) + tree-sitter (Java + Python), identifier normalization
│   ├── ast-diff-threshold-sweep.ts       # Threshold sensitivity sweep across 10 calibration fixtures
│   ├── dom-ground.ts                     # Probes locators against SUT (mock + live modes)
│   ├── dom-ground-live-calibrate.ts      # Runs the 6 live-SUT fixtures (saucedemo + conduit + pta)
│   ├── dom-snapshot.ts                   # @playwright/mcp accessibility-tree capture (Phase 6 stub)
│   ├── plan-envelope-validate.ts         # Strict schema + --code mode (pin verification)
│   ├── plan-code-coverage.ts             # LPW closure — scenario IDs ↔ plan:scenario pins
│   ├── derive-envelope.ts                # Backfill envelope from markdown plan (safety net)
│   ├── build-inventory.ts                # SHA-256 cached POM/fixture/helper enumeration
│   ├── kb-validate.ts                    # KB ID uniqueness + reference resolution
│   ├── validate-examples.ts              # Examples KB-ID cross-check (strict)
│   ├── assemble-prompts.ts               # Expands {{include:_fragments/...}} markers + --check stale detection
│   ├── metrics.ts + metrics-{report,export}.ts # SQLite persistence + cross-run aggregates
│   ├── persist-{plan,verify}-metrics.ts  # Stage-side wrappers for metrics DB
│   ├── dashboard.ts + dashboard.html     # Web UI (5 charts, per-framework bins)
│   ├── semantic-regression-check.ts      # 5-axis prompt-tuning regression sweep
│   ├── test-stage0.ts                    # Local Stage 0 sanity simulator (15 adversarial fixtures)
│   ├── stage1-replay.ts                  # SHA-256 cached local Stage 1 replay (cuts quota burn)
│   ├── quickstart-check.ts               # 10-check friendly onboarding
│   ├── trajectory-trace.ts               # Walk input through plan + envelope + code + verify, emit decision JSON
│   ├── trajectory-show.ts                # Pretty-print trajectory JSON
│   └── verify-tally.ts                   # TS replica of verify.yml tally logic (6 calibration fixtures)
├── tools/calibrate-pipeline/             # 46-fixture corpus + 6 dom-ground-live (opt-in)
├── docs/                                 # walkthrough, troubleshooting, baselines, dom-ground-public-suts, beyond-v1-research, playwright-mcp-integration
├── tsconfig.json                         # Strict TS root config (scripts + tools)
├── outputs/tests/tsconfig.json           # Strict TS for generated tests
├── .eslintrc.cjs                         # eslint-plugin-playwright + TS strictness (legacy)
├── eslint.config.js                      # ESLint v9 flat config (active)
├── dangerfile.ts                         # PR-quality 6-rule policy
├── package.json
├── CLAUDE.md / AGENTS.md                 # Per-tool orientation (commit 12f290a)
└── README.md                             # You are here.
```

## Quality gates (what the pipeline enforces)

**Stage 0 pre-flight** (before Claude is even called):
- Input must be 200B+ (not empty/stub)
- Input must tokenize to <=25K tokens (NVIDIA RULER context-degradation threshold)
- Encoding must be UTF-8 or US-ASCII (`file --mime-encoding`)
- Must contain test markers (`test|it|describe|@Test|def test_|cy.|page.`)
- Secret scan against AWS / Stripe live / GitHub PAT / Slack / Anthropic / OpenAI tokens (warn, not block)
- 15 adversarial fixtures in `inputs/_stress/` calibrate the gate (verdict matrix: 7 PASS + 4 REJECT + 4 WARN)

**Stage 1 gates**:
- Envelope JSON validates against `scripts/plan-envelope.schema.json` (hard fail if missing — `derive-envelope` safety net regenerates from markdown if Sonnet skipped it)
- KB-IDs cited in the plan must resolve in `knowledge-base.md`
- Open-questions Q-IDs must bind to entries (Cleanlab pattern)

**Stage 2 generation gates** — code PR opens only if all pass:
- `tsc --noEmit` passes (strict mode, no `any`) — path aliases resolve from `outputs/` rootDir per v0.2.0 PR #53
- `eslint --fix` with 22 `eslint-plugin-playwright` rules + 11 research-backed additions (`prefer-native-locators`, `no-element-handle`, `no-networkidle`, `no-unsafe-references`, `max-nested-describe: 2`, etc.) + `no-restricted-imports` blocking `@playwright/test` outside `base.fixture.ts` (v0.2.0)
- `npx playwright test --list` enumerates the generated spec (parses as a real Playwright test)
- **AST-diff-not-trivial** check: ts-morph + Zhang-Shasha tree-edit-distance with identifier normalization (`$id`, `$str`). Reject if normalized distance < 5% of max tree size. For `.java` / `.py` inputs uses real tree-sitter (commit `666332a`), not LCS fallback. Calibration 10/10.
- **plan-vs-code coverage** (LPW): every `scenarios[].id` from the envelope must appear as exactly one `// plan:scenario=<id>` pin in the code; all `required*` files (Pages, Blocks, Api, Actions, Utilities, TestData, Types) from the envelope must exist.
- **qa-master conformance** (new in v0.2.0, `scripts/validate-qa-master-conformance.ts`): hard-fails on (a) spec importing `test`/`expect` from `@playwright/test`, (b) `PageClass`/`BlockClass` declaring own constructor, (c) locator field without `.describe('[LABEL] …')`, (d) `expect()` inside page method without `[LABEL]` message arg, (e) relative `../` cross-helper import instead of path alias, (f) `page.goto(` in a spec file. Soft-warns on missing locator type-prefix and utilities without unit tests.
- **report-metric self-consistency** (v0.1.1): the report's claimed `Output:` filename + LOC must match the emitted spec — catches the structural copy-paste falsified-100% case.
- **dom-ground probe** (opt-in via `MIGRATION_TARGET_URL`): every locator call resolves uniquely against the live DOM; persists `outputs/reports/*-dom-probe.json` for verify
- **Output secret scan**: mirrors Stage 0 pre-flight against generated output — blocks if Claude hallucinated a real prod credential
- **Lint-and-test feedback loop** (Aider pattern): if any of `tsc`/`eslint`/`playwright parse` fails, retry once with errors fed back to Claude; hard-fail after 1 retry
- No forbidden patterns: `waitForTimeout`, `force: true`, `.nth()`, `test.only`, `test.skip`, `page.pause()`, `: any`, `as unknown as`, `console.log`

Stage 2 emits aggregate confidence (0..1):

- **>= 0.7**: opens code PR for human review.
- **< 0.7**: triggers `verify.yml` (CANDOR 2-agent Opus consensus). Both sub-reports comment on the code PR; tally aggregates 2/2 SHIP IT → SHIP IT, 1/2 → FIX FIRST, 0/2 → START OVER (missing/unparseable sub-report = START OVER for that lens, conservative fallback).

The aggregate confidence formula (v2, 5-signal output-aware — commit `4e2f16e`):
```
0.40 × plan_confidence
+ 0.25 × selector_quality
+ 0.10 × web_first_rate
+ 0.15 × smell_removal_rate    (source smells eliminated in output)
+ 0.10 × forbidden_absence     (1.0 if no forbidden patterns in output)
```

Previous v1 formula (0.6 / 0.3 / 0.1) capped output-driven confidence at the plan's own confidence — a high-quality Stage 2 migration of an ambitious plan was stuck below 0.7 even when all gates passed. v2 rewards the substantive work of Stage 2 and triggers verify only when there's real cause. See `scripts/evaluate.ts::computeAggregateConfidence`; the migration report includes a per-signal breakdown table.

## Known limitations (read before opening issues)

- **Pure-LLM landed rate is 36%** in Google's industrial study. Plan accordingly — you WILL spend time reviewing.
- **Selector hallucinations** are the #1 failure mode without DOM access. With `MIGRATION_TARGET_URL` + `DOM_GROUND_STRICT=true` set, the dom-ground gate catches them — 6/6 live calibration green (commit `7d4746d`). Without DOM access, every locator that wasn't a direct ID/testid translation carries LOW or MED confidence by design.
- **Magic Number Test smell** appears in 99.85% of LLM-generated unit tests (`arxiv:2410.10628`). We post-process with smell detection but don't promise to catch all instances.
- **Pre-existing test failures in your target app** make pass/fail signal unreliable. Record a baseline before migrating (see `docs/baselines.md`).
- **Selenium Java/Python are Step 3** for a reason — no public migrator exists for them. The cross-language + cross-paradigm gap is real. We mark every Selenium locator as LOW confidence and the first multi-file Selenium plan (PR #3) is the only one in production to date.
- **CodeBLEU is NOT used as a quality metric** — superseded by CodeBERTScore (semantic) + CrystalBLEU (n-gram with trivial-grams stripped). We use selector quality + smell deltas + AST non-triviality (ts-morph / tree-sitter + Zhang-Shasha) + execution-based mutation-kill-rate as primary signal.
- **Realistic accuracy ceiling is ~85%** — Microsoft ISE case study + multiple independent reports (Stagehand→Playwright, GitHub Copilot Workspace) all converge on 85% as the LLM-generated-Playwright-code correctness bound. The remaining 15% requires human review per migration. Plan downstream review capacity accordingly — don't promise 100%.

## Costs

The pipeline uses Anthropic prompt caching. Knowledge-base + migration-rules + reference style (~13k tokens combined) cache at 0.1× the input price. A typical 60-line bad-Playwright migration costs roughly:

- Stage 1 (Sonnet): ~0.05 USD
- Stage 2 (Sonnet): ~0.10 USD
- Verify (Opus CANDOR 2-agent, only ~25% of migrations): ~0.40 USD (2 parallel sub-calls)

Realistic: **$0.15–0.55 per migration**, ceiling $0.70 with verify firing on both sub-agents.

For local prompt iteration without burning quota: `npm run stage1:replay` uses SHA-256 cache keyed on (input + prompt + feedback). Re-runs hit cache instantly.

## Anti-patterns we explicitly do NOT promise

The commercial AI testing market is full of these. Migrator does not do them:

- "Full code export" theatre (the export is unmaintainable)
- NL-DSL lock-in (output is real Playwright TypeScript)
- Self-healing oversold ("works on minor changes" is the disclaimer hidden in their FAQs)
- Hidden per-seat / per-run / per-SKU pricing (we are OSS)
- Live-mode "AI fixing flaky tests in your CI" — that's a different product

## Research-backed defenses against hallucination

The pipeline implements specific patterns from the LLM-as-code-author literature:

- **Snippet inventory grounding (Aider repo-map / Sourcegraph Cody RAG):** before Stage 2 generation, the workflow enumerates existing POMs/fixtures/helpers and injects their export signatures into the prompt. Forces reuse over reinvention. See `migrate.yml` "Build snippet inventory" step.
- **Lint-and-test feedback loop (Aider pattern):** if `tsc`/`eslint`/`playwright parse` fails after generation, the errors are fed back to Claude with a 1-retry hard cap. Cuts hallucination rate before any human sees the output.
- **Plan envelope JSON sidecar (LPW / Routine pattern):** machine-validatable schema (`scripts/plan-envelope.schema.json`) alongside the markdown plan. **Hard enforced** — Stage 2 validates envelope BEFORE reading the plan body (fail-fast contract).
- **Few-shot example validation (Cleanlab pattern):** `scripts/validate-examples.ts` cross-checks every `examples/*/expected-plan.md` against `knowledge-base.md` (KB-IDs) and its own Open-questions section (Q-IDs) in strict mode. 16 example plans currently clean.
- **BAML-style prompt fragments:** `prompts/_fragments/*.md` define shared rules (locator-priority, verdict-ladder, KB-ID format, plan schema, metric-verification-output) included via `{{include:}}` markers; `scripts/assemble-prompts.ts` expands them. Single source of truth across analyze/generate/verify-sdet/verify-code-review prompts. Stale detection in `--check` catches "edited fragment, forgot to run --write" regressions.
- **Schema demotion under Tam et al. 2024:** the `Hallucination-defense pins` section was emergent in early runs; we considered making it mandatory, then demoted it back to ENCOURAGED after research showed forced structured-output sections degrade reasoning quality (JSON-mode dropped Claude 3 Haiku 86.5% → 23.4% on GSM8K).
- **Token-based input gate (NVIDIA RULER):** Stage 0 uses character/4 token estimate capped at 25K (well below the ~50% degradation threshold of Claude's 1M context). 15 adversarial fixtures calibrate the gate.
- **3-level verdict ladder (from QA-skills `22-reality-check.md`):** `SHIP IT` / `FIX FIRST` / `START OVER` — round-up rule, no soft middle. Lives in `prompts/_fragments/verdict-ladder.md`.
- **Validator calibration (Sakasegawa 2026):** every validator promoted from `--warn` to `--strict` only after fixture-driven calibration. Current state: 8 validators, 53 fixtures, 100% calibrated. Premature gating produces false confidence.
- **Abandon-and-regenerate flow:** `/regenerate` slash command via `peter-evans/slash-command-dispatch` lets a reviewer close a bad plan PR and force fresh Stage 1 with comment body as feedback. Auto-fires on START OVER verdict, cap 3 attempts.
- **tree-sitter AST diff for Java + Python** — real Zhang-Shasha tree-edit-distance with identifier normalization for Selenium `.java` and `.py` inputs. Replaces the LCS string-overlap fallback for non-TS inputs (commit `666332a`). Calibration 10/10.
- **Plan-vs-code coverage check (LPW closure)** — `scripts/plan-code-coverage.ts` runs post-Stage-2: every `scenarios[].id` from the envelope must appear as exactly one `// plan:scenario=<id>` comment in the generated code; `requiredPOMs[]` and `requiredFixtures[]` files must exist; subtractive plans must only import `@playwright/test` + relative paths. arXiv 2411.14503 (LPW) contract enforced end-to-end.
- **SQLite metrics persistence** — every Stage 1 / Stage 2 / verify run logs to `outputs/.metrics.db` (3 tables: migrations, plans, verifications). `npm run metrics:report` shows cross-run trends; `npm run dashboard` opens a read-only web UI; `npm run metrics:export` emits JSON for downstream tooling.
- **Semantic regression workflow** — manually-triggered `regression-semantic.yml` samples 3-5 examples, runs real Claude analyze stage against each, compares to `expected-plan.md` via 5 axes (anti-pattern total, KB-ID coverage, locator total, confidence histogram, required sections). Catches "prompt change degraded quality" before release.
- **Parallel regression-test CI** — 13 sequential gates → 10 matrix entries with shared npm cache. Estimated runtime ~5 min → ~45-60s (5-10× speedup).
- **CANDOR multi-agent verify** (commit `3993b01`) — verify stage splits a single Opus call into two parallel sub-agents: SDET (locators / web-first / flakiness / pin-compliance) and Code Review (TS strict / KB-ID grounding / structural conformance). Each emits an independent verdict; a tally job aggregates 2/2 SHIP IT → SHIP IT, 1/2 → FIX FIRST, 0/2 → START OVER. A missing or unparseable sub-report counts as START OVER for that lens (conservative fallback). `verify-tally.ts` (commit `ce68273`) is the TS replica for unit-testing the ladder outside CI, 6 calibration fixtures.
- **Plan envelope hard enforcement** (commit `1c46c14`) — Stage 1 mandates BOTH markdown plan AND JSON envelope; Stage 2 validates the envelope BEFORE reading the plan body (fail-fast contract); generated `.spec.ts` must carry `// plan:scenario=<id>` pins on every test block, verified by `plan-envelope-validate.ts --code`. `derive-envelope` safety net catches Stage 1 emission misses.
- **Per-framework quality bins** (commit `200dabc`) — SQLite schema carries a `source_framework` dimension; dashboard adds stacked verdict-by-framework chart, multi-line confidence trend per framework, and a sorted "Migrator quality by framework" table so the next prompt-tuning iteration knows which framework is the weakest link.
- **DOM grounding Phase 1-7c** (commits `f2e383c` → `7d4746d`) — `scripts/dom-ground.ts` probes every `getByRole/Label/TestId/Text/Placeholder/AltText/Title/locator` call in generated specs against the SUT at `MIGRATION_TARGET_URL`. Mock probe via `mock://always-resolve|always-fail|ambiguous-N` URLs for fixture-free testing; live probe via direct `chromium.launch`. Wired into migrate.yml as opt-in step; `DOM_GROUND_STRICT=true` repo var promotes soft → hard gate (flipped in commit `7d4746d`). **Live calibration 6/6 GREEN** against saucedemo + conduit + practicetestautomation. Phase 6 `@playwright/mcp` Stage 1 enrichment stub shipped (`scripts/dom-snapshot.ts`, commit `f2bdd95`); real LLM-side ingestion pending.
- **Stage 0 adversarial fixture corpus** (commit `149dccf`) — `inputs/_stress/` holds 15 hand-crafted bad inputs (empty, huge, BOM, Latin-1, mid-stream encoding, binary-as-text, real AWS key, near-token-limit, mixed-encoding, single-long-line, mixed-languages, test-markers-in-comments-only) + `scripts/test-stage0.ts` is the local simulator with `EXPECTED_VERDICTS` table that fails on regression. Verdict matrix: 7 PASS + 4 REJECT + 4 WARN. Proves the Stage 0 gate matches its documented contract.
- **Trajectory tracer** (commit `06251dc`) — `scripts/trajectory-trace.ts` walks an input file through plan + envelope + code + verify reports and emits a single JSON tracing the per-stage decisions; `trajectory-show.ts` pretty-prints it. Closes the "what did the pipeline actually decide on file X" debugging gap.
- **Danger.js PR-quality gate** (commit `9950167`) — 6 rules: title format, no Claude/Anthropic attribution, body schema, confidence label sanity, 1500-LOC file budget, no transient `_*.tmp` files under `outputs/`. Runs on every PR. Smoke-tested against PR #2 (rule 6 tripped legitimately) + PR #3 (clean).

## Contributing

See **[CONTRIBUTING.md](CONTRIBUTING.md)** for the full guide — onboarding, PR impact tier, review contract, project values.

Quick orientation: PRs that improve `config/migration-rules.md`, `config/knowledge-base.md`, `examples/reference/company-style.spec.ts`, or `prompts/*.md` directly improve every future migration. PRs that add new validation gates to `scripts/` raise the quality floor.

PRs that add a new input source (Cypress, Selenium) should also include 2+ seed examples in `examples/` and unlock the gate in `README.md` only after the bad-Playwright corpus hits the 70% bar.

Before opening a PR, run `npm run quickstart` — it runs the same gates CI runs and explains each one. Issue templates live in `.github/ISSUE_TEMPLATE/`. PR template at `.github/PULL_REQUEST_TEMPLATE.md`.

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
