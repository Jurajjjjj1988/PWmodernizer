#!/usr/bin/env node
/**
 * evaluate.ts — produces `outputs/reports/<input>.md` with concrete metrics.
 *
 * Runs in migrate.yml after the generation step. Outputs to stdout a single
 * `confidence` number (0..1) that the workflow uses to decide whether to
 * trigger verify.yml.
 *
 * Metrics produced (per migration-rules.md §9 + knowledge-base.md §7):
 *   - Compile/parse pass (binary)
 *   - Selector quality score (role/label/testid count vs nth/CSS/XPath)
 *   - Web-first assertion rate
 *   - Smell count delta vs source (Magic Number, Hard Wait, Eager, etc.)
 *   - Forbidden patterns present (list)
 *   - AST-diff-not-trivial flag
 *   - Plan confidence aggregate (read from outputs/plans/<input>.md)
 *
 * Run:
 *   npx tsx scripts/evaluate.ts \
 *     --input inputs/bad-playwright/foo.spec.ts \
 *     --plan outputs/plans/foo.spec.ts.md \
 *     --output outputs/tests/foo.spec.ts \
 *     --report-out outputs/reports/foo.spec.ts.md
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { basename, dirname } from "node:path";
import { parseArgs } from "node:util";
import { MetricsDB, type UsageStats } from "./metrics.js";

/**
 * Load a UsageStats JSON file emitted by extract-claude-usage.ts. Missing or
 * malformed → returns null (row persists as "untracked" — dashboard treats
 * cost_usd IS NULL as "no data", not zero).
 */
function loadUsageStats(path: string | undefined): UsageStats | null {
  if (!path || !existsSync(path)) return null;
  try {
    const raw: unknown = JSON.parse(readFileSync(path, "utf8"));
    if (typeof raw !== "object" || raw === null) return null;
    const obj = raw as Partial<UsageStats>;
    if (typeof obj.model !== "string" || typeof obj.input_tokens !== "number" || typeof obj.output_tokens !== "number") {
      return null;
    }
    return obj as UsageStats;
  } catch {
    return null;
  }
}

interface Args {
  input: string;
  plan: string;
  output: string;
  "report-out": string;
  /** Optional path to UsageStats JSON from extract-claude-usage.ts. */
  usage?: string;
}

function parseCliArgs(): Args {
  const { values } = parseArgs({
    options: {
      input: { type: "string" },
      plan: { type: "string" },
      output: { type: "string" },
      "report-out": { type: "string" },
      usage: { type: "string" },
    },
  });
  for (const k of ["input", "plan", "output", "report-out"] as const) {
    if (!values[k]) {
      throw new Error(`--${k} is required`);
    }
  }
  return values as unknown as Args;
}

// ---- Smell detectors (regex-based; defensible for v0).
// Per arxiv:2410.10628 these counts dominate "is this a good test" judgement.
interface SmellCount {
  hardWaits: number;
  magicNumbers: number;
  forcedClicks: number;
  nthSelectors: number;
  cssClassSelectors: number;
  pagePauses: number;
  testOnly: number;
  testSkip: number;
  anyType: number;
  consoleLog: number;
  nonWebFirstAsserts: number;
  conditionalInTest: number;
}

function emptySmells(): SmellCount {
  return {
    hardWaits: 0,
    magicNumbers: 0,
    forcedClicks: 0,
    nthSelectors: 0,
    cssClassSelectors: 0,
    pagePauses: 0,
    testOnly: 0,
    testSkip: 0,
    anyType: 0,
    consoleLog: 0,
    nonWebFirstAsserts: 0,
    conditionalInTest: 0,
  };
}

