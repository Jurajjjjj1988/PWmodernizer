#!/usr/bin/env node
/**
 * build-inventory.ts — scan outputs/tests/{pages,fixtures,helpers} and emit
 * a compact inventory of existing POMs / fixtures / helpers for Claude
 * grounding (Aider repo-map / Cody RAG pattern).
 *
 * Why this exists: migrate.yml used to inline ~95 LOC of bash that grep'd
 * the same surface. Bash heuristics misread inheritance, default exports,
 * generic-typed fixtures, and overloaded methods. ts-morph parses the
 * actual TypeScript AST, so we get correct class names, public-method
 * signatures with parameter lists, and `extend<{...}>` shapes.
 *
 * Output format is intentionally identical to the bash version so the
 * generate.md prompt structure doesn't change:
 *
 *   ## Existing POMs / fixtures / helpers Claude MUST consider for reuse:
 *
 *   ### POMs
 *   - <file> -> <ClassName> { method(a, b), other(c) }
 *   ### Fixtures
 *   - <file> -> exports: A, B; fixture shape: { x: T, y: U }
 *   ### Helpers
 *   - <file> -> exports: foo, bar
 *
 * Empty case writes the same "(No existing POMs/fixtures/helpers — this
 * is the first migration.)" stub.
 *
 * CLI:
 *   npx tsx scripts/build-inventory.ts [--out <path>] [--validate]
 *
 * --out (default: outputs/.snippets-inventory.md)
 *   Destination markdown file.
 * --validate
 *   Run the same parse but DO NOT write. Useful for pre-commit hooks.
 *   Exit 0 on success, 1 on any parse error.
 *
 * GitHub Actions annotations on parse errors:
 *   ::error file=<path>::<message>
 */

import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { Project, SyntaxKind, ts } from "ts-morph";
import type {
  ClassDeclaration,
  MethodDeclaration,
  SourceFile,
  TypeLiteralNode,
} from "ts-morph";

const REPO_ROOT = resolve(new URL("..", import.meta.url).pathname);
const DEFAULT_OUT = join(REPO_ROOT, "outputs", ".snippets-inventory.md");
const POMS_DIR = join(REPO_ROOT, "outputs", "tests", "pages");
const FIXTURES_DIR = join(REPO_ROOT, "outputs", "tests", "fixtures");
const HELPERS_DIR = join(REPO_ROOT, "outputs", "tests", "helpers");

const EMPTY_STUB =
  "## Existing POMs / fixtures / helpers Claude MUST consider for reuse:\n\n" +
  "(No existing POMs/fixtures/helpers — this is the first migration.)\n";

interface Args {
  out: string;
  validate: boolean;
}

interface ParseError {
  file: string;
  message: string;
}

function parseCliArgs(): Args {
  const { values } = parseArgs({
    options: {
      out: { type: "string" },
      validate: { type: "boolean", default: false },
    },
  });
  return {
    out: values.out ?? DEFAULT_OUT,
    validate: values.validate === true,
  };
}

/**
 * Find files matching a suffix under a directory. Returns absolute paths
 * sorted alphabetically (deterministic output across CI runs). Missing
 * directories are treated as empty — the inventory step runs before the
 * first migration ever happens, so the dirs legitimately may not exist.
 */
function findFiles(dir: string, suffix: string): string[] {
  if (!existsSync(dir)) return [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const name of entries) {
    const full = join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isFile() && name.endsWith(suffix)) {
      out.push(full);
    }
  }
  return out.sort();
}

/**
 * Make a path repo-relative for stable inventory entries. The bash
 * version emitted "outputs/tests/pages/foo.page.ts" and the prompt's
 * "Hard constraint: ... do not introduce SignInPage" guidance relies on
 * that path style. Falls back to absolute if relativisation would escape
 * the repo root.
 */
function repoRelative(absolute: string): string {
  const rel = absolute.startsWith(REPO_ROOT + "/")
    ? absolute.slice(REPO_ROOT.length + 1)
    : absolute;
  return rel;
}

/**
 * Build a fresh project per call. Per-file diagnostics are noisy when one
 * generated POM imports a fixture that isn't on disk yet (Stage 2
 * mid-generation) — we disable lib lookups via skipLoadingLibFiles to
 * keep startup fast and avoid the "Cannot find name Page" warnings that
 * come from importing @playwright/test types without bundling them.
 */
