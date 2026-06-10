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
 * Additional warn-severity checks (warn unless --strict). Each one regex-based,
 * grounded in per-layer CLAUDE.md rules at
 * `examples/reference/qa-master/helper/<layer>/CLAUDE.md`:
 *
 *   W1.  Page method ending on `.click();` — last action in a page method must
 *        be paired with an assertion ("Never end a method on click() — assert
 *        after"). KB qa-master/page-object/click-without-assertion.
 *   W2.  `try { ... } catch` inside `*.page.ts` / `*.block.ts` — page objects
 *        should let Playwright auto-retry; swallowing errors hides flake.
 *        KB qa-master/page-object/no-try-catch.
 *   W3.  `get <name>()` getter returning `this.page.locator/getBy` — locators
 *        must be `readonly` fields (eager or arrow-function), never accessors.
 *        KB qa-master/page-object/no-get-accessor.
 *   W4.  `this.page.getBy/locator(` built inside a method body (not a
 *        readonly field declaration). KB qa-master/page-object/locator-in-method.
 *   W5.  `this.page.locator('...')` with a bare CSS/XPath selector when
 *        `getBy*` would do — selector priority is testid → role/label/text →
 *        CSS → XPath. KB qa-master/page-object/locator-priority.
 *   W6.  Exported function under `outputs/helper/utilities/` without a verb
 *        prefix (parse|get|calculate|verify|generate|normalize|filter|
 *        determine). KB qa-master/utilities/verb-prefix.
 *   W7.  Exported action under `outputs/helper/actions/` whose first param is
 *        not a destructured object containing `page`. KB
 *        qa-master/actions/page-param.
 *   W8.  `actions/*.ts` constructing only ONE `new PageClass*` / `new *Page` —
 *        single-page logic stays on the page object, actions are cross-page.
 *        KB qa-master/actions/cross-page-only.
 *   W9.  `page.route(` in a spec or page object — third-party mocking belongs
 *        in a fixture (browser context level), not at the call site. KB
 *        qa-master/runtime/route-in-spec.
 *  W10.  `test(` title not matching `^\[[^\]]+\]\s*-\s*Check\b` — qa-master
 *        spec titles are `[TICKET-ID] - Check that ...`. KB
 *        qa-master/specs/test-name-format.
 *  W11.  More than one `test.describe(` block per spec file — one describe per
 *        feature/file. KB qa-master/specs/single-describe.
 *  W12.  Nested `test.step(` (a step inside another step's callback). One
 *        action → one assertion, never nested. KB qa-master/specs/no-nested-steps.
 *  W13.  Filename under `outputs/` containing `[A-Z_]` — kebab-case only.
 *        KB qa-master/files/kebab-case.
 *  W14.  `from "./..."` cross-helper sibling imports — extends the existing
 *        parent-dir block (Check 5) to ALSO cover same-dir relative imports.
 *        KB qa-master/architecture/relative-imports-sibling.
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

/** Check 1 — restrict `@playwright/test` imports.
 *
 * The rule has TWO scopes (matches qa-master reference exactly):
 *
 * In SPEC files (`outputs/tests/*.spec.ts`): blocked entirely — runtime `test` AND `expect`
 * must come from `@fixtures/base.fixture` (the single import source the spec layer uses).
 *
 * In HELPER files (`outputs/helper/**`): `test` import is blocked everywhere except
 * `base.fixture.ts` itself. `expect` and type-only imports are ALLOWED — PageClass methods
 * legitimately call `expect(...)` for `[LABEL]`-prefixed page-level assertions, and BasePage
 * /BaseBlock need `type Page` / `type Locator`. See qa-master reference
 * `helper/page-object/accounts.page.ts` line 1 for the canonical pattern.
 *
 * Type-only imports are ALWAYS exempt regardless of file location: `import type { Page }` or
 * `import { type Locator }` are erased at compile time and pull no runtime symbols. */
function checkSpecImports(rootAbs: string, file: string): Violation[] {
  const text = readFileSync(file, "utf8");
  const lines = text.split("\n");
  const out: Violation[] = [];
  const isSpec = file.includes("/tests/") && file.endsWith(".spec.ts");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (!/\bfrom\s+["']@playwright\/test["']/.test(line)) continue;
    // Exempt: whole-import-type form `import type { … } from "@playwright/test"`.
    if (/^\s*import\s+type\b/.test(line)) continue;
    // Inspect the named specifier list.
    const namedListMatch = /import\s*\{([^}]*)\}\s*from/.exec(line);
    const specifiers = namedListMatch?.[1]
      ? namedListMatch[1].split(",").map((s) => s.trim()).filter(Boolean)
      : [];
    // Exempt: every specifier is type-prefixed (inline-type form).
    if (specifiers.length > 0 && specifiers.every((s) => /^type\s+\w/.test(s))) continue;
    // Helper-file rule: only `test` is blocked; `expect` + types are allowed.
    // (Aliased imports like `test as base` still count as `test`.)
    if (!isSpec) {
      const importsTest = specifiers.some((s) => /^test\b/.test(s));
      if (!importsTest) continue;
      out.push({
        file: relative(rootAbs, file),
        line: i + 1,
        message: `Helper file imports \`test\` from '@playwright/test' — KB qa-master/architecture/import-source: only 'outputs/helper/fixtures/base.fixture.ts' may import \`test\`. Helpers may import \`expect\` + types.`,
        severity: "block",
      });
      break;
    }
    // Spec-file rule: ANY non-type-only import from @playwright/test is blocked.
    out.push({
      file: relative(rootAbs, file),
      line: i + 1,
      message: `Spec imports from '@playwright/test' — KB qa-master/architecture/import-source: specs must import \`test\` + \`expect\` from \`@fixtures/base.fixture\` (the single spec-layer source).`,
      severity: "block",
    });
    break;
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

/** Extract the balanced `expect(...)` argument list starting at the first `expect(` in `text`.
 *
 * Handles nested parens (e.g. `expect(this.page.getByText(name), '[LABEL] WHY').toBe(true)`)
 * by tracking paren depth — the prior regex-only approach captured up to the FIRST `)`,
 * which on the example above stopped at `getByText(name)`'s closing paren, missing the
 * message string entirely (false-positive missing-label flag).
 *
 * Returns the argument substring (between the matched parens) or null when no balanced
 * `expect(...)` is found in the input. */
function extractExpectArgs(text: string): string | null {
  const start = text.search(/\bexpect\(/);
  if (start < 0) return null;
  let i = start + "expect(".length;
  let depth = 1;
  const argsStart = i;
  while (i < text.length && depth > 0) {
    const ch = text[i];
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    i++;
  }
  if (depth !== 0) return null; // unbalanced — give up gracefully
  return text.slice(argsStart, i - 1);
}

/** Check 4 — `expect()` inside page methods must take a `[LABEL]` message arg. */
function checkExpectLabel(rootAbs: string, file: string): Violation[] {
  const text = readFileSync(file, "utf8");
  const lines = text.split("\n");
  const out: Violation[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (!/\bexpect\(/.test(line)) continue;
    // Multi-line: grab up to 6 lines forward (covers the wrap-args/wrap-message form).
    const window = lines.slice(i, Math.min(i + 6, lines.length)).join(" ");
    const args = extractExpectArgs(window);
    if (args == null) continue;
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

/** Find every page-method declaration line: `async name(...)` or `name(...)` declared on a class body.
 *
 * Returns the `i` (start line index) and `j` (closing-brace line index) of each method body.
 * Heuristic: scan a class for lines matching `<modifiers>? <name>(<args>): <ret> {` then brace-walk.
 * Skips `constructor`, getters (`get name()`), and the static field initialiser block.
 * Used by W1 (click without assert) and W2 (try/catch in method) and W4 (locator in method body). */
function listPageMethods(text: string): { start: number; end: number }[] {
  const lines = text.split("\n");
  const out: { start: number; end: number }[] = [];
  // A method declaration on a class body. Heuristic: `(async )?<name>(<args>)(: <ret>)? {` where
  // the indent is exactly 2 or 4 spaces (TS class body) and not a constructor/getter.
  const declRe = /^(\s{2,8})(async\s+)?(\w+)\s*\([^)]*\)\s*(:\s*[^{]+)?\s*\{\s*$/;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const m = declRe.exec(line);
    if (!m?.[3]) continue;
    const name = m[3];
    if (name === "constructor" || name === "if" || name === "for" || name === "while"
        || name === "switch" || name === "return" || name === "function") continue;
    // Find matching `}` by brace counting from the opening `{` at the end of the decl line.
    let depth = 1;
    let j = i + 1;
    while (j < lines.length && depth > 0) {
      const lj = lines[j] ?? "";
      for (const ch of lj) {
        if (ch === "{") depth++;
        else if (ch === "}") depth--;
        if (depth === 0) break;
      }
      j++;
    }
    if (j > i + 1) out.push({ start: i, end: j - 1 });
  }
  return out;
}

/** W1 — page method must not end on `.click();` without a following assert.
 *
 * Heuristic: the last non-blank, non-comment, non-closing-brace statement in
 * the method body matches `await ... .click(...);`. KB
 * qa-master/page-object/click-without-assertion. */
function checkClickWithoutAssertion(rootAbs: string, file: string): Violation[] {
  const text = readFileSync(file, "utf8");
  const lines = text.split("\n");
  const methods = listPageMethods(text);
  const out: Violation[] = [];
  for (const { start, end } of methods) {
    // Walk backward from `end - 1` (the line above the closing `}`) to find the
    // last non-trivial statement.
    let lastIdx = -1;
    for (let k = end - 1; k > start; k--) {
      const raw = (lines[k] ?? "").trim();
      if (!raw) continue;
      if (raw.startsWith("//") || raw.startsWith("*") || raw.startsWith("/*")) continue;
      if (raw === "}" || raw === "});" || raw === ")" || raw === ");") continue;
      lastIdx = k;
      break;
    }
    if (lastIdx < 0) continue;
    const last = (lines[lastIdx] ?? "").trim();
    if (/\.click\(\s*[^)]*\)\s*;?\s*$/.test(last) && /^await\s/.test(last)) {
      out.push({
        file: relative(rootAbs, file),
        line: lastIdx + 1,
        message: `Page method ends on .click() with no following assertion — KB qa-master/page-object/click-without-assertion. Per page-object/CLAUDE.md: "Never end a method on click() — assert after."`,
        severity: "warn",
      });
    }
  }
  return out;
}

/** W2 — `try { ... } catch` inside a page/block file is forbidden.
 *
 * Playwright's web-first assertions auto-retry; swallowing errors hides flake.
 * KB qa-master/page-object/no-try-catch. */
function checkNoTryCatchInPage(rootAbs: string, file: string): Violation[] {
  const text = readFileSync(file, "utf8");
  const lines = text.split("\n");
  const out: Violation[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (/^\s*try\s*\{/.test(line)) {
      out.push({
        file: relative(rootAbs, file),
        line: i + 1,
        message: `try/catch in page/block — KB qa-master/page-object/no-try-catch. Let Playwright's web-first assertions auto-retry; swallowing errors hides flake.`,
        severity: "warn",
      });
    }
  }
  return out;
}

/** W3 — `get <name>()` getter that returns `this.page.locator/getBy` is forbidden.
 *
 * Locators must be `readonly` fields (eager or arrow-function), never accessors.
 * KB qa-master/page-object/no-get-accessor. */
function checkNoGetAccessor(rootAbs: string, file: string): Violation[] {
  const text = readFileSync(file, "utf8");
  const lines = text.split("\n");
  const out: Violation[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const m = /^\s*(?:public\s+|protected\s+|private\s+)?get\s+(\w+)\s*\(\s*\)/.exec(line);
    if (!m?.[1]) continue;
    // Look at the next 6 lines for `this.page.(locator|getBy)`.
    const window = lines.slice(i, Math.min(i + 6, lines.length)).join("\n");
    if (/this\.page\.(locator|getBy)/.test(window)) {
      out.push({
        file: relative(rootAbs, file),
        line: i + 1,
        message: `get ${m[1]}() returns a locator — KB qa-master/page-object/no-get-accessor. Locators must be \`readonly\` fields (eager or arrow-function), never accessors.`,
        severity: "warn",
      });
    }
  }
  return out;
}

/** W4 — `this.page.getBy/locator(` built inside a method body (not a field decl).
 *
 * Locators must be `readonly` class fields. Building them inside a method body
 * breaks the "every locator has a .describe()" rule and prevents reuse.
 * KB qa-master/page-object/locator-in-method. */
function checkLocatorInMethod(rootAbs: string, file: string): Violation[] {
  const text = readFileSync(file, "utf8");
  const lines = text.split("\n");
  const methods = listPageMethods(text);
  const out: Violation[] = [];
  for (const { start, end } of methods) {
    for (let k = start + 1; k <= end; k++) {
      const line = lines[k] ?? "";
      // Match `this.page.getByRole(`, `this.page.getByTestId(`, `this.page.locator(`, etc.
      // `\w*` covers the trailing `*Role` / `*TestId` / `*Text` / `*Label` variants.
      if (!/this\.page\.(getBy\w*|locator)\(/.test(line)) continue;
      // Allow `await this.page.<chain>(` calls that are NOT building a *named* locator.
      // The smell is assignment / declaration: `const x = this.page.getBy...`.
      const isAssign = /^\s*(const|let|var)\s+\w+\s*=\s*this\.page\.(getBy\w*|locator)\(/.test(line);
      if (!isAssign) continue;
      out.push({
        file: relative(rootAbs, file),
        line: k + 1,
        message: `Locator built inside method body — KB qa-master/page-object/locator-in-method. Move to a \`readonly\` field on the class so it carries a \`.describe()\` label and is reusable.`,
        severity: "warn",
      });
    }
  }
  return out;
}

/** W5 — `this.page.locator('...')` with a bare CSS / XPath selector when `getBy*` would do.
 *
 * Selector priority is testid → role/label/text → CSS → XPath. A `locator(`
 * call with a literal string starting with `//`, `xpath=`, `.`, `#`, or any
 * other CSS pattern flags as low-priority. KB qa-master/page-object/locator-priority. */
function checkLocatorPriority(rootAbs: string, file: string): Violation[] {
  const text = readFileSync(file, "utf8");
  const lines = text.split("\n");
  const out: Violation[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const m = /this\.page\.locator\(\s*['"`]([^'"`]+)['"`]/.exec(line);
    if (!m?.[1]) continue;
    const sel = m[1];
    // Heuristic: anything that's not a testid or role/label/text is CSS/xpath.
    // The `locator()` call here is a literal selector string, so any CSS/xpath
    // pattern is exactly the smell.
    out.push({
      file: relative(rootAbs, file),
      line: i + 1,
      message: `Bare CSS/XPath locator '${sel}' — KB qa-master/page-object/locator-priority. Prefer getByTestId → getByRole → getByLabel → getByText before falling back to .locator().`,
      severity: "warn",
    });
  }
  return out;
}

const UTILITY_VERB_PREFIXES = [
  "parse", "get", "calculate", "verify", "generate", "normalize", "filter", "determine",
];

/** W6 — exported function under `outputs/helper/utilities/` must have a verb prefix.
 *
 * Per utilities/CLAUDE.md: "Verb-prefix names: parse*, get*, calculate*,
 * verify*, generate*, normalize*". KB qa-master/utilities/verb-prefix. */
function checkUtilityVerbPrefix(rootAbs: string, file: string): Violation[] {
  // Logger is the structured-logger exception.
  if (file.endsWith("/helper/utilities/logger.ts")) return [];
  const text = readFileSync(file, "utf8");
  const lines = text.split("\n");
  const out: Violation[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const m = /^\s*export\s+(?:async\s+)?function\s+(\w+)\s*\(/.exec(line);
    if (!m?.[1]) continue;
    const name = m[1];
    const hasVerb = UTILITY_VERB_PREFIXES.some((v) => name.startsWith(v));
    if (!hasVerb) {
      out.push({
        file: relative(rootAbs, file),
        line: i + 1,
        message: `Exported utility '${name}' has no verb prefix — KB qa-master/utilities/verb-prefix. Use parse*, get*, calculate*, verify*, generate*, normalize*, filter*, determine*.`,
        severity: "warn",
      });
    }
  }
  return out;
}

/** W7 — exported action under `outputs/helper/actions/` first param must include `page`.
 *
 * Per actions/CLAUDE.md: "Signature: destructure { page, ...params }". KB
 * qa-master/actions/page-param. */
function checkActionPageParam(rootAbs: string, file: string): Violation[] {
  const text = readFileSync(file, "utf8");
  const lines = text.split("\n");
  const out: Violation[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const m = /^\s*export\s+(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)/.exec(line);
    if (!m?.[1]) continue;
    const name = m[1];
    const args = m[2] ?? "";
    // First arg must be a destructured object containing `page`.
    // Examples: `({ page })` or `({ page, foo }: { page: Page, foo: T })`.
    const first = args.split(",")[0]?.trim() ?? "";
    const isDestructuredWithPage = /^\{\s*page\b/.test(first) || /^\{\s*[^}]*\bpage\b/.test(first);
    if (!isDestructuredWithPage) {
      out.push({
        file: relative(rootAbs, file),
        line: i + 1,
        message: `Action '${name}' first param is not a destructured object including \`page\` — KB qa-master/actions/page-param. Per actions/CLAUDE.md: "Signature: destructure { page, ...params }".`,
        severity: "warn",
      });
    }
  }
  return out;
}

/** W8 — `actions/*.ts` constructing only ONE `new *Page` / `new PageClass*` is a smell.
 *
 * Per actions/CLAUDE.md: "Cross-page (vertical) flows that compose page
 * objects. Create one when 2+ page objects are involved or a flow is shared".
 * Single-page logic belongs on the page object. KB qa-master/actions/cross-page-only. */
function checkActionCrossPageOnly(rootAbs: string, file: string): Violation[] {
  const text = readFileSync(file, "utf8");
  const out: Violation[] = [];
  // Find every `new <PascalCase>(` whose name ends in `Page` or starts with `PageClass`.
  const re = /\bnew\s+((?:PageClass\w+|\w+Page))\(/g;
  const seen = new Set<string>();
  for (const match of text.matchAll(re)) {
    if (match[1]) seen.add(match[1]);
  }
  if (seen.size === 1) {
    const only = Array.from(seen)[0];
    out.push({
      file: relative(rootAbs, file),
      line: 1,
      message: `Action constructs only 1 page object (${only}) — KB qa-master/actions/cross-page-only. Single-page logic stays on the page object; actions compose 2+ pages.`,
      severity: "warn",
    });
  }
  return out;
}

/** W9 — `page.route(` in a spec or page object is misplaced.
 *
 * Third-party mocking should be set up at the browser-context level in a
 * fixture, not at every call site. KB qa-master/runtime/route-in-spec. */
function checkRouteInSpec(rootAbs: string, file: string): Violation[] {
  const text = readFileSync(file, "utf8");
  const lines = text.split("\n");
  const out: Violation[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (/\bpage\.route\s*\(/.test(line) || /\bthis\.page\.route\s*\(/.test(line)) {
      out.push({
        file: relative(rootAbs, file),
        line: i + 1,
        message: `page.route() outside fixtures — KB qa-master/runtime/route-in-spec. Per fixtures/CLAUDE.md: third-party mocking is a fixture concern (browser context level), not per-spec or per-page.`,
        severity: "warn",
      });
    }
  }
  return out;
}

/** W10 — spec test titles must match `[TICKET-ID] - Check that ...`.
 *
 * KB qa-master/specs/test-name-format. Per architecture/should-test-name:
 * "Check that <user-perceivable outcome>". Never imperative, never "should". */
function checkTestNameFormat(rootAbs: string, file: string): Violation[] {
  const text = readFileSync(file, "utf8");
  const lines = text.split("\n");
  const out: Violation[] = [];
  // Match `test(` or `test.only(` or `test.fixme(` followed by a quoted title.
  const re = /^\s*test(?:\.(?:only|fixme|skip))?\s*\(\s*(['"`])([^'"`]*)\1/;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const m = re.exec(line);
    if (!m?.[2]) continue;
    const title = m[2];
    // Title must start with `[...]` (square-bracket ticket id) then ` - Check `.
    if (!/^\[[^\]]+\]\s*-\s*Check\b/.test(title)) {
      out.push({
        file: relative(rootAbs, file),
        line: i + 1,
        message: `Test title '${title}' not in '[TICKET-ID] - Check that ...' form — KB qa-master/specs/test-name-format.`,
        severity: "warn",
      });
    }
  }
  return out;
}

/** W11 — multiple `test.describe(` per spec file.
 *
 * One describe per feature/file. Multiple describes signal a file that should
 * be split. KB qa-master/specs/single-describe. */
function checkSingleDescribe(rootAbs: string, file: string): Violation[] {
  const text = readFileSync(file, "utf8");
  const lines = text.split("\n");
  const out: Violation[] = [];
  const describeLines: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (/^\s*test\.describe\s*\(/.test(line)) {
      describeLines.push(i + 1);
    }
  }
  if (describeLines.length > 1) {
    // Report on the SECOND (and later) — the first is fine.
    for (let k = 1; k < describeLines.length; k++) {
      const line = describeLines[k] ?? 1;
      out.push({
        file: relative(rootAbs, file),
        line,
        message: `Spec has ${describeLines.length} test.describe() blocks — KB qa-master/specs/single-describe. One describe per feature/file; split or merge.`,
        severity: "warn",
      });
    }
  }
  return out;
}

/** W12 — `test.step(` nested inside another `test.step(`.
 *
 * Each `test.step()` is one action → one expectation. Nesting muddies that
 * contract. KB qa-master/specs/no-nested-steps. */
function checkNoNestedSteps(rootAbs: string, file: string): Violation[] {
  const text = readFileSync(file, "utf8");
  const lines = text.split("\n");
  const out: Violation[] = [];
  // Walk: find every `test.step(` line; brace-walk forward to its closing `});`
  // and scan that body for another `test.step(`.
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (!/\btest\.step\s*\(/.test(line)) continue;
    // Find the matching close paren by counting parens from `test.step(`.
    const start = line.indexOf("test.step(");
    let depth = 1;
    let pos = start + "test.step(".length;
    let j = i;
    let col = pos;
    while (j < lines.length && depth > 0) {
      const lj = lines[j] ?? "";
      while (col < lj.length && depth > 0) {
        const ch = lj[col];
        if (ch === "(") depth++;
        else if (ch === ")") depth--;
        col++;
      }
      if (depth > 0) { j++; col = 0; }
    }
    if (j === i) continue; // single-line — body is empty
    // Body is lines [i+1 .. j]. Look for a nested `test.step(`.
    for (let k = i + 1; k <= j && k < lines.length; k++) {
      const lk = lines[k] ?? "";
      if (/\btest\.step\s*\(/.test(lk)) {
        out.push({
          file: relative(rootAbs, file),
          line: k + 1,
          message: `Nested test.step() — KB qa-master/specs/no-nested-steps. Each test.step() is one action → one assertion; no nesting.`,
          severity: "warn",
        });
        break;
      }
    }
  }
  return out;
}

/** W13 — filename under `outputs/` contains uppercase or underscore.
 *
 * qa-master convention: kebab-case filenames everywhere (`accounts.page.ts`,
 * `sign-in.spec.ts`). KB qa-master/files/kebab-case. */
function checkKebabCaseFilename(rootAbs: string, file: string): Violation[] {
  const base = file.split("/").pop() ?? "";
  // Strip the final `.ts` (or `.spec.ts` / `.page.ts` / `.block.ts` / `.test.ts`) before checking.
  // What we want to flag is any uppercase letter or underscore in the stem segments.
  const stem = base.replace(/\.[a-z]+$/, ""); // drop final extension
  if (/[A-Z_]/.test(stem)) {
    return [{
      file: relative(rootAbs, file),
      line: 1,
      message: `Filename '${base}' contains uppercase or underscore — KB qa-master/files/kebab-case. Use kebab-case throughout outputs/.`,
      severity: "warn",
    }];
  }
  return [];
}

/** W14 — sibling relative import `from './...'` across helper subdirs.
 *
 * Extends Check 5 (which flagged `../...`). The `relative-imports` rule also
 * bans intra-directory relative imports between different concerns (e.g.
 * `./checkout.api` from a page object). Same-file-stem imports (e.g. from a
 * paired `.block.ts` to its barrel `./index`) are still flagged — promote to
 * `@page-object/...` alias instead. KB qa-master/architecture/relative-imports-sibling. */
function checkSiblingRelativeImports(rootAbs: string, file: string): Violation[] {
  const text = readFileSync(file, "utf8");
  const lines = text.split("\n");
  const out: Violation[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    // Match `from "./..."` — sibling-dir relative imports.
    // (Parent-dir `../` is covered by Check 5.)
    if (/\bfrom\s+["']\.\//.test(line)) {
      out.push({
        file: relative(rootAbs, file),
        line: i + 1,
        message: `Sibling relative import (./…) — KB qa-master/architecture/relative-imports-sibling. Use a path alias (@page-object, @api, @fixtures, @test-data, …) for cross-helper references.`,
        severity: "warn",
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
  // Layer-specific file sets (warn-severity checks W6/W7/W8 — utilities,
  // actions). Walked unscoped — these layer-purity rules are not basename-tied.
  const utilityFiles = walk(join(helperDir, "utilities"), (p) => p.endsWith(".ts"));
  const actionFiles = walk(join(helperDir, "actions"), (p) => p.endsWith(".ts"));
  // All .ts files under outputs/ for the kebab-case filename check (W13).
  const allOutputFiles = walk(rootAbs, (p) => p.endsWith(".ts"));

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

  // Warn-severity W1/W2/W3/W4/W5 — page-object discipline (rules in
  // examples/reference/qa-master/helper/page-object/CLAUDE.md). Scoped to the
  // current input's page/block files; base.fixture / basepage / baseblock /
  // helpers under utilities/test-data/api don't carry these rules.
  for (const file of [...pageFiles, ...blockFiles]) {
    violations.push(...checkClickWithoutAssertion(rootAbs, file));
    violations.push(...checkNoTryCatchInPage(rootAbs, file));
    violations.push(...checkNoGetAccessor(rootAbs, file));
    violations.push(...checkLocatorInMethod(rootAbs, file));
    violations.push(...checkLocatorPriority(rootAbs, file));
  }

  // Warn-severity W6 — utilities verb prefix (utilities/CLAUDE.md).
  for (const file of utilityFiles) {
    violations.push(...checkUtilityVerbPrefix(rootAbs, file));
  }

  // Warn-severity W7/W8 — actions layer (actions/CLAUDE.md).
  for (const file of actionFiles) {
    violations.push(...checkActionPageParam(rootAbs, file));
    violations.push(...checkActionCrossPageOnly(rootAbs, file));
  }

  // Warn-severity W9 — `page.route(` in spec or page object (fixtures-only).
  // Scope: scoped specs + scoped page/block files (same as the structural checks).
  for (const file of [...specFiles, ...pageFiles, ...blockFiles]) {
    violations.push(...checkRouteInSpec(rootAbs, file));
  }

  // Warn-severity W10/W11/W12 — spec discipline (specs/CLAUDE.md + general
  // architecture/should-test-name rule).
  for (const spec of specFiles) {
    violations.push(...checkTestNameFormat(rootAbs, spec));
    violations.push(...checkSingleDescribe(rootAbs, spec));
    violations.push(...checkNoNestedSteps(rootAbs, spec));
  }

  // Warn-severity W13 — kebab-case filenames across outputs/.
  // Run on EVERY .ts file under outputs/ (not just the scoped set) so a stray
  // PascalCase / snake_case filename is caught regardless of the active input.
  for (const file of allOutputFiles) {
    violations.push(...checkKebabCaseFilename(rootAbs, file));
  }

  // Warn-severity W14 — sibling relative imports (`from "./..."`). Run on the
  // same union as Check 5 (parent-dir relative imports) — every helper + spec.
  for (const file of [...allHelperFiles, ...specFiles]) {
    violations.push(...checkSiblingRelativeImports(rootAbs, file));
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
