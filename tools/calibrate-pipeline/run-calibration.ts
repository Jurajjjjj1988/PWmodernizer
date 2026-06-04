#!/usr/bin/env node
/**
 * run-calibration.ts — exercises every gating validator against a known-good
 * and known-bad fixture corpus. Per Sakasegawa 2026, an uncalibrated validator
 * is WORSE than no validator (false confidence). This script proves each
 * validator accepts the goods and rejects the bads BEFORE we let it block CI.
 *
 * Per-fixture contract:
 *   - exit code matches `expectedExit` derived from fixture name prefix
 *     (`good-` -> 0, `bad-` -> 1)
 *   - stdout/stderr contain every substring listed in the golden-output file
 *     (one substring per non-empty, non-comment line; `#`-prefixed are
 *     treated as comments and ignored)
 *
 * Run:
 *   npx tsx tools/calibrate-pipeline/run-calibration.ts
 *   npx tsx tools/calibrate-pipeline/run-calibration.ts --validator kb-validate
 */

import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import {
  cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync,
  rmSync, statSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { parseArgs } from "node:util";

const REPO_ROOT = resolve(new URL("../..", import.meta.url).pathname);
const FIXTURES_ROOT = join(REPO_ROOT, "tools", "calibrate-pipeline", "fixtures");
const GOLDEN_ROOT = join(REPO_ROOT, "tools", "calibrate-pipeline", "golden-outputs");
const SCRIPTS_DIR = join(REPO_ROOT, "scripts");
const FIXTURE_SPLIT = "<!--FIXTURE-SPLIT-->";

type ValidatorName =
  | "kb-validate" | "plan-envelope-validate"
  | "ast-diff-trivial-check" | "validate-examples"
  | "plan-code-coverage";

const VALIDATORS: readonly ValidatorName[] = [
  "kb-validate", "plan-envelope-validate",
  "ast-diff-trivial-check", "validate-examples",
  "plan-code-coverage",
];

interface FixtureResult {
  fixture: string;
  expectedExit: number;
  actualExit: number;
  missingSubstrings: string[];
  passed: boolean;
}

interface ValidatorReport {
  validator: ValidatorName;
  good: number; goodTotal: number;
  bad: number; badTotal: number;
  results: FixtureResult[];
}

function parseGolden(path: string): string[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8").split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#"));
}

function expectedExitFromName(name: string): number {
  if (name.startsWith("good-")) return 0;
  if (name.startsWith("bad-")) return 1;
  throw new Error(`fixture '${name}' must start with 'good-' or 'bad-'`);
}

function listFixtureNames(validator: ValidatorName): string[] {
  const dir = join(FIXTURES_ROOT, validator);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((n) => n.startsWith("good-") || n.startsWith("bad-"))
    .sort();
}

function combinedOutput(r: SpawnSyncReturns<string>): string {
  return `${r.stdout}\n${r.stderr}`;
}

function buildResult(
  fixture: string, r: SpawnSyncReturns<string>, golden: string[],
): FixtureResult {
  const out = combinedOutput(r);
  const missing = golden.filter((n) => !out.includes(n));
  const expected = expectedExitFromName(fixture);
  const actual = r.status ?? -1;
  return {
    fixture, expectedExit: expected, actualExit: actual,
    missingSubstrings: missing,
    passed: actual === expected && missing.length === 0,
  };
}

function goldenPath(validator: ValidatorName, stem: string): string {
  return join(GOLDEN_ROOT, validator, `${stem}.expected.txt`);
}

function withTempSandbox<T>(prefix: string, fn: (dir: string) => T): T {
  const sandbox = mkdtempSync(join(tmpdir(), prefix));
  try { return fn(sandbox); }
  finally { rmSync(sandbox, { recursive: true, force: true }); }
}