function makeProject(): Project {
  return new Project({
    skipAddingFilesFromTsConfig: true,
    skipLoadingLibFiles: true,
    skipFileDependencyResolution: true,
    compilerOptions: {
      allowJs: false,
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      strict: false,
      noEmit: true,
    },
  });
}

function safeAddSourceFile(
  project: Project,
  path: string,
  errors: ParseError[],
): SourceFile | null {
  try {
    return project.addSourceFileAtPath(path);
  } catch (err) {
    errors.push({ file: path, message: (err as Error).message });
    return null;
  }
}

/* ----------------------------- POM extraction ----------------------------- */

interface PomInfo {
  className: string;
  methods: string[];
}

/**
 * Pick the "primary" exported class — the first one in source order with
 * an `export` modifier (covers both named exports and `export default`).
 * Returns null if no exported class is present (helper file misnamed as
 * .page.ts, or barrel re-export); the caller falls back to "(unknown class)".
 */
function findExportedClass(sf: SourceFile): ClassDeclaration | null {
  for (const cls of sf.getClasses()) {
    if (cls.isExported()) return cls;
  }
  return null;
}

/**
 * A method is "public" if it has no explicit modifier (TS default) or an
 * explicit `public` modifier. Constructors and methods named with leading
 * underscore are excluded — matches the bash heuristic.
 */
function isPublicMethod(m: MethodDeclaration): boolean {
  if (m.hasModifier(SyntaxKind.PrivateKeyword)) return false;
  if (m.hasModifier(SyntaxKind.ProtectedKeyword)) return false;
  const name = m.getName();
  if (name.startsWith("_")) return false;
  return true;
}

/**
 * Render a method as `name(p1, p2)` — names only, no types. Mirrors the
 * compact bash output. Rest params include the leading "..."; optional
 * params keep the "?" so the reader sees the surface. Default values are
 * elided to keep the inventory dense.
 */
function methodSignature(m: MethodDeclaration): string {
  const params = m.getParameters().map((p) => {
    const dots = p.isRestParameter() ? "..." : "";
    const q = p.hasQuestionToken() ? "?" : "";
    return `${dots}${p.getName()}${q}`;
  });
  return `${m.getName()}(${params.join(", ")})`;
}

function extractPom(sf: SourceFile): PomInfo {
  const cls = findExportedClass(sf);
  if (cls === null) {
    return { className: "(unknown class)", methods: [] };
  }
  const className = cls.getName() ?? "(anonymous class)";
  const methods = cls
    .getMethods()
    .filter(isPublicMethod)
    .map(methodSignature)
    .sort();
  return { className, methods };
}

function renderPomLine(file: string, info: PomInfo): string {
  const methods =
    info.methods.length === 0
      ? "(no public methods detected)"
      : info.methods.join(", ");
  return `- ${repoRelative(file)} -> ${info.className} { ${methods} }`;
}

/* --------------------------- Fixture extraction --------------------------- */

interface FixtureInfo {
  exports: string[];
  shape: string[];
}

/**
 * Collect named exports — `export const X`, `export function Y`,
 * `export type Z`, `export interface W`. ts-morph's getExportedDeclarations
 * also catches `export { X }` re-export forms, which the bash grep missed.
 */
function collectNamedExports(sf: SourceFile): string[] {
  const names = new Set<string>();
  for (const [name] of sf.getExportedDeclarations()) {
    if (name !== "default") names.add(name);
  }
  return [...names].sort();
}

/**
 * Find a `base.extend<{ a: A; b: B }>(...)` call and return the keys of
 * the type literal. Used by Playwright fixture files — the prompt's
 * grounding wants to know what fixtures the existing test already
 * provides. Walks all `extend` calls and picks the first one whose first
 * type argument is a TypeLiteral (covers `test.extend<{...}>`,
 * `base.extend<{...}>`, etc.).
 */
