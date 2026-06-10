#!/usr/bin/env node
/**
 * plan-code-coverage.ts — closes the LPW (arXiv 2411.14503) loop end-to-end.
 *
 * The plan envelope (scripts/plan-envelope.schema.json) is the inter-stage
 * contract between Stage 1 (plan) and Stage 2 (code generation). prompts/generate.md
 * tells Claude to emit `// plan:scenario=<id>` comments on each generated
 * test() block and to produce exactly the required POMs/fixtures. This
 * validator enforces that compliance after Stage 2, post-merge.
 *
 * Sibling to plan-envelope-validate.ts: that script doubles as
 * (a) schema lint and (b) opt-in plan-vs-code check. This script is the
 * dedicated post-Stage-2 gate — strict by default (the envelope IS the
 * contract; it self-calibrates) and emits GitHub Actions annotations so
 * violations surface inline on the code PR.
 *
 * Checks:
 *   1. Every envelope.scenarios[].id appears as exactly ONE
 *      `// plan:scenario=<id>` comment in the generated spec.
 *   2. No orphan pins — code can't reference a scenario id not in envelope.
 *   3. No duplicate pins — same id pinned >1 time blocks.
 *   4. envelope.requiredPOMs[] paths exist on disk (relative to repo root).
 *   5. envelope.requiredFixtures[] paths exist on disk.
 *   6. envelope.subtractive===true (bad-playwright) → output only imports
 *      from @playwright/test, relative paths, or node:* — any foreign
 *      framework import (e.g. selenium-webdriver, cypress) blocks.
 *
 * CLI:
 *   npx tsx scripts/plan-code-coverage.ts \
 *     --envelope outputs/plans/<basename>.envelope.json \
 *     --output outputs/tests/<basename>.spec.ts \
 *     [--strict|--warn]
 *
 * Exit codes: 0 = clean, 1 = at least one violation in strict mode.
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { Project, SyntaxKind, type Node, type SourceFile } from "ts-morph";

const REPO_ROOT = resolve(new URL("..", import.meta.url).pathname);

interface Args {
  envelope: string;
  output: string;
  mode: "strict" | "warn";
  /** Override REPO_ROOT — for calibration sandboxes that stage POMs locally. */
  repoRoot: string;
}

interface Scenario {
  id: string;
  title: string;
  userAction: string;
  expectedAssertions: string[];
}

interface Envelope {
  inputBasename: string;
  sourceFramework:
    | "bad-playwright"
    | "selenium-java"
    | "selenium-python"
    | "cypress";
  subtractive: boolean;
  scenarios: Scenario[];
  requiredPOMs: string[];
  requiredFixtures: string[];
}

interface Violation {
  file: string;
  line: number;
  message: string;
}

function parseCliArgs(): Args {
  const { values } = parseArgs({
    options: {
      envelope: { type: "string" },
      output: { type: "string" },
      strict: { type: "boolean" },
      warn: { type: "boolean" },
      "repo-root": { type: "string" },
    },
  });
  if (!values.envelope) throw new Error("--envelope is required");
  if (!values.output) throw new Error("--output is required");
  if (values.strict === true && values.warn === true) {
    throw new Error("--strict and --warn are mutually exclusive");
  }
  // Default: strict. The envelope is the contract — self-calibrating.
  const mode: "strict" | "warn" = values.warn === true ? "warn" : "strict";
  const repoRoot =
    values["repo-root"] !== undefined ? resolve(values["repo-root"]) : REPO_ROOT;
  return {
    envelope: values.envelope,
    output: values.output,
    mode,
    repoRoot,
  };
}

function annotate(v: Violation, mode: "strict" | "warn"): void {
  const severity = mode === "warn" ? "warning" : "error";
  process.stderr.write(
    `::${severity} file=${v.file},line=${v.line}::${v.message}\n`,
  );
}

function loadEnvelope(path: string): Envelope {
  const raw: unknown = JSON.parse(readFileSync(path, "utf8"));
  return raw as Envelope;
}

/**
 * Resolve --output to a list of TS spec files. Mirrors plan-envelope-validate
 * behaviour — accepts either a single file or a directory of test files.
 */
function resolveOutputFiles(arg: string): string[] {
  const abs = resolve(arg);
  if (!existsSync(abs)) return [];
  if (statSync(abs).isFile()) return [abs];
  const proj = new Project({ useInMemoryFileSystem: false });
  proj.addSourceFilesAtPaths(join(abs, "**/*.{ts,tsx}"));
  return proj.getSourceFiles().map((sf) => sf.getFilePath());
}

