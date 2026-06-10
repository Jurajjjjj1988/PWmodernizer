#!/usr/bin/env tsx
/**
 * validate-qa-master-conformance.ts — defense-in-depth gate for qa-master
 * architecture compliance on Stage 2 output (v0.2.0 default).
 *
 * Checks the emitted multi-file tree under `outputs/` against the rules
 * codified in `config/migration-rules.md` §1–§4 and `config/knowledge-base.md`
 * `qa-master/...` namespace.
 *
 * Hard-fail conditions (block-severity):
 *   1. A spec under `outputs/tests/` imports `test` or `expect` from
 *      `@playwright/test` (only `outputs/helper/fixtures/base.fixture.ts`
 *      is allowed that import — KB qa-master/architecture/import-source).
 *   2. A Page or Block source file declares its own constructor (only
 *      BasePage / BaseBlock may — KB qa-master/architecture/no-constructor).
 *   3. A locator field on a Page/Block lacks `.describe(`
 *      (KB qa-master/architecture/locator-no-describe).
 *   4. A page method's `expect()` lacks a `[LABEL]` message string argument
 *      (KB qa-master/architecture/expect-no-label).
 *   5. A relative cross-helper import like `../page-object/pages/x.page`
 *      instead of `@page-object/pages/x.page`
 *      (KB qa-master/architecture/relative-imports).
 *   6. A locator field name without a recognised type prefix
 *      (button/input/text/heading/link/image/icon/array/by/block — KB
 *      qa-master/architecture/naming-no-prefix). Warn-only — strict-mode
 *      blocks; default mode prints `::warning::`.
 *   7. A spec contains `page.goto(` directly (KB qa-master/architecture/
 *      page-goto-in-spec). Specs must call a Page's `open()`.
 *
 * Soft-fail conditions (warn-severity; printed as ::warning:: but do not
 * change exit code):
 *   - A utility file under `outputs/helper/utilities/` has no matching
 *     `outputs/tests/unit/<name>.test.ts` (KB qa-master/architecture/
 *     utilities-coverage). Becomes block in `--strict`.
 *
 * CLI:
 *   npx tsx scripts/validate-qa-master-conformance.ts [--root outputs] [--strict]
 *
 * Exit codes:
 *   0 = clean (or only warn-severity in default mode)
 *   1 = block-severity violation OR any warn in --strict mode
 *
 * Strict TS, no any.
 */

import { existsSync, readFileSync, statSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";

interface CliArgs {
  root: string;
  strict: boolean;
  inputBasename: string | null;
}

/**
 * Convert input basename → list of plausible emitted spec basenames.
 * Kept in sync with plan-envelope-validate.ts: kebab-case + optional -test drop.
 * When --input-basename is passed, the validator scopes spec checks to files
 * matching one of these (or to mutated-on-every-run files like base.fixture).
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

interface Violation {
  file: string;
  line: number;
  message: string;
  severity: "block" | "warn";
}

function parseCliArgs(): CliArgs {
  const { values } = parseArgs({
    options: {
      root: { type: "string", default: "outputs" },
      strict: { type: "boolean", default: false },
      "input-basename": { type: "string" },
    },
  });
  return {
    root: typeof values.root === "string" ? values.root : "outputs",
    strict: values.strict === true,
    inputBasename: typeof values["input-basename"] === "string" && values["input-basename"].length > 0
      ? values["input-basename"]
      : null,
  };
}

function annotate(v: Violation): void {
  const lvl = v.severity === "block" ? "error" : "warning";
  process.stderr.write(`::${lvl} file=${v.file},line=${v.line}::${v.message}\n`);
}

/** Walk a directory tree, return all matching files. */
function walk(dir: string, predicate: (path: string) => boolean): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  const stack: string[] = [dir];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    const st = statSync(current);
    if (st.isDirectory()) {
      for (const entry of readdirSync(current)) {
        if (entry.startsWith(".")) continue;
        if (entry === "node_modules") continue;
        stack.push(join(current, entry));
      }
    } else if (predicate(current)) {
      out.push(current);
    }
  }
  return out;
}

