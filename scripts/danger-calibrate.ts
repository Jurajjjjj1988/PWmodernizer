#!/usr/bin/env node
/**
 * danger-calibrate.ts — local calibrator for `dangerfile.ts`'s 6 PR rules.
 *
 * Walks every fixture in `tools/calibrate-pipeline/fixtures/danger-policy/`,
 * runs the pure-function predicates from `scripts/lib/danger-rules.ts`
 * against each PrSnapshot, and asserts the rule names of fired violations
 * exactly match the fixture's `expectedViolations` declaration.
 *
 * Why not invoke Danger.js itself? `dangerfile.ts` consumes the `danger`
 * global which requires a real GitHub PR context (token + pr URL + commit
 * fetch). Mocking it is fragile and a moving target as `danger` evolves.
 * The rule predicates are pure, so calibrating them directly proves the
 * same logic without booting a GitHub stub.
 *
 * Per-fixture contract:
 *   - JSON shape: { pr, labels, commits, createdFiles, modifiedFiles,
 *                   fileLineCounts?, expectedViolations: RuleName[] }
 *   - Pass: fired rule names (sorted) === expectedViolations (sorted).
 *   - Fail: list missing + unexpected rules for the offending fixture.
 *
 * Exit 0 if every fixture passes; exit 1 otherwise.
 *
 * Run: `npm run check:danger`
 *      `npx tsx scripts/danger-calibrate.ts`
 */

import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { checkAllSync, type PrSnapshot, type Violation } from "./lib/danger-rules.js";

const REPO_ROOT = resolve(new URL("..", import.meta.url).pathname);
const FIXTURES_DIR = join(
  REPO_ROOT, "tools", "calibrate-pipeline", "fixtures", "danger-policy",
);

interface DangerFixture extends PrSnapshot {
  _comment?: string;
  expectedViolations: Violation["rule"][];
}

interface FixtureResult {
  fixture: string;
  passed: boolean;
  expected: string[];
  actual: string[];
  missing: string[];
  unexpected: string[];
}

function loadFixture(name: string): DangerFixture {
  const path = join(FIXTURES_DIR, name);
  const raw = readFileSync(path, "utf8");
  const data = JSON.parse(raw) as DangerFixture;
  if (!Array.isArray(data.expectedViolations)) {
    throw new Error(`fixture ${name} missing or malformed expectedViolations`);
  }
  return data;
}

function listFixtures(): string[] {
  return readdirSync(FIXTURES_DIR)
    .filter((n) => n.endsWith(".json"))
    .filter((n) => n.startsWith("good-") || n.startsWith("bad-"))
    .sort();
}

/**
 * Multiset-equality check: same rule names with same counts, order
 * independent. We sort both sides and walk in lockstep — this catches
 * both `missing` (expected but did not fire) and `unexpected` (fired
 * but not declared) regressions.
 */
function diffMultiset(
  expected: readonly string[], actual: readonly string[],
): { missing: string[]; unexpected: string[] } {
  const remaining = [...actual];
  const missing: string[] = [];
  for (const want of expected) {
    const i = remaining.indexOf(want);
    if (i === -1) missing.push(want);
    else remaining.splice(i, 1);
  }
  return { missing, unexpected: remaining };
}

function runFixture(name: string): FixtureResult {
  const fx = loadFixture(name);
  const violations = checkAllSync(fx);
  const actual = violations.map((v) => v.rule);
  const expected = fx.expectedViolations.map(String);
  const { missing, unexpected } = diffMultiset(expected, actual);
  return {
    fixture: name,
    passed: missing.length === 0 && unexpected.length === 0,
    expected: [...expected].sort(),
    actual: [...actual].sort(),
    missing, unexpected,
  };
}

function printReport(results: readonly FixtureResult[]): boolean {
  const goods = results.filter((r) => r.fixture.startsWith("good-"));
  const bads = results.filter((r) => r.fixture.startsWith("bad-"));
  const goodPass = goods.filter((r) => r.passed).length;
  const badPass = bads.filter((r) => r.passed).length;
  const total = results.length;
  const passed = goodPass + badPass;
  const tag = passed === total ? "OK " : "FAIL";
  process.stdout.write(
    `[${tag}] danger-policy: ${passed}/${total} fixtures passed ` +
    `(${goodPass}/${goods.length} good + ${badPass}/${bads.length} bad)\n`,
  );
  for (const r of results) {
    if (r.passed) continue;
    const bits: string[] = [];
    if (r.missing.length > 0) bits.push(`missing: ${JSON.stringify(r.missing)}`);
    if (r.unexpected.length > 0) bits.push(`unexpected: ${JSON.stringify(r.unexpected)}`);
    process.stdout.write(
      `       - ${r.fixture}: expected=${JSON.stringify(r.expected)} ` +
      `actual=${JSON.stringify(r.actual)} ${bits.join(", ")}\n`,
    );
  }
  return passed === total;
}

function main(): number {
  const fixtures = listFixtures();
  if (fixtures.length === 0) {
    process.stderr.write(`no fixtures found in ${FIXTURES_DIR}\n`);
    return 1;
  }
  const results = fixtures.map(runFixture);
  return printReport(results) ? 0 : 1;
}

process.exit(main());
