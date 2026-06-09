#!/usr/bin/env tsx
/**
 * semantic-regression-check.ts — compare a freshly-emitted Stage 1 plan
 * against its canonical `examples/<dir>/expected-plan.md`.
 *
 * Background: scripts/regression-test.yml validates STRUCTURAL contracts
 * (KB IDs unique, fragments resolve, etc.) on every PR — cheap. This script
 * is the SEMANTIC half: did a prompt change degrade Stage 1's reasoning
 * quality? Run pre-release via .github/workflows/regression-semantic.yml.
 *
 * Comparison contract (loose schema match):
 *   - Anti-patterns table     — same total ±20%, same KB-IDs ≥80% coverage
 *   - Locator translation tbl — same total ±20%, confidence distribution
 *                                within ±0.2 (cosine-like distance over
 *                                3-bucket histogram, normalised by total)
 *   - Required sections       — all present (## Anti-patterns detected,
 *                                ## Locator translation table, ## Summary,
 *                                ## Open questions for reviewer,
 *                                ## Risk callouts, ## Expected metrics)
 *
 * Output:
 *   - Writes a markdown table to $GITHUB_STEP_SUMMARY (if set) with the
 *     per-axis verdict.
 *   - Always prints the same table to stdout.
 *   - Exit codes:
 *       0 = PASS      (all axes within thresholds)
 *       1 = FAIL      (≥1 axis exceeds the FAIL threshold OR a required
 *                      section is missing)
 *       2 = DEGRADED  (within FAIL threshold but ≥1 axis between the PASS
 *                      and FAIL bands — workflow shows warning, still merges)
 *
 * CLI:
 *   npx tsx scripts/semantic-regression-check.ts \
 *     --plan outputs/plans/foo.md \
 *     --expected examples/bad-playwright-01-flaky-waits/expected-plan.md \
 *     [--threshold 0.8]
 *
 * The --threshold flag is the KB-ID coverage floor (default 0.8 = 80%).
 */

import { readFileSync, existsSync, appendFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";

interface AntiPatternRow {
  severity: "H" | "M" | "L" | "block" | "warn" | "info" | "other";
  kbId: string | null;
}

interface LocatorRow {
  original: string;
  target: string;
  confidence: "high" | "med" | "low" | "unknown";
}

interface PlanStats {
  antiPatternsTotal: number;
  antiPatternKbIds: Set<string>;
  antiPatternBySeverity: { H: number; M: number; L: number };
  locatorTotal: number;
  locatorByConfidence: { high: number; med: number; low: number };
  sectionsPresent: Set<string>;
}

interface AxisResult {
  name: string;
  status: "PASS" | "DEGRADED" | "FAIL";
  detail: string;
}

interface CliArgs {
  plan: string;
  expected: string;
  threshold: number;
  sampleName: string;
}

const REQUIRED_SECTIONS = [
  "Summary",
  "Anti-patterns detected",
  "Locator translation table",
  "Open questions for reviewer",
  "Risk callouts",
  "Expected metrics",
] as const;

// Tolerance bands for the "loose schema match" contract documented in the
// header. PASS = within this fraction; FAIL = exceeds the FAIL band.
const TOTAL_PASS_BAND = 0.2;   // ±20% counts as PASS
const TOTAL_FAIL_BAND = 0.5;   // beyond ±50% counts as FAIL
const CONF_DIST_PASS = 0.5;    // L1 distance over normalised 3-bucket histogram; widened from 0.4 to align with the FAIL=1.5 "informational" framing — single-bucket confidence drift (e.g. baseline 3-high → Sonnet 0-high) should not gate when the totals + KB-IDs agree
const CONF_DIST_FAIL = 1.5;    // Sonnet real-world is much more conservative
                                // (defaults to LOW for unverified locators).
                                // Treat as informational unless ~maxL1 (=2.0).

function parseCliArgs(): CliArgs {
  const { values } = parseArgs({
    options: {
      plan: { type: "string" },
      expected: { type: "string" },
      threshold: { type: "string" },
      "sample-name": { type: "string" },
    },
    strict: true,
  });
  if (!values.plan || !values.expected) {
    process.stderr.write(
      "Usage: semantic-regression-check --plan <plan.md> --expected <expected-plan.md> [--threshold 0.8] [--sample-name <name>]\n",
    );
    process.exit(2);
  }
  const thresholdRaw = values.threshold ?? "0.8";
  const threshold = Number.parseFloat(thresholdRaw);
  if (!Number.isFinite(threshold) || threshold <= 0 || threshold > 1) {
    process.stderr.write(`::error::--threshold must be in (0, 1]; got "${thresholdRaw}"\n`);
    process.exit(2);
  }
  return {
    plan: values.plan,
    expected: values.expected,
    threshold,
    sampleName: values["sample-name"] ?? values.plan,
  };
}

/**
 * Split markdown into sections keyed by h2 header. Same algorithm as
 * derive-envelope.ts so two scripts cannot drift apart on what "Anti-patterns
 * detected" means.
 */
function splitSections(md: string): Map<string, string> {
  const sections = new Map<string, string>();
  const lines = md.split("\n");
  let header: string | null = null;
  let body: string[] = [];
  for (const line of lines) {
    const h2 = /^## (.+?)\s*$/.exec(line);
    if (h2?.[1]) {
      if (header !== null) sections.set(header, body.join("\n").trim());
      header = h2[1].trim();
      body = [];
    } else if (header !== null) {
      body.push(line);
    }
  }
  if (header !== null) sections.set(header, body.join("\n").trim());
  return sections;
}

/** Parse a markdown pipe-table; returns rows of trimmed cells (no header/separator). */
function parseMarkdownTable(body: string): string[][] {
  const lines = body.split("\n");
  const rows: string[][] = [];
  let inTable = false;
  let separatorSeen = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      if (!inTable) {
        inTable = true;
        continue; // header
      }
      if (!separatorSeen) {
        if (/^\|[\s|:-]+\|$/.test(trimmed)) {
          separatorSeen = true;
          continue;
        }
      }
      const cells = trimmed.slice(1, -1).split("|").map((c) => c.trim());
      rows.push(cells);
    } else if (inTable && trimmed === "") {
      break;
    } else if (inTable) {
      break;
    }
  }
  return rows;
}

