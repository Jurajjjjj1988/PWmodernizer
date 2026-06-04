# `inputs/_stress/` — Stage 0 gate fixtures (Risk 4)

## Why these fixtures exist

`plan.yml` Stage 0 ("Pre-flight input sanity + secret scan") is the
fail-fast gate that stops the pipeline before any Claude tokens are spent
on an unmigrable input. Until now it was only exercised by happy-path
fixtures (real Playwright / Cypress / Selenium specs that always pass the
gate). That gave us **zero adversarial coverage** of Risk 4 — we did not
know which gates actually fire when fed pathological input.

This directory contains one fixture per failure mode. They are **NOT**
meant to migrate; Claude would (correctly) refuse most of them. They
exist purely as gate fixtures — so we can manually trigger
`plan.yml` against each and confirm the workflow rejects / warns at the
expected step, and so `scripts/test-stage0.ts` can validate the gate
locally without firing CI.

## Fixtures and expected Stage 0 outcomes

| Fixture | Bytes | Expected verdict | Trips which gate |
|---|---|---|---|
| `empty.spec.ts` | 0 | REJECT | size floor (`< 200B`) |
| `too-small.spec.ts` | 50 | REJECT | size floor (`< 200B`) |
| `huge.spec.ts` | ~182KB | REJECT | token cap (`~45K > 25K`) |
| `no-test-markers.spec.ts` | ~830 | REJECT | no test/it/describe/`page.`/`cy.` markers |
| `latin1.ts` | ~500 | WARN | `file` reports `iso-8859-1` |
| `mixed-encoding.spec.ts` | ~560 | WARN | mid-stream UTF-8 → Latin-1 byte switch; `file` reports `iso-8859-1` |
| `binary-as-text.spec.ts` | ~475 | WARN | PNG signature in first 8 bytes; `file` reports `binary` / `image/png` (encoding gate is non-blocking → WARN, not REJECT) |
| `bom-encoded.ts` | ~670 | PASS (note) | UTF-8 BOM still classified as `utf-8` by `file` |
| `clean-pass.spec.ts` | ~1KB | PASS | control fixture — all gates clear |
| `with-real-aws-key.spec.ts` | ~880 | WARN | secret-scan matches `AKIAIOSFODNN7EXAMPLE` (well-known fake) |
| `mixed-languages.spec.ts` | ~1.6KB | PASS | English + Slovak + German + Japanese + Cyrillic, all valid UTF-8; language is not a rejection criterion |
| `single-long-line.spec.ts` | ~13.8KB | PASS | valid Playwright spec compressed to one ~13K-char line; tokenizer still handles it |
| `test-markers-in-comments-only.spec.ts` | ~1.2KB | PASS | FIXME (known gap): `test(` lives only in `/* */` block comment; marker regex doesn't strip comments |
| `near-token-limit.spec.ts` | ~99.3KB | PASS | ~24,820 estimated tokens — just below the 25,000 cap; proves the threshold isn't off-by-one |
| `unicode-emoji-test.spec.ts` | ~1.4KB | PASS | emoji in test descriptions and assertions; supplementary-plane 4-byte UTF-8 |

**Note on `bom-encoded.ts`:** `file --mime-encoding -b` on Ubuntu / macOS
returns `utf-8` for a UTF-8 BOM-prefixed file (BOM is part of the UTF-8
family), so this fixture passes the encoding gate cleanly. It is kept as
a *surface fixture* in case future `file` versions or alternate tools
report `utf-8-bom` or similar — then the fixture would flip to WARN and
catch the regression. Stage 0's encoding switch explicitly allows
`utf-8`, `us-ascii`, `utf-8-binary`.

**Note on `with-real-aws-key.spec.ts`:** `AKIAIOSFODNN7EXAMPLE` is the
official AWS *documentation sample* access key. It is **not** a real
credential and AWS publishes it in their docs as a placeholder.
Stage 0's secret scan matches it via `AKIA[0-9A-Z]{16}` and emits
`::warning::` (does NOT block) — Stage 1 plan is expected to recommend
moving it to env vars.

## How to manually test in CI

Each fixture can be fed to `plan.yml` via workflow dispatch:

```
gh workflow run plan.yml -f input_path=inputs/_stress/empty.spec.ts
```

Expected step-summary errors / warnings per fixture:

- `empty.spec.ts`         → `::error::Input too small (0 bytes < 200)`
- `too-small.spec.ts`     → `::error::Input too small (50 bytes < 200)`
- `huge.spec.ts`          → `::error::Input ~45522 estimated tokens > 25000 cap`
- `no-test-markers.spec.ts` → `::error::Input contains no test markers`
- `latin1.ts`             → `::warning::File encoding suspect: ...:iso-8859-1`
- `mixed-encoding.spec.ts` → `::warning::File encoding suspect: ...:iso-8859-1`
- `binary-as-text.spec.ts` → `::warning::File encoding suspect: ...:binary`
- `bom-encoded.ts`        → no errors, no encoding warning (utf-8)
- `clean-pass.spec.ts`    → no errors, no warnings
- `mixed-languages.spec.ts` → no errors, no warnings
- `single-long-line.spec.ts` → no errors, no warnings
- `test-markers-in-comments-only.spec.ts` → no errors, no warnings (FIXME — see note below)
- `near-token-limit.spec.ts` → no errors, no warnings (~24,820 tokens)
- `unicode-emoji-test.spec.ts` → no errors, no warnings
- `with-real-aws-key.spec.ts` → `::warning::Possible real AWS access key detected`

**Note on `test-markers-in-comments-only.spec.ts`:** Stage 0's marker
regex `\b(test|it|describe|@Test|...)\b` does NOT strip comments before
matching, so a file with `test(` only inside a `/* */` block comment
currently PASSES the marker gate even though no executable test code
exists. This is a known gap — the fixture acts as a surface marker so
the regression is visible. Fix would be AST-aware comment stripping.

## Local validation

Run the self-test script (no CI tokens needed):

```
npx tsx scripts/test-stage0.ts
# optionally: npx tsx scripts/test-stage0.ts --dir inputs/_stress
```

It applies the same checks Stage 0 does and prints a table:
`file | size | encoding | markers | tokens | verdict | reason`.

Current expected totals: **PASS=7  REJECT=4  WARN=4  (15 fixtures total)**.

The script also validates each fixture against a pinned expected verdict
in `EXPECTED_VERDICTS` and exits non-zero on any mismatch — so this
script doubles as a regression test for `file` / `wc` behaviour drift
across host systems.
