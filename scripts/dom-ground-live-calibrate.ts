#!/usr/bin/env tsx
/**
 * dom-ground-live-calibrate.ts — Phase 7c calibration runner.
 *
 * Walks `tools/calibrate-pipeline/fixtures/dom-ground-live/` and probes each
 * fixture's locator against the live SUT URL. Compares to `expected.txt`
 * verdict and reports pass/fail.
 *
 * Deliberately NOT wired into `npm run smoke` — these probes need network,
 * are slower (~3-5 s per fixture), and depend on third-party site stability.
 * Run manually via `npm run check:dom-ground:live` before flipping
 * `DOM_GROUND_STRICT=true` (Phase 7c gate flip).
 *
 * If a fixture fails because the SUT changed:
 *   - Re-probe the locator manually with `npx playwright codegen <url>`
 *   - Update `probe.spec.ts` + `expected.txt`
 *   - Or drop the fixture and pick another from `docs/dom-ground-public-suts.md`
 */

import { existsSync, readFileSync, readdirSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const REPO_ROOT = resolve(new URL("..", import.meta.url).pathname);
const FIXTURES_DIR = join(REPO_ROOT, "tools/calibrate-pipeline/fixtures/dom-ground-live");
const DOM_GROUND = join(REPO_ROOT, "scripts/dom-ground.ts");

interface FixtureResult {
  name: string;
  expected: string;
  actual: string;
  passed: boolean;
  detail: string;
}

function runFixture(name: string): FixtureResult {
  const dir = join(FIXTURES_DIR, name);
  const probe = join(dir, "probe.spec.ts");
  const url = readFileSync(join(dir, "sut-url.txt"), "utf-8").trim();
  const expected = readFileSync(join(dir, "expected.txt"), "utf-8").trim();
  const tmp = mkdtempSync(join(tmpdir(), `dg-live-${name}-`));
  const report = join(tmp, "report.json");
  const r = spawnSync(
    "npx",
    ["tsx", DOM_GROUND, "--url", url, "--probe", probe, "--report", report, "--mode", "live"],
    { cwd: REPO_ROOT, encoding: "utf8" },
  );
  if (!existsSync(report)) {
    rmSync(tmp, { recursive: true, force: true });
    return {
      name,
      expected,
      actual: "ERROR",
      passed: false,
      detail: `dom-ground exited ${r.status} with no report. stderr: ${r.stderr.slice(0, 200)}`,
    };
  }
  interface ProbeResult { domVerdict?: string }
  interface Report { results?: ProbeResult[] }
  const data = JSON.parse(readFileSync(report, "utf-8")) as Report;
  rmSync(tmp, { recursive: true, force: true });
  const firstVerdict = data.results?.[0]?.domVerdict ?? "ERROR";
  return {
    name,
    expected,
    actual: firstVerdict,
    passed: firstVerdict === expected,
    detail: `dom-ground exit ${r.status}, ${data.results?.length ?? 0} probe(s)`,
  };
}

function main(): void {
  if (!existsSync(FIXTURES_DIR)) {
    process.stderr.write(`::error::${FIXTURES_DIR} not found\n`);
    process.exit(2);
  }
  const fixtures = readdirSync(FIXTURES_DIR)
    .filter((n) => n.startsWith("good-") || n.startsWith("bad-"))
    .toSorted();
  process.stdout.write(`dom-ground-live-calibrate: running ${fixtures.length} fixtures\n\n`);
  const results: FixtureResult[] = [];
  for (const f of fixtures) {
    process.stdout.write(`  ${f.padEnd(46)} `);
    const r = runFixture(f);
    results.push(r);
    process.stdout.write(`${r.passed ? "PASS" : "FAIL"} (expected=${r.expected}, actual=${r.actual})\n`);
  }
  const passed = results.filter((r) => r.passed).length;
  process.stdout.write(`\nResult: ${passed}/${results.length} fixtures passed\n`);
  if (passed < results.length) {
    process.stdout.write("\nFailed fixtures:\n");
    for (const r of results.filter((x) => !x.passed)) {
      process.stdout.write(`  ${r.name}: expected '${r.expected}', got '${r.actual}' — ${r.detail}\n`);
    }
    process.exit(1);
  }
}

main();