function runKb(fixtureName: string): FixtureResult {
  const raw = readFileSync(join(FIXTURES_ROOT, "kb-validate", fixtureName), "utf8");
  const splitIdx = raw.indexOf(FIXTURE_SPLIT);
  const kbBody = splitIdx === -1 ? raw : raw.slice(0, splitIdx);
  const rulesBody = splitIdx === -1 ? "" : raw.slice(splitIdx + FIXTURE_SPLIT.length);
  return withTempSandbox("pwm-cal-kb-", (sandbox) => {
    mkdirSync(join(sandbox, "config"), { recursive: true });
    mkdirSync(join(sandbox, "scripts"), { recursive: true });
    mkdirSync(join(sandbox, "prompts"), { recursive: true });
    writeFileSync(join(sandbox, "config", "knowledge-base.md"), kbBody);
    writeFileSync(join(sandbox, "config", "migration-rules.md"), rulesBody);
    cpSync(join(SCRIPTS_DIR, "kb-validate.ts"), join(sandbox, "scripts", "kb-validate.ts"));
    const r = spawnSync("npx", ["tsx", join(sandbox, "scripts", "kb-validate.ts")],
      { cwd: sandbox, encoding: "utf8" });
    const golden = parseGolden(goldenPath("kb-validate", basename(fixtureName, ".md")));
    return buildResult(fixtureName, r, golden);
  });
}

function runEnvelope(fixtureName: string): FixtureResult {
  const fixturePath = join(FIXTURES_ROOT, "plan-envelope-validate", fixtureName);
  const isDir = statSync(fixturePath).isDirectory();
  const envelopeArg = isDir ? join(fixturePath, "envelope.json") : fixturePath;
  const args = ["tsx", join(SCRIPTS_DIR, "plan-envelope-validate.ts"), "--envelope", envelopeArg];
  if (isDir && existsSync(join(fixturePath, "code.ts"))) {
    args.push("--code", join(fixturePath, "code.ts"));
  }
  const r = spawnSync("npx", args, { cwd: REPO_ROOT, encoding: "utf8" });
  const stem = isDir ? fixtureName : basename(fixtureName, ".json");
  return buildResult(fixtureName, r, parseGolden(goldenPath("plan-envelope-validate", stem)));
}

// Output may be .spec.ts (good migration), .py, or .java (bad rename-only
// where the LLM never ported the language).
function findOutputFile(dir: string): string | null {
  const entries = readdirSync(dir);
  const tsHit = entries.find((n) => /^output\.[\w.-]*ts$/.test(n));
  if (tsHit) return tsHit;
  return entries.find((n) => /^output\.(java|py)$/.test(n)) ?? null;
}

// Input may be .ts (legacy), .java (Selenium Java), or .py (Selenium Python).
function findInputFile(dir: string): string | null {
  const entries = readdirSync(dir);
  for (const ext of [".ts", ".java", ".py"]) {
    const hit = entries.find((n) => n === `input${ext}`);
    if (hit) return hit;
  }
  return null;
}

function runAstDiff(fixtureName: string): FixtureResult {
  const fixtureDir = join(FIXTURES_ROOT, "ast-diff-trivial-check", fixtureName);
  const inputName = findInputFile(fixtureDir);
  const outputName = findOutputFile(fixtureDir);
  if (inputName === null || outputName === null) {
    const missing = inputName === null ? "(no input.* file)" : "(no output.* file)";
    return {
      fixture: fixtureName, expectedExit: expectedExitFromName(fixtureName),
      actualExit: -1, missingSubstrings: [missing], passed: false,
    };
  }
  const r = spawnSync("npx", [
    "tsx", join(SCRIPTS_DIR, "ast-diff-trivial-check.ts"),
    "--input", join(fixtureDir, inputName),
    "--output", join(fixtureDir, outputName),
  ], { cwd: REPO_ROOT, encoding: "utf8" });
  return buildResult(fixtureName, r, parseGolden(goldenPath("ast-diff-trivial-check", fixtureName)));
}

