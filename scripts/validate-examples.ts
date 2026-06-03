#!/usr/bin/env node
/**
 * validate-examples.ts — cross-reference validator for examples/<dir>/expected-plan.md.
 *
 * Why: Cleanlab (cleanlab.ai) showed removing noisy few-shot examples lifted
 * LLM accuracy 59.6% → 67.4%. Our Stage 1 prompt seeds future plans from these
 * fixtures; a plan citing a non-existent KB-ID or a Q-ID that nobody answered
 * silently teaches the model to hallucinate the same pattern. We already caught
 * bad-PW-02 misusing KB-1.1.10. This validator polices two invariants:
 *
 *   1. Every `KB-N.N.N` (or new-format `<fw>/<topic>/<name>`) in an expected-plan
 *      MUST be defined in config/knowledge-base.md. `KB-UNCLASSIFIED` is a
 *      sentinel and always allowed.
 *   2. Every Q-ID synthesized in `## Hallucination-defense pins` (e.g. `Q1`,
 *      `Q-greeting`) MUST also appear inside the same plan's
 *      `## Open questions for reviewer` section. A pin pointing at a question
 *      nobody bothered to write is the failure mode we want surfaced.
 *
 * Run:
 *   npx tsx scripts/validate-examples.ts [--warn|--strict]
 *
 * Modes:
 *   --warn   (default) emit `::warning::` annotations, exit 0. Uncalibrated
 *            validator per Sakasegawa 2026 (premature gating costs PR latency).
 *   --strict emit `::error::` annotations, exit 1 on any finding.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const REPO_ROOT = resolve(new URL("..", import.meta.url).pathname);
const KB_PATH = join(REPO_ROOT, "config", "knowledge-base.md");
const EXAMPLES_DIR = join(REPO_ROOT, "examples");

const KB_HEADER_OLD = /^####\s+(\d+\.\d+\.\d+)\b/;
const KB_HEADER_NEW = /^####\s+\[((?:pw|cy|sel)\/[a-z0-9-]+\/[a-z0-9-]+)\]/;
const KB_REF_OLD = /\bKB-(\d+\.\d+\.\d+|UNCLASSIFIED)\b/g;
const KB_REF_NEW = /\b((?:pw|cy|sel)\/[a-z][a-z0-9-]*\/[a-z][a-z0-9-]*)\b/g;
// Q-ID grammar: either Q<digits> (Q1, Q42) or Q-<lowercase-kebab> (Q-greeting,
// Q-kpi-card). The number form is anchored to a word boundary; the slug form
// requires the hyphen so we never mistake `Q42-something` for a slug.
const Q_REF = /\bQ(?:-[a-z][a-z0-9-]*|[0-9]+)\b/g;

type Mode = "warn" | "strict";

interface Finding {
  file: string;
  line: number;
  message: string;
}

interface Located {
  id: string;
  line: number;
}

function readLines(path: string): string[] {
  return readFileSync(path, "utf8").split(/\r?\n/);
}

function parseKbIds(path: string): Set<string> {
  const ids = new Set<string>();
  for (const raw of readLines(path)) {
    const m = raw.match(KB_HEADER_OLD) ?? raw.match(KB_HEADER_NEW);
    if (m && m[1] !== undefined) ids.add(m[1]);
  }
  return ids;
}

function findExpectedPlans(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "reference") continue;
    const full = join(dir, entry);
    if (!statSync(full).isDirectory()) continue;
    const plan = join(full, "expected-plan.md");
    try {
      if (statSync(plan).isFile()) out.push(plan);
    } catch {
      // No plan in this dir — examples-contract step already gates that.
    }
  }
  return out;
}

interface PlanSections {
  pinsLines: Array<{ raw: string; lineNo: number }>;
  openQuestionsLines: Array<{ raw: string; lineNo: number }>;
}

function splitSections(lines: string[]): PlanSections {
  const pinsLines: Array<{ raw: string; lineNo: number }> = [];
  const openQuestionsLines: Array<{ raw: string; lineNo: number }> = [];
  let current: "pins" | "open" | null = null;
  lines.forEach((raw, idx) => {
    const lineNo = idx + 1;
    if (/^##\s+Hallucination-defense pins\b/i.test(raw)) {
      current = "pins";
      return;
    }
    if (/^##\s+Open questions for reviewer\b/i.test(raw)) {
      current = "open";
      return;
    }
    if (/^##\s+/.test(raw)) {
      current = null;
      return;
    }
    if (current === "pins") pinsLines.push({ raw, lineNo });
    else if (current === "open") openQuestionsLines.push({ raw, lineNo });
  });
  return { pinsLines, openQuestionsLines };
}

function extractKbRefs(lines: string[]): Located[] {
  const refs: Located[] = [];
  lines.forEach((raw, idx) => {
    const lineNo = idx + 1;
    for (const m of raw.matchAll(KB_REF_OLD)) {
      const id = m[1];
      if (id !== undefined) refs.push({ id, line: lineNo });
    }
    for (const m of raw.matchAll(KB_REF_NEW)) {
      const id = m[1];
      if (id === undefined) continue;
      const start = m.index ?? 0;
      const prev = start > 0 ? raw.charAt(start - 1) : " ";
      // Skip URL paths / file paths that happen to match the new-format shape.
      if (prev === "/" || prev === ".") continue;
      refs.push({ id, line: lineNo });
    }
  });
  return refs;
}

function extractQRefs(scope: Array<{ raw: string; lineNo: number }>): Located[] {
  const out: Located[] = [];
  for (const { raw, lineNo } of scope) {
    for (const m of raw.matchAll(Q_REF)) {
      if (m[0] !== undefined) out.push({ id: m[0], line: lineNo });
    }
  }
  return out;
}

function validatePlan(planPath: string, kbIds: Set<string>): Finding[] {
  const findings: Finding[] = [];
  const lines = readLines(planPath);
  const rel = relative(REPO_ROOT, planPath);

  for (const ref of extractKbRefs(lines)) {
    if (ref.id === "UNCLASSIFIED") continue;
    if (!kbIds.has(ref.id)) {
      findings.push({
        file: rel,
        line: ref.line,
        message: `KB-ID '${ref.id}' not defined in config/knowledge-base.md`,
      });
    }
  }

  const { pinsLines, openQuestionsLines } = splitSections(lines);
  const openIds = new Set(extractQRefs(openQuestionsLines).map((q) => q.id));
  for (const pinQ of extractQRefs(pinsLines)) {
    if (!openIds.has(pinQ.id)) {
      findings.push({
        file: rel,
        line: pinQ.line,
        message: `Q-ID '${pinQ.id}' cited in pins but missing from 'Open questions for reviewer'`,
      });
    }
  }
  return findings;
}

function annotate(mode: Mode, f: Finding): void {
  const level = mode === "strict" ? "error" : "warning";
  process.stderr.write(`::${level} file=${f.file},line=${f.line}::${f.message}\n`);
}

function main(argv: string[]): number {
  const mode: Mode = argv.includes("--strict") ? "strict" : "warn";
  const kbIds = parseKbIds(KB_PATH);
  const plans = findExpectedPlans(EXAMPLES_DIR);
  const findings: Finding[] = [];
  for (const plan of plans) findings.push(...validatePlan(plan, kbIds));
  findings.forEach((f) => annotate(mode, f));
  const summary = `validate-examples: ${plans.length} plan(s) scanned, ${findings.length} finding(s) (mode=${mode}).\n`;
  if (findings.length === 0) {
    process.stdout.write(summary);
    return 0;
  }
  process.stderr.write(summary);
  return mode === "strict" ? 1 : 0;
}

process.exit(main(process.argv.slice(2)));