/** Check 1 — spec must not import test/expect from `@playwright/test`. */
function checkSpecImports(rootAbs: string, file: string): Violation[] {
  const text = readFileSync(file, "utf8");
  const lines = text.split("\n");
  const out: Violation[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (/\bfrom\s+["']@playwright\/test["']/.test(line)) {
      out.push({
        file: relative(rootAbs, file),
        line: i + 1,
        message: `Spec imports from '@playwright/test' — KB qa-master/architecture/import-source: only 'outputs/helper/fixtures/base.fixture.ts' may import from '@playwright/test'. Use \`@fixtures/base.fixture\` instead.`,
        severity: "block",
      });
      break;
    }
  }
  return out;
}

/** Check 2 — Page/Block subclasses must not declare their own constructor. */
function checkNoConstructor(rootAbs: string, file: string): Violation[] {
  const text = readFileSync(file, "utf8");
  const lines = text.split("\n");
  const out: Violation[] = [];
  // Find class declarations that extend BasePage/BaseBlock and a constructor inside.
  const classRe = /export\s+class\s+(\w+)\s+extends\s+(BasePage|BaseBlock)\b/;
  let inSubclass = false;
  let className = "";
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const m = classRe.exec(line);
    if (m?.[1]) {
      inSubclass = true;
      className = m[1];
      continue;
    }
    if (inSubclass && /^\s*constructor\s*\(/.test(line)) {
      out.push({
        file: relative(rootAbs, file),
        line: i + 1,
        message: `${className} declares its own constructor — KB qa-master/architecture/no-constructor: only BasePage/BaseBlock may declare constructors. Use readonly fields that reference \`this.page\`.`,
        severity: "block",
      });
    }
    if (inSubclass && /^}\s*$/.test(line)) inSubclass = false;
  }
  return out;
}

