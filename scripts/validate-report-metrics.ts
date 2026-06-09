#!/usr/bin/env tsx
/**
 * validate-report-metrics.ts — post-Stage-2 gate that cross-checks the
 * migration report's claimed metrics against the actually-emitted spec file.
 *
 * Background: PR #13 verify Code Review (PromptJupiter, 2026-06-09) flagged
 * a block-severity failure where the report claimed
 *   Output: outputs/tests/using_selenium_tests.spec.ts (29 LOC)
 * while the actual emitted spec was
 *   outputs/tests/prompt-jupiter.spec.ts (52 LOC)
 * — a wholesale copy-paste from a different migration's report.
 *
 * Bullet 12 in prompts/generate.md mandates the report's filename/LOC match
 * the emitted file. This script is the defense-in-depth automatic check.
 *
 * Checks (all hard-fail):
 *   1. The `Output:` line in the report references a file that exists on disk
 *   2. The LOC the report claims matches `wc -l` on that file (±1 for trailing newline)
 *   3. The report's claimed LOC delta is consistent with source LOC - emitted LOC
 *
 * CLI:
 *   npx tsx scripts/validate-report-metrics.ts \
 *     --report outputs/reports/PromptJupiterTest.java.md \
 *     --input inputs/selenium-java/PromptJupiterTest.java
 *
 * Exit codes:
 *   0 = clean
 *   1 = contract violation (::error:: annotated)
 *
 * Strict TS, no any.
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve, basename } from "node:path";
import { parseArgs } from "node:util";

interface CliArgs {
  report: string;
  input: string;
}

interface Violation {
  file: string;
  line: number;
  message: string;
}

/**
 * Convert envelope.inputBasename → list of plausible emitted spec basenames.
 * Kept in sync with `plan-envelope-validate.ts:expectedSpecBasenames`.
 * Sonnet often drops trailing `-test` because `.spec.ts` implies test-ness.
 */
function expectedSpecBasenames(inputBasename: string): string[] {
  const stem = inputBasename.replace(/\.(java|py|cy\.[jt]s|spec\.[jt]s|[jt]s)$/i, "");
  const kebab = stem
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replaceAll("_", "-")
    .toLowerCase();
  const out = new Set<string>([`${kebab}.spec.ts`]);
  const dropTest = kebab.replace(/-tests?$/, "");
  if (dropTest !== kebab) out.add(`${dropTest}.spec.ts`);
  return Array.from(out);
}

function parseCliArgs(): CliArgs {
  const { values } = parseArgs({
    options: {
      report: { type: "string" },
      input: { type: "string" },
    },
  });
  if (typeof values.report !== "string" || values.report.length === 0) {
    throw new Error("--report is required");
  }
  if (typeof values.input !== "string" || values.input.length === 0) {
    throw new Error("--input is required");
  }
  return { report: values.report, input: values.input };
}

/**
 * Count lines in a file. Mirrors `wc -l`: counts newline characters.
 * If the file doesn't end with a newline, `wc -l` undercounts by 1 — we
 * mirror that behaviour so report claims like "52 LOC" match `wc -l` output.
 */
function countLines(path: string): number {
  const content = readFileSync(path, "utf8");
  return (content.match(/\n/g) ?? []).length;
}

/**
 * Extract the emitted spec path from the report's `## Source → Target` block.
 *
 * Looks for either:
 *   `Output: outputs/tests/<basename>.spec.ts (N LOC)` (legacy line form), OR
 *   `- outputs/tests/<basename>.spec.ts (N LOC)` (file-list form per schema)
 *
 * Returns `{ path, claimedLoc, line }` if found; null if no spec reference.
 */
function extractEmittedSpec(report: string): { path: string; claimedLoc: number | null; line: number } | null {
  const lines = report.split("\n");
  // Prefer the canonical schema's file-list form: `  - outputs/tests/<x>.spec.ts (N LOC)`
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    // Accept both bare and backtick-wrapped paths; LOC may be in parens after.
    // Examples that match:
    //   `- Output: \`outputs/tests/foo.spec.ts\` (52 LOC)`
    //   `- outputs/tests/foo.spec.ts (52 LOC)`
    //   `Output: outputs/tests/foo.spec.ts`
    const m = /(?:Output:|^\s*-)\s+`?(outputs\/tests\/[^\s`)]+\.spec\.ts)`?(?:\s*\((\d+)\s*LOC\))?/i.exec(line);
    if (m?.[1]) {
      const path = m[1];
      const claimedLoc = m[2] !== undefined ? Number.parseInt(m[2], 10) : null;
      return { path, claimedLoc, line: i + 1 };
    }
  }
  return null;
}

/**
 * Extract a claimed LOC delta from the report's `## Source → Target` block.
 * Pattern: `Output LOC: N` or `LOC delta: -N` or `Source LOC: M`.
 */