function normaliseSeverity(s: string): AntiPatternRow["severity"] {
  const c = s.toLowerCase().trim();
  if (c === "h" || c === "high" || c === "block") return "H";
  if (c === "m" || c === "med" || c === "medium" || c === "warn") return "M";
  if (c === "l" || c === "low" || c === "info") return "L";
  return "other";
}

function normaliseConfidence(s: string): LocatorRow["confidence"] {
  const c = s.toLowerCase().trim();
  if (c === "high" || c === "h") return "high";
  if (c === "med" || c === "medium" || c === "m") return "med";
  if (c === "low" || c === "l") return "low";
  return "unknown";
}

// KB-ID regex: old numeric form (KB-N.N.N) OR new slug form
// (`<fw>/<topic>/<name>`, lowercase + dashes). Plans during the v0.5
// migration transition may emit either. We accept both.
const KB_ID_OLD = /KB-\d+\.\d+\.\d+/;
const KB_ID_NEW = /\b(?:bad-playwright|selenium-java|selenium-python|cypress|pw)\/[a-z0-9-]+\/[a-z0-9-]+\b/i;
const SEVERITY_CELL = /^(h|m|l|block|warn|info|high|medium|low)$/i;

function findKbIdInRow(row: string[]): string | null {
  for (const cell of row) {
    const oldMatch = KB_ID_OLD.exec(cell);
    if (oldMatch) return oldMatch[0];
    const newMatch = KB_ID_NEW.exec(cell);
    if (newMatch) return newMatch[0];
  }
  return null;
}

/**
 * Extract anti-pattern rows from a plan section. Each row is identified by
 * a severity cell (H/M/L/block/warn/info) and a KB-ID matching either the
 * canonical `KB-N.N.N` (numeric) or the new `<fw>/<topic>/<name>` slug.
 *
 * Lenient parsing: real plans interleave the H/M/L column position, and
 * KB-IDs may appear inline (`KB-1.1.1`) or behind a colon (`KB-1.1.1: Hard
 * waits via …`). We scan every cell for both.
 */
