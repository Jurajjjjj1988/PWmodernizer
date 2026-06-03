#!/usr/bin/env node
/**
 * ast-diff-trivial-check.ts — rejects "fake" migrations where the LLM only
 * renamed identifiers (Type-2 clones per Roy/Cordy NiCad, Jiang/Misherghi
 * Deckard taxonomy).
 *
 * Approach:
 *   1. Parse both files into TypeScript AST via ts-morph.
 *   2. Normalize identifiers — Identifier nodes -> "$id", StringLiteral
 *      nodes -> "$str", NumericLiteral -> "$num". This kills cosmetic renames.
 *   3. Compute APTED tree-edit-distance between normalized trees
 *      (Pawlik & Augsten 2015, optimal worst-case O(n^3) but typically faster).
 *   4. Reject if (distance / max(|T1|, |T2|)) < 0.05 — i.e. < 5% of nodes
 *      had to change. That's a rename-only migration, not real restructuring.
 *
 * Fallback: if ts-morph cannot parse the input (e.g. Selenium .java, .py),
 * fall back to the legacy LCS-based check with a clear warning.
 *
 * Exit codes:
 *   0 = output is substantively different (good)
 *   1 = output is a rename-only / cosmetic rewrite (bad — reject migration)
 */

import { readFileSync, statSync, readdirSync } from "node:fs";
import { join, extname } from "node:path";
import { parseArgs } from "node:util";
import { Project, Node, SyntaxKind, ts } from "ts-morph";

interface Args {
  input: string;
  output: string;
  threshold?: string;
}

interface NormalizedNode {
  label: string;
  children: NormalizedNode[];
}

function parseCliArgs(): Args {
  const { values } = parseArgs({
    options: {
      input: { type: "string" },
      output: { type: "string" },
      threshold: { type: "string" },
    },
  });
  for (const k of ["input", "output"] as const) {
    if (!values[k]) {
      throw new Error(`--${k} is required`);
    }
  }
  return values as unknown as Args;
}

/**
 * Resolve a possibly-directory path to an actual source file. Mirrors the
 * generator behaviour where a "unit" may be a directory of files.
 */
