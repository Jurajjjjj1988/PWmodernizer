# Performance baselines

> Measured runtimes for the local smoke and its sub-steps. Use these to spot regressions: if a step suddenly takes 3× longer, something changed (new fixtures, new validators, dependency bloat) and is worth a 60-second investigation before you ship.

**Measurement environment:**
- Hardware: Apple M-series (kapusansky local dev — 2026-06-04)
- Node 22.x via `nvm`
- Cold cache where noted (no `node_modules`-warm); warm cache means dependencies already resolved.

Take all numbers with ±25% tolerance — Node startup and `tsx` JIT vary across runs.

## Top-level commands

| Command | Wall-clock | CPU user | CPU sys | What ran |
|---|---|---|---|---|
| `npm run smoke` | **40.9 s** | 48.4 s | 5.1 s | typecheck:all → validate:all (6 validators + calibrate) → lint |
| `npm run calibrate` | **25.9 s** | 28.6 s | 3.0 s | 46 fixtures across 6 validators |
| `npm run validate:all` | ~28 s | — | — | 6 individual `check:*` + calibrate (subset of smoke) |
| `npm run typecheck:all` | **1.8 s** | 3.9 s | 0.2 s | tsc scripts + outputs/tests tsconfigs |
| `npm run lint` | ~3 s | — | — | eslint on outputs/tests/**/*.ts |

## Per-validator (warm cache)

| Validator | Wall-clock | Fixtures |
|---|---|---|
| `check:kb` | **0.27 s** | n/a (single scan) |
| `check:envelope` | **0.56 s** | n/a (single envelope) |
| `check:envelope:code` | ~0.6 s | n/a (single envelope + spec) |
| `check:assemble` | **0.24 s** | n/a (5 prompts validated) |
| `check:derive` | **9.05 s** | 12 plans × derive + validate roundtrip |
| `check:examples` | ~0.5 s | 15 plans scanned |
| `check:coverage` | ~0.7 s | n/a (single envelope + output dir) |
| `check:dom-ground` | ~1.5 s | n/a (8 locators in mock mode) |

## When to investigate

- **Smoke past 90 seconds (warm cache)** — investigate. Likely culprit: a new validator without cache, OR a fixture set blew up in size.
- **calibrate past 60 seconds (warm cache)** — investigate. Each fixture should be < 2s; if one validator dominates, look there first.
- **check:derive past 15 seconds (warm cache)** — investigate. The derive script walks 12 plans; if any single plan grew past 200 LOC the parse cost climbs.
- **typecheck past 5 seconds (warm cache)** — investigate. The scripts tsconfig should resolve quickly; if it slows, you probably added a `@types/*` dep with a huge declaration set.

## CI vs local

The GitHub Actions runners are slower-per-core than M-series local but parallelize the matrix. The CI matrix (10 entries via regression-test.yml) takes 45–60 s end-to-end after the `.npmrc` peer-dep fix landed (commit `ca9afdb`). Pre-fix runs failed at install with HTTP 400 / ERESOLVE; see [`troubleshooting.md`](troubleshooting.md).

## How to re-measure

```bash
# top-level baselines
{ time npm run smoke 2>&1 | tail -3; }
{ time npm run calibrate 2>&1 | tail -8; }
{ time npm run typecheck:all 2>&1 | tail -3; }

# per-validator
for c in check:kb check:envelope check:envelope:code check:assemble check:derive check:examples check:coverage check:dom-ground; do
  echo "=== $c ==="
  { time npm run "$c" 2>&1 | tail -2; } 2>&1 | tail -3
done
```

Update this doc when the numbers drift 2× from a deliberate change (new fixtures, new validators). Don't update on noise.