/**
 * Convert envelope.inputBasename → list of plausible emitted spec basenames.
 * Per `migration-rules.md` §"File naming" + `prompts/generate.md` Bullet 14,
 * Stage 2 emits kebab-case `<basename>.spec.ts`. Sonnet often drops a
 * redundant trailing `-test` because `.spec.ts` already implies test-ness.
 * Keep in sync with `plan-envelope-validate.ts:expectedSpecBasenames`.
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

/**
 * Scope outputs to specs belonging to THIS envelope's input. Directory mode
 * accumulates specs from every prior Stage 2 run; without this filter
 * scenario id 1.1 from this input collides with 1.1 from every other input.
 *
 * Matches on basename equals any candidate OR basename starts-with any
 * candidate stem (for sibling specs). Fallback to all paths when no match
 * preserves legacy cross-language rename behaviour.
 */
function filterByInput(envelopeInputBasename: string, paths: string[]): string[] {
  const candidates = expectedSpecBasenames(envelopeInputBasename);
  const stems = candidates.map((c) => c.replace(/\.spec\.ts$/, ""));
  const matches = paths.filter((p) => {
    const b = p.split("/").pop() ?? "";
    if (candidates.includes(b)) return true;
    return stems.some((s) => b.startsWith(`${s}.`));
  });
  return matches.length > 0 ? matches : paths;
}

interface PinHit {
  id: string;
  file: string;
  line: number;
}

/**
 * Walk ts-morph comment ranges (not raw text) so `// plan:scenario=` strings
 * embedded inside string literals or template strings don't count. We dedupe
 * comment ranges per (pos,end) so a comment attached as both trailing-of-A
 * and leading-of-B is only counted once.
 */