/** Check 3 — every locator field must have `.describe(`. */
function checkLocatorDescribe(rootAbs: string, file: string): Violation[] {
  const text = readFileSync(file, "utf8");
  const lines = text.split("\n");
  const out: Violation[] = [];
  // A locator field is `readonly <name> = this.page.<chain>` or an arrow function.
  // Heuristic: line containing `this.page.getBy` or `this.page.locator` should also
  // contain `.describe(`. If multi-line (chained), scan a window of 5 lines.
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const isLocatorLine = /this\.page\.(getBy|locator)\(/.test(line);
    if (!isLocatorLine) continue;
    // Skip if this is inside a method body (rough — heuristic: precede with `readonly ` token).
    const isFieldDecl = /^\s*readonly\s+\w/.test(line) || /^\s*\.[a-zA-Z]/.test(line);
    if (!isFieldDecl) continue;
    const window = lines.slice(i, Math.min(i + 6, lines.length)).join("\n");
    if (!/\.describe\(/.test(window)) {
      out.push({
        file: relative(rootAbs, file),
        line: i + 1,
        message: `Locator field missing .describe('[LABEL] …') — KB qa-master/architecture/locator-no-describe.`,
        severity: "block",
      });
    }
  }
  return out;
}

/** Check 4 — `expect()` inside page methods must take a `[LABEL]` message arg. */
function checkExpectLabel(rootAbs: string, file: string): Violation[] {
  const text = readFileSync(file, "utf8");
  const lines = text.split("\n");
  const out: Violation[] = [];
  // Heuristic: any `expect(<args>).` call where <args> doesn't end with `,` followed
  // by a string literal containing `[`. The strict regex catches the canonical form.
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (!/\bexpect\(/.test(line)) continue;
    // Multi-line: grab up to 4 lines forward, strip whitespace, find expect(...)`.
    const window = lines.slice(i, Math.min(i + 4, lines.length)).join(" ");
    const m = /\bexpect\(([^)]*)\)/.exec(window);
    if (!m?.[1]) continue;
    const args = m[1];
    // Accept either: comma + message arg containing `[LABEL] ...` or `\`[LABEL_X]\` ...`
    // Detect "presence of a 2nd arg that is a backtick or quoted string with [ inside".
    const hasLabel = /,\s*["'`][^"'`]*\[/.test(args);
    if (!hasLabel) {
      out.push({
        file: relative(rootAbs, file),
        line: i + 1,
        message: `expect() in a page method without [LABEL] message arg — KB qa-master/architecture/expect-no-label. Use \`expect(x, \\\`[\${LABEL}] WHY\\\`).toBe(...)\`.`,
        severity: "block",
      });
    }
  }
  return out;
}

/** Check 5 — no relative imports between helper subdirs. */
function checkRelativeImports(rootAbs: string, file: string): Violation[] {
  const text = readFileSync(file, "utf8");
  const lines = text.split("\n");
  const out: Violation[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    // Match `from "../...` or `from '..."` — relative parent-dir imports.
    if (/\bfrom\s+["']\.\.\//.test(line)) {
      out.push({
        file: relative(rootAbs, file),
        line: i + 1,
        message: `Relative parent-dir import — KB qa-master/architecture/relative-imports. Use a path alias (@page-object, @api, @fixtures, @test-data, …).`,
        severity: "block",
      });
    }
  }
  return out;
}

const TYPE_PREFIXES = [
  "button", "input", "text", "heading", "link", "image", "icon",
  "array", "by", "block",
];

/** Check 6 — locator field names should carry a type prefix. */
function checkNamingPrefix(rootAbs: string, file: string): Violation[] {
  const text = readFileSync(file, "utf8");
  const lines = text.split("\n");
  const out: Violation[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const m = /^\s*readonly\s+(\w+)\s*=\s*(?:this\.page\.(?:getBy|locator)\(|\([\w\s,:]*\)\s*=>)/.exec(line);
    if (!m?.[1]) continue;
    const name = m[1];
    const hasPrefix = TYPE_PREFIXES.some((p) => name.startsWith(p));
    if (!hasPrefix) {
      out.push({
        file: relative(rootAbs, file),
        line: i + 1,
        message: `Locator field '${name}' has no type prefix — KB qa-master/architecture/naming-no-prefix. Use button*/input*/text*/heading*/link*/image*/icon*/array*/by* per migration-rules.md §1.`,
        severity: "warn",
      });
    }
  }
  return out;
}

/** Check 7 — `page.goto(` in a spec file (Page should own navigation). */
function checkSpecPageGoto(rootAbs: string, file: string): Violation[] {
  const text = readFileSync(file, "utf8");
  const lines = text.split("\n");
  const out: Violation[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (/\bpage\.goto\(/.test(line)) {
      out.push({
        file: relative(rootAbs, file),
        line: i + 1,
        message: `Spec calls page.goto() directly — KB qa-master/architecture/page-goto-in-spec. Navigation is the Page's open() method.`,
        severity: "block",
      });
    }
  }
  return out;
}

/** Soft-check — every utility file should have a matching unit test. */
function checkUtilitiesCoverage(rootAbs: string): Violation[] {
  const utilDir = join(rootAbs, "helper", "utilities");
  if (!existsSync(utilDir)) return [];
  const utilFiles = walk(utilDir, (p) => p.endsWith(".ts"));
  const out: Violation[] = [];
  for (const uf of utilFiles) {
    const base = uf.split("/").pop()?.replace(/\.ts$/, "") ?? "";
    const expectedTest = join(rootAbs, "tests", "unit", `${base}.test.ts`);
    if (!existsSync(expectedTest)) {
      out.push({
        file: relative(rootAbs, uf),
        line: 1,
        message: `Utility has no matching unit test '${relative(rootAbs, expectedTest)}' — KB qa-master/architecture/utilities-coverage. 100% coverage gate.`,
        severity: "warn",
      });
    }
  }
  return out;
}

function main(): number {
  const args = parseCliArgs();
  const rootAbs = resolve(args.root);
  if (!existsSync(rootAbs)) {
    process.stderr.write(`::warning::root '${rootAbs}' does not exist — nothing to validate (treated as clean).\n`);
    return 0;
  }

  const testsDir = join(rootAbs, "tests");
  const helperDir = join(rootAbs, "helper");
  const fixtureFile = join(rootAbs, "helper", "fixtures", "base.fixture.ts");

  const allSpecFiles = walk(testsDir, (p) =>
    p.endsWith(".spec.ts") && !p.endsWith(".test.ts"));
  const allPageFiles = walk(join(helperDir, "page-object", "pages"), (p) => p.endsWith(".page.ts"));
  const allBlockFiles = walk(join(helperDir, "page-object", "blocks"), (p) => p.endsWith(".block.ts"));
  const allHelperFiles = walk(helperDir, (p) => p.endsWith(".ts"));

  // Scope: when --input-basename is given, ONLY check files relevant to THIS
  // migration. The outputs/ tree accumulates v0.1.x legacy specs from prior
  // runs; without this filter the validator rejects every previously-emitted
  // file every time, even though only the current input's files are this
  // run's responsibility. Always-shared infrastructure (base.fixture.ts,
  // helper/page-object/{basepage,baseblock}.ts) is included regardless.
  const expectedSpecs = args.inputBasename ? expectedSpecBasenames(args.inputBasename) : null;
  const isScopedSpec = (p: string): boolean => {
    if (!expectedSpecs) return true;
    const base = p.split("/").pop() ?? "";
    return expectedSpecs.includes(base);
  };
  const isScopedPageBlock = (p: string): boolean => {
    if (!expectedSpecs) return true;
    const base = (p.split("/").pop() ?? "").replace(/\.(page|block)\.ts$/, "");
    // Page/Block files for THIS input derive from the same kebab stem as the spec.
    const stems = expectedSpecs.map((s) => s.replace(/\.spec\.ts$/, ""));
    return stems.some((s) => base === s || base.startsWith(`${s}-`) || base.startsWith(`${s}.`));
  };
  const specFiles = allSpecFiles.filter(isScopedSpec);
  const pageFiles = allPageFiles.filter(isScopedPageBlock);
  const blockFiles = allBlockFiles.filter(isScopedPageBlock);

  const violations: Violation[] = [];

  // Check 1 — imports in specs (except base.fixture itself).
  for (const spec of specFiles) {
    violations.push(...checkSpecImports(rootAbs, spec));
  }
  // Also check helper TS files — only base.fixture.ts may import from @playwright/test.
  for (const file of allHelperFiles) {
    if (file === fixtureFile) continue;
    violations.push(...checkSpecImports(rootAbs, file));
  }

  // Check 2/3/4/6 — POMs and Blocks structural discipline.
  for (const file of [...pageFiles, ...blockFiles]) {
    violations.push(...checkNoConstructor(rootAbs, file));
    violations.push(...checkLocatorDescribe(rootAbs, file));
    violations.push(...checkExpectLabel(rootAbs, file));
    violations.push(...checkNamingPrefix(rootAbs, file));
  }

  // Check 5 — relative imports across all helper + spec files.
  for (const file of [...allHelperFiles, ...specFiles]) {
    violations.push(...checkRelativeImports(rootAbs, file));
  }

  // Check 7 — spec page.goto.
  for (const spec of specFiles) {
    violations.push(...checkSpecPageGoto(rootAbs, spec));
  }

  // Soft — utility coverage.
  violations.push(...checkUtilitiesCoverage(rootAbs));

  if (violations.length === 0) {
    process.stdout.write(
      `validate-qa-master-conformance: ${specFiles.length} spec(s) + ${pageFiles.length} page(s) + ${blockFiles.length} block(s) checked — clean.\n`,
    );
    return 0;
  }

  let blockCount = 0;
  for (const v of violations) {
    annotate(v);
    if (v.severity === "block") blockCount++;
  }
  process.stderr.write(
    `validate-qa-master-conformance: ${violations.length} violation(s) (${blockCount} block / ${violations.length - blockCount} warn)\n`,
  );
  if (args.strict) return violations.length > 0 ? 1 : 0;
  return blockCount > 0 ? 1 : 0;
}

process.exit(main());