function resolveSourceFile(p: string, preferSpec: boolean): string {
  let st;
  try {
    st = statSync(p);
  } catch {
    return p;
  }
  if (!st.isDirectory()) return p;
  const exts = [".ts", ".tsx", ".js", ".jsx", ".java", ".py"];
  const entries = readdirSync(p, { withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => e.name);
  if (preferSpec) {
    const spec = entries.find((n) => /\.spec\.(ts|tsx|js|jsx)$/.test(n));
    if (spec) return join(p, spec);
  }
  for (const ext of exts) {
    const hit = entries.find((n) => n.toLowerCase().endsWith(ext));
    if (hit) return join(p, hit);
  }
  if (entries.length > 0) return join(p, entries[0]!);
  return p;
}

/**
 * Build a normalized AST tree. Identifier / literal payloads are erased so
 * that Type-2 clones (renames) collapse to identical structure.
 */
const NORM_LABEL: ReadonlyMap<SyntaxKind, string> = new Map([
  [SyntaxKind.Identifier, "$id"],
  [SyntaxKind.PrivateIdentifier, "$id"],
  [SyntaxKind.StringLiteral, "$str"],
  [SyntaxKind.NoSubstitutionTemplateLiteral, "$str"],
  [SyntaxKind.TemplateHead, "$str"],
  [SyntaxKind.TemplateMiddle, "$str"],
  [SyntaxKind.TemplateTail, "$str"],
  [SyntaxKind.NumericLiteral, "$num"],
  [SyntaxKind.BigIntLiteral, "$bigint"],
  [SyntaxKind.RegularExpressionLiteral, "$regex"],
]);

function buildNormalizedTree(node: Node): NormalizedNode {
  const kind = node.getKind();
  const label = NORM_LABEL.get(kind) ?? SyntaxKind[kind] ?? String(kind);
  const children: NormalizedNode[] = [];
  node.forEachChild((child: Node) => {
    children.push(buildNormalizedTree(child));
  });
  return { label, children };
}

function countNodes(t: NormalizedNode): number {
  let n = 1;
  for (const c of t.children) n += countNodes(c);
  return n;
}

/**
 * APTED-style tree edit distance. We use a Zhang-Shasha-equivalent dynamic
 * program here: APTED's all-path strategy on small ASTs (a single test file
 * is typically < ~3000 nodes after normalization) reduces to the same
 * recurrence with comparable runtime. A faithful port of the full APTED
 * Algorithm class is ~200 LOC and not noticeably faster on this size class.
 *
 * Reference: Zhang & Shasha 1989, "Simple Fast Algorithms for the Editing
 * Distance between Trees and Related Problems." APTED (Pawlik & Augsten
 * 2015/2016) is an optimised variant of the same DP.
 */
interface TedCtx {
  f1: Flattened;
  f2: Flattened;
  td: number[][];
}

function fillForestDist(ctx: TedCtx, i: number, j: number): void {
  const { f1, f2, td } = ctx;
  const li = f1.lLeaf[i]!;
  const lj = f2.lLeaf[j]!;
  const sizeI = i - li + 2;
  const sizeJ = j - lj + 2;
  const fd: number[][] = Array.from({ length: sizeI }, () =>
    new Array<number>(sizeJ).fill(0),
  );
  for (let i1 = 1; i1 < sizeI; i1 += 1) fd[i1]![0] = fd[i1 - 1]![0]! + 1;
  for (let j1 = 1; j1 < sizeJ; j1 += 1) fd[0]![j1] = fd[0]![j1 - 1]! + 1;
  for (let i1 = 1; i1 < sizeI; i1 += 1) {
    for (let j1 = 1; j1 < sizeJ; j1 += 1) {
      const ai = li + i1 - 1;
      const aj = lj + j1 - 1;
      const delPath = fd[i1 - 1]![j1]! + 1;
      const insPath = fd[i1]![j1 - 1]! + 1;
      const bothLeaf = f1.lLeaf[ai] === li && f2.lLeaf[aj] === lj;
      if (bothLeaf) {
        const cost = f1.labels[ai] === f2.labels[aj] ? 0 : 1;
        const matchPath = fd[i1 - 1]![j1 - 1]! + cost;
        fd[i1]![j1] = Math.min(delPath, insPath, matchPath);
        td[ai]![aj] = fd[i1]![j1]!;
      } else {
        const li1 = f1.lLeaf[ai]! - li;
        const lj1 = f2.lLeaf[aj]! - lj;
        const subPath = fd[li1]![lj1]! + td[ai]![aj]!;
        fd[i1]![j1] = Math.min(delPath, insPath, subPath);
      }
    }
  }
}

function treeEditDistance(t1: NormalizedNode, t2: NormalizedNode): number {
  const f1 = flatten(t1);
  const f2 = flatten(t2);
  const n = f1.labels.length;
  const m = f2.labels.length;
  const td: number[][] = Array.from({ length: n + 1 }, () =>
    new Array<number>(m + 1).fill(0),
  );
  const ctx: TedCtx = { f1, f2, td };
  const keyroots1 = computeKeyroots(f1.lLeaf);
  const keyroots2 = computeKeyroots(f2.lLeaf);
  for (const i of keyroots1) {
    for (const j of keyroots2) {
      fillForestDist(ctx, i, j);
    }
  }
  return td[n - 1]![m - 1]!;
}

interface Flattened {
  labels: string[];
  lLeaf: number[];
}

function flatten(t: NormalizedNode): Flattened {
  const labels: string[] = [];
  const lLeaf: number[] = [];
  function visit(node: NormalizedNode): number {
    // Returns the postorder index of node.
    let leftmost = -1;
    for (let i = 0; i < node.children.length; i += 1) {
      const childLeft = visit(node.children[i]!);
      if (i === 0) leftmost = childLeft;
    }
    const idx = labels.length;
    labels.push(node.label);
    lLeaf.push(leftmost === -1 ? idx : leftmost);
    return leftmost === -1 ? idx : leftmost;
  }
  visit(t);
  return { labels, lLeaf };
}

function computeKeyroots(lLeaf: number[]): number[] {
  const seen = new Map<number, number>();
  for (let i = 0; i < lLeaf.length; i += 1) {
    seen.set(lLeaf[i]!, i);
  }
  return [...seen.values()].sort((a, b) => a - b);
}

/* ---------------- Fallback: legacy LCS check ---------------- */

const IMPORT_RX = /^\s*(import|from|const\s+\w+\s+=\s+require|using\s+|package\s+|@\w)/;
function stripImports(s: string): string {
  return s.split("\n").filter((l) => !IMPORT_RX.test(l)).join("\n");
}

function stripComments(s: string): string {
  return s
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "")
    .replace(/#.*$/gm, "")
    .replace(/"""[\s\S]*?"""/g, "");
}

function normalizeForLcs(s: string): string {
  return stripComments(stripImports(s)).replace(/\s+/g, " ").trim();
}

function longestCommonSubstring(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0 || n === 0) return 0;
  let maxLen = 0;
  let prev = new Array<number>(n + 1).fill(0);
  let curr = new Array<number>(n + 1).fill(0);
  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      if (a[i - 1] === b[j - 1]) {
        curr[j] = (prev[j - 1] ?? 0) + 1;
        if ((curr[j] ?? 0) > maxLen) maxLen = curr[j] ?? 0;
      } else {
        curr[j] = 0;
      }
    }
    [prev, curr] = [curr, prev];
    curr.fill(0);
  }
  return maxLen;
}