function extractClaimedLocBlock(report: string): { sourceLoc: number | null; outputLoc: number | null; delta: number | null } {
  const sourceMatch = /Source LOC:\s*(\d+)/i.exec(report);
  const outputMatch = /Output LOC:\s*(\d+)/i.exec(report);
  const deltaMatch = /LOC delta:\s*(-?\d+)/i.exec(report);
  return {
    sourceLoc: sourceMatch ? Number.parseInt(sourceMatch[1] ?? "", 10) : null,
    outputLoc: outputMatch ? Number.parseInt(outputMatch[1] ?? "", 10) : null,
    delta: deltaMatch ? Number.parseInt(deltaMatch[1] ?? "", 10) : null,
  };
}

function annotate(v: Violation): void {
  process.stderr.write(`::error file=${v.file},line=${v.line}::${v.message}\n`);
}

interface EmittedSpec {
  path: string;
  claimedLoc: number | null;
  line: number;
}

/** Check 1a: emitted basename must derive from input basename. */
function checkBasenameDerivation(
  emitted: EmittedSpec,
  inputBasename: string,
  reportPath: string,
): Violation[] {
  const expected = expectedSpecBasenames(inputBasename);
  const emittedBase = basename(emitted.path);
  if (expected.includes(emittedBase)) return [];
  return [{
    file: reportPath,
    line: emitted.line,
    message: `report's Output references '${emittedBase}' but the input '${inputBasename}' should produce one of [${expected.join(", ")}] (kebab-case derivation). Likely copy-paste from another migration's report — PR #13 root cause.`,
  }];
}

/** Check 2 + 3: report's claimed LOC matches actual file. */
function checkLocConsistency(
  emitted: EmittedSpec,
  specPath: string,
  report: string,
  reportPath: string,
): Violation[] {
  const out: Violation[] = [];
  const actualLoc = countLines(specPath);
  if (emitted.claimedLoc !== null && Math.abs(actualLoc - emitted.claimedLoc) > 1) {
    out.push({
      file: reportPath,
      line: emitted.line,
      message: `report claims ${emitted.path} has ${emitted.claimedLoc} LOC but actual file is ${actualLoc} lines — report metrics must be counted from the emitted file (Bullet 12 of generate.md)`,
    });
  }
  const block = extractClaimedLocBlock(report);
  if (block.outputLoc !== null && Math.abs(actualLoc - block.outputLoc) > 1) {
    out.push({
      file: reportPath,
      line: emitted.line,
      message: `report claims Output LOC = ${block.outputLoc} but the actually-emitted spec (${basename(specPath)}) is ${actualLoc} lines`,
    });
  }
  if (block.sourceLoc !== null && block.outputLoc !== null && block.delta !== null) {
    const expectedDelta = block.outputLoc - block.sourceLoc;
    if (Math.abs(expectedDelta - block.delta) > 2) {
      out.push({
        file: reportPath,
        line: emitted.line,
        message: `LOC delta claimed ${block.delta} but source(${block.sourceLoc}) → output(${block.outputLoc}) computes ${expectedDelta}`,
      });
    }
  }
  return out;
}

function validateReport(report: string, reportPath: string, inputBasename: string): Violation[] {
  const emitted = extractEmittedSpec(report);
  if (!emitted) {
    return [{
      file: reportPath,
      line: 1,
      message: "report does not reference an emitted spec under outputs/tests/ — schema requires `Output:` or file-list bullet pointing at the spec",
    }];
  }
  const violations: Violation[] = [...checkBasenameDerivation(emitted, inputBasename, reportPath)];
  const specPath = resolve(emitted.path);
  if (!existsSync(specPath)) {
    violations.push({
      file: reportPath,
      line: emitted.line,
      message: `report references ${emitted.path} but that file does not exist`,
    });
    return violations;
  }
  violations.push(...checkLocConsistency(emitted, specPath, report, reportPath));
  return violations;
}

function main(): number {
  const args = parseCliArgs();
  const reportPath = resolve(args.report);
  if (!existsSync(reportPath)) {
    process.stderr.write(`::error::report file missing: ${reportPath}\n`);
    return 1;
  }
  if (!existsSync(args.input)) {
    process.stderr.write(`::error::input file missing: ${args.input}\n`);
    return 1;
  }
  const report = readFileSync(reportPath, "utf8");
  const violations = validateReport(report, reportPath, basename(args.input));
  if (violations.length === 0) {
    const sizeKb = (statSync(reportPath).size / 1024).toFixed(1);
    process.stdout.write(`validate-report-metrics: ${args.report} (${sizeKb} KB) — clean.\n`);
    return 0;
  }
  for (const v of violations) annotate(v);
  process.stderr.write(`validate-report-metrics: ${violations.length} contract violation(s)\n`);
  return 1;
}

process.exit(main());