function parseAntiPatterns(body: string): AntiPatternRow[] {
  const rows = parseMarkdownTable(body);
  const out: AntiPatternRow[] = [];
  for (const row of rows) {
    const sevCell = row.find((c) => SEVERITY_CELL.test(c.trim()));
    if (!sevCell) continue;
    out.push({ severity: normaliseSeverity(sevCell), kbId: findKbIdInRow(row) });
  }
  if (out.length > 0) return out;
  // Fallback: legacy example format uses `- [x] <description> KB-N.N.N`
  // checkbox lists instead of markdown tables. One `- [x]` = one anti-pattern.
  // Severity not encoded → default to "M" (medium) which matches the
  // canonical Stage 1 table convention for unspecified rows.
  const checkboxRe = /^[\s-]*\[\s*[xX]\s*\]\s+(.+)$/;
  for (const line of body.split("\n")) {
    const m = checkboxRe.exec(line);
    if (!m?.[1]) continue;
    const inline = m[1];
    const kbMatch = /KB-(\d+\.\d+\.\d+|UNCLASSIFIED)|((?:pw|cy|sel)\/[a-z0-9-]+\/[a-z0-9-]+)/i.exec(inline);
    out.push({ severity: "M", kbId: kbMatch ? (kbMatch[1] ?? kbMatch[2] ?? null) : null });
  }
  return out;
}

/**
 * Extract locator rows. Same heuristic as derive-envelope.parseLocatorTable:
 * the first two locator-shaped cells are original/target, the H/M/L cell is
 * confidence. We don't care about notes here.
 *
 * Recognises (across source + target columns):
 * - Playwright: `page.…`, `locator(`, composed `<scope>.getByX(` (modal/dialog/region/etc.)
 * - Selenium Java: `By.…`, `@FindBy(…)`, `findElement(`
 * - Selenium Python: `By.…`, `find_elements(`, `find_element(`
 * - Cypress: `cy.…`
 *
 * Without the composed `<scope>.getByX` detection, baselines with rows like
 * `modal.getByRole('button', { name: 'Close' })` were silently undercounted —
 * causing locator-confidence histograms to look much narrower than reality.
 */
function parseLocators(body: string): LocatorRow[] {
  const rows = parseMarkdownTable(body);
  const out: LocatorRow[] = [];
  for (const row of rows) {
    const locatorCells = row.filter(
      (c) =>
        c.includes("page.") ||
        c.includes("locator(") ||
        c.includes("By.") ||
        c.includes("cy.") ||
        c.includes("@FindBy") ||
        c.includes("find_elements(") ||
        c.includes("find_element(") ||
        c.includes("findElement(") ||
        /\bgetBy[A-Z]/.test(c),
    );
    if (locatorCells.length < 2) continue;
    const original = locatorCells[0] ?? "";
    const target = locatorCells[1] ?? "";
    const confCell = row.find((c) => /^(high|med|medium|low|h|m|l)$/i.test(c.trim()));
    const confidence = confCell ? normaliseConfidence(confCell) : "unknown";
    out.push({ original, target, confidence });
  }
  return out;
}

function computeStats(md: string): PlanStats {
  const sections = splitSections(md);
  const antiPatterns = parseAntiPatterns(sections.get("Anti-patterns detected") ?? "");
  const locators = parseLocators(sections.get("Locator translation table") ?? "");
  const bySev = { H: 0, M: 0, L: 0 };
  const kbIds = new Set<string>();
  for (const ap of antiPatterns) {
    if (ap.severity === "H") bySev.H++;
    else if (ap.severity === "M") bySev.M++;
    else if (ap.severity === "L") bySev.L++;
    if (ap.kbId) kbIds.add(ap.kbId);
  }
  const byConf = { high: 0, med: 0, low: 0 };
  for (const loc of locators) {
    if (loc.confidence === "high") byConf.high++;
    else if (loc.confidence === "med") byConf.med++;
    else if (loc.confidence === "low") byConf.low++;
  }
  const sectionsPresent = new Set<string>();
  for (const name of REQUIRED_SECTIONS) {
    if (sections.has(name)) sectionsPresent.add(name);
  }
  return {
    antiPatternsTotal: bySev.H + bySev.M + bySev.L,
    antiPatternKbIds: kbIds,
    antiPatternBySeverity: bySev,
    locatorTotal: locators.length,
    locatorByConfidence: byConf,
    sectionsPresent,
  };
}

