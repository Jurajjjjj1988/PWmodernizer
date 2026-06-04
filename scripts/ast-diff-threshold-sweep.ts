#!/usr/bin/env tsx
/**
 * Threshold-sensitivity sweep for ast-diff-trivial-check.
 *
 * Currently the trivial-migration gate fires when normalized tree-edit distance
 * is below a single global threshold (default 0.05 = 5%). ROADMAP v0.5 calls for
 * tuning after observing 10+ real diffs — we have 10 calibration fixtures (5
 * good + 5 bad). This script measures the actual normalized distance per
 * fixture, sweeps the threshold across a representative range, and reports:
 *
 *   - per-fixture verdict matrix across thresholds
 *   - the widest threshold band where all good PASS and all bad REJECT
 *   - the recommended threshold (mid-point of the safe band)
 *
 * Goal: prove that 5% is well-inside the safe band (or report otherwise).
 *
 * Run:
 *   npx tsx scripts/ast-diff-threshold-sweep.ts
 */

import { spawnSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const REPO_ROOT = resolve(new URL("..", import.meta.url).pathname);
const FIXTURES_ROOT = join(REPO_ROOT, "tools/calibrate-pipeline/fixtures/ast-diff-trivial-check");
const CHECK_SCRIPT = join(REPO_ROOT, "scripts/ast-diff-trivial-check.ts");

const THRESHOLDS = [0.01, 0.02, 0.03, 0.05, 0.07, 0.10, 0.15, 0.20];

interface FixtureMeasurement {
  name: string;
  expectedKind: "good" | "bad";
  normalized: number; // 0..1
}

function findInputOutput(fixtureDir: string): { input: string; output: string } | null {
  const entries = readdirSync(fixtureDir);
  const input = entries.find((n) => /^input\.(ts|tsx|java|py)$/.test(n));
  const output = entries.find((n) => /^output\.(spec\.ts|ts|tsx|java|py)$/.test(n));
  return input && output ? { input, output } : null;
}

function measureFixture(fixtureDir: string, name: string): FixtureMeasurement | null {
  const io = findInputOutput(fixtureDir);
  if (!io) return null;
  // Use threshold=1.0 so the check always exits 0 — we only want to read the
  // normalized distance line from stdout, not the gate verdict.
  const r = spawnSync(
    "npx",
    [
      "tsx",
      CHECK_SCRIPT,
      "--input",
      join(fixtureDir, io.input),
      "--output",
      join(fixtureDir, io.output),
      "--threshold",
      "1.0",
    ],
    { cwd: REPO_ROOT, encoding: "utf8" },
  );
  const m = /Normalized distance:\s+([\d.]+)%/.exec(r.stdout);
  if (!m?.[1]) return null;
  return {
    name,
    expectedKind: name.startsWith("good-") ? "good" : "bad",
    normalized: Number.parseFloat(m[1]) / 100,
  };
}

function gateVerdict(normalized: number, threshold: number): "PASS" | "REJECT" {
  return normalized < threshold ? "REJECT" : "PASS";
}

function isCorrect(m: FixtureMeasurement, threshold: number): boolean {
  const verdict = gateVerdict(m.normalized, threshold);
  return (m.expectedKind === "good" && verdict === "PASS") || (m.expectedKind === "bad" && verdict === "REJECT");
}

function main(): void {
  const fixtureNames = readdirSync(FIXTURES_ROOT)
    .filter((n) => statSync(join(FIXTURES_ROOT, n)).isDirectory())
    .toSorted();

  process.stdout.write(`Measuring ${fixtureNames.length} fixtures...\n\n`);
  const measurements: FixtureMeasurement[] = [];
  for (const name of fixtureNames) {
    const m = measureFixture(join(FIXTURES_ROOT, name), name);
    if (m === null) {
      process.stderr.write(`::warning::skipped ${name} (no input/output pair)\n`);
      continue;
    }
    measurements.push(m);
    process.stdout.write(`  ${name.padEnd(34)} normalized=${(m.normalized * 100).toFixed(2)}%\n`);
  }
  process.stdout.write("\n");

  // Per-fixture verdict matrix
  const header = ["fixture".padEnd(34), ...THRESHOLDS.map((t) => `${(t * 100).toFixed(0)}%`.padStart(6))].join(" | ");
  process.stdout.write(`${header}\n`);
  process.stdout.write(`${"-".repeat(header.length)}\n`);
  for (const m of measurements) {
    const cells = THRESHOLDS.map((t) => {
      const v = gateVerdict(m.normalized, t);
      const ok = isCorrect(m, t);
      return `${ok ? "✓" : "✗"} ${v}`.padStart(6);
    });
    process.stdout.write(`${m.name.padEnd(34)} | ${cells.join(" | ")}\n`);
  }
  process.stdout.write("\n");

  // Find safe band: thresholds where all 10 fixtures classify correctly
  const safeThresholds = THRESHOLDS.filter((t) => measurements.every((m) => isCorrect(m, t)));
  if (safeThresholds.length === 0) {
    process.stdout.write("::warning::no threshold in the swept range correctly classifies all fixtures.\n");
    // Find threshold with fewest errors
    let bestT = THRESHOLDS[0] ?? 0.05;
    let bestErrors = measurements.length + 1;
    for (const t of THRESHOLDS) {
      const errors = measurements.filter((m) => !isCorrect(m, t)).length;
      if (errors < bestErrors) {
        bestErrors = errors;
        bestT = t;
      }
    }
    process.stdout.write(`Best-effort threshold: ${(bestT * 100).toFixed(0)}% (${bestErrors} fixture errors)\n`);
    process.exit(1);
  }

  const minSafe = Math.min(...safeThresholds);
  const maxSafe = Math.max(...safeThresholds);
  // Tightest gap between bad-max and good-min, the true safety margin
  const badMax = Math.max(...measurements.filter((m) => m.expectedKind === "bad").map((m) => m.normalized));
  const goodMin = Math.min(...measurements.filter((m) => m.expectedKind === "good").map((m) => m.normalized));
  const safeBandLow = badMax;
  const safeBandHigh = goodMin;
  const recommended = (safeBandLow + safeBandHigh) / 2;
  const currentDefault = 0.05;
  const margin = goodMin - badMax;

  process.stdout.write(
    `Safe-band analysis:\n` +
      `  max(bad normalized)   = ${(badMax * 100).toFixed(2)}%\n` +
      `  min(good normalized)  = ${(goodMin * 100).toFixed(2)}%\n` +
      `  safety margin         = ${(margin * 100).toFixed(2)}% (good-min minus bad-max)\n` +
      `  recommended threshold = ${(recommended * 100).toFixed(2)}% (midpoint of safe band)\n` +
      `  current default       = ${(currentDefault * 100).toFixed(0)}%\n` +
      `  current is ${currentDefault >= safeBandLow && currentDefault <= safeBandHigh ? "INSIDE" : "OUTSIDE"} the safe band ` +
      `[${(safeBandLow * 100).toFixed(2)}%, ${(safeBandHigh * 100).toFixed(2)}%]\n` +
      `  swept thresholds that classify all fixtures correctly: ` +
      `[${safeThresholds.map((t) => `${(t * 100).toFixed(0)}%`).join(", ")}]\n` +
      `  (min..max within sweep: ${(minSafe * 100).toFixed(0)}%..${(maxSafe * 100).toFixed(0)}%)\n`,
  );

  if (margin < 0.05) {
    process.stdout.write(
      `\n::warning::safety margin is narrow (<5%). Consider adding more diverse fixtures before tightening.\n`,
    );
  } else {
    process.stdout.write(`\nMargin is wide; the 5% default is robust. No retuning required yet.\n`);
  }
}

main();
