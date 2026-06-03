#!/usr/bin/env node
/**
 * ast-diff-trivial-check.ts — fails the migrate workflow if the LLM emitted
 * a cosmetic-only change instead of real restructuring.
 *
 * Documented failure mode in Google FSE 2025 (arxiv:2504.09691) — LLMs
 * sometimes reformat the input or add irrelevant comments instead of doing
 * real migration work. This guard rejects those.
 *
 * Heuristic for v0 (real AST parsing is a v1 improvement):
 *   1. Strip imports + comments + whitespace from BOTH input and output.
 *   2. Compute longest-common-substring ratio.
 *   3. If > 80% of the source content appears verbatim in the output, FAIL.
 *
 * Exit codes:
 *   0 = output is substantively different from input (good)
 *   1 = output is a cosmetic-only rewrite (bad — reject migration)
 *
 * Run:
 *   npx tsx scripts/ast-diff-trivial-check.ts \
 *     --input inputs/bad-playwright/foo.spec.ts \
 *     --output outputs/tests/foo.spec.ts
 */

import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";

interface Args {
  input: string;
  output: string;
  threshold?: string;
}

function parseCliArgs(): Args {
  const { values } = parseArgs({
    options: {
      input: { type: "string" },
      output: { type: "string" },
      threshold: { type: "string" },
    },
  });
  for (const k of ["input", "output"] as const) {
    if (!values[k]) {
      throw new Error(`--${k} is required`);
    }
  }
  return values as unknown as Args;
}

function stripImports(s: string): string {
  return s
    .split("\n")
    .filter(
      (l) =>
        !/^\s*(import|from|const\s+\w+\s+=\s+require|using\s+|package\s+|@\w)/.test(l),
    )
    .join("\n");
}

function stripComments(s: string): string {
  return s
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "")
    .replace(/#.*$/gm, "") // Python-style.
    .replace(/"""[\s\S]*?"""/g, ""); // Python docstrings.
}

function normalize(s: string): string {
  return stripComments(stripImports(s))
    .replace(/\s+/g, " ")
    .trim();
}

function longestCommonSubstring(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0 || n === 0) return 0;
  let maxLen = 0;
  // Single-row DP to save memory on large files.
  let prev = new Array<number>(n + 1).fill(0);
  let curr = new Array<number>(n + 1).fill(0);
  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      if (a[i - 1] === b[j - 1]) {
        curr[j] = (prev[j - 1] ?? 0) + 1;
        if ((curr[j] ?? 0) > maxLen) {
          maxLen = curr[j] ?? 0;
        }
      } else {
        curr[j] = 0;
      }
    }
    [prev, curr] = [curr, prev];
    curr.fill(0);
  }
  return maxLen;
}

function main(): void {
  const args = parseCliArgs();
  const threshold = Number.parseFloat(args.threshold ?? "0.8");

  const inputSrc = readFileSync(args.input, "utf8");
  const outputSrc = readFileSync(args.output, "utf8");

  const a = normalize(inputSrc);
  const b = normalize(outputSrc);

  if (a.length === 0) {
    // Empty source — vacuously non-trivial output.
    process.stdout.write("input was empty after normalize — passing\n");
    process.exit(0);
  }

  const lcsLen = longestCommonSubstring(a, b);
  const overlap = lcsLen / a.length;

  process.stdout.write(
    `Normalized input length: ${a.length}\n` +
      `Normalized output length: ${b.length}\n` +
      `Longest common substring: ${lcsLen} (${(overlap * 100).toFixed(1)}% of input)\n` +
      `Trivial threshold: ${(threshold * 100).toFixed(0)}%\n`,
  );

  if (overlap > threshold) {
    process.stderr.write(
      `::error::AST diff is cosmetic-only — ${(overlap * 100).toFixed(1)}% of source ` +
        `appears verbatim in output. The LLM appears to have reformatted ` +
        `instead of restructuring. Reject this migration.\n`,
    );
    process.exit(1);
  }

  process.stdout.write("AST diff is substantively non-trivial — passing.\n");
  process.exit(0);
}

main();
