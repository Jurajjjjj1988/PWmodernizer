# Migration report: flaky-waits.spec.ts

## Source → Target
- Source: `inputs/bad-playwright/flaky-waits.spec.ts` (40 LOC)
- Output: `outputs/tests/flaky-waits.spec.ts` (56 LOC)
- LOC delta: +16

## Quality scores
- **Aggregate confidence:** 0.65
- Selector quality: 75% canonical (9 canonical / 3 fragile)
- Web-first assertion rate: 100%
- Plan confidence: 1 high / 5 med / 2 low → avg 0.55

## Smell count (source → output → delta)
| Smell | Source | Output | Delta |
|---|---|---|---|
| hardWaits | 5 | 1 | -4 |
| magicNumbers | 5 | 2 | -3 |
| forcedClicks | 0 | 0 | +0 |
| nthSelectors | 0 | 0 | +0 |
| cssClassSelectors | 3 | 2 | -1 |
| pagePauses | 0 | 0 | +0 |
| testOnly | 0 | 0 | +0 |
| testSkip | 0 | 0 | +0 |
| anyType | 0 | 0 | +0 |
| consoleLog | 0 | 0 | +0 |
| nonWebFirstAsserts | 0 | 0 | +0 |
| conditionalInTest | 1 | 0 | -1 |

## Forbidden patterns in output
- ❌ `waitForTimeout`

## AST diff
- **Trivial (cosmetic-only)?** ✅ no

## Recommended human checks
1. Spot-check 2-3 LOW-confidence locator translations from the plan — do they match the real DOM?
2. Run the migrated test against staging; verify it catches the same bugs as the source did.
3. If verify report exists (`outputs/reports/flaky-waits.spec.ts-verify.md`), read the disagreements section.