function runValidateExamples(fixtureName: string): FixtureResult {
  const fixturePath = join(FIXTURES_ROOT, "validate-examples", fixtureName);
  return withTempSandbox("pwm-cal-ve-", (sandbox) => {
    mkdirSync(join(sandbox, "config"), { recursive: true });
    mkdirSync(join(sandbox, "scripts"), { recursive: true });
    mkdirSync(join(sandbox, "examples", "calibration-fixture"), { recursive: true });
    // Reuse the live KB so legitimate references (KB-1.1.1, KB-1.3.1, KB-1.4.1)
    // resolve — only the phantom KB-1.99.99 / KB-2.99.99 IDs are rejected.
    cpSync(join(REPO_ROOT, "config", "knowledge-base.md"), join(sandbox, "config", "knowledge-base.md"));
    cpSync(join(SCRIPTS_DIR, "validate-examples.ts"), join(sandbox, "scripts", "validate-examples.ts"));
    cpSync(fixturePath, join(sandbox, "examples", "calibration-fixture", "expected-plan.md"));
    const r = spawnSync("npx", ["tsx", join(sandbox, "scripts", "validate-examples.ts"), "--strict"],
      { cwd: sandbox, encoding: "utf8" });
    const golden = parseGolden(goldenPath("validate-examples", basename(fixtureName, ".md")));
    return buildResult(fixtureName, r, golden);
  });
}

function runPlanCodeCoverage(fixtureName: string): FixtureResult {
  // plan-code-coverage closes the LPW loop end-to-end: each fixture pairs an
  // envelope.json with a code.ts. For multi-file fixtures (e.g. good-02 which
  // references outputs/tests/pages/login.page.ts), the fixture dir itself
  // doubles as a sandbox repo root so requiredPOMs/Fixtures existence checks
  // resolve locally. The flag is a no-op for fixtures with empty arrays.
  const fixtureDir = join(FIXTURES_ROOT, "plan-code-coverage", fixtureName);
  const envelope = join(fixtureDir, "envelope.json");
  const code = join(fixtureDir, "code.ts");
  const r = spawnSync("npx", [
    "tsx", join(SCRIPTS_DIR, "plan-code-coverage.ts"),
    "--envelope", envelope,
    "--output", code,
    "--repo-root", fixtureDir,
  ], { cwd: REPO_ROOT, encoding: "utf8" });
  return buildResult(fixtureName, r, parseGolden(goldenPath("plan-code-coverage", fixtureName)));
}

const FIXTURE_RUNNERS: Record<ValidatorName, (name: string) => FixtureResult> = {
  "kb-validate": runKb,
  "plan-envelope-validate": runEnvelope,
  "ast-diff-trivial-check": runAstDiff,
  "validate-examples": runValidateExamples,
  "plan-code-coverage": runPlanCodeCoverage,
};

function runValidator(validator: ValidatorName): ValidatorReport {
  const fixtures = listFixtureNames(validator);
  const results = fixtures.map((n) => FIXTURE_RUNNERS[validator](n));
  const goods = results.filter((r) => r.expectedExit === 0);
  const bads = results.filter((r) => r.expectedExit === 1);
  return {
    validator,
    good: goods.filter((r) => r.passed).length, goodTotal: goods.length,
    bad: bads.filter((r) => r.passed).length, badTotal: bads.length,
    results,
  };
}

function printReport(reports: ValidatorReport[]): boolean {
  let allPassed = true;
  for (const rep of reports) {
    const passed = rep.good + rep.bad;
    const total = rep.goodTotal + rep.badTotal;
    const allGreen = passed === total;
    if (!allGreen) allPassed = false;
    process.stdout.write(
      `[${allGreen ? "OK " : "FAIL"}] ${rep.validator}: ${passed}/${total} fixtures passed ` +
      `(${rep.good}/${rep.goodTotal} good + ${rep.bad}/${rep.badTotal} bad)\n`,
    );
    for (const r of rep.results) {
      if (r.passed) continue;
      const missing = r.missingSubstrings.length > 0
        ? `; missing substrings: ${r.missingSubstrings.map((s) => JSON.stringify(s)).join(", ")}`
        : "";
      process.stdout.write(
        `       - ${r.fixture}: expected exit ${r.expectedExit}, got ${r.actualExit}${missing}\n`,
      );
    }
  }
  return allPassed;
}

function assertValidator(name: string): ValidatorName {
  if ((VALIDATORS as readonly string[]).includes(name)) return name as ValidatorName;
  throw new Error(`unknown validator '${name}' — choose one of ${VALIDATORS.join(", ")}`);
}

function main(): number {
  const { values } = parseArgs({ options: { validator: { type: "string" } } });
  const requested = values.validator === undefined
    ? VALIDATORS
    : [assertValidator(values.validator)];
  const reports = requested.map(runValidator);
  return printReport(reports) ? 0 : 1;
}

process.exit(main());
