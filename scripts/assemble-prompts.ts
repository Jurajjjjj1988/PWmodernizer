#!/usr/bin/env node
/**
 * assemble-prompts.ts — build-time prompt fragment assembly for PWmodernizer.
 *
 * Why: BAML and Mirascope demonstrate "DRY for prompts" — shared schemas / rules
 * defined once, referenced from multiple prompts. Our 3 prompts
 * (analyze.md, generate.md, verify.md) duplicate the §9 plan schema, the
 * locator priority hierarchy, KB-ID format rules, and the verdict ladder.
 * We already shipped a fix for analyze.md disagreeing with migration-rules
 * §9 — drift is a real cost, not theoretical.
 *
 * Marker syntax (BAML-inspired): `{{include:_fragments/<name>.md}}`
 *   - Must appear on its own line (optional leading whitespace stripped).
 *   - Path is relative to `prompts/` and MUST stay under `_fragments/`.
 *   - Inlined verbatim (no header injected — the consuming prompt sets context).
 *
 * Modes:
 *   --check   Validate all includes resolve; no orphan markers; no cycles.
 *             Exits 1 with `::error::` annotations on failure.
 *   --write   Expand includes into `prompts/_assembled/<name>.md`.
 *             Workflows read the assembled version (planned for v0.5).
 *
 * Run:
 *   npx tsx scripts/assemble-prompts.ts --check
 *   npx tsx scripts/assemble-prompts.ts --write
 */

import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, resolve, relative } from "node:path";

const REPO_ROOT = resolve(new URL("..", import.meta.url).pathname);
const PROMPTS_DIR = join(REPO_ROOT, "prompts");
const FRAGMENTS_DIR = join(PROMPTS_DIR, "_fragments");
const ASSEMBLED_DIR = join(PROMPTS_DIR, "_assembled");

const INCLUDE_RE = /^\s*\{\{include:(_fragments\/[a-z][a-z0-9-]*\.md)\}\}\s*$/;
const ORPHAN_RE = /\{\{[^}]*\}\}/g;
const MAX_DEPTH = 8;

type Mode = "check" | "write";

interface Violation {
  file: string;
  line: number;
  message: string;
}

function parseMode(argv: string[]): Mode {
  if (argv.includes("--write")) return "write";
  if (argv.includes("--check")) return "check";
  process.stderr.write("assemble-prompts: missing mode flag. Use --check or --write.\n");
  process.exit(2);
}

function readLines(path: string): string[] {
  return readFileSync(path, "utf8").split(/\r?\n/);
}

function listPromptFiles(): string[] {
  return readdirSync(PROMPTS_DIR)
    .filter((entry) => entry.endsWith(".md"))
    .map((entry) => join(PROMPTS_DIR, entry));
}

function annotate(v: Violation): void {
  process.stderr.write(`::error file=${v.file},line=${v.line}::${v.message}\n`);
}

/**
 * Expand `{{include:...}}` markers in `lines`. Tracks `visiting` to catch
 * circular references and `depth` to cap runaway recursion. Returns the
 * expanded text (one string, newline-joined) plus any violations found.
 */
function expand(
  filePath: string,
  lines: string[],
  visiting: Set<string>,
  depth: number,
  violations: Violation[],
): string[] {
  if (depth > MAX_DEPTH) {
    violations.push({
      file: filePath,
      line: 0,
      message: `include depth > ${MAX_DEPTH} — likely circular reference`,
    });
    return lines;
  }
  const out: string[] = [];
  lines.forEach((raw, idx) => {
    const lineNo = idx + 1;
    const includeMatch = raw.match(INCLUDE_RE);
    if (includeMatch) {
      const rel = includeMatch[1];
      if (rel === undefined) return;
      const target = join(PROMPTS_DIR, rel);
      if (!existsSync(target)) {
        violations.push({
          file: filePath,
          line: lineNo,
          message: `include target not found: prompts/${rel}`,
        });
        out.push(raw);
        return;
      }
      if (visiting.has(target)) {
        violations.push({
          file: filePath,
          line: lineNo,
          message: `circular include: ${rel}`,
        });
        out.push(raw);
        return;
      }
      visiting.add(target);
      const inner = expand(target, readLines(target), visiting, depth + 1, violations);
      visiting.delete(target);
      out.push(...inner);
      return;
    }
    // Orphan-marker detection: any `{{...}}` left after include-line parsing
    // that didn't match INCLUDE_RE is suspicious. Ignore code fences.
    if (raw.includes("{{") && raw.match(ORPHAN_RE) && !raw.match(INCLUDE_RE)) {
      const looksLikeInclude = raw.includes("{{include:");
      if (looksLikeInclude) {
        violations.push({
          file: filePath,
          line: lineNo,
          message: `malformed include marker (expected '{{include:_fragments/<name>.md}}' on its own line)`,
        });
      }
    }
    out.push(raw);
  });
  return out;
}

function processOne(filePath: string, violations: Violation[]): string {
  const lines = readLines(filePath);
  const visiting = new Set<string>([filePath]);
  return expand(filePath, lines, visiting, 0, violations).join("\n");
}

function main(): number {
  const mode = parseMode(process.argv.slice(2));
  if (!existsSync(FRAGMENTS_DIR)) {
    process.stderr.write(`::error::missing fragments directory: ${relative(REPO_ROOT, FRAGMENTS_DIR)}\n`);
    return 1;
  }
  const promptFiles = listPromptFiles();
  if (promptFiles.length === 0) {
    process.stderr.write("::error::no prompt files found under prompts/\n");
    return 1;
  }
  const violations: Violation[] = [];
  const assembled = new Map<string, string>();
  for (const file of promptFiles) {
    const text = processOne(file, violations);
    assembled.set(file, text);
  }
  if (violations.length > 0) {
    violations.forEach(annotate);
    process.stderr.write(`\nassemble-prompts: ${violations.length} violation(s)\n`);
    return 1;
  }
  if (mode === "write") {
    if (!existsSync(ASSEMBLED_DIR)) mkdirSync(ASSEMBLED_DIR, { recursive: true });
    for (const [file, text] of assembled) {
      const name = file.substring(PROMPTS_DIR.length + 1);
      const outPath = join(ASSEMBLED_DIR, name);
      writeFileSync(outPath, text, "utf8");
    }
    process.stdout.write(
      `assemble-prompts: wrote ${assembled.size} assembled prompt(s) to prompts/_assembled/\n`,
    );
    return 0;
  }
  process.stdout.write(
    `assemble-prompts: ${assembled.size} prompt(s) validated; all includes resolve cleanly.\n`,
  );
  return 0;
}

process.exit(main());