function countSmells(rawSource: string): SmellCount {
  const c = emptySmells();
  // Strip comments before pattern detection — comments often reference the
  // ORIGINAL smell (e.g., 'replaces waitForTimeout(7000) from line 25') as
  // documentation, not as a re-introduction of the smell. False-positives
  // from comment-scanning artificially inflate output-smell counts and
  // depress confidence scores. The same logic is applied before LCS overlap.
  const source = rawSource
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
  // Hard waits (Playwright + Cypress + Selenium variants).
  c.hardWaits += (source.match(/waitForTimeout\s*\(/g) ?? []).length;
  c.hardWaits += (source.match(/cy\.wait\s*\(\s*\d+/g) ?? []).length;
  c.hardWaits += (source.match(/Thread\.sleep\s*\(/g) ?? []).length;
  c.hardWaits += (source.match(/time\.sleep\s*\(/g) ?? []).length;

  // Magic numbers in test bodies — integers >= 2 not in array index context.
  // Conservative: count any standalone integer >= 100 (timeouts).
  c.magicNumbers += (source.match(/\b\d{3,}\b/g) ?? []).length;

  // Forced actions bypass actionability — almost always wrong.
  c.forcedClicks += (source.match(/\.\s*(click|fill|check)\s*\([^)]*force\s*:\s*true/g) ?? [])
    .length;

  // Index-based selectors.
  c.nthSelectors += (source.match(/\.nth\s*\(/g) ?? []).length;
  c.nthSelectors += (source.match(/\.eq\s*\(\s*\d/g) ?? []).length;
  c.nthSelectors += (source.match(/findElements?\([^)]*\)\.get\s*\(\s*\d/g) ?? []).length;

  // CSS class as primary selector — `page.locator('.foo')` patterns.
  c.cssClassSelectors += (source.match(/\.locator\s*\(\s*['"`]\.[a-zA-Z]/g) ?? []).length;
  c.cssClassSelectors += (source.match(/cy\.get\s*\(\s*['"`]\.[a-zA-Z]/g) ?? []).length;

  // Debug surface left in.
  c.pagePauses += (source.match(/page\.pause\s*\(\s*\)/g) ?? []).length;
  c.pagePauses += (source.match(/cy\.pause\s*\(\s*\)/g) ?? []).length;

  c.testOnly += (source.match(/test\.only\s*\(/g) ?? []).length;
  c.testOnly += (source.match(/it\.only\s*\(/g) ?? []).length;
  c.testOnly += (source.match(/describe\.only\s*\(/g) ?? []).length;

  c.testSkip += (source.match(/test\.skip\s*\(/g) ?? []).length;
  c.testSkip += (source.match(/it\.skip\s*\(/g) ?? []).length;

  c.anyType += (source.match(/:\s*any\b/g) ?? []).length;
  c.anyType += (source.match(/\bas\s+unknown\s+as\b/g) ?? []).length;

  c.consoleLog += (source.match(/console\.log\s*\(/g) ?? []).length;

  // Non-web-first assertions — anti-pattern in Playwright.
  // Total expects minus awaited expects = sync probes. Calibrated 2026-06-10
  // with `webFirstAssertionRate` against PR #13 (was undercounting Bullet 15
  // `expect(capturedMessage).toBe()` calls because the legacy regex only
  // matched `.isVisible()`-style direct probes).
  const totalExpects = (source.match(/\bexpect\s*\(/g) ?? []).length;
  const awaitedExpects = (source.match(/await\s+expect\s*\(/g) ?? []).length;
  c.nonWebFirstAsserts += Math.max(0, totalExpects - awaitedExpects);

  // Conditional logic inside test bodies (true smell, but very hard to
  // count without AST — conservative: search for `if (` after `test(`.
  const testBodies = source.matchAll(/test\s*\([\s\S]*?\)\s*=>\s*\{[\s\S]*?\n\s*\}\s*\)/g);
  for (const m of testBodies) {
    c.conditionalInTest += (m[0].match(/\n\s*if\s*\(/g) ?? []).length;
  }

  return c;
}

// ---- Selector quality (canonical / fragile ratio).
interface SelectorMix {
  canonical: number; // getByRole, getByLabel, getByTestId, getByPlaceholder, getByText, getByAltText, getByTitle
  fragile: number; // nth, locator('css'), xpath, eq()
}

function selectorMix(source: string): SelectorMix {
  const canonical =
    (source.match(/getByRole\s*\(/g) ?? []).length +
    (source.match(/getByLabel\s*\(/g) ?? []).length +
    (source.match(/getByTestId\s*\(/g) ?? []).length +
    (source.match(/getByPlaceholder\s*\(/g) ?? []).length +
    (source.match(/getByText\s*\(/g) ?? []).length +
    (source.match(/getByAltText\s*\(/g) ?? []).length +
    (source.match(/getByTitle\s*\(/g) ?? []).length;
  const fragile =
    (source.match(/\.nth\s*\(/g) ?? []).length +
    (source.match(/\.eq\s*\(\s*\d/g) ?? []).length +
    (source.match(/\.locator\s*\(\s*['"`][.#:[]/g) ?? []).length +
    (source.match(/xpath\s*=\s*['"`]/g) ?? []).length;
  return { canonical, fragile };
}

function selectorQualityScore(mix: SelectorMix): number {
  const total = mix.canonical + mix.fragile;
  if (total === 0) return 1;
  return mix.canonical / total;
}

// ---- Web-first assertion rate.
//
// Definition (per migration-rules.md §5): web-first means `await expect(loc).<matcher>()`
// where loc is a Playwright Locator and the matcher is retrying. Sync probes
// like `expect(stringVar).toBe(...)`, `expect(await x.isVisible()).toBe(...)`,
// `expect(dialog.message()).toBe(...)` are NOT web-first — they assert on a
// snapshot value, no retry.
//
// Counting: every `expect(...)` call in the spec is one assertion. The web-first
// numerator is the subset preceded by `await`. The legacy sync regex only
// matched `expect(X.text()).toBe()` shapes — it missed plain `expect(var).toBe()`
// (PR #13 verify Code Review block-severity finding: report claimed 100% but
// actual was 50% because Bullet 15's `expect(capturedMessage).toBe()` calls
// weren't detected). Calibrated 2026-06-10.
function webFirstAssertionRate(source: string): number {
  const totalExpects = (source.match(/\bexpect\s*\(/g) ?? []).length;
  if (totalExpects === 0) return 1;
  const webFirst = (source.match(/await\s+expect\s*\(/g) ?? []).length;
  return webFirst / totalExpects;
}

// ---- Forbidden patterns hard list. Strip comments first to avoid flagging
// references in WHY-comments (e.g., "// replaces waitForTimeout(7000)").
function findForbidden(rawSource: string): string[] {
  const source = rawSource
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
  const hits: string[] = [];
  if (/waitForTimeout/.test(source)) hits.push("waitForTimeout");
  if (/force\s*:\s*true/.test(source)) hits.push("force: true");
  if (/page\.pause\s*\(/.test(source)) hits.push("page.pause()");
  if (/test\.only\s*\(/.test(source)) hits.push("test.only");
  if (/test\.skip\s*\(/.test(source)) hits.push("test.skip");
  if (/:\s*any\b/.test(source)) hits.push("`: any` type");
  if (/\bas\s+unknown\s+as\b/.test(source)) hits.push("as unknown as cast");
  if (/console\.log\s*\(/.test(source)) hits.push("console.log");
  return hits;
}

// ---- Plan confidence aggregate. Read the plan markdown, count HIGH/MED/LOW.
interface PlanConfidence {
  high: number;
  med: number;
  low: number;
  aggregate: number;
}

function planConfidence(planMd: string): PlanConfidence {
  const tableLines = planMd
    .split("\n")
    .filter((l) => /^\|/.test(l) && /\b(high|med|low)\b/i.test(l));
  let high = 0;
  let med = 0;
  let low = 0;
  for (const line of tableLines) {
    const lower = line.toLowerCase();
    // "Confidence" column — find the cell value (rough heuristic).
    if (/\bhigh\b/.test(lower)) high += 1;
    else if (/\bmed(ium)?\b/.test(lower)) med += 1;
    else if (/\blow\b/.test(lower)) low += 1;
  }
  const total = high + med + low;
  if (total === 0) {
    return { high, med, low, aggregate: 0.5 };
  }
  // High=1.0, Med=0.6, Low=0.2 weighted average.
  const aggregate = (high * 1 + med * 0.6 + low * 0.2) / total;
  return { high, med, low, aggregate };
}

// ---- AST-diff-not-trivial heuristic.
// Conservative: count chars / lines / unique identifiers. If output diff is
// only whitespace + imports vs source, mark trivial. Real AST analysis is a
// v1 improvement; for v0 this catches the gross cases.
function isAstDiffTrivial(source: string, output: string): boolean {
  const stripImports = (s: string) =>
    s
      .split("\n")
      .filter((l) => !/^\s*(import|from|const\s+\w+\s+=\s+require)/.test(l))
      .join("\n");
  const stripComments = (s: string) =>
    s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  const normalize = (s: string) => stripComments(stripImports(s)).replace(/\s+/g, " ").trim();
  const a = normalize(source);
  const b = normalize(output);
  // If 80%+ of source bytes are present verbatim in output, mark trivial.
  const overlap = a.length === 0 ? 0 : longestCommonSubstring(a, b).length / a.length;
  return overlap > 0.8;
}

function longestCommonSubstring(a: string, b: string): string {
  // Naive O(nm) DP — fine for test files (<10KB each).
  const m = a.length;
  const n = b.length;
  if (m === 0 || n === 0) return "";
  let maxLen = 0;
  let endIdx = 0;
  const dp = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 1; i <= m; i += 1) {
    const row = dp[i];
    const prevRow = dp[i - 1];
    if (!row || !prevRow) continue;
    for (let j = 1; j <= n; j += 1) {
      if (a[i - 1] === b[j - 1]) {
        const cell = (prevRow[j - 1] ?? 0) + 1;
        row[j] = cell;
        if (cell > maxLen) {
          maxLen = cell;
          endIdx = i;
        }
      }
    }
  }
  return a.slice(endIdx - maxLen, endIdx);
}

// ---- Report writer.
interface Report {
  input: string;
  output: string;
  source: SmellCount;
  outputSmells: SmellCount;
  selector: SelectorMix;
  selectorQuality: number;
  webFirstRate: number;
  forbidden: string[];
  trivial: boolean;
  confidence: PlanConfidence;
  inputLoc: number;
  outputLoc: number;
}

// Output quality signals (introduced 2026-06-04):
//   smellRemovalRate: fraction of source smells eliminated in output. 1.0 =
//     every source smell removed; 0.0 = none removed (or smells added).
//   forbiddenAbsence: 1.0 if no forbidden patterns in output, else 0.0.
// Previous formula was 0.6/0.3/0.1 over plan/selector/webfirst — output
// quality only impacted aggregate via selector + webfirst. High-quality
// Stage 2 work couldn't lift confidence above the plan's ceiling. New
// formula reduces plan weight to 0.4 and adds smell-removal + forbidden-
// absence so a clean migration of an ambitious plan reads above 0.7.
function computeAggregateConfidence(r: Report): number {
  const sourceSmellTotal = Object.values(r.source).reduce((a, b) => a + b, 0);
  const outputSmellTotal = Object.values(r.outputSmells).reduce((a, b) => a + b, 0);
  const smellRemovalRate = sourceSmellTotal === 0
    ? 1
    : Math.max(0, (sourceSmellTotal - outputSmellTotal) / sourceSmellTotal);
  const forbiddenAbsence = r.forbidden.length === 0 ? 1 : 0;
  return (
    r.confidence.aggregate * 0.4
    + r.selectorQuality * 0.25
    + r.webFirstRate * 0.1
    + smellRemovalRate * 0.15
    + forbiddenAbsence * 0.1
  );
}

function renderReport(r: Report): string {
  const deltaSmells: Record<string, number> = {};
  for (const k of Object.keys(r.source) as (keyof SmellCount)[]) {
    deltaSmells[k] = (r.outputSmells[k] ?? 0) - (r.source[k] ?? 0);
  }
  const smellTable = Object.entries(deltaSmells)
    .map(([k, v]) => `| ${k} | ${r.source[k as keyof SmellCount]} | ${r.outputSmells[k as keyof SmellCount]} | ${v >= 0 ? "+" : ""}${v} |`)
    .join("\n");
  const totalConfidence = computeAggregateConfidence(r).toFixed(2);
  return `# Migration report: ${basename(r.input)}

## Source → Target
- Source: \`${r.input}\` (${r.inputLoc} LOC)
- Output: \`${r.output}\` (${r.outputLoc} LOC)
- LOC delta: ${r.outputLoc - r.inputLoc >= 0 ? "+" : ""}${r.outputLoc - r.inputLoc}

## Quality scores
- **Aggregate confidence:** ${totalConfidence}
- Selector quality: ${(r.selectorQuality * 100).toFixed(0)}% canonical (${r.selector.canonical} canonical / ${r.selector.fragile} fragile)
- Web-first assertion rate: ${(r.webFirstRate * 100).toFixed(0)}%
- Plan confidence: ${r.confidence.high} high / ${r.confidence.med} med / ${r.confidence.low} low → avg ${r.confidence.aggregate.toFixed(2)}

### Confidence breakdown
| Signal | Value | Weight | Contribution |
|---|---|---|---|
| Plan confidence | ${r.confidence.aggregate.toFixed(2)} | 0.40 | ${(r.confidence.aggregate * 0.4).toFixed(3)} |
| Selector quality | ${r.selectorQuality.toFixed(2)} | 0.25 | ${(r.selectorQuality * 0.25).toFixed(3)} |
| Web-first rate | ${r.webFirstRate.toFixed(2)} | 0.10 | ${(r.webFirstRate * 0.1).toFixed(3)} |
| Smell removal rate | ${(Object.values(r.source).reduce((a, b) => a + b, 0) === 0 ? 1 : Math.max(0, (Object.values(r.source).reduce((a, b) => a + b, 0) - Object.values(r.outputSmells).reduce((a, b) => a + b, 0)) / Object.values(r.source).reduce((a, b) => a + b, 0))).toFixed(2)} | 0.15 | — |
| Forbidden absence | ${r.forbidden.length === 0 ? "1.00" : "0.00"} | 0.10 | ${r.forbidden.length === 0 ? "0.100" : "0.000"} |

## Smell count (source → output → delta)
| Smell | Source | Output | Delta |
|---|---|---|---|
${smellTable}

## Forbidden patterns in output
${r.forbidden.length === 0 ? "✅ None." : r.forbidden.map((f) => `- ❌ \`${f}\``).join("\n")}

## AST diff
- **Trivial (cosmetic-only)?** ${r.trivial ? "❌ YES — REJECT THIS MIGRATION" : "✅ no"}

## Recommended human checks
1. Spot-check 2-3 LOW-confidence locator translations from the plan — do they match the real DOM?
2. Run the migrated test against staging; verify it catches the same bugs as the source did.
3. If verify report exists (\`outputs/reports/${basename(r.input)}-verify.md\`), read the disagreements section.
`;
}

// ---- Main.
function main(): void {
  const args = parseCliArgs();
  // Explicit file-existence guards with workflow-friendly error annotations.
  // Raw readFileSync ENOENT messages are cryptic; this gives reviewers a
  // clear pointer to the missing file.
  for (const [name, path] of Object.entries({
    input: args.input,
    output: args.output,
    plan: args.plan,
  })) {
    try {
      readFileSync(path, "utf8");
    } catch {
      process.stderr.write(`::error::evaluate: --${name} not found at ${path}\n`);
      process.exit(1);
    }
  }
  const inputSrc = readFileSync(args.input, "utf8");
  const outputSrc = readFileSync(args.output, "utf8");
  const planMd = readFileSync(args.plan, "utf8");

  const sourceSmells = countSmells(inputSrc);
  const outputSmells = countSmells(outputSrc);
  const selector = selectorMix(outputSrc);
  const selectorQuality = selectorQualityScore(selector);
  const webFirstRate = webFirstAssertionRate(outputSrc);
  const forbidden = findForbidden(outputSrc);
  const trivial = isAstDiffTrivial(inputSrc, outputSrc);
  const confidence = planConfidence(planMd);
  const inputLoc = inputSrc.split("\n").length;
  const outputLoc = outputSrc.split("\n").length;

  const report: Report = {
    input: args.input,
    output: args.output,
    source: sourceSmells,
    outputSmells,
    selector,
    selectorQuality,
    webFirstRate,
    forbidden,
    trivial,
    confidence,
    inputLoc,
    outputLoc,
  };

  mkdirSync(dirname(args["report-out"]), { recursive: true });
  writeFileSync(args["report-out"], renderReport(report));

  // Persist metrics to SQLite for cross-run trend analysis (v1 ROADMAP
  // "Metrics dashboard"). Wrapped in try/catch — the metrics DB is a local
  // reporting cache, not a system of record, so a write failure must not
  // fail the migration workflow. See scripts/metrics.ts for schema.
  try {
    const sourceFramework = parseSourceFrameworkFromPlan(planMd);
    const subtractive = sourceFramework === "bad-playwright";
    const sourceSmellTotal = Object.values(report.source).reduce((a, b) => a + b, 0);
    const outputSmellTotal = Object.values(report.outputSmells).reduce((a, b) => a + b, 0);
    const smellRemovalRate = sourceSmellTotal === 0
      ? 1
      : Math.max(0, (sourceSmellTotal - outputSmellTotal) / sourceSmellTotal);
    const forbiddenAbsence = report.forbidden.length === 0 ? 1 : 0;
    const dbPath = process.env["METRICS_DB"] ?? "outputs/.metrics.db";
    const commitSha = process.env["GITHUB_SHA"] ?? "local";
    const usage = loadUsageStats(args.usage);
    const metricsDB = new MetricsDB(dbPath);
    try {
      metricsDB.recordMigration({
        input_basename: basename(args.input),
        source_framework: sourceFramework,
        subtractive,
        aggregate_confidence: computeAggregateConfidence(report),
        selector_quality_score: report.selectorQuality,
        web_first_rate: report.webFirstRate,
        plan_confidence_aggregate: report.confidence.aggregate,
        smell_removal_rate: smellRemovalRate,
        forbidden_absence: forbiddenAbsence,
        commit_sha: commitSha,
        usage,
      });
    } finally {
      metricsDB.close();
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`::warning::evaluate: metrics persistence failed (non-fatal): ${msg}\n`);
  }

  // Aggregate confidence to stdout — workflow consumes this. Uses the same
  // formula as the rendered report (computeAggregateConfidence) so the
  // workflow-routed value cannot drift from the human-readable report.
  process.stdout.write(computeAggregateConfidence(report).toFixed(2));
}

/**
 * Parse the source framework label from a plan markdown body. Mirrors
 * scripts/derive-envelope.ts:parseSourceFramework — kept local to avoid
 * importing from a script that itself imports ts-morph (heavy dep on a
 * lightweight metrics write).
 */
function parseSourceFrameworkFromPlan(planMd: string): string {
  const lowered = planMd.toLowerCase();
  if (lowered.includes("bad-playwright")) return "bad-playwright";
  if (lowered.includes("selenium-java") || lowered.includes("selenium java")) return "selenium-java";
  if (lowered.includes("selenium-python") || lowered.includes("selenium python")) return "selenium-python";
  if (lowered.includes("cypress")) return "cypress";
  return "unknown";
}

main();