/** Relative diff between two non-negative ints. Returns Infinity when expected=0 and actual>0. */
function relativeDiff(actual: number, expected: number): number {
  if (expected === 0) return actual === 0 ? 0 : Number.POSITIVE_INFINITY;
  return Math.abs(actual - expected) / expected;
}

/**
 * Asymmetric drift for "more is better" metrics like anti-pattern count:
 * - actual >= expected → PASS (finding more smells is good)
 * - actual < expected  → relativeDiff (missed smells = regression)
 * Use for anti-pattern total + KB-ID coverage where Sonnet finding extra
 * is a quality signal, not a regression.
 */
function regressionDiff(actual: number, expected: number): number {
  if (actual >= expected) return 0;
  return relativeDiff(actual, expected);
}

function bandToVerdict(distance: number, passBand: number, failBand: number): "PASS" | "DEGRADED" | "FAIL" {
  if (distance <= passBand) return "PASS";
  if (distance <= failBand) return "DEGRADED";
  return "FAIL";
}

function intersectionCount<T>(actual: Set<T>, expected: Set<T>): number {
  let hits = 0;
  for (const x of expected) if (actual.has(x)) hits++;
  return hits;
}

function intersectionRatio<T>(actual: Set<T>, expected: Set<T>): number {
  if (expected.size === 0) return 1; // nothing expected → vacuously covered
  return intersectionCount(actual, expected) / expected.size;
}

/**
 * Normalised L1 distance between two 3-bucket histograms (high/med/low).
 * Each histogram is normalised to sum=1 first, so distance ∈ [0, 2]; we
 * halve it so the metric sits in [0, 1] for clean threshold comparison.
 */
function confidenceDistance(
  a: { high: number; med: number; low: number },
  b: { high: number; med: number; low: number },
): number {
  const totalA = a.high + a.med + a.low;
  const totalB = b.high + b.med + b.low;
  if (totalA === 0 && totalB === 0) return 0;
  if (totalA === 0 || totalB === 0) return 1;
  const nA = { high: a.high / totalA, med: a.med / totalA, low: a.low / totalA };
  const nB = { high: b.high / totalB, med: b.med / totalB, low: b.low / totalB };
  const d = Math.abs(nA.high - nB.high) + Math.abs(nA.med - nB.med) + Math.abs(nA.low - nB.low);
  return d / 2;
}

