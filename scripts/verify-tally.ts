#!/usr/bin/env tsx
/**
 * verify-tally.ts — replicates the bash tally logic in verify.yml so it can
 * be unit-tested and calibrated outside CI.
 *
 * The production tally is bash inline in verify.yml (commit `3993b01`).
 * Both implementations MUST agree. If you change one, change the other.
 *
 * Logic:
 *   - parseVerdict(report) returns "SHIP IT" | "FIX FIRST" | "START OVER"
 *     - missing file or unparseable → "START OVER" (conservative)
 *   - Tally:
 *     - 2/2 SHIP IT → SHIP IT
 *     - 1/2 → FIX FIRST
 *     - 0/2 → START OVER
 *
 * CLI:
 *   npx tsx scripts/verify-tally.ts \
 *     --sdet outputs/reports/<basename>-verify-sdet.md \
 *     --code-review outputs/reports/<basename>-verify-code-review.md \
 *     [--expected "SHIP IT"|"FIX FIRST"|"START OVER"]
 *
 * Exit codes:
 *   0 — final verdict computed (and matches --expected if provided)
 *   1 — verdict mismatch (--expected differs from computed)
 */

import { existsSync, readFileSync } from "node:fs";
import { parseArgs } from "node:util";

export type Verdict = "SHIP IT" | "FIX FIRST" | "START OVER";

const ALL_VERDICTS: ReadonlySet<Verdict> = new Set(["SHIP IT", "FIX FIRST", "START OVER"]);

export function parseVerdict(reportPath: string): Verdict {
  if (!existsSync(reportPath)) return "START OVER";
  const text = readFileSync(reportPath, "utf-8");
  const m = /^- Verdict:\s+(.+)$/m.exec(text);
  if (!m?.[1]) return "START OVER";
  const v = m[1].trim();
  return (ALL_VERDICTS as Set<string>).has(v) ? (v as Verdict) : "START OVER";
}

export function tally(sdet: Verdict, cr: Verdict): Verdict {
  // Max-severity consensus (calibrated 2026-06-10 against PR #13 verify run
  // 27240945253). Legacy "SHIP_COUNT == 0 → START OVER" over-rejected when
  // both lenses agreed on warn-severity findings (FIX FIRST + FIX FIRST):
  // no lens wanted regeneration, but auto-regen fired anyway.
  //
  //   SHIP IT + SHIP IT       → SHIP IT
  //   SHIP IT + FIX FIRST     → FIX FIRST
  //   SHIP IT + START OVER    → START OVER (one strong reject)
  //   FIX FIRST + FIX FIRST   → FIX FIRST (no lens wants regen)
  //   FIX FIRST + START OVER  → START OVER
  //   START OVER + START OVER → START OVER
  if (sdet === "START OVER" || cr === "START OVER") return "START OVER";
  if (sdet === "FIX FIRST" || cr === "FIX FIRST") return "FIX FIRST";
  return "SHIP IT";
}

function main(): void {
  const { values } = parseArgs({
    options: {
      sdet: { type: "string" },
      "code-review": { type: "string" },
      expected: { type: "string" },
    },
    strict: true,
  });
  if (!values.sdet || !values["code-review"]) {
    process.stderr.write(
      "Usage: verify-tally --sdet <sdet.md> --code-review <cr.md> [--expected <verdict>]\n",
    );
    process.exit(2);
  }
  const sdetVerdict = parseVerdict(values.sdet);
  const crVerdict = parseVerdict(values["code-review"]);
  const final = tally(sdetVerdict, crVerdict);
  process.stdout.write(
    `verify-tally: SDET=${sdetVerdict} CR=${crVerdict} → ${final}\n`,
  );
  if (values.expected !== undefined && values.expected !== final) {
    process.stderr.write(
      `::error::verify-tally: expected '${values.expected}' but got '${final}'\n`,
    );
    process.exit(1);
  }
  process.exit(0);
}

main();
