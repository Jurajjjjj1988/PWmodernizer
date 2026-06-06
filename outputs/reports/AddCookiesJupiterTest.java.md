# Migration report: AddCookiesJupiterTest.java

## Source → Target
- Source: `inputs/selenium-java/AddCookiesJupiterTest.java` (73 LOC)
- Output: `outputs/tests/add-cookies-jupiter-test.spec.ts` (49 LOC)
- LOC delta: -24

## Quality scores
- **Aggregate confidence:** 0.78
- Selector quality: 75% canonical (3 canonical / 1 fragile)
- Web-first assertion rate: 100%
- Plan confidence: 1 high / 0 med / 1 low → avg 0.60

### Confidence breakdown
| Signal | Value | Weight | Contribution |
|---|---|---|---|
| Plan confidence | 0.60 | 0.40 | 0.240 |
| Selector quality | 0.75 | 0.25 | 0.188 |
| Web-first rate | 1.00 | 0.10 | 0.100 |
| Smell removal rate | 1.00 | 0.15 | — |
| Forbidden absence | 1.00 | 0.10 | 0.100 |

## Smell count (source → output → delta)
| Smell | Source | Output | Delta |
|---|---|---|---|
| hardWaits | 1 | 0 | -1 |
| magicNumbers | 0 | 0 | +0 |
| forcedClicks | 0 | 0 | +0 |
| nthSelectors | 0 | 0 | +0 |
| cssClassSelectors | 0 | 0 | +0 |
| pagePauses | 0 | 0 | +0 |
| testOnly | 0 | 0 | +0 |
| testSkip | 0 | 0 | +0 |
| anyType | 0 | 0 | +0 |
| consoleLog | 0 | 0 | +0 |
| nonWebFirstAsserts | 0 | 0 | +0 |
| conditionalInTest | 0 | 0 | +0 |

## Forbidden patterns in output
✅ None.

## AST diff
- **Trivial (cosmetic-only)?** ✅ no

## Recommended human checks
1. Spot-check 2-3 LOW-confidence locator translations from the plan — do they match the real DOM?
2. Run the migrated test against staging; verify it catches the same bugs as the source did.
3. If verify report exists (`outputs/reports/AddCookiesJupiterTest.java-verify.md`), read the disagreements section.
