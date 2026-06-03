Exactly one of three values. Pick the most severe one that applies — never round down.

- **SHIP IT** — full agreement OR only stylistic/cosmetic differences (`info` severity only). Safe to merge as-is. If you have `info`-level observations, list them under "Style notes" but the verdict stays SHIP IT.
- **FIX FIRST** — at least one `warn`-severity finding. Human reviewer should adjudicate (edit the test or the report) before merge. Generator's output is not wrong, but you would have done it differently in a defensible way.
- **START OVER** — at least one `block`-severity finding. Reject migration and regenerate with the disagreements as feedback to Stage 2.

Rounding rule: any single `block` → START OVER; any single `warn` (and zero `block`) → FIX FIRST; otherwise SHIP IT. Never round down to spare the generator. The verdict is the headline; the reviewer reads it first.

Severity legend (used by the disagreement rows that feed the ladder):
- **block** — would reject the migration on PR review; requires regeneration with feedback.
- **warn** — human reviewer should pay attention before merging.
- **info** — stylistic / preference difference; not a blocker.
