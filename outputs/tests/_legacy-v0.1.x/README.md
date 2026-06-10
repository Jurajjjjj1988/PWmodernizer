# Legacy v0.1.x specs (archived)

These specs were emitted by Stage 2 BEFORE the v0.2.0 qa-master rewrite. They
use the v0.1.x single-file pattern (`import { test, expect } from "@playwright/test"`,
inline `page.goto`, no PageClass).

**They are intentionally NOT updated to v0.2.0 conformance** because:

1. They served as the calibration baseline that proved Stage 1/Stage 2 work end-to-end.
2. They are PR-merged history — rewriting them would mask the actual calibration trajectory.
3. They are excluded from v0.2.0 validators (qa-master conformance, ESLint qa-master rules) via per-file overrides.

**Why archived here:** before this move, these files lived directly under
`outputs/tests/` and confused Sonnet on new migrations (the v0.1.x file with
the same input basename was visible in the snippet inventory, leading to
report-metric hallucinations — see sel-python iters 3-5 on 2026-06-10).

Moving them to this subfolder takes them out of Sonnet's inventory scan
without deleting historical evidence.