function fallbackLcsCheck(
  inputSrc: string,
  outputSrc: string,
  reason: string,
): never {
  process.stderr.write(`::warning::ts-morph parse failed (${reason}) — falling back to LCS heuristic.\n`);
  const a = normalizeForLcs(inputSrc);
  const b = normalizeForLcs(outputSrc);
  if (a.length === 0) {
    process.stdout.write("input was empty after normalize — passing\n");
    process.exit(0);
  }
  const lcsLen = longestCommonSubstring(a, b);
  const overlap = lcsLen / a.length;
  process.stdout.write(
    `[fallback LCS] input=${a.length} output=${b.length} lcs=${lcsLen} (${(overlap * 100).toFixed(1)}%)\n`,
  );
  if (overlap > 0.8) {
    process.stderr.write(
      `::error::Fallback LCS check — ${(overlap * 100).toFixed(1)}% verbatim overlap. Reject as cosmetic.\n`,
    );
    process.exit(1);
  }
  process.exit(0);
}

/* ---------------- Main ---------------- */

function tryParseTs(path: string, src: string): Node | null {
  try {
    const project = new Project({
      useInMemoryFileSystem: true,
      compilerOptions: { allowJs: true, target: ts.ScriptTarget.ES2022 },
    });
    const ext = extname(path).toLowerCase();
    const inMemPath = ext === ".js" || ext === ".jsx" ? "in.js" : "in.ts";
    const sf = project.createSourceFile(inMemPath, src, { overwrite: true });
    return sf;
  } catch {
    return null;
  }
}

function main(): void {
  const args = parseCliArgs();
  const threshold = Number.parseFloat(args.threshold ?? "0.05");

  const inputPath = resolveSourceFile(args.input, false);
  const outputPath = resolveSourceFile(args.output, true);

  const inputSrc = readFileSync(inputPath, "utf8");
  const outputSrc = readFileSync(outputPath, "utf8");

  // Input may be Java/Python — fall back. Output is always TS by contract.
  const inputExt = extname(inputPath).toLowerCase();
  if (![".ts", ".tsx", ".js", ".jsx", ""].includes(inputExt)) {
    fallbackLcsCheck(inputSrc, outputSrc, `input ext ${inputExt} not TS`);
  }
  const inAst = tryParseTs(inputPath, inputSrc);
  const outAst = tryParseTs(outputPath, outputSrc);
  if (!inAst || !outAst) fallbackLcsCheck(inputSrc, outputSrc, "ts-morph parse null");

  const t1 = buildNormalizedTree(inAst);
  const t2 = buildNormalizedTree(outAst);
  const size1 = countNodes(t1);
  const size2 = countNodes(t2);
  const larger = Math.max(size1, size2);

  if (larger === 0) {
    process.stdout.write("empty AST — passing vacuously\n");
    process.exit(0);
  }

  // APTED on >4000 nodes is too slow in pure JS — degrade to bag distance.
  const useBag = size1 > 4000 || size2 > 4000;
  const distance = useBag ? bagDistance(t1, t2) : treeEditDistance(t1, t2);
  const mode = useBag ? "bag-of-subtrees (large input)" : "APTED/Zhang-Shasha";

  const normalized = distance / larger;
  process.stdout.write(
    `Input AST nodes (normalized): ${size1}\n` +
      `Output AST nodes (normalized): ${size2}\n` +
      `Tree edit distance (${mode}): ${distance}\n` +
      `Normalized distance: ${(normalized * 100).toFixed(2)}% of larger tree\n` +
      `Trivial threshold: ${(threshold * 100).toFixed(0)}%\n`,
  );

  if (normalized < threshold) {
    process.stderr.write(
      `::error::AST diff is rename-only / cosmetic — normalized tree-edit ` +
        `distance is ${(normalized * 100).toFixed(2)}% (< ${(threshold * 100).toFixed(0)}%). ` +
        `Identifiers were erased before comparison, so this is not just a ` +
        `variable rename — the structures are nearly identical. ` +
        `The LLM appears to have copied the input verbatim. Reject migration.\n`,
    );
    process.exit(1);
  }

  process.stdout.write("AST diff is substantively non-trivial — passing.\n");
  process.exit(0);
}

/**
 * Cheap fallback for ASTs too large for Zhang-Shasha. Multiset distance over
 * (label, child-count) pairs — symmetric difference normalised by larger
 * multiset size. Not as precise as APTED but stable for the trivial-rewrite
 * detection goal.
 */
function bagDistance(t1: NormalizedNode, t2: NormalizedNode): number {
  const bag1 = new Map<string, number>();
  const bag2 = new Map<string, number>();
  function fill(t: NormalizedNode, bag: Map<string, number>): void {
    const key = `${t.label}/${t.children.length}`;
    bag.set(key, (bag.get(key) ?? 0) + 1);
    for (const c of t.children) fill(c, bag);
  }
  fill(t1, bag1);
  fill(t2, bag2);
  let diff = 0;
  const keys = new Set([...bag1.keys(), ...bag2.keys()]);
  for (const k of keys) {
    diff += Math.abs((bag1.get(k) ?? 0) - (bag2.get(k) ?? 0));
  }
  return diff;
}

main();
