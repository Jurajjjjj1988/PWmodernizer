#!/usr/bin/env node
/**
 * kb-validate.ts — strict validator for the migrator knowledge base.
 *
 * Why: as the KB grows past 300 entries across Playwright + Cypress + Selenium
 * phases, hand-numbered `KB-N.N.N` IDs collide and renumbering breaks PR
 * citations. Migration plan: introduce kebab-case `<fw>/<topic>/<name>` IDs
 * (ESLint-rule style) while keeping old numeric IDs as deprecated aliases. This
 * validator polices BOTH formats during the transition and dies on:
 *   1. Duplicate IDs in config/knowledge-base.md.
 *   2. New-format IDs that violate `^(pw|cy|sel)/[a-z][a-z0-9-]*\/[a-z][a-z0-9-]*$`.
 *   3. KB references in prompts/*.md and config/migration-rules.md that point
 *      to non-existent IDs.
 *
 * Run:
 *   npx tsx scripts/kb-validate.ts
 *
 * Exit codes:
 *   0 — clean
 *   1 — one or more violations (annotated for GitHub Actions log)
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const REPO_ROOT = resolve(new URL("..", import.meta.url).pathname);
const KB_PATH = join(REPO_ROOT, "config", "knowledge-base.md");
const MIGRATION_RULES_PATH = join(REPO_ROOT, "config", "migration-rules.md");
const PROMPTS_DIR = join(REPO_ROOT, "prompts");

// Section header in knowledge-base.md is `#### N.N.N Title` (no `KB-` prefix);
// callers refer to it as `KB-N.N.N`. Both spellings normalize to the same ID.
const HEADER_OLD_FORMAT = /^####\s+(\d+\.\d+\.\d+)\b/;
const HEADER_NEW_FORMAT = /^####\s+\[((?:pw|cy|sel)\/[a-z0-9-]+\/[a-z0-9-]+)\]/;
const REF_OLD_FORMAT = /\bKB-(\d+\.\d+\.\d+)\b/g;
const REF_NEW_FORMAT = /\b((?:pw|cy|sel)\/[a-z][a-z0-9-]*\/[a-z][a-z0-9-]*)\b/g;
const NEW_FORMAT_STRICT = /^(pw|cy|sel)\/[a-z][a-z0-9-]*\/[a-z][a-z0-9-]*$/;

// `KB-UNCLASSIFIED` is documented in migration-rules.md as the explicit
// "no entry yet" sentinel — not a real ID, never resolved.
const REF_SENTINELS = new Set<string>(["UNCLASSIFIED"]);

interface Violation {
  file: string;
  line: number;
  message: string;
}

interface ExtractedIds {
  ids: Set<string>;
  duplicates: string[];
  invalidNewFormat: Array<{ id: string; line: number }>;
}

function readLines(path: string): string[] {
  return readFileSync(path, "utf8").split(/\r?\n/);
}

function extractKbIds(kbPath: string): ExtractedIds {
  const seen = new Set<string>();
  const duplicates: string[] = [];
  const invalidNewFormat: Array<{ id: string; line: number }> = [];
  readLines(kbPath).forEach((raw, idx) => {
    const lineNo = idx + 1;
    const oldMatch = raw.match(HEADER_OLD_FORMAT);
    if (oldMatch) {
      const id = oldMatch[1];
      if (id === undefined) return;
      if (seen.has(id)) duplicates.push(id);
      seen.add(id);
      return;
    }
    const newMatch = raw.match(HEADER_NEW_FORMAT);
    if (newMatch) {
      const id = newMatch[1];
      if (id === undefined) return;
      if (!NEW_FORMAT_STRICT.test(id)) {
        invalidNewFormat.push({ id, line: lineNo });
      }
      if (seen.has(id)) duplicates.push(id);
      seen.add(id);
    }
  });
  return { ids: seen, duplicates, invalidNewFormat };
}

function walkMarkdown(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...walkMarkdown(full));
    } else if (entry.endsWith(".md")) {
      out.push(full);
    }
  }
  return out;
}

function extractReferences(files: string[]): Array<{ id: string; file: string; line: number }> {
  const refs: Array<{ id: string; file: string; line: number }> = [];
  for (const file of files) {
    readLines(file).forEach((raw, idx) => {
      const lineNo = idx + 1;
      for (const match of raw.matchAll(REF_OLD_FORMAT)) {
        const id = match[1];
        if (id === undefined || REF_SENTINELS.has(id)) continue;
        refs.push({ id, file, line: lineNo });
      }
      for (const match of raw.matchAll(REF_NEW_FORMAT)) {
        const id = match[1];
        if (id === undefined) continue;
        // Skip URL paths like `playwright/docs/foo` that happen to match. Heuristic:
        // require a backtick or word boundary that isn't preceded by `/` or `.`.
        const start = match.index ?? 0;
        const prev = start > 0 ? raw.charAt(start - 1) : " ";
        if (prev === "/" || prev === ".") continue;
        refs.push({ id, file, line: lineNo });
      }
    });
  }
  return refs;
}

function annotate(v: Violation): void {
  // GitHub Actions error annotation format.
  process.stderr.write(`::error file=${v.file},line=${v.line}::${v.message}\n`);
}

function main(): number {
  const violations: Violation[] = [];
  const { ids, duplicates, invalidNewFormat } = extractKbIds(KB_PATH);

  for (const dup of duplicates) {
    violations.push({ file: KB_PATH, line: 0, message: `duplicate KB ID: ${dup}` });
  }
  for (const inv of invalidNewFormat) {
    violations.push({
      file: KB_PATH,
      line: inv.line,
      message: `new-format KB ID '${inv.id}' must match ${NEW_FORMAT_STRICT.source}`,
    });
  }

  const refFiles = [MIGRATION_RULES_PATH, ...walkMarkdown(PROMPTS_DIR)];
  const refs = extractReferences(refFiles);
  for (const ref of refs) {
    if (!ids.has(ref.id)) {
      violations.push({
        file: ref.file,
        line: ref.line,
        message: `KB ID '${ref.id}' referenced but not defined in config/knowledge-base.md`,
      });
    }
  }

  if (violations.length > 0) {
    violations.forEach(annotate);
    process.stderr.write(`\nkb-validate: ${violations.length} violation(s)\n`);
    return 1;
  }
  process.stdout.write(
    `kb-validate: ${ids.size} KB IDs defined, ${refs.length} reference(s) resolved cleanly.\n`,
  );
  return 0;
}

process.exit(main());
