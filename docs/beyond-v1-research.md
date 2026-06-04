# Beyond v1.0 — research notes

> Scope and feasibility notes for the four post-v1.0 directions listed in [`ROADMAP.md`](../ROADMAP.md). Each section answers: why pursue it, what the implementation shape looks like, what blocks it from being v1.0, and what we'd need before it's worth starting. These are not commitments — they're the briefing material for the v1.0 → v1.x planning meeting.

Last updated: 2026-06-04.

---

## 1. LangChain / LangGraph state-machine orchestration

### Why

Stage 1 (plan) → Stage 2 (generate) → verify is currently a series of GitHub Actions jobs glued together by `repository_dispatch` events and label state machines. The state of "where in the pipeline a given input is" is implicit in {git branches, PR labels, workflow runs} — debugging a stuck migration means correlating timestamps across three pages of GitHub UI.

LangGraph (LangChain's stateful agent runtime) models the same pipeline as a directed graph where each node is a stage, edges encode transitions, and the runtime persists state to a checkpoint store. Trade-off: we'd swap GitHub Actions as the runtime for a self-hosted LangGraph runtime, gaining state visibility but losing free CI minutes and the per-PR audit trail.

### Implementation shape

- `migrator/graph.py` (or .ts) defines nodes: `validate_input → analyze → generate → verify → ship | regen | dead-end`
- State: a `MigrationState` TypedDict with `input_path`, `plan_path`, `generated_path`, `verify_report`, `confidence`, `attempt_count`, plus all intermediate artifacts
- Persistence: SQLite (`langgraph.sqlite`) for local development, Postgres for prod
- UI: LangGraph Studio (web app) shows the live graph state per migration; clicking a node opens the input/output of that stage
- Triggers: webhook receives a GitHub PR event, kicks off the graph

### What blocks it from being v1.0

- We don't yet have enough runs (≤ 5 real migrations) to know which transitions are slow vs flaky. LangGraph won by being observable, but if everything works first-shot the observability is unused complexity.
- Requires a host. GitHub Actions is free; self-hosted requires a VPS or AWS Lambda + RDS, which adds operational burden.
- LangGraph itself is on a 0.x release cycle. Pinning to a version means accepting churn.

### Prerequisites before starting

- ≥ 20 real migrations through the current pipeline. We need data on where things actually break.
- A decision on whether the project is "personal repo" or "team service". LangGraph makes sense for team service; for personal repo, GitHub Actions wins on simplicity.
- Decide between LangGraph (graph DSL) and LangChain (chains) — graph wins for retry loops, chain wins for simple sequences.

---

## 2. Claude Code SDK rewrite of Stage 2

### Why

Stage 2 currently shells out to `claude --print` via the `anthropics/claude-code-action`. That works but gives no programmatic access to tool calls, no streaming, no fine-grained model selection (Sonnet vs Opus per step), and prevents us from observing the LLM's decision process in structured form.

The [Claude Agent SDK](https://docs.claude.com/en/api/agent-sdk) is the same engine wrapped as a TypeScript library. Migrating Stage 2 to the SDK unlocks:
- Per-step model choice (use Sonnet for the bulk migration but Opus for confidence calibration on borderline cases)
- Tool-call inspection (we can log every `Read`/`Edit`/`Grep` the LLM makes and post-hoc audit them)
- Streaming with progress to the PR comment (currently the comment appears only after Claude finishes; SDK streaming means real-time progress)
- Structured outputs via tool-result format (parsing today's free-form Markdown report is brittle)

### Implementation shape

- `scripts/stage2-sdk.ts` replaces the inline `claude --print` shell call in `migrate.yml`
- Same prompt assembly (still consume `prompts/_assembled/generate.md`)
- SDK options: `{ permissionMode: 'bypassPermissions', model: 'claude-sonnet-4-6', cwd: outputDir }`
- Tool allowlist: `Read`, `Edit`, `Write`, `Bash(npx tsx scripts/lint-fix.ts)` (no broader Bash, no Grep — locked down)
- Run loop captures `tool_use` events to `outputs/.stage2-trace.jsonl`, post-hoc visualized in the dashboard

### What blocks it from being v1.0

- Stage 2 today works. The SDK rewrite is observability + flexibility, not capability. Yield is in operational visibility, which we don't yet need urgently.
- SDK requires Node 22+ everywhere (already a project requirement), and the SDK is shipping rapidly — pinning a version means accepting churn similar to LangGraph.
- The tool-allowlist work is non-trivial. We must ensure the SDK can't `Bash(curl ...)` exfiltrate the input file.

### Prerequisites before starting

- A failure mode that today's pipeline can't diagnose. Concrete example: "Stage 2 silently dropped a test case from the plan." Today we'd never know which tool call missed; SDK trace would show it.
- Lock-down policy for the SDK's tool surface. We need explicit allow-list + deny-list reviewed before shipping.
- A migration plan for `claude --print` users: this would change CI permissions (Anthropic API key in secrets) and likely affect billing.

---

## 3. Auto-PR-merge after verify SHIP IT

### Why

Currently a successful verify produces a SHIP IT verdict, removes `confidence:low`, adds `confidence:high`, and exits — a human still clicks merge. For migrations on a trusted corpus (e.g., test renames, deprecation cleanups), the human click is pure ceremony.

Auto-merge after SHIP IT closes the loop: from PR opened to PR merged with no human in the loop. Optional per-input opt-in via a label or PR title prefix.

### Implementation shape

- New workflow step in `verify.yml`: after final SHIP IT, check for PR label `auto-merge` (set by the human at PR creation time, or by the migrate workflow if input matches an allowlist)
- If present: `gh pr merge --auto --squash` (uses GitHub native auto-merge; merges when all required checks pass)
- Guard rails:
  - Only on `migrator:code` PRs (not human PRs)
  - Only when verify is 2/2 SHIP IT (CANDOR consensus; single SHIP IT not enough)
  - Only when AST-diff sweep shows ≥ 30% normalized distance (significant migration, not trivial cleanup)
  - Only when DOM-ground report shows 0 not-found and 0 resolved-multiple (when grounding is enabled)
  - Never on inputs from `inputs/_stress/` (those are adversarial fixtures by design)

### What blocks it from being v1.0

- Trust threshold. We have one merged migrator PR (#2). Auto-merging the second one is a leap. Need more samples.
- Branch protection rules need to be configured to require verify SHIP IT, not just present. Currently SHIP IT is a workflow comment, not a status check.
- Rollback story: if an auto-merged PR breaks the suite, we need a "git revert + reopen" flow. Today this is manual.

### Prerequisites before starting

- ≥ 10 manually-merged SHIP IT migrations with no post-merge revert. If revert rate is > 0, auto-merge is not safe yet.
- Status-check API integration so SHIP IT becomes a branch-protection-respected check
- A documented rollback runbook
- Per-input opt-in mechanism: explicit `auto-merge:true` in migrate.yml input or PR label

---

## 4. GitHub App distribution

### Why

PWmodernizer currently lives in one repo and ships as workflow files + scripts. A user adopting it must fork the repo or copy the workflows into theirs. A GitHub App would let users install PWmodernizer to their org with one click; the app would:
- Listen on `repository_dispatch` events (manual trigger)
- Have its own service account with read access to source + write access to a `pwmodernizer/migration-N` branch
- Render its own UI for triggering migrations + viewing reports

### Implementation shape

- App identity: a Probot or GitHub App Framework instance, hosted on AWS Lambda or Cloudflare Workers
- Backend: stateless worker that receives webhooks, runs the pipeline against the user's repo, opens a PR back
- Frontend: simple React app for "select a file, trigger migration" — embedded as a GitHub App page
- Billing: per-migration credit consumption, tied to Anthropic API costs + minimal margin

### What blocks it from being v1.0

- We don't have a stable enough pipeline. Distributing today means every user hits the same Selenium quirks we're still smoothing out for ourselves.
- Compliance scope. Once users install the app, we hold their source code in transit. SOC2-relevant.
- The free-tier vs paid-tier story isn't drafted. Charging requires payment infrastructure (Stripe), refund policy, EU VAT — substantial admin overhead.

### Prerequisites before starting

- v1.0 ships and runs cleanly against 4 of 4 frameworks (bad-PW + Cypress + Selenium-Java + Selenium-Python) for ≥ 90% of real inputs
- A target user persona: "team lead at a 50-engineer org wanting to retire Selenium tests" — confirmed by interviews with 3+ such teams
- A cost model: Anthropic API cost per migration × expected free-tier volume = monthly burn we can sustain. If burn > $200/mo at MVP scale, no-go.
- Legal review: terms of service, data processing agreement, source-code-handling clauses

---

## Cross-cutting questions

- **Order**: which of these compounds best with the others? Auto-PR-merge depends on verify being trustworthy (CANDOR already shipped). LangGraph + SDK rewrite both want the SDK in place first. GitHub App distribution depends on all of the above being stable.
- **Sequencing recommendation**: SDK rewrite (#2) first — unlocks observability that informs #1. LangGraph (#1) second — once we have failure-mode data. Auto-merge (#3) third — once verify is trusted. GitHub App (#4) last — once everything stabilizes.
- **Off-ramp**: if real-world adoption stays personal-scale, we drop #1 and #4 entirely; v1.x ships with just SDK + auto-merge.