function collectScenarioPins(sf: SourceFile): PinHit[] {
  const rx = /\/\/\s*plan:scenario=(\d+\.\d+)/g;
  const seen = new Set<string>();
  const hits: PinHit[] = [];
  const filePath = sf.getFilePath();
  sf.forEachDescendant((node: Node) => {
    const ranges = [
      ...node.getLeadingCommentRanges(),
      ...node.getTrailingCommentRanges(),
    ];
    for (const range of ranges) {
      const key = `${range.getPos()}:${range.getEnd()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const text = range.getText();
      for (const m of text.matchAll(rx)) {
        const id = m[1];
        if (id === undefined) continue;
        const line = sf.getLineAndColumnAtPos(range.getPos()).line;
        hits.push({ id, file: filePath, line });
      }
    }
  });
  return hits;
}

function validateScenarioCoverage(
  envelope: Envelope,
  outputPaths: string[],
): Violation[] {
  const project = new Project({ useInMemoryFileSystem: false });
  const allHits: PinHit[] = [];
  for (const p of outputPaths) {
    const sf = project.addSourceFileAtPath(p);
    allHits.push(...collectScenarioPins(sf));
  }
  const out: Violation[] = [];
  const expectedIds = new Set(envelope.scenarios.map((s) => s.id));
  const hitsById = new Map<string, PinHit[]>();
  for (const h of allHits) {
    const list = hitsById.get(h.id) ?? [];
    list.push(h);
    hitsById.set(h.id, list);
  }
  // Missing scenario pins
  for (const id of expectedIds) {
    const list = hitsById.get(id) ?? [];
    if (list.length === 0) {
      out.push({
        file: outputPaths[0] ?? "(output)",
        line: 1,
        message: `missing scenario pin: envelope declares scenario '${id}' but no '// plan:scenario=${id}' comment found in generated code`,
      });
    } else if (list.length > 1) {
      // Duplicate pins — annotate the second hit (first is fine; duplicates are wrong)
      for (let i = 1; i < list.length; i += 1) {
        const dup = list[i];
        if (dup === undefined) continue;
        out.push({
          file: dup.file,
          line: dup.line,
          message: `duplicate scenario pin: '${id}' pinned ${list.length} times — must be exactly one`,
        });
      }
    }
  }
  // Orphan pins (code declares scenario id that envelope doesn't know)
  for (const [id, list] of hitsById) {
    if (expectedIds.has(id)) continue;
    for (const h of list) {
      out.push({
        file: h.file,
        line: h.line,
        message: `orphan scenario pin: code declares '// plan:scenario=${id}' but envelope.scenarios has no id '${id}'`,
      });
    }
  }
  return out;
}

function validatePomFixturePaths(
  envelope: Envelope,
  envelopePath: string,
  repoRoot: string,
): Violation[] {
  const out: Violation[] = [];
  for (const p of envelope.requiredPOMs) {
    const abs = resolve(repoRoot, p);
    if (!existsSync(abs)) {
      out.push({
        file: envelopePath,
        line: 1,
        message: `requiredPOMs path missing on disk: '${p}' (envelope mandates Stage 2 produce it)`,
      });
    }
  }
  for (const p of envelope.requiredFixtures) {
    const abs = resolve(repoRoot, p);
    if (!existsSync(abs)) {
      out.push({
        file: envelopePath,
        line: 1,
        message: `requiredFixtures path missing on disk: '${p}' (envelope mandates Stage 2 produce it)`,
      });
    }
  }
  return out;
}

/**
 * Subtractive (bad-playwright) migrations only legally import @playwright/test,
 * Playwright, node:* built-ins, or relative paths. Foreign framework imports
 * (selenium-webdriver, cypress, webdriverio, ...) reveal that Claude pivoted
 * mid-generation from "remove smells" to "translate from another framework" —
 * the source framework is already Playwright; nothing to translate.
 */
function validateSubtractiveImports(
  envelope: Envelope,
  outputPaths: string[],
): Violation[] {
  if (!envelope.subtractive) return [];
  // Same allowlist as plan-envelope-validate.ts: qa-master path aliases
  // (@fixtures, @page-object, @api, etc.) are SAME-framework routing through
  // qa-master architecture — not foreign framework imports. The subtractive
  // flag's intent is to prevent ADDING a new framework (Cypress, Selenium);
  // qa-master aliases are bookkeeping for the existing Playwright runtime.
  const allowed = new Set(["@playwright/test", "playwright"]);
  const allowedAliasPrefixes = [
    "@fixtures/", "@page-object/", "@page-object",
    "@api/", "@actions/", "@browser/",
    "@utilities/", "@test-data/", "@types/",
    "@logger",
  ];
  const project = new Project({ useInMemoryFileSystem: false });
  const out: Violation[] = [];
  for (const p of outputPaths) {
    const sf = project.addSourceFileAtPath(p);
    for (const imp of sf.getDescendantsOfKind(SyntaxKind.ImportDeclaration)) {
      const mod = imp.getModuleSpecifierValue();
      if (mod.startsWith(".") || mod.startsWith("/")) continue;
      if (mod.startsWith("node:")) continue;
      if (allowed.has(mod)) continue;
      if (allowedAliasPrefixes.some((prefix) => mod === prefix || mod.startsWith(prefix))) continue;
      out.push({
        file: p,
        line: imp.getStartLineNumber(),
        message: `subtractive migration introduced foreign framework import '${mod}' — only @playwright/test, relative, node:, and qa-master path aliases allowed in a bad-playwright run`,
      });
    }
  }
  return out;
}

function main(): number {
  const args = parseCliArgs();
  const envelopePath = resolve(args.envelope);
  if (!existsSync(envelopePath)) {
    process.stderr.write(
      `::error::envelope file missing: ${envelopePath}\n`,
    );
    return 1;
  }
  const envelope = loadEnvelope(envelopePath);
  const allPaths = resolveOutputFiles(args.output);
  if (allPaths.length === 0) {
    process.stderr.write(
      `::error::--output path not found or empty: ${args.output}\n`,
    );
    return 1;
  }
  // Scope to specs that belong to THIS envelope's input. Directory mode
  // collects every spec under `outputs/tests/` regardless of which input
  // produced it; without this filter, scenario id 1.1 (per-input local) gets
  // counted across N specs and the validator flags "pinned N times".
  const outputPaths = filterByInput(envelope.inputBasename, allPaths);
  const violations: Violation[] = [
    ...validateScenarioCoverage(envelope, outputPaths),
    ...validateSubtractiveImports(envelope, outputPaths),
    ...validatePomFixturePaths(envelope, envelopePath, args.repoRoot),
  ];
  if (violations.length === 0) {
    process.stdout.write(
      `plan-code-coverage: ${envelope.scenarios.length} scenario(s) pinned, ${envelope.requiredPOMs.length} POM(s) + ${envelope.requiredFixtures.length} fixture(s) present, subtractive=${envelope.subtractive} — clean.\n`,
    );
    return 0;
  }
  for (const v of violations) annotate(v, args.mode);
  process.stderr.write(
    `plan-code-coverage: ${violations.length} contract violation(s) [${args.mode} mode]\n`,
  );
  return args.mode === "warn" ? 0 : 1;
}

process.exit(main());