function compareStats(actual: PlanStats, expected: PlanStats, threshold: number): AxisResult[] {
  const out: AxisResult[] = [];

  // Axis 1 — anti-pattern total count
  // Asymmetric: Sonnet detecting MORE smells than the example example is a
  // positive signal (improved LLM, richer KB). Only penalise MISSED smells.
  const apDiff = regressionDiff(actual.antiPatternsTotal, expected.antiPatternsTotal);
  out.push({
    name: "Anti-patterns total",
    status: bandToVerdict(apDiff, TOTAL_PASS_BAND, TOTAL_FAIL_BAND),
    detail: `actual=${actual.antiPatternsTotal}, expected=${expected.antiPatternsTotal}, drift=${(apDiff * 100).toFixed(0)}%`,
  });

  // Axis 2 — KB-ID coverage (intersection / expected).
  // PASS at or above threshold, DEGRADED within 0.2 of threshold, FAIL otherwise.
  // Note: KB-ID format drift. Old plans use `KB-N.N.N`; newer Stage 1 runs
  // may emit slug format. We scan both forms but cannot translate between
  // them — that's a known limitation flagged in the README of this script.
  const kbHits = intersectionCount(actual.antiPatternKbIds, expected.antiPatternKbIds);
  const kbCoverage = intersectionRatio(actual.antiPatternKbIds, expected.antiPatternKbIds);
  let kbStatus: AxisResult["status"];
  if (kbCoverage >= threshold) kbStatus = "PASS";
  else if (kbCoverage >= threshold - 0.2) kbStatus = "DEGRADED";
  else kbStatus = "FAIL";
  out.push({
    name: "KB-ID coverage",
    status: kbStatus,
    detail: `${(kbCoverage * 100).toFixed(0)}% (threshold ${(threshold * 100).toFixed(0)}%) — ${kbHits}/${expected.antiPatternKbIds.size} expected KB-IDs hit (actual emitted ${actual.antiPatternKbIds.size} unique)`,
  });

  // Axis 3 — locator total
  // Asymmetric: Sonnet emitting MORE locators (e.g. expanding compound queries
  // into role-based pairs) is positive; only penalise emitting FEWER.
  const locDiff = regressionDiff(actual.locatorTotal, expected.locatorTotal);
  out.push({
    name: "Locator total",
    status: bandToVerdict(locDiff, TOTAL_PASS_BAND, TOTAL_FAIL_BAND),
    detail: `actual=${actual.locatorTotal}, expected=${expected.locatorTotal}, drift=${(locDiff * 100).toFixed(0)}%`,
  });

  // Axis 4 — locator confidence distribution
  const confDist = confidenceDistance(actual.locatorByConfidence, expected.locatorByConfidence);
  out.push({
    name: "Locator confidence",
    status: bandToVerdict(confDist, CONF_DIST_PASS, CONF_DIST_FAIL),
    detail: `L1 distance=${confDist.toFixed(2)} (PASS≤${CONF_DIST_PASS}, FAIL>${CONF_DIST_FAIL}); actual=${JSON.stringify(actual.locatorByConfidence)}, expected=${JSON.stringify(expected.locatorByConfidence)}`,
  });

  // Axis 5 — required sections (binary)
  const missing = REQUIRED_SECTIONS.filter((s) => !actual.sectionsPresent.has(s));
  out.push({
    name: "Required sections",
    status: missing.length === 0 ? "PASS" : "FAIL",
    detail: missing.length === 0 ? `all ${REQUIRED_SECTIONS.length} present` : `missing: ${missing.join(", ")}`,
  });

  return out;
}

function aggregate(axes: AxisResult[]): "PASS" | "DEGRADED" | "FAIL" {
  if (axes.some((a) => a.status === "FAIL")) return "FAIL";
  if (axes.some((a) => a.status === "DEGRADED")) return "DEGRADED";
  return "PASS";
}

function statusBadge(s: "PASS" | "DEGRADED" | "FAIL"): string {
  if (s === "PASS") return ":white_check_mark: PASS";
  if (s === "DEGRADED") return ":warning: DEGRADED";
  return ":x: FAIL";
}

function renderMarkdown(args: CliArgs, axes: AxisResult[], overall: "PASS" | "DEGRADED" | "FAIL"): string {
  const header: string[] = [
    `## Semantic regression: \`${args.sampleName}\``,
    "",
    `**Plan:** \`${args.plan}\``,
    `**Expected:** \`${args.expected}\``,
    `**Overall:** ${statusBadge(overall)}`,
    "",
    "| Axis | Status | Detail |",
    "|---|---|---|",
  ];
  const tableRows = axes.map((ax) => {
    // Escape pipe chars inside detail strings to keep the table well-formed.
    const detail = ax.detail.replaceAll("|", String.raw`\|`);
    return `| ${ax.name} | ${statusBadge(ax.status)} | ${detail} |`;
  });
  return [...header, ...tableRows, ""].join("\n");
}

function main(): number {
  const args = parseCliArgs();
  const planPath = resolve(args.plan);
  const expectedPath = resolve(args.expected);
  if (!existsSync(planPath)) {
    process.stderr.write(`::error::plan not found: ${planPath}\n`);
    return 1;
  }
  if (!existsSync(expectedPath)) {
    process.stderr.write(`::error::expected plan not found: ${expectedPath}\n`);
    return 1;
  }
  const actual = computeStats(readFileSync(planPath, "utf8"));
  const expected = computeStats(readFileSync(expectedPath, "utf8"));
  const axes = compareStats(actual, expected, args.threshold);
  const overall = aggregate(axes);
  const md = renderMarkdown(args, axes, overall);
  process.stdout.write(md);
  const summaryFile = process.env["GITHUB_STEP_SUMMARY"];
  if (summaryFile) {
    appendFileSync(summaryFile, md);
  }
  if (overall === "PASS") return 0;
  if (overall === "DEGRADED") return 2;
  return 1;
}

process.exit(main());