function extractFixtureShape(sf: SourceFile): string[] {
  const calls = sf.getDescendantsOfKind(SyntaxKind.CallExpression);
  for (const call of calls) {
    const expr = call.getExpression();
    if (!expr.getText().endsWith(".extend")) continue;
    const typeArgs = call.getTypeArguments();
    if (typeArgs.length === 0) continue;
    const first = typeArgs[0];
    if (first === undefined) continue;
    if (first.getKind() !== SyntaxKind.TypeLiteral) continue;
    const lit = first as TypeLiteralNode;
    const keys: string[] = [];
    for (const member of lit.getMembers()) {
      if (member.getKind() === SyntaxKind.PropertySignature) {
        const prop = member.asKindOrThrow(SyntaxKind.PropertySignature);
        const name = prop.getName();
        const typeNode = prop.getTypeNode();
        const typeText = typeNode === undefined ? "unknown" : typeNode.getText();
        keys.push(`${name}: ${typeText}`);
      }
    }
    if (keys.length > 0) return keys;
  }
  return [];
}

function extractFixture(sf: SourceFile): FixtureInfo {
  return {
    exports: collectNamedExports(sf),
    shape: extractFixtureShape(sf),
  };
}

function renderFixtureLine(file: string, info: FixtureInfo): string {
  const exports =
    info.exports.length === 0
      ? "(no named exports detected)"
      : info.exports.join(", ");
  const rel = repoRelative(file);
  if (info.shape.length > 0) {
    return `- ${rel} -> exports: ${exports}; fixture shape: { ${info.shape.join(", ")} }`;
  }
  return `- ${rel} -> exports: ${exports}`;
}

/* --------------------------- Helper extraction --------------------------- */

function extractHelper(sf: SourceFile): string[] {
  return collectNamedExports(sf);
}

function renderHelperLine(file: string, exports: string[]): string {
  const list =
    exports.length === 0 ? "(no named exports detected)" : exports.join(", ");
  return `- ${repoRelative(file)} -> exports: ${list}`;
}

/* ------------------------------- Inventory ------------------------------- */

interface InventoryResult {
  markdown: string;
  totalFiles: number;
  errors: ParseError[];
}

function buildInventory(): InventoryResult {
  const poms = findFiles(POMS_DIR, ".page.ts");
  const fixtures = findFiles(FIXTURES_DIR, ".fixture.ts");
  const helpers = findFiles(HELPERS_DIR, ".ts");

  const totalFiles = poms.length + fixtures.length + helpers.length;
  if (totalFiles === 0) {
    return { markdown: EMPTY_STUB, totalFiles, errors: [] };
  }

  const errors: ParseError[] = [];
  const project = makeProject();

  const lines: string[] = [
    "## Existing POMs / fixtures / helpers Claude MUST consider for reuse:",
    "",
  ];

  if (poms.length > 0) {
    lines.push("### POMs");
    for (const file of poms) {
      const sf = safeAddSourceFile(project, file, errors);
      if (sf === null) continue;
      lines.push(renderPomLine(file, extractPom(sf)));
    }
    lines.push("");
  }

  if (fixtures.length > 0) {
    lines.push("### Fixtures");
    for (const file of fixtures) {
      const sf = safeAddSourceFile(project, file, errors);
      if (sf === null) continue;
      lines.push(renderFixtureLine(file, extractFixture(sf)));
    }
    lines.push("");
  }

  if (helpers.length > 0) {
    lines.push("### Helpers");
    for (const file of helpers) {
      const sf = safeAddSourceFile(project, file, errors);
      if (sf === null) continue;
      lines.push(renderHelperLine(file, extractHelper(sf)));
    }
    lines.push("");
  }

  return { markdown: lines.join("\n"), totalFiles, errors };
}

/* --------------------------------- Main --------------------------------- */

function reportErrors(errors: ParseError[]): void {
  for (const e of errors) {
    process.stderr.write(`::error file=${e.file}::${e.message}\n`);
  }
}

function main(): void {
  const args = parseCliArgs();
  const { markdown, totalFiles, errors } = buildInventory();

  if (errors.length > 0) {
    reportErrors(errors);
    process.exit(1);
  }

  if (args.validate) {
    process.stdout.write(
      `Inventory validates OK (${totalFiles} file(s) parsed).\n`,
    );
    process.exit(0);
  }

  const outDir = dirname(args.out);
  if (!existsSync(outDir)) {
    mkdirSync(outDir, { recursive: true });
  }
  writeFileSync(args.out, markdown, "utf8");
  if (totalFiles === 0) {
    process.stdout.write(`Inventory empty — first migration. Wrote ${args.out}\n`);
  } else {
    process.stdout.write(
      `Inventory written (${totalFiles} files): ${args.out}\n`,
    );
  }
}

main();
