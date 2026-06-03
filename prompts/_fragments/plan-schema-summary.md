The canonical plan schema lives in `config/migration-rules.md` §9. Do NOT improvise the structure. Required top-level sections, in this exact order:

1. `## Source framework` — `{cypress | selenium-java | selenium-python | bad-playwright}`.
2. `## Summary` — 2-4 sentence behavioural paragraph, then two MANDATORY subsections:
   - `### What bug does this catch?` — one concrete regression sentence.
   - `### User-perceivable assertion checklist` — bulleted observable outcomes Stage 2 must preserve.
3. `## Anti-patterns detected` — H/M/L severity table. Columns: Severity, Line, KB-ID, Anti-pattern, Snippet, Replacement. Each KB-ID must resolve in `config/knowledge-base.md`.
4. `## Locator translation table` — columns: Original, New, Confidence (high/med/low), Notes.
5. `## Hallucination-defense pins` — **ENCOURAGED, not required** (per Tam et al. 2024, arXiv 2408.02442 — forcing emergent-reasoning sections degrades quality). Emit one numbered pin per MED/LOW locator when concrete fallback exists; OMIT entirely when nothing concrete to pin. Do not pad.
6. `## Structural changes` — POM extract yes/no, fixture extract yes/no, split yes/no, new data files. One-sentence justification per change tied to a `migration-rules.md` clause.
7. `## Open questions for reviewer` — 5-15 questions on non-trivial tests. Zero questions = red flag.
8. `## Risk callouts` — flake sources, behavioural drift, cross-browser quirks.
9. `## Expected metrics` — selector quality score estimate, smell count delta, LOC delta, anti-pattern coverage.

Plan output goes to `outputs/plans/<input-basename>.md`. The plan is the contract Stage 2 executes; sections missing from this list fail `plan.yml` validation; sections ADDED (invented) confuse human reviewers.
