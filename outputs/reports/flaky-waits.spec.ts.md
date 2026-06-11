# Migration report: flaky-waits.spec.ts

## Source → Target
- Source: `inputs/bad-playwright/flaky-waits.spec.ts` (40 LOC)
- Output: `outputs/tests/explicit-wait-jupiter-test.spec.ts` (22 LOC)
- LOC delta: -18

## Quality scores
- **Aggregate confidence:** 0.57
- Selector quality: 0% canonical (0 canonical / 1 fragile)
- Web-first assertion rate: 100%
- Plan confidence: 1 high / 5 med / 2 low → avg 0.55

### Confidence breakdown
| Signal | Value | Weight | Contribution |
|---|---|---|---|
| Plan confidence | 0.55 | 0.40 | 0.220 |
| Selector quality | 0.00 | 0.25 | 0.000 |
| Web-first rate | 1.00 | 0.10 | 0.100 |
| Smell removal rate | 1.00 | 0.15 | — |
| Forbidden absence | 1.00 | 0.10 | 0.100 |

## Smell count (source → output → delta)
| Smell | Source | Output | Delta |
|---|---|---|---|
| hardWaits | 5 | 0 | -5 |
| magicNumbers | 5 | 0 | -5 |
| forcedClicks | 0 | 0 | +0 |
| nthSelectors | 0 | 0 | +0 |
| cssClassSelectors | 3 | 0 | -3 |
| pagePauses | 0 | 0 | +0 |
| testOnly | 0 | 0 | +0 |
| testSkip | 0 | 0 | +0 |
| anyType | 0 | 0 | +0 |
| consoleLog | 0 | 0 | +0 |
| nonWebFirstAsserts | 3 | 0 | -3 |
| conditionalInTest | 1 | 0 | -1 |

## Forbidden patterns in output
✅ None.

## AST diff
- **Trivial (cosmetic-only)?** ✅ no

## Recommended human checks
1. Spot-check 2-3 LOW-confidence locator translations from the plan — do they match the real DOM?
2. Run the migrated test against staging; verify it catches the same bugs as the source did.
3. If verify report exists (`outputs/reports/flaky-waits.spec.ts-verify.md`), read the disagreements section.
